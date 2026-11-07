-- Restock tab: the reorder plan (how fast each product sells → when and how much to order) and
-- delivery batches (one supplier order received at once), with sales matched to batches
-- first in, first out. Owners and managers only.

-- ───────── Reorder plan settings ─────────
-- Reorder point = pieces sold per day × (lead days + buffer days).
-- Suggested order = enough for lead + buffer + cover days, minus what's on the shelf.
alter table public.settings
  add column restock_lead_days   int not null default 7  check (restock_lead_days between 0 and 90),
  add column restock_buffer_days int not null default 3  check (restock_buffer_days between 0 and 90),
  add column restock_cover_days  int not null default 14 check (restock_cover_days between 1 and 180);

create function public.set_restock_plan(p_lead_days int, p_buffer_days int, p_cover_days int)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can change the reorder plan' using errcode = '42501';
  end if;
  if p_lead_days is null or p_lead_days not between 0 and 90 then
    raise exception 'Delivery time must be 0 to 90 days' using errcode = '22023';
  end if;
  if p_buffer_days is null or p_buffer_days not between 0 and 90 then
    raise exception 'Buffer must be 0 to 90 days' using errcode = '22023';
  end if;
  if p_cover_days is null or p_cover_days not between 1 and 180 then
    raise exception 'Each order should cover 1 to 180 days' using errcode = '22023';
  end if;
  update public.settings set restock_lead_days = p_lead_days, restock_buffer_days = p_buffer_days,
                             restock_cover_days = p_cover_days, updated_at = now()
   where id = 1;
end;
$$;

-- Pieces sold per product over the last p_days days (completed sales), and how many of those days
-- the product has been stocked, so a product added last week isn't judged on 28 days.
create function public.sales_pace(p_days int default 28)
returns table (product_id uuid, sold int, days numeric, last_sold_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select p.id,
         coalesce(s.sold, 0)::int,
         round(greatest(1, least(p_days, extract(epoch from now() - coalesce(f.first_in, now())) / 86400))::numeric, 1),
         s.last_sold_at
    from public.products p
    left join (select m.product_id, min(m.created_at) as first_in
                 from public.stock_movements m
                where m.kind in ('opening', 'restock')
                group by m.product_id) f on f.product_id = p.id
    left join (select i.product_id, sum(i.quantity) as sold, max(s.created_at) as last_sold_at
                 from public.sale_items i
                 join public.sales s on s.id = i.sale_id
                where s.status = 'completed' and s.created_at > now() - make_interval(days => p_days)
                group by i.product_id) s on s.product_id = p.id
   where public.is_manager()
$$;

-- Set several products' low-stock alert levels at once (the Restock tab's suggested reorder points).
-- p: [{"product_id": "…", "reorder_at": 12}, …]
create function public.set_reorder_levels(p jsonb)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_count int;
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can change products' using errcode = '42501';
  end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) = 0 then
    raise exception 'Nothing to change' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p) e
              where (e ->> 'reorder_at') is null or (e ->> 'reorder_at')::int not between 0 and 10000) then
    raise exception 'Alert levels must be 0 to 10,000 pieces' using errcode = '22023';
  end if;
  update public.products pr set reorder_at = (e ->> 'reorder_at')::int, updated_at = now()
    from jsonb_array_elements(p) e
   where pr.id = (e ->> 'product_id')::uuid and pr.reorder_at <> (e ->> 'reorder_at')::int;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ───────── Batches ─────────
-- A batch is one supplier order received together. Its pieces are restock movements with batch_id.
create table public.stock_batches (
  id           uuid primary key default gen_random_uuid(),
  batch_no     int not null unique,
  supplier     text check (char_length(supplier) <= 60),
  received_on  date not null default public.manila_today(),
  note         text check (char_length(note) <= 200),
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index stock_batches_created_by_idx on public.stock_batches (created_by);

alter table public.stock_movements
  add column batch_id uuid references public.stock_batches (id) on delete set null;
create index stock_movements_batch_idx on public.stock_movements (batch_id);

alter table public.stock_batches enable row level security;
create policy "managers read stock_batches" on public.stock_batches
  for select to authenticated using ((select public.is_manager()));
revoke all on public.stock_batches from anon;
revoke insert, update, delete on public.stock_batches from authenticated;
grant select on public.stock_batches to authenticated;

-- Receive a batch: every product's pieces go on the shelf in one go, logged as restocks.
-- p: {supplier, received_on, note, items: [{product_id, qty, unit_cost_cents}]}
-- A cost per piece becomes the product's cost, as with a single restock.
create function public.receive_batch(p jsonb)
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

  perform pg_advisory_xact_lock(hashtext('stock_batches.batch_no'));
  select coalesce(max(batch_no), 0) + 1 into v_no from public.stock_batches;
  insert into public.stock_batches (batch_no, supplier, received_on, note)
  values (v_no, nullif(btrim(p ->> 'supplier'), ''), v_date, nullif(btrim(p ->> 'note'), ''))
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

-- Sales by batch. Pieces leave the shelf first in, first out: each product's stock arrivals
-- (opening stock, restocks, batches) stack up in order, and its completed sales use them up in
-- order. One row per batch and product; batch_id is null for stock that came in outside a batch.
-- sales_cents is after each sale's discount; cost_cents uses the cost saved on each sale.
create function public.batch_sales()
returns table (batch_id uuid, product_id uuid, received int, sold int, sales_cents bigint,
               cost_cents bigint, uncosted int, first_in timestamptz, first_sold_at timestamptz,
               last_sold_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  with arrivals as (
    select m.id, m.product_id, m.batch_id, m.delta as qty, m.created_at,
           sum(m.delta) over w - m.delta as lo,
           sum(m.delta) over w as hi
      from public.stock_movements m
     where m.kind in ('opening', 'restock') and m.delta > 0
    window w as (partition by m.product_id order by m.created_at, m.id)
  ),
  sold as (
    select i.product_id, s.created_at, i.unit_cost_cents,
           i.line_total_cents::numeric * s.total_cents / nullif(s.subtotal_cents, 0) / i.quantity as net_each,
           sum(i.quantity) over w - i.quantity as lo,
           sum(i.quantity) over w as hi
      from public.sale_items i
      join public.sales s on s.id = i.sale_id
     where s.status = 'completed' and i.product_id is not null
    window w as (partition by i.product_id order by s.created_at, i.id)
  ),
  matched as (
    select a.id, a.batch_id, a.product_id, a.qty, a.created_at, s.created_at as sold_at,
           s.unit_cost_cents, coalesce(s.net_each, 0) as net_each,
           -- least/greatest skip nulls, so an arrival with no sales must be 0 explicitly.
           case when s.product_id is null then 0 else greatest(0, least(a.hi, s.hi) - greatest(a.lo, s.lo)) end as pcs
      from arrivals a
      left join sold s on s.product_id = a.product_id and s.lo < a.hi and s.hi > a.lo
  ),
  per_arrival as (
    select id, batch_id, product_id, qty, created_at,
           coalesce(sum(pcs), 0) as sold,
           coalesce(sum(pcs * net_each), 0) as sales,
           coalesce(sum(pcs * unit_cost_cents), 0) as cost,
           coalesce(sum(pcs) filter (where pcs > 0 and unit_cost_cents is null), 0) as uncosted,
           min(sold_at) filter (where pcs > 0) as first_sold_at,
           max(sold_at) filter (where pcs > 0) as last_sold_at
      from matched
     group by id, batch_id, product_id, qty, created_at
  )
  select batch_id, product_id, sum(qty)::int, sum(sold)::int, round(sum(sales))::bigint,
         sum(cost)::bigint, sum(uncosted)::int, min(created_at), min(first_sold_at), max(last_sold_at)
    from per_arrival
   where public.is_manager()
   group by batch_id, product_id
$$;

revoke execute on function public.set_restock_plan(int, int, int) from public, anon;
grant execute on function public.set_restock_plan(int, int, int) to authenticated;
revoke execute on function public.sales_pace(int) from public, anon;
grant execute on function public.sales_pace(int) to authenticated;
revoke execute on function public.set_reorder_levels(jsonb) from public, anon;
grant execute on function public.set_reorder_levels(jsonb) to authenticated;
revoke execute on function public.receive_batch(jsonb) from public, anon;
grant execute on function public.receive_batch(jsonb) to authenticated;
revoke execute on function public.batch_sales() from public, anon;
grant execute on function public.batch_sales() to authenticated;
