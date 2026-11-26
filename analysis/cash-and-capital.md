# Cash and capital: will the shop have the money for the next order?

Branch 3 of 4 of "how should this shop plan, and what should its app calculate for it". As of **Thursday 26 Nov 2026,
19:18 Manila** (no new sale, payment, stock change or expense since the 18:59 fact base). Every number comes from
`analysis/cash-and-capital.py`, which re-runs offline (`python3 analysis/cash-and-capital.py`, under a minute) and writes
`analysis/cash-and-capital_metrics.json`. It reads the data block of `analysis/baseline.py` and adds the entry times
of each money record, pulled read-only. Its cash, profit kept and safe-to-distribute figures match the owner's
`finance_report` exactly. Amounts are in pesos (₱).

## Assumptions

| # | Assumption |
|---|---|
| A1 | Data is the 26 Nov pull in `baseline.py`, checked again live at 19:18. "Cash" means the company fund as Finance counts it: every customer payment counts as cash, and there is no recorded float. |
| A2 | The moments on 25 Nov are reconstructed from when each record was entered: reserve decision 02:04, Batch 3 entered and paid 07:34, distribution 07:48. |
| A3 | The planning engine's next order is **37 pieces, ₱5,975 goods + ₱249 fees = ₱6,224**. The shop pace is 2.0 pieces a day while in stock, and the shop reorder point is 22.5 pieces. These figures come from the maths review of the planning design (top-down plan) and match the stock-and-ordering branch. Sensitivity: ₱7,214, the cost of Batch 3. |
| A4 | Delivery takes between 5 and 10 days, most likely 7 (a triangular distribution). This is the owner's stated 5 to 7 days plus a late tail. No order has an arrival day yet. |
| A5 | Batch 3's 30 pods sell along the path of Batch 1 or Batch 2 (each with a 50% chance), sped up or slowed down by a random factor (lognormal, spread 0.35). |
| A6 | The 10 devices have no history. They sell 0 to 0.5 a day, picked at random. |
| A7 | 73.4% of sales by value are on credit. Days to collect are drawn from the 33 the shop has seen: 31 sales paid in full, plus 2 open balances counted at their age of 16 days. Each of the 6 open balances is collected after a delay drawn from those longer than its age. |
| A8 | Running costs are ₱716 a month (₱740 over 31 days), spread evenly. No rent, salary or owner time is recorded. |
| A9 | Each extra day the pod shelf stands empty costs ₱354 of gross profit at the average pace, or ₱576 with a full shelf (baseline §6). |
| A10 | The tax rate is 0%, as set in the app. A 3% sensitivity is shown. |
| A11 | Batch 4 is ordered when the shop's stock, counting what is on the way, falls to the reorder point. That happens when Batch 3's 18th piece sells. The shop's habit until now was to order with about 2 pods left. |
| A12 | When the fund is short on the payment day, the shop waits until cash comes in. The owner top-up that would avoid the wait is reported next to it. |

## 1. Bottom line

**The shop is profitable and can fund its own orders. It runs short when the cash goes out at the wrong moment.**
The inventory reserve worked for Batch 3: it held ₱7,014 for 12 days, and the fund paid the ₱7,214 order in full.
The reserve then reset to ₱0 when Batch 3 was recorded at 07:34 on 25 Nov. Fourteen minutes later, ₱4,232 was
distributed. That was 100% of Safe to distribute at that moment, and 93% of all the cash the shop generated in its
first month.

The simulation (10,000 trials) says the fund will **not** have Batch 4's ₱6,224 on its likely order day, 6 Dec
(range 3 to 11 Dec). That happens in 100% of trials. The shop will need a median owner top-up of **₱2,598** (₱3,620 in
the worst tenth of trials). Without it, it waits about 5 days for cash, which costs **₱1,199 to ₱1,950 of gross
profit** in extra empty-shelf days.

Had the 25 Nov payout been held, the risk would be 2%. Paying the supplier on pick-up instead of at order cuts the
risk to 17%.

**Decisions needed:**

1. **Owner, this week:** ask the supplier to accept payment on pick-up (or a part payment) for Batch 4. Make no payout
   until Batch 4 is paid.
2. **App, with the planning engine build:** before any payout, hold back the part of the next order that unpaid sales
   won't cover. The app pre-fills the suggested payout and says why.
3. **Owner policy:** decide whether that hold should be a hard rule, so the app refuses a payout like the one on
   25 Nov.

## 2. Situation, complication, resolution

- **Situation.** In 31 days the shop collected ₱17,720. It paid ₱12,408 for stock (Batch 2 ₱5,194 and Batch 3 ₱7,214,
  both from the company fund) and ₱740 in expenses, which left ₱4,572 of operating cash. Equity is ₱9,634: owner
  capital ₱5,039 (Batch 1, paid with the owner's money) plus profit kept ₱4,595. Each batch earned 78% to 95% of its
  cost in net profit.
- **Complication.** The money comes back slowly while the stock is paid for early:
  - 73% of sales are on credit, collected in a median of 9 days.
  - Batch 3 was paid at order. That adds the delivery days to the cash cycle, which goes from 10.6 days to about
    18 days. Batch 3 is expected to earn its cost back in cash on 16 Dec, 21 days after it was paid. Batches 1 and 2
    took 10 to 11 days.
  - The reserve drops to ₱0 the moment an order is recorded, and nothing stops a payout until the owners decide again.
    That is the riskiest moment in the cycle.
- **Resolution.**
  - **Hold the next order before payouts.** The app suggests the payout, net of the part of the next order that
    unpaid sales won't cover.
  - **Move supplier payment to pick-up.**
  - **Let every money suggestion move with the shop.** Each one is worked out from the shop's own pace, order rhythm,
    fees, collection history and expenses: the next order, running costs, money by the order day and the suggested
    payout.
  - **Leave the policy with the owner:** how much to pay out, the profit split, the tax rate and credit terms.

## 3. Issue tree

Question: **will the company fund hold the next order's cost on the day it must be paid, after payouts, at any
size the shop grows to?** The branches are mutually exclusive and collectively exhaustive. Prioritised branches are
marked ★.

- **A. Money needed by the payment day**
  - A1 ★ The next order's cost (pieces × cost + fees) and when it is paid: at order or on pick-up
  - A2 Running costs until then (₱716 a month recorded; rent and salaries are missing)
  - A3 Tax reserve (₱0 at a 0% rate; ₱594 at 3%)
  - A4 Supplier debts (₱0 now)
- **B. Money that comes in by then**
  - B1 Cash now (₱340)
  - B2 ★ Unpaid sales collected by then (₱2,080 owed; ₱1,994 expected by 10 Dec)
  - B3 ★ New sales paid by then: 27% at the till, the rest by the collection curve
  - B4 Owner capital (the last resort; it is never paid back)
- **C. Money that leaves by choice**
  - C1 ★ Distributions: how much, and when relative to an order
  - C2 Payout ratio and split: owner policy
- **D. What sets A − B every cycle, and how it scales**
  - D1 ★ Cash conversion cycle: days to collect, days on the shelf, and payment terms (delivery days when paid ahead)
  - D2 Growth: a bigger order needs more cash, which retained profit funds (self-funded growth)

**Pruned:**

- A3 is a compliance question for the accountant, not a planning lever (recommendation 8).
- A4 is ₱0.
- The drawer float is an operations item for later.

## 4. Analysis

### 4.1 The company fund, day by day (Finance's cash)

| Item, 27 Oct to 26 Nov | ₱ |
|---|---|
| Customer receipts (cash sales + later collections) | 17,720 |
| Paid for stock from the fund (Batch 2, Batch 3) | (12,408) |
| Operating expenses | (740) |
| **Operating cash, before distributions** | **4,572** |
| Owner distributions (25 Nov) | (4,232) = 92.6% of it |
| **Cash on 26 Nov** | **340** (= `finance_report`) |

Cash peaked at **₱11,446** at the end of 24 Nov and fell to **₱0** at the end of 25 Nov. It never went negative.

**So what:** the shop generates cash. Over the month it paid for two batches and still had ₱4,572 left, but the
payout used up nearly all of it in one go.

### 4.2 What the app showed at each moment

| Moment | Cash | Inventory reserve | Spare cash | Profit kept | Safe to distribute | Reserve question open |
|---|---|---|---|---|---|---|
| 13 Nov 08:38, reserve set to ₱7,194 | 3,806 | 7,194 | (3,388) | 5,590 | 0 | no |
| 20 Nov 02:05, reserve ₱7,250 | 8,286 | 7,250 | 1,036 | 8,093 | 1,036 | no |
| 25 Nov 02:05, reserve ₱7,014 | 11,446 | 7,014 | 4,432 | 8,493 | 4,432 | no |
| 25 Nov 07:35, Batch 3 paid, reserve used up | 4,232 | 0 | 4,232 | 8,660 | **4,232** | **yes** |
| 25 Nov 07:49, after the ₱4,232 payout | 0 | 0 | 0 | 4,428 | 0 | yes |
| 26 Nov 19:18, now | 340 | 0 | 340 | 4,595 | 340 | yes |

**How the reserve was set.** Before Batch 3, each reserve the owners typed was within 0.3% to 2.8% of what Batch 3
really cost. The app's pre-fill, "Same as Batch 2" (₱5,194), was 28% (₱2,020) too low. On 20 Nov the owners saved it
and replaced it 15 seconds later with ₱7,250.

**So what:**

1. The reserve does its job while it is set. It kept the fund from paying out Batch 3's money, and Batch 3 was paid in
   full from the fund. Batch 2 was too: the fund had ₱7,680 for ₱5,194.
2. The failure is the reset. After an order, Safe to distribute shows everything that is left. The distribution form
   gives no sign that the next order has nothing set aside for it.
3. The owners plan an order's size better than the app's pre-fill does. The pre-fill should come from the plan (the
   planning engine's next order), not from the last batch.

### 4.3 What should the reserve hold? The next-order estimate

| Way to estimate the next order | ₱ |
|---|---|
| App pre-fill today: same as Batch 3 (the latest company-paid batch) | 7,214 |
| **Planning engine, top-down: 37 pieces × cost + fees [A3]** | **6,224** |
| Cross-check: pace 2.0 a day × 14.5-day order rhythm × ₱171.60 landed cost | 4,976 |
| Cross-check: pace 2.22 (no recency weighting) × 14.5 | 5,524 |
| Mean cost in full of Batches 1 to 3 | 5,816 |

Fees are flat per order: ₱239, ₱244 and ₱264, so about ₱249 (₱6.60 to ₱8.13 a piece). Fees should therefore be
estimated per order, not as a percentage of goods.

**So what:** every method gives ₱5,000 to ₱7,200. The amount matters less than when it is held. The engine's figure
holds ₱990 less than "Same as Batch 3", and it follows pace and order rhythm as the shop grows.

### 4.4 Simulation: Batch 4's money on its payment day (10,000 trials) [A3–A12]

| Scenario | Chance the fund is short | Owner top-up if short (median) | Top-up, 90th percentile of all trials | Days waiting for cash | Pod-shelf empty days (total) | Gross profit lost to the cash wait |
|---|---|---|---|---|---|---|
| **S1 Today: ₱340 cash, order at reorder point, pay at order** | **100%** | **₱2,598** | ₱3,620 | 5.3 | 3.9 | **₱1,199 to ₱1,950** |
| S2 Today, but **pay on pick-up** | 17% | ₱452 | ₱407 | 0.1 | 0.6 | ₱22 to ₱36 |
| S3 **25 Nov payout held** (₱4,572 cash), pay at order | 2% | ₱114 | ₱0 | 0.0 | 0.5 | ₱3 to ₱4 |
| S4 Today, order at sell-out (the habit), pay at order | 44% | ₱1,035 | ₱1,722 | 0.9 | 4.8 | ₱326 to ₱530 |
| S5 Stress: slower sales, no devices sold, the two oldest balances (₱380) never paid | 100% | ₱2,719 | ₱3,772 | 5.7 | 3.2 | ₱1,053 to ₱1,714 |
| S6 As S1, but Batch 4 costs ₱7,214 | 100% | ₱3,583 | ₱4,610 | 6.8 | 5.0 | ₱1,595 to ₱2,596 |

Lost gross profit = extra empty days × ₱354 (average pace) to ₱576 (full shelf).

S1 forecast details:

- Batch 4 is ordered on 3, 6 or 11 Dec (10th, 50th and 90th percentiles).
- Cash on 10 Dec is ₱3,781, ₱5,151 or ₱7,181.
- Batch 3 earns its cost back in cash on 16 Dec (13 to 21 Dec), **21 days** after it was paid.

**Sensitivity on the two main drivers** (3,000 trials each, pay at order):

| Starting cash | Delivery days | Credit share | Chance short | Median top-up |
|---|---|---|---|---|
| ₱340 (today) | 5 / 7 / 10 | 73% | 100% / 100% / 100% | ₱2,704 / ₱2,624 / ₱2,392 |
| ₱340 (today) | 5 / 7 / 10 | 50% | 93% / 91% / 89% | ₱1,318 / ₱1,110 / ₱1,019 |
| ₱4,572 (payout held) | 5 / 7 / 10 | 73% | 5% / 2% / 0% | ₱0 |

**Largest 25 Nov payout that keeps the chance of being short at 10% or less:** about **₱500** when paying at order,
and about **₱3,750** when paying on pick-up. The actual payout was ₱4,232.

**So what:**

1. **The payout decides Batch 4, not delivery time or sales speed.** Delivery days hardly change the result. Halving
   credit halves the top-up but still leaves the fund short. Holding the payout fixes it in every case.
2. **Ordering earlier at the reorder point is worth nothing without the cash.** In S1 the shelf is empty 3.9 days,
   close to the old habit's 4.8. With the cash held (S3), it is 0.5 days.
3. **Paying on pick-up is the cheapest lever.** It brings the money date about 7 days closer to the sales. That alone
   takes the risk from 100% to 17%, and it would have allowed about ₱3,250 more of the 25 Nov payout at the same
   10% risk (₱3,750 against ₱500).

### 4.5 Payout rules at the two moments that matter

| Rule | 25 Nov 07:48 | Now |
|---|---|---|
| A. Today: Safe to distribute = lower of profit kept and spare cash | ₱4,232 | ₱340 |
| **B. Suggested payout (soft)** = max(0, lower of safe and spare cash − hold − one month of running costs), where hold = max(0, next order ₱6,224 − kept ₱0 − unpaid sales usually collected by the order day, ₱1,996) = ₱4,228 | **₱0** | **₱0** |
| C. Hard option: while the reserve question is open, keep the last company order's cost (₱7,214) | ₱0 | ₱0 |
| A with a 3% tax reserve | ₱3,648 (the payout made was ₱584 more) | ₱0 |

"Usually collected by the order day" weighs each open balance by the share of past credit sales of its age that were
paid within the remaining days.

**So what:** rule B agrees with the simulation. It suggests ₱0, where the 10% risk limit was about ₱500. It uses only
numbers the app already has or the engine will compute. Rule B is conservative when the supplier is paid on pick-up
(₱0 against ₱3,750 at the same risk). That is acceptable for a suggestion, because the owner can still pay out up to
Safe to distribute.

### 4.6 Running costs, break-even and runway

Recorded running costs come to **₱716 a month**, which is 4.5 pieces' worth of landed margin (₱159.45 a piece).
Gross profit is ₱9,258 a month. Spare cash of ₱340 covers **14 days** of recorded running costs.

What unrecorded running costs would change. This is a sensitivity, not a claim about the shop's costs:

| Running costs a month | Pieces a month to break even | vs 58 sold a month recently | vs full-shelf capacity (108) | Net profit for the 31 days | Days covered by ₱340 |
|---|---|---|---|---|---|
| ₱716 (recorded) | 4.5 | 8% | 4% | ₱8,827 | 14 |
| ₱5,000 | 31 | 54% | 29% | ₱4,400 | 2.0 |
| ₱10,000 | 63 | 108% | 58% | (₱766) | 1.0 |
| ₱15,000 | 94 | 162% | 87% | (₱5,933) | 0.7 |

**So what:** the cash rules are only as good as the expenses entered. If rent and pay come to ₱10,000 a month, the
first month was a small loss. In that case a month of running costs, not the next order, would be the largest thing to
hold back. The suggestion has to come from recorded expenses and grow as they are entered.

### 4.7 Cash conversion cycle and the working capital the shop needs

Cash conversion cycle = days to collect (DSO) 6.2 + days in stock (DIO) 4.4 − days the supplier waits for payment
(DPO). DPO is 0 when the supplier is paid on arrival. When the shop pays at order, DPO = −(delivery days), because the
shop pays before the stock arrives. Working capital needed = landed cost of goods sold a day × the cycle.

| Volume | Pay at order, 7-day delivery (cycle 17.6 days) | Pay on pick-up (cycle 10.6 days) |
|---|---|---|
| Recorded (₱330 a day of goods sold) | ₱5,810 | ₱3,499 |
| Plan pace 2.0 × ₱172 | ₱6,040 | ₱3,638 |
| Full shelf 3.61 × ₱172 | ₱10,903 | ₱6,566 |

Equity in the business is ₱9,634. Average receivables are ₱3,966. Each 10 points of credit share moved to the till
frees about **₱540** of cash, and that figure scales with sales.

**So what:**

1. At a full shelf with payment at order, the shop needs about ₱10,900 tied up on average, more than its ₱9,634
   equity. Peaks come on order days. On pick-up terms it needs ₱6,566.
2. Payment terms are worth ₱2,400 to ₱4,300 of permanent cash. That is more than a cut in credit could realistically
   free.

### 4.8 Self-funded growth and the payout ratio

Batch net profit ÷ batch cost: Batch 1 77.8%, Batch 2 94.5%, mean **86.1% per order cycle**. If the profit kept goes
back into stock, the next order can grow by (1 − payout ratio) × 86.1% each cycle (Higgins' sustainable growth,
adapted to one order cycle).

| Payout ratio | Largest order growth per cycle, from own money |
|---|---|
| 0% | 86% |
| 25% | 65% |
| **47.9% (to date)** | **45%** |
| 64% | 31% |
| 75% | 22% |

A full-shelf order is 3.61 a day × 14.5 days = 52 pieces, 31% more than Batch 3's 40. The engine's next order is
37 pieces, 7% fewer.

**So what:**

- Over the cycle, the shop can afford to pay out up to about **64% of profit** and still fund full-shelf orders. It
  needs no more owner capital to grow.
- Its limit is timing (§4.4), not solvency.

### 4.9 Who carries an owner top-up

The 25 Nov payout gave the owner ₱2,821 and the manager ₱1,411 (2 : 1 split). Owner money put in is capital and is
never paid back (owner decision, 26 Nov).

| Owner top-up for Batch 4 | Owner's net from the 25 Nov payout | Manager's | Owner capital becomes |
|---|---|---|---|
| ₱0 | ₱2,821 | ₱1,411 | ₱5,039 |
| ₱2,598 (S1 median) | ₱223 | ₱1,411 | ₱7,637 |
| ₱4,232 (all of it back) | (₱1,411) | ₱1,411 | ₱9,271 |

**So what:** an early payout that the owner then tops up is a transfer from the owner's own money to the shared
payout. The manager's third is kept, and the owner's top-up becomes permanent capital. That is a reason to hold, not
to pay out and refill.

## 5. Recommendations

Ranked by peso impact × feasibility. "Build now" means it is worth building in this planning-engine release on 80/20
grounds.

| # | Recommendation | ₱ impact (math) | Feasibility | Build now | Owner | Timing | KPI |
|---|---|---|---|---|---|---|---|
| 1 | **Hold the next order before any payout (suggested payout plus a notice).** | 25 Nov: suggests ₱0 against the ₱4,232 paid. Chance Batch 4 is short drops from 100% (S1) to 2% (S3). Avoids a ₱2,598 median top-up, or ₱1,199 to ₱1,950 of gross profit lost each cycle in which a payout follows an order. | High | Yes | Build: engineering; use: owner | With the planning engine (task 23), before the next payout | Fund covers each order on its payment day; owner top-ups ₱0; no payouts while the reserve question is open |
| 2 | **Pay suppliers on pick-up, or with a part payment** (owner talks to the supplier). | Chance short drops from 100% to 17%; lost gross profit from ₱1,199 to ₱22. Cycle drops from 17.6 to 10.6 days. Frees ₱2,402 (plan pace) to ₱4,337 (full shelf) of working capital. About ₱3,250 more payout at the same 10% risk. | Medium (the supplier decides) | No (owner action); the app hint comes with #4 | Owner | When ordering Batch 4 (3 to 11 Dec) | Days between paying and arrival (target 0) |
| 3 | **Next order (estimate) as the reserve's default amount**, plus a line in the Inventory reserve card. | Holds ₱990 less than "Same as Batch 3" today. The old pre-fill was ₱2,020 (28%) low before Batch 3, and the owners retyped it. | High | Yes | Engineering | Same release | Reserve within 15% of the next real order |
| 4 | **Money check by the order day on Restock**: spare cash + reserve + unpaid sales usually collected by then. | Today it shows short by ₱3,890 (₱6,224 − ₱340 − ₱1,994) instead of ₱5,884. The ₱1,994 difference is about 12 pieces at landed cost. "Fits your money" then trims the order to the cash. | High | Yes | Engineering | Same release | Orders placed by the order-by date; no order skipped while receivables cover it |
| 5 | **Hard version of #1 (owner policy):** while the reserve question is open, Finance keeps the last company order's cost. | Enforces #1: the 25 Nov payout would have been refused (safe ₱0). | High (cheap SQL in `funds_summary`) | No, until the owner agrees | Owner decides; engineering builds | Decide at the next monthly review | Same as #1 |
| 6 | **Running costs a month from history** (part of #1's formula and copy). | ₱716 a month now (4.5 pieces' margin). Grows by itself as rent and pay are entered. | High | Yes | Engineering | Same release | Within 20% of each month's expenses |
| 7 | **Record every running cost**: rent, the manager's pay, utilities, payment fees (owner action). | At ₱10,000 a month the 31 days would show (₱766), not ₱8,827. Break-even would be 63 pieces a month against 58 sold. | High | No (owner action) | Owner and manager | This week, then monthly (SOP 11) | Months with rent and pay entered |
| 8 | **Confirm the tax rate with an accountant** (owner and accountant). | ₱594 to date, about ₱575 a month at the current pace. At 3%, the 25 Nov cap would have been ₱3,648, ₱584 below what was paid. | High | No (policy; an effective-rate hint comes later) | Owner | Before the next payout | Rate set to the confirmed figure |
| 9 | **Payout policy:** pay out once a month, after the next order is placed and its reserve set, and at most about 64% of profit while growing to full-shelf orders. | Keeps orders able to grow 31% per cycle from the shop's own money (§4.8). | High | No (policy); show the payout ratio later | Owner | From December | Payout ratio; payouts per month |
| 10 | **Credit share** (cross-branch with collections): move buyers toward paying at the till. | Each 10 points frees about ₱540. At 50% credit the median top-up halves (₱2,624 to ₱1,110 at 7 days' delivery). | Medium | No (policy; aging buckets are B14 in the design) | Owner and staff | Ongoing | Credit share of sales |
| 11 | **Later builds**, not now: forward cash projection (critic 3), supplier due dates (critic 7), drawer float (ops 22), a "cash comes back in N days" line, re-ask when the estimate moves more than 20% (finance map item 2), a hard running-costs reserve in `finance_now` (finance map item 3). | Small at ₱716 a month of costs and 3 orders. Worth it once rent and pay are recorded and orders overlap. | Medium | No | Engineering | After 3 months of history | — |

### What the app should calculate (tied to the design and the map)

All of these are worked out from history on every load. The source and a "starting guess" label show until there is
enough history. Following the build review, they live in `restock_plan(false).money`, and `finance_now`,
`funds_summary` and `finance_report` stay unchanged, except for #5 if the owner agrees.

| Figure | Formula | Where it shows | Design / map |
|---|---|---|---|
| `next_order_cents`, `next_order_on` | the engine's next order at its order-by date: Σ pieces × last cost + fee estimate (mean fees of the last 3 batches × max(1, pieces ÷ their mean pieces)) × the company-paid share of the last 3 batches − what is already paid on orders on the way | Reserve default pick "Next order (estimate) · ₱X"; Restock order-rhythm line | Method 8; B11; finance map item 1; db 7; ops 24; restock 16 |
| `expected_collections_by_order_cents` | Σ open balance × share of past credit sales of its age that were paid within the days left until `next_order_on` (fallback: balances older than the median collection days) | Restock money check; payout hint | Method 8 money check; A10; critic 2 |
| `running_costs_month_cents` | Σ non-tax expenses in the last 90 days (charged to a batch or not) ÷ days covered × 30, with days covered = min(90, days open) and at least 30; "starting guess" under 60 days; shown also as "about N pieces' profit" | Payout hint | Method 8; B13; finance map item 3 (soft only); db 8 |
| `hold_cents` | max(0, next order − kept − expected collections) | Payout hint; reserve card line | New (from §4.5) |
| `suggested_payout_cents` | max(0, lower of safe and spare cash − hold − running costs a month) | `ReleaseForm` pre-fill; empty when 0 | Method 8; B13; finance map item 4 |
| Money check | available by `next_order_on` = spare cash + kept + expected collections, against the suggested order at landed cost. When short: "Fits your money" list, and on Order stock the hint "pay on pick-up keeps ₱X in the fund" | Restock notice and Order stock payment step | A10; critic 2; db 10 (hint only) |

The owner's policy stays the owner's: the reserve amount itself, what to distribute, the profit split, the tax rate,
credit terms, supplier terms, and capital top-ups. The app pre-fills and explains. It never sets these.

## 6. Risks and mitigations: what would prove this wrong

- **Batch 3 sells much faster than both past batches.** It would then pay itself back sooner, which cuts the shortfall.
  But in S1 a fast sale also triggers the order sooner, which is why S1 stays at 100% short. Watch cash on the day the
  18th piece sells.
- **Devices sell well.** They add ₱350 each. At 0.5 a day, about 2 sell between arrival and the order day, worth
  ₱700, and most of that is on credit. This is a small effect.
- **The supplier refuses pick-up terms.** Then #1 (holding the payout) is the only cheap lever. Plan a recorded owner
  top-up of about ₱2,600 to ₱3,600 on the order day, or accept about 5 days' wait.
- **Unrecorded costs are large.** A month of running costs would then dominate the hold, and payouts should wait
  longer. Mitigation: #7 first.
- **Tiny samples.** There are 2 sell-through curves, 33 collection times and no measured delivery time. The
  probabilities are ranges, not facts. The conclusions that hold across every sensitivity: hold the payout, and pay on
  pick-up.
- **Rule B is conservative under pick-up terms.** It could discourage payouts the shop can afford, ₱3,750 at 10% risk
  on 25 Nov. Mitigation: it is a suggestion. The cap stays Safe to distribute. Once pick-up is the norm, the hold can
  count expected sales collections, as a later step.

## 7. Next 30 / 60 / 90 days

- **30 days (by 26 Dec):**
  - Owner asks for pick-up payment or a part payment on Batch 4.
  - No payout until Batch 4 is paid.
  - Set the reserve now to ₱6,224 so the app holds it.
  - Chase the ₱2,080 owed (₱1,994 is due by 10 Dec on history).
  - Enter rent and pay if any.
  - Build #1, #3, #4 and #6 with the planning engine, with DB tests:
    - the suggested payout ≤ Safe to distribute;
    - it is 0 when spare cash < hold + running costs;
    - expected collections ≤ receivables;
    - the starting-guess label shows under 60 days.
  - Add the Planning page sections below.
- **60 days:**
  - Owner decides on #5 (hard hold) and the payout policy (#9).
  - Accountant confirms the tax rate (#8).
  - First month with all running costs recorded, so the running-costs suggestion leaves "starting guess" once 60 days
    are covered.
- **90 days:**
  - With 3 months of expenses and about 6 orders, review the later builds (#11): forward cash projection, supplier due
    dates, the cash-cycle line.

## 8. Help → Planning: methods from this branch

These are standard finance methods, not McKinsey property. Where McKinsey made one well known, it says so.

1. **Will we have the money for the next order? (a cash tree with no gaps or overlaps)**
   - *Where it comes from:* issue trees and MECE ("mutually exclusive, collectively exhaustive"). Barbara Minto made
     them standard at McKinsey from the late 1960s, and she traces the idea back to Aristotle. The sources and uses of
     cash are basic accounting.
   - *In this shop:* money on the order day = cash now + unpaid sales collected by then + new sales paid by then −
     running costs − payouts. On 25 Nov the payout branch alone (₱4,232) decided whether Batch 4 could be paid.
   - *How to use, on Restock and Sales → Finance → Overview:*
     1. On Restock, read the order-by date and Next order (estimate).
     2. On Finance → Overview, read Cash and the Inventory reserve.
     3. Under Receivables by age, read what is usually collected by then.
     4. Subtract a month of running costs, shown in the distribution hint.
     5. If it is short: ask to pay on pick-up, chase what is owed, and hold the payout.
2. **Keep what's needed before paying out (Safe to distribute)**
   - *Where it comes from:* capital maintenance in company law and accounting (pay owners only out of profit, never
     out of their capital), and standard cash management (set aside known payments before any payout).
   - *In this shop:* Safe to distribute = the lower of profit kept and spare cash (cash − tax reserve − owed to
     suppliers − inventory reserve). The suggested payout also keeps the part of the next order that unpaid sales won't
     cover, plus a month of running costs.
   - *How to use, on Sales → Finance → Overview:*
     1. In the Inventory reserve card: if it asks, pick Next order (estimate) and tap Keep this amount.
     2. Then, in Owner distributions, read Safe to distribute and the suggested amount.
     3. Tap Record distribution: it starts at the suggestion.
     4. Never pay out right after recording an order, before the reserve is set again.
3. **Cash conversion cycle: how long a peso is away**
   - *Where it comes from:* Richards and Laughlin, *Financial Management*, Spring 1980. It is now a standard
     working-capital measure.
   - *In this shop:* days from paying the supplier to getting the buyers' money = delivery days (when paid at order) +
     days on the shelf + days to collect. It was 10.6 days when paid on arrival. It is about 18 days when paid at order
     with 7 days' delivery, and Batch 3 is expected to take 21 days. Each day ties up ₱330 to ₱620 at cost.
   - *How to use:*
     1. On Restock, under Worked out from your history, read Delivery.
     2. On Sales → Finance → Report, read how many days the batch took to sell.
     3. Under Receivables by age, read the line on how fast buyers pay.
     4. Add the three. To shorten it: pay on pick-up, and ask buyers to pay at the till.
4. **A short cash forecast to the next order day**
   - *Where it comes from:* the rolling 13-week cash forecast used in treasury and turnaround work, cut down to one
     order cycle. The app uses the shop's own collection history for "usually collected by then".
   - *In this shop:* the money check on Restock: "Money for it by {date}: cash + reserve + unpaid sales usually
     collected by then".
   - *How to use, on Restock:*
     1. Read the Suggested order and its money line.
     2. If it says Not enough money for all of it yet, use Fits your money.
     3. Or ask to pay on pick-up (Order stock → payment).
     4. Or put in owner money and record it: Finance → Balance → Record capital put in. Remember it is never paid back.
5. **How fast the shop can grow on its own money (sustainable growth)**
   - *Where it comes from:* Robert C. Higgins, "How Much Growth Can a Firm Afford?", *Financial Management*, Autumn
     1977.
   - *In this shop:* each batch earned 78% to 95% of its cost per cycle. Paying out 48% still lets the next order grow
     about 45% from the shop's own money. A full-shelf order (about 52 pieces, +31%) needs payouts of no more than
     about 64% of profit.
   - *How to use, monthly:*
     1. On Finance → Batches, read each batch's net profit.
     2. On Overview → Distributed, total what was paid out.
     3. Payout ratio = paid out ÷ profit.
     4. Compare Next order (estimate) on Restock with the last batch's cost on its batch page. If the order is growing
        faster than (1 − payout ratio) × the batch return, pay out less.
6. **Break-even and running costs (cost–volume–profit)**
   - *Where it comes from:* cost–volume–profit analysis and contribution margin, from management accounting.
   - *In this shop:* landed margin is ₱159 a piece. Running costs of ₱716 a month are about 5 pieces. At ₱10,000 a
     month for rent and pay, the shop would need 63 pieces a month, against 58 sold.
   - *How to use:*
     1. On Finance → Profit & loss, pick last month and read the expenses by type.
     2. Divide them by the profit per piece on Report: that is the number of pieces needed.
     3. Check every cost is entered (SOP 11). The running-costs suggestion only knows what is recorded.
7. **Return on the money tied up (margin × turnover)**
   - *Where it comes from:* the DuPont formula (F. Donaldson Brown at DuPont, 1914). McKinsey's book *Valuation*
     (first edition 1990) made the ROIC tree a standard management tool.
   - *In this shop:* 44.6% net margin × 3.37 turns = 150% in 31 days on ₱5,884 tied up, before unrecorded costs.
     Returns are not the limit. Days tied up are.
   - *How to use:*
     1. On Finance → Profit & loss, read net profit ÷ net sales.
     2. On Finance → Balance, add receivables + inventory + stock on the way.
     3. Net sales ÷ that sum gives the turnover.
     4. To raise the return without new money, cut days: pay on pick-up and collect sooner.

**Weekly routine (2 minutes):** on Restock, read the money check. If an order was just recorded, set the reserve
(Next order (estimate)) before anything else.

**Monthly routine:** enter every expense, walk the cash tree (method 1), and pay out only up to the suggestion.

SOP 15 step 3 becomes: "Tap Record distribution. The amount starts at the app's suggestion: Safe to distribute, less
the part of the next order your unpaid sales won't cover and a month of running costs. Change it if you pay out less.
The app refuses more than Safe to distribute."

## 9. Open questions, data gaps and sources

**Open questions**

1. Will the supplier accept payment on pick-up or a part payment? Batches 1 and 2 were paid on arrival; Batch 3 was
   paid at order.
2. Should holding the next order be a hard rule, so the app refuses the payout (#5), or stay a suggestion?
3. Are there rent, salaries, the manager's pay or owner time to record, and from when?
4. Has an accountant confirmed the shop's tax status and rate? The app has 0%; the statute is 3% for non-VAT shops.
5. What payout policy do the owners want: monthly or per batch, and up to what share of profit?
6. If the owner tops up for Batch 4, should it be capital (never repaid, as decided 26 Nov)? Or do the owners want a
   loan to the business, which the app does not support?
7. Is there a drawer float that should be recorded as owner capital?

**Data gaps:** no order has an arrival date yet, so delivery time is assumed. There are 2 sell-through curves, no
device sales, and only 2 expense entries.

**Sources**

- Shop data: live Supabase project, read-only SELECTs and the owner's `finance_report` in a rolled-back transaction,
  26 Nov 2026 19:18 Manila. Also `analysis/baseline.py` (data block, 18:59 pull), the maths, UX and build reviews of the
  planning design, and the suggestion map.
- Richards, V. D. and Laughlin, E. J., "A Cash Conversion Cycle Approach to Liquidity Analysis", *Financial
  Management* 9(1), Spring 1980, pp. 32–38 ([Journal of Accountancy, May 2013, citing it](https://www.journalofaccountancy.com/issues/2013/may/20126764.html);
  accessed 26 Nov 2026).
- Higgins, R. C., "How Much Growth Can a Firm Afford?", *Financial Management* 6(3), Autumn 1977, pp. 7–16
  ([JSTOR 3665251](https://www.jstor.org/stable/3665251); accessed 26 Nov 2026).
- Minto, B., *The Pyramid Principle* (1985 onward); MECE at McKinsey
  ([McKinsey Alumni, "Barbara Minto: MECE, I invented it"](https://www.mckinsey.com/alumni/news-and-events/global-news/alumni-news/barbara-minto-mece-i-invented-it-so-i-get-to-say-how-to-pronounce-it);
  accessed 26 Nov 2026).
- DuPont return on investment, F. Donaldson Brown, 1914 ([Hagley Museum, "The Father of ROI"](https://www.hagley.org/node/452);
  accessed 26 Nov 2026).
- Philippine percentage tax 3% (non-VAT, gross sales ≤ ₱3M) from 1 Jul 2023: as cited in `analysis/baseline.md` (BIR
  RMC 69-2023).

Tax and accounting figures here are planning estimates, not advice. A qualified accountant should confirm the shop's
tax position.
