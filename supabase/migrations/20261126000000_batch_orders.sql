-- Vape POS: order stock before it arrives, pay suppliers in parts, and mark a batch Arrived.
--
-- * A batch can be ORDERED first (order_batch): supplier, products, pieces and cost per piece, restocking fees,
--   and the day it was ordered (stock_batches.ordered_on). Its pieces wait in batch_order_lines, off the shelf,
--   until someone taps Arrived (arrive_batch): that sets received_on, puts the pieces that came on the shelf
--   (restock movements, first in first out from that moment) and can record what was paid on pick-up.
--   received_on is null while a batch is on the way. Receive batch (receive_batch) still records a delivery
--   that is already here in one step.
-- * batch_payments: what was paid to the supplier for a batch, when, and whose money paid: the company fund,
--   the owner's money or an investment. Owner's money and investment both count as owner capital. A batch can
--   be paid in full when ordered, with a downpayment, or on pick-up; what isn't paid yet is owed to the supplier.
--   This replaces stock_batches.paid_from_funds: each existing batch gets one payment of its cost in full on the
--   day it arrived, from the company fund, or from the owner's money where it wasn't paid from the fund.
-- * Finance: a batch's cost in full (goods + restocking fees) counts from the day it was ordered (the day it
--   arrived if no order day was recorded; earlier if a piece or a payment came first) and moves from Stock on the
--   way to Inventory on the day it arrived. Owed to suppliers is what each batch still owes; a batch paid more
--   than it cost shows as Paid to suppliers ahead, and never cancels another batch's debt.
--   Cash goes down by company-fund payments on the day they were paid; owner-money and investment payments
--   raise owner capital. So:
--     cash + receivables + inventory + stock on the way = tax payable + owed to suppliers + owner capital + profit kept.
--   Spare cash also keeps back what is still owed to suppliers.
-- * The arrival date can be changed any time (the guard against a date after the pieces were recorded is gone);
--   it can't be before the order day. The books count a batch as arrived on the earlier of that date and the day
--   its first piece was recorded, so moving the date later never leaves sold pieces outside the inventory.
-- * An arrived batch can be put back on the way if none of its pieces sold, were counted (no later count of its
--   products either) or are reserved (undo_batch_arrival); what came becomes its order again. An order still on
--   the way can be removed when nothing is paid on it and no expense is charged to it (delete_batch_order). Stock
--   can't be added to, counted or lost in a batch still on the way.
-- * Deleting a (test) product removes a batch or order left with nothing in it, with its payments.

-- ───────── Batches: ordered, then arrived ─────────
alter table public.stock_batches alter column received_on drop not null;
alter table public.stock_batches add column ordered_on date;
alter table public.stock_batches add constraint stock_batches_dates_check
  check ((received_on is not null or ordered_on is not null)
         and (ordered_on is null or received_on is null or ordered_on <= received_on));

create table public.batch_order_lines (
  id               uuid primary key default gen_random_uuid(),
  batch_id         uuid not null references public.stock_batches (id) on delete cascade,
  product_id       uuid not null references public.products (id) on delete cascade,
  qty              int not null check (qty between 1 and 100000),
  unit_cost_cents  int check (unit_cost_cents between 0 and 10000000),
  created_at       timestamptz not null default now()
);
create index batch_order_lines_batch_idx on public.batch_order_lines (batch_id);
create index batch_order_lines_product_idx on public.batch_order_lines (product_id);
alter table public.batch_order_lines enable row level security;
create policy "managers read batch_order_lines" on public.batch_order_lines
  for select to authenticated using ((select public.is_manager()));
revoke all on public.batch_order_lines from anon;
revoke insert, update, delete on public.batch_order_lines from authenticated;
grant select on public.batch_order_lines to authenticated;

create table public.batch_payments (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references public.stock_batches (id) on delete cascade,
  amount_cents  bigint not null check (amount_cents between 1 and 100000000000),
  paid_on       date not null default public.manila_today(),
  source        text not null default 'company' check (source in ('company', 'owner', 'investment')),
  note          text check (char_length(note) <= 200),
  created_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index batch_payments_batch_idx on public.batch_payments (batch_id);
create index batch_payments_created_by_idx on public.batch_payments (created_by);
alter table public.batch_payments enable row level security;
create policy "managers read batch_payments" on public.batch_payments
  for select to authenticated using ((select public.is_manager()));
revoke all on public.batch_payments from anon;
revoke insert, update, delete on public.batch_payments from authenticated;
grant select on public.batch_payments to authenticated;

-- Each existing batch was paid in full on the day it arrived: from the fund, or by the owners.
insert into public.batch_payments (batch_id, amount_cents, paid_on, source, created_by, created_at)
select b.id, c.cents, b.received_on, case when b.paid_from_funds then 'company' else 'owner' end,
       (select p.id from public.profiles p where p.id = b.created_by), b.created_at
  from public.stock_batches b
 cross join lateral (
   select b.shipping_cents + b.tax_cents + b.mooe_cents + b.other_cents
          + coalesce((select sum(m.delta::bigint * coalesce(m.unit_cost_cents, 0)) from public.stock_movements m
                       where m.batch_id = b.id and m.kind in ('opening', 'restock') and m.delta > 0), 0) as cents) c
 where c.cents > 0;

drop function public.set_batch_paid_from_funds(uuid, boolean);
drop function public.batch_first_recorded(uuid);

-- ───────── Each batch's cost and what was paid (internal) ─────────
-- Cost in full = its pieces (those that came in; for an order still on the way, those ordered) at cost per
-- piece + its restocking fees. Paid by whose money, and what is still owed to the supplier (negative = paid more).
-- For the books, a batch counts as ordered on its order day (its arrival day if none was recorded), or earlier if
-- its first piece was recorded or its first payment made before that; and as arrived on its arrival day, or on the
-- day its first piece was recorded if that is earlier (the arrival date can be moved later than that): its pieces
-- are on the shelf, and can sell, from the day they were recorded. So no day shows money paid for a batch that
-- isn't there yet, or pieces sold from one that hasn't arrived. uncosted = lines or arrivals with no cost per piece.
create function public.batch_money(p_batch uuid default null)
returns table (batch_id uuid, batch_no int, ordered_day date, received_on date, arrived_day date, pieces int,
               uncosted int, goods_cents bigint, fees_cents bigint, cost_cents bigint,
               paid_company_cents bigint, paid_owner_cents bigint, paid_investment_cents bigint,
               paid_cents bigint, owed_cents bigint)
language sql stable set search_path = ''
as $$
  select b.id, b.batch_no, least(coalesce(b.ordered_on, b.received_on), g.first_in, p.first_paid), b.received_on,
         case when b.received_on is not null then least(b.received_on, g.first_in) end,
         coalesce(g.pcs, 0)::int, coalesce(g.uncosted, 0)::int,
         coalesce(g.goods, 0)::bigint, f.fees::bigint, (coalesce(g.goods, 0) + f.fees)::bigint,
         coalesce(p.company, 0)::bigint, coalesce(p.owner, 0)::bigint, coalesce(p.investment, 0)::bigint,
         coalesce(p.total, 0)::bigint,
         (coalesce(g.goods, 0) + f.fees - coalesce(p.total, 0))::bigint
    from public.stock_batches b
   cross join lateral (select b.shipping_cents + b.tax_cents + b.mooe_cents + b.other_cents as fees) f
    left join lateral (
      select sum(x.qty) as pcs, sum(x.qty::bigint * coalesce(x.uc, 0)) as goods,
             count(*) filter (where x.uc is null) as uncosted,
             min(x.d) as first_in
        from (select m.delta as qty, m.unit_cost_cents as uc, (m.created_at at time zone 'Asia/Manila')::date as d
                from public.stock_movements m
               where b.received_on is not null and m.batch_id = b.id and m.kind in ('opening', 'restock') and m.delta > 0
              union all
              select l.qty, l.unit_cost_cents, null::date
                from public.batch_order_lines l
               where b.received_on is null and l.batch_id = b.id) x
    ) g on true
    left join lateral (
      select sum(y.amount_cents) filter (where y.source = 'company') as company,
             sum(y.amount_cents) filter (where y.source = 'owner') as owner,
             sum(y.amount_cents) filter (where y.source = 'investment') as investment,
             sum(y.amount_cents) as total,
             min(y.paid_on) as first_paid
        from public.batch_payments y
       where y.batch_id = b.id
    ) p on true
   where p_batch is null or b.id = p_batch
$$;

-- Record (or, with p_id, change) a payment for a batch, at most what is still owed (internal).
create function public.batch_pay(p_batch uuid, p_amount bigint, p_source text, p_on date, p_note text, p_id uuid default null)
returns uuid
language plpgsql set search_path = ''
as $$
declare
  v_id       uuid := p_id;
  v_no       int;
  v_left     bigint;
  v_was      bigint;
  v_uncosted int;
begin
  -- One payment at a time per batch, so two can't both fit under what is owed.
  perform 1 from public.stock_batches where id = p_batch for update;
  if p_source is null or p_source not in ('company', 'owner', 'investment') then
    raise exception 'Pick whose money paid: company fund, owner''s money or investment' using errcode = '22023';
  end if;
  if p_amount is null or p_amount not between 1 and 100000000000 then
    raise exception 'Enter an amount from ₱0.01' using errcode = '22023';
  end if;
  v_was := coalesce((select y.amount_cents from public.batch_payments y where y.id = p_id and y.batch_id = p_batch), 0);
  -- An old payment keeps its day when only its amount, whose money or note is fixed.
  if p_on is null or p_on > public.manila_today()
     or (p_on < public.manila_today() - 400
         and p_on is distinct from (select y.paid_on from public.batch_payments y where y.id = p_id)) then
    raise exception 'The payment date must be in the last 400 days' using errcode = '22023';
  end if;
  select bm.batch_no, bm.owed_cents + v_was, bm.uncosted
    into v_no, v_left, v_uncosted
    from public.batch_money(p_batch) bm;
  if not found then
    raise exception 'That batch no longer exists' using errcode = 'P0002';
  end if;
  -- At most what is still owed. Not checked when some pieces have no cost (what is owed isn't known), nor when a
  -- payment's amount isn't going up (its day, whose money or note can always be fixed).
  if p_amount > v_left and v_uncosted = 0 and (p_id is null or p_amount > v_was) then
    if v_left <= 0 then
      raise exception 'Batch % is already paid in full', v_no using errcode = '22023';
    end if;
    raise exception 'Only ₱% is still to pay for Batch %', to_char(v_left / 100.0, 'FM999,999,990.00'), v_no
      using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.batch_payments (batch_id, amount_cents, paid_on, source, note)
    values (p_batch, p_amount, p_on, p_source, nullif(btrim(p_note), ''))
    returning id into v_id;
  else
    update public.batch_payments
       set amount_cents = p_amount, paid_on = p_on, source = p_source, note = nullif(btrim(p_note), '')
     where id = p_id;
  end if;
  return v_id;
end;
$$;

-- The payment that came with an order or a delivery: {"amount_cents": …, "source": …}; 0 or none = not paid yet;
-- "rest" = everything still owed (paid in full).
create function public.batch_pay_now(p_batch uuid, p_pay jsonb, p_on date)
returns void
language plpgsql set search_path = ''
as $$
declare
  v_amount bigint;
begin
  if p_pay is null or jsonb_typeof(p_pay) <> 'object' then
    return;
  end if;
  if p_pay ->> 'amount_cents' = 'rest' then
    if (select uncosted from public.batch_money(p_batch)) > 0 then
      raise exception 'Some pieces have no cost per piece, so the full amount can''t be worked out. Enter the amount paid instead.'
        using errcode = '22023';
    end if;
    select greatest(0, owed_cents) into v_amount from public.batch_money(p_batch);
  else
    v_amount := coalesce(nullif(p_pay ->> 'amount_cents', '')::bigint, 0);
  end if;
  if v_amount < 0 then
    raise exception 'Enter an amount from ₱0.01' using errcode = '22023';
  end if;
  if v_amount > 0 then
    perform public.batch_pay(p_batch, v_amount, coalesce(nullif(p_pay ->> 'source', ''), 'company'), p_on, null);
  end if;
end;
$$;

-- Products, pieces and costs as receive_batch and order_batch take them.
create function public.check_batch_items(p jsonb)
returns void
language plpgsql set search_path = ''
as $$
begin
  if jsonb_typeof(p -> 'items') is distinct from 'array' or jsonb_array_length(p -> 'items') = 0 then
    raise exception 'Enter the pieces for at least one product' using errcode = '22023';
  end if;
  if jsonb_array_length(p -> 'items') > 500 then
    raise exception 'A batch can have up to 500 products' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p -> 'items') e
              where jsonb_typeof(e) <> 'object' or coalesce(e ->> 'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'Pick a product for each line' using errcode = '22023';
  end if;
  if (select count(distinct e ->> 'product_id') from jsonb_array_elements(p -> 'items') e)
     <> jsonb_array_length(p -> 'items') then
    raise exception 'Each product can only be in a batch once' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p -> 'items') e
              where coalesce(e ->> 'unit_cost_cents', '') <> ''
                and (e ->> 'unit_cost_cents' !~ '^\d{1,9}$' or (e ->> 'unit_cost_cents')::bigint > 10000000)) then
    raise exception 'Cost per piece must be ₱0 to ₱100,000' using errcode = '22023';
  end if;
end;
$$;

-- Stock can't go into a batch that hasn't arrived yet.
create function public.stock_movement_batch_arrived()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_no       int;
  v_received date;
begin
  if new.batch_id is not null then
    -- Locked whatever its state, so this waits for a batch being put back on the way, then sees it.
    select batch_no, received_on into v_no, v_received from public.stock_batches where id = new.batch_id for share;
    if found and v_received is null then
      raise exception 'Batch % is still on the way. Tap Arrived on its page when it comes.', v_no using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
create trigger stock_movements_batch_arrived
  before insert or update of batch_id on public.stock_movements
  for each row execute function public.stock_movement_batch_arrived();

-- ───────── Order stock ─────────
-- p: supplier, ordered_on, note, shipping_cents, tax_cents, mooe_cents, other_cents, other_label,
--    items [{product_id, qty, unit_cost_cents}], payment {amount_cents (or "rest" = in full), source}
--    (none or 0 = pay on pick-up).
create function public.order_batch(p jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_batch   uuid;
  v_no      int;
  v_date    date := coalesce(nullif(p ->> 'ordered_on', '')::date, public.manila_today());
  v_item    jsonb;
  v_product uuid;
  v_qty     int;
  v_cost    int;
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can order stock' using errcode = '42501';
  end if;
  perform public.check_batch_items(p);
  if v_date > public.manila_today() or v_date < public.manila_today() - 60 then
    raise exception 'The order date must be in the last 60 days' using errcode = '22023';
  end if;
  perform public.check_batch_costs(p);

  perform pg_advisory_xact_lock(hashtext('stock_batches.batch_no'));
  select coalesce(max(batch_no), 0) + 1 into v_no from public.stock_batches;
  insert into public.stock_batches (batch_no, supplier, ordered_on, received_on, note,
                                    shipping_cents, tax_cents, mooe_cents, other_cents, other_label)
  values (v_no, nullif(btrim(p ->> 'supplier'), ''), v_date, null, nullif(btrim(p ->> 'note'), ''),
          coalesce(nullif(p ->> 'shipping_cents', '')::int, 0), coalesce(nullif(p ->> 'tax_cents', '')::int, 0),
          coalesce(nullif(p ->> 'mooe_cents', '')::int, 0), coalesce(nullif(p ->> 'other_cents', '')::int, 0),
          nullif(btrim(p ->> 'other_label'), ''))
  returning id into v_batch;

  for v_item in select * from jsonb_array_elements(p -> 'items') loop
    v_product := (v_item ->> 'product_id')::uuid;
    v_qty     := (v_item ->> 'qty')::int;
    v_cost    := nullif(v_item ->> 'unit_cost_cents', '')::int;
    if v_qty is null or v_qty < 1 or v_qty > 100000 then
      raise exception 'Enter 1 to 100,000 pieces for each product' using errcode = '22023';
    end if;
    if v_cost is not null and v_cost < 0 then
      raise exception 'The cost can''t be negative' using errcode = '22023';
    end if;
    if not exists (select 1 from public.products where id = v_product) then
      raise exception 'A product in this order no longer exists' using errcode = 'P0002';
    end if;
    insert into public.batch_order_lines (batch_id, product_id, qty, unit_cost_cents)
    values (v_batch, v_product, v_qty, v_cost);
  end loop;

  perform public.batch_pay_now(v_batch, p -> 'payment', v_date);
  return v_batch;
end;
$$;

-- ───────── Receive a delivery that is already here ─────────
-- As before, plus payment {amount_cents, source}: left out = paid in full from the company fund.
create or replace function public.receive_batch(p jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_batch    uuid;
  v_no       int;
  v_date     date := coalesce(nullif(p ->> 'received_on', '')::date, public.manila_today());
  v_item     jsonb;
  v_product  uuid;
  v_qty      int;
  v_cost     int;
  v_after    int;
  v_pay      jsonb := p -> 'payment';
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can receive stock' using errcode = '42501';
  end if;
  perform public.check_batch_items(p);
  if v_date > public.manila_today() or v_date < public.manila_today() - 60 then
    raise exception 'The received date must be in the last 60 days' using errcode = '22023';
  end if;
  perform public.check_batch_costs(p);

  perform pg_advisory_xact_lock(hashtext('stock_batches.batch_no'));
  select coalesce(max(batch_no), 0) + 1 into v_no from public.stock_batches;
  insert into public.stock_batches (batch_no, supplier, received_on, note,
                                    shipping_cents, tax_cents, mooe_cents, other_cents, other_label)
  values (v_no, nullif(btrim(p ->> 'supplier'), ''), v_date, nullif(btrim(p ->> 'note'), ''),
          coalesce(nullif(p ->> 'shipping_cents', '')::int, 0), coalesce(nullif(p ->> 'tax_cents', '')::int, 0),
          coalesce(nullif(p ->> 'mooe_cents', '')::int, 0), coalesce(nullif(p ->> 'other_cents', '')::int, 0),
          nullif(btrim(p ->> 'other_label'), ''))
  returning id into v_batch;

  for v_item in select * from jsonb_array_elements(p -> 'items') loop
    v_product := (v_item ->> 'product_id')::uuid;
    v_qty     := (v_item ->> 'qty')::int;
    v_cost    := nullif(v_item ->> 'unit_cost_cents', '')::int;
    if v_qty is null or v_qty < 1 or v_qty > 100000 then
      raise exception 'Enter 1 to 100,000 pieces for each product' using errcode = '22023';
    end if;
    if v_cost is not null and v_cost < 0 then
      raise exception 'The cost can''t be negative' using errcode = '22023';
    end if;

    update public.products set on_hand = on_hand + v_qty, updated_at = now()
     where id = v_product
    returning on_hand into v_after;
    if not found then
      raise exception 'A product in this batch no longer exists' using errcode = 'P0002';
    end if;
    insert into public.stock_movements (product_id, kind, delta, on_hand_after, unit_cost_cents, batch_id)
    values (v_product, 'restock', v_qty, v_after, v_cost, v_batch);

    if v_cost is not null then
      insert into public.product_costs (product_id, cost_cents) values (v_product, v_cost)
      on conflict (product_id) do update set cost_cents = excluded.cost_cents, updated_at = now();
    end if;
  end loop;

  -- Left out: paid in full from the company fund (pieces with no cost count as ₱0, as before).
  if v_pay is null then
    select jsonb_build_object('amount_cents', greatest(0, owed_cents), 'source', 'company') into v_pay
      from public.batch_money(v_batch);
  end if;
  perform public.batch_pay_now(v_batch, v_pay, v_date);
  return v_batch;
end;
$$;

-- ───────── Arrived ─────────
-- p: received_on (default today), items [{line_id, qty}] = the pieces that came for each ordered line (left out =
-- as ordered; 0 = none came), payment {amount_cents (or "rest"), source} = paid on pick-up.
create function public.arrive_batch(p_batch uuid, p jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_b     public.stock_batches;
  v_date  date := coalesce(nullif(p ->> 'received_on', '')::date, public.manila_today());
  v_line  public.batch_order_lines;
  v_qty   int;
  v_after int;
  v_total int := 0;
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can receive stock' using errcode = '42501';
  end if;
  select * into v_b from public.stock_batches where id = p_batch for update;
  if not found then
    raise exception 'That batch no longer exists' using errcode = 'P0002';
  end if;
  if v_b.received_on is not null then
    raise exception 'Batch % already arrived on %', v_b.batch_no, to_char(v_b.received_on, 'FMDD Mon') using errcode = '22023';
  end if;
  if v_date > public.manila_today() or v_date < public.manila_today() - 400 then
    raise exception 'The date must be in the last 400 days' using errcode = '22023';
  end if;
  if v_date < v_b.ordered_on then
    raise exception 'Batch % was ordered on %, so it can''t arrive before that. Pick that day or later.',
      v_b.batch_no, to_char(v_b.ordered_on, 'FMDD Mon') using errcode = '22023';
  end if;
  if p ? 'items' and jsonb_typeof(p -> 'items') <> 'array' then
    raise exception 'Enter the pieces that came for each product' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb)) e
              where not exists (select 1 from public.batch_order_lines l where l.batch_id = p_batch and l.id::text = e ->> 'line_id')
                 or coalesce(e ->> 'qty', '') !~ '^\d{1,6}$') then
    raise exception 'Enter 0 to 100,000 pieces for each product in this order' using errcode = '22023';
  end if;

  -- Arrived first: stock can only go into a batch that is here.
  update public.stock_batches set received_on = v_date where id = p_batch;

  for v_line in select * from public.batch_order_lines where batch_id = p_batch order by created_at, id loop
    v_qty := coalesce((select nullif(e ->> 'qty', '')::int from jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb)) e
                        where e ->> 'line_id' = v_line.id::text limit 1), v_line.qty);
    if v_qty < 0 or v_qty > 100000 then
      raise exception 'Enter 0 to 100,000 pieces for each product' using errcode = '22023';
    end if;
    continue when v_qty = 0;
    update public.products set on_hand = on_hand + v_qty, updated_at = now()
     where id = v_line.product_id
    returning on_hand into v_after;
    -- One moment per line, so two lines of the same product keep their order (first in, first out).
    insert into public.stock_movements (product_id, kind, delta, on_hand_after, unit_cost_cents, batch_id, created_at)
    values (v_line.product_id, 'restock', v_qty, v_after, v_line.unit_cost_cents, p_batch, clock_timestamp());
    if v_line.unit_cost_cents is not null then
      insert into public.product_costs (product_id, cost_cents) values (v_line.product_id, v_line.unit_cost_cents)
      on conflict (product_id) do update set cost_cents = excluded.cost_cents, updated_at = now();
    end if;
    v_total := v_total + v_qty;
  end loop;
  if v_total = 0 then
    raise exception 'Enter the pieces that came for at least one product' using errcode = '22023';
  end if;

  perform public.batch_pay_now(p_batch, p -> 'payment', v_date);
end;
$$;

-- Put an arrived batch back on the way (internal): its pieces come off the shelf and wait as an order again.
-- Only while none of them sold, none were counted or lost, and none are reserved.
create function public.batch_back_on_the_way(p_batch uuid)
returns void
language plpgsql set search_path = ''
as $$
declare
  v_b public.stock_batches;
  v_m public.stock_movements;
begin
  select * into v_b from public.stock_batches where id = p_batch for update;
  if not found then
    raise exception 'That batch no longer exists' using errcode = 'P0002';
  end if;
  if v_b.received_on is null then
    raise exception 'Batch % is already on the way', v_b.batch_no using errcode = '22023';
  end if;
  perform 1 from public.products
   where id in (select product_id from public.stock_movements where batch_id = p_batch)
   order by id for update;
  if exists (select 1 from public.stock_movements where batch_id = p_batch and kind in ('count', 'waste')) then
    raise exception 'Batch %''s pieces were counted or marked lost, so it can''t go back on the way', v_b.batch_no
      using errcode = '22023';
  end if;
  -- A later shelf count of one of its products (in any batch) counted these pieces: taking them off would turn the
  -- count into pieces found.
  if exists (
    select 1
      from public.stock_movements c
     where c.kind = 'count'
       and c.product_id in (select product_id from public.stock_movements where batch_id = p_batch and kind in ('opening', 'restock') and delta > 0)
       and c.created_at > (select min(created_at) from public.stock_movements where batch_id = p_batch and kind in ('opening', 'restock') and delta > 0)) then
    raise exception 'Some of Batch %''s products were counted on the shelf after it arrived, so it can''t go back on the way', v_b.batch_no
      using errcode = '22023';
  end if;
  if exists (select 1 from public.batch_matches() bm where bm.batch_id = p_batch and bm.pcs > 0) then
    raise exception 'Some of Batch %''s pieces were sold, so it can''t go back on the way', v_b.batch_no using errcode = '22023';
  end if;
  if exists (
    select 1
      from (select product_id, sum(delta) as pcs from public.stock_movements
             where batch_id = p_batch and kind in ('opening', 'restock') and delta > 0 group by product_id) c
      join public.products pr on pr.id = c.product_id
     where pr.on_hand - coalesce((select sum(r.qty) from public.reservations r
                                   where r.product_id = c.product_id and r.status = 'active'), 0) < c.pcs) then
    raise exception 'Some of Batch %''s pieces are reserved or no longer on the shelf, so it can''t go back on the way', v_b.batch_no
      using errcode = '22023';
  end if;

  -- What came in becomes the order again, with any pieces added or costs fixed after it arrived.
  delete from public.batch_order_lines where batch_id = p_batch;
  insert into public.batch_order_lines (batch_id, product_id, qty, unit_cost_cents, created_at)
  select batch_id, product_id, delta, unit_cost_cents, created_at
    from public.stock_movements
   where batch_id = p_batch and kind in ('opening', 'restock') and delta > 0;
  for v_m in select * from public.stock_movements where batch_id = p_batch order by created_at desc, id desc loop
    if v_m.delta <> 0 then
      perform public.shift_stock_after(v_m.id, -v_m.delta);
    end if;
    delete from public.stock_movements where id = v_m.id;
  end loop;
  update public.stock_batches set ordered_on = coalesce(ordered_on, received_on), received_on = null where id = p_batch;
end;
$$;

create function public.undo_batch_arrival(p_batch uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can change batches' using errcode = '42501';
  end if;
  perform public.batch_back_on_the_way(p_batch);
end;
$$;

-- Remove an order that is still on the way (it was cancelled). Its payments must be removed first.
create function public.delete_batch_order(p_batch uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_b    public.stock_batches;
  v_paid bigint;
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can change batches' using errcode = '42501';
  end if;
  select * into v_b from public.stock_batches where id = p_batch for update;
  if not found then
    raise exception 'That batch no longer exists' using errcode = 'P0002';
  end if;
  if v_b.received_on is not null then
    raise exception 'Batch % already arrived, so it can''t be removed as an order', v_b.batch_no using errcode = '22023';
  end if;
  if exists (select 1 from public.expenses where batch_id = p_batch) then
    raise exception 'Batch % has expenses charged to it. Move them to another batch or General, or remove them, first.', v_b.batch_no
      using errcode = '22023';
  end if;
  select coalesce(sum(amount_cents), 0) into v_paid from public.batch_payments where batch_id = p_batch;
  if v_paid > 0 then
    raise exception 'Batch % has ₱% paid on it. Remove its payments first (if the supplier gave the money back).',
      v_b.batch_no, to_char(v_paid / 100.0, 'FM999,999,990.00') using errcode = '22023';
  end if;
  delete from public.stock_batches where id = p_batch;
end;
$$;

-- ───────── Payments to suppliers ─────────
-- p: amount_cents, source (company | owner | investment), paid_on (default today), note.
create function public.add_batch_payment(p_batch uuid, p jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can record payments' using errcode = '42501';
  end if;
  return public.batch_pay(p_batch, nullif(p ->> 'amount_cents', '')::bigint, nullif(p ->> 'source', ''),
                          coalesce(nullif(p ->> 'paid_on', '')::date, public.manila_today()), p ->> 'note');
end;
$$;

create function public.update_batch_payment(p_id uuid, p jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_batch uuid;
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can record payments' using errcode = '42501';
  end if;
  select batch_id into v_batch from public.batch_payments where id = p_id for update;
  if not found then
    raise exception 'That payment no longer exists' using errcode = 'P0002';
  end if;
  perform public.batch_pay(v_batch, nullif(p ->> 'amount_cents', '')::bigint, nullif(p ->> 'source', ''),
                           coalesce(nullif(p ->> 'paid_on', '')::date, public.manila_today()), p ->> 'note', p_id);
end;
$$;

create function public.delete_batch_payment(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can record payments' using errcode = '42501';
  end if;
  delete from public.batch_payments where id = p_id;
  if not found then
    raise exception 'That payment no longer exists' using errcode = 'P0002';
  end if;
end;
$$;

-- ───────── Dates: changeable any time, but not before the order ─────────
create or replace function public.set_batch_received_on(p_batch uuid, p_date date)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_b public.stock_batches;
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can change batches' using errcode = '42501';
  end if;
  select * into v_b from public.stock_batches where id = p_batch for update;
  if not found then
    raise exception 'That batch no longer exists' using errcode = 'P0002';
  end if;
  if v_b.received_on is null then
    raise exception 'Batch % hasn''t arrived yet. Tap Arrived on its page when it comes.', v_b.batch_no using errcode = '22023';
  end if;
  if p_date is null or p_date > public.manila_today() or p_date < public.manila_today() - 400 then
    raise exception 'The date must be in the last 400 days' using errcode = '22023';
  end if;
  if p_date < v_b.ordered_on then
    raise exception 'Batch % was ordered on %, so it can''t arrive before that. Pick that day or later.',
      v_b.batch_no, to_char(v_b.ordered_on, 'FMDD Mon') using errcode = '22023';
  end if;
  update public.stock_batches set received_on = p_date where id = p_batch;
end;
$$;

-- p: supplier, note, ordered_on ("" = not recorded; left out = unchanged), received_on (arrived batches only).
create or replace function public.update_batch_details(p_batch uuid, p jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_b       public.stock_batches;
  v_ordered date;
  v_date    date := nullif(p ->> 'received_on', '')::date;
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can change batches' using errcode = '42501';
  end if;
  select * into v_b from public.stock_batches where id = p_batch for update;
  if not found then
    raise exception 'That batch no longer exists' using errcode = 'P0002';
  end if;
  v_ordered := case when p ? 'ordered_on' then nullif(p ->> 'ordered_on', '')::date else v_b.ordered_on end;
  if v_b.received_on is null then
    if v_date is not null then
      raise exception 'Batch % hasn''t arrived yet. Tap Arrived on its page when it comes.', v_b.batch_no using errcode = '22023';
    end if;
    if v_ordered is null then
      raise exception 'Pick the day it was ordered' using errcode = '22023';
    end if;
  elsif v_date is null or v_date > public.manila_today() or v_date < public.manila_today() - 400 then
    raise exception 'The date must be in the last 400 days' using errcode = '22023';
  end if;
  if v_ordered is not null and v_ordered is distinct from v_b.ordered_on
     and (v_ordered > public.manila_today() or v_ordered < public.manila_today() - 400) then
    raise exception 'The order date must be in the last 400 days' using errcode = '22023';
  end if;
  if v_ordered > v_date then
    raise exception 'It can''t arrive before it was ordered (%). Pick that day or later.', to_char(v_ordered, 'FMDD Mon')
      using errcode = '22023';
  end if;
  update public.stock_batches
     set supplier = nullif(btrim(p ->> 'supplier'), ''), ordered_on = v_ordered, received_on = v_date,
         note = nullif(btrim(p ->> 'note'), '')
   where id = p_batch;
end;
$$;

-- ───────── Earlier stock: paid by the owners ─────────
create or replace function public.batch_existing_stock(p jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_batch uuid;
  v_no    int;
  v_first timestamptz;
  v_cost  bigint;
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can make batches' using errcode = '42501';
  end if;
  select min(created_at) into v_first
    from public.stock_movements
   where batch_id is null and kind in ('opening', 'restock') and delta > 0;
  if v_first is null then
    raise exception 'All stock is already in a batch' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('stock_batches.batch_no'));
  select coalesce(max(batch_no), 0) + 1 into v_no from public.stock_batches;
  insert into public.stock_batches (batch_no, supplier, received_on, note)
  values (v_no, nullif(btrim(p ->> 'supplier'), ''), (v_first at time zone 'Asia/Manila')::date,
          coalesce(nullif(btrim(p ->> 'note'), ''), 'Earlier stock'))
  returning id into v_batch;

  update public.stock_movements set batch_id = v_batch
   where batch_id is null and kind in ('opening', 'restock', 'count', 'waste');
  -- Stock from before batches was paid for with the owners' own money.
  select cost_cents into v_cost from public.batch_money(v_batch);
  if v_cost > 0 then
    insert into public.batch_payments (batch_id, amount_cents, paid_on, source, note)
    values (v_batch, v_cost, (v_first at time zone 'Asia/Manila')::date, 'owner', 'Earlier stock');
  end if;
  return v_batch;
end;
$$;

-- ───────── Finance ─────────
create or replace function public.finance_totals(p_to date)
returns jsonb
language sql stable set search_path = ''
as $$
  with
  sales as (
    select coalesce(sum(subtotal_cents), 0) as gross, coalesce(sum(discount_cents), 0) as discounts,
           coalesce(sum(total_cents), 0) as net, count(*) as n
      from public.sales where status = 'completed' and business_date <= p_to
  ),
  -- Money collected: what was paid at the till, then later payments on what was owed.
  receipts as (
    select s.payment_method::text as method,
           s.total_cents - s.balance_cents - coalesce((select sum(p.amount_cents) from public.sale_payments p where p.sale_id = s.id), 0) as cents
      from public.sales s
     where s.status = 'completed' and s.business_date <= p_to
    union all
    select p.payment_method::text, p.amount_cents
      from public.sale_payments p join public.sales s on s.id = p.sale_id
     where s.status = 'completed' and p.business_date <= p_to
  ),
  -- Stock that came in, with its cost per piece.
  arr as (
    select m.id, m.product_id, m.batch_id, m.delta as qty, coalesce(m.unit_cost_cents, 0) as uc,
           m.unit_cost_cents is null as uncosted, (m.created_at at time zone 'Asia/Manila')::date as d
      from public.stock_movements m
     where m.kind in ('opening', 'restock') and m.delta > 0
  ),
  -- Restocking fees per batch, spread over the pieces it received.
  bfee as (
    select b.id, b.shipping_cents + b.tax_cents + b.mooe_cents + b.other_cents as fees,
           (b.shipping_cents + b.tax_cents + b.mooe_cents + b.other_cents)::numeric
             / nullif((select sum(a.qty) from arr a where a.batch_id = b.id), 0) as pp
      from public.stock_batches b
  ),
  cogs as (
    select coalesce(sum(m.pcs * (a.uc + coalesce(f.pp, 0))), 0) as cents,
           coalesce(sum(m.pcs) filter (where a.uncosted), 0) as uncosted
      from public.batch_matches() m
      join arr a on a.id = m.arrival_id
      left join bfee f on f.id = m.batch_id
     where m.pcs > 0 and (m.sold_at at time zone 'Asia/Manila')::date <= p_to
  ),
  -- Counts and losses at landed cost (negative = pieces missing).
  diffs as (
    select coalesce(sum(m.delta * (
             coalesce((select avg(a.uc) from arr a where a.batch_id is not distinct from m.batch_id and a.product_id = m.product_id),
                      (select a.uc from arr a where a.product_id = m.product_id order by a.d desc limit 1), 0)
             + coalesce((select f.pp from bfee f where f.id = m.batch_id), 0))), 0) as cents
      from public.stock_movements m
     where m.kind in ('count', 'waste') and (m.created_at at time zone 'Asia/Manila')::date <= p_to
  ),
  -- Stock that came in before batches were recorded: paid from the till the day it came in.
  loose as (
    select coalesce(sum(qty::bigint * uc), 0) as goods from arr where batch_id is null and d <= p_to
  ),
  -- Each batch's cost in full counts from the day it was ordered and moves onto the shelf the day it arrived.
  stock as (
    select coalesce(sum(cost_cents) filter (where ordered_day <= p_to), 0) as ordered,
           coalesce(sum(cost_cents) filter (where arrived_day <= p_to), 0) as arrived
      from public.batch_money()
  ),
  -- What each batch still owes its supplier on that day, and what was paid ahead (more than it cost).
  owe as (
    select coalesce(sum(greatest(0, o.owed)), 0) as owed, coalesce(sum(greatest(0, -o.owed)), 0) as ahead
      from (select case when bm.ordered_day <= p_to then bm.cost_cents else 0 end
                   - coalesce((select sum(y.amount_cents) from public.batch_payments y
                                where y.batch_id = bm.batch_id and y.paid_on <= p_to), 0) as owed
              from public.batch_money() bm) o
  ),
  paid as (
    select coalesce(sum(amount_cents) filter (where source = 'company'), 0) as company,
           coalesce(sum(amount_cents) filter (where source = 'owner'), 0) as owner,
           coalesce(sum(amount_cents) filter (where source = 'investment'), 0) as investment
      from public.batch_payments where paid_on <= p_to
  ),
  ex as (
    select coalesce(sum(amount_cents) filter (where category <> 'tax'), 0) as opex,
           coalesce(sum(amount_cents) filter (where category = 'tax'), 0) as tax_paid
      from public.expenses where spent_on <= p_to
  )
  select jsonb_build_object(
    'gross', s.gross, 'discounts', s.discounts, 'net', s.net, 'sales', s.n,
    'collected', (select coalesce(sum(cents), 0) from receipts),
    'collected_by_method', coalesce((select jsonb_object_agg(method, cents) from
       (select method, sum(cents) as cents from receipts group by method having sum(cents) <> 0) x), '{}'),
    'cogs', round(c.cents), 'cogs_uncosted', c.uncosted, 'count_diffs', round(d.cents),
    'opex', e.opex, 'opex_by_category', coalesce((select jsonb_object_agg(category, cents) from
       (select category, sum(amount_cents) as cents from public.expenses
         where spent_on <= p_to and category <> 'tax' group by category) x), '{}'),
    'tax_paid', e.tax_paid,
    'tax_rate_bp', (select tax_rate_bp from public.settings where id = 1),
    'loose_goods', l.goods, 'ordered', st.ordered, 'arrived', st.arrived,
    'paid_company', p.company, 'paid_owner', p.owner, 'paid_investment', p.investment,
    'suppliers_owed', o.owed, 'suppliers_ahead', o.ahead,
    'capital_cash', (select coalesce(sum(amount_cents), 0) from public.capital_contributions where put_in_on <= p_to),
    'distributions', (select coalesce(sum(amount_cents), 0) from public.fund_releases where released_on <= p_to))
  from sales s, cogs c, diffs d, loose l, stock st, paid p, owe o, ex e
$$;

create or replace function public.finance_derive(t jsonb)
returns jsonb
language sql immutable set search_path = ''
as $$
  with v as (
    select (t ->> 'net')::numeric as net, (t ->> 'collected')::numeric as collected,
           (t ->> 'cogs')::numeric as cogs, (t ->> 'count_diffs')::numeric as diffs,
           (t ->> 'opex')::numeric as opex, (t ->> 'tax_paid')::numeric as tax_paid,
           round((t ->> 'net')::numeric * (t ->> 'tax_rate_bp')::numeric / 10000) as tax,
           (t ->> 'loose_goods')::numeric as loose,
           (t ->> 'ordered')::numeric as ordered, (t ->> 'arrived')::numeric as arrived,
           (t ->> 'paid_company')::numeric as paid_company,
           (t ->> 'paid_owner')::numeric + (t ->> 'paid_investment')::numeric as paid_owners,
           (t ->> 'capital_cash')::numeric as capital_cash,
           (t ->> 'distributions')::numeric as dist
  )
  select t || jsonb_build_object(
    'tax', tax,
    'net_profit', net - cogs + diffs - opex - tax,
    'cash', capital_cash + collected - paid_company - loose - opex - tax_paid - dist,
    'receivables', net - collected,
    'inventory', arrived + loose - cogs + diffs,
    'on_the_way', ordered - arrived,
    'owed_suppliers', ordered - paid_company - paid_owners,
    'capital', capital_cash + paid_owners,
    'tax_payable', tax - tax_paid,
    'retained', net - cogs + diffs - opex - tax - dist)
  from v
$$;

create or replace function public.funds_summary()
returns jsonb
language sql stable set search_path = ''
as $$
  with sales as (
    select coalesce(sum(subtotal_cents), 0) as gross, coalesce(sum(discount_cents), 0) as discounts,
           coalesce(sum(total_cents), 0) as net, coalesce(sum(balance_cents), 0) as owed
      from public.sales where status = 'completed'
  ),
  by_method as (
    select method, sum(cents) as cents from (
      select s.payment_method::text as method, s.total_cents as cents
        from public.sales s where s.status = 'completed' and s.payment_method::text <> 'unpaid'
      union all
      select p.payment_method::text, p.amount_cents
        from public.sale_payments p join public.sales s on s.id = p.sale_id where s.status = 'completed'
    ) x group by method
  ),
  -- Stock paid from the company fund: supplier payments, and stock from before batches.
  stock as (
    select (select coalesce(sum(amount_cents), 0) from public.batch_payments where source = 'company')
           + (select coalesce(sum(m.delta::bigint * m.unit_cost_cents), 0) from public.stock_movements m
               where m.batch_id is null and m.kind in ('opening', 'restock') and m.delta > 0) as cents,
           (select count(*) from public.stock_movements m
             where m.batch_id is null and m.kind in ('opening', 'restock') and m.delta > 0 and m.unit_cost_cents is null) as uncosted
  ),
  -- Each batch with what it costs the company: its cost in full, less what the owners paid with their own money.
  bm as (
    select x.batch_no, x.ordered_day, x.cost_cents, b.created_at,
           x.cost_cents - x.paid_owner_cents - x.paid_investment_cents as company_cents
      from public.batch_money() x join public.stock_batches b on b.id = x.batch_id
  ),
  latest as (select batch_no, cost_cents as cents from bm where company_cents > 0 order by ordered_day desc, batch_no desc limit 1),
  -- The latest decision on what to keep for the next restock, and what batches ordered since have used.
  decision as (select amount_cents, note, created_at from public.fund_set_asides order by created_at desc limit 1),
  since as (
    select coalesce(sum(company_cents) filter (where company_cents > 0), 0) as used,
           count(*) filter (where company_cents > 0) as batches
      from bm where created_at > coalesce((select created_at from decision), '-infinity')
  ),
  t as (
    select s.gross, s.discounts, s.net, s.owed, s.net - s.owed as collected,
           st.cents as stock_paid, st.uncosted,
           (select coalesce(sum(amount_cents), 0) from public.expenses) as expenses,
           (select coalesce(sum(amount_cents), 0) from public.fund_releases) as released,
           (select coalesce(sum(owner_cents), 0) from public.fund_releases) as owner_released,
           (select coalesce(sum(manager_cents), 0) from public.fund_releases) as manager_released,
           coalesce((select amount_cents from decision), 0) as set_aside,
           case when exists (select 1 from decision) then (select used from since) else 0 end as used,
           (select batches from since) as batches_since
      from sales s, stock st
  ),
  r as (select *, greatest(0, set_aside - used) as kept, collected - stock_paid - expenses - released as balance from t)
  select jsonb_build_object(
    'gross_cents', gross, 'discount_cents', discounts, 'net_cents', net, 'owed_cents', owed,
    'collected_cents', collected,
    'collected_by_method', coalesce((select jsonb_object_agg(method, cents) from by_method), '{}'),
    'stock_paid_cents', stock_paid, 'goods_uncosted', uncosted,
    'expenses_cents', expenses, 'released_cents', released,
    'owner_released_cents', owner_released, 'manager_released_cents', manager_released,
    'balance_cents', balance,
    'set_aside_cents', set_aside, 'set_aside_used_cents', least(used, set_aside), 'kept_cents', kept,
    'set_aside_at', (select created_at from decision), 'set_aside_note', (select note from decision),
    -- Ask for a decision when none was made yet, or a batch paid by the company was ordered since the last one.
    'needs_decision', batches_since > 0,
    'last_batch_no', (select batch_no from latest), 'last_batch_cents', (select cents from latest),
    'available_cents', greatest(0, balance - kept))
  from r
$$;

-- Today's payout limit: the lower of profit kept and spare cash (cash − tax still owed − what is still owed to
-- suppliers − the inventory reserve); and what the register should hold.
create or replace function public.finance_now()
returns jsonb
language sql stable set search_path = ''
as $$
  with t as (select public.finance_derive(public.finance_totals(public.manila_today())) as d),
       f as (select (public.funds_summary() ->> 'kept_cents')::numeric as kept),
       -- Money that came in by a method other than cash: it never reaches the register.
       e as (select coalesce(sum(m.value::numeric), 0) as cents,
                    coalesce(jsonb_object_agg(m.key, m.value::numeric), '{}'::jsonb) as by_method
               from t, jsonb_each_text(t.d -> 'collected_by_method') m
              where m.key <> 'cash'),
       -- What each batch still owes its supplier (a batch paid ahead doesn't cancel another's debt).
       r as (select greatest(0, (d ->> 'tax_payable')::numeric) as tax, (d ->> 'suppliers_owed')::numeric as owed
               from t)
  select jsonb_build_object(
    'cash', (d ->> 'cash')::numeric,
    'retained', (d ->> 'retained')::numeric,
    'tax_reserve', r.tax,
    'supplier_reserve', r.owed,
    'inventory_reserve', f.kept,
    'spare_cash', (d ->> 'cash')::numeric - r.tax - r.owed - f.kept,
    'safe_to_distribute', greatest(0, least((d ->> 'retained')::numeric, (d ->> 'cash')::numeric - r.tax - r.owed - f.kept)),
    'register', jsonb_build_object(
      'cash_received', coalesce((d -> 'collected_by_method' ->> 'cash')::numeric, 0),
      'capital_cash', (d ->> 'capital_cash')::numeric,
      'stock', (d ->> 'paid_company')::numeric + (d ->> 'loose_goods')::numeric,
      'expenses', (d ->> 'opex')::numeric - coalesce((d -> 'opex_by_category' ->> 'fees')::numeric, 0),
      'payment_fees', coalesce((d -> 'opex_by_category' ->> 'fees')::numeric, 0),
      'tax_paid', (d ->> 'tax_paid')::numeric,
      'distributions', (d ->> 'distributions')::numeric,
      'elsewhere', e.cents,
      'elsewhere_by_method', e.by_method,
      'expected', (d ->> 'cash')::numeric - e.cents + coalesce((d -> 'opex_by_category' ->> 'fees')::numeric, 0)))
  from t, f, e, r
$$;

-- The Finance view, plus each batch still on the way or not fully paid (as of today).
create or replace function public.finance_report(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can see the finances' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Pick a period' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'from', p_from, 'to', p_to,
    'start', public.finance_derive(public.finance_totals(p_from - 1)),
    'end', public.finance_derive(public.finance_totals(p_to)),
    'now', public.finance_now(),
    'first_day', least(
      (select min(business_date) from public.sales),
      (select min((created_at at time zone 'Asia/Manila')::date) from public.stock_movements),
      (select min(put_in_on) from public.capital_contributions),
      (select min(ordered_on) from public.stock_batches),
      (select min(paid_on) from public.batch_payments)),
    'receivables', coalesce((
      select jsonb_agg(jsonb_build_object('sale_id', id, 'customer_name', customer_name, 'cents', balance_cents,
                                          'days', public.manila_today() - business_date) order by business_date)
        from public.sales where status = 'completed' and balance_cents > 0), '[]'),
    'suppliers', coalesce((
      select jsonb_agg(jsonb_build_object('batch_id', batch_id, 'batch_no', batch_no, 'cost_cents', cost_cents,
                                          'paid_cents', paid_cents, 'owed_cents', owed_cents,
                                          'on_the_way', received_on is null, 'ordered_on', ordered_day,
                                          'received_on', received_on) order by batch_no)
        from public.batch_money() where owed_cents <> 0 or received_on is null), '[]'));
end;
$$;

-- ───────── Each batch's running statement ─────────
-- As before, except: an order still on the way shows what it was ordered at (goods_cents) and nothing on the
-- shelf; an arrived batch's restocking fees always count in what is left on the shelf, as in Finance.
create or replace function public.batch_statements()
returns table (batch_id uuid, received int, sold int, adjusted int, left_pcs int, uncosted int,
               gross_cents bigint, discount_cents bigint, net_cents bigint,
               cogs_goods_cents bigint, cogs_fees_cents bigint, count_diffs_cents bigint,
               owed_cents bigint, goods_cents bigint, fees_cents bigint, stock_cents bigint,
               left_value_cents bigint, left_cost_cents bigint)
language sql stable security definer set search_path = ''
as $$
  with
  arr as (
    select m.id, m.product_id, m.batch_id, m.delta as qty, coalesce(m.unit_cost_cents, 0) as uc,
           m.unit_cost_cents is null as uncosted, (m.created_at at time zone 'Asia/Manila')::date as d
      from public.stock_movements m
     where m.kind in ('opening', 'restock') and m.delta > 0
  ),
  bfee as (
    select b.id, b.received_on is null as on_the_way, b.shipping_cents + b.tax_cents + b.mooe_cents + b.other_cents as fees,
           (b.shipping_cents + b.tax_cents + b.mooe_cents + b.other_cents)::numeric
             / nullif((select sum(a.qty) from arr a where a.batch_id = b.id), 0) as pp
      from public.stock_batches b
  ),
  line as (
    select i.sale_id, i.product_id, sum(i.line_total_cents)::numeric / sum(i.quantity) as gross_each
      from public.sale_items i
     where i.product_id is not null
     group by i.sale_id, i.product_id
  ),
  sold as (
    select a.batch_id, a.product_id,
           sum(m.pcs) as pcs,
           sum(m.pcs * coalesce(l.gross_each, m.net_each)) as gross,
           sum(m.pcs * m.net_each) as net,
           sum(m.pcs * m.owed_each) as owed,
           sum(m.pcs * a.uc) as goods,
           sum(m.pcs * coalesce(f.pp, 0)) as fees,
           coalesce(sum(m.pcs) filter (where a.uncosted), 0) as uncosted
      from public.batch_matches() m
      join arr a on a.id = m.arrival_id
      left join bfee f on f.id = a.batch_id
      left join line l on l.sale_id = m.sale_id and l.product_id = m.product_id
     where m.pcs > 0
     group by a.batch_id, a.product_id
  ),
  came as (
    select a.batch_id, a.product_id, sum(a.qty) as qty, sum(a.qty::bigint * a.uc) as goods
      from arr a
     group by a.batch_id, a.product_id
  ),
  adj as (
    select m.batch_id, m.product_id, sum(m.delta) as pcs,
           sum(m.delta * (
             coalesce((select avg(a.uc) from arr a where a.batch_id is not distinct from m.batch_id and a.product_id = m.product_id),
                      (select a.uc from arr a where a.product_id = m.product_id order by a.d desc limit 1), 0)
             + coalesce((select f.pp from bfee f where f.id = m.batch_id), 0))) as cents
      from public.stock_movements m
     where m.kind in ('count', 'waste')
     group by m.batch_id, m.product_id
  ),
  keys as (
    select c.batch_id, c.product_id from came c
    union
    select j.batch_id, j.product_id from adj j
  ),
  per as (
    select k.batch_id, k.product_id,
           coalesce(c.qty, 0) as received, coalesce(c.goods, 0) as goods,
           coalesce(s.pcs, 0) as sold, coalesce(s.gross, 0) as gross, coalesce(s.net, 0) as net,
           coalesce(s.owed, 0) as owed, coalesce(s.goods, 0) as cogs_goods, coalesce(s.fees, 0) as cogs_fees,
           coalesce(s.uncosted, 0) as uncosted,
           coalesce(j.pcs, 0) as adjusted, coalesce(j.cents, 0) as diffs,
           case when c.qty is null then 0
                else greatest(0, c.qty - coalesce(s.pcs, 0) + coalesce(j.pcs, 0)) end as left_pcs,
           coalesce(c.goods / nullif(c.qty, 0), 0) + coalesce(f.pp, 0) as landed_each
      from keys k
      left join came c on c.batch_id is not distinct from k.batch_id and c.product_id = k.product_id
      left join sold s on s.batch_id is not distinct from k.batch_id and s.product_id = k.product_id
      left join adj j on j.batch_id is not distinct from k.batch_id and j.product_id = k.product_id
      left join bfee f on f.id = k.batch_id
  ),
  agg as (
    select p.batch_id,
           sum(p.received) as received, sum(p.sold) as sold, sum(p.adjusted) as adjusted, sum(p.left_pcs) as left_pcs,
           sum(p.uncosted) as uncosted, sum(p.gross) as gross, sum(p.net) as net, sum(p.owed) as owed,
           sum(p.cogs_goods) as cogs_goods, sum(p.cogs_fees) as cogs_fees, sum(p.diffs) as diffs, sum(p.goods) as goods,
           sum(p.left_pcs * coalesce(pr.price_cents, 0)) as left_value,
           sum(p.left_pcs * p.landed_each) as left_cost
      from per p
      left join public.products pr on pr.id = p.product_id
     group by p.batch_id
  ),
  -- What an order still on the way was ordered at.
  ordered as (
    select l.batch_id, sum(l.qty::bigint * coalesce(l.unit_cost_cents, 0)) as goods
      from public.batch_order_lines l
      join public.stock_batches b on b.id = l.batch_id and b.received_on is null
     group by l.batch_id
  ),
  ids as (
    select b.id as batch_id from public.stock_batches b
    union
    select a.batch_id from agg a
  )
  select i.batch_id,
         coalesce(a.received, 0)::int, coalesce(a.sold, 0)::int, coalesce(a.adjusted, 0)::int,
         coalesce(a.left_pcs, 0)::int, coalesce(a.uncosted, 0)::int,
         round(coalesce(a.gross, 0))::bigint,
         (round(coalesce(a.gross, 0)) - round(coalesce(a.net, 0)))::bigint,
         round(coalesce(a.net, 0))::bigint,
         round(coalesce(a.cogs_goods, 0))::bigint,
         round(coalesce(a.cogs_fees, 0))::bigint,
         round(coalesce(a.diffs, 0))::bigint,
         round(coalesce(a.owed, 0))::bigint,
         round(coalesce(o.goods, a.goods, 0))::bigint,
         coalesce(f.fees, 0)::bigint,
         -- Still on the shelf at landed cost (ties to Finance's inventory); nothing while on the way.
         case when f.on_the_way then 0
              else round(coalesce(a.goods, 0) + coalesce(f.fees, 0)
                         - coalesce(a.cogs_goods, 0) - coalesce(a.cogs_fees, 0) + coalesce(a.diffs, 0)) end::bigint,
         round(coalesce(a.left_value, 0))::bigint,
         round(coalesce(a.left_cost, 0))::bigint
    from ids i
    left join agg a on a.batch_id is not distinct from i.batch_id
    left join bfee f on f.id = i.batch_id
    left join ordered o on o.batch_id = i.batch_id
   where public.is_manager()
$$;

-- ───────── Deleting a product (owner) ─────────
-- As in 20261112000000_batch_expenses.sql: a batch left with nothing in it goes, with what was paid for it (so what
-- was paid for a deleted test product leaves Finance, as the SOP says), unless an expense is charged to it. An order
-- still on the way left with no lines goes the same way.
create or replace function public.delete_product(p_product uuid, p_with_sales boolean default false)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_photo   text;
  v_sale    uuid;
  v_sales   int := 0;
  v_batches uuid[];
begin
  if not public.is_owner() then
    raise exception 'Only the owner can delete products' using errcode = '42501';
  end if;
  select photo_path into v_photo from public.products where id = p_product for update;
  if not found then
    raise exception 'That product no longer exists' using errcode = 'P0002';
  end if;

  if p_with_sales then
    for v_sale in select distinct sale_id from public.sale_items where product_id = p_product loop
      perform public.remove_sale(v_sale);
      v_sales := v_sales + 1;
    end loop;
  end if;

  select coalesce(array_agg(distinct x.batch_id), '{}') into v_batches
    from (select batch_id from public.stock_movements where product_id = p_product and batch_id is not null
          union
          select batch_id from public.batch_order_lines where product_id = p_product) x;
  delete from public.products where id = p_product; -- stock_movements, order lines and product_costs cascade
  delete from public.stock_batches b
   where b.id = any (v_batches)
     and not exists (select 1 from public.stock_movements m where m.batch_id = b.id)
     and (b.received_on is not null or not exists (select 1 from public.batch_order_lines l where l.batch_id = b.id))
     and not exists (select 1 from public.expenses e where e.batch_id = b.id);

  return jsonb_build_object('sales_deleted', v_sales, 'photo_path', v_photo);
end;
$$;
revoke all on function public.delete_product(uuid, boolean) from public, anon;
grant execute on function public.delete_product(uuid, boolean) to authenticated;

-- Grants
revoke all on function public.batch_money(uuid) from public, anon, authenticated;
revoke all on function public.batch_pay(uuid, bigint, text, date, text, uuid) from public, anon, authenticated;
revoke all on function public.batch_pay_now(uuid, jsonb, date) from public, anon, authenticated;
revoke all on function public.check_batch_items(jsonb) from public, anon, authenticated;
revoke all on function public.stock_movement_batch_arrived() from public, anon, authenticated;
revoke all on function public.batch_back_on_the_way(uuid) from public, anon, authenticated;
revoke all on function public.finance_totals(date) from public, anon, authenticated;
revoke all on function public.finance_derive(jsonb) from public, anon, authenticated;
revoke all on function public.finance_now() from public, anon, authenticated;
revoke all on function public.funds_summary() from public, anon, authenticated;
revoke all on function public.order_batch(jsonb) from public, anon;
grant execute on function public.order_batch(jsonb) to authenticated;
revoke all on function public.receive_batch(jsonb) from public, anon;
grant execute on function public.receive_batch(jsonb) to authenticated;
revoke all on function public.arrive_batch(uuid, jsonb) from public, anon;
grant execute on function public.arrive_batch(uuid, jsonb) to authenticated;
revoke all on function public.undo_batch_arrival(uuid) from public, anon;
grant execute on function public.undo_batch_arrival(uuid) to authenticated;
revoke all on function public.delete_batch_order(uuid) from public, anon;
grant execute on function public.delete_batch_order(uuid) to authenticated;
revoke all on function public.add_batch_payment(uuid, jsonb) from public, anon;
grant execute on function public.add_batch_payment(uuid, jsonb) to authenticated;
revoke all on function public.update_batch_payment(uuid, jsonb) from public, anon;
grant execute on function public.update_batch_payment(uuid, jsonb) to authenticated;
revoke all on function public.delete_batch_payment(uuid) from public, anon;
grant execute on function public.delete_batch_payment(uuid) to authenticated;
revoke all on function public.set_batch_received_on(uuid, date) from public, anon;
grant execute on function public.set_batch_received_on(uuid, date) to authenticated;
revoke all on function public.update_batch_details(uuid, jsonb) from public, anon;
grant execute on function public.update_batch_details(uuid, jsonb) to authenticated;
revoke all on function public.batch_existing_stock(jsonb) from public, anon;
grant execute on function public.batch_existing_stock(jsonb) to authenticated;
revoke all on function public.finance_report(date, date) from public, anon;
grant execute on function public.finance_report(date, date) to authenticated;
revoke all on function public.batch_statements() from public, anon;
grant execute on function public.batch_statements() to authenticated;

-- ───────── Batch report: whose money paid, instead of paid_from_funds ─────────
-- As in 20261125010000_batch_report_fixes.sql, plus the order day, the cost in full and what was paid by whose
-- money. A batch still on the way has no report yet.
create or replace function public.batch_report(p_batch uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_b     public.stock_batches;
  v_money record;
  v_out   jsonb;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can see batch reports' using errcode = '42501';
  end if;
  select * into v_b from public.stock_batches where id = p_batch;
  if not found then
    raise exception 'Batch not found' using errcode = 'P0002';
  end if;
  if v_b.received_on is null then
    raise exception 'Batch % hasn''t arrived yet', v_b.batch_no using errcode = '22023';
  end if;
  select * into v_money from public.batch_money(p_batch);

  with
  m as (
    select bm.sale_id, bm.product_id, bm.pcs, bm.net_each, bm.owed_each,
           -- A sale before the batch's received date (the date was edited later) counts on day 0.
           greatest((bm.sold_at at time zone 'Asia/Manila')::date, v_b.received_on) as d
      from public.batch_matches() bm
     where bm.batch_id = p_batch and bm.pcs > 0
  ),
  days as (
    select d, sum(pcs) as pcs, sum(pcs * net_each) as net
      from m
     group by d
  ),
  days_run as (
    select d, pcs::int as pcs,
           (sum(pcs) over (order by d))::int as cum_pcs,
           round(sum(net) over (order by d))::bigint as cum_net_cents
      from days
  ),
  came as (
    select sm.product_id,
           coalesce(sum(sm.delta) filter (where sm.kind in ('opening', 'restock') and sm.delta > 0), 0) as received,
           coalesce(sum(sm.delta) filter (where sm.kind in ('count', 'waste')), 0) as adjusted
      from public.stock_movements sm
     where sm.batch_id = p_batch
     group by sm.product_id
  ),
  flav as (
    select c.product_id, p.brand, p.name, p.variant, c.received::int as received,
           coalesce(s.sold, 0)::int as sold,
           greatest(0, c.received - coalesce(s.sold, 0) + c.adjusted)::int as left_pcs,
           s.last_d as last_sale_on
      from came c
      join public.products p on p.id = c.product_id
      left join (select product_id, sum(pcs) as sold, max(d) as last_d from m group by product_id) s
        on s.product_id = c.product_id
     where c.received > 0
  ),
  owed as (
    -- Shown as typed on the buyer's oldest sale still owing, like Collectibles.
    select (array_agg(regexp_replace(btrim(s.customer_name), '\s+', ' ', 'g') order by s.created_at))[1] as buyer,
           round(sum(m.pcs * m.owed_each))::bigint as cents,
           count(distinct m.sale_id)::int as sales
      from m
      join public.sales s on s.id = m.sale_id
     where m.owed_each > 0
     group by lower(regexp_replace(btrim(coalesce(s.customer_name, '')), '\s+', ' ', 'g'))
  ),
  -- Each sale's share of the batch: the batch's net from it over the sale's total.
  share as (
    select sale_id, sum(pcs * net_each) as net from m group by sale_id
  ),
  -- What each sale collected, by method (at the till: what isn't owed and wasn't collected later; then each
  -- later collection), times the batch's share of the sale. One pass per sale.
  paid as (
    select g.method, round(sum(g.cents * sh.net / s.total_cents))::bigint as cents
      from share sh
      join public.sales s on s.id = sh.sale_id and s.total_cents > 0
      cross join lateral (
        select s.payment_method::text as method,
               (s.total_cents - s.balance_cents
                  - coalesce((select sum(p.amount_cents) from public.sale_payments p where p.sale_id = s.id), 0))::numeric as cents
        union all
        select p.payment_method::text, p.amount_cents::numeric
          from public.sale_payments p
         where p.sale_id = s.id
      ) g
     where g.cents <> 0 and g.method <> 'unpaid'
     group by g.method
  )
  select jsonb_build_object(
    'batch_id', v_b.id,
    'batch_no', v_b.batch_no,
    'received_on', v_b.received_on,
    'supplier', v_b.supplier,
    'ordered_on', v_b.ordered_on,
    'cost_cents', v_money.cost_cents,
    'paid_company_cents', v_money.paid_company_cents,
    'paid_owner_cents', v_money.paid_owner_cents,
    'paid_investment_cents', v_money.paid_investment_cents,
    'today', public.manila_today(),
    'days', coalesce((select jsonb_agg(jsonb_build_object('date', d, 'pcs', pcs, 'cum_pcs', cum_pcs, 'cum_net_cents', cum_net_cents)
                                       order by d) from days_run), '[]'::jsonb),
    'flavours', coalesce((select jsonb_agg(jsonb_build_object('product_id', product_id, 'brand', brand, 'name', name,
                                                              'variant', variant, 'received', received, 'sold', sold,
                                                              'left', left_pcs, 'last_sale_on', last_sale_on)
                                           order by name, variant) from flav), '[]'::jsonb),
    'owed', coalesce((select jsonb_agg(jsonb_build_object('buyer', buyer, 'cents', cents, 'sales', sales)
                                       order by cents desc, buyer) from owed where cents > 0), '[]'::jsonb),
    'paid', coalesce((select jsonb_agg(jsonb_build_object('method', method, 'cents', cents) order by cents desc)
                        from paid where cents <> 0), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;
revoke all on function public.batch_report(uuid) from public, anon;
grant execute on function public.batch_report(uuid) to authenticated;

-- Every function that read it is replaced above.
alter table public.stock_batches drop column paid_from_funds;
