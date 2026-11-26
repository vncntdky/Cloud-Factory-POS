# Cloud Factory: fact base (baseline)

As of **Thursday 26 Nov 2026, 18:59 Manila**. Period: **27 Oct to 26 Nov 2026 (31 days)**. Every number below comes
from `analysis/baseline.py`. The script holds the query results as data, so it re-runs offline:
`python3 analysis/baseline.py`. It also writes `analysis/baseline_metrics.json` (181 metrics, each with its unit,
formula and date). Amounts are in pesos (₱). The database stores centavos, and the script divides by 100.
The script's checks match the owner's `finance_report` exactly: net sales, landed COGS, net profit, receivables,
October inventory, and the balance identity.

## Bottom line

**Supply limits this shop, not demand.** All 60 pieces it bought sold, so both batches sold through 100%.
Sales track how full the shelf is: 3.6 pieces a day with 7 to 10 flavours on the shelf, 0.85 a day with 1 to 3 (4.3×).
The shop was completely empty for 3.4 of the 31 days, and it has been empty again since 11:16 today.

- **Cost of each empty day.** About ₱354 of gross profit at the average pace, or ₱576 when the shelf is full.
- **Cost of ordering after the shelf is empty.** With a 7-day delivery this costs about ₱2,478 of gross profit per
  order cycle, which is 26% of all gross profit to date.
- **Total lost to empty shelves so far.** Between ₱1,196 (whole shop empty only) and ₱7,885 (every empty flavour,
  assuming no buyer switches flavour). The middle estimate is about ₱5,134.

The reorder plan's fixed lines rest on almost no history:

- **Delivery days:** no order has both an order day and an arrival day yet.
- **Order rhythm:** two gaps, 13 and 16 days.
- **How long an order lasts:** two batches, 10.4 and 16.6 days.

The app's current pace also counts empty days as zero demand. It shows all ten Black TEO flavours at the same
0.18 pieces a day, while their real pace on the shelf ran from 0.18 to 0.85. Two of the fastest XBLACK MAX flavours
show a pace of 0.

**Decision for the planning engine:** measure pace only on days in stock, and treat delivery time as a labelled
starting guess until Batch 3 arrives. The next lever is the timing of each order (before the shelf runs out), not
its size.

## Situation, complication, resolution

- **Situation.** The shop is one month old and runs three batches of about 30 to 40 pieces each.
  - Net sales are ₱19,800. Gross margin at landed cost is 48.3%. Net profit as recorded is ₱8,827.
  - Owner capital is ₱5,039 and ₱4,232 has been distributed.
- **Complication.** Each batch sold out before the next one arrived.
  - Sales fall about 4× as flavours run out.
  - 73% of sales are on credit, collected in a median of 9 days.
  - Cash is ₱340, and 75% of the shop's assets are the ₱7,214 Batch 3 order still on the way.
  - The reorder plan uses fixed lines (7 delivery days, 3 spare days, 14 days of cover, reorder alert at 5 pieces)
    that the history neither supports nor contradicts. There is too little history to test them.
- **Resolution (for the other workstreams).** Build every suggestion on four measured quantities:
  - pace while in stock
  - delivery time, learned from each order's order and arrival days
  - order rhythm
  - days to collect

  Until each has enough history, show its starting guess and label it as one. Order by the reorder point, before the
  shelf runs out.

## Assumptions

| # | Assumption |
|---|---|
| A1 | The period runs from the first stock and first sale (27 Oct, 09:15) to the data pull (26 Nov, 18:59). "Days" are calendar days unless marked. |
| A2 | Batches 1 and 2 have no order day recorded, so their arrival day is used as the order day. Batch 3's order day (25 Nov) is the day it was entered. The real order may have been earlier. |
| A3 | A batch arrives at its first stock movement. A flavour sells out the first time its running stock (the sum of `stock_movements.delta`) reaches 0. Blue Freeze's 22 Nov sale was voided and rung again on 25 Nov to the same buyer; this is treated as a correction. |
| A4 | Lost-sales estimates use the shop's own pace while in stock and the average landed margin of ₱159.45 a piece. Demand is assumed flat over the month: 31 days is too short to see a trend or a weekly pattern. |
| A5 | Invested capital = receivables + inventory at landed cost + stock on the way − owed to suppliers. Cash is excluded, and no fixed assets are recorded. Net profit as recorded stands in for NOPAT: the app's tax rate is 0%, and a 3% sensitivity is shown. |
| A6 | Expenses are as recorded: ₱740 in total. No rent, salaries or owner time are recorded, so the margins overstate the full economics. |
| A7 | Buyers are counted by pseudonymous number. The same name counts as the same buyer. No names appear in these files. |
| A8 | Cash sales are paid at the till on the sale day. A credit sale counts as collected on the business day of its last payment. |

## Issue tree

The branches the other workstreams should prioritise are marked ★.

- Profit = net sales − landed COGS − expenses − tax
  - Net sales = pieces × price
    - **Pieces = days in stock × pace while in stock ★** (empty days, empty flavours, and when orders are placed)
    - Price: list price, no discounts, ₱320 to ₱340 a piece (little leakage today)
  - Landed COGS = unit cost + batch fees ÷ pieces. Fees are 3.8% to 5.0% of goods, which falls with bigger orders.
  - Expenses are ₱740 so far. Unrecorded costs (rent, salaries) are a data gap.
  - Tax: 0% in the app against a 3% percentage tax in law. This is a compliance gap, not a planning lever.
- Capital tied up = receivables + inventory + stock on the way
  - **Receivables: credit share × days to collect ★**
  - Inventory: about 4.4 days. This is small because stock sells out.
  - **Stock on the way: paid at order × delivery days ★** (delivery time is unknown)
- Distributions are capped by safe to distribute, which is ₱340 today.

## 1. Date range and trading days

| Metric | Value | Formula |
|---|---|---|
| Calendar days | 31 | 27 Oct → 26 Nov, both days counted |
| Days with at least one sale | 19 | distinct `business_date` of completed sales |
| Days the shop had stock | 27.03 | time with total pieces on the shelf > 0 |
| Days the whole shop was empty | 3.38 | 6 Nov 18:31 → 9 Nov 19:55 (3.06 days), and 26 Nov 11:16 → 18:59 (0.32 days, still empty) |

**So what:** about 1 day in 9 had nothing to sell. Pace should be measured over days in stock (27.0), not calendar
days (31). Otherwise every empty day reads as a day with no demand.

## 2. Sales, price, discounts and the pocket price

| Metric | Value | Formula |
|---|---|---|
| Gross sales | ₱19,800 | Σ subtotal of 51 completed sales |
| Discounts | ₱0 | Σ discount. Every line sold at the product's list price. |
| **Net sales** | **₱19,800** | gross − discounts (equal to `finance_report` net) |
| Pieces sold | 60 | 30 XBLACK MAX (₱320) + 30 Black TEO (₱340) |
| Average price | ₱330.00 a piece | net ÷ pieces |
| Average ticket | ₱388.24 (1.18 pieces) | net ÷ sales |
| Net sales per calendar day | ₱638.71 | ÷ 31 |
| Net sales per day with stock | ₱732.63 (2.22 pieces) | ÷ 27.03 |
| Voids | 1 sale (1 piece) | rung again on 25 Nov |

Pocket price per piece (list price → cash in hand):

| Step | ₱ a piece |
|---|---|
| List price | 330.00 |
| − Discounts | 0.00 |
| − Payment fees (all payments in cash) | 0.00 |
| − Still owed (not yet in hand) | −34.67 |
| **= Cash in hand to date** | **295.33** (10.5% not yet collected) |

**So what:** there is no discount leakage. The only gap between list price and pocket price is credit: 10.5% of sales
is not yet in hand. Nothing has been written off yet. Pricing is not the lever today, but credit terms are.

## 3. Gross margin, at cost and at landed cost

| Metric | Value | Formula |
|---|---|---|
| COGS at unit cost | ₱9,750 | Σ qty × unit cost |
| COGS at landed cost | ₱10,233 | Σ qty × (unit cost + batch fees ÷ pieces received), equal to `finance_report` |
| **Gross margin at cost** | **50.8%** | (19,800 − 9,750) ÷ 19,800 |
| **Gross margin at landed cost** | **48.3%** | (19,800 − 10,233) ÷ 19,800 (₱9,567) |
| Landed margin per piece | ₱159.45 | 9,567 ÷ 60 |

| Batch / line | Price | Unit cost | Fees a piece | Landed cost | Landed margin | % |
|---|---|---|---|---|---|---|
| 1 XBLACK MAX | ₱320 | ₱160 | ₱7.97 (₱239 ÷ 30) | ₱167.97 | ₱152.03 | 47.5% |
| 2 Black TEO | ₱340 | ₱165 | ₱8.13 (₱244 ÷ 30) | ₱173.13 | ₱166.87 | 49.1% |
| 3 BLXCK Signature | ₱340 | ₱165 | ₱6.60 (₱264 ÷ 40) | ₱171.60 | ₱168.40 | 49.5% |
| 3 Device V5 | ₱350 | ₱200 | ₱6.60 | ₱206.60 | ₱143.40 | 41.0% |

**So what:** batch fees are a fixed cost per order, about ₱240 to ₱265 in shipping. They fall from 5.0% to 3.8% of
goods as orders grow from 30 to 40 pieces. From Batch 1 to Batch 2 the price rose 6.25% while cost rose 3.1%, which
added ₱14.83 of landed margin per piece. The device's margin is 8 points below the pods.

## 4. Expenses and net profit

| Month | Days | Pieces | Net sales | Landed COGS | Expenses | Net profit | Net sales a day |
|---|---|---|---|---|---|---|---|
| Oct (27 to 31) | 5 | 24 | ₱7,680 | (₱4,031.20) | ₱0 | ₱3,648.80 | ₱1,536 |
| Nov (1 to 26) | 26 | 36 | ₱12,120 | (₱6,201.80) | (₱740) | ₱5,178.20 | ₱466 |
| **Total** | 31 | 60 | **₱19,800** | (₱10,233) | (₱740) | **₱8,827** | ₱639 |

The November expenses were Other ₱640 (9 Nov, charged to Batch 1) and Utilities ₱100 (24 Nov, charged to Batch 2).
Net margin is 44.6%. At the statutory 3% percentage tax, tax would be ₱594 and net profit ₱8,233.

**So what:** November's sales per day are a third of October's. The cause is empty and thin shelves (§6), not a
fall in demand. Net margin looks very high because no rent, salaries or owner time are recorded. Do not use 44.6%
as the shop's real operating margin, or as a basis for break-even, until those costs are entered.

## 5. Balance and cash on 26 Nov (owner's `finance_report`, rolled back)

| What the business holds | ₱ | Owed and owners' share | ₱ |
|---|---|---|---|
| Cash | 340 | Tax payable (rate 0%) | 0 |
| Receivables | 2,080 | Owed to suppliers | 0 |
| Inventory | 0 (sold out) | Owner capital | 5,039 |
| Stock on the way (Batch 3) | 7,214 | Profit earned | 8,827 |
| | | − Distributions (25 Nov) | (4,232) |
| **Total** | **9,634** | **Total** | **9,634** |

- **Safe to distribute: ₱340**, the lower of profit kept (₱4,595) and spare cash (₱340). The inventory reserve is now 0.
- **Owner capital ₱5,039:** Batch 1 was paid with the owner's money. There are no capital entries.
- **Distributions:** ₱4,232 on 25 Nov, split owner ₱2,821.33 and manager ₱1,410.67 (2 : 1), which is 47.9% of
  profit to date. Batch 3 (₱7,214) was paid from the company fund on the same day.
- **Inventory reserve decisions:** 5 so far (₱0, ₱7,194, ₱5,194, ₱7,250, ₱7,014). Each one is close to the
  cost of one batch.

**So what:** 75% of assets are stock that cannot be sold yet. Cash covers nothing beyond today. The reserve and the
distribution compete for the same cash each cycle: ₱11,786 before 25 Nov (340 + 7,214 + 4,232). A data-driven "next order" estimate (goods + fees, from
pace × cover) is what should set the reserve.

## 6. Batches, empty shelves and sales lost

| Batch | Pieces | Cost in full | Landed a piece | Arrived | Last piece sold | Days to sell through | Sell-through | Sold by day 4 / 7 / 14 | Pace (pieces a day) | Net profit |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 XBLACK MAX | 30 | ₱5,039 | ₱167.97 | 27 Oct 09:15 | 6 Nov 18:31 | 10.4 | 100% | 23 / 24 / 30 | 2.89 | ₱3,921 |
| 2 Black TEO | 30 | ₱5,194 | ₱173.13 | 9 Nov 19:55 | 26 Nov 11:16 | 16.6 | 100% | 13 / 16 / 28 | 1.80 | ₱4,906 |
| 3 BLXCK + Device | 40 | ₱7,214 | ₱171.60 / ₱206.60 | on the way (ordered 25 Nov) | — | — | — | — | — | — |

Net profit = net sales − cost in full − expenses charged to the batch. Batch 1 is ₱9,600 − 5,039 − 640;
Batch 2 is ₱10,200 − 5,194 − 100.

- **Payback.** Net sales covered the batch's cost in full 2.4 days (Batch 1) and 6.1 days (Batch 2) after arrival.
  Cash collected covered it after 10 and 11 days, because of credit.
- **Time on the shelf.** A piece stayed 2.9 days on average (Batch 1) and 6.2 days (Batch 2).

**Empty shelf per flavour** (3 pieces each; running sum of `stock_movements.delta`):

| | Fastest | Median | Slowest |
|---|---|---|---|
| Days to sell out 3 pieces | 1.4 (Mixed Berries, B1) | 7.4 | 16.4 (Sparkle Squeeze, B2) |
| Empty days inside its batch's selling window | 9.0 (Mixed Berries); 13.1 (Red Pulp, B2) | — | 0 |

The coefficient of variation of the days to sell out is 0.55. Flavours differ a lot, so one shop-wide pace would
over-stock some flavours and run out of others.

**Pace by how full the shelf was** (both batches, split into periods by how many of the 10 flavours were in stock):

| Flavours on the shelf | Days | Pieces | Pieces a day | Pieces per flavour a day |
|---|---|---|---|---|
| 7 to 10 | 11.1 | 40 | **3.61** (3.38 without the first 24 h after each arrival) | 0.39 |
| 4 to 6 | 8.8 | 14 | **1.58** | 0.34 |
| 1 to 3 | 7.1 | 6 | **0.85** | 0.66 |

**So what:** sales per flavour stay roughly flat while total pace falls 4.3× as flavours run out. Buyers do not
simply switch to what is left; much of the demand walks away. This finding holds with or without the launch days.
It could be partly confounded by novelty wearing off within each batch; see Risks.

**Sales lost to empty shelves.** These three estimates are mutually exclusive: L1 covers time with the whole shop
empty, and L2 covers time when some flavours were empty while the shop had stock.

| Estimate | Pieces | Gross profit lost | Method |
|---|---|---|---|
| L1: whole shop empty (floor) | 7.5 | **₱1,196** (₱2,476 of sales) | 2.22 pieces a day while in stock × 3.38 empty days × ₱159.45 |
| L2 middle: shelf kept at 7 or more flavours | 31.2 | **₱5,134** | (3.38 pieces a day × each batch's selling days − pieces sold) × that batch's landed margin |
| L2 upper: every empty flavour-day, no switching | 50.0 | **₱7,885** | per batch: pieces ÷ in-stock flavour-days × empty flavour-days × margin |
| Current gap until Batch 3 arrives | — | ₱1,427 / ₱2,135 / ₱3,197 | if delivery takes 5 / 7 / 10 days from 25 Nov: 4.0 / 6.0 / 9.0 empty days × ₱354 |

These rates come from the same history:

- ₱354 of gross profit per empty day at the shop's average pace (2.22 × ₱159.45).
- ₱576 per day when the shelf is full (3.61 × ₱159.45).
- ₱2,478 per order cycle when the order goes in at sell-out with 7 days' delivery (7 × ₱354). That is 26% of all
  gross profit so far.

**So what:** lost sales from empty shelves are the largest profit lever in the data. The L1 floor alone is 12.5% of
gross profit to date, and the middle estimate is 54%. The fix is timing: order when stock falls to the reorder point,
not when the shelf is empty. Batch 3 was ordered 1.5 days before Batch 2's last piece sold. Order size comes second:
40 pieces last about 18 days at the average pace, or about 12 days with a full shelf.

## 7. Concentration (Pareto)

| View | Result | Formula |
|---|---|---|
| By sales value | 16 of 20 products make 80% of sales | Each flavour sold exactly 3 pieces, because sales were capped by supply |
| **By speed** | **12 of 20 flavours make 80% of demand speed. The top 4 (20%) make 45%.** | rank by in-stock pace (3 ÷ days in stock), cumulative share |
| Fastest four | Mixed Berries 2.13, Strawberry Ice 1.38, Gummy Bear 0.92, Mango 0.89 pieces a day (all XBLACK MAX) | |
| Not sold yet | 11 products (10 BLXCK Signature flavours and the device) | they arrive with Batch 3 |

**So what:** a Pareto chart by sales value is meaningless here: it shows what was bought (3 of each), not what buyers
want. Rank by speed while in stock instead. The 80/20 is weaker than the classic rule, about 60/80, but real: within a
line the fastest flavour sells 4.6× (Black TEO) to 7.4× (XBLACK MAX) faster than the slowest, and 11.6× across both. The fastest line, XBLACK MAX, sold 2.9 pieces a day
against Black TEO's 1.8, and it has not been ordered again. This is a hypothesis for the product-mix workstream.

## 8. Credit, collections and DSO

| Metric | Value | Formula |
|---|---|---|
| **Share of sales on credit** | **73.4% of value** (37 of 51 sales) | sales rung as not paid yet ÷ net sales |
| Collected later | ₱12,460 | Σ `sale_payments` |
| **Days to collect** (31 credit sales fully paid) | **median 9**, mean 8.7, sales-weighted 9.3, p80 11, p90 13, p95 13, max 21 | business day of the sale → business day of the last payment |
| Collection time distribution | same day 1 · 1 to 7 days 10 · 8 to 14 days 19 · 15 to 30 days 1 | |
| By batch period (median / mean) | Batch 1: 9 / 10.0 days · Batch 2: 8 / 7.1 days | |
| **Still owed** | **₱2,080 (10.5% of net sales)** on 6 sales by 6 buyers | Σ balance |
| Still owed by age | 0 to 7 days: ₱1,700 · 8 to 30 days: ₱380 · over 30 days: ₱0. Oldest 16 days; weighted age 5.5 days | age = 26 Nov − sale day |
| Largest single buyer's share of what is owed | 32.7% | |
| Bad debt written off | ₱0 | |
| DSO, from the end balance | 3.3 days | 2,080 ÷ (19,800 ÷ 31) |
| **DSO, from the daily average balance** | **6.2 days** | average daily receivables ÷ (19,800 ÷ 31) |
| Buyers | 31 distinct; 11 repeat (2 or more sales) make 61.8% of sales; 77% have bought on credit at least once | |

**So what:** credit is the norm, not the exception. It is collected reliably but slowly. Nine days is roughly one
order cycle, so a batch's own cash comes back only around the time the next order must be paid for (payback in cash
took 10 to 11 days against 2.4 to 6.1 days in sales). The Help text's chase after 7 days is tighter than the
shop's own history: only 35% of credit sales were paid within 7 days, 97% within 14, and p90 is 13 days. Data-driven aging buckets should come
from this distribution once at least 10 credit sales have been paid.

## 9. Working capital and the cash conversion cycle

| Metric | Value | Formula |
|---|---|---|
| DSO (average) | 6.2 days | §8 |
| DIO (average) | 4.4 days | average daily inventory at landed cost ÷ (landed COGS ÷ 31) |
| DIO now | 0 days | sold out |
| DPO | 0 days | suppliers were paid on the arrival day (Batches 1 and 2) or at order (Batch 3) |
| **Cash conversion cycle** | **10.6 days** | DSO + DIO − DPO |
| Plus prepaid stock on the way | +1.4 days on average so far (Batch 3 since 25 Nov) | average stock on the way ÷ (COGS ÷ 31) |
| Cash-to-cash per piece | 11.1 days (Batch 1 10.4; Batch 2 11.7) | per piece: day its money came in − day the supplier was paid (open balances counted to 26 Nov) |
| Days on the shelf per piece | 4.6 (Batch 1 2.9; Batch 2 6.2) | sale time − batch arrival |

**So what:** the cycle is short (about 11 days), but credit makes up most of it (DSO 6.2 against DIO 4.4). Paying
for stock at order adds the full delivery time to the cycle: about 7 days if delivery takes a week. Supplier terms
(pay on pick-up) and cash at the till are worth about as much as faster selling.

## 10. Orders, delivery time and the reorder plan's fixed lines

| Fact | Value | What the plan uses today |
|---|---|---|
| Order days | 27 Oct, 9 Nov, 25 Nov (Batches 1 and 2: arrival day used, A2) | — |
| Gap between orders | 13 and 16 days (mean 14.5, standard deviation 2.1, n = 2) | cover 14 days |
| **Delivery days (order → arrival)** | **0 observed orders.** Batch 3 has been on the way 1.8 days. The owner's stated range is 5 to 7 days. | **7 days (set by hand)** |
| How long an order lasted | 10.4 and 16.6 days (mean 13.5, standard deviation 4.4, n = 2) | lead 7 + spare 3 + cover 14 = 24 days |
| Spare (buffer) days | Delivery-time spread cannot be measured yet | **3 days (set by hand)** |
| Empty gap between batches | 3.06 days (Batch 1 → Batch 2); now open again since 26 Nov 11:16 | — |
| Batch 3 ordered before Batch 2 sold out | 1.5 days | — |
| Reorder point implied by the current formula | 22 pieces (2.22 × (7 + 3)) | each flavour's alert is fixed at 5 pieces, but every batch brings 3, so "Low" is always on |
| Order size implied by the current formula | 53 pieces (2.22 × 24) | actual orders: 30, 30, 40 |
| App pace against in-stock pace | App pace is lower by a median of 2.6×, and up to 24.8× for a flavour that sold out early. 2 of the fastest flavours read 0 (idle). All 10 Black TEO flavours read 0.18 a day, against 0.18 to 0.85 in stock. | 28-day window, empty days counted |

**So what for the planning engine:**

1. The current pace is biased low for exactly the products that matter, the fast sellers. Use in-stock days.
2. Delivery time has no history at all, so every lead-time-based number is a guess. Record `ordered_on` on every
   order. Batch 3's arrival will be the first real measurement.
3. Order rhythm (14.5 days) and cover (13.5 days) agree with each other but disagree with the plan's 24 days. The
   shop orders smaller and more often than the plan assumes.
4. With 3 pieces a flavour and a fixed alert at 5, the Low badge carries no information. Alerts must follow each
   flavour's own reorder point.

## 11. ROIC proxy

| Metric | Value | Formula |
|---|---|---|
| Average invested capital | ₱5,884 | mean daily (receivables + inventory + stock on the way − owed to suppliers) |
| Invested capital on 26 Nov | ₱9,294 | 2,080 + 0 + 7,214 |
| **ROIC (31 days)** | **150%** | 8,827 ÷ 5,884 |
| ROIC tree | 44.6% net margin × 3.37 capital turnover | (8,827 ÷ 19,800) × (19,800 ÷ 5,884) |
| With 3% percentage tax | 140% | (8,827 − 594) ÷ 5,884 |
| Simple annualised | about 17.7× | × 365 ÷ 31. Not meaningful at this scale. |

**So what:** each peso tied up in stock and credit earns about ₱1.50 a month before unrecorded costs. Growth is
limited by cash and by being in stock, not by returns, so reinvesting in stock beats distributing at this point.
The return is high because the capital base is small and costs such as rent and labour are not recorded.

## 12. When it sells

63% of pieces are rung between 5 pm and midnight. Tuesday shows 25 of 60 pieces, but these are launch days (27 Oct, and 10 Nov, Batch 2's first full day) and
17 Nov, not a real weekly pattern; there is too little data for one.

## Risks: what would prove these findings wrong

- **Novelty, not shelf fullness, explains the falling pace.** Test: Batch 3 has 10 flavours plus the device. If pace
  stays near 3.4 pieces a day for longer than about 4 days with 7 or more flavours on the shelf, the shelf-fullness
  effect holds. If it decays while the shelf is still full, the lost-sales estimates shrink toward the L1 floor.
- **The XBLACK MAX line was faster partly because it was new and ₱20 cheaper.** Price elasticity cannot be separated
  with two price points and two different product lines.
- **Delivery may be slower or more variable than 7 days.** Then the empty gaps and their cost grow, at about ₱354 per
  extra day.
- **Credit losses.** None yet, but ₱380 is more than 7 days old and 6 buyers owe ₱2,080. One default of ₱680 (the largest
  open balance) would wipe out 7.1% of gross profit to date.
- **Tiny samples.** n = 2 for order gaps and sell-through, 31 for collections, and 20 flavours with 3 pieces each.
  Every derived number here is a point estimate with wide error. The engine should blend each one with a starting
  guess and say "rough" until about 5 orders and 10 or more collections exist.

## Open questions and data gaps

1. What were the real order days for Batches 1 and 2, and for Batch 3 (was it ordered before 25 Nov)? Without them,
   delivery time cannot be learned.
2. Are rent, salaries, the manager's pay and the owner's time costs the shop should record? Net margin, break-even
   and ROIC depend on them.
3. Was XBLACK MAX dropped on purpose (supplier, price or quality), or should it be reordered given its speed?
4. The tax rate is 0% in the app. Philippine law sets a 3% percentage tax for non-VAT businesses with sales of
   ₱3M or less (₱594 on sales to date). An accountant should confirm the shop's status and filings.
5. Should credit have a limit per buyer, and what age triggers a chase? The data says 35% are paid within 7 days,
   97% within 14, and p90 is 13 days.
6. What does shipping cost for a bigger order? Fees were ₱239 to ₱264 for 30 to 40 pieces. If shipping is flat, it
   argues for larger, earlier orders.

## Sources

Shop data:

- Live Supabase project, read-only SELECTs and the owner's `finance_report('2026-10-01', '2026-11-26')` and
  `batch_statements()` in a rolled-back transaction, pulled 26 Nov 2026 18:59 Manila.
- `docs/finance-guide.md` and `docs/HISTORY.md`.
- `lib/restock.ts`: 28-day pace window; default plan 7 / 3 / 14.

External (rules only; no shop figures were used in any search):

- Percentage tax under NIRC Sec. 116 returned to 3% from 1 July 2023, after the 1% CREATE rate of 1 Jul 2020 to
  30 Jun 2023. Sources: BIR Revenue Memorandum Circular 69-2023 (20 Jun 2023), as summarised by
  [Grant Thornton PH](https://www.grantthornton.com.ph/alerts-and-publications/technical-alerts/tax-alert/2023/reversion-of-regular-corporate-income-tax-to-10-for-proprietary-educational-institutions-and-non-profit-hospitals-percentage-tax-to-3-and-minimum-corporate-income-tax-to-2-effective-july-1-2023/)
  and [Forvis Mazars PH](https://forvismazars.com/ph/en/insights/tax-alerts/bir-revenue-memorandum-circular-no.-69-2023)
  (2023). Filing uses BIR Form 2551Q, within 25 days after each quarter.
- The VAT threshold is ₱3,000,000 of gross sales (NIRC Sec. 109(BB), as amended by TRAIN, RA 10963). Source:
  [Grant Thornton indirect tax guide, Philippines](https://www.grantthornton.global/en/insights/indirect-tax-guide/indirect-tax---Philippines/)
  (accessed 26 Nov 2026). Whether it is measured over a rolling 12 months or a calendar year is reported
  differently by different sources; confirm with the BIR.
- Safety stock = z × σ × √(lead time). Service level z-values: 90% = 1.28, 95% = 1.65, 97.5% = 1.96, 99% = 2.33
  (standard normal). Sources: [Shopify, Safety stock](https://www.shopify.com/retail/safety-stock) and
  [IBM, What is safety stock](https://www.ibm.com/think/topics/safety-stock) (accessed 26 Nov 2026).
- None of this is tax or accounting advice. A qualified accountant should confirm the shop's tax position.
