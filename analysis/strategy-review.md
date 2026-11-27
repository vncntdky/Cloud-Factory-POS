# Cloud Factory: strategy review and planning-engine build list

As of **Thursday 26 Nov 2026, 20:16 Manila**. A read-only live check at 20:16 found nothing changed since the 18:59 fact
base: 51 sales, 60 pieces, ₱19,800 net sales, ₱2,080 owed, 81 stock movements, Batch 3 still on the way, cash ₱340,
Safe to distribute ₱340.

This file pulls together the fact base (`analysis/baseline.md`) and the four branch studies:

- stock and ordering
- cash and capital
- credit and collections
- products, pricing and mix

Branch figures are quoted with their file. Every other number comes from `analysis/strategy-review.py`, which re-runs
offline in a few seconds and writes `analysis/strategy-review_metrics.json`. Amounts are in pesos (₱). "Gross profit"
means after restocking fees (landed cost).

The design this review builds on is **design v2** (`planning-design-v2.md`, 26 Nov 11:26, in the session scratchpad).
It replaced the draft named in the brief (`planning-design.md`, v1). v1 must not ship: on live data it suggests
497 pieces (₱80,770).

## Assumptions

| # | Assumption |
|---|---|
| A1 | Data is the read-only pull of 26 Nov 18:59 (the `analysis/baseline.py` data block), re-checked live at 20:16 and unchanged. Today is 26 Nov 2026. |
| A2 | Delivery takes 5 to 7 days, as the owners said. No order has both an order day and an Arrived day yet. Until one does, the plan uses 7 days ± 1.75. |
| A3 | When a buyer's flavour is out, about 15% take another flavour and 85% leave. This is the stock branch's best fit to Batches 1 and 2; the grocery benchmark is about 45% switching (Gruen et al., 2002). |
| A4 | Average landed margin is ₱159.45 a piece. An empty shop-day costs ₱354 of gross profit at the in-stock pace (2.22 a day) and ₱576 with a full shelf (3.61 a day). |
| A5 | Restocking fees are about ₱249 an order (the average of the last 3), close to flat: ₱174 + ₱2.25 a piece fits all three. |
| A6 | 26.6% of sales are paid at the till. Credit is collected on the shop's own timing (median 9 days). Orders are paid on the day they are placed, as Batch 3 was. Running costs are ₱716 a month as recorded; no rent, pay or owner time is recorded. |
| A7 | The tax rate is 0%, as set in the app. A 3% sensitivity is shown, because the statutory percentage tax for non-VAT sellers is 3%. An accountant should confirm it. |
| A8 | The cost of money for the return test is 3% a month, the BSP credit-card ceiling, used as the owners' opportunity cost. Tests run at 1% and 20% a month; the answer doesn't change. |
| A9 | Peso impacts from the branch models are quoted, not re-run: the stock simulation (180 days × 200 runs), the cash Monte Carlo (10,000 trials) and the credit expected-value model. They overlap, so they are not added up; §4.7 shows how they fit together. |
| A10 | The adopted engine parameters: order rhythm R from recorded order days (an old batch's Arrived day where no order day was recorded), kept between 7 and 30 days; half-life H = 2R kept between 21 and 56 days; delivery time L blended with the 7-day guess; z = 1.645; shrinkage k = 7 days; product line = category; devices capped as in v2. |
| A11 | Privacy: only totals are used. No buyer or staff name is in any file, and no web search used the shop's name, the owner's name or any shop figure. |

## 1. Bottom line

**Empty shelves limit this shop's profit. The fix is when it orders, not how much it orders or what it charges.**

- **The gain.** Order on a calculated Order-by date: the day the shelf plus what's on the way falls to about 23 pieces.
  Order whatever the cash buys that day. That lifts gross profit from about ₱6.7k to ₱10.7k–11.1k a month: +₱4.0k to
  ₱4.5k, about +60%, and +₱3.2k to ₱4.7k in every test. It needs no new capital.
- **The condition.** The cash has to be there on that date. Keep the next order's cost back before any payout, and ask
  the supplier to let you pay on pick-up.
- **What went wrong on 25 Nov.** The payout took all of Safe to distribute 14 minutes after Batch 3 used up the
  reserve. So the fund can't pay for Batch 4 on its date: in the cash model it falls short in every trial, by a median
  of ₱2,598.

**Decisions needed:**

1. **Owner: approve release 1 of the planning engine.** It is design v2 with the 15 changes in §9.2, plus the money and
   collections rules and the Planning page.
2. **Owner: hold payouts and talk to the supplier.** Make no payout until Batch 4 is paid. This week, ask the supplier
   three things: can the shop pay on pick-up, what is the smallest order it takes, and can XBLACK MAX be re-ordered?
3. **Owner: order Batch 4 on its Order-by date (about 5–7 Dec).**
   - The plan is about 33 pieces, about ₱5,660 with shipping.
   - The cash that day buys about 14. Order those (fastest flavours first) and top up when collections come in.
   - Don't wait for a full batch. That costs ₱1.2k to ₱6.7k of profit on this cycle alone.

## 2. Situation → complication → resolution

- **Situation.** The shop opened on 27 Oct, so it is one month old.
  - Net sales are ₱19,800 and landed gross margin is 48.3%. Net profit as recorded is ₱8,827; no rent or pay is
    recorded.
  - Three batches of 30 to 40 pods. Every one of the 60 pieces bought has sold.
  - Cash is ₱340. Batch 3 (₱7,214) is on the way.
  - The app's reorder plan uses fixed lines: 7 days delivery, 3 spare, 14 cover, and an alert at 5 pieces. Its pace
    counts empty days as days with no demand.
- **Complication.**
  - **Each batch sold out before the next one came.** The shop was completely empty 3.4 of its 31 days, and it has
    been empty again since 11:16 today.
  - **Buyers leave.** Sales fall about 4× as flavours run out, because about 85% of buyers leave rather than switch.
  - **Ordering at sell-out is costly.** It costs about ₱2,478 of gross profit per cycle, 26% of all gross profit so far.
  - **The cash comes back late.** 73% of sales are on credit and take a median of 9 days to collect, while the
    supplier is paid at order. Then the 25 Nov payout emptied the fund right after Batch 3 was paid.
  - **The app can't guide any of this.**
    - Its pace counts empty days as days with no buyers, so it reads two of the fastest flavours as 0.
    - Low is on for 31 of 31 products.
    - The first engine draft would have suggested 497 pieces.
- **Resolution.**
  - **Plan from the shop's own history, top-down.** Design v2 with the changes below gives:
    - one Order-by date
    - one order size, shared across flavours by speed
    - a money check that says what the cash buys
  - **Protect the cash for that date.** Keep the next order's cost back before payouts, pay the supplier on pick-up if
    it agrees, and in a new batch's first week ask buyers to pay at the till.
  - **Let the app learn.** It learns delivery and collection times from every order and payment.
  - **Teach the methods** on a Planning page in Help.
  - **Leave policy with the owner:** prices, payouts, credit, tax and the split.

## 3. Issue tree

**The question:** how does Cloud Factory raise its monthly profit, and keep it rising as it grows, with the cash it
has (about one batch)? And what must the app work out from the shop's own history so the owner decides well at every
order and every month?

The tree follows return on the money tied up = margin × turnover. Each level has no overlaps and no gaps.
★ marks the priority branches; *pruned* marks branches left out.

- **A. Profit a day = pieces a day × profit a piece − running costs − tax**
  - **A1 ★ Pieces a day = days with stock × flavours on the shelf × sales per flavour on the shelf**
    - **A1a ★ When to order:** the Order-by date, from pace, delivery time and spare stock. Worth +₱4.0k a month.
    - **A1b ★ Which line fills the shelf:** XBLACK MAX against Black TEO. Worth ₱0 to ₱3.2k a month, and unproven.
    - A1c How much to order and how often: order size, weekly or fortnightly. Under ₱200 a month, so pruned to one
      rule.
    - A1d Which flavours get more: split by speed. +₱492 a month, and only once a line is re-ordered.
    - A1e New lines and new kinds of item: start small. ₱1.4k of pod profit a cycle tied up per 7 extra devices.
  - **A2 Profit a piece = price − discounts − landed cost**
    - A2a Price level: 1% is worth ₱192 a month. Weak at a 48% margin.
    - A2b Supplier cost rises: −₱479 a month for each 5% not passed on. Defensive; check before January.
    - A2c Discounts: ₱0 so far. The ₱50 staff limit could cost ₱247–740 a month.
    - A2d Restocking fees: 3.8% to 5.0% of goods. *Pruned: small.*
  - **A3 Running costs and tax:** ₱716 a month recorded, tax rate 0%. A data gap, not a lever; it must be filled.
  - **A4 Losses:** expected bad debt ₱58; count differences ₱0. *Pruned: small.*
- **B. Money tied up, and cash on the order day.** This sets whether A1a can happen.
  - **B1 ★ Money out by choice:** payouts, and when they come relative to an order. Decided Batch 4.
  - **B2 ★ When the supplier is paid:** at order adds about 7 days to the cash cycle (10.6 → 17.6 days).
  - **B3 ★ When buyers pay:** credit share × days to collect. DSO 6.2 days, and ₱2,155 held back on Batch 4's order
    day.
  - B4 Stock on the shelf: DIO 4.4 days. Small, because stock sells out.
- **C. What the app must work out from history (the owner's first ask).** Each item serves a branch above:
  - delivery time, order rhythm, pace and each flavour's share, spare stock, Order by and order size (A1a, A1d)
  - money by the order day, Fits your money and the payout suggestion (B1, B2, B3)
  - Late and Very late from buyers' own payment times (B3)
  - alerts and the batch report (A1a)
  - the product-mix figure and the profit bridge (A1b, all of A)

*Deliberately left out:* bundles and multi-piece prices (supply is the limit), interest on tabs (a legal and goodwill
question, and small), and opening hours and staffing (no data).

## 4. Analysis

### 4.1 The lever: being in stock (branches A1a, A1b)

| Fact | Value | Formula or source |
|---|---|---|
| Pace by flavours on the shelf | 7–10 flavours: **3.61 a day**. 4–6: 1.47–1.58. 1–3: 0.85–0.99. Any stock: 2.22 | Pieces ÷ days in each band (baseline §6; stock §4.1) |
| Buyers who switch when their flavour is out | **≈15%**; 85% leave | Model fit, error 1.59 at 15% against 4.75 at 0% and 5.41 at 100% [A3] |
| Gross profit lost per empty shop-day | **₱354** (2.22 × ₱159.45) to ₱576 (3.61 × ₱159.45) | [A4] |
| Days the whole shop was empty | 3.38 of 31, and again since 26 Nov 11:16 | Running sum of stock movements |
| Cost of ordering at sell-out (7-day delivery) | ₱2,478 per cycle = 7 × ₱354, 26% of gross profit to date | baseline §6 |
| Lost to empty shelves so far | ₱1,196 (whole shop empty) / ₱5,134 (middle) / ₱7,885 (upper) | baseline §6 |
| When Batch 3 was ordered | 1.5 days before Batch 2's last piece sold | baseline §10 |

**Simulation** (stock branch §4.3: 180 days, 200 runs, Batch 2 demand, 5–7 days' delivery):

| Policy and cash rule | Gross profit a month | Owner payouts a month | Empty shop-days a month | Buyers served |
|---|---|---|---|---|
| Order at sell-out; pay out all the cash allows (today) | **₱6,674** | ₱5,464 | 3.8 | 48% |
| Order at the reorder point; partial orders when short | **₱10,712** | ₱8,152 | 0.8* | 78% |
| The same, keeping the next order's cost before payouts | **₱11,144** | ₱6,883 | 0.8* | 81% |
| The same, unlimited cash | ₱11,261 | — | 0.8* | 80% |
| Weekly order-up-to, keeping the next order's cost | ₱11,314 | ₱7,007 | 0.8* | 84% |

\*The 0.8 is today's wait for Batch 3. After that, ordering at the reorder point almost never empties the shop.

- **Tests of the gain** (keeping the next order's cost):
  - +₱4,706 if every buyer who misses leaves (0% switch)
  - +₱3,221 if 45% switch, as in grocery
  - +₱4,283 if delivery takes 8 to 12 days
  - +₱7,659 at Batch 1's demand
- **Smaller levers, from the same model:**
  - bigger orders to save shipping: ₱78–184 a month
  - weekly against fortnightly: within ±₱300
  - splitting flavours by speed: +₱492, after repeated re-orders
  - measuring pace only on days with 7+ flavours: +₱28

**So what:**

- **Timing is the lever.** Ordering at the reorder point earns about +₱4.0k a month. Keeping the next order's cost
  before payouts adds about ₱0.4k more.
- **Payouts still rise.** Owner payouts go from about ₱5.5k to ₱6.9k a month while the next order's money stays in the
  shop.
- **Everything else is under ₱500 a month,** so the engine needs one date and one order size. It does not need a
  rhythm setting, a shipping screen or flavour classes.

### 4.2 The constraint: cash on the order day (branches B1–B3)

**What happened on 25 Nov** (cash branch §4.2, from the time each record was entered):

| Moment | Cash | Inventory reserve | Safe to distribute |
|---|---|---|---|
| 25 Nov 02:05: reserve set | ₱11,446 | ₱7,014 | ₱4,432 |
| 25 Nov 07:34: Batch 3 paid in full from the fund; reserve used up | ₱4,232 | ₱0 | **₱4,232** |
| 25 Nov 07:48: ₱4,232 paid out (owner ₱2,821, manager ₱1,411) | ₱0 | ₱0 | ₱0 |
| 26 Nov now | ₱340 | ₱0 | ₱340 |

The payout was 100% of Safe to distribute at that moment. It was also 92.6% of the month's operating cash: ₱17,720
collected, less ₱12,408 for stock, less ₱740 of expenses, = ₱4,572.

**Batch 4: will the fund hold its cost on the order day?**

| Scenario | Chance the fund is short | Owner top-up needed (median) | Gross profit lost if the shop waits for cash |
|---|---|---|---|
| Today: ₱340 cash, order at the reorder point, pay at order (cash S1) | **100%** | **₱2,598** (P90 ₱3,620) | ₱1,199–1,950 |
| Pay on pick-up instead (cash S2) | 17% | ₱452 (when short) | ₱22–36 |
| Had the 25 Nov payout been held (cash S3) | 2% | ₱114 | ₱3–4 |
| Order at sell-out, the old habit (cash S4) | 44% | ₱1,035 | ₱326–530, and 4.8 empty days |
| Every new sale paid at the till (credit S1) | — | ₱1,293 | ₱0 |
| Half of sales on credit (credit S2) | — | ₱2,760 | ₱880 |
| Order what the cash buys on the date (about 14 pieces), then top up (stock §4.4) | — | ₱0 | about ₱174 more shipping |

**Payout rule test** (this script, §D). Hold = the part of the next order that the reserve and the unpaid sales usually
collected by the order day won't cover. Suggested payout = the lower of Safe to distribute and (spare cash − hold − a
month of running costs), and never below 0.

| Moment | Spare cash | Next order (estimate) | Owed, usually paid by 7 Dec | Hold | Running costs a month | v2's suggestion | **Adopted suggestion** |
|---|---|---|---|---|---|---|---|
| 25 Nov 07:48 | ₱4,232 | ₱5,664 | ₱2,080 | ₱3,584 | ₱740 | ₱3,492 | **₱0** |
| 26 Nov now | ₱340 | ₱5,664 | ₱2,080 | ₱3,584 | ₱716 | ₱0 | **₱0** |

**The cash cycle and growth** (cash branch §4.7–4.8):

- **The cycle doubles when the supplier is paid at order.** It is 10.6 days paid on arrival (DSO 6.2 + DIO 4.4) and
  17.6 days paid at order with 7 days' delivery.
- **A full shelf needs more cash than the shop has.** It needs ₱10,903 tied up when paying at order, against ₱6,566 on
  pick-up. The shop's equity is ₱9,634.
- **The shop can grow on its own money.** Each batch earned 78% to 95% of its cost (mean 86%). At the 47.9% payout
  ratio so far, orders can grow 45% a cycle. Full-shelf orders of about 52 pieces allow payouts of up to about 64% of
  profit.
- **Keeping money in stock creates value.** The return is about 150% in 31 days on ₱5,884 tied up (44.6% margin × 3.37
  turnover). Even at 20% a month, the economic profit is ₱7,611 for the 31 days [A8].

**So what:**

- **The payout decided Batch 4,** not delivery time or sales speed.
- **Three tools fix it,** and they are substitutes:
  - partial orders (needs no money decision)
  - holding the payout (the decisive one)
  - pick-up terms (the cheapest one that lasts)
- **v2's payout rule isn't enough.** It only keeps a month of running costs, so on 25 Nov it would still have
  pre-filled ₱3,492. The adopted rule pre-fills ₱0.

### 4.3 The planning engine on live data (the owner's first ask)

| Engine | Shop pace | Reorder point / target (shop) | Order by | Suggested now | Next-order estimate | Fits ₱2,420 |
|---|---|---|---|---|---|---|
| The app today: fixed 7 + 3 + 14 days, 28-day pace, alert at 5 | Reads empty days as no demand: a median 2.6× too low; 2 fast flavours read 0 | 22 / 53 implied | None. Low shows on 31 of 31 | — | — | — |
| v1 draft (per-flavour build-up) | 16.1 a day (flavour paces added up) | 4–25 / 9–60 **per flavour** | 30 of 31 at "Order now" | **497 pcs, ₱80,770 of goods** | 445–532 pcs | — |
| v2 as written (R 18 from estimated order days, H 36) | 2.05 a day | 23.0 / 64.7 | Sun 6 Dec | 43 pcs, ₱7,276 | 43 pcs, ₱7,276 | 14 pcs |
| **Adopted** (R 14.5, H 29, delivery blended) | **2.01 a day** | **22.6 / 55.7** | **Mon 7 Dec** (Sat 5 Dec for pods only) | **36 pcs, ₱6,084** | **33 pcs, ₱5,664** | **14 pcs** |
| The shop's real orders | — | — | — | 30, 30 and 40 pcs (₱4.8k–7.2k) | — | — |

The formulas (engine section A of the script):

| Quantity | Formula |
|---|---|
| Shop pace λ | Σ w·pieces ÷ ∫ w over the time with any stock, with w = 0.5^(age ÷ H) |
| Reorder point | λL + 1.645·√(L·λ·lump + λ²·σ_L²). With L = 7, σ_L = 1.75 and lumpiness 1.033 it is 14.1 sold during delivery + 8.5 spare = 22.6 |
| Target | λ(L + R) + 1.645·√((L + R)·λ·lump + λ²·σ_L²) |
| Order by | due day + ⌊(position − reorder point) ÷ λ⌋. Position counts the 10 devices on the way as 3 pieces, so it is 33 (30 for pods only) |
| Next order | round(target − reorder point) = 33 pieces, shared by largest remainder; fees ₱249 × max(1, pieces ÷ 33.3) |

**The one judgement that differs: how to date old orders.** Batches 1 and 2 have no recorded order day.

- **v2** counts back 7 days from Arrived: 20 Oct and 2 Nov. Its gaps are then 13 and 23 days, so R = 18.
- **But the 23-day gap is the late ordering this plan is meant to fix.** Batch 3 went in only 1.5 days before Batch 2
  sold out, about 11 days after the 12–14 Nov the owners had planned (HISTORY).
- **The arrival days give R = 14.5** (gaps of 13 and 16). That gives 33–36-piece orders, like the shop's real 30–40.
- **Shipping savings past 30 days of cover are under ₱184 a month.** So the rhythm is kept between 7 and 30 days
  (v2 allowed up to 60).

**So what:**

- **v2's top-down engine fixes v1's 10× over-order.** The adopted changes make the next order match how the shop really
  buys.
- **The action for Batch 4 is the same either way.** Under every version, the money on the date buys about 14 pieces.
- **The devices move the date by about 2 days.** Counting 3 of the 10 devices as stock makes Order by Mon 7 Dec; for
  pods alone it is Sat 5 Dec.
  - That is acceptable, because the date is worked out again every day once Batch 3 is on the shelf.
  - Planning devices as their own kind waits until some have sold (§9.3).

### 4.4 Credit: timing, not bad debt (branch B3)

| Rule for "Late" | Late after | Very late after | Good payers it marks Late | Owed today: Usual / Late / Very late |
|---|---|---|---|---|
| SOP 9 and Finance today (fixed) | 7 days | 30 days | 20 of 31 | ₱1,700 / ₱380 / ₱0 |
| v2 (counts open balances among the values) | 12 | 19 | 4 of 31 | the same |
| **v3, adopted (sales paid in full only; Very late at least a week after Late)** | **11** | **18** | 5 of 31 | the same |

**The flaw in v2: a stuck balance hides itself.** Suppose the two 16-day balances are never paid. v2's "Very late after"
then rises with their own age: 19 days on 29 Nov, 21 on 1 Dec, 26 on 6 Dec, 61 on 10 Jan. They never show as Very
late. v3 flags them from 29 Nov (script §C).

**What credit costs** (credit branch §4.6–4.7):

| Cost | Size |
|---|---|
| Expected bad debt on today's ₱2,080 | ₱58. That is PD × LGD × EAD, with PD 1.6% / 8.3% / 25% by age and LGD 100% |
| Expected bad debt on new credit | ₱220 a month (₱842 at the cautious upper bound) |
| Financing the average ₱3,968 owed | ₱40 to ₱119 a month at 1% to 3% a month |
| **Cash held back on Batch 4's order day** | **₱2,155**: ₱1,588 of gross profit lost if the supplier is paid at order, 27× the expected bad debt. ₱0 on pick-up terms |
| Asking for the old tab first (history) | ₱305 more cash in hand on average |
| Chasing from Late's start (day 11) | Frees ₱481 now and ₱898 at a full shelf |

**So what:**

- **Credit is how this shop sells, and its buyers pay.** None of the 31 settled has defaulted.
- **The real cost is timing.** Fix it with pick-up terms, or with till payments in a new batch's first week.
- **Chase from the shop's own Late,** which is 11 days, not 7.
- **Per-buyer limits are not worth building yet.** In a test against past sales they fired on 24–35% of credit sales,
  with no link to slow payment.

### 4.5 Products and prices (branches A1b, A2)

| Lever | Number | So what |
|---|---|---|
| Gross profit a day per flavour on the shelf, by line | XBLACK MAX **₱88**, Black TEO **₱50**. Per line with the first day left out: ₱356 against ₱235 a day | If half or all of the gap is real, the faster line is worth ₱1.6k–3.2k a month. Test it |
| The total-profit trap | Batch 2 made ₱985 more in total but 31% less gross profit a day on the shelf | Compare lines and batches per day on the shelf |
| How much the ₱20 price gap explains | 6% to 31% of the speed gap, at elasticities −0.4 to −2.2 | Mostly the line itself, or novelty |
| 1% on price | +₱192 a month (2.1% of gross profit) | A weak lever at a 48% margin |
| +₱10 a pod | −₱275 to +₱462 a month, at elasticities −3.0 to −0.4 | Hold prices for now |
| A 5% supplier cost rise not passed on | −₱479 a month | Pass it on at least peso for peso (₱340 → ₱350). The vapor excise rises each January |
| Discounts | ₱0 so far. The ₱50 staff limit could cost ₱247–740 a month | Lower the limit to ₱20 |
| Flavour classes (ABC) at 3 pieces a flavour | A flavour keeps its class only 63–64% of the time, batch to batch. Class-based spare stock adds 1.2–4.0 pieces | Display only. Never let a class set stock |
| New kinds of item | 10 devices last 37–82 days and hold ₱2,066, 29% of Batch 3 | Start a new kind at about 3 |
| Profit bridge, October → November | ₱730 → ₱201 net profit a day. Out of stock (days with stock plus flavours on the shelf) was 53% of the drop | Build the bridge, so the monthly review points to the lever |

**So what:**

- **The product decision that matters is which line fills the shelf.** Price, discounts and flavour classes move
  little.
- **The app needs two figures:** "₱ a day per flavour on the shelf, by line", and a per-day profit bridge.

### 4.6 Reconciliation: where the branches' numbers differ

| Figure | Values in the branches | Adopted | Why |
|---|---|---|---|
| Next order | 497 pcs (v1); 43 pcs, ₱7,276 (v2); 37 pcs, ₱6,224 (maths review, used by cash and credit); 36 / 33 pcs, ₱5,693–5,815 (stock) | **33 pcs, ₱5,664** (36 pcs, ₱6,084 if ordered today) | R from recorded order days (§4.3). Sized from the reorder point, where the order will be placed |
| Order-by date | 5 Dec (stock, pods only); 6 Dec (v2, and the cash model's median); 4–6 Dec (credit) | **Mon 7 Dec in the app; plan for 5–7 Dec** | Devices count as 3 pieces. Delivery is still a guess |
| Late / Very late | 12 / 19 (v2); 11 / 18 (credit) | **11 / 18** | Open balances must not set their own bar |
| Fits your money | 14 pcs (v2 money check); 14 pcs, 16 with 5-day delivery (stock, simulated cash) | **14 pcs** | Two methods agree |
| Batch 4 profit lost if the shop waits for cash | ₱1,199–1,950 (cash); ₱1,588 (credit); ₱1,942 (stock) | **₱1.2k–1.9k** | Three models agree within a day |
| Reserve default | ₱7,214 ("Same as Batch 3"); ₱6,224 (cash) | **Next order (estimate), ₱5,660** | It follows pace and rhythm as the shop grows |

### 4.7 Value at stake (not additive) and ranking

| Lever | ₱ a month (low – mid – high) | Feasibility | How it fits with the others |
|---|---|---|---|
| Order on the date, in whatever size the cash buys | 3,221 – **4,038** – 4,706 | High | The base gain. Needs one of the cash tools below |
| Keep the next order's cost before payouts | 432 – 700 – 1,575 | High | +₱432 on top of the base. Avoids ₱1.2k–2.0k in any cycle where a payout follows an order |
| Pay on pick-up | 0 – 600 – 1,177 | Medium (the supplier decides) | Does the same job as holding the payout, and frees ₱2.4k–4.3k for good |
| Till payments in a new batch's first week | 0 – 400 – 1,588 | Medium (buyers' habits) | Does the same job as the two above |
| Re-order the fastest line (a test) | 0 – **1,590** – 3,181 | Medium (supplier; unproven) | Raises the value of ordering on time (+₱7.7k at Batch 1's demand) |
| Pass cost rises on to price | 0 – 479 – 958 | High | Defensive; January |
| Lower the staff discount limit to ₱20 | 0 – 247 – 740 | High | Exposure, not current loss |
| Learn delivery time from every order | 0 – 354 – 708 | High | Makes the date right; spare stock 9 → 7 pcs |
| Credit discipline (Late from history, "already owes") | 100 – 300 – 600 | High | One-off cash ₱481–1,335 |
| Start new kinds of item small | 0 – 300 – 700 | High | Cash for pods |

**Realistic total:** about ₱6.7k → ₱11.1k of gross profit a month (+₱4.5k, +67%) on today's capital, before the line
test. The line test could add up to ₱1.6k–3.2k more if the gap is real.

## 5. Recommendations (ranked by ₱ impact × feasibility)

The score is the middle ₱ estimate × feasibility (high 0.9, medium 0.6), from script §F.

| # | Recommendation | ₱ impact | Feasibility | Owner | Timing | First step | KPI |
|---|---|---|---|---|---|---|---|
| 1 | **Order on the Order-by date, in whatever size the cash buys** (Fits your money), fastest flavours first, then top up | **+₱4.0k a month** (₱3.2k–4.7k; +₱7.7k at Batch 1's demand). Waiting for a full Batch 4 instead costs ₱1.2k–6.7k on that cycle | High | Owner orders; engineering builds release 1 | Build now. First use: Batch 4, about 5–7 Dec | Approve release 1. From Batch 3's arrival, check Restock every day or two | Empty shop-days a month (target under 0.5 after Batch 3); days late against Order by (target 0) |
| 2 | **Test re-ordering XBLACK MAX's fastest flavours at ₱320 in Batch 4,** next to BLXCK | ₱0 to +₱3.2k a month (middle ₱1.6k); unproven | Medium | Owner | Batch 4 order | Ask the supplier whether it still sells XBLACK MAX at ₱160 | ₱ a day per flavour on the shelf, by line, over the same days |
| 3 | **Keep the next order's cost before any payout.** The app pre-fills the suggestion and shows a notice. No payout until Batch 4 is paid | +₱0.4k a month at steady state. Avoids ₱1.2k–2.0k of lost profit, or a ₱2.6k owner top-up, in any cycle where a payout follows an order | High | Owner (policy); engineering (pre-fill) | Now (hold); build in release 1 | After recording an order, set the reserve to Next order (estimate) before anything else | The fund covers each order on its payment day; no payout while the reserve question is open; owner top-ups ₱0 |
| 4 | **Pass supplier cost rises on to price,** at least peso for peso. Otherwise hold list prices | Avoids −₱479 a month for each 5% cost rise | High | Owner | Before the first January 2027 order | Ask the supplier whether January's excise changes its prices | Landed margin a pod ≥ ₱159 |
| 5 | **Ask the supplier for pay on pick-up,** or a part payment | Batch 4 short: 100% → 17%. Cash cycle 17.6 → 10.6 days. Frees ₱2.4k–4.3k of working capital | Medium | Owner | Before the Batch 4 order | One message: pick-up payment, minimum order, shipping per piece | Days between paying the supplier and arrival (target 0) |
| 6 | **Record each order the day it is placed, and tap Arrived the day it comes** | Each day of delivery error ≈ ₱354 a cycle. A real 0.75-day spread cuts spare stock from 9 to 7 pieces | High | Manager | From Batch 3's arrival (about 2 Dec) | Tap Arrived on Batch 3 the day it comes | Orders with both dates (target 100%) |
| 7 | **Start new kinds of item at about 3.** No device re-order until about half have sold | Each 7 extra devices tie up ₱1,446, the cash for 8.4 pods (₱1,419 of their gross profit a cycle) | High | Owner | The next new item | Watch how many of the 10 devices sell in their first 2 weeks | Days to sell the first 3 of a new item |
| 8 | **Collections from the shop's own payment times,** with "Already owes" at the till | ₱305 more cash on average; ₱481–898 freed by chasing from day 11; good payers marked Late fall from 20 of 31 to 5 | High | Engineering builds; staff follow up | Release 1; follow up the two Late balances (₱380) now | Message the 2 buyers with Late balances | Share of credit sales paid by Late's start (≥ 80%); Very late ₱0 |
| 9 | **In a new batch's first week, ask buyers to pay at the till** while the supplier is paid at order (known good payers excepted) | Batch 4: ₱1,588 of profit lost as now, against ₱0 (all at the till) or ₱880 (half). Does the same job as #3 and #5 | Medium | Owner and staff | Batch 3's first week (about 2–9 Dec) | Brief the staff before Batch 3 arrives | Credit share of a batch's first 7 days of sales |
| 10 | **Lower the staff discount limit from ₱50 to ₱20;** keep discounts at ₱0 | Avoids ₱247–740 a month of exposure | High | Owner | This week | Settings → staff discount limit | Discounts ÷ gross sales (now 0%) |
| 11 | **Write the credit rule into SOP 9:** who may buy on Not paid yet, one open tab, a first credit of one pod, Very late means no new credit | ₱600 less at risk on the worst tab (₱1,280 → about ₱680); expected value about ₱9 | High | Owner | Next weekly review | Write the four lines | Largest single balance; tabs with 2 or more open sales |
| — | **Must-do, with no direct pesos:** record rent, pay and every running cost, and confirm the tax rate with an accountant. Keep 3% aside until it is confirmed | At ₱10k a month of rent and pay, the first 31 days were a ₱766 loss. 3% tax is ₱594 to date, and the 25 Nov payout was ₱584 over a 3% cap | High | Owner, manager, accountant | This week, then monthly | Enter December's rent and pay, if any | Months with rent and pay entered; rate confirmed |

**Owner decisions** (policy only the owner can set; the recommended default is in brackets):

1. **Spare stock service level** (95%). The shop's own costs support 84–99%: ₱88–159 lost per missed sale against
   ₱2–17 to hold a piece. Anywhere from 90% to 97.5% changes an order by 0–2 pieces.
2. **Payout hold: soft or hard?** (Soft now, and no payout until Batch 4 is paid. Switch to the hard rule, where the
   app refuses the payout, if a payout is recorded again while the reserve question is open.)
3. **Payout rhythm** (once a month, after the next order is covered, and at most about two thirds of profit while
   orders grow).
4. **Supplier terms** (ask for pick-up payment, the smallest order it takes, and whether shipping changes with pieces;
   before about 5 Dec).
5. **Partial orders** (yes: order what fits on the date, then top up; about ₱174 more shipping).
6. **Line strategy** (test XBLACK MAX in Batch 4, if the supplier has it).
7. **Credit rule** (as in #11, chasing from Late at 11 days).
8. **First-week till payments** (yes, while the supplier is paid at order).
9. **Tax** (confirm with an accountant; keep 3% aside until then).
10. **Running costs** (record rent, pay and owner time from December, if real).
11. **Prices** (hold; pass cost rises on).
12. **Staff discount limit** (₱20).
13. **New kinds of item** (start at about 3).
14. **An owner top-up for Batch 4** (avoid it. If one is needed, record it as owner capital; capital is never paid
    back).

## 6. Risks and mitigations: what would prove this wrong

| Risk or hypothesis | Evidence that would prove it wrong | Effect | Mitigation |
|---|---|---|---|
| **H1: empty shelves, not demand, cap sales** | Batch 3's pace falls below about 2.5 a day within a week while 7 or more flavours are still on the shelf. That would mean novelty, not empty shelves | The gain shrinks toward +₱3.2k (45% switching), or toward the ₱1.2k floor | The engine still works; only the size of the gain changes. Re-test with Batch 4 |
| **H2: partial orders keep most of the gain** | The supplier refuses small orders | ~₱0.5k a month less, plus late orders | Then holding the payout (#3) or pick-up terms (#5) becomes essential |
| **H3: the faster line is really faster** | Re-ordered XBLACK MAX earns no more a day per flavour than BLXCK over the same days | The ₱1.6k–3.2k disappears | It's a one-batch test; every piece so far sold within 16.4 days |
| **H4: credit costs timing, not losses** | Any Very late balance, or owed above about 7 days of sales | Expected loss rises from ₱58 | v3's Very late flag, the "already owes" notice, the one-tab rule; a write-off flow when triggered |
| **H5: the engine's numbers match real buying** | Suggested ÷ ordered falls outside 0.8–1.25 | Lost trust; over- or under-ordering | DB tests on live data (36 ± 3 pieces now, 11 New); labelled guesses; the card shows every source |
| **H6: delivery takes 5–7 days** | Batch 3 takes 10 days or more | Order by moves about 3 days earlier; the gain grows (+₱4.3k at 8–12 days) | The app learns it from Arrived. Message the supplier when an order shows Late |
| Habit: a payout right after an order | A payout recorded while the reserve question is open | The 25 Nov shortfall repeats | Suggested payout ₱0, a notice, and the hard-rule option |
| Unrecorded costs | Rent and pay are entered | Margins and payout room shrink. Break-even was 63 pieces a month at ₱10k of costs | Running costs grow with what is entered |
| Tax | The accountant confirms 3% | ₱575 a month; Safe to distribute was ₱584 too high on 25 Nov | Keep 3% aside until confirmed (not tax advice) |
| January excise | The supplier raises costs | −₱479 a month for each 5% not passed on | Pass it on; cost-change margin check next |
| Devices | They sell slower than a pod flavour | Cash tied up; Order by ~2 days late | Start new kinds small; devices as their own kind later |
| Build size | Release 1 slips past Batch 4's order date | The owner orders without the engine | §1's numbers stand alone for Batch 4; the profit bridge and Dashboard fixes move to release 2 |
| Regulation | — | Unknown | A lawyer should check the flavour names once against RA 11900's rule on descriptors that appeal to minors (mix branch). Not legal advice |

## 7. Next 30 / 60 / 90 days

- **30 days (to 26 Dec)**
  - **Owner:**
    - No payout until Batch 4 is paid. Set the inventory reserve to the next order now (about ₱5,660).
    - Message the supplier this week: pick-up payment, the smallest order, XBLACK MAX at ₱160, and January prices.
    - Lower the staff discount limit to ₱20. Write the credit rule into SOP 9.
    - Enter rent and pay, if any. Ask an accountant about the tax rate.
  - **Manager:** tap Arrived on Batch 3 the day it comes (about 2 Dec). Record every order on the day it is placed.
  - **Staff:** in Batch 3's first week, ask buyers to pay at the till. Follow up the two Late balances (₱380).
  - **Batch 4 (about 5–7 Dec):** order on the Order-by date, at least what the cash buys (about 14 pieces), including
    XBLACK MAX's fastest flavours if available. Top up about 10–12 Dec as collections come in.
  - **Engineering, release 1** (§9.1 items 1–11):
    1. Migration A, with the DB tests (every new check passes, with 0 failures).
    2. The app.
    3. Migration B (the v2 rollout order).
    4. The Help Planning tab, and the SOP doc's third tab.
- **60 days (to 25 Jan)**
  - **Engineering, release 2,** before the first monthly review (first week of January):
    - the profit bridge "What moved net profit"
    - the Dashboard sort and labels
  - **Next build:** the cost-change margin check, before the first January order.
  - **First monthly review with the bridge** (December against November).
  - **KPIs:** empty shop-days under 0.5 a month; suggested ÷ ordered 0.8–1.25; reserve within 15% of the real order;
    no payouts while the reserve question is open.
  - **Owner decides:** the hard payout rule, and the payout policy.
  - **Read the line test:** XBLACK MAX against BLXCK, ₱ a day per flavour on the shelf.
- **90 days (to 24 Feb)**
  - With 4 or more orders that have both dates, delivery is no longer a guess. Review spare stock and the 30-day
    cover limit.
  - Check the Later list's triggers (§9.3):
    - write-off: a balance 48 days or older
    - per-buyer limits: 10 buyers with 3 paid sales
    - delivery per supplier: a second supplier
    - devices as their own kind: 3 devices sold
    - a forward cash view: rent and pay recorded
    - a price test: 2 cycles fully in stock
  - Re-run this review on 3 months of data.

## 8. Open questions, data gaps and sources

**Open questions** (in order of value):

1. **Delivery time.** How many days does delivery really take? Batch 3's arrival will be the first real figure. Were
   Batches 1 and 2 ordered before their arrival days?
2. **The supplier.**
   - What is its smallest order? Can the shop pay on pick-up, or in part?
   - Does shipping rise with the number of pieces? (Fitted from only 3 orders.)
   - Does it still sell XBLACK MAX at ₱160? Will it sell more than 3 of a flavour?
   - Will January's excise reach its prices?
3. **Payout policy.** Should the hold be a hard rule? Monthly payouts? Up to what share of profit?
4. **Running costs.** Rent, the manager's pay, owner time: how much, and from when?
5. **Tax.** What are the shop's status and rate? It is 0% in the app; the statute is 3% for non-VAT sellers.
6. **Credit.** Who may buy on credit, how much, one open tab or more? When is a balance written off?
7. **Line strategy.** Was XBLACK MAX dropped on purpose? Will lines rotate every batch?
8. **Devices.** Do they fit XBLACK MAX pods? Why 10? Should they be planned on their own?
9. **Buyer names.** Are names typed the same way every time? Matching is by name only.
10. **Paydays.** Do buyers pay around the 15th and 30th? That needs 8 or more weeks of data.
11. **Flavour names.** Do any flavour descriptors raise an RA 11900 question? (Lawyer.)

**Data gaps:**

- No order has both dates.
- Two sell-through curves.
- 20 flavours at 3 pieces each.
- 31 collections and no defaults.
- No device or BLXCK sales.
- No rent or pay recorded.
- No price variation within a line.
- No competitor prices.
- Follow-ups on unpaid sales are not recorded.

**Sources**

**Shop data:**

- Live Supabase project, read-only SELECTs and the owner's `finance_report` in a rolled-back transaction: 26 Nov 2026,
  18:59 and 20:16 Manila.
- The `analysis/baseline.py` data block.
- Design v2 and the maths, UX and build reviews (workflow wf_42d7e325-55a).
- The suggestion map (workflow wf_1d6ca904-639: 94 items, about 60 after removing duplicates).
- The four branch files in `analysis/`.

**External** (every one accessed 26 Nov 2026 by the branches, which list the links):

- *Out-of-stock behaviour:* Gruen, Corsten and Bharadwaj, *Retail Out-of-Stocks* (GMA, 2002); Corsten and Gruen,
  "Stock-Outs Cause Walkouts", *HBR*, May 2004.
- *Inventory:*
  - Harris, "How Many Parts to Make at Once" (1913), the economic order quantity.
  - Arrow, Harris and Marschak, "Optimal Inventory Policy", *Econometrica* (1951).
  - Edgeworth (1888), the newsvendor trade-off.
  - Silver, Pyke and Peterson, the safety-stock formula.
  - Dickie, "ABC Inventory Analysis…", *Factory Management and Maintenance* (July 1951).
  - Juran, "The Non-Pareto Principle" (1974).
  - Carrying cost of 20–30% a year (Fishbowl; Shopify).
- *Forecasting:* R. G. Brown (1956), exponential smoothing; James and Stein (1961) and Efron and Morris (1975),
  shrinkage.
- *McKinsey-originated methods:*
  - Minto, *The Pyramid Principle*, on MECE (McKinsey Alumni, "MECE: I invented it").
  - Marn and Rosiello, "Managing Price, Gaining Profit", *HBR*, Sep–Oct 1992: 1% on price → +11.1% operating profit
    across 2,463 companies.
  - Marn, Roegner and Zawada, "The power of pricing", *McKinsey Quarterly* (2003).
  - Hall, Lovallo and Musters, "How to put your money where your strategy is", *McKinsey Quarterly* (March 2012).
  - Koller et al., *Valuation* (McKinsey, first edition 1990), on the ROIC tree.
  - Conn and McLean, *Bulletproof Problem Solving* (2018).
- *Finance:*
  - Richards and Laughlin, "A Cash Conversion Cycle Approach to Liquidity Analysis", *Financial Management* (1980).
  - Higgins, "How Much Growth Can a Firm Afford?", *Financial Management* (1977).
  - DuPont / F. Donaldson Brown (1914, Hagley Museum).
  - Brealey, Myers and Allen, *Principles of Corporate Finance*, credit management.
- *Credit and statistics:*
  - Basel II (BCBS, 2004/2006), expected loss = PD × LGD × EAD.
  - Jeffreys (1946); Hanley and Lippman-Hand, *JAMA* (1983), the rule of three.
  - Kaplan and Meier, *JASA* (1958).
  - IFRS 9 (IASB, 2014), the provision matrix.
- *Products:*
  - Kasavana and Smith, menu engineering (1982).
  - Goldratt, *The Goal* (1984).
  - E-cigarette price elasticities of −0.4 to −2.2 (Huang, Tauras and Chaloupka, *Tobacco Control*, 2014; NBER
    w32435; PMC7674118).
- *Philippine rules:*
  - 3% percentage tax from 1 July 2023 (BIR RMC 69-2023).
  - VAT threshold of ₱3M (NIRC Sec. 109(BB), as amended by TRAIN).
  - Vapor-product excise rising 5% a year (RA 11467; Manila Bulletin, 15 Jan 2026).
  - BSP credit-card ceiling of 3% a month (Circular 1165, 2023; check it still applies).
  - RA 11900 flavour-descriptor rule (as reported).

Tax, legal and accounting points are planning estimates, not advice: a qualified accountant or lawyer should confirm
them.

---

## 9. Build list (for engineering)

Everything below is worked out in Postgres on every load, through design v2's functions: `plan_params`, `plan_orders`,
`plan_core`, `collection_stats`, `restock_plan(p_with_cash)`, `stock_alerts`, `collection_days`, and the new
`profit_bridge`. No planning number is typed by hand. A starting guess shows as "starting guess" until enough history
replaces it.

- **Release 1** ships with the engine (task 23), before Batch 4 is ordered if possible.
- **Release 2** follows before the first monthly review (by 31 Dec).

### 9.1 Build now, ranked

| # | Item | Design section | What the app calculates | Fallback when history is thin | ₱ impact | Release |
|---|---|---|---|---|---|---|
| 1 | **Top-down planning engine** | Methods 1, 2, 3, 5, 6; scope A1–A6 | See the formulas under this table. Statuses: order / soon / ok / idle / new / skip | L = 7, σ_L = 1.75 ("starting guess") until one order has both dates. R = 14 until 2 order days. λ = last batch's pieces ÷ R if open under 7 days or under 10 sold; 0 with no sales (no suggestions). "Rough" if weighted sold < 30 or open < 14 days. New = never on the shelf (no suggestion) | +₱4.0k a month of gross profit with #2 (₱3.2k–4.7k). Avoids v1's ₱60k–75k wrong suggestion. Live: λ 2.0; reorder point 23 (14 + 9 spare); target 56; Order by Mon 7 Dec (Sat 5 Dec for pods only); 36 pcs if ordered now | 1 |
| 2 | **Next order (estimate), money check and Fits your money** | Method 8 (now, next, budget, fit); A10 | Next order: see the formulas below. **Budget** = spare cash + inventory reserve + open credit balances older than the usual days by the order day and not Very late today. **Fit** = rounds of one piece per product, fastest first, while landed cost ≤ budget | No batch: fees 0, "no fee history". Under 10 credit sales paid in full: count balances older than 7 days by the order day. λ = 0: no estimate | Keeps ₱10.7k of the ₱11.3k a month that unlimited cash would give. Avoids ₱1.2k–6.7k on Batch 4 compared with waiting for a full batch. Live: next 33 pcs ≈ ₱5,660; budget ₱2,420 buys 14 pcs ≈ ₱2,365 | 1 |
| 3 | **Suggested payout with the hold, plus a notice** | Method 8 (distribution pre-fill); B13 | hold = max(0, next order − inventory reserve − budget's collections). suggested = max(0, min(safe, spare cash − hold − running costs a month)). Running costs = non-tax expenses (batch-charged ones included) over max(30, min(90, days open)) days × 30. Pre-fill empty when 0. Notice when `funds_summary.needs_decision`: "Batch N used the inventory reserve. Set the reserve for the next order before paying out." | Running costs say "starting guess" under 60 days open. No expenses: 0, with a hint. λ = 0: hold 0 | On 25 Nov it would have pre-filled ₱0, not ₱4,232. Batch 4's chance of being short would have been 2%, not 100%. +₱432 a month at steady state | 1 |
| 4 | **Inventory reserve default "Next order (estimate)", and a line saying when the money is needed** | B11, B12 | SetAsideForm picks: Next order (estimate) · ₱X (the default when above 0), Same as Batch N, All spare cash, Nothing. Reserve card: "Your next order (around {Order by}) will cost about ₱X; ₱Y more than you're keeping." | λ = 0: the default falls back to "Same as Batch N" | Holds ₱5,660 instead of ₱7,214. Before Batch 3 the old pre-fill was ₱2,020 (28%) too low | 1 |
| 5 | **Automatic low-stock alert and one Low rule** | Method 7; A8, A9; rollout A → app → B | alert_at = reorder_at if typed by hand, else max(1, the product's reorder point) for products in the plan; 0 for new and skip. Low = alert_at > 0 and position ≤ alert_at. `stock_alerts()` feeds the nav badge, Inventory chip, filter and KPI, the product page and the Sell tile. Blank = Auto in the forms, `save_product` and CSV import | No pace yet: 0 ("Auto, once it sells") | No direct pesos. Low goes from 31 of 31 to each flavour's last piece (badge 20 after migration B) | 1 |
| 6 | **Collections from the shop's own buyers** | Method 9 (v3); B14; new Sell notice; new Finance lines | `collection_stats` v3: usual = p50, Late after = p80, Very late after = greatest(p95, Late + 7), using `percentile_disc` over Not paid yet sales **paid in full** in the last 180 days (days = last payment day − sale day). Chips on Collectibles; Usual / Late / Very late on Finance. **Sell:** "Already owes ₱X since {date}. Most buyers pay within {usual} days." It warns when the oldest balance is Late or Very late, and never blocks. **Finance:** "Owed = N days of sales" = receivables ÷ (net sales of the last 30 days ÷ min(30, days open)), and "Sold on credit (last 30 days): X%" | Under 10 paid in full: 7 / 7 / 30 ("starting guess"). Days of sales owed needs 7 days open | ₱305 more cash on average; ₱481–898 freed; good payers marked Late fall from 20 of 31 to 5; a stuck balance can't hide. Live: 9 / 11 / 18; ₱1,700 / ₱380 / ₱0; 3.6 days; 69.5% | 1 |
| 7 | **Batch report "What to do next" from the engine** | Method 10; C15 | "Order the next batch by {Order by}…" or "now…", plus "Batch N is on the way, due about {date}". It replaces the almost-sold-out rule (report/page.tsx:974–981) | Like #1 | Avoids today's wrong "Order now" and a possible duplicate ₱5.7k order | 1 |
| 8 | **Restock "Worked out from your history" card, plus due and late on On the way** | Screens: Restock; D17, D18 | Read-only lines: Pace, Delivery, Order rhythm, When to order, Spare stock, Product mix, each with its source and a "starting guess" label. KPIs: Order by, On the way, Suggested order (with Fits your money). Due = order day + round(L). Late after max(longest past gap, ⌈L + 2σ_L⌉) days. Remove PlanForm, "Use N days" and "Update low-stock alerts" | As #1 | No direct pesos. Every number can be traced, which is what makes the owner trust it | 1 |
| 9 | **Not selling list** | Method 6 (idle); A7 | Idle when on the shelf with no sale for min(60, max(R, 3 ÷ pace now)) days; ₱ at cost tied up | R guess of 14 days | ₱0 today. About 5% false flags, against 20–34% with R alone | 1 |
| 10 | **Product mix by line: "₱ a day per flavour on the shelf"** | `restock_plan` mix (new); C15 tile | mix.lines[] = Σ w·sold × (price − cost − average fee a piece) ÷ Σ exposure, per category; best_category_id. Costs are joined in `restock_plan` only. Card sentence, and a batch-report tile "Gross profit a day on the shelf" | A line shows after 7 days with stock; best_category_id needs 2 lines | Measures the XBLACK MAX test (₱0–3.2k a month at stake) and avoids the total-profit trap | 1 |
| 11 | **Help → Planning tab and the SOP changes** | Help: Planning tab; E20; `docs/sop-doc.js`; the third tab of the SOP doc | Static text from §10: 16 cards grouped under How it works, Stock, Money, Products and prices, Reviews, then 4 routines. Live numbers stay on the Restock card. SOP 3, 9, 13, 14 and 15 and PLAN_WORDS as in §9.2 | The monthly review card is a checklist in release 1 and points to the bridge in release 2 | The owner's second ask; no direct pesos | 1 |
| 12 | **Profit bridge "What moved net profit"** | New `profit_bridge(p_from, p_to)`; Finance → Profit & loss card | This period against the one before, per day: days with stock, flavours on the shelf, sales per flavour, price and mix, discounts, cost a piece, fees, expenses, tax, counts. The effects add up exactly. The card names the action for the biggest minus | The period before sold nothing: "Nothing sold in {month} to compare with". A short month gets a note | Diagnostic: on October → November it puts 53% of a ₱529-a-day drop on being out of stock | 2 |
| 13 | **Dashboard fixes** | Dashboard | Sort Best sellers by sales a day on the shelf ("fastest on the shelf"). Label profit and margin "before restocking fees" (₱167.50 / 50.8% against Finance's ₱159.45 / 48.3%) | — | No direct pesos; stops the Dashboard misleading once flavours differ in depth | 2 |

Formulas behind items 1 and 2:

- **Delivery time.** L = max(1, (Σ gaps + 7) ÷ (n + 1)): the 7-day guess counts as one pretend order. σ_L =
  max(0.25, √((Σ(g − L)² + 2·(L/4)²) ÷ (n + 1))).
- **Order rhythm.** R = the mean gap between order days, each = coalesce(ordered_on, received_on), kept between 7 and
  30. Half-life H = 2R kept between 21 and 56.
- **Shop pace and shares.**
  - λ = Σ w·sold ÷ weighted time with any stock, with w = 0.5^(age ÷ H).
  - Each product's speed r_i is shrunk toward its category with k = 7 shelf-days.
  - pace_i = λ·r_i ÷ Σ r over the plan.
- **Shop reorder point and target.** Reorder point = λL + 1.645·√(L·λ·lump + λ²σ_L²). Target = λ(L + R) +
  1.645·√((L + R)·λ·lump + λ²σ_L²).
- **Shares and position.** Each product's reorder point and target are a largest-remainder share of the shop figures.
  Shop position = Σ min(position_i, max(target_i, 3)).
- **Order by.** Order by = start + ⌊(position − reorder point) ÷ λ⌋. Start is the due day while the shelf is empty
  and an order is on the way; otherwise today.
- **Next order.** Pieces = round(target − reorder point) when Order by is after today, else round(target − position).
  Shared by largest remainder, with no rounding up per product. Fees = the average of the last 3 batches × max(1,
  pieces ÷ their average pieces).

### 9.2 Changes to design v2

| v2 section | Change | Why |
|---|---|---|
| Method 1 Delivery time | L = max(1, (Σ gaps + 7) ÷ (n + 1)), the guess counting as one pretend order. Keep σ_L and late_after as written. Drop per-supplier due dates for now | One odd first delivery shouldn't swing the plan: a 5-day first order gives L = 6, not 5. A same-day entry gives 3.5, not 1. Each day of L moves Order by a day (about ₱354 a cycle). The supplier is blank on all 3 batches |
| Method 2 Order rhythm | Order day = coalesce(ordered_on, received_on); drop the "Arrived − L" estimate. Keep R between 7 and 30 (not 60). The 14-day guess and H = 2R (21–56) stay. Live: R 14.5, H 29 (not 18 and 36) | The estimated 23-day gap is the late ordering this plan fixes. R 14.5 gives 33–36-piece orders, like the real 30–40. The economic order cover is 29–37 days, and savings past 30 are under ₱184 a month. The owner sees real dates |
| Method 6 Position and Order by | Keep as written: the cap max(target_i, 3), start at the due day, rounded down. Document that the 10 devices count as 3 pieces, which puts Order by about 2 days after a pods-only date (7 Dec against 5 Dec) | Honest within 2 days, and worked out again daily once Batch 3 is on the shelf. Planning devices as their own kind waits for device sales |
| Method 8 Next order (estimate) | Pieces = round(target_shop − rop_shop) when Order by is after today, else round(target_shop − position_shop), shared by largest remainder, instead of v2's Σ ceil(target_i − left_i) per product. Do **not** scale it by the company-paid share of past batches (a cash-branch proposal). Subtract only what is already paid toward this order | The order is placed when stock is down to the reorder point, so size it from there: 33 pieces, against 36 if it were placed today on an empty shelf. Summing each product's own gap ties the estimate to which flavours happen to be out today. Batch 1 was paid by the owners at start-up, so a historical company-paid share would hold a third too little |
| Method 8 Budget | Keep v2's rule (balances older than the usual days by the order day), but leave out balances that are Very late today. The probability-weighted version waits | A dead balance must not fund an order. The weighted version differs by ₱86 today |
| Method 8 Distribution suggestion | suggested = max(0, min(safe, spare − hold − running month)), with hold = max(0, next order − reserve − collect). Empty pre-fill at 0. A notice while `needs_decision`. The hint names the hold and the running costs | On 25 Nov v2's rule still pre-fills ₱3,492; this one gives ₱0. Batch 4's risk would have been 2% instead of 100% |
| Method 9 `collection_stats` | Values = days of sales paid in full only (drop the open balances older than the median). Very late = greatest(p95, Late + 7). Fallback 7 / 7 / 30 under 10. Live 9 / 11 / 18 (v2: 12 / 19) | v2 lets stuck balances set their own bar, so they are never Very late. Paid-only can't be fooled and is simpler |
| Methods 4–5 | Keep exactly: value-pace ABC for display only, one pooled z of 1.645. Add three notes: no z per class; costs stay out of `plan_core`; no money decision depends on a class | The critical ratio follows margin a piece, which is about equal across pod lines. Classes repeat only 63–64% of the time |
| `restock_plan` JSON | Add mix.lines[{category_id, name, flavours, shelf_days, sold_90, gp_day_per_flavour_cents}] and best_category_id. Add the card sentence and the batch-report tile | The recurring product decision is which line to order. Total profit favours the slower line |
| Sell screen (new) | The "Already owes" notice from the `collectibles()` rows already loaded, plus `collection_days()`. A warning only, never a block | It is the moment to ask for the old tab, at no new database cost |
| Finance receivables (B14) | Add "Owed = N days of sales" and "Sold on credit (last 30 days)". Show Usual / Late / Very late with v3 | A measure that grows with paying behaviour, not with shop size |
| New `profit_bridge` (release 2) | Security definer, stable, `is_manager()` (else 42501). Per-day effects as above. Tests: Σ effects = Δ net profit a day within 1 centavo; net profit = `finance_report`; a cashier is refused | Makes the MECE monthly review exact on a phone |
| Dashboard (release 2) | Sort by perDay, then pieces. Add the "before restocking fees" labels | The sort only works today because every flavour sold exactly 3 |
| Help, Planning tab | Replace v2's section list with the 16 cards and 4 routines in §10. SOP 9 check: "Follow up on every sale marked Late or Very late. Before a new Not paid yet sale to someone who owes, ask for the old one first." SOP 13 step 3: a slow flavour still earns its place; stop reordering only Not selling. SOP 15 step 3: the suggestion keeps the next order and a month of running costs. SOP 3 hint: a new line gets every flavour; a new kind of item starts at about 3. PLAN_WORDS adds: Days of sales owed; Late / Very late; Earns a day on the shelf; What moved net profit | The owner asked for the methods, how the shop uses them, and how to use them |
| Tests and live check | Update the Live check: λ 2.01; reorder point 23; target 56; Order by 7 Dec; 36 now / 33 next; about ₱6,080 / ₱5,660; fits 14; collections 9 / 11 / 18. New DB checks below the table | Every rule is enforced and tested in Postgres (CLAUDE.md) |

The new DB checks:

- One 5-day order gives L = 6.
- A long gap keeps R at 30.
- The next order = round(target − reorder point), and the shares add up to it.
- Eight stuck balances leave Late's start unchanged. A stuck balance becomes Very late after very_late_after + 1 days.
- The money check leaves out Very late balances.
- The suggested payout ≤ Safe to distribute, and it is 0 when spare cash < hold + running costs.

### 9.3 Leave for later

| Item | Why later | Trigger |
|---|---|---|
| Hard payout hold in `funds_summary` | An owner decision first; the soft rule already gives ₱0 on 25 Nov | A payout recorded again while the reserve question is open, or the owner asks |
| Probability-weighted collections in the money check | ₱86 different today | 3 months of collections |
| Kaplan–Meier collection thresholds | Changes the answer by a day, for more code | — |
| Write-off ("Won't be paid") and a bad-debt estimate | Expected loss is ₱58 | The first balance 30 days past Very late (about 48 days old), or the owner stops chasing |
| Per-buyer limits and "usually pays in N days" | Only 1 buyer has 3 credit sales paid in full. In a test against past sales they fired on 24–35% of credit sales with no link to slow payment | 10 buyers with 3 paid sales, or an owner limit policy |
| Delivery time per supplier; supplier due dates | The supplier is blank on all 3 batches | A second supplier |
| Devices (a kind of item) planned as their own pool | No device sales yet; the cap costs about 2 days on Order by | 3 devices sold |
| Cost-change margin check on Order stock and Arrived | The next build after the engine | Before the first January 2027 order (excise) |
| Forward cash view (13-week style), payout-ratio hint, "cash comes back in N days" line, effective tax-rate hint | Small at ₱716 a month of costs and 3 orders | Rent and pay recorded; 3 months of history |
| Dashboard pace from `plan_core`, and landed cost | After the engine settles | Release 2 or later |
| An order-size screen, a rhythm setting, a "7+ flavours" pace | Each is worth under ₱200 a month | — |
| Discount hint in Settings, starting-order hint for a new line, price hint on Add product | ₱0 at stake today | After a price test |
| A +₱10 price test on one line | Owner action | After 2 cycles fully in stock |
| Supplier and fee hints on Order stock (D19) | No batch has a supplier yet | Orders with suppliers |
| Spare stock by flavour class | **Rejected, not later.** No economic basis; it adds 1.2–4.0 pieces | — |

---

## 10. Planning page (Help → Planning)

Phone-first. The page has one short intro, then cards that are folded until tapped, each with four parts:

- **What it answers**
- **The method** (and where it honestly comes from)
- **How the app works it out**
- **How to use it** (steps, and the screen)

Group the cards under five headings: **How it works** (1, 2), **Stock** (3–6), **Money** (7–10), **Products and
prices** (11–14), **Reviews** (15, 16). Then come the routines.

Figures marked "on 26 Nov" are examples. The live figures are on Restock → Worked out from your history.

### Intro

This page explains how the app works out its suggestions, and the business methods behind them.

- **Your numbers.** Every number comes from your own sales, orders and payments. It is worked out again each time you
  open a page, so it moves as the shop grows.
- **Starting guesses.** When there is too little history, the app uses a starting guess and says so.
- **Where the methods come from.** They are standard methods from retail, stock control and finance. Some are known
  from McKinsey & Company: splitting a problem into parts with no gaps or overlaps (MECE), solving it answer-first
  with the 80/20 rule, and the pocket price waterfall. Each card says where its method comes from.
- **Your decisions.** Prices, payouts, the profit split, the tax rate and who gets credit stay yours.

### Cards

**1. How to solve a shop problem (the McKinsey way)**
- *What it answers:* How do we find the one thing worth fixing, fast?
- *The method:*
  - Ask one clear question.
  - Split it into parts that don't overlap and leave nothing out: MECE, from Barbara Minto at McKinsey in the late
    1960s (*The Pyramid Principle*).
  - Start with your best guess and check it with numbers (hypothesis first).
  - Work on the part worth the most pesos: the 80/20 rule, named after Vilfredo Pareto by Joseph Juran.
- *How the app works it out:* The app gives you the numbers for each part: Restock for stock, Finance for money,
  Collectibles for what is owed. For example, profit fell from ₱730 a day in October to ₱201 in November. Split into
  its parts, being out of stock was more than half of the drop. Price and cost hardly moved.
- *How to use it:*
  1. Write the question with a number and a date. For example: "Why did profit a day fall last month?"
  2. Split it: pieces sold, profit a piece, expenses, tax.
  3. Guess which part moved most, then check it on the screen.
  4. Fix the part worth the most pesos first. Leave the small ones.
  5. Agree one action, who does it, by when, and the number to watch.
- *Screen:* Help → Planning, then the monthly review (card 15).

**2. How the app plans**
- *What it answers:* Where do the app's suggestions come from?
- *The method:* Planning from your own history.
  - Recent weeks count more than old ones: exponential smoothing (R. G. Brown, 1956).
  - A product with little history leans on similar products until it has its own: shrinkage (James and Stein, 1961).
  - Both are standard forecasting practice.
- *How the app works it out:*
  - Every number is worked out again from your records each time you open the page.
  - Until there is history, it uses starting guesses:
    - 7 days for delivery (your 5–7-day plan)
    - 14 days between orders
    - 7 and 30 days for unpaid sales
    - your last batch for pace in the first week
  - Each guess is replaced by your history: your first order with Arrived, a second order day, 10 credit sales paid in
    full, and a week of sales.
- *How to use it:*
  1. Record every order in Order stock on the day you order.
  2. Tap Arrived on the day it comes.
  3. Enter every expense and every payment.
  4. Open Restock → Worked out from your history to see each number and where it came from.
- *Screen:* Restock → Worked out from your history.

**3. Your shop's pace**
- *What it answers:* How many pieces does the shop sell, and how does that split across flavours?
- *The method:*
  - Demand is counted only while there is stock: an empty shelf is not a day with no buyers.
  - The pace is worked out once for the whole shop, then shared out by each flavour's speed (top-down).
  - Standard demand planning.
- *How the app works it out:*
  - Pace = pieces sold ÷ days with stock. A sale 4 weeks ago counts half as much as one today.
  - On 26 Nov the shop sold about 2 a day (14 a week).
  - Each flavour gets a share by how fast it sold on its own days on the shelf.
  - Why top-down: the flavours' own speeds added up to about 16 a day, while the shop sold 2. Buyers move between
    flavours, and each batch opens with a rush.
- *How to use it:*
  1. Read pace as "when every flavour is in".
  2. A flavour that sold out in a day is not a reason to order 20 of it.
  3. If the card says Rough, the numbers firm up as sales come in.
- *Screen:* Restock → Worked out from your history → Pace.

**4. When to order: the Order-by date**
- *What it answers:* When must the next order go in, so the shelf never runs empty?
- *The method:*
  - The reorder point: order when stock falls to what sells while an order is on the way, plus spare stock. From
    inventory research of the 1950s (Arrow, Harris and Marschak, 1951).
  - It matters because shoppers walk out when their item is out (Gruen, Corsten and Bharadwaj, 2002; Corsten and Gruen,
    *Harvard Business Review*, 2004).
- *How the app works it out:*
  - Reorder point = pace × delivery days + spare stock. On 26 Nov: about 23 pieces, which is 14 that sell in 7 days of
    delivery, plus 9 spare.
  - Your stock = on the shelf − reserved + on the way. Order by = the day it reaches the reorder point.
  - While the shelf is empty and an order is on the way, the app counts from that order's due day.
  - Your own sales suggest that about 85 in 100 buyers leave when their flavour is out. An empty shop costs about ₱354
    of profit a day, and up to ₱576 when the shelf would be full.
- *How to use it:*
  1. Open Restock and read Order by.
  2. Order on or before that day, even if the shelf still looks full.
  3. Place one order per cycle, with every flavour that needs it.
  4. Count the days the shop was empty each month. Aim for none.
- *Screen:* Restock → Order by (the batch report shows the same date).

**5. Spare stock and delivery time**
- *What it answers:* How much extra stock covers a late delivery or a busy week?
- *The method:*
  - Safety stock: extra pieces sized from how much daily sales and delivery days vary. This is the textbook formula
    (for example Silver, Pyke and Peterson).
  - The 95% level weighs the profit lost on a missed sale against the cost of holding one more piece. This is the
    newsvendor trade-off (Edgeworth, 1888; Arrow, Harris and Marschak, 1951).
- *How the app works it out:*
  - Spare stock is worked out once for the whole shop, because one flavour's slow day is another's busy one.
  - It is sized so the shop runs short in only about 1 order cycle in 20. On 26 Nov: about 9 pieces.
  - About 2 of those 9 are there only because delivery time is still a guess. With a reliable delivery it would be
    about 7.
  - A missed sale costs about ₱160 of profit. Holding one more piece costs ₱2 to ₱17.
  - Delivery time is learned from Order stock → Arrived. The first real orders are blended with the 7-day guess, so
    one odd delivery doesn't swing the plan.
- *How to use it:*
  1. Tap Arrived on the day each order comes.
  2. Check the Delivery line. It says "starting guess" until an order has arrived.
  3. Message the supplier when an order shows Late.
  4. Watch spare stock shrink as delivery becomes reliable.
- *Screen:* Restock → Worked out from your history (Delivery, Spare stock); On the way.

**6. How much to order**
- *What it answers:* How many pieces should each order be?
- *The method:*
  - Order up to a target: enough for the delivery days and the usual gap until the next order, plus spare stock. This
    is a periodic-review policy from operations research.
  - Shipping against holding cost: the economic order quantity (F. W. Harris, 1913).
- *How the app works it out:*
  - Target = what sells during delivery and your usual gap between orders, plus spare stock, less what you have. The
    gap is about 14.5 days now, kept between 7 and 30.
  - On 26 Nov the next order was about 33 pieces, about ₱5,660 with shipping.
  - Shipping has been about ₱250 an order whatever the size, so doubling an order saves under ₱200 a month. An empty
    day costs ₱354. So the app never tells you to wait for a bigger order.
- *How to use it:*
  1. Read Suggested order on Restock: the pieces, and about ₱X with restocking fees.
  2. Tap Copy order list to message the supplier, or Order this to record it.
  3. Adjust for what you know: a flavour stopped, a promo, the supplier's pack sizes.
  4. If the shipping fee looks big next to a small order, order anyway on the date.
- *Screen:* Restock → Suggested order; Order stock.

**7. Money for the next order**
- *What it answers:* Will we have the money on the Order-by date? If not, what do we order?
- *The method:*
  - A short cash forecast to the order day: the rolling cash forecast used in treasury work, cut to one order cycle.
  - The cash conversion cycle, which is how long a peso is away (Richards and Laughlin, 1980).
  - When money is short, buy the best value per peso first.
- *How the app works it out:*
  - Money by the Order-by date = spare cash + the inventory reserve + unpaid sales your buyers usually pay by then.
    Very late ones never count.
  - If that is less than the order, Fits your money lists what it buys: one piece of each fastest flavour first, round
    by round.
  - On 26 Nov: ₱340 + ₱0 + ₱2,080 = ₱2,420, about 14 pieces.
  - Paying the supplier at order adds the delivery days to the time your peso is away: about 18 days instead of 11.
- *How to use it:*
  1. On Restock, read the money line under Suggested order.
  2. If it says Not enough money for all of it yet, order Fits your money on the date. Top up when collections come
     in.
  3. Ask the supplier to let you pay on pick-up (Order stock → payment).
  4. If the owner puts money in, record it under Finance → Balance → Record capital put in. Capital is never paid back.
- *Screen:* Restock (money line, Fits your money); Order stock → payment.

**8. Payouts: keep what the shop needs first**
- *What it answers:* How much can we pay out without starving the next order?
- *The method:*
  - Pay the owners only out of profit and spare cash, never out of capital or the next order's money. This is capital
    maintenance and cash management, standard accounting.
  - A business creates value when the return on the money tied up beats what that money costs. This is the
    return-on-capital rule in McKinsey's book *Valuation* (1990).
  - How fast a shop can grow on its own money: Robert C. Higgins, 1977.
- *How the app works it out:*
  - Safe to distribute = the lower of profit kept and spare cash (cash − tax reserve − owed to suppliers − inventory
    reserve).
  - The suggested payout also keeps the part of the next order that your unpaid sales won't cover, plus a month of
    running costs.
  - It would have suggested ₱0 on 25 Nov. That day ₱4,232 was paid out 14 minutes after Batch 3 used up the reserve,
    and Batch 4's money was gone.
  - Each peso in stock and unpaid sales earned about ₱1.50 in the first month (before rent and pay, which aren't
    recorded yet), so keeping it in the shop pays.
  - Each batch earned 78% to 95% of its cost. Paying out up to about two thirds of profit still lets orders grow to a
    full shelf.
- *How to use it:*
  1. Right after recording an order, set the Inventory reserve: pick Next order (estimate).
  2. Pay out once a month, after the next order is covered.
  3. Tap Record distribution. It starts at the suggestion. Pay out less if you like; the app refuses more than Safe
     to distribute.
  4. Never record a payout between an order and setting the reserve again.
- *Screen:* Sales → Finance → Overview (Inventory reserve, Owner distributions).

**9. Not paid yet: Late and Very late**
- *What it answers:* When is an unpaid sale late, and how much money is tied up in them?
- *The method:*
  - Ageing what buyers owe, using your own buyers' payment times instead of fixed 30 / 60 / 90-day groups. This is
    standard credit practice; IFRS 9's provision matrix (2014) uses the same idea.
  - Days of sales owed (DSO), part of the cash conversion cycle.
- *How the app works it out:*
  - It uses Not paid yet sales paid in full in the last 180 days. Half were paid within 9 days, and 8 in 10 within 11.
  - So Late = owed more than 11 days, and Very late = more than 18 days (always at least a week after Late).
  - Only sales paid in full set the line, so a buyer who stops paying can't hide.
  - Until 10 sales are paid in full, the app uses 7 and 30 days.
  - On 26 Nov the shop was owed 3.6 days of sales. It has run between 2 and 7 days.
- *How to use it:*
  1. Open Collectibles. Follow up every sale with a Late chip.
  2. For a Very late sale, tell the owner: no new credit until it is paid.
  3. Each month on Finance, compare "Owed = N days of sales" and "Sold on credit" with the month before.
  4. If days owed went up but the credit share didn't, buyers are paying more slowly: chase sooner.
- *Screen:* Collectibles; Sales → Finance → Balance (Receivables).

**10. Who gets credit, and what it costs**
- *What it answers:* Should this buyer get Not paid yet, and what does credit cost the shop?
- *The method:*
  - The credit decision: give credit when the chance of being paid makes the sale worth more than it costs. This is
    from corporate-finance textbooks (for example Brealey, Myers and Allen).
  - Expected loss = the chance of not being paid × what is lost × the amount owed, as in bank rules (Basel II, 2004).
- *How the app works it out:*
  - None of the 31 credit sales settled so far has failed. Expected bad debt on what is owed is about ₱58.
  - The real cost is timing. The cash comes back about 9 days after the sale, but the supplier is paid at order. On
    Batch 4's order day, credit holds back about ₱2,155, which can cost about ₱1,588 of profit in empty-shelf days.
  - At the till, the app shows "Already owes ₱X since {date}" for a buyer who owes.
- *How to use it:*
  1. Type the buyer's name the same way every time.
  2. If the app shows Already owes, ask for the old tab first.
  3. If it shows Late or Very late, ask them to pay it before taking more on credit.
  4. In a new batch's first week, while the supplier is paid at order, ask buyers to pay at the till.
  5. Owner: write the credit rule in SOP 9: who may buy on credit, one open tab, a first credit of one pod, and Very
     late means no new credit.
- *Screen:* Sell (checkout, Not paid yet); Collectibles; SOP 9.

**11. Top sellers: the 80/20 rule, by speed**
- *What it answers:* Which flavours matter most?
- *The method:* The 80/20 rule, which Joseph Juran named after Vilfredo Pareto. ABC analysis for stock comes from
  H. F. Dickie at General Electric (1951). Standard stock-control practice.
- *How the app works it out:*
  - Flavours are ranked by sales a day on the shelf × price, not by pieces sold. Every flavour got 3 pieces and sold
    3, so pieces sold say nothing.
  - Ranked by speed, 12 of the 20 flavours made 80% of the selling speed, and the fastest 4 were all XBLACK MAX.
  - Equal sellers share a group. Top seller shows only when a few clearly lead; none did on 26 Nov.
  - The group never changes spare stock.
- *How to use it:*
  1. Look for Top seller on Restock rows.
  2. Never let a Top seller run out: order by Order by.
  3. When money is short, Fits your money orders the fastest first.
  4. If sales are spread, order every flavour.
- *Screen:* Restock rows; Worked out from your history → Product mix.

**12. Which line earns most from the shelf**
- *What it answers:* Which product line should get more of the next order?
- *The method:*
  - Profit for each day of what limits you, which here is shelf days and cash. This is shelf productivity and GMROI
    from retail, and Goldratt's Theory of Constraints (1984).
  - Moving a bit more money each cycle to what earns most comes from McKinsey's research on reallocating resources
    (Hall, Lovallo and Musters, *McKinsey Quarterly*, 2012).
  - A quick sort into push, keep, fix or drop comes from menu engineering (Kasavana and Smith, 1982).
- *How the app works it out:*
  - "₱ a day per flavour on the shelf" = a line's gross profit ÷ the days its flavours were on the shelf.
  - XBLACK MAX earned about ₱88 a day per flavour, Black TEO about ₱50.
  - Batch 2 made ₱985 more in total, but 31% less a day on the shelf.
  - A line appears once it has had a week on the shelf.
- *How to use it:*
  1. Before each order, read Product mix on Restock: which line earns most a day per flavour?
  2. Lean the order toward it, and keep one new or test line next to it.
  3. After a batch, compare "Gross profit a day on the shelf" on the Report, not just total profit.
  4. Drop only what Restock lists as Not selling. A slow flavour still brings buyers who like to try every flavour.
- *Screen:* Restock → Worked out from your history → Product mix; Sales → Finance → Report.

**13. Price: the 1% rule and the pocket price**
- *What it answers:* Should we change prices, and where does price leak?
- *The method:* This one is from McKinsey.
  - Michael Marn and Robert Rosiello, "Managing Price, Gaining Profit" (*Harvard Business Review*, 1992): across 2,463
    companies, 1% on price raised operating profit by 11.1%.
  - The pocket price waterfall follows a price from the list down to what you keep (Marn, Roegner and Zawada,
    *McKinsey Quarterly*, 2003).
- *How the app works it out:*
  - At your 48% margin, 1% on price adds only about ₱192 a month. Being in stock is worth about 20 times more.
  - A ₱50 discount on a ₱340 pod needs 43% more sales to pay for itself.
  - Your waterfall: list ₱330 → discounts ₱0 → payment fees ₱0 → ₱295 collected so far. The rest is still owed.
  - A 5% supplier price rise not passed on costs about ₱479 a month.
- *How to use it:*
  1. Each month, check Discounts on Profit & loss: ₱0 or small.
  2. When the supplier's cost goes up, raise the price by at least the increase: ₱165 → ₱173 means ₱340 → ₱350.
  3. Don't cut prices while every piece sells anyway.
  4. To test a price, change it on one line for one batch, with another line on the shelf.
- *Screen:* Sales → Finance → Profit & loss (Discounts); the product page; Settings (staff discount limit).

**14. New lines and new kinds of item**
- *What it answers:* How much of something new should we order?
- *The method:* Borrow from what you know, then learn. A product with little history leans on its group until it has
  its own (shrinkage: James and Stein, 1961; Efron and Morris, 1975). Shops call it test and learn.
- *How the app works it out:*
  - A product that has never been on the shelf shows New and gets no suggestion.
  - Once it is on the shelf, it leans on its category for about a week.
  - Buyers rotate flavours: 82% of repeat buys within a line were a new flavour. So a new line gets every flavour.
  - A new kind of item, like the device, starts small. The 10 devices could take 37 to 82 days to sell, and they hold
    ₱2,066.
- *How to use it:*
  1. A new line: order every flavour, the same number of each, sized from Suggested order.
  2. A new kind of item: start with about 3.
  3. Tap Arrived on the day it comes. After a week, read its pace on Restock.
  4. Re-order it once about half have sold.
- *Screen:* Restock → New; Order stock.

**15. The monthly profit review**
- *What it answers:* What moved profit last month, and what do we do about it?
- *The method:*
  - A profit tree with no gaps or overlaps: MECE, from Barbara Minto at McKinsey. Profit trees as in Conn and McLean,
    *Bulletproof Problem Solving* (2018).
  - A bridge that adds up each change: price, volume and mix analysis from management accounting.
- *How the app works it out:*
  - Net profit a day = pieces a day × profit a piece − expenses − tax.
  - Pieces a day = days with stock × flavours on the shelf × sales per flavour.
  - Per day, so months of different lengths compare.
  - October → November: ₱730 → ₱201 a day.
    - Flavours on the shelf: −₱239
    - Sales per flavour: −₱236 (the opening rush)
    - Days with stock: −₱43
    - Price and mix: +₱23
    - Cost a piece: −₱6
    - Expenses: −₱29
  - Being in stock was 53% of the drop.
- *How to use it:*
  1. In the first week of each month, open Sales → Finance → Profit & loss and pick last month.
  2. Read "What moved net profit". The lines add up to the change.
  3. Take the biggest minus and do its action. For example: flavours on the shelf → order by Order by.
  4. Check that Discounts and Cost a piece aren't creeping up.
  5. Agree one action, and one number to watch next month.
- *Screen:* Sales → Finance → Profit & loss → What moved net profit. Until that card arrives, use the tree as a
  checklist.

**16. What the app can't know**
- *What it answers:* When should we change the app's suggestion?
- *The method:* Any plan made from history misses what history hasn't seen.
- *How the app works it out:* Promotions, holidays, a flavour being stopped, a supplier price change or a new shop
  nearby are not in your records. With only a few weeks of sales the numbers are rough, and they settle as the shop
  grows.
- *How to use it:*
  1. Adjust the order for what you know is coming.
  2. Note why you changed it.
  3. Check Restock again after a big change.
- *Screen:* Restock.

### Routines

**Weekly check** (same day each week, about 15 minutes; owner or manager)
1. Restock: read Order by. If it is this week, order For the next order, then tap Order this to record it the same day.
2. If it says Not enough money, order Fits your money now and top up when collections come in. Ask the supplier
   about paying on pick-up.
3. On the way: is an order Late? Message the supplier.
4. Not selling: is anything listed? Decide: discount it, keep it, or stop reordering it.
5. Collectibles: follow up every Late and Very late sale.
6. Finance: if the Inventory reserve asks, pick Next order (estimate). Owner: no payout until the next order is paid
   for.
7. Agree one action and write it down.

**When you order, and when it arrives**
1. Record the order in Order stock on the same day: the supplier, the pieces, the cost and the fees.
2. Record how it was paid: company fund, owner's money or investment. If the supplier agrees, pay on pick-up.
3. Straight away: Finance → Inventory reserve → pick Next order (estimate). Don't record a payout in between.
4. When it comes, open the batch, tap Arrived, and enter the day and the pieces that came.
5. Check Delivery on Restock: the real days now replace the guess.

**When a batch sells out**
1. Sales → Finance → Report: compare "Gross profit a day on the shelf" with the batch before, not just total profit.
2. Restock → Product mix: which line earns most a day per flavour?
3. Lean the next order toward that line, with one new or test line next to it.
4. Check that all the batch's costs are entered.

**Monthly review** (first week of the month, owner and manager together)
1. Enter every expense: rent, pay, utilities, payment fees (SOP 11).
2. Profit & loss, last month → What moved net profit: take the biggest minus and agree one action.
3. Check Discounts (₱0 or small) and the cost a piece. Raise prices by at least any cost rise.
4. Receivables: compare "Owed = N days of sales" and the credit share with last month. Decide on every Very late
   sale.
5. Worked out from your history: have the delivery days, the order rhythm or the shop's pace changed?
6. Payout: once a month, after the next order is covered. Pay out the suggestion or less, and keep payouts under
   about two thirds of profit while the shop grows.
7. Write down one action, who does it, and the number to watch next month.
