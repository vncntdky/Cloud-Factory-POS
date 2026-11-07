-- Batches, part 2: what's still owed on each batch's sales ("Not paid yet" balances), and restock
-- costs on a batch (shipping, tax, MOOE, other) for its true cost and profit.

-- ───────── Restock costs ─────────
alter table public.stock_batches
  add column shipping_cents int not null default 0 check (shipping_cents between 0 and 100000000),
  add column tax_cents      int not null default 0 check (tax_cents between 0 and 100000000),
  add column mooe_cents     int not null default 0 check (mooe_cents between 0 and 100000000),
  add column other_cents    int not null default 0 check (other_cents between 0 and 100000000),
  add column other_label    text check (char_length(other_label) <= 40);

-- Internal: check restock costs in p (cents; missing = 0).
create function public.check_batch_costs(p jsonb)
returns void
language plpgsql immutable set search_path = ''
as $$
declare k text;
begin
  foreach k in array array['shipping_cents', 'tax_cents', 'mooe_cents', 'other_cents'] loop
    if coalesce(nullif(p ->> k, '')::int, 0) not between 0 and 100000000 then
      raise exception 'Restock costs must be 0 to ₱1,000,000' using errcode = '22023';
    end if;
  end loop;
end;
$$;

-- Change a batch's restock costs later (the shipping bill often comes after the goods).
-- p: {shipping_cents, tax_cents, mooe_cents, other_cents, other_label}
create function public.set_batch_costs(p_batch uuid, p jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can change batches' using errcode = '42501';
  end if;
  perform public.check_batch_costs(p);
  update public.stock_batches set
    shipping_cents = coalesce(nullif(p ->> 'shipping_cents', '')::int, 0),
    tax_cents      = coalesce(nullif(p ->> 'tax_cents', '')::int, 0),
    mooe_cents     = coalesce(nullif(p ->> 'mooe_cents', '')::int, 0),
    other_cents    = coalesce(nullif(p ->> 'other_cents', '')::int, 0),
    other_label    = nullif(btrim(p ->> 'other_label'), '')
  where id = p_batch;
  if not found then
    raise exception 'That batch no longer exists' using errcode = 'P0002';
  end if;
end;
$$;

-- receive_batch, now also taking the batch's restock costs (same keys as set_batch_costs).
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
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can receive stock' using errcode = '42501';
  end if;
  if jsonb_typeof(p -> 'items') <> 'array' or jsonb_array_length(p -> 'items') = 0 then
    raise exception 'Enter the pieces received for at least one product' using errcode = '22023';
  end if;
  if jsonb_array_length(p -> 'items') > 500 then
    raise exception 'A batch can have up to 500 products' using errcode = '22023';
  end if;
  if (select count(distinct e ->> 'product_id') from jsonb_array_elements(p -> 'items') e)
     <> jsonb_array_length(p -> 'items') then
    raise exception 'Each product can only be in a batch once' using errcode = '22023';
  end if;
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

  return v_batch;
end;
$$;

-- ───────── First in, first out matching, shared by the batch reports ─────────
-- Internal. One row per (stock arrival, sale line) overlap: each product's arrivals (opening stock,
-- restocks, batches) stack up in order and its completed sales use them up in order. An arrival
-- with nothing sold yet has one row with pcs = 0. net_each is the price per piece after the sale's
-- discount; owed_each is the part of it still unpaid (the sale's balance, shared across its pieces).
create function public.batch_matches()
returns table (arrival_id uuid, batch_id uuid, product_id uuid, received int, unit_cost_cents int,
               first_in timestamptz, sale_id uuid, sold_at timestamptz, pcs numeric,
               net_each numeric, owed_each numeric, cost_each int)
language sql stable set search_path = ''
as $$
  with arrivals as (
    select m.id, m.product_id, m.batch_id, m.delta as qty, m.unit_cost_cents, m.created_at,
           sum(m.delta) over w - m.delta as lo,
           sum(m.delta) over w as hi
      from public.stock_movements m
     where m.kind in ('opening', 'restock') and m.delta > 0
    window w as (partition by m.product_id order by m.created_at, m.id)
  ),
  sold as (
    select i.product_id, i.sale_id, s.created_at, i.unit_cost_cents,
           i.line_total_cents::numeric * s.total_cents / nullif(s.subtotal_cents, 0) / i.quantity as net_each,
           s.balance_cents::numeric / nullif(s.total_cents, 0) as owed_share,
           sum(i.quantity) over w - i.quantity as lo,
           sum(i.quantity) over w as hi
      from public.sale_items i
      join public.sales s on s.id = i.sale_id
     where s.status = 'completed' and i.product_id is not null
    window w as (partition by i.product_id order by s.created_at, i.id)
  )
  select a.id, a.batch_id, a.product_id, a.qty, a.unit_cost_cents, a.created_at,
         s.sale_id, s.created_at,
         -- least/greatest skip nulls, so an arrival with no sales must be 0 explicitly.
         case when s.product_id is null then 0 else greatest(0, least(a.hi, s.hi) - greatest(a.lo, s.lo)) end,
         coalesce(s.net_each, 0),
         coalesce(s.net_each * s.owed_share, 0),
         s.unit_cost_cents
    from arrivals a
    left join sold s on s.product_id = a.product_id and s.lo < a.hi and s.hi > a.lo
$$;

-- Sales by batch: one row per batch and product (batch_id null = stock from before batches).
-- New: owed_cents (still unpaid), received_cost_cents / received_uncosted (what the pieces cost).
drop function public.batch_sales();
create function public.batch_sales()
returns table (batch_id uuid, product_id uuid, received int, sold int, sales_cents bigint,
               cost_cents bigint, uncosted int, owed_cents bigint, received_cost_cents bigint,
               received_uncosted int, first_in timestamptz, first_sold_at timestamptz,
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
  )
  select batch_id, product_id, sum(received)::int, sum(sold)::int, round(sum(sales))::bigint,
         sum(cost)::bigint, sum(uncosted)::int, round(sum(owed))::bigint,
         coalesce(sum(received * unit_cost_cents), 0)::bigint,
         coalesce(sum(received) filter (where unit_cost_cents is null), 0)::int,
         min(first_in), min(first_sold_at), max(last_sold_at)
    from per_arrival
   where public.is_manager()
   group by batch_id, product_id
$$;

-- Who still owes for a batch's pieces (p_batch null = stock from before batches): one row per sale.
create function public.batch_owed(p_batch uuid)
returns table (sale_id uuid, sale_number int, business_date date, customer_name text,
               pcs int, owed_cents bigint)
language sql stable security definer set search_path = ''
as $$
  select m.sale_id, s.sale_number, s.business_date, s.customer_name,
         sum(m.pcs)::int, round(sum(m.pcs * m.owed_each))::bigint
    from public.batch_matches() m
    join public.sales s on s.id = m.sale_id
   where public.is_manager() and m.batch_id is not distinct from p_batch and m.pcs > 0 and m.owed_each > 0
   group by m.sale_id, s.sale_number, s.business_date, s.customer_name
   order by s.business_date, s.sale_number
$$;

revoke execute on function public.check_batch_costs(jsonb) from public, anon, authenticated;
revoke execute on function public.batch_matches() from public, anon, authenticated;
revoke execute on function public.set_batch_costs(uuid, jsonb) from public, anon;
grant execute on function public.set_batch_costs(uuid, jsonb) to authenticated;
revoke execute on function public.batch_sales() from public, anon;
grant execute on function public.batch_sales() to authenticated;
revoke execute on function public.batch_owed(uuid) from public, anon;
grant execute on function public.batch_owed(uuid) to authenticated;
