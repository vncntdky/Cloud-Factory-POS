# Information Architecture

Step 1 of the dashboard-design kit (requirements and information architecture) for the Cloud Factory owner
dashboard. Written 26 Nov 2026 by the strategy consultant, as a delegated task (no questions could be asked; the
assumptions are in [Decisions](#decisions) and the open points in [Open questions](#open-questions)). Every query in
`spec/kpi_queries.sql` was run read-only against the live database on the evening of 26 Nov 2026 (Manila); the values
are in [Live check](#live-check-26-nov-2026). Amounts in pesos (₱); the database stores centavos.

**Bottom line.** The dashboard should answer one question before any other: *will the shelf stay full, and will the
money be there to fill it?* The fact base shows supply, not demand, limits this shop. Empty shelves are the largest
profit lever. Credit (73% of sales, a median of 9 days to collect) and the timing of payouts decide whether the next
order can be paid. So the design has six views (Bottom line, Profit, Stock and ordering, Products, Collections, Cash
and payouts), with 6 or 7 primary KPIs each, every one compared with the previous period and, where history allows,
with "usual". It needs five read-only calls. On 26 Nov the Bottom line reads: order by Sun 6 Dec. The next order
costs about ₱6,980 and about ₱2,420 will be there by then, so the shop is about ₱4,560 short. The suggested payout
is ₱0. **Decision needed:** the owner confirms the six views and the This / Last period control (open question 1).

## Dashboard

- **Name:** Cloud Factory: Owner dashboard
- **Purpose:** each week, month and quarter, show the owner whether the shop made money, what limited it, and the
  next decision on stock, collections and payouts, with every number compared with the period before.
- **Users:** the owner (primary, on a phone). The manager works from the app's own screens (decision D12).
- **Periods:** Week | Month | Quarter, with This (to date) and Last (the complete report). The same view is the
  weekly, monthly and quarterly report.
- **Refresh:** live, when the dashboard opens or the period changes. Five calls: Q1 to Q4 for the period, and Q5
  (now) once.

## Users and decisions

| When | The owner decides | Reads (view → KPI) |
|---|---|---|
| Daily glance | Is anything urgent: an order due, an order late, cash short? | Bottom line: Order by, Money for the next order, Late owed |
| Weekly (Monday, Week → Last; about 10 min) | 1. Place the next order (on or before Order by; all of it or what fits). 2. Message the supplier if an order is Late. 3. Have staff chase the Late and Very late. 4. Pay out, or hold until the next order is paid. | Stock and ordering: Order by, Next order, Money for it, On the way. Collections: Late, Still owed. Cash: Suggested payout, Safe to distribute |
| Monthly (first week, Month → Last; with the manager) | 1. Pick the profit-tree branch that moved most and agree one action. 2. Set the distribution (up to the suggestion) and the inventory reserve. 3. Check every expense is entered. 4. Decide credit terms. 5. Pick the flavours to reorder, discount or drop. | Profit: the bridge and its drivers. Cash: Cash from operations, Distributed, Payout ratio. Collections: Credit share, Days to collect. Products: Lines by speed, Not selling |
| Quarterly (first two weeks after the quarter, Quarter → Last) | 1. Which product lines to carry, and which to test (re-order the fastest line). 2. Supplier terms (pay on pick-up) and order size. 3. Payout policy while growing. 4. Owner capital top-up or not. 5. The percentage-tax filing, with the accountant (BIR Form 2551Q, within 25 days after the quarter). | Products: Pareto by speed, Lines. Cash: Payout ratio to date, Owner capital, Cash from operations. Profit: Net margin, Tax at 3% |

The manager places and records orders, taps Arrived, enters expenses, sets the inventory reserve and chases
collections, all in the app (Restock, Collectibles, Finance). Those screens apply the same rules. Staff are not
users: the dashboard shows money.

## Pages

Hierarchy: the **Bottom line** is level 1 (the overview). The five views are level 2 (analysis). The app's own
screens are level 3 (detail: batch statements, the receivables list with names, product pages). The views follow the
money identity, so they don't overlap: profit earned (Profit), where the money sits (Stock and ordering for
inventory and orders, Collections for receivables, Cash and payouts for cash and owners' money), and what to sell
(Products).

- **Bottom line**: did the shop make money this period, and what must I do this week?
  - KPIs (7): Net profit · Net sales · Profit missed while the shop was empty · Order by · Money for the next
    order · Late owed · Suggested payout (with Safe to distribute)
  - Answer first: up to three lines, picked by the rules in [Bottom line answer rules](#bottom-line-answer-rules).
  - No query of its own: each tile is a field of Q1 to Q5.
- **Profit**: how much did we earn, and which branch of the profit tree moved?
  - KPIs (7): Net profit (with net margin) · Net sales · Pieces sold · Average price · Landed cost per piece (with
    gross margin) · Operating expenses · Tax estimate
  - Supporting: the profit bridge against the previous period (days open, shelf, demand, price, landed cost,
    expenses, counts, tax). Products on the shelf (average) and pieces a day per product on the shelf, the two volume
    drivers. Discounts, count differences (only when not 0), and expenses by category. Tax at 3% for the accountant
    (Quarter view).
  - Findings shown (baseline §4, §11): "Net margin looks high because no rent or pay is recorded; enter them before
    using it for break-even." "The shelf branch is the biggest lever." The bridge shows it in pesos every period.
- **Stock and ordering**: was the shelf full, what did empty shelves cost, and when must I order?
  - KPIs (7): Days with nothing to sell · Products on the shelf (average) · Profit missed while the shop was empty
    (at least) · On the way (pieces, due day, Late) · Order by · Next order (estimate: pieces, ₱) · Money for it by
    then (available against cost: covered or short)
  - Supporting: a chart of products on the shelf per day, with empty hours and pieces sold. Pace on days with stock.
    "Worked out from your history": pace, delivery days (starting guess), order rhythm, reorder point, target and
    stock position.
  - Findings shown (baseline §6, stock-and-ordering §1): "Sales track how full the shelf is: 3.6 pieces a day with 7
    to 10 flavours, 0.85 with 1 to 3." "Order on the Order by date, not at sell-out: worth about ₱3.7k to ₱4.0k of
    gross profit a month." "On the date, order what the money buys, then top up."
- **Products**: which flavours and lines sell fastest, and what is not selling?
  - KPIs (6): Lines by speed (pieces a day per product on the shelf) · Products that make 80% of demand · Top 20%'s
    share of demand · Fastest against slowest (×) · Not selling (count, ₱ at cost) · New (never on the shelf)
  - Supporting: a Pareto chart of products by speed (bars), with the cumulative share (line).
  - Findings shown (baseline §7, stock-and-ordering §4.7): "Rank by speed, not by pieces sold: every flavour sold
    exactly 3, so pieces sold shows supply." "XBLACK MAX sold about twice as fast per flavour on the shelf as Black
    TEO and has not been re-ordered: test it (it was also new and ₱20 cheaper)." "Mix is worth far less than being
    in stock (about ₱0.5k against ₱3.7k to ₱4.0k a month)."
- **Collections**: who owes us, is it getting later, and is credit tying up cash?
  - KPIs (7): Credit share of sales · Collected later · Still owed (end of period) · Late and very late (end of
    period) · Days to collect (median) · Open credit sales and buyers owing · Largest buyer's share of what is owed
  - Supporting: aging buckets (Usual / Late / Very late) with their thresholds and source line ("from 31 sales paid
    in full: half within 9 days, 8 in 10 within 12"), DSO, paid at the till.
  - Findings shown (baseline §8): "Credit is the norm: 73% of sales, collected reliably but slowly (median 9 days)."
    "Each batch's own cash comes back about when the next order must be paid." "Each 10 points of credit moved to
    the till frees about ₱540" (cash-and-capital §4.7).
- **Cash and payouts**: how much cash is there, what can I pay out safely, and is the next order covered?
  - KPIs (7): Cash (end of period) · Cash from operations · Distributed (owner / manager) · Safe to distribute (end
    of period) · Suggested payout (now) · Inventory reserve kept (end of period; is the reserve question open?) ·
    Owner capital (end of period)
  - Supporting: a cash waterfall (start, + capital put in, + receipts, − stock paid from the fund, − expenses, −
    taxes paid, − distributions, end). The balance strip with its check (must be ₱0). Payout ratio to date. Running
    costs a month. Hold for the next order.
  - Findings shown (cash-and-capital §1, §4.8): "Hold the next order before any payout. The 25 Nov payout of ₱4,232
    left Batch 4 short in every simulated case." "Paying the supplier on pick-up cuts that risk from 100% to 17%."
    "A payout ratio up to about 64% still lets orders grow to full-shelf size from the shop's own money."

### Bottom line answer rules

Show the first three that apply, in this order, each as one plain sentence with its numbers:

1. **Short for the next order** (Q5 `money.short_cents` > 0): "Order by {order_by}. It will cost about ₱{next}; about
   ₱{available} will be there by then. ₱{short} short: hold payouts, collect what is owed, ask to pay on pick-up, or
   order what fits."
2. **Order due soon** (Order by within 7 days, or `order_now`): "Order by {order_by}: about {pieces} pieces, ₱{next}."
3. **Order late** (Q5 `on_the_way[].late`): "Batch {n} is {days_past_due} days past its due day: message the
   supplier."
4. **Profit moved**: "Net profit ₱{now}, {up/down ₱Δ} on {previous label}, mostly {largest bridge part}
   ({₱})."
5. **Shop empty** (Q2 `empty_days` > 0): "No stock for {d} days: at least ₱{missed} of profit missed."
6. **Late payers** (Q3 late + very late > 0): "₱{late} owed is late ({n} sales older than {late_after} days)."
7. **Payout** (Q5 `suggested_payout_cents` > 0): "You can pay out about ₱{suggested}, keeping the next order and a
   month of running costs."

## Data sources

- **Supabase "Vape POS"** (project `pyjhwbfdxrjeitwjztna`, us-east-1): PostgreSQL 17, through the Supabase
  connector's `execute_sql`, called by the dashboard page with the owner's own connector (the artifact `mcp`
  capability). Each call is one fixed query from `spec/kpi_queries.sql`, wrapped in `begin read only; … rollback;`.
  - Tables read: `sales`, `sale_items`, `sale_payments`, `stock_movements`, `stock_batches`, `batch_order_lines`,
    `batch_payments`, `products`, `categories`, `product_costs`, `expenses`, `fund_releases`, `fund_set_asides`,
    `capital_contributions` (the task called it capital_entries), `reservations`, `settings`.
  - Refresh: live, on open and on a period change. History starts 27 Oct 2026 (first stock and sale).
  - Access: the connector runs as `postgres` (RLS bypassed). The page must send only these texts, with dates checked
    as `YYYY-MM-DD`.
  - Quality: Batches 1 and 2 have no order day, so delivery time is a starting guess (7 days). One sale was voided
    and rung again (Blue Freeze, 22 → 25 Nov); the product pace shrinks toward its line so this cannot distort the
    ranking. No rent or pay is recorded, and the tax rate is 0%. There are 31 days of history, so only the Week view
    has a "usual" yet.
- **Planning engine** (`plan_core()`, `plan_params()`, planned in
  `supabase/migrations/20261127000000_planning_engine.sql`): not live. Q5 carries an interim shop-level copy of its
  methods until it ships.
- **Consulting fact base** (`analysis/baseline.md`, `analysis/stock-and-ordering.md`, `analysis/cash-and-capital.md`):
  the static findings shown on each view. Live numbers replace the figures where a query computes them.

## Decisions

- **D1. Six views, grouped by the money identity** (profit; stock, receivables, cash; products). The groups don't
  overlap, and together they cover the owner's decisions. Batch statements, buyer lists and product pages stay in the
  app as level-3 detail. One query per view keeps calls few: Q1 Profit, Q2 Stock and products (it also feeds
  Products), Q3 Collections, Q4 Cash, Q5 Next order and money (now). Q5 is shared because it will be swapped for the
  planning engine as one block.
- **D2. Week | Month | Quarter, with This / Last.** On the 1st of a month, "This month" shows one day. The complete
  report is "Last". The page computes the four dates (rule in the SQL header): `{{to}}` = least(period end, today).
- **D3. Previous period = like for like.** The same days of the previous period (Mon to Thu against last Mon to
  Thu). If the shop opened during that window, the queries use the whole previous period and the page compares flows
  per open day. That is why November is compared with all of October, 5 days open. With no trading at all (Q3 2026),
  the page shows "no earlier period". This is fair for a young shop and never shows "against ₱0".
- **D4. Usual** = the median of up to 8 earlier windows of the same shape, each with the shop open the whole time.
  It shows when 3 or more exist. The median ignores the launch rush. Usual values are medians per KPI, so they don't
  add up across KPIs. Today only the Week view has a usual (3 windows). Month gets one from February 2027, Quarter
  from Q3 2027.
- **D5. A MECE profit tree, with a bridge.** Net profit = net sales − landed cost of goods ± count differences −
  expenses − tax. Net sales = pieces × average price. Pieces = product-days on the shelf × pieces a day per product
  on the shelf. The bridge splits the change in net profit into days open, shelf, demand, price, landed cost,
  expenses, counts and tax, and the parts add up exactly. In a supply-limited shop, the shelf branch must show in
  pesos.
- **D6. Profit missed counts only the floor**: days the whole shop was empty × pace on days with stock (last 90 days)
  × landed margin per piece (last 90 days), labelled "at least". The thin-shelf loss shows as the bridge's shelf
  effect and as Products on the shelf. It is not a second peso estimate, because the middle and upper estimates
  (₱5.1k and ₱7.9k, baseline §6) assume no novelty effect, which the baseline lists as a risk.
- **D7. Products are ranked by speed.** Value pace = pieces a day on the shelf × price, shrunk toward the product's
  line over 7 shelf-days (as the planning engine does). Not by sales value. Comparisons are against the shop's
  average and the 80/20 benchmark, because a ranking has no "previous" that informs a decision.
- **D8. Collection buckets come from the shop's own payments** (planning design method 9: usual = median, late after
  the 80th percentile, very late after max(95th, late + 7); 7 / 7 / 30 days until 10 credit sales are paid in full).
  The dashboard and the app then apply one rule.
- **D9. Order by and the next order are an interim, shop-level copy of the planning design v2** (methods 1, 2, 3, 5,
  6, 8). It matches the design's live check (pace 2.05, reorder point 23, target 64.7, position 33, Order by 6 Dec).
  The next order is estimated for the whole shop (40 pieces against the engine's 43). When `plan_core()` is live, Q5
  reads it, so Restock and the dashboard always agree.
- **D10. The money check and the suggested payout follow the cash-and-capital finding.** Hold the part of the next
  order that likely collections won't cover, plus a month of running costs: suggested = max(0, min(safe to
  distribute, spare cash) − hold − running costs a month). This is stricter than the planning design's payout hint
  (spare cash − running costs). Both give ₱0 today. The hard cap stays Safe to distribute.
- **D11. "Now" tiles don't move with the period switch**: Order by, On the way, Money for the next order, Suggested
  payout, Safe to distribute now, and aging now. Period tiles do. Balances show the end of the period, or now for a
  period still running.
- **D12. For the owner only.** Live data comes through the viewer's own Supabase connector, which has full database
  rights. Only the owner should hold it, and the artifact stays private (never public).
- **D13. Read-only and private by construction.** Every call runs in a read-only transaction and is rolled back. The
  queries return aggregates only, and no buyer or staff name leaves the database (Q3 reads `customer_name` only
  inside counts). The page renders values as text, never as HTML. A script injected through a product name could
  otherwise send SQL through the connector.
- **D14. Tax.** The estimate uses the owner's rate (0% now). The Profit view's Quarter report adds a supporting line,
  "at the 3% percentage tax: ₱X, for your accountant", because the baseline flags the gap. It is a planning figure,
  not tax advice.
- **D15. Format.** Centavos ÷ 100 → ₱ with commas. Costs in brackets in statements. Percentages and days to one
  decimal. Dates as "Sun 6 Dec". The current day counts as one open day in comparisons.
- **D16. Left out, on purpose:**
  - Hour and weekday patterns: too little data, and no staffing decision depends on them yet.
  - Buyer-level lists or rankings: privacy. Collectibles in the app has the names for chasing.
  - Batch statements: already in Finance → Batches.
  - ROIC, economic profit and the cash conversion cycle: returns are not the constraint and costs are unrecorded.
    They can come later as a quarterly appendix.
  - Break-even: until rent and pay are recorded. Running costs a month is shown instead.
  - A pocket-price waterfall: there are no discounts or payment fees, so average price covers it.
  - A VAT-threshold watch: the threshold is ₱3M and sales to date are ₱19.8k.
  - Forecasts beyond the next order.

## KPI definitions

Shared rules, for every query:

- **Windows.** Each period query builds `w`: k = 0 is this period, k = 1 the previous period (with the D3 fallback),
  and k = 2 to 8 are earlier windows of the same shape for "usual". `ws` and `we` are Manila business days; `ws_at`
  and `we_at` are their timestamps (to now for a running period). `open_days` counts the days on or after the shop's
  first day.
- **Output shape.** `kpis.<metric> = {now, prev, usual, usual_n}`. The page shows `prev` per open day when
  `prev_open_days` < `open_days`, and hides `usual` when it is null.
- **Landed cost.** Each sold piece is matched first in, first out to the stock that came in (`arr` × `sold` stacks
  per product), and costs that arrival's unit cost + its batch's fees ÷ pieces received (`fee.pp`). A period's figure
  is round(cumulative to `we`) − round(cumulative before `ws`), as `finance_report` does.
- **Shelf timeline.** `lv` is each product's stock level between consecutive movements (running Σ `delta`). `sh` is
  the number of products with stock between consecutive movements, shop-wide. "On the shelf" means level > 0; the
  shop is empty when `n = 0`.

### Bottom line (no query of its own)

| Tile | Source field | Comparison | Decision it informs |
|---|---|---|---|
| Net profit | Q1 `kpis.net_profit_cents` | previous, usual | Is the shop earning? Open Profit to see why. |
| Net sales | Q1 `kpis.net_sales_cents` (and `net_sales_per_open_day_cents`) | previous (per open day when the open days differ), usual | Is the shop growing? |
| Profit missed while the shop was empty | Q2 `kpis.missed_empty_cents` with `kpis.empty_days` | previous, usual | Order earlier: see Order by. |
| Order by | Q5 `next_order.order_by`, `next_order.order_now`, `on_the_way[].due_on` | days from today; the due day of the order on the way | Place the next order, and when. |
| Money for the next order | Q5 `money.available_by_order_cents` against `money.next_order_cents`; `money.short_cents` | against the order's cost | Hold payouts, collect, ask to pay on pick-up, order what fits, or top up. |
| Late owed | Q3 `kpis.late_end_cents` + `kpis.very_late_end_cents` | previous end, usual | Who to chase this week (the names are in the app). |
| Suggested payout | Q5 `money.suggested_payout_cents`, with `money.safe_to_distribute_cents` | against Safe to distribute (the cap) | Pay out now or wait. |

### Q1 Profit

| KPI (field) | Definition | SQL (Q1) | Comparison | Decision it informs |
|---|---|---|---|---|
| **Net profit** (`net_profit_cents`), net margin (`net_margin_pct`) | Net sales − landed cost of goods sold ± count differences − operating expenses − tax estimate (accrual, as Finance → Profit & loss) | `d.np = m.net - m.cogs + m.diffs - m.opex - m.tax`; margin `round(100.0 * d.np / nullif(d.net, 0), 1)` | previous (per open day when needed), usual | Is the shop earning? With the bridge, which branch gets this month's one action. |
| **Net sales** (`net_sales_cents`) | Completed sales by business day, after discounts | `sum(sd.net)` where `sd` = `sum(s.total_cents)` of `status = 'completed'`, `sd.d between w.ws and w.we` | previous, usual; `net_sales_per_open_day_cents` | Growth. Split into pieces × average price. |
| **Pieces sold** (`pieces`) | Pieces on completed sales in the period | `sum(sd.pcs)`, `sd.pcs` = `sum(sale_items.quantity)` per sale | previous, usual | The volume branch: product-days × pieces a day per product on the shelf. |
| **Average price** (`avg_price_cents`) | Net sales ÷ pieces: list price, product mix and discounts | `round(d.net::numeric / nullif(d.pieces, 0))` | previous, usual | The price branch (pocket price; discounts are `discounts_cents`). |
| **Landed cost per piece** (`landed_cost_pp_cents`), gross margin (`gross_margin_pct`) | Each sold piece, first in first out, at its arrival's unit cost + the batch's restocking fees ÷ pieces received; margin = (net − cost) ÷ net | `cogs.cents = sum((least(a.hi, s.hi) - greatest(a.lo, s.lo)) * (a.uc + coalesce(f.pp, 0)))`; period = `round(cum ≤ we) − round(cum < ws)`; `round(d.cogs::numeric / nullif(d.pieces, 0))` | previous, usual | The supplier's price and the order size (fees per piece). |
| **Operating expenses** (`opex_cents`, `opex_by_category`) | Expenses by the day spent, all categories except Taxes paid | `sum(amount_cents) where category <> 'tax' and spent_on between w.ws and w.we` | previous, usual | Is every cost entered? (Running costs feed the payout suggestion.) |
| **Tax estimate** (`tax_cents`; `tax_at_3pct_cents`) | The owner's rate × net sales, as the app computes it (cumulative, rounded) | `round(cum_net(we) * tax_bp / 10000.0) - round(cum_net(ws - 1) * tax_bp / 10000.0)`; `round(net * 0.03)` | previous | The tax reserve. At 3%: a figure for the accountant (Quarter view). |
| Supporting: products on the shelf (`products_on_shelf_avg`), pieces a day per product on the shelf (`pieces_per_product_day`), `product_days`, `count_diffs_cents`, `discounts_cents`, `bridge` | Product-days = time each product had stock; average = product-days ÷ time open. The bridge parts add up to the change in net profit: days = (D1 − D0) × (Q0 ÷ D0) × m0; shelf = (PD1 − PD0) × (Q0 ÷ PD0) × m0 − days; demand = (Q1 − Q0) × m0 − (shelf + days); price = Q1 × (P1 − P0); cost, expenses, counts and tax are the rest (m0 = last period's landed margin a piece) | see `br`, `br2` | — | Which branch moved: shelf (order earlier), demand (range, novelty), price, cost, expenses. |

<details><summary>Full SQL of Q1 (identical to spec/kpi_queries.sql)</summary>

```sql
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
```

</details>

### Q2 Stock and products

| KPI (field) | Definition | SQL (Q2) | Comparison | Decision it informs |
|---|---|---|---|---|
| **Days with nothing to sell** (`empty_days`) | Time in the period when no product had stock (from the shop's first movement on), in days | `sum(extract(epoch from least(sh.t2, w.we_at) - greatest(sh.t1, w.ws_at))) filter (where sh.n = 0) / 86400.0` | previous, usual | Order on the Order by date, not at sell-out. |
| **Products on the shelf, average** (`products_on_shelf_avg`; `products_on_shelf_max`) | Product-days with stock ÷ days open. Each flavour and the device counts as a product. | `round(m.product_days / nullif(m.empty_days + m.stock_days, 0), 1)` | previous, usual | How full the shelf was. Sales fall about 4× from a full shelf to 1 to 3 flavours. |
| **Profit missed while the shop was empty, at least** (`missed_empty_cents`) | Empty days × pieces a day on days with stock (last 90 days) × landed margin a piece (last 90 days) | `round(m.empty_days * r.pace * r.margin_pp)`; `rates`: `pace = pcs / stock_days`, `margin_pp = (net − landed) / pcs` | previous, usual | Puts a peso cost on ordering late. |
| Pace on days with stock (`pace_on_stock_days`, supporting) | Pieces sold ÷ days with stock | `round(m.pieces / nullif(m.stock_days, 0), 2)` | previous, usual | — |
| **Lines by speed** (`lines[].pieces_per_product_day`, `net_per_product_day_cents`) | Pieces ÷ product-days, per category (product line) | `round(sum(pieces) / nullif(sum(product_days), 0), 3)` grouped by line | against the shop's average for the period | Which line to re-order or test. |
| **Products that make 80% of demand** (`mix.products_80` of `mix.ranked`) | Ranked products (on the shelf in the period) whose share of value pace strictly ahead of them is under 80%. Value pace = pace × price; pace = (pieces + 7 × line rate) ÷ (product-days + 7). | `count(*) filter (where share_ahead < 0.8 and value_pace > 0)`; `share_ahead = (Σ value_pace over faster products) / Σ value_pace` | against the 80/20 benchmark | Whether a few products clearly lead (then order those first when cash is short). |
| **Top 20%'s share of demand** (`mix.top20_share_pct`, `top20_count`) | Value pace of the fastest ceil(20% × ranked) ÷ all | `sum(value_pace) filter (where rn <= ceil(0.2 * n_ranked)) / sum(value_pace)` | against 80% (80/20) | The same. |
| **Fastest against slowest** (`mix.fastest_pace`, `slowest_selling_pace`) | Pace in pieces a day on the shelf | `max(pace)`, `min(pace) filter (where pieces > 0)` | the ratio between them | Depth by speed when a line is re-ordered (a small effect). |
| **Not selling** (`now_state.not_selling_count`, `not_selling_tied_up_cents`) | On the shelf now, with no sale or arrival for at least min(60, max(14, 3 ÷ pieces a day per product, last 90 days)) days; at cost | `on_hand > 0 and age(greatest(last_sold_at, last_in_at)) >= threshold`; `on_hand * cost_cents` | against ₱0 | Discount it, or stop re-ordering it. |
| **New** (`now_state.new_count`, `new_on_order_pieces`) | Active products never on the shelf, and their pieces on order | `not stocked` | — | Watch their first week. They get a pace once on the shelf. |
| Supporting: `daily` (products on the shelf, empty hours and pieces per day), `products` (the ranked list), `history_90d`, `now_state.empty_since` | | | | The shelf chart and the Pareto chart. |

<details><summary>Full SQL of Q2 (identical to spec/kpi_queries.sql)</summary>

```sql
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
```

</details>

### Q3 Collections

| KPI (field) | Definition | SQL (Q3) | Comparison | Decision it informs |
|---|---|---|---|---|
| **Credit share of sales** (`credit_share_pct`) | Net sales rung as Not paid yet ÷ net sales | `round(100.0 * m.credit / nullif(m.net, 0), 1)`; `credit = sum(total) where payment_method = 'unpaid'` | previous, usual | Credit terms: ask buyers to pay at the till. Each 10 points frees about ₱540. |
| **Collected later** (`collected_later_cents`) | Payments on Not paid yet sales, on the day collected | `sum(pay.cents) where pay.d between w.ws and w.we` (completed sales) | previous, usual | Is chasing working? |
| **Still owed, end of period** (`owed_end_cents`) | What open sales still owed at the period end: balance + payments made after that day | `cs.bal + sum(pay.cents) where pay.d > w.e`, summed | previous end, usual | Cash tied up in credit. |
| **Late and very late, end of period** (`late_end_cents`, `very_late_end_cents`) | Owed at the end and older than "late after" (12 days) or "very late after" (19 days); thresholds from the shop's own payments | `sum(cents) filter (where age > late_after and age <= very_late_after)`; `… age > very_late_after` | previous end, usual | Who to chase first (names in the app's Collectibles). |
| **Days to collect, median** (`days_to_collect_median`; n = `credit_sales_paid_off`) | Credit sales paid off in the period: median days from the sale to its last payment | `percentile_cont(0.5) within group (order by cs.last_paid - cs.d) where cs.credit and cs.bal = 0 and cs.last_paid between w.ws and w.we` | previous, usual | Chase threshold and credit policy. |
| **Open credit sales, buyers owing** (`open_sales_end`, `buyers_owing_end`) | Sales still owed at the end; distinct buyers (the name never leaves the database) | `count(*)`, `count(distinct o.who)` | previous end, usual | How widely credit is spread. |
| **Largest buyer's share of what is owed** (`largest_buyer_share_pct`) | The one buyer owing most, as % of what is owed | `max(sum(o.cents) by o.who) / owed_end` | previous end, usual | Concentration risk: a credit limit per buyer. |
| Supporting: `dso_days`, `paid_at_till_cents`, `credit_sales_cents`, `thresholds`, `aging_end` | DSO = average daily receivables ÷ (net sales ÷ open days); buckets Usual 0 to late_after, Late to very_late_after, Very late beyond | `avg(daily.owed) / (net / open_days)` | — | — |

<details><summary>Full SQL of Q3 (identical to spec/kpi_queries.sql)</summary>

```sql
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
```

</details>

### Q4 Cash and payouts

| KPI (field) | Definition | SQL (Q4) | Comparison | Decision it informs |
|---|---|---|---|---|
| **Cash, end of period** (`cash_end_cents`) | Capital put in + receipts − stock paid from the company fund − stock from before batches − expenses − taxes paid − distributions, to the period end | `capital_cash + collected - paid_company - loose - opex - tax_paid - dist` | previous end, usual | Can the shop pay what is coming? |
| **Cash from operations** (`cash_from_operations_cents`) | Receipts − stock paid from the fund − expenses − taxes paid, in the period | `receipts - stock_paid - opex_paid - taxes_paid` | previous, usual | Does the shop fund itself? |
| **Distributed** (`distributed_cents`, `distributed_owner_cents`, `distributed_manager_cents`) | Owner distributions recorded in the period | `sum(amount_cents) from fund_releases where released_on between w.ws and w.e` | previous, usual | Payout pace. |
| **Safe to distribute, end of period** (`safe_to_distribute_end_cents`; `spare_cash_end_cents`) | min(profit kept, spare cash), not below 0; spare cash = cash − tax reserve − owed to suppliers − inventory reserve | `greatest(0, least(b.retained, b.spare))` | previous end, usual | The cap on any payout. |
| **Inventory reserve kept, end of period** (`inventory_reserve_end_cents`; `reserve_question_open`) | The latest reserve decision − company-paid orders recorded since then, not below 0 | `greatest(0, sa.amount_cents - sum(bm.cost - bm.paid_owners_all) where bm.created_at > sa.created_at)` | previous end, usual | Set the reserve again after each order. |
| **Owner capital, end of period** (`owner_capital_end_cents`) | Capital entries + supplier payments made with the owner's money or an investment | `capital_cash + paid_owners` | previous end | A top-up is permanent capital, never repaid. |
| Supporting: `payout_ratio_to_date_pct`, `cash_start_cents`, `receipts_cents`, `stock_paid_cents`, `expenses_paid_cents`, `taxes_paid_cents`, `capital_in_cents`, `owner_paid_stock_cents`, `net_cash_flow_cents`, the balance (`receivables_end_cents`, `inventory_end_cents`, `on_the_way_end_cents`, `owed_to_suppliers_end_cents`, `tax_payable_end_cents`, `profit_kept_end_cents`), `balance_check_cents` | Payout ratio to date = distributions ÷ net profit to date. Waterfall: start + capital + receipts − stock − expenses − taxes − distributions = end. The check must be 0. | `dist / (retained + dist)` | payout ratio against about 64% | Payout policy (orders can still grow to full-shelf size); data health. |

<details><summary>Full SQL of Q4 (identical to spec/kpi_queries.sql)</summary>

```sql
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
```

</details>

### Q5 Next order and money (now)

| KPI (field) | Definition | SQL (Q5) | Comparison | Decision it informs |
|---|---|---|---|---|
| **Order by** (`next_order.order_by`, `order_now`, `start_on`) | The day the shop's stock position (on the shelf − reserved + on the way, each product capped at max(usual batch pieces, target ÷ products)) falls to its reorder point: start + floor((position − reorder point) ÷ pace). Start = the due day of the order on the way while the shelf is empty, else today. | `ob2.order_by = ob.start_on + floor((pos.position_shop - pl.rop) / pl.lam)::int` | against today, and the due day | Place the next order. |
| **On the way** (`on_the_way[]`) | Batches ordered and not arrived: pieces, cost, paid, due = order day + delivery days; Late when older than max(longest delivery, ceil(L + 2σ)) days | `otw` | against the due day | Message the supplier when Late; tap Arrived the day it comes. |
| **Next order, estimate** (`next_order.pieces`, `goods_cents`, `fees_cents`, `total_cents`) | Pieces to bring the shop up to its target on the order day; goods at the last 3 batches' cost a piece; fees = their average × max(1, pieces ÷ their average pieces) | `nq2.next_pcs`, `nc.next_goods`, `nc.next_fees` | against the last batch's cost | The order size, and what to keep in reserve. |
| **Money for it by then** (`money.available_by_order_cents`, `likely_collected_cents`, `short_cents`) | max(0, spare cash + reserve kept) + open balances that will be older than the usual collection days on the order day | `greatest(0, mo2.spare + mo2.kept) + coll.expected`; short = `greatest(0, next_cents - available)` | against the next order | Hold payouts, collect, pay on pick-up, order what fits, or top up. |
| **Suggested payout** (`money.suggested_payout_cents`, `hold_for_next_order_cents`) | max(0, min(safe to distribute, spare cash) − hold − running costs a month); hold = max(0, next order − reserve kept − likely collected) | see `dz` and the final select | against Safe to distribute | Pay out, or wait. |
| Supporting: `money.running_costs_month_cents` (non-tax expenses over max(30, min(90, days open)) days × 30; a starting guess under 60 days), `pace`, `delivery`, `rhythm`, `levels`, `stock` | The "Worked out from your history" card: pace (recency-weighted, half-life = 2 × rhythm, 21 to 56 days), delivery (7 days ± 1.75 until an order has both dates), rhythm (mean gap of the last 11 order days, 7 to 60), reorder point = λL + 1.645√(Lλ·lump + λ²σL²), target with L + R | `dl`, `rh`, `hl`, `lam`, `pl`, `pos` | — | — |

<details><summary>Full SQL of Q5 (identical to spec/kpi_queries.sql)</summary>

```sql
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
```

</details>

### Q9 Maintenance check (not for the dashboard)

Compares the dashboard rules with the app's internal `finance_totals` / `finance_derive` / `finance_now` for
`{{prev_to}}` and `{{to}}`. Run it after any finance migration.

<details><summary>Full SQL of Q9 (identical to spec/kpi_queries.sql)</summary>

```sql
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
```

</details>

## Live check, 26 Nov 2026

Run read-only on the evening of 26 Nov 2026 (Manila), before midnight. The values that run to "now" (empty days,
profit missed, pace) grow while the shop stays empty. Previous periods are like for like: last week = Mon 16 to Thu
19 Nov; last month = all of October (open 27 to 31 Oct, compared per open day); last quarter = Q3 2026 (no trading, so
no comparison). Usual = the median of 16 to 19, 9 to 12 and 2 to 5 Nov.

**Cross-checks.**

- Against `analysis/baseline.md`: net sales ₱7,680 (October), ₱12,120 (November) and ₱19,800 (total); net profit
  ₱3,648.80, ₱5,178.20 and ₱8,827.00; landed cost of goods ₱10,233; gross margin 48.3%; net margin 44.6%; credit share
  73.4%; DSO 6.2 days; median 9 days to collect; still owed ₱2,080; cash ₱340; safe to distribute ₱340; owner capital
  ₱5,039. Q1 to Q4 reproduce every one exactly.
- Against the app's own `finance_totals` / `finance_derive` / `finance_now` (Q9) on 31 Oct, 15, 19, 22 and 26 Nov:
  cash, receivables, inventory and net profit match to the centavo.
- Q4's balance check is ₱0 for every window.
- Q5 reproduces the planning design's live check: pace 2.05 a day, reorder point 23, target 64.7, position 33, Order
  by 6 Dec, ₱2,420 available by then, late after 12 / 19 days.

### Bottom line (Week view, 26 Nov)

| Tile | Now | Comparison |
|---|---|---|
| Net profit, week to date | ₱233.73 | ₱1,501.80 on the same days last week (−84%); usual ₱760.17 |
| Net sales | ₱680 (2 pieces) | ₱3,060 (−78%); usual ₱2,720 |
| Profit missed while the shop was empty | at least ₱129 (0.37 days, empty since 11:16 today) | ₱0; usual ₱0 |
| Order by | **Sun 6 Dec** (10 days) | Batch 3 (40 pieces) due about Wed 2 Dec; Late from Mon 7 Dec |
| Money for the next order | ₱2,420 available by 6 Dec (₱340 spare cash + ₱0 reserve + ₱2,080 likely collected) | against about ₱6,978.80 (40 pieces: ₱6,680 goods + ₱298.80 fees): **₱4,558.80 short** |
| Late owed | ₱380 (2 sales older than 12 days) | ₱240 at the end of 19 Nov; usual ₱0 |
| Suggested payout | **₱0** (holds ₱4,898.80 for the next order and ₱716.13 of running costs) | Safe to distribute ₱340 (₱1,092 at the end of 19 Nov; usual ₱3,466) |

Answer lines the rules produce today:

1. "Order by Sun 6 Dec. It will cost about ₱6,980; about ₱2,420 will be there by then. ₱4,560 short: hold payouts,
   collect what is owed, ask to pay on pick-up, or order what fits."
2. "Net profit ₱234, down ₱1,268 on the same days last week, mostly the emptier shelf (−₱1,306)."
3. "No stock since 11:16 today: at least ₱129 of profit missed. Batch 3 is due about Wed 2 Dec."

### Profit (Q1)

| KPI | Week 23 to 26 Nov | Same days last week | Usual (3 weeks) | November 1 to 26 | October (5 days open) | Quarter to date |
|---|---|---|---|---|---|---|
| Net profit | ₱233.73 | ₱1,501.80 | ₱760.17 | ₱5,178.20 (₱199.16 a day open) | ₱3,648.80 (₱729.76 a day) | ₱8,827.00 |
| Net margin | 34.4% | 49.1% | 47.5% | 42.7% | 47.5% | 44.6% |
| Net sales | ₱680 | ₱3,060 | ₱2,720 | ₱12,120 (₱466.15 a day) | ₱7,680 (₱1,536.00 a day) | ₱19,800 |
| Pieces sold | 2 | 9 | 8 | 36 | 24 | 60 |
| Average price | ₱340.00 | ₱340.00 | ₱340.00 | ₱336.67 | ₱320.00 | ₱330.00 |
| Landed cost a piece | ₱173.14 | ₱173.13 | ₱173.13 | ₱172.27 | ₱167.97 | ₱170.55 |
| Gross margin | 49.1% | 49.1% | 49.1% | 48.8% | 47.5% | 48.3% |
| Operating expenses | ₱100 | ₱0 | ₱0 | ₱740 | ₱0 | ₱740 |
| Tax estimate (rate 0%) | ₱0 | ₱0 | ₱0 | ₱0 | ₱0 | ₱0 (₱594 at 3%) |
| Products on the shelf, average | 0.9 | 6.7 | 6.7 | 4.5 | 7.9 | 5.0 |
| Pieces a day per product on the shelf | 0.576 | 0.338 | 0.340 | 0.311 | 0.656 | 0.394 |

The previous quarter (Q3 2026) had no trading, so there is no comparison and no bridge. Full last week (Mon 16 to
Sun 22 Nov), for reference: net sales ₱4,080, net profit ₱2,002.40 (from `finance_totals`).

Profit bridge (the parts add up to the change in net profit):

| Part | Week vs same days last week | November vs October |
|---|---|---|
| Days open | ₱0 | +₱15,324.96 (26 days against 5) |
| Shelf (products on the shelf) | −₱1,306.32 | −₱7,426.46 |
| Demand (pieces a day per product on the shelf) | +₱138.25 | −₱6,074.10 |
| Average price | ₱0 | +₱600.00 |
| Landed cost a piece | ₱0 | −₱155.00 |
| Expenses | −₱100.00 | −₱740.00 |
| Counts, tax | ₱0 | ₱0 |
| **Change in net profit** | **−₱1,268.07** | **+₱1,529.40** |

So what: this week's fall is the shelf (one or two flavours left), not demand. November against October: more days
open, but a thinner shelf and slower sales per product (the launch rush ended) took away most of the gain.

### Stock and ordering (Q2, Q5)

| KPI | Week | Same days last week | Usual | November | October | Quarter |
|---|---|---|---|---|---|---|
| Days with nothing to sell | 0.37 | 0 | 0 | 3.42 | 0 | 3.44 |
| Products on the shelf, average | 0.9 | 6.7 | 6.7 | 4.5 | 7.9 | 5.0 |
| Most products on the shelf at once | 2 | 9 | 9 | 10 | 10 | 10 |
| Profit missed while empty (at least) | ₱129.32 | ₱0 | ₱0 | ₱1,212.40 | ₱0 | ₱1,216.01 |
| Pace on days with stock (pieces a day) | 0.58 | 2.25 | 2.25 | 1.61 | 5.20 | 2.22 |

Rates used for profit missed (last 90 days): 2.22 pieces a day on days with stock (60 pieces ÷ 27.03 days), landed
margin ₱159.45 a piece. The quarter's ₱1,216 matches the baseline's floor (₱1,196 at 18:59, plus the empty hours
since).

Now (Q5): nothing on the shelf, empty since 11:16 on 26 Nov. **On the way:** Batch 3, 40 pieces (30 BLXCK Signature
+ 10 devices), ₱7,214, paid in full, ordered 25 Nov, due about Wed 2 Dec, Late after 11 days (from Mon 7 Dec).
**Order by:** Sun 6 Dec, when the position (33) falls to the reorder point (23). **Next order:** about 40 pieces,
₱6,680 of goods + ₱298.80 fees = **₱6,978.80**. **Money for it by then:** ₱2,420, so **₱4,558.80 short**.

Worked out from history: pace 2.05 a day (14.4 a week, recent weeks weighted, half-life 36 days, not rough).
Delivery 7 days ± 1.75 (a starting guess: no order has both dates yet). Order rhythm 18 days (20 Oct* · 2 Nov* ·
25 Nov; * estimated as arrival − delivery). Reorder point 23 (14 for the delivery days + 9 spare). Target 64.7.
Position 33 (30 pods + 3 of the 10 devices, capped). Next rhythm day Sun 13 Dec.

### Products (Q2)

| KPI | Week | November | Quarter to date |
|---|---|---|---|
| Ranked (on the shelf in the period) | 2: too few to rank | 14 | 20 |
| Products that make 80% of demand | — | 11 of 14 | 14 of 20 (80/20 benchmark: 4) |
| Top 20%'s share of demand | — | 28.2% (top 3) | 31.5% (top 4; 80/20 benchmark: 80%) |
| Fastest against slowest (pieces a day on the shelf) | — | 0.49 against 0.22 (2.2×) | Mixed Berries 0.84 against Sparkle Squeeze 0.22 (3.9×) |
| Lines, pieces a day per product on the shelf (shop average) | Black TEO 0.576 (0.576) | XBLACK MAX (TRANSPARENT V2 PODS) 0.401, Black TEO 0.298 (0.311) | XBLACK MAX 0.582, Black TEO 0.298 (0.394) |
| Not selling | 0 (₱0 at cost) | 0 (₱0) | 0 (₱0) |
| New, never on the shelf | 11 (40 pieces on the way) | 11 | 11 |

The quarter's fastest four (Mixed Berries, Strawberry Ice, Gummy Bear, Mango, all XBLACK MAX) are the baseline's
fastest four. So what: sales are spread (no Top seller yet), but XBLACK MAX sold about twice as fast per flavour on
the shelf as Black TEO. That is the re-order test to run.

### Collections (Q3)

| KPI | Week | Same days last week | Usual | November | October | Quarter |
|---|---|---|---|---|---|---|
| Credit share of sales | 100% | 66.7% | 80.0% | 75.1% | 70.8% | 73.4% |
| Collected later | ₱1,900 | ₱3,120 | ₱2,880 | ₱12,460 | ₱0 | ₱12,460 |
| Still owed (end) | ₱2,080 | ₱3,980 | ₱3,980 | ₱2,080 | ₱5,440 | ₱2,080 |
| Late and very late (end) | ₱380 | ₱240 | ₱0 | ₱380 | ₱0 | ₱380 |
| Days to collect, median (sales paid off) | 9 (5) | 8.5 (6) | 8.5 | 9 (31) | none paid off | 9 (31) |
| Open credit sales, buyers owing (end) | 6, 6 | 12, 10 | 11, 10 | 6, 6 | 15, 14 | 6, 6 |
| Largest buyer's share of what is owed | 32.7% | 17.1% | 21.4% | 32.7% | 11.8% | 32.7% |
| DSO (days) | 12.6 | 6.9 | 6.9 | 8.4 | 2.8 | 6.2 |

Thresholds from 31 Not paid yet sales paid in full (33 values, not a guess): usual 9 days, late after 12, very late
after 19. Aging now: Usual ₱1,700 (4 sales), Late ₱380 (2), Very late ₱0; the oldest is 16 days.

### Cash and payouts (Q4, Q5)

| KPI | Week | Same days last week | Usual | November | October | Quarter |
|---|---|---|---|---|---|---|
| Cash (end) | ₱340 | ₱8,286 | ₱4,800 | ₱340 | ₱2,240 | ₱340 |
| Cash from operations | (₱5,414) | ₱4,140 | ₱2,560 | ₱2,332 | ₱2,240 | ₱4,572 |
| of which: receipts | ₱1,900 | ₱4,140 | ₱3,220 | ₱15,480 | ₱2,240 | ₱17,720 |
| of which: stock paid from the fund | (₱7,214) | ₱0 | ₱0 | (₱12,408) | ₱0 | (₱12,408) |
| of which: expenses | (₱100) | ₱0 | ₱0 | (₱740) | ₱0 | (₱740) |
| Distributed (owner / manager) | ₱4,232 (₱2,821.33 / ₱1,410.67) | ₱0 | ₱0 | ₱4,232 | ₱0 | ₱4,232 |
| Safe to distribute (end) | ₱340 | ₱1,092 | ₱3,466 | ₱340 | ₱2,240 | ₱340 |
| Suggested payout (now, Q5) | ₱0 | — | — | ₱0 | — | ₱0 |
| Inventory reserve kept (end) | ₱0 (the reserve question is open) | ₱7,194 | ₱0 | ₱0 | ₱0 | ₱0 |
| Owner capital (end) | ₱5,039 | ₱5,039 | ₱5,039 | ₱5,039 | ₱5,039 | ₱5,039 |
| Payout ratio to date | 47.9% | 0% | 0% | 47.9% | 0% | 47.9% |
| Balance check | ₱0 | ₱0 | ₱0 | ₱0 | ₱0 | ₱0 |

October's Batch 1 (₱5,039) was paid with the owner's money, so it is owner capital, not a cash outflow. The week's
payout ratio is cumulative to each window's end, so it equals the Month and Quarter values: 47.9% now, 0% before the
25 Nov payout. So what: the shop made ₱4,572 of cash from operations in its first month and paid out ₱4,232 of it the
day Batch 3 was paid. That is why the next order is ₱4,559 short.

## Validation checklist (kit)

- [x] Dashboard purpose is clear in one sentence
- [x] Target users are identified (owner; the manager through the app, D12)
- [x] Each page answers specific questions (documented above)
- [x] Primary KPIs are limited: 6 or 7 per view
- [x] Data sources are accessible and understood: all five queries ran live, read-only
- [x] Information hierarchy is defined: Bottom line (level 1) → five views (level 2) → app screens (level 3)
- [ ] User has explicitly confirmed the structure: open (delegated task; open question 1)

## Open questions

1. **Structure.** Does the owner accept the six views, and This / Last next to Week | Month | Quarter?
2. **Manager access.** Should the manager see the dashboard? That needs a safe data path: a read-only database role,
   or a shared snapshot. The owner's connector has full rights and must not be shared.
3. **Read-only connector.** Supabase's MCP server can run read-only and scoped to one project. Can the owner's
   claude.ai Supabase connector be set that way for this artifact? It would back up the read-only transactions.
4. **Profit missed.** Show only the floor (D6), or also the "full shelf" estimate (₱5.1k to ₱7.9k to date) with its
   caveat?
5. **Payout rule.** Keep the stricter cash-and-capital suggestion (D10), and should the hold become a hard rule in
   the app (cash-and-capital recommendation 5)?
6. **Tax at 3%.** Show the "for your accountant" line now, or only once the accountant has confirmed the shop's
   status?
7. **Planning engine.** The two designs disagree on parameters (rhythm 18 days with estimated order days in design
   v2, against 14.5 with a 7 to 30 limit in stock-and-ordering), giving Order by 6 Dec against 5 Dec. Settle this in
   the engine build. Q5 follows whatever ships.
8. **Data gaps.** Rent, salaries and the manager's pay are not recorded, so net margin and payout suggestions are
   overstated. Batches 1 and 2 have no order day. No batch names a supplier.
9. **Usual.** Is "usual from 3 full periods" right? It means a monthly usual from February 2027 and a quarterly
   usual from Q3 2027.
