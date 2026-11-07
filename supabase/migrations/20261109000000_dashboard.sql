-- Dashboard (Sales → Dashboard): sales and profit over time, unit economics, product performance
-- and busiest times, for a date range. Owners and managers (it includes costs).
--
-- dashboard(from, to, grain) → {
--   buckets:  [{start, sales_cents, discount_cents, cost_cents, uncosted, pieces, sales}]  per day/week/month
--   current:  totals for the range;  previous: totals for the same number of days just before it
--             {sales_cents, discount_cents, cost_cents, uncosted, pieces, sales, owed_cents, restock_cents}
--   products: [{product_id, name, active, on_hand, pieces, sales_cents, cost_cents, uncosted, first_in, last_sold_at}]
--   hours:    [{dow (0 = Sunday), hour, sales, pieces}]  Manila time
-- }
-- Sales amounts are after each sale's discount (a line's share of it); costs are the costs saved on
-- each sale. "uncosted" counts lines sold without a cost, so profit can be flagged as incomplete.
create function public.dashboard(p_from date, p_to date, p_grain text default 'day')
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_days int := p_to - p_from + 1;
  v_step interval;
begin
  if not public.is_manager() then
    raise exception 'Only owners and managers can see the dashboard' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or v_days > 800 then
    raise exception 'Pick a range of up to 800 days' using errcode = '22023';
  end if;
  if p_grain not in ('day', 'week', 'month') then
    raise exception 'Group by day, week or month' using errcode = '22023';
  end if;
  v_step := ('1 ' || p_grain)::interval;

  return (
    with lines as (
      select s.id as sale_id, s.business_date, s.created_at, i.product_id, i.quantity,
             i.line_total_cents::numeric * s.total_cents / nullif(s.subtotal_cents, 0) as net_cents,
             i.quantity * i.unit_cost_cents as cost_cents
        from public.sales s
        join public.sale_items i on i.sale_id = s.id
       where s.status = 'completed' and s.business_date between p_from - v_days and p_to
    ),
    totals as (
      select case when s.business_date >= p_from then 'current' else 'previous' end as period,
             sum(s.total_cents) as sales_cents, sum(s.discount_cents) as discount_cents,
             count(*) as sales, sum(s.balance_cents) as owed_cents
        from public.sales s
       where s.status = 'completed' and s.business_date between p_from - v_days and p_to
       group by 1
    ),
    line_totals as (
      select case when business_date >= p_from then 'current' else 'previous' end as period,
             sum(quantity) as pieces, coalesce(sum(cost_cents), 0) as cost_cents,
             count(*) filter (where cost_cents is null) as uncosted
        from lines group by 1
    ),
    restock as (
      select case when received_on >= p_from then 'current' else 'previous' end as period,
             sum(shipping_cents + tax_cents + mooe_cents + other_cents) as restock_cents
        from public.stock_batches
       where received_on between p_from - v_days and p_to
       group by 1
    ),
    periods as (
      select p.period,
             jsonb_build_object(
               'sales_cents', coalesce(t.sales_cents, 0), 'discount_cents', coalesce(t.discount_cents, 0),
               'cost_cents', coalesce(l.cost_cents, 0), 'uncosted', coalesce(l.uncosted, 0),
               'pieces', coalesce(l.pieces, 0), 'sales', coalesce(t.sales, 0),
               'owed_cents', coalesce(t.owed_cents, 0), 'restock_cents', coalesce(r.restock_cents, 0)) as j
        from (values ('current'), ('previous')) p(period)
        left join totals t on t.period = p.period
        left join line_totals l on l.period = p.period
        left join restock r on r.period = p.period
    ),
    buckets as (
      select b::date as start,
             coalesce((select sum(s.total_cents) from public.sales s
                        where s.status = 'completed' and s.business_date >= greatest(b::date, p_from)
                          and s.business_date < least((b + v_step)::date, p_to + 1)), 0) as sales_cents,
             coalesce((select sum(s.discount_cents) from public.sales s
                        where s.status = 'completed' and s.business_date >= greatest(b::date, p_from)
                          and s.business_date < least((b + v_step)::date, p_to + 1)), 0) as discount_cents,
             (select count(*) from public.sales s
               where s.status = 'completed' and s.business_date >= greatest(b::date, p_from)
                 and s.business_date < least((b + v_step)::date, p_to + 1)) as sales,
             coalesce((select sum(l.cost_cents) from lines l
                        where l.business_date >= greatest(b::date, p_from) and l.business_date < least((b + v_step)::date, p_to + 1)), 0) as cost_cents,
             (select count(*) from lines l
               where l.cost_cents is null and l.business_date >= greatest(b::date, p_from)
                 and l.business_date < least((b + v_step)::date, p_to + 1)) as uncosted,
             coalesce((select sum(l.quantity) from lines l
                        where l.business_date >= greatest(b::date, p_from) and l.business_date < least((b + v_step)::date, p_to + 1)), 0) as pieces
        from generate_series(date_trunc(p_grain, p_from::timestamp), p_to::timestamp, v_step) b
    ),
    product_sales as (
      select product_id, sum(quantity) as pieces, round(sum(net_cents)) as sales_cents,
             coalesce(sum(cost_cents), 0) as cost_cents, count(*) filter (where cost_cents is null) as uncosted
        from lines
       where business_date >= p_from and product_id is not null
       group by product_id
    ),
    products as (
      select p.id as product_id,
             concat_ws(' · ', nullif(concat_ws(' ', nullif(btrim(p.brand), ''), btrim(p.name)), ''), nullif(btrim(p.variant), '')) as name,
             p.active, p.on_hand,
             coalesce(ps.pieces, 0) as pieces, coalesce(ps.sales_cents, 0) as sales_cents,
             coalesce(ps.cost_cents, 0) as cost_cents, coalesce(ps.uncosted, 0) as uncosted,
             (select min(m.created_at) from public.stock_movements m
               where m.product_id = p.id and m.kind in ('opening', 'restock')) as first_in,
             (select max(s.created_at) from public.sale_items i join public.sales s on s.id = i.sale_id
               where i.product_id = p.id and s.status = 'completed') as last_sold_at
        from public.products p
        left join product_sales ps on ps.product_id = p.id
       where p.active or ps.pieces > 0
    ),
    hours as (
      select extract(dow from created_at at time zone 'Asia/Manila')::int as dow,
             extract(hour from created_at at time zone 'Asia/Manila')::int as hour,
             count(distinct sale_id) as sales, sum(quantity) as pieces
        from lines
       where business_date >= p_from
       group by 1, 2
    )
    select jsonb_build_object(
      'buckets', coalesce((select jsonb_agg(to_jsonb(b) order by b.start) from buckets b), '[]'),
      'current', (select j from periods where period = 'current'),
      'previous', (select j from periods where period = 'previous'),
      'products', coalesce((select jsonb_agg(to_jsonb(p)) from products p), '[]'),
      'hours', coalesce((select jsonb_agg(to_jsonb(h)) from hours h), '[]'))
  );
end;
$$;

revoke execute on function public.dashboard(date, date, text) from public, anon;
grant execute on function public.dashboard(date, date, text) to authenticated;
