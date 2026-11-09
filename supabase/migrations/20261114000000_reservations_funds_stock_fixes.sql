-- Three additions:
--   1. Reservations (all staff): pieces held for a customer. They can't be sold to anyone else and
--      count as spoken for in the reorder plan and the dashboard, not as slow stock.
--   2. Company funds (owners and managers see it; the owner releases profit): money collected
--      from sales pays for each new batch (goods and restocking fees) and the expenses; profit is
--      released from what's left above a reserve for the next batch, split owner : manager.
--   3. Fixing stock changes (owners and managers): edit or remove a restock, count, opening stock
--      or damaged / lost entry; the shelf count and later history follow.

-- ───────── 1. Reservations ─────────
create table public.reservations (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products (id) on delete cascade,
  customer_name  text not null check (char_length(btrim(customer_name)) between 1 and 60),
  qty            int not null check (qty between 1 and 10000),
  note           text check (char_length(note) <= 200),
  hold_until     date,
  status         text not null default 'active' check (status in ('active', 'sold', 'cancelled')),
  sale_id        uuid references public.sales (id) on delete set null,
  created_by     uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  closed_by      uuid references public.profiles (id) on delete set null,
  closed_at      timestamptz
);
create index reservations_active_idx on public.reservations (product_id) where status = 'active';
create index reservations_sale_idx on public.reservations (sale_id);
create index reservations_created_by_idx on public.reservations (created_by);
create index reservations_closed_by_idx on public.reservations (closed_by);

alter table public.reservations enable row level security;
create policy "staff read reservations" on public.reservations
  for select to authenticated using ((select public.is_staff()));
revoke all on public.reservations from anon;
revoke insert, update, delete on public.reservations from authenticated;
grant select on public.reservations to authenticated;

-- p: {product_id, customer_name, qty, note, hold_until}
create function public.reserve_product(p jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id       uuid;
  v_product  uuid := nullif(p ->> 'product_id', '')::uuid;
  v_qty      int := nullif(p ->> 'qty', '')::int;
  v_name     text := nullif(btrim(regexp_replace(coalesce(p ->> 'customer_name', ''), '\s+', ' ', 'g')), '');
  v_on_hand  int;
  v_held     int;
begin
  if not public.is_staff() then
    raise exception 'Only staff can reserve' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'Add the customer''s name' using errcode = '22023';
  end if;
  if v_qty is null or v_qty not between 1 and 10000 then
    raise exception 'Reserve at least 1 piece' using errcode = '22023';
  end if;
  select on_hand into v_on_hand from public.products where id = v_product and active for update;
  if not found then
    raise exception 'That product isn''t for sale' using errcode = 'P0002';
  end if;
  select coalesce(sum(qty), 0) into v_held from public.reservations where product_id = v_product and status = 'active';
  if v_qty > v_on_hand - v_held and not (select allow_negative_stock from public.settings where id = 1) then
    raise exception 'Only % left to reserve', greatest(0, v_on_hand - v_held) using errcode = '22023';
  end if;
  insert into public.reservations (product_id, customer_name, qty, note, hold_until)
  values (v_product, left(v_name, 60), v_qty, nullif(btrim(p ->> 'note'), ''), nullif(p ->> 'hold_until', '')::date)
  returning id into v_id;
  return v_id;
end;
$$;

-- Close a reservation: cancelled (p_sale null) or sold (the sale that took its pieces).
create function public.close_reservation(p_id uuid, p_sale uuid default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Only staff can change reservations' using errcode = '42501';
  end if;
  update public.reservations
     set status = case when p_sale is null then 'cancelled' else 'sold' end,
         sale_id = p_sale, closed_by = auth.uid(), closed_at = now()
   where id = p_id and status = 'active';
  if not found then
    raise exception 'That reservation is already closed' using errcode = 'P0002';
  end if;
end;
$$;

-- ───────── 2. Company funds ─────────
-- The business runs on its own money: what sales bring in pays for each new batch (goods and
-- restocking fees) and the expenses; profit is released from what's left, keeping back enough for
-- the next batch (the last batch's full cost). No owner capital is tracked or paid back.
-- Batches are paid from the funds unless switched off. A batch of only opening stock (bought before
-- the funds existed) isn't; one with restocks in it was a purchase, so it is.
alter table public.stock_batches add column paid_from_funds boolean not null default true;
update public.stock_batches b set paid_from_funds = false
 where not exists (select 1 from public.stock_movements m where m.batch_id = b.id and m.kind = 'restock');

create or replace function public.batch_existing_stock(p jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_batch uuid;
  v_no    int;
  v_first timestamptz;
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
  insert into public.stock_batches (batch_no, supplier, received_on, note, paid_from_funds)
  values (v_no, nullif(btrim(p ->> 'supplier'), ''), (v_first at time zone 'Asia/Manila')::date,
          coalesce(nullif(btrim(p ->> 'note'), ''), 'Opening stock'), false)
  returning id into v_batch;

  update public.stock_movements set batch_id = v_batch
   where batch_id is null and kind in ('opening', 'restock') and delta > 0;
  -- Restocks in it were purchases: paid from the funds. Only opening stock: not.
  update public.stock_batches set paid_from_funds = true
   where id = v_batch and exists (select 1 from public.stock_movements m where m.batch_id = v_batch and m.kind = 'restock');
  return v_batch;
end;
$$;

create function public.set_batch_paid_from_funds(p_batch uuid, p_paid boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can change batches' using errcode = '42501';
  end if;
  update public.stock_batches set paid_from_funds = coalesce(p_paid, true) where id = p_batch;
  if not found then
    raise exception 'That batch no longer exists' using errcode = 'P0002';
  end if;
end;
$$;

-- Profit released from the funds, with the owner / manager amounts at the split of the day.
create table public.fund_releases (
  id             uuid primary key default gen_random_uuid(),
  amount_cents   int not null check (amount_cents between 1 and 1000000000),
  owner_cents    int not null,
  manager_cents  int not null,
  note           text check (char_length(note) <= 200),
  released_on    date not null default public.manila_today(),
  created_by     uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  check (owner_cents + manager_cents = amount_cents)
);
create index fund_releases_created_by_idx on public.fund_releases (created_by);

alter table public.fund_releases enable row level security;
create policy "managers read fund_releases" on public.fund_releases
  for select to authenticated using ((select public.is_manager()));
revoke all on public.fund_releases from anon;
revoke insert, update, delete on public.fund_releases from authenticated;
grant select on public.fund_releases to authenticated;

-- Internal: the funds, line by line (all amounts in centavos).
--   gross − discounts = net sales; net − still owed = collected (also split by how it was paid)
--   collected − stock bought (goods + restocking fees) − expenses − released = balance
--   reserve = the latest batch's full cost; available to release = balance − reserve (not below 0)
create function public.funds_summary()
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
  goods as (
    -- Restocks paid from the funds: in a batch marked so, or single restocks.
    select coalesce(sum(m.delta * m.unit_cost_cents), 0) as cents,
           count(*) filter (where m.unit_cost_cents is null) as uncosted
      from public.stock_movements m
      left join public.stock_batches b on b.id = m.batch_id
     where m.kind = 'restock' and m.delta > 0 and (m.batch_id is null or b.paid_from_funds)
  ),
  fees as (
    select coalesce(sum(shipping_cents + tax_cents + mooe_cents + other_cents), 0) as cents
      from public.stock_batches where paid_from_funds
  ),
  latest as (
    select b.id, b.batch_no,
           b.shipping_cents + b.tax_cents + b.mooe_cents + b.other_cents
           + coalesce((select sum(m.delta * m.unit_cost_cents) from public.stock_movements m
                        where m.batch_id = b.id and m.kind = 'restock' and m.delta > 0), 0) as cents
      from public.stock_batches b
     where b.paid_from_funds
     order by b.received_on desc, b.batch_no desc
     limit 1
  ),
  t as (
    select s.gross, s.discounts, s.net, s.owed, s.net - s.owed as collected,
           g.cents as goods, g.uncosted, f.cents as fees,
           (select coalesce(sum(amount_cents), 0) from public.expenses) as expenses,
           (select coalesce(sum(amount_cents), 0) from public.fund_releases) as released,
           (select coalesce(sum(owner_cents), 0) from public.fund_releases) as owner_released,
           (select coalesce(sum(manager_cents), 0) from public.fund_releases) as manager_released,
           coalesce((select cents from latest), 0) as reserve,
           (select batch_no from latest) as reserve_batch_no
      from sales s, goods g, fees f
  )
  select jsonb_build_object(
    'gross_cents', gross, 'discount_cents', discounts, 'net_cents', net, 'owed_cents', owed,
    'collected_cents', collected,
    'collected_by_method', coalesce((select jsonb_object_agg(method, cents) from by_method), '{}'),
    'goods_cents', goods, 'goods_uncosted', uncosted, 'restock_fees_cents', fees,
    'expenses_cents', expenses, 'released_cents', released,
    'owner_released_cents', owner_released, 'manager_released_cents', manager_released,
    'balance_cents', collected - goods - fees - expenses - released,
    'reserve_cents', reserve, 'reserve_batch_no', reserve_batch_no,
    'available_cents', greatest(0, collected - goods - fees - expenses - released - reserve))
  from t
$$;

-- What the dashboard shows. Owners and managers.
create function public.company_funds()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when public.is_manager() then public.funds_summary() end
$$;

-- Release profit: split owner : manager by the profit split, up to what's available (the balance
-- minus the reserve for the next batch). Owner only.
create function public.release_profits(p_amount_cents int, p_note text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id        uuid;
  v_available bigint;
  v_manager   int;
  v_parts     int;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can release profits' using errcode = '42501';
  end if;
  if p_amount_cents is null or p_amount_cents not between 1 and 1000000000 then
    raise exception 'Enter an amount from ₱0.01' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('fund_releases'));
  v_available := (public.funds_summary() ->> 'available_cents')::bigint;
  if p_amount_cents > v_available then
    raise exception 'Only ₱% is available to release (the rest is kept for the next batch)',
      to_char(v_available / 100.0, 'FM999,999,990.00') using errcode = '22023';
  end if;
  select split_owner_parts + split_manager_parts, split_manager_parts into v_parts, v_manager from public.settings where id = 1;
  v_manager := round(p_amount_cents::numeric * v_manager / v_parts);
  insert into public.fund_releases (amount_cents, owner_cents, manager_cents, note)
  values (p_amount_cents, p_amount_cents - v_manager, v_manager, nullif(btrim(p_note), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- Undo a release recorded by mistake. Owner only.
create function public.delete_fund_release(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Only the owner can release profits' using errcode = '42501';
  end if;
  delete from public.fund_releases where id = p_id;
  if not found then
    raise exception 'That release no longer exists' using errcode = 'P0002';
  end if;
end;
$$;

-- ───────── 3. Fixing stock changes ─────────
-- Internal: move a stock change by p_diff pieces, then carry it through the product's later
-- history. A later count fixed the shelf to what was counted, so it absorbs the difference and
-- nothing after it moves; with no later count, the shelf moves too.
create function public.shift_stock_after(p_movement uuid, p_diff int)
returns void
language plpgsql set search_path = ''
as $$
declare
  v_m    public.stock_movements;
  v_next record;
begin
  select * into v_m from public.stock_movements where id = p_movement;
  for v_next in
    select id, kind from public.stock_movements
     where product_id = v_m.product_id
       and (created_at > v_m.created_at or (created_at = v_m.created_at and id > v_m.id))
     order by created_at, id
  loop
    if v_next.kind = 'count' then
      update public.stock_movements set delta = delta - p_diff where id = v_next.id;
      return;
    end if;
    update public.stock_movements set on_hand_after = on_hand_after + p_diff where id = v_next.id;
  end loop;
  update public.products set on_hand = on_hand + p_diff, updated_at = now() where id = v_m.product_id;
end;
$$;

-- Edit a restock, opening stock, count or damaged / lost entry. p_qty is what the form asked for:
-- pieces received, pieces on the shelf (count) or pieces lost. p_unit_cost_cents only for restocks.
create function public.edit_stock_change(p_movement uuid, p_qty int, p_unit_cost_cents int default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_m     public.stock_movements;
  v_new   int;
  v_diff  int;
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can fix stock' using errcode = '42501';
  end if;
  select * into v_m from public.stock_movements where id = p_movement;
  if not found then
    raise exception 'That stock change no longer exists' using errcode = 'P0002';
  end if;
  perform 1 from public.products where id = v_m.product_id for update;
  if v_m.kind not in ('opening', 'restock', 'count', 'waste') then
    raise exception 'Sales and voids are fixed from the sale, not here' using errcode = '22023';
  end if;
  if p_qty is null or p_qty < 0 or p_qty > 100000 or (v_m.kind <> 'count' and p_qty = 0) then
    raise exception 'Enter % pieces', case when v_m.kind = 'count' then '0 to 100,000' else '1 to 100,000' end using errcode = '22023';
  end if;
  if p_unit_cost_cents is not null and p_unit_cost_cents < 0 then
    raise exception 'The cost can''t be negative' using errcode = '22023';
  end if;
  v_new := case v_m.kind when 'count' then p_qty - (v_m.on_hand_after - v_m.delta)
                         when 'waste' then -p_qty
                         else p_qty end;
  v_diff := v_new - v_m.delta;
  update public.stock_movements
     set delta = v_new, on_hand_after = on_hand_after + v_diff,
         unit_cost_cents = case when kind = 'restock' then coalesce(p_unit_cost_cents, unit_cost_cents) else unit_cost_cents end
   where id = p_movement;
  if v_diff <> 0 then
    perform public.shift_stock_after(p_movement, v_diff);
  end if;
end;
$$;

-- Remove a stock change that was a mistake.
create function public.remove_stock_change(p_movement uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_m public.stock_movements;
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can fix stock' using errcode = '42501';
  end if;
  select * into v_m from public.stock_movements where id = p_movement;
  if not found then
    raise exception 'That stock change no longer exists' using errcode = 'P0002';
  end if;
  perform 1 from public.products where id = v_m.product_id for update;
  if v_m.kind not in ('opening', 'restock', 'count', 'waste') then
    raise exception 'Sales and voids are fixed from the sale, not here' using errcode = '22023';
  end if;
  if v_m.delta <> 0 then
    perform public.shift_stock_after(p_movement, -v_m.delta);
  end if;
  delete from public.stock_movements where id = p_movement;
end;
$$;

revoke execute on function public.shift_stock_after(uuid, int) from public, anon, authenticated;
revoke execute on function public.reserve_product(jsonb) from public, anon;
grant execute on function public.reserve_product(jsonb) to authenticated;
revoke execute on function public.close_reservation(uuid, uuid) from public, anon;
grant execute on function public.close_reservation(uuid, uuid) to authenticated;
revoke execute on function public.set_batch_paid_from_funds(uuid, boolean) from public, anon;
grant execute on function public.set_batch_paid_from_funds(uuid, boolean) to authenticated;
revoke execute on function public.funds_summary() from public, anon, authenticated;
revoke execute on function public.company_funds() from public, anon;
grant execute on function public.company_funds() to authenticated;
revoke execute on function public.release_profits(int, text) from public, anon;
grant execute on function public.release_profits(int, text) to authenticated;
revoke execute on function public.delete_fund_release(uuid) from public, anon;
grant execute on function public.delete_fund_release(uuid) to authenticated;
revoke execute on function public.edit_stock_change(uuid, int, int) from public, anon;
grant execute on function public.edit_stock_change(uuid, int, int) to authenticated;
revoke execute on function public.remove_stock_change(uuid) from public, anon;
grant execute on function public.remove_stock_change(uuid) to authenticated;
