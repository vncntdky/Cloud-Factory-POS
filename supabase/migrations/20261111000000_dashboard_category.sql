-- Dashboard: filter by category. Everything is now worked out per sale line, so a category gets
-- its own sales, discounts, unpaid balances (each sale's shared across its lines by value), pieces,
-- costs and busiest times. Restock costs go to a category by its share of each batch's pieces.
-- p_category null = the whole shop (same numbers as before).
drop function public.dashboard(date, date, text);

create function public.dashboard(p_from date, p_to date, p_grain text default 'day', p_category uuid default null)
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
             coalesce(i.line_total_cents::numeric * s.total_cents / nullif(s.subtotal_cents, 0), 0) as net_cents,
             coalesce(i.line_total_cents::numeric * s.discount_cents / nullif(s.subtotal_cents, 0), 0) as discount_cents,
             coalesce(i.line_total_cents::numeric * s.balance_cents / nullif(s.subtotal_cents, 0), 0) as owed_cents,
             i.quantity * i.unit_cost_cents as cost_cents,
             case when s.business_date >= p_from then 'current' else 'previous' end as period
        from public.sales s
        join public.sale_items i on i.sale_id = s.id
        left join public.products p on p.id = i.product_id
       where s.status = 'completed' and s.business_date between p_from - v_days and p_to
         and (p_category is null or p.category_id = p_category)
    ),
    totals as (
      select period, round(sum(net_cents)) as sales_cents, round(sum(discount_cents)) as discount_cents,
             count(distinct sale_id) as sales, round(sum(owed_cents)) as owed_cents,
             sum(quantity) as pieces, coalesce(sum(cost_cents), 0) as cost_cents,
             count(*) filter (where cost_cents is null) as uncosted
        from lines group by period
    ),
    restock as (
      select case when b.received_on >= p_from then 'current' else 'previous' end as period,
             round(sum((b.shipping_cents + b.tax_cents + b.mooe_cents + b.other_cents)::numeric
               * case when p_category is null then 1 else coalesce(
                   (select sum(m.delta) from public.stock_movements m join public.products p on p.id = m.product_id
                     where m.batch_id = b.id and p.category_id = p_category)::numeric
                   / nullif((select sum(m.delta) from public.stock_movements m where m.batch_id = b.id), 0), 0) end)) as restock_cents
        from public.stock_batches b
       where b.received_on between p_from - v_days and p_to
       group by 1
    ),
    periods as (
      select p.period,
             jsonb_build_object(
               'sales_cents', coalesce(t.sales_cents, 0), 'discount_cents', coalesce(t.discount_cents, 0),
               'cost_cents', coalesce(t.cost_cents, 0), 'uncosted', coalesce(t.uncosted, 0),
               'pieces', coalesce(t.pieces, 0), 'sales', coalesce(t.sales, 0),
               'owed_cents', coalesce(t.owed_cents, 0), 'restock_cents', coalesce(r.restock_cents, 0)) as j
        from (values ('current'), ('previous')) p(period)
        left join totals t on t.period = p.period
        left join restock r on r.period = p.period
    ),
    buckets as (
      select b::date as start,
             coalesce(round(sum(l.net_cents)), 0) as sales_cents,
             coalesce(round(sum(l.discount_cents)), 0) as discount_cents,
             count(distinct l.sale_id) as sales,
             coalesce(sum(l.cost_cents), 0) as cost_cents,
             count(l.sale_id) filter (where l.cost_cents is null) as uncosted,
             coalesce(sum(l.quantity), 0) as pieces
        from generate_series(date_trunc(p_grain, p_from::timestamp), p_to::timestamp, v_step) b
        left join lines l on l.period = 'current'
          and l.business_date >= greatest(b::date, p_from) and l.business_date < least((b + v_step)::date, p_to + 1)
       group by b
    ),
    product_sales as (
      select product_id, sum(quantity) as pieces, round(sum(net_cents)) as sales_cents,
             coalesce(sum(cost_cents), 0) as cost_cents, count(*) filter (where cost_cents is null) as uncosted
        from lines
       where period = 'current' and product_id is not null
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
       where (p.active or ps.pieces > 0) and (p_category is null or p.category_id = p_category)
    ),
    hours as (
      select extract(dow from created_at at time zone 'Asia/Manila')::int as dow,
             extract(hour from created_at at time zone 'Asia/Manila')::int as hour,
             count(distinct sale_id) as sales, sum(quantity) as pieces
        from lines
       where period = 'current'
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

revoke execute on function public.dashboard(date, date, text, uuid) from public, anon;
grant execute on function public.dashboard(date, date, text, uuid) to authenticated;
