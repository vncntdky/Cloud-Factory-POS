# Stock and ordering: when to order, how much, which flavours (branch 1 of 4)

As of **Thursday 26 Nov 2026, 18:59 Manila**. I re-checked the live data at 19:15 and nothing had changed:
51 sales, 60 pieces, 81 stock movements, Batch 3 still on the way, every product at 0 pieces.

Every number below comes from `analysis/stock-and-ordering.py`. Run `python3 analysis/stock-and-ordering.py`; it
takes about 2 minutes and needs only numpy and pandas. The script reads the data block of `analysis/baseline.py` and
changes nothing. Amounts are in pesos (₱). "Gross profit" means after restocking fees.

## Assumptions

| # | Assumption |
|---|---|
| A1 | The data is the read-only pull of 26 Nov 18:59 (the same one as the fact base). Today is 26 Nov. |
| A2 | Delivery time is 5 to 7 days, as the owners stated, because no order has an order day and an arrival day yet. The plan uses 7 days with a spread of 1.75 days (a quarter of the mean) until real orders arrive. |
| A3 | Demand model: buyers arrive at random (Poisson). Each wants one flavour; some flavours are more popular (log-normal spread). If the wanted flavour is out, the buyer either takes another flavour or leaves. I fitted the number of buyers a day, the spread and the share who take another flavour to Batches 1 and 2 (§4.1). Demand is held flat at the Batch 2 level; launch and novelty effects are not modelled. |
| A4 | Restocking fee per order ≈ ₱174 + ₱2.25 a piece. This is a straight-line fit to three orders (₱239, ₱244, ₱264 for 30, 30 and 40 pieces), and all of it was shipping. |
| A5 | Holding cost is 25% a year of stock value, the middle of the usual 20 to 30% range (external). Because the shop is short of cash, 100% a year and 10% per order cycle are shown as tests. |
| A6 | Cash timing: 26.6% of sales are paid at the till. Credit sales are collected after the shop's own 31 observed collection times (median 9 days). Orders are paid on the day they are placed, as Batch 3 was. Running costs are ₱24 a day (₱740 ÷ 31 days). |
| A7 | Pods and devices are planned separately. The 10 devices on Batch 3 do not count as pod stock. |
| A8 | The simulation re-orders the same 10-flavour range each time. In real life the shop has changed line with every batch (Batch 1 XBLACK MAX, Batch 2 Black TEO, Batch 3 BLXCK Signature), so no flavour has been re-ordered yet. |
| A9 | Margins: ₱340 price, ₱165 cost, and ₱159.45 landed margin a piece. That margin sets the value of an empty day. |
| A10 | Privacy: only totals are used. No buyer names appear anywhere. External searches used generic words only. |

## 1. Bottom line

**The lever is timing, not size.**

- Ordering when stock falls to a reorder point, instead of when the shelf is nearly empty as now, raises gross profit
  from about **₱6.7k to ₱10.7k–11.3k a month** at today's demand. That is **+₱3.7k to ₱4.0k a month** (between
  ₱3.2k and ₱4.7k in every test). The shelf goes from about 3–4 empty days a month to almost none.
- Today's capital, about one batch, is enough to do this. The condition is that when the order-by date comes, the
  owners **order what the cash buys** rather than waiting until a full batch is affordable.
- Bigger orders to save shipping are worth only ₱80 to ₱180 a month.
- Tilting flavours by speed is worth about ₱500 a month, and only once a line is re-ordered.

**The draft engine must not ship as written.** On live data, methods 3 to 6 suggest **497 pieces (₱80,770)**. The
shop has never ordered more than 40 (₱7,214).

- Planning from the shop's total pace and splitting it across flavours (top-down) gives **36 pieces (₱5,815)**. That
  matches how the shop really buys.
- Today the fixed engine would say: **"Order by Sat 5 Dec: about 33 pieces, about ₱5,700 with shipping. On that day
  your cash buys about 14."**

**Decision needed from the owner:** approve the top-down engine, with ordering by date and "fits your money", for
build now. Record each order on the day it is placed, and tap Arrived the day it comes.

## 2. Situation, complication, resolution

- **Situation.** Each batch has been one line of 10 flavours × 3 pieces (40 pieces for Batch 3). The next order was
  placed around the time the shelf ran out: 1.5 days before Batch 2's last piece. The shop now has 0 pieces, ₱340
  in cash and ₱2,080 owed to it. Batch 3 (₱7,214) is on the way.
- **Complication.**
  - **Buyers mostly leave when their flavour is out.** The best fit is that only about 15% take another flavour
    (§4.1). So every empty flavour-day and every empty shop-day loses sales: ₱354 to ₱576 of gross profit per
    empty shop-day.
  - **The draft engine overstates the order 10 times.** It adds up per-flavour paces measured only on the few days
    each flavour was on the shelf. That gives 16.1 pieces a day, where the shop sells 2.0 to 2.2.
  - **The batch's own cash comes back too late.** With 73% of sales on credit, the cash for a full next batch is
    there only about 12 days after a batch arrives. By then the batch is almost sold out (§4.4).
- **Resolution.**
  1. **Plan top-down.** Work out the shop's pace, delivery time and spare stock, give one order-by date and one
     next-order size, and split them across flavours by speed.
  2. **Order on the date, in whatever size the cash allows.** The simulation keeps about 95% of the gain that
     unlimited cash would bring.
  3. **Let the plan learn.** Delivery time comes from each order's order and arrival days; pace comes from days with
     stock.

## 3. Issue tree (★ = prioritised)

The question: what stock should the shop hold and order, and what should the app work out, to earn the most gross
profit per peso of cash?

- **Run out less**, which means losing fewer sales
  - **★ When to order:** the reorder point = pace × delivery days + spare stock (methods 1, 5, 6)
    - **★ Pace:** the shop's total pace, split by flavour (method 3)
    - **★ Delivery time and its spread:** learned from orders (method 1)
  - **★ Can the shop pay on that date?** Cash on the order-by day versus the cost of the order; fits-your-money
    (needs design §8)
  - Which flavours get more pieces: depth by speed (methods 3, 4, 6), *small effect (₱0.5k a month)*
- **Spend less per piece and tie up less cash**
  - Order size against shipping and holding cost (EOQ) (method 2, cover), *small effect (₱80 to ₱180 a month)*
  - Weekly or fortnightly orders, *a wash (within ±₱200 a month)*
  - Pay on pick-up instead of at order: frees ₱2.6k to ₱4.2k for 5 to 7 days in every cycle (owner action)
- **Hold the right range**
  - New flavours and new lines: no history yet, so no suggestion until they are on the shelf (method 6, New)
  - Slow stock: a "Not selling" list with the cost tied up (method 6). This is ₱0 today, because everything sold.
  - Signals: low-stock alert (method 7) and the batch report (method 10). They must agree with the order-by date.

*Deliberately left out:* pricing, credit terms and payouts (other branches), except where cash limits when the shop
can order.

## 4. Analysis

### 4.1 What the shelf history says

**Pace by how many of the 10 flavours were on the shelf.** Each sale is counted at the number of flavours on the
shelf just before it was rung.

| Flavours on the shelf | Days | Pieces | Pieces a day | Batch 1 | Batch 2 |
|---|---|---|---|---|---|
| 7 to 10 | 11.08 | 40 | **3.61** | 5.90 | 2.60 |
| 4 to 6 | 8.84 | 13 | 1.47 | 1.73 | 1.25 |
| 1 to 3 | 7.10 | 7 | 0.99 | 1.01 | 0.97 |
| Any stock (λ_any) | 27.03 | 60 | **2.22** | 2.89 | 1.80 |

The fact base counts each sale after it is rung, which gives 1.58 and 0.85 for the two lower rows. The conclusion is
the same either way.

**Do buyers take another flavour or leave?** I fitted the demand model [A3] to Batches 1 and 2: days to sell 30,
pace in each row above, and the median and spread of the days each flavour took to sell out.

| Share who take another flavour | 0% | **15%** | 30% | 45% | 70% | 100% |
|---|---|---|---|---|---|---|
| Fit error (lower is better) | 4.75 | **1.59** | 1.97 | 2.42 | 3.57 | 5.41 |

- **Best fit:** 15% switch, with 4.5 buyers a day for Batch 1 (the opening rush) and 2.75 for Batch 2.
- **The model is slightly conservative.** It sells Batch 2 in 19.2 days, against 16.6 days in real life.
- **External reference.** In the worldwide out-of-stock study by Gruen, Corsten and Bharadwaj (2002; grocery,
  71,000 shoppers), about 45% bought a substitute in the same store and about 40% were lost to the store. This shop
  loses more.

**So what:** most of a missing flavour's sales are lost, not moved to another flavour.

- Being in stock is worth real money: ₱354 of gross profit per empty shop-day at 2.22 a day, and ₱576 at the
  full-shelf pace.
- Each line's flavour paces cannot be added up. Their sum (8.33 a day for XBLACK MAX, against 2.89 for the line) is
  inflated by the opening rush and by the 3-piece cap: a flavour that sells its last of 3 pieces reads 1.5× too
  fast.
- The safe way to plan is from the shop's measured pace. Flavour speed should only set each flavour's share.

### 4.2 The draft design on live data (methods 1 to 7 and 10)

| Engine | Pace summed | Suggested now | Goods | Statuses | Reorder point / target per flavour |
|---|---|---|---|---|---|
| Design as written (pool = brand + name) | 16.10 a day | **497 pcs** | **₱80,770** | 30 Order now, 1 Soon | 4–25 / 9–60 |
| Design, pool = category | 12.84 a day | 410 pcs | ₱66,755 | 30 Order now, 1 Soon | 5–9 / 10–21 |
| **Top-down** (shop pace 2.01 a day, half-life 28 days, z 1.645) | 2.01 a day | **36 pcs** | **₱5,815** | 20 Out, 11 New | 0–1 / 1–3 |
| Shop's real orders | — | 30, 30, 40 | ₱4,800–6,950 | — | — |

- I reproduced the maths review's figures exactly (497 / ₱80,770 and 410 / ₱66,755).
- The top-down engine's shop totals are a reorder point of 22.6 pieces and a target of 55.6 pieces.
- The safety factor hardly matters: z = 1.28, 1.645 and 1.96 all give 36 pieces.

**So what:** the per-flavour build-up is the defect. It inflates pace (summing flavours), safety stock (rounded up
for each flavour) and status (every sold-out flavour shows Order now while 30 pods are on the way).

Verdicts on each method (the design changes are listed in §6):

| Method | Verdict | Key number |
|---|---|---|
| 1 Delivery time | **Keep, change**: floor of 1 day; blend the average with the 7-day guess (one pretend order); spread at least 0.25 days | Each day of delivery error moves the order-by date by 1 day, ≈ ₱354 per cycle. Delivery doubt is 48% of spare stock today. |
| 2 Order rhythm | **Keep, change**: limit to 7–30 days (not 60); cut the "arrival − L" estimate for old batches | Shipping savings past 30 days of cover are under ₱184 a month (§4.5). |
| 3 Pace | **Change** to top-down: shop pace on days with stock, split by flavour speed pooled by category | 497 → 36 pieces. Measuring on 7+ flavour days instead adds only ₱28 a month (§4.3). |
| 4 Product mix (ABC) | **Change**: rank by value pace; tied products share a class; show only; **do not set z** | Classes now follow tie order (15 A / 3 B / 13 C). |
| 5 Spare stock | **Change** to one pooled shop figure at 95% | 9 pieces at 2.22 a day, against 68–83 when rounded per flavour. |
| 6 Reorder point, status, suggestion | **Change**: shop order-by date and next-order size up front; largest-remainder split; New = never on the shelf; Not selling = min(60, max(R, 3 ÷ pace)) | Order by Sat 5 Dec, about 33 pieces (§4.4). |
| 7 Low-stock alert | **Keep, change**: Auto = max(1, the flavour's reorder point) | Low today: 31 of 31 (fixed 5); as designed 30 of 31; fixed: on the last piece. |
| 10 Batch report | **Change**: use the same order-by date | As designed it says "Order now" today although 30 pods are on the way (position 33 against reorder point 22.6). |

### 4.3 When to order: reorder point against ordering at sell-out (simulation)

180 days from today's state; 200 runs per row; Batch 2 demand (2.75 buyers a day, 15% switch); delivery 5 to 7
days. The plan re-learns pace and delivery time from its own history every day.

**The four policies:**

- **sellout**: the usual 40 pieces when the shelf is down to 2 pieces (as now).
- **rop40**: 40 pieces when position (shelf + on the way) reaches the reorder point.
- **rop_S**: at the reorder point, order up to delivery + 14 days + spare stock.
- **weekly**: every 7 days, order up to delivery + 7 days + spare stock.

| Cash rule | Policy | Gross profit / month | Payouts / month | Sold / day | Sales lost / day | Fill | Empty days / month | Orders / month | Fees / month | Average cash in stock |
|---|---|---|---|---|---|---|---|---|---|---|
| No cash limit, no payouts | sellout | ₱7,417 | — | 1.47 | 1.29 | 53% | 3.1 | 1.1 | ₱283 | ₱3,407 |
| | rop_S | ₱11,261 | — | 2.23 | 0.54 | 80% | 0.8 | 1.7 | ₱458 | ₱6,646 |
| | weekly | ₱11,305 | — | 2.32 | 0.44 | 84% | 0.8 | 4.2 | ₱880 | ₱5,435 |
| **Pay out all profit the cash allows (as now)** | sellout | **₱6,674** | ₱5,464 | 1.33 | 1.42 | 48% | 3.8 | 1.4 | ₱331 | ₱2,625 |
| | rop40 | ₱10,851 | ₱8,317 | 2.19 | 0.56 | 80% | 0.8 | 2.9 | ₱649 | ₱5,432 |
| | **rop_S** | **₱10,712** | **₱8,152** | 2.16 | 0.59 | 78% | 0.8 | 2.9 | ₱651 | ₱5,317 |
| | weekly | ₱11,019 | ₱8,462 | 2.26 | 0.51 | 82% | 0.8 | 4.1 | ₱863 | ₱4,962 |
| Keep the next order's cost, pay out the rest | sellout | ₱7,417 | ₱4,934 | 1.47 | 1.29 | 53% | 3.1 | 1.1 | ₱285 | ₱3,390 |
| | rop_S | ₱11,144 | ₱6,883 | 2.22 | 0.54 | 81% | 0.8 | 2.1 | ₱514 | ₱6,310 |
| | weekly | ₱11,314 | ₱7,007 | 2.32 | 0.45 | 84% | 0.8 | 4.1 | ₱876 | ₱5,228 |
| As now + ₱7,000 owner capital | rop_S | ₱11,250 | ₱9,618 | 2.24 | 0.53 | 81% | 0.9 | 1.9 | ₱492 | ₱6,350 |

How to read this table:

- **Empty days.** The 0.8 empty days a month in the reorder-point rows are the 5 to 7 days the shop is empty now,
  before Batch 3 arrives. After that, the reorder-point policies almost never empty the shop.
- **Fill.** Fill is the share of buyers who left with a pod. The roughly 20% still lost in those rows is a single
  flavour being out, not the whole shop.
- **Gross profit.** The model's ₱6.7k a month for the as-now policy matches November's real ₱6.8k per 30 days
  (₱5,918 over 26 days).

Sensitivity tests. All rows keep the next order's cost; gross profit a month.

| Test | sellout | rop_S | weekly | Gain from rop_S |
|---|---|---|---|---|
| 0% switch (all who miss leave) | ₱5,977 | ₱10,683 | ₱10,788 | +₱4,706 |
| 45% switch (grocery-like) | ₱8,807 | ₱12,028 | ₱11,805 | +₱3,221 |
| Delivery 8–12 days | ₱6,365 | ₱10,648 | ₱10,582 | +₱4,283 |
| Busier: Batch 1 demand (4.5 buyers a day) | ₱10,687 | ₱18,346 | ₱18,230 | +₱7,659 |
| Pace counted on days with any stock, or only days with 7+ flavours | — | ₱11,124 / ₱11,152 | — | +₱28 |
| Flavour depth flat, or by speed | — | ₱11,124 / ₱11,616 | — | +₱492 |

**So what:**

1. **Ordering on the reorder point pays +₱3.7k to ₱4.0k a month in the base case, and +₱3.2k to ₱4.7k across the
   tests.** That is +50% to +60% gross profit for the same capital. It also raises owner payouts, by about ₱2.7k a
   month as now (₱5.5k → ₱8.2k).
2. **How often to order is a wash.** Weekly and fortnightly differ by under ₱300 a month. The engine should give a
   date, not impose a rhythm.
3. **Pace on days with any stock is good enough.** Once orders are on time, the shelf stays fuller and the pace
   rises by itself. The more complex "7+ flavours" measure adds ₱28 a month.
4. **Cash is not what blocks this, if partial orders are allowed.** As now, with partial orders, the shop gets
   ₱10.7k against ₱11.3k with unlimited cash (−₱0.5k a month). Keeping the next order's cost, or adding ₱7,000 of
   capital, closes most of that gap.

### 4.4 Can the cash pay on the order-by date? The next order (Batch 4)

Day 0 is 26 Nov. Cash starts at ₱340. The ₱2,080 owed to the shop is collected on the shop's own timing. Batch 3's
30 pods sell from their arrival day. The next order is 37 pods, ₱6,362 with fees.

| Delivery | Pace | Batch 3 pods arrive | Sold out | Plan says order by | Cash on that day | Short by | Cash allows the full order on | Empty days | Gross profit lost |
|---|---|---|---|---|---|---|---|---|---|
| 5 days | 2.22 | 30 Nov | 13 Dec | 4 Dec | ₱2,954 | ₱3,409 | 12 Dec | 3.5 | ₱1,234 |
| 5 days | 3.61 | 30 Nov | 8 Dec | 30 Nov (on arrival) | ₱680 | ₱5,682 | 10 Dec | 6.7 | ₱3,850 |
| **7 days** | **2.22** | **2 Dec** | **15 Dec** | **4 Dec** | **₱2,517** | **₱3,845** | **14 Dec** | **5.5** | **₱1,942** |
| 7 days | 3.61 | 2 Dec | 10 Dec | 2 Dec (on arrival) | ₱1,740 | ₱4,622 | 12 Dec | 8.7 | ₱5,001 |
| 10 days | 2.22 | 5 Dec | 18 Dec | 5 Dec (on arrival) | ₱2,420 | ₱3,942 | 17 Dec | 8.5 | ₱3,004 |
| 10 days | 3.61 | 5 Dec | 13 Dec | 5 Dec (on arrival) | ₱2,420 | ₱3,942 | 15 Dec | 11.7 | ₱6,728 |

What the fixed engine would show today (§I of the script), with pace 2.01 a day (half-life 28 days) and delivery 7
days (a starting guess):

- **Order by Sat 5 Dec.** Pods only: position 30 against reorder point 22.6. If the devices count, capped, it is
  Mon 7 Dec.
- **Next order about 33 pieces, about ₱5,693 with fees.** The next usual order day (25 Nov + 14.5 days) is 9 Dec,
  so the two agree.
- **Your cash buys 14 pieces** on the order-by day (16 if delivery takes 5 days).

**So what:** if the shop waits until it can pay for a full batch, the order is 8 to 10 days late. That leaves 3.5 to
12 empty days and costs ₱1.2k to ₱6.7k of gross profit on this cycle alone. Three ways to prevent it:

- **(a) Order what the cash buys on the order-by date** (14 to 16 pieces), and top up a few days later. The cost is
  one more shipping fee, about ₱174.
- **(b) Keep the next order's cost back from payouts.** The 25 Nov payout of ₱4,232 was this money.
- **(c) Ask the supplier for pay on pick-up.** That frees λ × delivery × cost = ₱2.6k to ₱4.2k for 5 to 7 days.

Option (a) needs no money decision and is what the simulation shows working. I recommend building it; (b) and (c)
are owner choices.

### 4.5 How much and how often: shipping fees against holding cost

The economic order quantity is EOQ = √(2 × pace × fixed fee ÷ holding cost per piece per day), with a fixed fee of
₱174 and goods at ₱165 a piece.

| Pace | Holding cost | EOQ | Days of cover | Saving from 40 pcs to EOQ |
|---|---|---|---|---|
| 2.22 a day | 25% a year | 83 pcs | 37 | ₱78 a month |
| 3.61 a day | 25% a year | 105 pcs | 29 | ₱184 a month |
| 2.22 a day | 100% a year (cash is short) | 41 pcs | 19 | ₱0 a month |
| 3.61 a day | 100% a year | 53 pcs | 15 | ₱28 a month |

- **Weekly instead of every 14.5 days.** This adds 2.2 orders a month, about ₱386 in fees (the simulation shows
  +₱360). It cuts average cycle stock by 8 to 14 pieces, so ₱1.4k to ₱2.2k less cash is tied up. Gross profit
  hardly moves (§4.3).
- **Fee per piece.** It falls from ₱8.05 (30 pieces) to ₱6.60 (40 pieces), about 1% of the price.

**So what:** shipping is too small to drive the order size. Size each order to cover delivery plus the usual gap
between orders. Limit the cover to 30 days, which is about where EOQ lands at normal holding costs. Then let cash
set the rest.

### 4.6 Spare stock and service level

- **Spare stock** = 1.645 × √(days × pace × lumpiness + pace² × delivery spread²). Lumpiness is 1.033, because
  buyers almost always take 1 piece.
  - At 2.22 a day it is **9.2 pieces**. Half the variance (48%) comes from not knowing the delivery time. With a
    real 0.75-day spread it would be 7.1 pieces.
  - At 3.61 a day it is 13.4 pieces (60% from delivery doubt), or 9.5 with a 0.75-day spread.
- **How sure to be (critical ratio).** Compare the cost of being short (₱88 to ₱159 of margin lost) with the cost of
  being over (₱1.7 to ₱16.7 to hold one extra piece one more cycle). The ratio is 84% to 99%. **95% is justified.**
  Each step from 90% to 97.5% changes the order by 0 to 2 pieces.

**So what:** use one pooled spare stock at 95%. Class-based z (97.5 / 95 / 90%) adds complexity with no effect at
this volume. The cheapest way to need less spare stock is to record real order and arrival days.

### 4.7 Which flavours: depth, new lines, slow stock

**Depth by speed.**

- **For a re-ordered line, after shrinkage (k = 7 days):** the split hardly moves from flat. XBLACK MAX at 40 pieces
  gives Mixed Berries 5, Lychee Ice 3 and the rest 4. In one cycle that sells 0.1 to 0.6 more pieces.
- **Over several re-orders of the same range, the simulation gains +₱492 a month** (fill 84% against 80.5%).
- **For a new line** (like Batch 3) flavour speeds are unknown, so a flat split is right.

**New flavours.** Batch 3's 10 BLXCK flavours and the device have never been on the shelf.

- As designed, they would show "Order now" (90 more pieces) before they arrive.
- The rule should be: New until the product has been 7 days on the shelf or sold 3. No suggestion of its own while
  New. Its on-the-way pieces still count in the shop total.

**Not selling.** The rule is: on the shelf with no sale for at least min(60, max(R, 3 ÷ the flavour's pace)) days.

- With 10 flavours on the shelf that is 14 days; with 20, 27 days; with 30, 41 days.
- That keeps the chance of flagging a healthy flavour by bad luck at about 5%. Using R alone would flag 20% to 34%.
- Today nothing qualifies (₱0 tied up), because everything sold.

**Line choice (owner hypothesis).** XBLACK MAX sold at 2.89 a day against Black TEO's 1.80 (+60%), and it is the
only line whose flavours all ranked fastest. It has not been re-ordered. Part of the gap is the opening rush and its
₱20 lower price, so test it rather than assume it.

**So what:** the flavour mix matters far less than being in stock. Build the speed split, because the engine needs
shares anyway and it costs nothing more. Do not build a separate depth screen.

### 4.8 Alerts and the batch report

| Signal | Today | Design as written | Recommended |
|---|---|---|---|
| Low badge | 31 of 31 Low (alert fixed at 5; batches bring 3) | 30 of 31 (every reorder point is 4 or more, so Low as soon as 3 arrive) | Alert = max(1, the flavour's reorder point) = 1, so Low shows on the last piece; New products get no alert |
| Batch report "order the next batch" | "Almost sold out" rule | "Order now" (Batch 2 is sold out) although 30 pods are on the way | "Order by Sat 5 Dec" (the same date as Restock) |

**So what:** with 3 pieces a flavour, a per-flavour Low tells the owner little. The shop-level order-by date is the
real alert, and every screen should show that same date.

## 5. Recommendations (ranked by ₱ impact × feasibility)

| # | Recommendation | ₱ impact (math) | Feasibility | App change | Build now? | Owner | Timing | First step | KPI |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Order on a reorder-point date from a top-down shop plan**, not at sell-out | **+₱3.7k–4.0k a month** of gross profit (₱6.7k → ₱10.7k as now; ₱7.4k → ₱11.1k keeping the next order's cost); ₱3.2k–4.7k across tests; +₱7.7k at Batch 1 demand | High | Engine methods 1, 3, 5, 6 as in §6; Restock headline "Order by {date} · about {n} pcs · ₱{x} with shipping" (scope A1–A6, D17, D18) | **Yes** | Owner + engineering | Build before Batch 3 sells out (order-by about 5 Dec) | Approve the top-down change to the design | Empty shop-days a month (target under 0.5 after Batch 3); days between the order-by date and the real order day |
| 2 | **Order what the cash buys on the order-by date** ("Fits your money"), and top up later | Waiting for a full batch makes the order 8–10 days late: ₱1.2k–6.7k lost on Batch 4 alone. With partial orders the shop keeps ₱10.7k of the ₱11.3k unlimited-cash result | High (if the supplier accepts small orders) | "Fits your money: {n} pcs, ₱{y}", fastest flavours first (design §8 money check, A10). Partial orders allowed in Order stock | **Yes** | Owner | With #1 | Ask the supplier for the smallest order they accept | Pieces ordered on the order-by date ÷ suggested |
| 3 | **Stop over-ordering suggestions**: pooled 95% spare stock, no class-based z, New = never on the shelf, no "Order now" while orders on the way cover the reorder point | Avoids a ₱60k–75k wrong suggestion (497 → 36 pcs); z changes the order by 0–2 pcs | High | Methods 4, 5, 6 as in §6 | **Yes** | Engineering | With #1 | Unit tests: live data gives 36 pcs ± 3 and 11 New | Suggested ÷ actually ordered, between 0.8 and 1.25 |
| 4 | **Learn delivery time**: record the order the day it is placed and tap Arrived the day it comes | Each day of delivery error = 1 day early or late ≈ ₱354 a cycle; a real 0.75-day spread cuts spare stock 9 → 7 pcs (≈ ₱350 less cash) | High | Method 1 (blend with the guess, floor 1 day, spread at least 0.25); "Delivery 7 days (starting guess)" → "6 days, from 1 order"; due and late dates on On the way rows (map: "later than the N-day delivery time") | **Yes** | Manager | From Batch 3's arrival | Tap Arrived on Batch 3 the day it comes | Orders with both dates ÷ orders (target 100%) |
| 5 | **Keep the next order's cost before paying out** | +₱430 a month of gross profit against paying out all (₱10.7k → ₱11.1k); about ₱7.6k less is paid out over 6 months and stays in the shop as cash | Medium (owner policy) | Engine outputs `next_order_cents` and `order_by`; Finance's Inventory reserve defaults to "Next order (estimate)" (B11/B12, finance branch) | Yes, as an engine output; the reserve screen belongs to the finance branch | Owner | Next payout | Decide the rule at the next payout | Cash on the order-by day ≥ next-order cost |
| 6 | **Size orders by cover, not by shipping**: cover = usual gap between orders, limited to 7–30 days | Shipping savings from bigger orders ≤ ₱184 a month (EOQ) | High | Method 2: limit 7–30 (was 7–60); show "fee about ₱{fee} ({pct} a piece)" only in the next-order estimate | Yes (one constant) | Engineering | With #1 | Change the limit in the plan | Fees ÷ goods (now 3.8–5.0%) |
| 7 | **Ask the supplier for pay on pick-up** | Frees ₱2.6k–4.2k (pace × delivery × cost) for 5–7 days every cycle, the cash that makes on-time orders affordable | Medium | None (Arrived already records payment on pick-up) | No: owner action | Owner | Before the Batch 4 order | One message to the supplier | Days paid before arrival |
| 8 | **Split by flavour speed** (largest remainder, at least 2 each) when a line is re-ordered; flat for a new line | +₱492 a month after several re-orders of the same range; about 0 for new lines | High | Part of method 6's split (no new screen); row meta "order {n}" | Yes (same code as #1) | Engineering | With #1 | Use the shrunk speed shares in the split | Fill rate (share of buyers served), from the dashboard |
| 9 | **Test re-ordering the fastest line (XBLACK MAX)** | If the +60% speed holds: (2.89 − 1.80) × ₱155 ≈ ₱170 more per day in stock; unproven (opening rush, ₱20 cheaper) | Medium | None | No: owner action | Owner | Batch 4 or 5 | Ask why it was not re-ordered (supplier, price, choice?) | Pieces a day while 7+ flavours are on the shelf |
| 10 | **Auto low-stock alert** = max(1, reorder point); New products get none | Makes the badge meaningful (31 of 31 → only products down to their last piece); no direct ₱ | High | Method 7 (A8, A9): `reorder_at` blank = Auto; nav badge, Inventory, Sell tile (replaces the fixed 3) read `stock_alerts()` | **Yes** | Engineering | With #1 | Migration A/B rollout as in the build review | Products shown Low that sell out within delivery time |
| 11 | **Batch report uses the same order-by date** | Avoids a wrong "Order now" (today) and a duplicate order (₱5.7k at risk) | High | Method 10 (C15) | **Yes** | Engineering | With #1 | Replace the almost-sold-out rule | Report date = Restock date |
| 12 | **Not selling list** with ₱ at cost, threshold min(60, max(R, 3 ÷ pace)) | ₱0 today; protects cash once 20+ flavours share the shelf | High | Method 6 (A7) | Yes (small) | Engineering | With #1 | — | ₱ tied in Not selling stock |

What I would not build now: class-based service levels, per-supplier delivery times (supplier is blank on all 3
batches), the "arrival − L" order-day estimate, a weekly or fortnightly rhythm setting, an EOQ screen and the
"7+ flavours" pace. Each is worth under ₱200 a month today or needs data the shop does not have yet.

## 6. What the app should calculate (spec for the engine; ties to the design sections and map items)

All of this is in SQL (`plan_core` / `restock_plan` / `stock_alerts`, as in the build review), worked out on every
load, with nothing typed by hand.

1. **Delivery time L, spread σ_L (method 1; map "Reorder plan: delivery time").** Use the n most recent batches
   (up to 10) that have both an order day and an arrival day.
   - L = max(1, (Σ gaps + 7) ÷ (n + 1)). The 7 is one pretend order at the starting guess.
   - σ_L = max(0.25, √((Σ(gap − L)² + 2·(L/4)²) ÷ (n + 1))).
   - With n = 0, L = 7 and σ_L = 1.75, labelled "starting guess".
   - Due = order day + round(L). Late after due + ⌈2σ_L⌉ days.
2. **Order rhythm R (method 2; map "each order lasts").** The mean of the last 10 gaps between order days
   (`coalesce(ordered_on, received_on)`), limited to 7..30. With fewer than 2 order days, R = 14 as a guess. Live:
   14.5.
3. **Shop pace λ (method 3; map "Sales pace: fixed 28-day window", "Reorder pace counts days the product was sold
   out", "idle hides sold-out products").**
   - λ = Σ w·pieces ÷ ∫ w dt over the time when any product had stock, with w = 0.5^(age ÷ 28 days) and a window of
     90 days. Live: 2.01.
   - Relative speed: r_i = (Σw·sold_i + 7·r_category) ÷ (Σw·in-stock days_i + 7).
   - Each product's pace: pace_i = λ·r_i ÷ Σr_j over the range (active products stocked in the window or on order).
   - The card says "rough" while shop Σw·sold < 30 or open time < 14 days.
4. **Spare stock (method 5; map "spare days (buffer)").** SS(d) = 1.645·√(d·λ·lump + λ²·σ_L²), with lump = Σqty² ÷
   Σqty for the shop.
   - Reorder point ROP_shop = λL + SS(L).
   - Target S_shop = λ(L+R) + SS(L+R).
   - Live: 22.6 and 55.6.
5. **Split and status (method 6; map "Reorder point per product", "Suggested order quantity", "Soon / within a
   week").**
   - ROP_i and S_i: largest-remainder rounding of the shop figures × share_i.
   - Status: Out (no stock, not New) shows "Out — add to the next order"; Soon if pos_i − pace_i·R ≤ ROP_i.
   - suggest_i = max(0, S_i − pos_i), where pos_i = shelf − reserved + on the way.
   - New = never on the shelf, with no suggestion; it leaves New after 7 days on the shelf or 3 sold.
6. **Order-by date and next order (the headline; map "Batch report: almost sold out", "No forward projection").**
   - position_shop = Σ min(pos_i, max(S_i, 3)). The cap keeps devices from counting as pods.
   - start = today, or the earliest due date when the shelf is empty and an order is on the way.
   - order_by = start + (position_shop − ROP_shop) ÷ λ; "Order now" if that is today or earlier.
   - Next order = round(S_shop − ROP_shop) pieces, or S_shop − position_shop if already past.
   - Cost = Σ split × cost + fee (average of the last 3 batches' fees × max(1, pieces ÷ their average pieces)).
   - Live: "Order by Sat 5 Dec · about 33 pcs · about ₱5,700 with shipping".
7. **Fits your money (design §8 money check; map "Suggested order is never checked against the money").**
   - Pieces = ⌊(spare cash + inventory reserve − fixed fee) ÷ (cost + fee a piece)⌋.
   - Fill the order fastest flavour first.
   - Live: 14 pieces on 4–5 Dec.
8. **Auto low-stock alert (method 7; map "Low-stock alert level, default 5", "Sell tile 'low' at 3", "New product
   default = 5").** alert_at = max(1, ROP_i) for products with a pace. A hand-set number overrides it. New products
   get none.
9. **Not selling (method 6; map "Old stock in a batch: no slow-to-sell warning").** Stock above 0 and no sale for at
   least min(60, max(R, 3 ÷ pace_i)) days. Show "₱{shelf × cost} at cost".
10. **Batch report (method 10, C15).** It shows the date from item 6, plus "Batch N is on the way, due about
    {date}" when one is.

Restock "Worked out from your history" card (D17), read-only: Pace "2.0 a day on days with stock" · Delivery
"7 days (starting guess until an order arrives)" · Orders "every 14.5 days" · Spare stock "9 pieces, so 19 times in 20 the
next order arrives before the shelf runs out".

## 7. Help → Planning page: the methods from this branch

The owner asked for "McKinsey strategies". To be honest: the inventory maths below is standard operations research,
taught everywhere. Two habits are the ones McKinsey made well known: the MECE issue tree, from Barbara Minto at
McKinsey in the late 1960s, and hypothesis-driven 80/20 problem solving. Neither belongs to one firm.

1. **Order-by date (reorder point).**
   - *Comes from:* reorder-point inventory policies in operations research, formalised in the 1950s.
   - *Here:* the shop sells about 2 pods a day and delivery takes about 7 days. So when the shelf plus what's on the
     way falls to about 23 pieces, it is time to order.
   - *Use it (Restock):*
     1. Open Restock.
     2. Read "Order by {date}".
     3. Order on or before that day.
     4. Record the order the same day.
2. **Spare stock and the 95% rule (safety stock, service level).**
   - *Comes from:* the textbook safety-stock formula, which combines sales and delivery-time spread. The 95% comes
     from the newsvendor trade-off (the cost of running short against the cost of holding one more piece).
   - *Here:* about 9 extra pieces. Half of that is there because delivery time isn't known yet.
   - *Use it (Restock card):*
     1. Check the Delivery line.
     2. Tap Arrived the day each order comes.
     3. Watch spare stock shrink as the app learns.
3. **How much to order (order-up-to cover).**
   - *Comes from:* periodic-review order-up-to policies in operations research.
   - *Here:* order enough for the delivery days plus your usual gap between orders (14.5 days), plus spare stock,
     less what you have.
   - *Use it (Restock):*
     1. Read "about {n} pcs".
     2. Copy order list, or Order this.
     3. Adjust for the supplier's pack size.
4. **Shipping against holding (economic order quantity).**
   - *Comes from:* F. W. Harris, 1913.
   - *Here:* shipping is about ₱174 an order plus ₱2.25 a piece. Doubling the order saves under ₱200 a month, so
     don't wait to fill a bigger order.
   - *Use it (Restock):* if the next-order fee looks high next to the order, order anyway when the date comes.
     Being out costs ₱354 a day.
5. **Top sellers by speed (Pareto 80/20, ABC).**
   - *Comes from:* Vilfredo Pareto's observation; Joseph Juran named it the Pareto principle. ABC analysis for stock
     comes from H. Ford Dickie at General Electric, 1951.
   - *Here:* rank flavours by sales per day on the shelf, not by pieces sold. Each flavour got only 3, so pieces
     sold says nothing. The fastest get a little more of each order and are bought first when money is short.
   - *Use it (Restock rows, "Top seller"):* when the cash is short, order the Top sellers first.
6. **Cost of an empty shelf (lost sales).**
   - *Comes from:* retail out-of-stock research (Gruen, Corsten and Bharadwaj, 2002).
   - *Here:* about 85% of buyers who miss their flavour leave. An empty shop costs about ₱354 of profit a day, and up
     to ₱576 with a full shelf.
   - *Use it (Restock "Out since" rows, Dashboard):*
     1. Count the empty days each month.
     2. Aim for under one.
7. **Order what your money buys (budget first; cash cycle).**
   - *Comes from:* cash-conversion-cycle thinking (Richards and Laughlin, 1980) and the greedy rule for a budget.
   - *Here:* credit sales pay back about 9 days later, so a batch's own cash arrives late. On the order-by date, order
     what fits, then top up.
   - *Use it (Restock money line):*
     1. Read "Fits your money: {n} pcs".
     2. Order those.
     3. Top up when the cash comes.
8. **The weekly stock review (MECE issue tree, hypothesis first).**
   - *Comes from:* Barbara Minto's MECE at McKinsey and the hypothesis-driven method many consulting firms teach.
   - *Here:* split every stock problem into four parts that don't overlap: when (order-by date), how much (pieces),
     which (flavours), paid how (cash). Check the one that went wrong.
   - *Use it (weekly, 10 minutes):*
     1. On the way: late?
     2. Order-by date: is it this week?
     3. Fits your money?
     4. Not selling?
     5. Agree one action.

## 8. Risks, and what would prove this wrong

- **Novelty, not empty shelves, may explain why sales fell within each batch.**
  - *Effect:* the gain from ordering on time would then be closer to the 45%-switch test (+₱3.2k), or lower.
  - *Test:* with Batch 3, if pace stays at or above 2.5 a day while 7 or more flavours are on the shelf for over a
    week, the shelf-fullness effect holds.
- **The supplier may not take small orders.**
  - *Effect:* "fits your money" fails. Then (b), keeping the next order's cost, or (c), pay on pick-up, is needed.
    Without either, the as-now cash rule loses about ₱0.5k a month against unlimited cash, plus late orders.
- **Delivery may be slower than 7 days.**
  - *Effect:* the gain from ordering on time grows (+₱4.3k at 8–12 days). The order-by date moves earlier by about
    2 pieces' worth of selling per extra day.
- **The model is built on 2 batches, 60 pieces and 20 flavours.**
  - *Effect:* every number has wide error. Mitigations: plan top-down, which is robust; label starting guesses; let
    the shop's pace and delivery time update daily. The shape of the result held in every test: ordering on time
    wins by ₱3.2k to ₱7.7k a month.
- **Devices.** Their demand is unknown. If they lead buyers to buy more XBLACK pods, which the shared "XBLACK"
  naming suggests, they matter for line choice (open question 4).

## 9. Next 30 / 60 / 90 days

- **30 days (to 26 Dec)**
  - Tap Arrived on Batch 3 the day it comes. That gives the first real delivery time.
  - Build the top-down engine with order-by, next order and fits your money (#1 to #3, #10, #11).
  - Order Batch 4 by about 5 Dec, at least the 14 pieces the cash allows.
  - Ask the supplier about the minimum order and pay on pick-up.
- **60 days (to 25 Jan)**
  - Check empty shop-days (under 0.5 a month), and suggested against ordered (between 0.8 and 1.25).
  - Decide whether to keep the next order's cost from payouts.
  - Test re-ordering XBLACK MAX.
- **90 days (to 24 Feb)**
  - With 4 or more orders that have both dates, the starting guess for delivery time is gone.
  - Review whether the 95% spare stock and the 30-day cover limit still fit.
  - Add per-supplier delivery times if a second supplier appears.

## 10. Open questions, data gaps and sources

1. **The real delivery days.** Batch 3's arrival will be the first. Were Batches 1 and 2 ordered before their
   arrival days?
2. **The supplier.** What is the minimum order? Can the shop pay on pick-up? Does shipping change with the number of
   pieces? (The fit says about ₱2.25 a piece, from only 3 orders.)
3. **Line choice.** Will lines be re-ordered (XBLACK MAX was fastest), or changed every batch? This decides whether
   the speed split matters.
4. **Devices.** Are the devices for XBLACK pods (the shared XBLACK naming suggests so)? What demand is expected?
   Should they be planned as their own kind?
5. **Rhythm.** Does the owner prefer to order weekly or every two weeks? The money result is the same; it is a
   question of time and supplier days.
6. **Payouts.** Should payouts keep the next order's cost? This is for the finance branch: +₱430 a month of gross
   profit, and about ₱7.6k less paid out over 6 months, which stays in the shop.

**Shop data:** the live Supabase project, read-only SELECTs (26 Nov 2026, 18:59 and 19:15 Manila), embedded in
`analysis/baseline.py`. Design draft: `planning-design.md`. Reviews: the maths, UX and build results in
workflow wf_42d7e325-55a (its 497 and 410 pieces were reproduced exactly here; its 37-piece fix comes out at 36 here).

**External** (used for rules and benchmarks only; no shop data was put in any search):

- Inventory carrying cost of about 20–30% of stock value a year. Fishbowl, "What is carrying cost"; Shopify,
  "Inventory carrying costs" (both accessed 26 Nov 2026). Used as [A5].
- Out-of-stock responses. T. Gruen, D. Corsten and S. Bharadwaj, *Retail Out-of-Stocks: A Worldwide Examination of
  Extent, Causes and Consumer Responses* (Grocery Manufacturers of America, 2002), as summarised in D. Corsten and
  T. Gruen, "Stock-Outs Cause Walkouts", *Harvard Business Review* (May 2004), and tabulated in Helm and Hegenbart,
  University of Regensburg discussion paper (2011).
  - The commonly cited split is 31% buy elsewhere, 26% another brand, 19% the same brand in another size or kind,
    15% delay and 9% do not buy.
  - The Regensburg table shows the five values without column labels, so the labels are as commonly cited.
- EOQ: F. W. Harris, "How Many Parts to Make at Once", *Factory, The Magazine of Management* (February 1913).
  Reprinted with its history in D. Erlenkotter, *Operations Research* 38(6), 1990.
- Safety stock with demand and delivery-time variation: SS = z·√(L·σ_d² + d²·σ_L²), the standard textbook form (for
  example Silver, Pyke and Peterson). Summaries: ASCM, "Safety stock"; Wikipedia, "Safety stock" (accessed 26 Nov
  2026). z values: 90% 1.28, 95% 1.645, 97.5% 1.96 (standard normal).
- ABC analysis: H. F. Dickie, "ABC Inventory Analysis Shoots for Dollars, Not Pennies", *Factory Management and
  Maintenance* (July 1951). Pareto principle: named by J. M. Juran after V. Pareto's observation on the distribution
  of land and income. Juran's own 1974 note says the name was a misattribution.
- MECE: Barbara Minto, McKinsey & Company (late 1960s), *The Pyramid Principle* (1985 and later editions). McKinsey
  Alumni, "MECE: I invented it, so I get to say how to pronounce it".
- Not tax, legal or investment advice.
