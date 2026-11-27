-- =====================================================================================================================
-- Cloud Factory owner dashboard: KPI queries                                   spec/kpi_queries.sql (Step 1, 26 Nov 2026)
-- Read with spec/1_information_architecture.md, which defines every KPI and the decision it informs.
-- =====================================================================================================================
--
-- HOW THE DASHBOARD RUNS THESE
--  * One call per query through the Supabase connector's execute_sql (project pyjhwbfdxrjeitwjztna). Send a block
--    exactly as written, from "begin read only;" to "rollback;". The read-only transaction makes Postgres refuse any
--    write, even if the text were changed, and the rollback leaves nothing behind. SELECT only; no function that writes.
--  * The connector runs as the database owner (RLS does not apply), so the page must send only these fixed texts.
--  * Placeholders (Q1 to Q4). Check each value matches ^\d{4}-\d{2}-\d{2}$ before replacing it:
--      {{from}}       first day of the period: Monday (Week), the 1st (Month), 1 Jan / Apr / Jul / Oct (Quarter)
--      {{to}}         least(last day of the period, today in Manila)
--      {{prev_from}}  {{from}} moved back one period: 7 days, 1 month or 3 months
--      {{prev_to}}    period complete ({{to}} is its last day):  {{from}} - 1 day  (the whole previous period)
--                     period still running:                      least({{from}} - 1 day, {{prev_from}} + ({{to}} - {{from}}))
--                     (the same days of the previous period, "like for like")
--    If the shop opened after {{prev_from}}, the queries compare with the whole previous period instead, and the page
--    compares flows per open day. Every query returns the dates and open days it used.
--    Example, Thu 26 Nov 2026: Week 2026-11-23..2026-11-26 vs 2026-11-16..2026-11-19;
--    Month 2026-11-01..2026-11-26 vs 2026-10-01..2026-10-26 (the queries use all of October: opened 27 Oct);
--    Quarter 2026-10-01..2026-11-26 vs 2026-07-01..2026-08-26 (the queries use all of Q3, which had no trading).
--  * Q5 has no placeholders: it is "now" (next order, money for it, payout suggestion) and does not change with the
--    period switch. Run it once when the dashboard opens.
--  * Output: one row per query. Most numbers sit in kpis = {metric: {now, prev, usual, usual_n}}:
--      now = this period, prev = previous period, usual = median of up to 8 earlier periods of the same shape
--      (same days into the period) during which the shop was open the whole time; null until 3 exist; usual_n = count.
--    Balances named *_end_* are at the end of the window (or now, for a period still running).
--  * Units: *_cents are centavos (divide by 100 for pesos), *_pct are 0..100, *_days are days (decimals allowed).
--  * Privacy: aggregates only. No buyer or staff name leaves the database. Q3 reads sales.customer_name only inside
--    a count of buyers and the largest single buyer's share; product names (the shop's own catalogue) are returned.
--  * Rules match docs/finance-guide.md and the app's finance_totals / finance_derive / finance_now: sales by business
--    day; landed cost = unit cost + the batch's restocking fees / pieces received, matched first in, first out;
--    cash moves when money moves; a batch's cost counts from its order day; balance identity checked in Q4.
--  * Planning numbers in Q5 follow the planning design v2 (shop level) until the planning engine
--    (supabase/migrations/20261127000000_planning_engine.sql) is live; then read public.plan_core() / plan_params()
--    instead, so the dashboard and Restock always agree.
-- =====================================================================================================================

-- =====================================================================================================================
-- Q1  PROFIT                                    views: Profit, Bottom line                     placeholders: all four
-- Question: how much did we earn, and which branch of the profit tree moved?
-- kpis: net_profit_cents, net_margin_pct, net_sales_cents, gross_sales_cents, discounts_cents, sales_count, pieces,
--       avg_price_cents, cogs_cents, landed_cost_pp_cents, gross_profit_cents, gross_margin_pct, opex_cents,
--       count_diffs_cents, tax_cents, product_days, products_on_shelf_avg, pieces_per_product_day,
--       net_sales_per_open_day_cents
-- Also: bridge (how net profit moved vs the previous period; the parts add up to total_cents):
--       days_cents (more or fewer days open), shelf_cents (fuller or emptier shelf), demand_cents (pieces a day per
--       product on the shelf), price_cents (average price, mix and discounts), cost_cents (landed cost per piece),
--       expenses_cents, counts_cents, tax_cents; null when the previous period had no sales.
--       opex_by_category (this period), tax_at_3pct_cents (net sales x 3%, for the accountant; not advice).
-- Tested 26 Nov 2026 for the week, month and quarter; matches finance_totals / finance_derive to the centavo.
-- =====================================================================================================================
begin read only;
with
p as (select date '{{from}}' as f, date '{{to}}' as t, date '{{prev_from}}' as pf, date '{{prev_to}}' as pt),
c as (
  select (now() at time zone 'Asia/Manila')::date as today,
         least((select min(business_date) from public.sales),
               (select min((created_at at time zone 'Asia/Manila')::date) from public.stock_movements)) as first_day,
         (select min(created_at) from public.stock_movements) as first_at,
         coalesce((select tax_rate_bp from public.settings where id = 1), 0) as tax_bp
),
w as (
  select x.k, x.ws, x.we,
         x.k >= 1 and x.ws >= c.first_day as in_usual,
         least(x.we, c.today) - x.ws + 1 as days,
         greatest(0, least(x.we, c.today) - greatest(x.ws, c.first_day) + 1) as open_days,
         x.ws::timestamp at time zone 'Asia/Manila' as ws_at,
         least((x.we + 1)::timestamp at time zone 'Asia/Manila', now()) as we_at
  from c, (
    select g.k,
           case when g.k = 0 then p.f when g.k = 1 then p.pf
                else (p.f - g.k * age(p.f, p.pf))::date end as ws,
           case when g.k = 0 then p.t
                when g.k = 1 then case when c.first_day > p.pf then p.f - 1 else p.pt end
                when p.t = (p.f + age(p.f, p.pf))::date - 1 then (p.f - (g.k - 1) * age(p.f, p.pf))::date - 1
                else least((p.f - (g.k - 1) * age(p.f, p.pf))::date - 1,
                           (p.f - g.k * age(p.f, p.pf))::date + (p.t - p.f)) end as we
    from p cross join c cross join generate_series(0, 8) as g(k)
  ) x
),
sd as (
  select s.business_date as d, count(*) as n, sum(s.subtotal_cents) as gross, sum(s.discount_cents) as disc,
         sum(s.total_cents) as net, sum(i.pcs) as pcs
  from public.sales s
  cross join lateral (select coalesce(sum(quantity), 0) as pcs from public.sale_items where sale_id = s.id) i
  where s.status = 'completed'
  group by 1
),
arr as (
  select m.product_id, m.batch_id, m.delta as qty, coalesce(m.unit_cost_cents, 0) as uc,
         sum(m.delta) over q - m.delta as lo, sum(m.delta) over q as hi
  from public.stock_movements m
  where m.kind in ('opening', 'restock') and m.delta > 0
  window q as (partition by m.product_id order by m.created_at, m.id)
),
fee as (
  select b.id as batch_id, (b.shipping_cents + b.tax_cents + b.mooe_cents + b.other_cents)::numeric / sum(a.qty) as pp
  from public.stock_batches b join arr a on a.batch_id = b.id
  group by b.id
),
sold as (
  select i.product_id, s.created_at, sum(i.quantity) over q - i.quantity as lo, sum(i.quantity) over q as hi
  from public.sale_items i join public.sales s on s.id = i.sale_id
  where s.status = 'completed' and i.product_id is not null
  window q as (partition by i.product_id order by s.created_at, i.id)
),
cogs as (
  select (s.created_at at time zone 'Asia/Manila')::date as d,
         sum((least(a.hi, s.hi) - greatest(a.lo, s.lo)) * (a.uc + coalesce(f.pp, 0))) as cents
  from sold s
  join arr a on a.product_id = s.product_id and s.lo < a.hi and s.hi > a.lo
  left join fee f on f.batch_id = a.batch_id
  group by 1
),
diffs as (
  select (m.created_at at time zone 'Asia/Manila')::date as d,
         sum(m.delta * (coalesce(
               (select avg(a.uc) from arr a where a.batch_id is not distinct from m.batch_id and a.product_id = m.product_id),
               (select a2.uc from arr a2 where a2.product_id = m.product_id order by a2.hi desc limit 1), 0)
             + coalesce((select f.pp from fee f where f.batch_id = m.batch_id), 0))) as cents
  from public.stock_movements m
  where m.kind in ('count', 'waste')
  group by 1
),
lv as (
  select m.created_at as t1, coalesce(lead(m.created_at) over q, now()) as t2, sum(m.delta) over q as lvl
  from public.stock_movements m
  window q as (partition by m.product_id order by m.created_at, m.id)
),
m as (
  select w.k, w.in_usual, w.days, w.open_days,
         s.net, s.gross, s.disc, s.sales, s.pieces,
         round(cg.upto) - round(cg.before) as cogs,
         round(df.upto) - round(df.before) as diffs,
         e.opex,
         round(tx.upto * c.tax_bp / 10000.0) - round(tx.before * c.tax_bp / 10000.0) as tax,
         sh.product_days,
         greatest(0, extract(epoch from w.we_at - greatest(w.ws_at, c.first_at)) / 86400.0) as open_time
  from w cross join c
  cross join lateral (select coalesce(sum(sd.net), 0) as net, coalesce(sum(sd.gross), 0) as gross,
                             coalesce(sum(sd.disc), 0) as disc, coalesce(sum(sd.n), 0) as sales,
                             coalesce(sum(sd.pcs), 0) as pieces
                      from sd where sd.d between w.ws and w.we) s
  cross join lateral (select coalesce(sum(cents) filter (where d <= w.we), 0) as upto,
                             coalesce(sum(cents) filter (where d < w.ws), 0) as before from cogs) cg
  cross join lateral (select coalesce(sum(cents) filter (where d <= w.we), 0) as upto,
                             coalesce(sum(cents) filter (where d < w.ws), 0) as before from diffs) df
  cross join lateral (select coalesce(sum(amount_cents), 0) as opex from public.expenses
                      where category <> 'tax' and spent_on between w.ws and w.we) e
  cross join lateral (select coalesce(sum(sd.net) filter (where sd.d <= w.we), 0) as upto,
                             coalesce(sum(sd.net) filter (where sd.d < w.ws), 0) as before from sd) tx
  cross join lateral (select coalesce(sum(extract(epoch from least(lv.t2, w.we_at) - greatest(lv.t1, w.ws_at))) / 86400.0, 0) as product_days
                      from lv where lv.lvl > 0 and lv.t2 > w.ws_at and lv.t1 < w.we_at) sh
),
d as (
  select m.*, m.net - m.cogs as gp, m.net - m.cogs + m.diffs - m.opex - m.tax as np
  from m
),
long as (
  select d.k, d.in_usual, v.metric, v.val
  from d cross join lateral (values
    ('net_profit_cents',        d.np::numeric),
    ('net_margin_pct',          round(100.0 * d.np / nullif(d.net, 0), 1)),
    ('net_sales_cents',         d.net::numeric),
    ('gross_sales_cents',       d.gross::numeric),
    ('discounts_cents',         d.disc::numeric),
    ('sales_count',             d.sales::numeric),
    ('pieces',                  d.pieces::numeric),
    ('avg_price_cents',         round(d.net::numeric / nullif(d.pieces, 0))),
    ('cogs_cents',              d.cogs::numeric),
    ('landed_cost_pp_cents',    round(d.cogs::numeric / nullif(d.pieces, 0))),
    ('gross_profit_cents',      d.gp::numeric),
    ('gross_margin_pct',        round(100.0 * d.gp / nullif(d.net, 0), 1)),
    ('opex_cents',              d.opex::numeric),
    ('count_diffs_cents',       d.diffs::numeric),
    ('tax_cents',               d.tax::numeric),
    ('product_days',            round(d.product_days, 2)),
    ('products_on_shelf_avg',   round(d.product_days / nullif(d.open_time, 0), 1)),
    ('pieces_per_product_day',  round(d.pieces / nullif(d.product_days, 0), 3)),
    ('net_sales_per_open_day_cents', round(d.net::numeric / nullif(d.open_days, 0)))
  ) as v(metric, val)
),
agg as (
  select metric,
         max(val) filter (where k = 0) as now,
         max(val) filter (where k = 1) as prev,
         case when count(val) filter (where in_usual) >= 3
              then round((percentile_cont(0.5) within group (order by val) filter (where in_usual))::numeric, 2) end as usual,
         count(val) filter (where in_usual) as usual_n
  from long group by metric
),
br as (
  select c1.pieces as q1, c0.pieces as q0, c1.product_days as pd1, c0.product_days as pd0,
         c1.open_days as t1, c0.open_days as t0,
         c1.np - c0.np as dnp,
         (c0.net - c0.cogs)::numeric / nullif(c0.pieces, 0) as m0,
         c1.net::numeric / nullif(c1.pieces, 0) as p1, c0.net::numeric / nullif(c0.pieces, 0) as p0,
         c1.opex - c0.opex as dopex, c1.diffs - c0.diffs as ddiffs, c1.tax - c0.tax as dtax
  from d c1, d c0 where c1.k = 0 and c0.k = 1
),
br2 as (
  select br.*,
         round((q1 - q0) * m0) as vol,
         round(case when t0 > 0 then (t1 - t0) * (q0::numeric / t0) * m0 else 0 end) as days_eff,
         round(case when pd0 > 0 then (pd1 - pd0) * (q0 / pd0) * m0 else 0 end) as shelf,
         round(q1 * (coalesce(p1, p0) - p0)) as price
  from br
)
select
  (select ws from w where k = 0) as period_from, (select we from w where k = 0) as period_to,
  (select ws from w where k = 1) as prev_from, (select we from w where k = 1) as prev_to,
  (select days from w where k = 0) as days, (select open_days from w where k = 0) as open_days,
  (select days from w where k = 1) as prev_days, (select open_days from w where k = 1) as prev_open_days,
  c.today, c.first_day, c.tax_bp as tax_rate_bp,
  (select jsonb_object_agg(metric, jsonb_build_object('now', now, 'prev', prev, 'usual', usual, 'usual_n', usual_n)) from agg) as kpis,
  (select case when q0 > 0 then jsonb_build_object(
      'days_cents',     days_eff,
      'shelf_cents',    shelf - days_eff,
      'demand_cents',   vol - shelf,
      'price_cents',    price,
      'cost_cents',     dnp - (vol + price - dopex + ddiffs - dtax),
      'expenses_cents', -dopex,
      'counts_cents',   ddiffs,
      'tax_cents',      -dtax,
      'total_cents',    dnp) end
   from br2) as bridge,
  (select coalesce(jsonb_object_agg(category, cents), '{}'::jsonb) from (
     select e.category, sum(e.amount_cents) as cents from public.expenses e, w
     where w.k = 0 and e.category <> 'tax' and e.spent_on between w.ws and w.we group by e.category) x) as opex_by_category,
  (select round(net * 0.03)::bigint from d where k = 0) as tax_at_3pct_cents
from c;
rollback;

-- =====================================================================================================================
-- Q2  STOCK AND PRODUCTS                        views: Stock and ordering, Products, Bottom line  placeholders: all four
-- Question: was the shelf full, what did empty shelves cost, and which products sell fastest?
-- kpis: empty_days (the whole shop had nothing to sell), stock_days, products_on_shelf_avg, products_on_shelf_max,
--       product_days, pieces, pace_on_stock_days, missed_empty_cents (empty days x pace on days with stock, last 90
--       days x landed margin per piece, last 90 days: a floor, "at least")
-- Also: history_90d (the rates used), now_state (pieces and products on the shelf now, empty since, Not selling
--       count and cost tied up, New products), mix (Pareto by speed), lines (speed by product line), products (ranked,
--       pace shrunk toward the line over 7 shelf-days so a few hours on the shelf cannot top the list), daily (products
--       on the shelf, empty hours and pieces sold per day of this period, for the shelf chart).
-- =====================================================================================================================
begin read only;
with
p as (select date '{{from}}' as f, date '{{to}}' as t, date '{{prev_from}}' as pf, date '{{prev_to}}' as pt),
c as (
  select (now() at time zone 'Asia/Manila')::date as today,
         least((select min(business_date) from public.sales),
               (select min((created_at at time zone 'Asia/Manila')::date) from public.stock_movements)) as first_day,
         (select min(created_at) from public.stock_movements) as first_at,
         now() - interval '90 days' as h_at
),
w as (
  select x.k, x.ws, x.we,
         x.k >= 1 and x.ws >= c.first_day as in_usual,
         least(x.we, c.today) - x.ws + 1 as days,
         greatest(0, least(x.we, c.today) - greatest(x.ws, c.first_day) + 1) as open_days,
         x.ws::timestamp at time zone 'Asia/Manila' as ws_at,
         least((x.we + 1)::timestamp at time zone 'Asia/Manila', now()) as we_at
  from c, (
    select g.k,
           case when g.k = 0 then p.f when g.k = 1 then p.pf
                else (p.f - g.k * age(p.f, p.pf))::date end as ws,
           case when g.k = 0 then p.t
                when g.k = 1 then case when c.first_day > p.pf then p.f - 1 else p.pt end
                when p.t = (p.f + age(p.f, p.pf))::date - 1 then (p.f - (g.k - 1) * age(p.f, p.pf))::date - 1
                else least((p.f - (g.k - 1) * age(p.f, p.pf))::date - 1,
                           (p.f - g.k * age(p.f, p.pf))::date + (p.t - p.f)) end as we
    from p cross join c cross join generate_series(0, 8) as g(k)
  ) x
),
mv as (
  select m.product_id, m.id, m.created_at, m.delta,
         sum(m.delta) over (partition by m.product_id order by m.created_at, m.id) as lvl
  from public.stock_movements m
),
lv as (
  select product_id, created_at as t1,
         coalesce(lead(created_at) over (partition by product_id order by created_at, id), now()) as t2, lvl
  from mv
),
sh as (
  select created_at as t1, coalesce(lead(created_at) over (order by created_at, id), now()) as t2,
         sum((lvl > 0)::int - (lvl - delta > 0)::int) over (order by created_at, id) as n
  from mv
),
arr as (
  select m.product_id, m.batch_id, m.delta as qty, coalesce(m.unit_cost_cents, 0) as uc,
         sum(m.delta) over q - m.delta as lo, sum(m.delta) over q as hi
  from public.stock_movements m
  where m.kind in ('opening', 'restock') and m.delta > 0
  window q as (partition by m.product_id order by m.created_at, m.id)
),
fee as (
  select b.id as batch_id, (b.shipping_cents + b.tax_cents + b.mooe_cents + b.other_cents)::numeric / sum(a.qty) as pp
  from public.stock_batches b join arr a on a.batch_id = b.id
  group by b.id
),
lines as (
  select i.product_id, s.created_at, s.business_date, i.quantity,
         i.line_total_cents::numeric * s.total_cents / nullif(s.subtotal_cents, 0) as net,
         sum(i.quantity) over q - i.quantity as lo, sum(i.quantity) over q as hi
  from public.sale_items i join public.sales s on s.id = i.sale_id
  where s.status = 'completed' and i.product_id is not null
  window q as (partition by i.product_id order by s.created_at, i.id)
),
landed as (
  select l.created_at, sum((least(a.hi, l.hi) - greatest(a.lo, l.lo)) * (a.uc + coalesce(f.pp, 0))) as cents
  from lines l
  join arr a on a.product_id = l.product_id and l.lo < a.hi and l.hi > a.lo
  left join fee f on f.batch_id = a.batch_id
  group by l.created_at, l.product_id, l.lo
),
hist as (
  select (select coalesce(sum(quantity), 0) from lines where created_at >= c.h_at) as pcs,
         (select coalesce(sum(net), 0) from lines where created_at >= c.h_at)
           - (select coalesce(sum(cents), 0) from landed where created_at >= c.h_at) as gp,
         (select coalesce(sum(extract(epoch from least(t2, now()) - greatest(t1, c.h_at))), 0) / 86400.0
            from sh where n > 0 and t2 > c.h_at) as stock_days,
         (select coalesce(sum(extract(epoch from least(t2, now()) - greatest(t1, c.h_at))), 0) / 86400.0
            from lv where lvl > 0 and t2 > c.h_at) as product_days
  from c
),
rates as (
  select pcs, stock_days, product_days,
         pcs / nullif(stock_days, 0) as pace,
         gp / nullif(pcs, 0) as margin_pp,
         pcs / nullif(product_days, 0) as ppd
  from hist
),
m as (
  select w.k, w.in_usual, w.open_days,
         e.empty_days, e.stock_days, e.max_n, pd.product_days,
         (select coalesce(sum(quantity), 0) from lines l where l.business_date between w.ws and w.we) as pieces
  from w
  cross join lateral (
    select coalesce(sum(extract(epoch from least(sh.t2, w.we_at) - greatest(sh.t1, w.ws_at))) filter (where sh.n = 0), 0) / 86400.0 as empty_days,
           coalesce(sum(extract(epoch from least(sh.t2, w.we_at) - greatest(sh.t1, w.ws_at))) filter (where sh.n > 0), 0) / 86400.0 as stock_days,
           coalesce(max(sh.n), 0) as max_n
    from sh where sh.t2 > w.ws_at and sh.t1 < w.we_at) e
  cross join lateral (
    select coalesce(sum(extract(epoch from least(lv.t2, w.we_at) - greatest(lv.t1, w.ws_at))), 0) / 86400.0 as product_days
    from lv where lv.lvl > 0 and lv.t2 > w.ws_at and lv.t1 < w.we_at) pd
),
long as (
  select m.k, m.in_usual, v.metric, v.val
  from m cross join rates r cross join lateral (values
    ('empty_days',              round(m.empty_days, 2)),
    ('stock_days',              round(m.stock_days, 2)),
    ('products_on_shelf_avg',   round(m.product_days / nullif(m.empty_days + m.stock_days, 0), 1)),
    ('products_on_shelf_max',   m.max_n::numeric),
    ('product_days',            round(m.product_days, 2)),
    ('pieces',                  m.pieces::numeric),
    ('pace_on_stock_days',      round(m.pieces / nullif(m.stock_days, 0), 2)),
    ('missed_empty_cents',      round(m.empty_days * coalesce(r.pace, 0) * coalesce(r.margin_pp, 0)))
  ) as v(metric, val)
),
agg as (
  select metric,
         max(val) filter (where k = 0) as now,
         max(val) filter (where k = 1) as prev,
         case when count(val) filter (where in_usual) >= 3
              then round((percentile_cont(0.5) within group (order by val) filter (where in_usual))::numeric, 2) end as usual,
         count(val) filter (where in_usual) as usual_n
  from long group by metric
),
cur as (select * from w where k = 0),
prod as (
  select pr.id, pr.brand, pr.name, pr.variant, cat.name as line, pr.price_cents, pc.cost_cents, pr.on_hand,
         coalesce((select sum(l.qty) from public.batch_order_lines l join public.stock_batches b on b.id = l.batch_id
                    where b.received_on is null and l.product_id = pr.id), 0) as on_order,
         exists (select 1 from public.stock_movements x where x.product_id = pr.id and x.delta > 0
                   and x.kind in ('opening', 'restock')) as stocked,
         (select max(l.created_at) from lines l where l.product_id = pr.id) as last_sold_at,
         (select max(x.created_at) from public.stock_movements x where x.product_id = pr.id and x.delta > 0
                   and x.kind in ('opening', 'restock')) as last_in_at,
         (select coalesce(sum(l.quantity), 0) from lines l, cur where l.product_id = pr.id
                   and l.business_date between cur.ws and cur.we) as pieces,
         (select coalesce(sum(extract(epoch from least(lv.t2, cur.we_at) - greatest(lv.t1, cur.ws_at))), 0) / 86400.0
            from lv, cur where lv.product_id = pr.id and lv.lvl > 0 and lv.t2 > cur.ws_at and lv.t1 < cur.we_at) as product_days
  from public.products pr
  left join public.categories cat on cat.id = pr.category_id
  left join public.product_costs pc on pc.product_id = pr.id
  where pr.active
),
lrate as (select line, sum(pieces) / nullif(sum(product_days), 0) as ppd from prod group by line),
srate as (select sum(pieces) / nullif(sum(product_days), 0) as ppd from prod),
prod2 as (
  select prod.*,
         (pieces + 7 * coalesce(lr.ppd, sr.ppd, 0)) / (product_days + 7) as pace,
         round((pieces + 7 * coalesce(lr.ppd, sr.ppd, 0)) / (product_days + 7) * price_cents / 100.0, 2) as value_pace,
         case when on_hand > 0
                   and extract(epoch from now() - greatest(last_sold_at, last_in_at)) / 86400.0
                       >= least(60, greatest(14, 3 / nullif((select ppd from rates), 0)))
              then true else false end as not_selling
  from prod
  left join lrate lr on lr.line is not distinct from prod.line
  cross join srate sr
),
ranked as (
  select prod2.*,
         (sum(value_pace) over (order by value_pace desc range between unbounded preceding and current row)
            - sum(value_pace) over (partition by value_pace)) / nullif(sum(value_pace) over (), 0) as share_ahead,
         row_number() over (order by value_pace desc, pieces desc, id) as rn,
         count(*) over () as n_ranked
  from prod2 where product_days > 0
),
mix as (
  select count(*) as ranked,
         count(*) filter (where share_ahead < 0.8 and value_pace > 0) as products_80,
         round(100.0 * sum(value_pace) filter (where rn <= ceil(0.2 * n_ranked)) / nullif(sum(value_pace), 0), 1) as top20_share_pct,
         ceil(0.2 * max(n_ranked))::int as top20_count,
         round(max(pace), 2) as fastest_pace,
         round(min(pace) filter (where pieces > 0), 2) as slowest_selling_pace,
         count(*) filter (where pieces = 0) as no_sale_count
  from ranked
),
bylines as (
  select coalesce(line, 'No category') as line, count(*) as products, sum(pieces) as pieces,
         round(sum(product_days), 1) as product_days,
         round(sum(pieces) / nullif(sum(product_days), 0), 3) as pieces_per_product_day,
         round(sum(pieces * price_cents) / nullif(sum(product_days), 0)) as net_per_product_day_cents
  from prod2 where product_days > 0 or pieces > 0
  group by 1
)
select
  (select ws from w where k = 0) as period_from, (select we from w where k = 0) as period_to,
  (select ws from w where k = 1) as prev_from, (select we from w where k = 1) as prev_to,
  (select open_days from w where k = 0) as open_days, (select open_days from w where k = 1) as prev_open_days,
  (select jsonb_object_agg(metric, jsonb_build_object('now', now, 'prev', prev, 'usual', usual, 'usual_n', usual_n)) from agg) as kpis,
  (select jsonb_build_object('pace_per_stock_day', round(pace, 2), 'margin_per_piece_cents', round(margin_pp),
                             'pieces', pcs, 'stock_days', round(stock_days, 2),
                             'pieces_per_product_day', round(ppd, 3),
                             'not_selling_after_days', round(least(60, greatest(14, 3 / nullif(ppd, 0))), 1)) from rates) as history_90d,
  (select jsonb_build_object('on_hand_pieces', coalesce(sum(on_hand) filter (where on_hand > 0), 0),
                             'products_on_shelf', count(*) filter (where on_hand > 0),
                             'empty_since', (select max(t1) from sh where t2 >= now() and n = 0),
                             'not_selling_count', count(*) filter (where not_selling),
                             'not_selling_tied_up_cents', coalesce(sum(on_hand * coalesce(cost_cents, 0)) filter (where not_selling), 0),
                             'new_count', count(*) filter (where not stocked),
                             'new_on_order_pieces', coalesce(sum(on_order) filter (where not stocked), 0))
     from prod2) as now_state,
  (select to_jsonb(mix) from mix) as mix,
  (select coalesce(jsonb_agg(to_jsonb(bylines) order by pieces_per_product_day desc nulls last), '[]'::jsonb) from bylines) as lines,
  (select coalesce(jsonb_agg(jsonb_build_object(
            'brand', brand, 'name', name, 'variant', variant, 'line', line, 'price_cents', price_cents,
            'cost_cents', cost_cents, 'pieces', pieces, 'product_days', round(product_days, 2),
            'pace_per_day', round(pace, 3), 'value_pace_cents_per_day', round(value_pace * 100),
            'share_ahead_pct', round(100 * share_ahead, 1),
            'abc', case when value_pace <= 0 then 'C' when share_ahead < 0.8 then 'A' when share_ahead < 0.95 then 'B' else 'C' end,
            'on_hand', on_hand, 'not_selling', not_selling,
            'tied_up_cents', case when not_selling then on_hand * coalesce(cost_cents, 0) else 0 end)
          order by rn), '[]'::jsonb) from ranked) as products,
  (select coalesce(jsonb_agg(jsonb_build_object('d', dd.d, 'products_avg', round(dd.pdays, 2),
                                                'empty_hours', round(dd.empty * 24, 1), 'pieces', dd.pcs) order by dd.d), '[]'::jsonb)
     from (select g.d::date as d,
                  (select coalesce(sum(extract(epoch from least(lv.t2, e.d1) - greatest(lv.t1, e.d0))), 0) / 86400.0
                     from lv where lv.lvl > 0 and lv.t2 > e.d0 and lv.t1 < e.d1)
                    / nullif(extract(epoch from e.d1 - e.d0) / 86400.0, 0) as pdays,
                  (select coalesce(sum(extract(epoch from least(sh.t2, e.d1) - greatest(sh.t1, e.d0))), 0) / 86400.0
                     from sh where sh.n = 0 and sh.t2 > e.d0 and sh.t1 < e.d1) as empty,
                  (select coalesce(sum(quantity), 0) from lines l where l.business_date = g.d::date) as pcs
           from cur, c, generate_series(greatest(cur.ws, c.first_day), least(cur.we, c.today), interval '1 day') as g(d)
           cross join lateral (select greatest(g.d::timestamp at time zone 'Asia/Manila', c.first_at) as d0,
                                      least((g.d::date + 1)::timestamp at time zone 'Asia/Manila', now()) as d1) e) dd) as daily
;
rollback;

-- =====================================================================================================================
-- Q3  COLLECTIONS                               views: Collections, Bottom line                placeholders: all four
-- Question: who owes us, is it getting later, and is credit tying up cash?
-- kpis: credit_share_pct, credit_sales_cents, paid_at_till_cents, collected_later_cents, days_to_collect_median,
--       credit_sales_paid_off, owed_end_cents, late_end_cents, very_late_end_cents, open_sales_end, buyers_owing_end,
--       largest_buyer_share_pct, dso_days
-- Also: thresholds (Usual / Late / Very late from the shop's own payments, planning design method 9; 7 / 7 / 30 days
--       until 10 Not paid yet sales are paid in full), aging_end (the three buckets at the end of this period).
-- =====================================================================================================================
begin read only;
with
p as (select date '{{from}}' as f, date '{{to}}' as t, date '{{prev_from}}' as pf, date '{{prev_to}}' as pt),
c as (
  select (now() at time zone 'Asia/Manila')::date as today,
         least((select min(business_date) from public.sales),
               (select min((created_at at time zone 'Asia/Manila')::date) from public.stock_movements)) as first_day
),
w as (
  select x.k, x.ws, x.we, least(x.we, c.today) as e,
         x.k >= 1 and x.ws >= c.first_day as in_usual,
         greatest(0, least(x.we, c.today) - greatest(x.ws, c.first_day) + 1) as open_days
  from c, (
    select g.k,
           case when g.k = 0 then p.f when g.k = 1 then p.pf
                else (p.f - g.k * age(p.f, p.pf))::date end as ws,
           case when g.k = 0 then p.t
                when g.k = 1 then case when c.first_day > p.pf then p.f - 1 else p.pt end
                when p.t = (p.f + age(p.f, p.pf))::date - 1 then (p.f - (g.k - 1) * age(p.f, p.pf))::date - 1
                else least((p.f - (g.k - 1) * age(p.f, p.pf))::date - 1,
                           (p.f - g.k * age(p.f, p.pf))::date + (p.t - p.f)) end as we
    from p cross join c cross join generate_series(0, 8) as g(k)
  ) x
),
-- Completed sales. The buyer's name is read only inside counts below; no name leaves the database.
cs as (
  select s.id, s.business_date as d, s.total_cents as total, s.balance_cents as bal,
         s.payment_method::text = 'unpaid' as credit,
         s.total_cents - s.balance_cents - coalesce(pp.paid, 0) as till,
         pp.paid, pp.last_paid, lower(btrim(coalesce(s.customer_name, ''))) as who
  from public.sales s
  left join (select sale_id, sum(amount_cents) as paid, max(business_date) as last_paid
               from public.sale_payments group by sale_id) pp on pp.sale_id = s.id
  where s.status = 'completed'
),
pay as (
  select sp.sale_id, sp.business_date as d, sp.amount_cents as cents
  from public.sale_payments sp join public.sales s on s.id = sp.sale_id
  where s.status = 'completed'
),
-- How long buyers take to pay, from Not paid yet sales paid in full in the last 180 days (planning design, method 9).
paid as (
  select cs.last_paid - cs.d as days from cs, c
  where cs.credit and cs.bal = 0 and cs.paid is not null and cs.d >= c.today - 180
),
med as (select percentile_disc(0.5) within group (order by days) as med, count(*) as n from paid),
vals as (
  select days from paid
  union all
  select c.today - cs.d from cs, c, med
  where cs.credit and cs.bal > 0 and cs.d >= c.today - 180 and c.today - cs.d > med.med
),
th as (
  select med.n as paid_count, (select count(*) from vals) as value_count, med.n < 10 as guess,
         case when med.n >= 10 then (select percentile_disc(0.5) within group (order by days) from vals) else 7 end as usual_days,
         case when med.n >= 10 then (select percentile_disc(0.8) within group (order by days) from vals) else 7 end as late_after,
         case when med.n >= 10 then greatest((select percentile_disc(0.95) within group (order by days) from vals),
                                             (select percentile_disc(0.8) within group (order by days) from vals) + 7)
              else 30 end as very_late_after
  from med
),
-- What each sale still owed at the end of each window (its balance plus payments made after that day).
owed as (
  select w.k, cs.id, cs.who, w.e - cs.d as age,
         cs.bal + coalesce((select sum(pay.cents) from pay where pay.sale_id = cs.id and pay.d > w.e), 0) as cents
  from w join cs on cs.d <= w.e and (cs.bal > 0 or cs.last_paid > w.e)
),
-- Receivables at the end of each day since opening: credit given minus what was collected, as running sums.
daily as (
  select g.d::date as d,
         sum(coalesce(cr.cents, 0) - coalesce(co.cents, 0)) over (order by g.d) as owed
  from c cross join lateral generate_series(c.first_day, c.today, interval '1 day') as g(d)
  left join (select cs.d, sum(cs.total - cs.till) as cents from cs group by cs.d) cr on cr.d = g.d::date
  left join (select pay.d, sum(pay.cents) as cents from pay group by pay.d) co on co.d = g.d::date
),
m as (
  select w.k, w.in_usual, w.open_days,
         (select coalesce(sum(total), 0) from cs where cs.d between w.ws and w.we) as net,
         (select coalesce(sum(total), 0) from cs where cs.credit and cs.d between w.ws and w.we) as credit,
         (select coalesce(sum(till), 0) from cs where cs.d between w.ws and w.we) as till,
         (select coalesce(sum(cents), 0) from pay where pay.d between w.ws and w.we) as later,
         (select percentile_cont(0.5) within group (order by cs.last_paid - cs.d) from cs
           where cs.credit and cs.bal = 0 and cs.last_paid between w.ws and w.we) as days_to_collect,
         (select count(*) from cs where cs.credit and cs.bal = 0 and cs.last_paid between w.ws and w.we) as paid_off,
         (select coalesce(sum(cents), 0) from owed o where o.k = w.k) as owed_end,
         (select coalesce(sum(cents), 0) from owed o, th where o.k = w.k and o.age > th.late_after and o.age <= th.very_late_after) as late_end,
         (select coalesce(sum(cents), 0) from owed o, th where o.k = w.k and o.age > th.very_late_after) as very_late_end,
         (select count(*) from owed o where o.k = w.k and o.cents > 0) as open_sales_end,
         (select count(distinct o.who) from owed o where o.k = w.k and o.cents > 0) as buyers_owing_end,
         (select max(b.cents) from (select o.who, sum(o.cents) as cents from owed o where o.k = w.k and o.cents > 0
                                     group by o.who) b) as largest_buyer_cents,
         (select avg(daily.owed) from daily where daily.d between w.ws and w.e) as owed_avg
  from w
),
long as (
  select m.k, m.in_usual, v.metric, v.val
  from m cross join lateral (values
    ('credit_share_pct',        round(100.0 * m.credit / nullif(m.net, 0), 1)),
    ('credit_sales_cents',      m.credit::numeric),
    ('paid_at_till_cents',      m.till::numeric),
    ('collected_later_cents',   m.later::numeric),
    ('days_to_collect_median',  round(m.days_to_collect::numeric, 1)),
    ('credit_sales_paid_off',   m.paid_off::numeric),
    ('owed_end_cents',          m.owed_end::numeric),
    ('late_end_cents',          m.late_end::numeric),
    ('very_late_end_cents',     m.very_late_end::numeric),
    ('open_sales_end',          m.open_sales_end::numeric),
    ('buyers_owing_end',        m.buyers_owing_end::numeric),
    ('largest_buyer_share_pct', round(100.0 * m.largest_buyer_cents / nullif(m.owed_end, 0), 1)),
    ('dso_days',                round(m.owed_avg / nullif(m.net::numeric / nullif(m.open_days, 0), 0), 1))
  ) as v(metric, val)
),
agg as (
  select metric,
         max(val) filter (where k = 0) as now,
         max(val) filter (where k = 1) as prev,
         case when count(val) filter (where in_usual) >= 3
              then round((percentile_cont(0.5) within group (order by val) filter (where in_usual))::numeric, 2) end as usual,
         count(val) filter (where in_usual) as usual_n
  from long group by metric
)
select
  (select ws from w where k = 0) as period_from, (select we from w where k = 0) as period_to,
  (select ws from w where k = 1) as prev_from, (select we from w where k = 1) as prev_to,
  (select open_days from w where k = 0) as open_days, (select open_days from w where k = 1) as prev_open_days,
  (select jsonb_object_agg(metric, jsonb_build_object('now', now, 'prev', prev, 'usual', usual, 'usual_n', usual_n)) from agg) as kpis,
  (select to_jsonb(th) from th) as thresholds,
  (select jsonb_build_object(
      'usual_cents',     coalesce(sum(cents) filter (where age <= th.late_after), 0),
      'late_cents',      coalesce(sum(cents) filter (where age > th.late_after and age <= th.very_late_after), 0),
      'very_late_cents', coalesce(sum(cents) filter (where age > th.very_late_after), 0),
      'usual_sales',     count(*) filter (where age <= th.late_after),
      'late_sales',      count(*) filter (where age > th.late_after and age <= th.very_late_after),
      'very_late_sales', count(*) filter (where age > th.very_late_after),
      'oldest_days',     max(age))
     from owed, th where owed.k = 0 and owed.cents > 0) as aging_end
;
rollback;

-- =====================================================================================================================
-- Q4  CASH AND PAYOUTS                          views: Cash and payouts, Bottom line           placeholders: all four
-- Question: how much cash is there, where did it go, and what could be paid out safely?
-- kpis: cash_end_cents, cash_start_cents, receipts_cents, stock_paid_cents, expenses_paid_cents, taxes_paid_cents,
--       cash_from_operations_cents, distributed_cents, distributed_owner_cents, distributed_manager_cents,
--       capital_in_cents, owner_paid_stock_cents, net_cash_flow_cents, net_profit_cents, payout_ratio_to_date_pct,
--       safe_to_distribute_end_cents, spare_cash_end_cents, inventory_reserve_end_cents, owner_capital_end_cents,
--       profit_kept_end_cents, receivables_end_cents, inventory_end_cents, on_the_way_end_cents,
--       owed_to_suppliers_end_cents, tax_payable_end_cents, balance_check_cents (must be 0)
-- Also: reserve_question_open (an order paid by the company fund was recorded after the last reserve decision).
-- The reserve at a past date uses today's batch costs and payments (as funds_summary does); exact for "now".
-- =====================================================================================================================
begin read only;
with
p as (select date '{{from}}' as f, date '{{to}}' as t, date '{{prev_from}}' as pf, date '{{prev_to}}' as pt),
c as (
  select (now() at time zone 'Asia/Manila')::date as today,
         least((select min(business_date) from public.sales),
               (select min((created_at at time zone 'Asia/Manila')::date) from public.stock_movements)) as first_day,
         coalesce((select tax_rate_bp from public.settings where id = 1), 0) as tax_bp
),
w as (
  select x.k, x.ws, x.we, least(x.we, c.today) as e,
         least((least(x.we, c.today) + 1)::timestamp at time zone 'Asia/Manila', now()) as e_at,
         x.k >= 1 and x.ws >= c.first_day as in_usual,
         greatest(0, least(x.we, c.today) - greatest(x.ws, c.first_day) + 1) as open_days
  from c, (
    select g.k,
           case when g.k = 0 then p.f when g.k = 1 then p.pf
                else (p.f - g.k * age(p.f, p.pf))::date end as ws,
           case when g.k = 0 then p.t
                when g.k = 1 then case when c.first_day > p.pf then p.f - 1 else p.pt end
                when p.t = (p.f + age(p.f, p.pf))::date - 1 then (p.f - (g.k - 1) * age(p.f, p.pf))::date - 1
                else least((p.f - (g.k - 1) * age(p.f, p.pf))::date - 1,
                           (p.f - g.k * age(p.f, p.pf))::date + (p.t - p.f)) end as we
    from p cross join c cross join generate_series(0, 8) as g(k)
  ) x
),
-- Landed cost of goods sold and count differences per day (as Q1).
arr as (
  select m.product_id, m.batch_id, m.delta as qty, coalesce(m.unit_cost_cents, 0) as uc,
         m.unit_cost_cents, (m.created_at at time zone 'Asia/Manila')::date as d,
         sum(m.delta) over q - m.delta as lo, sum(m.delta) over q as hi
  from public.stock_movements m
  where m.kind in ('opening', 'restock') and m.delta > 0
  window q as (partition by m.product_id order by m.created_at, m.id)
),
fee as (
  select b.id as batch_id, (b.shipping_cents + b.tax_cents + b.mooe_cents + b.other_cents)::numeric / sum(a.qty) as pp
  from public.stock_batches b join arr a on a.batch_id = b.id
  group by b.id
),
sold as (
  select i.product_id, s.created_at, sum(i.quantity) over q - i.quantity as lo, sum(i.quantity) over q as hi
  from public.sale_items i join public.sales s on s.id = i.sale_id
  where s.status = 'completed' and i.product_id is not null
  window q as (partition by i.product_id order by s.created_at, i.id)
),
cogs as (
  select (s.created_at at time zone 'Asia/Manila')::date as d,
         sum((least(a.hi, s.hi) - greatest(a.lo, s.lo)) * (a.uc + coalesce(f.pp, 0))) as cents
  from sold s
  join arr a on a.product_id = s.product_id and s.lo < a.hi and s.hi > a.lo
  left join fee f on f.batch_id = a.batch_id
  group by 1
),
diffs as (
  select (m.created_at at time zone 'Asia/Manila')::date as d,
         sum(m.delta * (coalesce(
               (select avg(a.uc) from arr a where a.batch_id is not distinct from m.batch_id and a.product_id = m.product_id),
               (select a2.uc from arr a2 where a2.product_id = m.product_id order by a2.hi desc limit 1), 0)
             + coalesce((select f.pp from fee f where f.batch_id = m.batch_id), 0))) as cents
  from public.stock_movements m
  where m.kind in ('count', 'waste')
  group by 1
),
-- Money in and out, per day.
sales as (
  select s.id, s.business_date as d, s.total_cents as total,
         s.total_cents - s.balance_cents - coalesce((select sum(sp.amount_cents) from public.sale_payments sp where sp.sale_id = s.id), 0) as till
  from public.sales s where s.status = 'completed'
),
receipts as (
  select d, till as cents from sales
  union all
  select sp.business_date, sp.amount_cents from public.sale_payments sp join public.sales s on s.id = sp.sale_id
  where s.status = 'completed'
),
-- Each batch's cost in full and its order and arrival days (as public.batch_money()).
bm as (
  select b.id, b.created_at,
         least(coalesce(b.ordered_on, b.received_on), g.first_in, py.first_paid) as ordered_day,
         case when b.received_on is not null then least(b.received_on, g.first_in) end as arrived_day,
         coalesce(g.goods, 0) + b.shipping_cents + b.tax_cents + b.mooe_cents + b.other_cents as cost,
         coalesce(py.owners, 0) as paid_owners_all
  from public.stock_batches b
  left join lateral (
    select sum(x.qty::bigint * coalesce(x.uc, 0)) as goods, min(x.d) as first_in
    from (select m.delta as qty, m.unit_cost_cents as uc, (m.created_at at time zone 'Asia/Manila')::date as d
            from public.stock_movements m
           where b.received_on is not null and m.batch_id = b.id and m.kind in ('opening', 'restock') and m.delta > 0
          union all
          select l.qty, l.unit_cost_cents, null::date
            from public.batch_order_lines l
           where b.received_on is null and l.batch_id = b.id) x) g on true
  left join lateral (
    select sum(y.amount_cents) filter (where y.source in ('owner', 'investment')) as owners, min(y.paid_on) as first_paid
    from public.batch_payments y where y.batch_id = b.id) py on true
),
-- The balance at the end of each window, built as public.finance_totals / finance_derive / finance_now do.
bal as (
  select w.k, w.e, w.ws,
         (select coalesce(sum(total), 0) from sales where d <= w.e) as net,
         (select coalesce(sum(cents), 0) from receipts where d <= w.e) as collected,
         round((select coalesce(sum(cents), 0) from cogs where d <= w.e)) as cogs,
         round((select coalesce(sum(cents), 0) from diffs where d <= w.e)) as diffs,
         (select coalesce(sum(qty::bigint * uc), 0) from arr where batch_id is null and d <= w.e) as loose,
         (select coalesce(sum(cost), 0) from bm where ordered_day <= w.e) as ordered,
         (select coalesce(sum(cost), 0) from bm where arrived_day <= w.e) as arrived,
         (select coalesce(sum(greatest(0, (case when bm.ordered_day <= w.e then bm.cost else 0 end)
                   - coalesce((select sum(y.amount_cents) from public.batch_payments y
                                where y.batch_id = bm.id and y.paid_on <= w.e), 0))), 0) from bm) as suppliers_owed,
         (select coalesce(sum(amount_cents), 0) from public.batch_payments where source = 'company' and paid_on <= w.e) as paid_company,
         (select coalesce(sum(amount_cents), 0) from public.batch_payments where source <> 'company' and paid_on <= w.e) as paid_owners,
         (select coalesce(sum(amount_cents), 0) from public.expenses where category <> 'tax' and spent_on <= w.e) as opex,
         (select coalesce(sum(amount_cents), 0) from public.expenses where category = 'tax' and spent_on <= w.e) as tax_paid,
         (select coalesce(sum(amount_cents), 0) from public.capital_contributions where put_in_on <= w.e) as capital_cash,
         (select coalesce(sum(amount_cents), 0) from public.fund_releases where released_on <= w.e) as dist,
         -- The inventory reserve as it stood then: the latest decision, less what company-paid orders since then used.
         (select greatest(0, coalesce(sa.amount_cents, 0) - coalesce((
                    select sum(bm.cost - bm.paid_owners_all) from bm
                     where bm.cost - bm.paid_owners_all > 0 and bm.created_at > sa.created_at and bm.created_at < w.e_at), 0))
            from (select fsa.amount_cents, fsa.created_at from public.fund_set_asides fsa
                   where fsa.created_at < w.e_at order by fsa.created_at desc limit 1) sa) as kept,
         (select count(*) > 0 from bm
           where bm.cost - bm.paid_owners_all > 0 and bm.created_at < w.e_at
             and bm.created_at > coalesce((select max(fsa.created_at) from public.fund_set_asides fsa where fsa.created_at < w.e_at), '-infinity')) as reserve_question_open,
         c.tax_bp
  from w cross join c
),
bal2 as (
  select bal.*,
         round(net * tax_bp / 10000.0) as tax,
         capital_cash + collected - paid_company - loose - opex - tax_paid - dist as cash,
         net - collected as receivables,
         arrived + loose - cogs + diffs as inventory,
         ordered - arrived as on_the_way,
         ordered - paid_company - paid_owners as owed_net,
         capital_cash + paid_owners as capital
  from bal
),
bal3 as (
  select bal2.*,
         tax - tax_paid as tax_payable,
         net - cogs + diffs - opex - tax - dist as retained,
         cash - greatest(0, tax - tax_paid) - suppliers_owed - coalesce(kept, 0) as spare
  from bal2
),
-- Flows inside each window.
fl as (
  select w.k, w.in_usual, w.open_days,
         (select coalesce(sum(cents), 0) from receipts where d between w.ws and w.e) as receipts,
         (select coalesce(sum(amount_cents), 0) from public.batch_payments where source = 'company' and paid_on between w.ws and w.e)
           + (select coalesce(sum(qty::bigint * uc), 0) from arr where batch_id is null and d between w.ws and w.e) as stock_paid,
         (select coalesce(sum(amount_cents), 0) from public.expenses where category <> 'tax' and spent_on between w.ws and w.e) as opex_paid,
         (select coalesce(sum(amount_cents), 0) from public.expenses where category = 'tax' and spent_on between w.ws and w.e) as taxes_paid,
         (select coalesce(sum(amount_cents), 0) from public.fund_releases where released_on between w.ws and w.e) as dist,
         (select coalesce(sum(owner_cents), 0) from public.fund_releases where released_on between w.ws and w.e) as dist_owner,
         (select coalesce(sum(manager_cents), 0) from public.fund_releases where released_on between w.ws and w.e) as dist_manager,
         (select coalesce(sum(amount_cents), 0) from public.capital_contributions where put_in_on between w.ws and w.e) as capital_in,
         (select coalesce(sum(amount_cents), 0) from public.batch_payments where source <> 'company' and paid_on between w.ws and w.e) as owner_paid_stock
  from w
),
pnl as (  -- net profit inside each window: end-of-window minus start-of-window cumulative figures
  select w.k,
         (select coalesce(sum(total), 0) from sales where d between w.ws and w.e)
           - (round((select coalesce(sum(cents), 0) from cogs where d <= w.e)) - round((select coalesce(sum(cents), 0) from cogs where d < w.ws)))
           + (round((select coalesce(sum(cents), 0) from diffs where d <= w.e)) - round((select coalesce(sum(cents), 0) from diffs where d < w.ws)))
           - (select coalesce(sum(amount_cents), 0) from public.expenses where category <> 'tax' and spent_on between w.ws and w.e)
           - (round((select coalesce(sum(total), 0) from sales where d <= w.e) * c.tax_bp / 10000.0)
              - round((select coalesce(sum(total), 0) from sales where d < w.ws) * c.tax_bp / 10000.0)) as np
  from w cross join c
),
m as (
  select fl.*, b.cash, b.receivables, b.inventory, b.on_the_way, b.owed_net, b.suppliers_owed, b.capital,
         b.tax_payable, b.retained, b.spare, b.kept, b.reserve_question_open, b.dist as dist_to_date,
         greatest(0, least(b.retained, b.spare)) as safe,
         b.cash + b.receivables + b.inventory + b.on_the_way - (b.owed_net + b.tax_payable + b.capital + b.retained) as check_cents,
         b.cash - (fl.capital_in + fl.receipts - fl.stock_paid - fl.opex_paid - fl.taxes_paid - fl.dist) as cash_start,
         pnl.np
  from fl join bal3 b on b.k = fl.k join pnl on pnl.k = fl.k
),
long as (
  select m.k, m.in_usual, v.metric, v.val
  from m cross join lateral (values
    ('cash_end_cents',            m.cash::numeric),
    ('cash_start_cents',          m.cash_start::numeric),
    ('receipts_cents',            m.receipts::numeric),
    ('stock_paid_cents',          m.stock_paid::numeric),
    ('expenses_paid_cents',       m.opex_paid::numeric),
    ('taxes_paid_cents',          m.taxes_paid::numeric),
    ('cash_from_operations_cents', (m.receipts - m.stock_paid - m.opex_paid - m.taxes_paid)::numeric),
    ('distributed_cents',         m.dist::numeric),
    ('distributed_owner_cents',   m.dist_owner::numeric),
    ('distributed_manager_cents', m.dist_manager::numeric),
    ('capital_in_cents',          m.capital_in::numeric),
    ('owner_paid_stock_cents',    m.owner_paid_stock::numeric),
    ('net_cash_flow_cents',       (m.cash - m.cash_start)::numeric),
    ('net_profit_cents',          m.np::numeric),
    ('payout_ratio_to_date_pct',  round(100.0 * m.dist_to_date / nullif(m.retained + m.dist_to_date, 0), 1)),
    ('safe_to_distribute_end_cents', m.safe::numeric),
    ('spare_cash_end_cents',      m.spare::numeric),
    ('inventory_reserve_end_cents', coalesce(m.kept, 0)::numeric),
    ('owner_capital_end_cents',   m.capital::numeric),
    ('profit_kept_end_cents',     m.retained::numeric),
    ('receivables_end_cents',     m.receivables::numeric),
    ('inventory_end_cents',       m.inventory::numeric),
    ('on_the_way_end_cents',      m.on_the_way::numeric),
    ('owed_to_suppliers_end_cents', m.suppliers_owed::numeric),
    ('tax_payable_end_cents',     m.tax_payable::numeric),
    ('balance_check_cents',       m.check_cents::numeric)
  ) as v(metric, val)
),
agg as (
  select metric,
         max(val) filter (where k = 0) as now,
         max(val) filter (where k = 1) as prev,
         case when count(val) filter (where in_usual) >= 3
              then round((percentile_cont(0.5) within group (order by val) filter (where in_usual))::numeric, 2) end as usual,
         count(val) filter (where in_usual) as usual_n
  from long group by metric
)
select
  (select ws from w where k = 0) as period_from, (select we from w where k = 0) as period_to,
  (select ws from w where k = 1) as prev_from, (select we from w where k = 1) as prev_to,
  (select open_days from w where k = 0) as open_days, (select open_days from w where k = 1) as prev_open_days,
  (select jsonb_object_agg(metric, jsonb_build_object('now', now, 'prev', prev, 'usual', usual, 'usual_n', usual_n)) from agg) as kpis,
  (select reserve_question_open from m where k = 0) as reserve_question_open
;
rollback;

-- =====================================================================================================================
-- Q5  NEXT ORDER AND MONEY (NOW)                views: Stock and ordering, Cash and payouts, Bottom line
--                                                                                          placeholders: none
-- Question: when must the next order be placed, what will it cost, and will the money be there?
-- Interim, shop-level copy of the planning design v2 (methods 1, 2, 3, 5, 6 and 8); replace with plan_core() /
-- plan_params() once the planning engine is live. The next order is estimated for the whole shop, so it can differ
-- from the engine's per-product suggestion by a few pieces (26 Nov: 40 pcs here, 43 in the design's replay).
-- Returns: pace, delivery, rhythm, levels (reorder point, target, spare), stock (position, days left),
--          on_the_way [batches with due day and Late], next_order {order_by, order_now, on, pieces, goods, fees, total},
--          money {cash, tax reserve, owed to suppliers, inventory reserve, spare cash, profit kept, safe to distribute,
--          likely collected by the order day, available by then, short, hold for the next order, running costs a
--          month, suggested payout = max(0, min(safe, spare cash) - hold - a month of running costs)}.
-- =====================================================================================================================
begin read only;
with
c as (
  select (now() at time zone 'Asia/Manila')::date as today,
         least((select min(business_date) from public.sales),
               (select min((created_at at time zone 'Asia/Manila')::date) from public.stock_movements)) as first_day,
         now() - interval '90 days' as h_at,
         coalesce((select tax_rate_bp from public.settings where id = 1), 0) as tax_bp
),
-- Batches: pieces and goods (the order lines while on the way, else what came in) and restocking fees.
bt as (
  select b.id, b.batch_no, b.ordered_on, b.received_on, b.created_at,
         b.shipping_cents + b.tax_cents + b.mooe_cents + b.other_cents as fees,
         coalesce(g.pcs, 0) as pcs, coalesce(g.goods, 0) as goods
  from public.stock_batches b
  left join lateral (
    select sum(x.qty) as pcs, sum(x.qty::bigint * coalesce(x.uc, 0)) as goods
    from (select m.delta as qty, m.unit_cost_cents as uc from public.stock_movements m
           where b.received_on is not null and m.batch_id = b.id and m.kind in ('opening', 'restock') and m.delta > 0
          union all
          select l.qty, l.unit_cost_cents from public.batch_order_lines l
           where b.received_on is null and l.batch_id = b.id) x) g on true
),
-- 1. Delivery time: orders with both an order day and an arrival day, last 10 (planning design, method 1).
gaps as (
  select (received_on - ordered_on)::float8 as g from bt
  where ordered_on is not null and received_on is not null and received_on >= ordered_on
  order by received_on desc, batch_no desc limit 10
),
dl as (
  select z.n, z.max_gap, z.n = 0 as guess,
         case when z.n = 0 then 7.0 else greatest(1.0, z.a) end as l,
         case when z.n = 0 then 1.75
              else greatest(0.25, sqrt(((select coalesce(sum(power(g - z.a, 2)), 0) from gaps)
                                        + 2 * power(greatest(1.0, z.a) / 4, 2)) / (z.n + 1))) end as sd
  from (select count(*) as n, avg(g) as a, max(g) as max_gap from gaps) z
),
-- 2. Order rhythm: the last 11 order days; a batch with no order day counts back the delivery time (method 2).
od as (
  select coalesce(b.ordered_on, b.received_on - round(dl.l)::int) as day, bool_and(b.ordered_on is null) as est
  from bt b cross join dl
  group by 1 order by 1 desc limit 11
),
rh as (
  select count(*) as n, max(day) as last_day, bool_or(est) as estimated, count(*) < 2 as guess,
         case when count(*) < 2 then 14.0
              else least(60.0, greatest(7.0, (max(day) - min(day))::float8 / (count(*) - 1))) end as r,
         jsonb_agg(jsonb_build_object('on', day, 'estimated', est) order by day) as days
  from od
),
hl as (select least(56.0, greatest(21.0, 2 * r)) as h from rh),
-- 3. Shop pace on days with stock over the last 90 days, recent days weighted (half-life h) (method 3).
mv as (
  select m.product_id, m.id, m.created_at, m.delta,
         sum(m.delta) over (partition by m.product_id order by m.created_at, m.id) as lvl
  from public.stock_movements m
),
lv as (
  select product_id, created_at as t1,
         coalesce(lead(created_at) over (partition by product_id order by created_at, id), now()) as t2, lvl
  from mv
),
sh as (
  select created_at as t1, coalesce(lead(created_at) over (order by created_at, id), now()) as t2,
         sum((lvl > 0)::int - (lvl - delta > 0)::int) over (order by created_at, id) as n
  from mv
),
op as (
  select coalesce(sum(extract(epoch from least(sh.t2, now()) - greatest(sh.t1, c.h_at)) / 86400.0), 0)::float8 as open_days,
         coalesce(sum((hl.h / ln(2)) * (power(0.5, extract(epoch from now() - least(sh.t2, now()))::float8 / 86400.0 / hl.h)
                                      - power(0.5, extract(epoch from now() - greatest(sh.t1, c.h_at))::float8 / 86400.0 / hl.h))), 0) as exposure
  from sh cross join c cross join hl where sh.n > 0 and sh.t2 > c.h_at
),
sl as (
  select i.quantity as qty, s.created_at
  from public.sale_items i join public.sales s on s.id = i.sale_id cross join c
  where s.status = 'completed' and s.business_date >= c.today - 91 and s.created_at >= c.h_at
),
sp as (
  select coalesce(sum(qty), 0) as sold,
         coalesce(sum(qty * power(0.5, extract(epoch from now() - created_at)::float8 / 86400.0 / hl.h)), 0) as wsold,
         coalesce(sum(qty * qty)::float8 / nullif(sum(qty), 0), 1) as lump
  from sl cross join hl
),
lam as (
  select case when sp.sold = 0 then 0.0
              when op.open_days < 7 or sp.sold < 10
                then coalesce((select pcs from bt where received_on is not null order by received_on desc, batch_no desc limit 1), 0) / rh.r
              else sp.wsold / nullif(op.exposure, 0) end as lam,
         case when sp.sold = 0 then 'none' when op.open_days < 7 or sp.sold < 10 then 'last_batch' else 'history' end as pace_from,
         sp.sold, sp.wsold, sp.lump, op.open_days, sp.wsold < 30 or op.open_days < 14 as rough
  from sp, op, rh
),
-- 5. Shop reorder point and order-up-to target, 95% service (z = 1.645) (method 5).
pl as (
  select lam.*, dl.l, dl.sd, rh.r,
         lam.lam * dl.l + 1.645 * sqrt(dl.l * lam.lam * lam.lump + power(lam.lam * dl.sd, 2)) as rop,
         lam.lam * (dl.l + rh.r) + 1.645 * sqrt((dl.l + rh.r) * lam.lam * lam.lump + power(lam.lam * dl.sd, 2)) as target
  from lam, dl, rh
),
-- 6. Stock position of the products in the plan (stock in the last 90 days, or on order).
prod as (
  select pr.id, pr.on_hand,
         coalesce((select sum(r.qty) from public.reservations r where r.product_id = pr.id and r.status = 'active'), 0) as reserved,
         coalesce((select sum(l.qty) from public.batch_order_lines l join public.stock_batches b on b.id = l.batch_id
                    where b.received_on is null and l.product_id = pr.id), 0) as on_order,
         exists (select 1 from lv where lv.product_id = pr.id and lv.lvl > 0 and lv.t2 > c.h_at) as had_stock
  from public.products pr cross join c
  where pr.active
),
plan as (
  select prod.*, greatest(0, on_hand - reserved) + on_order as position
  from prod where had_stock or on_order > 0
),
last3 as (select id from bt order by coalesce(ordered_on, received_on) desc, batch_no desc limit 3),
bl as (
  select l.batch_id, l.product_id, sum(l.qty) as q
  from public.batch_order_lines l join bt on bt.id = l.batch_id
  where bt.received_on is null and bt.id in (select id from last3)
  group by 1, 2
  union all
  select m.batch_id, m.product_id, sum(m.delta)
  from public.stock_movements m join bt on bt.id = m.batch_id
  where bt.received_on is not null and bt.id in (select id from last3) and m.kind in ('opening', 'restock') and m.delta > 0
  group by 1, 2
),
uq as (select greatest(1, coalesce(percentile_disc(0.5) within group (order by q), 1)) as usual_qty from bl),
fz as (
  select count(*) as n, avg(fees)::float8 as fee_avg, avg(pcs)::float8 as avg_pcs,
         sum(goods)::float8 / nullif(sum(pcs), 0) as goods_pp
  from bt where id in (select id from last3)
),
otw as (
  select b.id, b.batch_no, b.ordered_on, b.pcs, b.goods + b.fees as cost,
         coalesce((select sum(y.amount_cents) from public.batch_payments y where y.batch_id = b.id), 0) as paid,
         b.ordered_on + round(dl.l)::int as due_on,
         greatest(coalesce(dl.max_gap, 0), ceil(dl.l + 2 * dl.sd))::int as late_after,
         c.today - b.ordered_on > greatest(coalesce(dl.max_gap, 0), ceil(dl.l + 2 * dl.sd)) as late,
         c.today - (b.ordered_on + round(dl.l)::int) as days_past_due
  from bt b cross join dl cross join c
  where b.received_on is null
),
pos as (
  select (select count(*) from plan) as n_plan,
         (select coalesce(sum(on_hand), 0) from public.products where active) as on_hand_total,
         (select coalesce(sum(least(plan.position,
                    greatest(uq.usual_qty, ceil(pl.target / nullif((select count(*) from plan), 0))))), 0)
            from plan cross join uq cross join pl) as position_shop
),
ob as (
  select case when pos.on_hand_total <= 0 and exists (select 1 from otw)
              then greatest(c.today, (select min(due_on) from otw)) else c.today end as start_on,
         greatest(c.today, rh.last_day + round(rh.r)::int) as next_order_on
  from pos cross join c cross join rh
),
ob2 as (
  select ob.*, case when pl.lam > 0 then ob.start_on + floor((pos.position_shop - pl.rop) / pl.lam)::int end as order_by
  from ob cross join pl cross join pos
),
nx as (
  select ob2.*, greatest(c.today, least(ob2.next_order_on, coalesce(ob2.order_by, ob2.next_order_on))) as on_day
  from ob2 cross join c
),
nq as (
  select nx.*, pos.position_shop - pl.lam * greatest(0, nx.on_day - nx.start_on) as left_shop
  from nx cross join pos cross join pl
),
nq2 as (
  select nq.*,
         case when pl.lam > 0 and (nq.left_shop <= pl.rop or nq.left_shop - pl.lam * pl.r <= pl.rop)
              then greatest(0, ceil(pl.target - greatest(0, nq.left_shop)))::int else 0 end as next_pcs
  from nq cross join pl
),
nc as (
  select nq2.*, round(nq2.next_pcs * coalesce(fz.goods_pp, 0)) as next_goods,
         case when nq2.next_pcs = 0 or fz.n = 0 then 0
              else round(fz.fee_avg * greatest(1, nq2.next_pcs / nullif(fz.avg_pcs, 0))) end as next_fees
  from nq2 cross join fz
),
-- Money now, as Finance counts it (finance_now): cash, reserves, profit kept, safe to distribute.
arr as (
  select m.product_id, m.batch_id, m.delta as qty, coalesce(m.unit_cost_cents, 0) as uc,
         (m.created_at at time zone 'Asia/Manila')::date as d,
         sum(m.delta) over q - m.delta as lo, sum(m.delta) over q as hi
  from public.stock_movements m
  where m.kind in ('opening', 'restock') and m.delta > 0
  window q as (partition by m.product_id order by m.created_at, m.id)
),
fee as (
  select b.id as batch_id, (b.shipping_cents + b.tax_cents + b.mooe_cents + b.other_cents)::numeric / sum(a.qty) as pp
  from public.stock_batches b join arr a on a.batch_id = b.id
  group by b.id
),
sold as (
  select i.product_id, s.created_at, sum(i.quantity) over q - i.quantity as lo, sum(i.quantity) over q as hi
  from public.sale_items i join public.sales s on s.id = i.sale_id
  where s.status = 'completed' and i.product_id is not null
  window q as (partition by i.product_id order by s.created_at, i.id)
),
bm as (
  select b.id, b.created_at,
         least(coalesce(b.ordered_on, b.received_on), g.first_in, py.first_paid) as ordered_day,
         coalesce(g.goods, 0) + b.shipping_cents + b.tax_cents + b.mooe_cents + b.other_cents as cost,
         coalesce(py.owners, 0) as paid_owners_all, coalesce(py.total, 0) as paid_all
  from public.stock_batches b
  left join lateral (
    select sum(x.qty::bigint * coalesce(x.uc, 0)) as goods, min(x.d) as first_in
    from (select m.delta as qty, m.unit_cost_cents as uc, (m.created_at at time zone 'Asia/Manila')::date as d
            from public.stock_movements m
           where b.received_on is not null and m.batch_id = b.id and m.kind in ('opening', 'restock') and m.delta > 0
          union all
          select l.qty, l.unit_cost_cents, null::date
            from public.batch_order_lines l
           where b.received_on is null and l.batch_id = b.id) x) g on true
  left join lateral (
    select sum(y.amount_cents) filter (where y.source in ('owner', 'investment')) as owners,
           sum(y.amount_cents) as total, min(y.paid_on) as first_paid
    from public.batch_payments y where y.batch_id = b.id) py on true
),
fin as (
  select (select coalesce(sum(total_cents), 0) from public.sales where status = 'completed' and business_date <= c.today) as net,
         (select coalesce(sum(s.total_cents - s.balance_cents
                   - coalesce((select sum(p.amount_cents) from public.sale_payments p where p.sale_id = s.id), 0)), 0)
            from public.sales s where s.status = 'completed' and s.business_date <= c.today)
           + (select coalesce(sum(p.amount_cents), 0) from public.sale_payments p join public.sales s on s.id = p.sale_id
               where s.status = 'completed' and p.business_date <= c.today) as collected,
         (select round(coalesce(sum((least(a.hi, s.hi) - greatest(a.lo, s.lo)) * (a.uc + coalesce(f.pp, 0))), 0))
            from sold s join arr a on a.product_id = s.product_id and s.lo < a.hi and s.hi > a.lo
            left join fee f on f.batch_id = a.batch_id
           where (s.created_at at time zone 'Asia/Manila')::date <= c.today) as cogs,
         (select round(coalesce(sum(m.delta * (coalesce(
               (select avg(a.uc) from arr a where a.batch_id is not distinct from m.batch_id and a.product_id = m.product_id),
               (select a2.uc from arr a2 where a2.product_id = m.product_id order by a2.hi desc limit 1), 0)
             + coalesce((select f.pp from fee f where f.batch_id = m.batch_id), 0))), 0))
            from public.stock_movements m
           where m.kind in ('count', 'waste') and (m.created_at at time zone 'Asia/Manila')::date <= c.today) as diffs,
         (select coalesce(sum(qty::bigint * uc), 0) from arr where batch_id is null and d <= c.today) as loose,
         (select coalesce(sum(amount_cents), 0) from public.batch_payments where source = 'company' and paid_on <= c.today) as paid_company,
         (select coalesce(sum(greatest(0, (case when bm.ordered_day <= c.today then bm.cost else 0 end)
                   - coalesce((select sum(y.amount_cents) from public.batch_payments y
                                where y.batch_id = bm.id and y.paid_on <= c.today), 0))), 0) from bm) as suppliers_owed,
         (select coalesce(sum(amount_cents), 0) from public.expenses where category <> 'tax' and spent_on <= c.today) as opex,
         (select coalesce(sum(amount_cents), 0) from public.expenses where category = 'tax' and spent_on <= c.today) as tax_paid,
         (select coalesce(sum(amount_cents), 0) from public.capital_contributions where put_in_on <= c.today) as capital_cash,
         (select coalesce(sum(amount_cents), 0) from public.fund_releases where released_on <= c.today) as dist,
         coalesce((select greatest(0, sa.amount_cents - coalesce((
                    select sum(bm.cost - bm.paid_owners_all) from bm
                     where bm.cost - bm.paid_owners_all > 0 and bm.created_at > sa.created_at), 0))
            from (select fsa.amount_cents, fsa.created_at from public.fund_set_asides fsa
                   order by fsa.created_at desc limit 1) sa), 0) as kept,
         c.tax_bp
  from c
),
mo as (
  select fin.*,
         round(net * tax_bp / 10000.0) - tax_paid as tax_payable,
         capital_cash + collected - paid_company - loose - opex - tax_paid - dist as cash,
         net - cogs + diffs - opex - round(net * tax_bp / 10000.0) - dist as retained
  from fin
),
mo2 as (
  select mo.*, cash - greatest(0, tax_payable) - suppliers_owed - kept as spare
  from mo
),
-- How long buyers take to pay (as Q3), for what is likely collected by the order day.
cs as (
  select s.business_date as d, s.balance_cents as bal, pp.paid, pp.last_paid
  from public.sales s
  left join (select sale_id, sum(amount_cents) as paid, max(business_date) as last_paid
               from public.sale_payments group by sale_id) pp on pp.sale_id = s.id
  where s.status = 'completed' and s.payment_method::text = 'unpaid'
),
paid as (select cs.last_paid - cs.d as days from cs, c where cs.bal = 0 and cs.paid is not null and cs.d >= c.today - 180),
med as (select percentile_disc(0.5) within group (order by days) as med, count(*) as n from paid),
vals as (
  select days from paid
  union all
  select c.today - cs.d from cs, c, med where cs.bal > 0 and cs.d >= c.today - 180 and c.today - cs.d > med.med
),
ud as (select case when med.n >= 10 then (select percentile_disc(0.5) within group (order by days) from vals) else 7 end as usual_days
       from med),
coll as (
  select greatest(c.today, coalesce(nc.order_by, nc.next_order_on)) as collect_by,
         (select coalesce(sum(s.balance_cents), 0) from public.sales s
           where s.status = 'completed' and s.balance_cents > 0
             and greatest(c.today, coalesce(nc.order_by, nc.next_order_on)) - s.business_date > ud.usual_days) as expected
  from nc cross join c cross join ud
),
run as (
  select greatest(30, least(90, c.today - c.first_day + 1)) as days, c.today - c.first_day + 1 < 60 as guess,
         round((select coalesce(sum(e.amount_cents), 0) from public.expenses e
                 where e.category <> 'tax' and e.spent_on <= c.today
                   and e.spent_on > c.today - greatest(30, least(90, c.today - c.first_day + 1))) * 30.0
               / greatest(30, least(90, c.today - c.first_day + 1))) as month_cents
  from c
),
dz as (
  select mo2.*, nc.next_goods + nc.next_fees as next_cents, coll.expected, coll.collect_by, run.month_cents,
         greatest(0, mo2.spare + mo2.kept) + coll.expected as available,
         greatest(0, nc.next_goods + nc.next_fees - mo2.kept - coll.expected) as hold
  from mo2 cross join nc cross join coll cross join run
)
select
  c.today,
  (select jsonb_build_object('pace_per_day', round(lam::numeric, 2), 'pace_per_week', round((lam * 7)::numeric, 1),
                             'pace_from', pace_from, 'rough', rough, 'sold_90d', sold,
                             'days_with_stock_90d', round(open_days::numeric, 1), 'half_life_days', round((select h from hl)::numeric))
     from lam) as pace,
  (select jsonb_build_object('days', round(l::numeric, 1), 'spread_days', round(sd::numeric, 2), 'orders', n, 'guess', guess) from dl) as delivery,
  (select jsonb_build_object('days', round(r::numeric, 1), 'order_days', n, 'guess', guess, 'estimated', estimated,
                             'last_order_on', last_day, 'days_list', days) from rh) as rhythm,
  (select jsonb_build_object('reorder_point', round(rop::numeric, 1), 'target', round(target::numeric, 1),
                             'spare', round((rop - lam * l)::numeric), 'lumpiness', round(lump::numeric, 3)) from pl) as levels,
  (select jsonb_build_object('position', position_shop, 'on_hand', on_hand_total, 'products_in_plan', n_plan,
                             'days_left', case when on_hand_total > 0 and (select lam from pl) > 0
                                               then round((on_hand_total / (select lam from pl))::numeric, 1) end) from pos) as stock,
  (select coalesce(jsonb_agg(jsonb_build_object('batch_no', batch_no, 'ordered_on', ordered_on, 'pieces', pcs,
                                                'cost_cents', cost, 'paid_cents', paid, 'due_on', due_on,
                                                'late_after_days', late_after, 'late', late, 'days_past_due', days_past_due)
                             order by ordered_on), '[]'::jsonb) from otw) as on_the_way,
  (select jsonb_build_object('start_on', start_on, 'order_by', order_by, 'order_now', order_by <= c.today,
                             'next_order_on', next_order_on, 'on', on_day, 'pieces', next_pcs,
                             'goods_cents', next_goods, 'fees_cents', next_fees, 'total_cents', next_goods + next_fees)
     from nc) as next_order,
  (select jsonb_build_object('cash_cents', cash, 'tax_reserve_cents', greatest(0, tax_payable),
                             'owed_to_suppliers_cents', suppliers_owed, 'inventory_reserve_cents', kept,
                             'spare_cash_cents', spare, 'profit_kept_cents', retained,
                             'safe_to_distribute_cents', greatest(0, least(retained, spare)),
                             'collect_by', collect_by, 'likely_collected_cents', expected,
                             'available_by_order_cents', available, 'next_order_cents', next_cents,
                             'short_cents', greatest(0, next_cents - available),
                             'hold_for_next_order_cents', hold,
                             'running_costs_month_cents', month_cents, 'running_costs_guess', (select guess from run),
                             'suggested_payout_cents', greatest(0, least(greatest(0, least(retained, spare)), spare) - hold - month_cents))
     from dz) as money
from c;
rollback;

-- =====================================================================================================================
-- Q9  MAINTENANCE CHECK (not for the dashboard)
-- Compares the dashboard's rules with the app's own internal finance functions, which the connector (database owner)
-- can call. Run after any finance migration: the figures must equal Q1 / Q3 / Q4 for the same dates.
-- 26 Nov 2026: 31 Oct net 7,680.00, net profit 3,648.80, cash 2,240.00, receivables 5,440.00;
-- 19 Nov cash 8,286.00; 22 Nov cash 9,986.00; 26 Nov net 19,800.00, net profit 8,827.00, cash 340.00, safe 340.00.
-- =====================================================================================================================
begin read only;
select v.d,
       (x ->> 'net')::numeric / 100 as net_sales, (x ->> 'cogs')::numeric / 100 as landed_cogs,
       (x ->> 'opex')::numeric / 100 as expenses, (x ->> 'net_profit')::numeric / 100 as net_profit,
       (x ->> 'cash')::numeric / 100 as cash, (x ->> 'receivables')::numeric / 100 as receivables,
       (x ->> 'inventory')::numeric / 100 as inventory, (x ->> 'on_the_way')::numeric / 100 as on_the_way,
       (x ->> 'capital')::numeric / 100 as owner_capital, (x ->> 'retained')::numeric / 100 as profit_kept,
       case when v.d = (now() at time zone 'Asia/Manila')::date
            then (public.finance_now() ->> 'safe_to_distribute')::numeric / 100 end as safe_to_distribute_now
from (values (date '{{prev_to}}'), (date '{{to}}')) as v(d)
cross join lateral (select public.finance_derive(public.finance_totals(v.d)) as x) f;
rollback;
