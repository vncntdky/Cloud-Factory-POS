-- Every stock change belongs to a batch, and every batch is paid from the company funds.
--   1. All batches count against the funds, opening stock included (its goods and any shipping or
--      other restocking fees). A batch can still be switched off on its page.
--   2. Restock, count and damaged / lost name the batch they're for (adjust_stock takes p_batch),
--      and a new product's starting pieces go into a batch (save_product takes batch_id). Counts
--      and losses then show in that batch's "left".
--   3. batch_sales also returns adjusted: the batch's count corrections and losses per product.

-- ───────── 1. Funds: every batch ─────────
update public.stock_batches set paid_from_funds = true where not paid_from_funds;

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
  insert into public.stock_batches (batch_no, supplier, received_on, note)
  values (v_no, nullif(btrim(p ->> 'supplier'), ''), (v_first at time zone 'Asia/Manila')::date,
          coalesce(nullif(btrim(p ->> 'note'), ''), 'Earlier stock'))
  returning id into v_batch;

  update public.stock_movements set batch_id = v_batch
   where batch_id is null and kind in ('opening', 'restock', 'count', 'waste');
  return v_batch;
end;
$$;

-- The funds count opening stock's cost too, not only restocks.
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
  goods as (
    -- Stock paid from the funds: opening stock and restocks, in a batch marked so or not yet in one.
    select coalesce(sum(m.delta * m.unit_cost_cents), 0) as cents,
           count(*) filter (where m.unit_cost_cents is null) as uncosted
      from public.stock_movements m
      left join public.stock_batches b on b.id = m.batch_id
     where m.kind in ('opening', 'restock') and m.delta > 0 and (m.batch_id is null or b.paid_from_funds)
  ),
  fees as (
    select coalesce(sum(shipping_cents + tax_cents + mooe_cents + other_cents), 0) as cents
      from public.stock_batches where paid_from_funds
  ),
  latest as (
    select b.id, b.batch_no,
           b.shipping_cents + b.tax_cents + b.mooe_cents + b.other_cents
           + coalesce((select sum(m.delta * m.unit_cost_cents) from public.stock_movements m
                        where m.batch_id = b.id and m.kind in ('opening', 'restock') and m.delta > 0), 0) as cents
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

-- ───────── 2. Stock changes name their batch ─────────
-- Counts and losses recorded before this go to the latest batch their product came in with.
update public.stock_movements c
   set batch_id = (select m.batch_id from public.stock_movements m
                    where m.product_id = c.product_id and m.batch_id is not null and m.kind in ('opening', 'restock')
                      and m.created_at <= c.created_at
                    order by m.created_at desc limit 1)
 where c.batch_id is null and c.kind in ('count', 'waste');

-- Count / restock / waste, for a batch. restock adds pieces to the batch (a forgotten product, or
-- more of one); count sets what's on the shelf now; waste takes pieces lost or damaged off.
drop function public.adjust_stock(uuid, text, int, int, text);
create function public.adjust_stock(p_product uuid, p_kind text, p_qty int,
                                    p_unit_cost_cents int default null, p_note text default null,
                                    p_batch uuid default null)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_on_hand int;
  v_delta   int;
  v_after   int;
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can change stock' using errcode = '42501';
  end if;
  if p_kind not in ('count', 'restock', 'waste') then
    raise exception 'Unknown stock change' using errcode = '22023';
  end if;
  if p_batch is null or not exists (select 1 from public.stock_batches where id = p_batch) then
    raise exception 'Pick the batch this is for' using errcode = '22023';
  end if;
  if p_qty is null or p_qty < 0 or p_qty > 100000 then
    raise exception 'Enter a number of pieces from 0 to 100,000' using errcode = '22023';
  end if;
  if p_kind <> 'count' and p_qty = 0 then
    raise exception 'Enter at least 1 piece' using errcode = '22023';
  end if;
  if p_unit_cost_cents is not null and p_unit_cost_cents < 0 then
    raise exception 'The cost can''t be negative' using errcode = '22023';
  end if;

  select on_hand into v_on_hand from public.products where id = p_product for update;
  if not found then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;
  v_delta := case p_kind when 'count' then p_qty - v_on_hand
                         when 'restock' then p_qty
                         else -p_qty end;
  -- A count that matches is still logged: "counted, matched" is useful history.

  if p_kind = 'restock' and p_unit_cost_cents is not null then
    insert into public.product_costs (product_id, cost_cents) values (p_product, p_unit_cost_cents)
    on conflict (product_id) do update set cost_cents = excluded.cost_cents, updated_at = now();
  end if;

  update public.products set on_hand = on_hand + v_delta, updated_at = now()
   where id = p_product
  returning on_hand into v_after;
  insert into public.stock_movements (product_id, kind, delta, on_hand_after, unit_cost_cents, note, batch_id)
  values (p_product, p_kind, v_delta, v_after,
          case when p_kind = 'restock' then coalesce(p_unit_cost_cents, (select cost_cents from public.product_costs where product_id = p_product)) end,
          nullif(btrim(p_note), ''), p_batch);
  return v_after;
end;
$$;

-- save_product: a new product's starting pieces come in with a batch (p.batch_id), recorded as a
-- restock of that batch. Without pieces, no batch is needed.
-- p: {brand, name, variant, barcode, category_id, new_category, price_cents, cost_cents,
--     reorder_at, active, opening_qty and batch_id (new products only)}
create or replace function public.save_product(p_id uuid, p jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id      uuid := p_id;
  v_name    text := nullif(btrim(p ->> 'name'), '');
  v_cat     uuid := nullif(p ->> 'category_id', '')::uuid;
  v_new     text := nullif(btrim(p ->> 'new_category'), '');
  v_price   int  := (p ->> 'price_cents')::int;
  v_cost    int  := nullif(p ->> 'cost_cents', '')::int;
  v_reorder int  := coalesce(nullif(p ->> 'reorder_at', '')::int, 5);
  v_open    int  := coalesce(nullif(p ->> 'opening_qty', '')::int, 0);
  v_batch   uuid := nullif(p ->> 'batch_id', '')::uuid;
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can change products' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'Add a product name' using errcode = '22023';
  end if;
  if v_price is null or v_price < 0 then
    raise exception 'The price must be 0 or more' using errcode = '22023';
  end if;
  if v_cost is not null and v_cost < 0 then
    raise exception 'The cost can''t be negative' using errcode = '22023';
  end if;
  if v_reorder < 0 then
    raise exception 'The reorder level must be 0 or more' using errcode = '22023';
  end if;
  if v_open < 0 or v_open > 100000 then
    raise exception 'Opening stock must be between 0 and 100,000' using errcode = '22023';
  end if;
  if p_id is null and v_open > 0 and (v_batch is null or not exists (select 1 from public.stock_batches where id = v_batch)) then
    raise exception 'Pick the batch these pieces came in' using errcode = '22023';
  end if;

  if v_new is not null then
    select id into v_cat from public.categories where lower(name) = lower(v_new);
    if v_cat is null then
      insert into public.categories (name, sort_order)
      values (v_new, coalesce((select max(sort_order) + 1 from public.categories), 0))
      returning id into v_cat;
    end if;
  end if;

  if v_id is null then
    insert into public.products (category_id, brand, name, variant, barcode, price_cents, reorder_at, active)
    values (v_cat, nullif(btrim(p ->> 'brand'), ''), v_name, nullif(btrim(p ->> 'variant'), ''),
            nullif(btrim(p ->> 'barcode'), ''), v_price, v_reorder,
            coalesce((p ->> 'active')::boolean, true))
    returning id into v_id;
    if v_open > 0 then
      update public.products set on_hand = v_open where id = v_id;
      insert into public.stock_movements (product_id, kind, delta, on_hand_after, unit_cost_cents, batch_id)
      values (v_id, 'restock', v_open, v_open, v_cost, v_batch);
    end if;
  else
    update public.products set
      category_id = v_cat,
      brand       = nullif(btrim(p ->> 'brand'), ''),
      name        = v_name,
      variant     = nullif(btrim(p ->> 'variant'), ''),
      barcode     = nullif(btrim(p ->> 'barcode'), ''),
      price_cents = v_price,
      reorder_at  = v_reorder,
      active      = coalesce((p ->> 'active')::boolean, active),
      updated_at  = now()
    where id = v_id;
    if not found then
      raise exception 'That product no longer exists' using errcode = 'P0002';
    end if;
  end if;

  if v_cost is not null then
    insert into public.product_costs (product_id, cost_cents) values (v_id, v_cost)
    on conflict (product_id) do update set cost_cents = excluded.cost_cents, updated_at = now();
  elsif p ? 'cost_cents' then
    delete from public.product_costs where product_id = v_id;
  end if;

  return v_id;
end;
$$;

-- ───────── 3. Batch sales: with counts and losses ─────────
drop function public.batch_sales();
create function public.batch_sales()
returns table (batch_id uuid, product_id uuid, received int, sold int, sales_cents bigint,
               cost_cents bigint, uncosted int, owed_cents bigint, received_cost_cents bigint,
               received_uncosted int, adjusted int, first_in timestamptz, first_sold_at timestamptz,
               last_sold_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  with per_arrival as (
    select arrival_id, batch_id, product_id, received, unit_cost_cents, first_in,
           coalesce(sum(pcs), 0) as sold,
           coalesce(sum(pcs * net_each), 0) as sales,
           coalesce(sum(pcs * owed_each), 0) as owed,
           coalesce(sum(pcs * cost_each), 0) as cost,
           coalesce(sum(pcs) filter (where pcs > 0 and cost_each is null), 0) as uncosted,
           min(sold_at) filter (where pcs > 0) as first_sold_at,
           max(sold_at) filter (where pcs > 0) as last_sold_at
      from public.batch_matches()
     group by arrival_id, batch_id, product_id, received, unit_cost_cents, first_in
  ),
  rows as (
    select batch_id, product_id, sum(received)::int as received, sum(sold)::int as sold,
           round(sum(sales))::bigint as sales_cents, sum(cost)::bigint as cost_cents, sum(uncosted)::int as uncosted,
           round(sum(owed))::bigint as owed_cents,
           coalesce(sum(received * unit_cost_cents), 0)::bigint as received_cost_cents,
           coalesce(sum(received) filter (where unit_cost_cents is null), 0)::int as received_uncosted,
           min(first_in) as first_in, min(first_sold_at) as first_sold_at, max(last_sold_at) as last_sold_at
      from per_arrival
     group by batch_id, product_id
  )
  select r.batch_id, r.product_id, r.received, r.sold, r.sales_cents, r.cost_cents, r.uncosted, r.owed_cents,
         r.received_cost_cents, r.received_uncosted,
         coalesce((select sum(m.delta) from public.stock_movements m
                    where m.batch_id is not distinct from r.batch_id and m.product_id = r.product_id
                      and m.kind in ('count', 'waste')), 0)::int,
         r.first_in, r.first_sold_at, r.last_sold_at
    from rows r
   where public.is_manager()
$$;

revoke execute on function public.adjust_stock(uuid, text, int, int, text, uuid) from public, anon;
grant execute on function public.adjust_stock(uuid, text, int, int, text, uuid) to authenticated;
revoke execute on function public.batch_sales() from public, anon;
grant execute on function public.batch_sales() to authenticated;
