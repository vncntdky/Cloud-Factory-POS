# Credit and collections: what "Not paid yet" costs, and the rules the app should learn from it

One of four branches of "how should this shop plan, and what should its app calculate for it". As of **Thursday
26 Nov 2026, 19:41 Manila**. The live data has not changed since the 18:59 fact base: 51 completed sales, 37 of them
Not paid yet, 36 later payments (₱12,460, all cash), ₱2,080 owed, last sale and payment at 11:16.

Every number below comes from `analysis/credit-and-collections.py`. It re-runs offline in about two seconds
(`python3 analysis/credit-and-collections.py`, numpy and pandas only). It reads only the data block of
`analysis/baseline.py` and writes `analysis/credit-and-collections_metrics.json` (164 metrics, each with its formula).
Its totals match the owner's `finance_report`: net sales, receivables today and on 31 Oct, and collections. Amounts
are in pesos (₱). No buyer names appear in either file; buyers are pseudonymous numbers, and only totals are shown.

## Assumptions

| # | Assumption |
|---|---|
| A1 | **Days to collect** = the business day of the last payment − the business day of the sale, for credit sales paid in full. The **age** of an open sale = 26 Nov − its business day. |
| A2 | **Default** means never paid. None has happened: nothing has been written off, and the oldest open sale is 16 days old. The app has no way to write a sale off yet. |
| A3 | **Loss given default (LGD) = 100%** of the open balance. There is no collateral, the amounts are small, and there is no collection agency. A recovery counts only when cash comes in. Part payments are already netted out of the balance. |
| A4 | **PD is estimated from the shop's own sales**, for each age group, as (defaults + ½) ÷ (paid-in-full sales that reached that age + 1). This is the Jeffreys (Krichevsky–Trofimov) estimate. With no defaults yet it starts cautious, and it falls as more buyers pay. |
| A5 | **Order-timing model (§4.7).** Expected values, not a simulation; the cash-and-capital branch's Monte Carlo gives the ranges. Each input is listed below. |
| A6 | **Borrowing-cost benchmarks** price the money tied up; the shop itself does not borrow. They are the BSP ceiling on credit-card interest, 3% a month (Circular 1165, January 2023, retained in August 2023; check it still applies), informal "5-6" lending at 20% a month, and a bank-like 1% a month for comparison. |
| A7 | Buyers are counted by pseudonymous number; the same name counts as the same buyer, as the app's `buyerKey` does. |
| A8 | Credit's sales benefit is unknown: nobody knows how many credit buyers would pay cash if credit were refused. It is treated as a scenario (§4.6 break-even), not estimated. |
| A9 | Thresholds use Postgres `percentile_disc`, the value at position ⌈q·n⌉ of the sorted list, as the database function would. |

The A5 order-timing model uses these inputs:

- **Batch 3 arrives 2 Dec.** That is 25 Nov plus the 7-day starting guess for delivery.
- **Its 30 pods sell at 2.22 a day**, the shop's pace while it has stock, at ₱340 each. The 10 devices are left out
  because they have no sales history.
- **26.6% of each day's sales is paid at the till.** The rest is collected along the shop's own days-to-collect
  curve, weighted by value. The six open balances follow the same curve, starting from their current age.
- **Running costs are ₱24 a day.** No payouts are made.
- **The next order costs ₱6,224** (cash-and-capital A3). It is due on its order-by day, 5 Dec (stock-and-ordering),
  and is paid at order unless stated. Delivery takes 7 days.
- **Each empty-shelf day costs ₱354** of gross profit (baseline §6).

## 1. Bottom line

**Credit is how this shop sells, and its buyers pay. Its cost is timing, not bad debt.**

- **The credit book.** 73% of sales by value are Not paid yet. All 31 that have been settled were paid within 21 days,
  half within 9. Nothing has been lost. Expected bad debt on today's ₱2,080 is about **₱58**. On new credit it is
  about **₱220 a month** at today's pace (₱842 at the cautious upper bound).
- **The timing cost.** On Batch 4's order day (5 Dec), credit holds back about **₱2,155 of cash**: ₱2,776 in hand
  against ₱4,931 if every new sale were paid at the till.
  - If the supplier is paid at order, the order waits 8 days instead of 2. The shelf is empty about 4.5 days, and
    about **₱1,588 of gross profit is lost**. That is 27 times the expected bad debt.
  - Paid on pick-up, the same credit costs nothing this cycle: a 1-day wait or a ₱593 owner top-up.
  - The shop can carry credit or pay at order, but not both.
- **The app's "late" line is wrong both ways.**
  - SOP 9's fixed 7 days marks 65% of normal payers late.
  - The planning design's history-based rule lets the balances being judged set their own bar. A balance that is never
    paid would never become Very late.
  - Worked from paid-in-full sales only, with Very late at least a week after Late, today's numbers are: **Late after
    11 days, Very late after 18**.

**Decisions needed:**

1. **Engineering, with the planning engine (task 23):**
   - fix method 9's thresholds
   - show Late / Very late on Collectibles and Finance
   - add an "already owes" notice at the till
   - add "owed = N days of sales" on Finance
   - stop the money check from counting Very late balances
2. **Owner, this week:**
   - decide the credit rule: who may buy on credit, one open tab at a time, and whether Very late stops new credit
   - while the supplier is paid at order, ask buyers in the first week after a batch arrives to pay at the till
3. **Later, on a trigger:** a "won't be paid" write-off with a bad-debt estimate, and per-buyer limits.

## 2. Situation, complication, resolution

- **Situation.** 37 of 51 sales (₱14,540 of ₱19,800) were rung as Not paid yet, and 24 of the 31 buyers have used
  credit. Buyers pay reliably: half within 9 days, 97% within 14, none lost. The only gap between list price and cash
  in hand is credit: 10.5% of sales is still owed.
- **Complication.**
  - The money comes back about 9 days after each sale, but the supplier is paid on the order day, before the stock
    arrives. Most of the next order is therefore funded by the first week's sales of the batch still on the shelf, and
    73% of those are not yet paid.
  - On Batch 4 this costs about ₱1,588 of gross profit, or a ₱3,448 owner top-up instead of ₱1,293.
  - The app's follow-up rules don't follow the shop:
    - SOP 9 says chase after 7 days, though 65% of good payers take longer.
    - Finance buckets at 7 and 30 days.
    - The planned history-based rule can hide exactly the balances that stop being paid.
- **Resolution.**
  - **Learn the follow-up days from paid-in-full sales**, so they move as the shop grows. Show what a buyer already
    owes at the moment they ask for more.
  - **Measure the credit book in days of sales**, so it scales with the shop.
  - **Don't combine credit with paying the supplier at order.** Leave the credit policy itself with the owner.

## 3. Issue tree

Question: **what does selling on credit cost and earn, and which rules, learned from the shop's own history, keep it
worth it as the shop grows?** The branches are mutually exclusive and collectively exhaustive. Prioritised branches are
marked ★.

- **A. How much is owed**: receivables = net sales a day × credit share × days to collect ★
  - A1 Credit share: 73.4% of value (69.5% over the last 30 days)
  - A2 Days to collect: median 9, 80th percentile 11, 95th percentile 13, maximum 21
  - A3 What is owed now, how old it is, and who owes it: ₱2,080; as concentrated as 4.7 equal buyers
- **B. What may never be paid**: expected loss = PD × LGD × EAD
  - B1 PD from the shop's own history: 0 defaults in 31; 1.6% / 8.3% / 25% by age
  - B2 LGD: 100%
  - B3 Exposure: ₱2,080 now, ₱6,080 at the peak, about ₱8,150 at a full shelf
- **C. What the money tied up costs** ★
  - C1 Financing: ₱40 to ₱119 a month
  - C2 Cash on the order day: ₱1,588 a cycle when the supplier is paid at order ★
- **D. What credit brings in**: sales that would not happen without it. This is unknown; it is pruned to a break-even
  (§4.6).
- **E. The rules that control A to C** ★
  - E1 When to follow up (Late / Very late) ★
  - E2 Who gets credit and how much (one open tab; per-buyer limit)
  - E3 What the till shows when a buyer asks for credit ★
  - E4 When a balance counts as lost (write-off): later

**Pruned:**

- The staff time spent collecting: it is not recorded.
- Charging interest or a fee on tabs: a legal and goodwill question, and small next to C2.
- Payment-method mix: every payment so far was cash, so there are no fees.

## 4. Analysis

### 4.1 The credit book

| Metric | Value | Formula |
|---|---|---|
| **Share of sales on credit** | **73.4% of value** (₱14,540), 72.5% of sales (37 of 51) | Not paid yet sales ÷ net sales |
| Over the last 30 days | 69.5% | 28 Oct to 26 Nov |
| By batch period | Batch 1: 70.0% (17 of 24 sales). Batch 2: 76.7% (20 of 27) | |
| Size of a credit sale | Median ₱340. 31 are one piece, 5 are two, 1 is three. 16% have 2 or more pieces, against 14% of cash sales | |
| Buyers who used credit | 24 of 31 (77%): 14 of 20 one-time buyers and 10 of 11 repeat buyers | |
| Repeat buyers' share | 61.8% of all sales and 63.8% of credit sales | |
| Collections | 36 later payments, ₱12,460, all in cash. 4 credit sales were paid in parts | |

**So what:** credit is not an exception here. It is the normal way to buy, for new and returning buyers alike. A rule
that makes credit harder for everyone would hit the 11 repeat buyers who bring 62% of sales. The rules should target
timing and the few slow tabs.

### 4.2 Days to collect

| Measure (31 credit sales paid in full) | Value |
|---|---|
| Median / mean / weighted by value | **9** / 8.7 / 9.3 days |
| 50th / 80th / 90th / 95th percentile (`percentile_disc`) | 9 / **11** / 13 / 13 days |
| Slowest | 21 days (a 3-piece sale, paid in 3 parts) |
| Paid within 7 / 9 / 12 / 14 days | **35%** / 74% / 87% / 97% |
| Counting the 6 open balances as not paid yet at their age (Kaplan–Meier): 50th / 80th / 90th / 95th | 9 / 12 / 13 / 21 days. Still unpaid after 14 days: 9.3% |
| Batch 1 period / Batch 2 period | Median 9 / 8 days, mean 10.0 / 7.1 |
| One piece / 2 or more pieces | Median 8.5 / 9 days, mean 8.2 / 11.2 |
| Payments made on a day the buyer bought again | 16.7% of payments (16.1% of value) |

**So what:**

- Nine days is how this shop's buyers pay. A 7-day follow-up rule is stricter than 65% of buyers who paid in full
  without trouble.
- Batch 2 looks faster, but partly because its slowest buyers haven't paid yet. The Kaplan–Meier view, which counts
  them, moves the 80th percentile from 11 to 12 days.
- Only about 1 payment in 6 is made on a day the buyer buys again; the other 5 come on days they don't buy. Asking at
  the till helps, but it is not the main way money comes back.

### 4.3 What is owed now

| Age today | Owed | Sales | Fixed buckets now (Finance) | Recommended buckets |
|---|---|---|---|---|
| 0, 1, 4 and 7 days | ₱1,700 | 4 | 0–7 days | Usual (0–11) |
| 16 and 16 days | ₱380 (one is ₱40 left after a ₱300 part payment) | 2 | 8–30 days | **Late** (12–18) |
| Over 18 days | ₱0 | 0 | | Very late |
| **Total** | **₱2,080** (10.5% of net sales) | 6 sales, 6 buyers | | |

- **Concentration.**
  - The largest single balance is ₱680, 32.7% of what is owed.
  - The Herfindahl index is 0.214: what is owed is as concentrated as 4.7 equal buyers.
  - The age weighted by balance is 5.5 days.
- **Over time.** Receivables averaged ₱3,968 a day and peaked at ₱6,080 on 3 Nov. They were ₱5,440 on 31 Oct, which
  matches `finance_report`.
- **DSO.**
  - On the average balance, DSO is 6.21 days.
  - In steady state it is credit share × value-weighted days to collect = 0.734 × 9.32 = **6.84 days**.
- **Owed as days of sales.**
  - Today: ₱2,080 ÷ (₱17,240 of sales in the last 30 days ÷ 30) = **3.6 days**.
  - Since opening, the daily figure has run from 2.3 to 6.7 days (10th to 90th percentile).

**So what:**

- What is owed is small and young today only because the shelf has been empty, so there have been few new credit
  sales. When Batch 3 sells, it heads back to the steady state: about ₱5,000 owed at the shop's in-stock pace.
- "Owed = N days of sales" is the measure that scales:
  - it rises when buyers pay more slowly or more sales go on credit;
  - it stays flat when the shop simply grows.

### 4.4 Follow-up rules: when is a balance late?

| Rule | Usual | Late after | Very late after | Today: Usual / Late / Very late | Paid-in-full sales it would have marked Late |
|---|---|---|---|---|---|
| Fixed (SOP 9: 7 days; Finance: 0–7, 8–30, over 30) | 7 | 7 | 30 | ₱1,700 / ₱380 / ₱0 | 20 of 31 (65%) |
| Design v2, method 9 (paid in full, plus open balances older than the median, at their current age) | 9 | 12 | 19 | ₱1,700 / ₱380 / ₱0 | 4 (13%) |
| **Recommended: paid in full only; Very late at least 7 days after Late** | **9** | **11** | **18** | ₱1,700 / ₱380 / ₱0 | 5 (16%) |
| Kaplan–Meier (open balances counted as not paid yet) | 9 | 12 | 21 | same | 4 (13%) |

**The flaw in design v2: open balances can hide themselves.** Suppose the two 16-day balances are never paid, the four
younger ones are paid at 9 days, and nothing else happens:

| Day | Age of the two | v2's Very late starts after | v2 says | Recommended says | Kaplan–Meier says |
|---|---|---|---|---|---|
| 26 Nov | 16 | 19 | Late | Late | Late |
| 29 Nov | 19 | 19 | Late | **Very late** | Late |
| 1 Dec | 21 | 21 | Late | Very late | Very late |
| 6 Dec | 26 | 26 | Late | Very late | Very late |
| 10 Jan | 61 | 61 | **Late, forever** | Very late | Very late |

Why this happens:

- Under design v2, each balance's age is one of the values that set the threshold. Once stuck balances are about 1 in
  20 of the values, the 95th percentile is their own age, so they are never older than it.
- The same happens to Late at 1 in 5: eight balances stuck at 30 days would push Late's start to 30, and none of them
  would show.

The cases that need flagging most, buyers who stop paying, are exactly where the rule goes blind.

**Precision as the shop grows.** Late's start, the 80th percentile, falls in these ranges (bootstrapped from the
shop's own times, 4,000 draws):

| Paid-in-full sales | 90% range of Late's start |
|---|---|
| 31 | 9 to 13 days |
| 60 or 120 | 9 to 12 days |
| 240 | 10 to 11 days |

**So what:**

- Paid-in-full only, with Very late at least a week after Late, gives almost the same live numbers as design v2:
  11 / 18 against 12 / 19. It cannot be fooled by stuck balances, and it is the simplest of the three to build.
- Kaplan–Meier is the textbook fix for open balances, but here it changes the answer by a day for more code.
- The threshold already moves with the shop's history. It settles to about ±1 day once a few hundred credit sales are
  paid, so no fixed line is needed.

### 4.5 Per-buyer rules: what a warning at the till would have done (backtest, no hindsight)

Each of the 37 credit sales was replayed with only what was known at that moment.

| Warning | Credit sales it would have fired on | Value | Paid in full: median days | Slower than Late's start | Still open |
|---|---|---|---|---|---|
| Buyer already owes | 4 | ₱1,960 | 5 (3 paid) | 1 of 3 | 1 |
| Over a peso limit (largest sale repaid; a new buyer gets one pod) | 13 | ₱6,640 | 9 | 2 of 10 | 3 |
| Over a limit in pieces (largest repaid; new buyer: 1 piece) | 9 | ₱5,280 | 9 | 2 of 7 | 2 |
| Buyer has a Late balance (as known then) | 0 | — | — | — | — |
| No warning | 24 | ₱7,900 | 9 | 3 of 21 | 3 |

- **History per buyer.** Only 1 buyer has 3 or more credit sales paid in full; that buyer's own median is 8 days,
  against the shop's 9. A buyer's own "usually pays in N days" needs more history.
- **New credit buyers.** Buyers' first credit sales (24) took a median of 9 days, the same as their later ones. So far
  new credit buyers pay as well as regulars.
- **Peak owed by one buyer at any moment.** The median is ₱340 and the highest is ₱1,280. 8 of the 24 credit buyers
  owed more than one pod at some point.
- **"One open tab" rule.** ₱1,620 of old balances were still open when the same buyer took more credit, for 9,460
  peso-days. Settling the old tab first would have put **₱305 more cash** in hand on average (0.48 days of DSO).

**So what:**

- A per-buyer limit would fire on a quarter to a third of credit sales, and those sales were not clearly slower to
  pay. It would nag without picking out bad payers. The peso version also trips on the price rise from ₱320 to ₱340.
- What does help is cheap:
  - show what the buyer already owes, at the moment they ask for more;
  - warn only when that balance is Late or Very late.
- Limits can wait for more history and for the owner's policy.

### 4.6 Expected loss = PD × LGD × EAD

| Age group | Paid sales that reached it | Defaults | PD = (0 + ½) ÷ (n + 1) | Open now | Owed (EAD) | Expected loss (LGD 100%) |
|---|---|---|---|---|---|---|
| Usual (0–11 days) | 31 | 0 | 1.6% | 4 | ₱1,700 | ₱27 |
| Late (12–18) | 5 | 0 | 8.3% | 2 | ₱380 | ₱32 |
| Very late (over 18) | 1 | 0 | 25% | 0 | ₱0 | ₱0 |
| **Total** | | | | 6 | **₱2,080** | **₱58** (2.8%) |

- **The rate for a new credit sale.** It is 1.6%. Its 95% upper bound (Jeffreys) is 6.0%. The "rule of three" bound for
  zero events is 3 ÷ 31 = 9.7%. The data cannot rule out a few per cent.
- **Simulated loss on today's book.** 50,000 trials, with the rate itself uncertain:
  - mean ₱58, median ₱0, 95th percentile ₱340, 99th percentile ₱680;
  - a 20% chance that at least one of the six is never paid.
- **Stress tests.**
  - The largest balance (₱680) = **7.1% of gross profit to date** (7.7% of net profit).
  - Both Late balances (₱380) = 4.0%.
  - Everything owed (₱2,080) = 21.7% (23.6% of net profit).
- **On new credit.**
  - Today's pace: ₱14,071 of credit sales a month × 1.6% = **₱220 a month** (₱842 at the upper bound).
  - Full shelf: ₱410 a month (₱1,571 at the upper bound).
- **Profit against cash.** A ₱340 pod that is never paid costs ₱340 of profit, because the sale is reversed. It costs
  ₱172 of cash, which is what the pod cost.
- **Break-even.** Credit pays only if some credit sales would not happen without it:

| Share of credit sales that need credit | Credit pays while the bad-debt rate is below |
|---|---|
| 0% | never (it only costs) |
| 10% | 3.9% |
| 25% | 11.1% |
| 50% | 23.2% |

  If the pod would otherwise sit unsold, a one-off credit sale beats no sale whenever the chance of being paid is over
  landed cost ÷ price = **50.5%**.

**So what:** bad debt is small and a good bet with these buyers. The worst case today is one ₱680 balance. While
supply caps sales, a credit sale mostly replaces a cash sale to someone else, so credit only pays with buyers who pay.
The record says they do, so credit should stay, with discipline.

Expected loss is worth knowing, but not worth building yet: ₱58 today. The cautious rate falls by itself as buyers
keep paying, and it rises if one doesn't.

### 4.7 The cash cost of credit

**Financing.** Average receivables of ₱3,968 cost this much a month at each benchmark rate [A6]:

| Rate | Cost a month | Cost per credit sale |
|---|---|---|
| 1% a month (bank-like) | ₱40 | ₱1 |
| 3% a month (BSP card ceiling) | ₱119 | ₱3 |
| 20% a month ("5-6" lending) | ₱794 | ₱22 |

Per credit sale, about ₱3 of financing plus ₱5 of expected loss comes to **₱8**, against ₱159 of margin.

**Order timing, Batch 4 [A5].** This is where credit really costs:

| Scenario | Cash on 5 Dec | Owner top-up to order in full on 5 Dec | Full order placed | Empty-shelf days | Gross profit lost |
|---|---|---|---|---|---|
| **S0 As now** (73% credit, own collection times) | **₱2,776** | **₱3,448** | 13 Dec (+8 days) | 4.5 | **₱1,588** |
| S1 Every new sale paid at the till | ₱4,931 | ₱1,293 | 7 Dec (+2) | 0 | ₱0 |
| S2 Half of sales on credit | ₱3,464 | ₱2,760 | 11 Dec (+6) | 2.5 | ₱880 |
| S3 Credit, but everything paid within 7 days | ₱2,776 | ₱3,448 | 12 Dec (+7) | 3.5 | ₱1,234 |
| S4 Credit, everything paid by Late's start (11 days) | ₱2,776 | ₱3,448 | 13 Dec (+8) | 4.5 | ₱1,588 |
| S5 As now, but today's ₱2,080 collected by 28 Nov | ₱3,069 | ₱3,155 | 13 Dec (+8) | 4.5 | ₱1,588 |
| **S0p As now, supplier paid on pick-up (12 Dec)** | ₱5,631 on 12 Dec | ₱593 | picked up 13 Dec | **0** | **₱0** |
| S1p No new credit, supplier paid on pick-up | ₱10,227 on 12 Dec | ₱0 | 12 Dec | 0 | ₱0 |

- **Sensitivity.**
  - A ₱7,214 order (Batch 3's cost): as now, +10 days and ₱2,296 lost; with no credit, +3 days and ₱0.
  - An order-by day of 4 or 6 Dec gives the same result: ₱1,588 against ₱0.
- **Cross-check.** The stock-and-ordering branch's row for the same case (7 days' delivery, 2.22 a day, a ₱6,362
  order) says: cash ₱2,517 on 4 Dec, the full order affordable on 14 Dec, 5.5 empty days, ₱1,942. This model is within
  a day of it. The cash-and-capital branch's Monte Carlo median top-up is ₱2,598, over order days of 3 to 11 Dec.

**Money tied up in credit as the shop grows** (steady-state DSO 6.84 days):

| Pace | Owed on average | In pods at landed cost | Share of the next order |
|---|---|---|---|
| Recorded: 60 pieces in 31 days | ₱4,370 | 25 | 70% |
| While in stock: 2.22 a day | ₱5,013 | 29 | 81% |
| Full shelf: 3.61 a day | ₱8,151 | 48 | 131% |

Shorter collection times would free cash for good:

| Change | Value-weighted days to collect | DSO | Cash freed now | Cash freed at a full shelf |
|---|---|---|---|---|
| Everything collected by day 7 | 9.32 → 6.47 | 6.84 → 4.75 days | ₱1,335 | ₱2,489 |
| Everything collected by day 11 | 9.32 → 8.29 | 6.84 → 6.09 days | ₱481 | ₱898 |
| Each 10 points of sales moved from credit to the till | | | ₱595 | |

**So what:**

1. **Timing outweighs everything else.**
   - With the supplier paid at order, credit costs about ₱1,588 of gross profit on this cycle alone.
   - That is 27 times today's expected bad debt and 13 times a month of financing at the card ceiling.
   - It comes from the new batch's own first-week sales (S5 shows that chasing today's ₱2,080 changes nothing for
     Batch 4).
2. **Credit and paying at order are the problem together.** Either one alone is affordable this cycle (S1 and S0p).
   Pick-up terms (cash-and-capital rec. 2) therefore remove most of credit's cost. Without them, the lever is how much
   of the first week's sales is paid at the till.
3. **Collection terms help the permanent cash, not this order.**
   - Collecting by day 7 frees ₱1,335 now and ₱2,489 at a full shelf, but brings Batch 4 forward by only a day.
   - Most buyers already pay by day 11, so chasing from Late's start frees ₱481.

## 5. Recommendations

Ranked by peso impact × feasibility. "Build now" means it is worth building in the planning-engine release on 80/20
grounds.

| # | Recommendation | ₱ impact (math) | Feasibility | Build now | What the app calculates or shows | Owner | Timing | KPI |
|---|---|---|---|---|---|---|---|---|
| 1 | **Don't combine credit with paying the supplier at order.** While an order is paid at order, ask buyers in the first week after a batch arrives to pay at the till (Not paid yet for known good payers only). Better still, get pick-up terms (cash-and-capital rec. 2). | ₱1,588 of gross profit on Batch 4 (S0 − S1), ₱880 at half credit (S2), ₱0 with pick-up terms (S0p). The owner top-up needed on the order day falls from ₱3,448 to ₱1,293. | Medium (buyers' habits; the supplier decides terms) | No: owner action | None new. Restock's money check (design method 8, cash-and-capital rec. 4) already shows the shortfall. | Owner and staff | From Batch 3's arrival (about 2 Dec) to Batch 4's order | Credit share of a batch's first 7 days of sales; cash on the order-by day against the next order |
| 2 | **Fix method 9 and show Late / Very late everywhere** | Protects today's ₱380 Late and every future stuck balance from being hidden. Follow-ups on normal payers fall from 20 of 31 to 5. Chasing from Late's start (all paid by day 11) frees ₱481 now and ₱898 at a full shelf. | High | **Yes** | `collection_stats` v3: paid in full only, Very late ≥ Late + 7, 7 / 30 fallback. Live: Usual 9, Late after 11, Very late after 18. Chips on Collectibles; Usual / Late / Very late on Finance. Design B14; map finance #5, ops #10, db #10. | Engineering | Planning-engine release (task 23) | Share of credit sales paid by Late's start (≥ 80%); Very late ₱0 |
| 3 | **"Already owes" notice at the till** (Sell → Not paid yet) | Asking for the old tab first was worth ₱305 more cash on average (0.48 days of DSO). 4 credit sales (₱1,960) went to buyers who already owed. 1 payment in 6 is made when the buyer buys again. | High: the Sell page already loads every open balance | **Yes** | "Already owes ₱X since {date}", with the Late / Very late chip. A warning (not a block) when that balance is Late or Very late. Map critic #3, ops #16. | Engineering | Same release | Credit sales made to buyers with a Late balance (target 0) |
| 4 | **Finance: "owed = N days of sales" and the share sold on credit (last 30 days)** | Tracks the ₱595 per 10 points of credit share, and the growth in money tied up from ₱4,370 now to ₱8,151 at a full shelf, as one number that doesn't move just because the shop grows. | High (two lines from data the page already has) | **Yes** | Receivables ÷ (net sales of the last 30 days ÷ 30), and Not paid yet sales ÷ net sales, under Receivables. Managers and owner only. Map finance #5. | Engineering | Same release | Days owed within the shop's usual range (about 2 to 7) |
| 5 | **Money check: don't count Very late balances as money coming in** | ₱0 today, because nothing is Very late. It stops dead money from funding an order of ₱6,000 to ₱7,000. | High (one condition) | **Yes** | In method 8, `collect_cents` leaves out balances that are Very late today. Live: still ₱2,080. | Engineering | Same release | — |
| 6 | **Owner's credit rule:** who may buy on credit; one open tab; Very late means no new credit until it is paid; a buyer's first credit is one pod. Write it into SOP 9. | Caps the worst single-buyer balance seen (₱1,280) near ₱680, which is ₱600 (6.3% of gross profit) less if that buyer defaults. Expected value is small (about ₱9 at 1.6%). | High | No: policy (rec. 3 supports it) | SOP 9 text; the notice in rec. 3 | Owner | Next weekly review | Largest single balance; tabs with 2 or more open sales |
| 7 | **Later: "Won't be paid" (write-off) and a bad-debt estimate on Finance** | Expected loss is ₱58 now, ₱220 a month on new credit (₱842 at the upper bound). A write-off keeps profit, receivables and batch statements honest when the first default happens. | Medium (migration, P&L line, balance identity tests) | No | Owner-only `write_off_sale` with a Bad debts line under operating expenses. Bad-debt estimate = Σ balance × (written off + ½) ÷ (paid + written off + 1) per age group. Trigger: the first balance 30 days past Very late (about 48 days old), or the owner decides to stop chasing. | Engineering, owner decides | When triggered | Written off ÷ credit sales |
| 8 | **Later: per-buyer limit and "usually pays in N days"** | Small. The backtest fires on 24% to 35% of credit sales, with no clear link to slow payment. | Medium | No | A buyer's own median once they have 3 or more paid-in-full credit sales (1 buyer today). Limit = the most pieces repaid on one sale. Trigger: 10 or more buyers with 3 or more paid sales, or an owner limit policy. | Engineering | After about 3 months | Warnings that preceded a Late balance |

### What the app should calculate (tied to the design and the map)

All of these are worked out from the shop's history every time a page loads, with a "starting guess" label until
there is enough history. They follow the build review: `collection_days()` is staff-readable and carries no amounts.
`finance_now`, `funds_summary` and `finance_report` stay unchanged.

| Figure | Formula | Shown on | Design / map |
|---|---|---|---|
| `collection_stats()` v3 | `paid` = completed Not paid yet sales with `business_date ≥ today − 180`, `balance_cents = 0` and at least 1 payment. `days` = max(payment `business_date`) − sale `business_date`. Under 10 paid: usual 7, `late_after` 7, `very_late_after` 30, `guess` true. Otherwise: usual = `percentile_disc(0.5)`, `late_after` = `percentile_disc(0.8)`, `very_late_after` = greatest(`percentile_disc(0.95)`, `late_after` + 7). **Open balances are not in the values.** Live: 9 / 11 / 18, `paid_count` 31. | Finance receivables, Collectibles, Sell notice | Method 9 (replaces "values = paid ∪ open older than the median"); B14 |
| Age group of an open sale | age = `manila_today()` − `business_date`. Usual if age ≤ `late_after`; Late if age ≤ `very_late_after`; else Very late. Live: ₱1,700 / ₱380 / ₱0. | Finance, Collectibles chips | Method 9; map finance #5, db #10 |
| `collection_days()` (staff) | {usual_days, late_after, very_late_after, paid_count, guess}, no amounts | Collectibles, Sell | Design v2, unchanged |
| Sell notice | From the `collectibles()` rows already loaded on Sell, where `buyerKey(name)` = `buyerKey(typed name)`: owes = Σ balance, oldest = min `business_date`, its age group. Copy: "{Name} already owes ₱X since {date}. Most buyers pay within {usual_days} days." Warning when the oldest is Late or Very late: "Owes ₱X for N days. Ask them to pay it first." It never blocks. | Sell, checkout sheet, Not paid yet | Map critic #3, ops #16 |
| Owed in days of sales | receivables ÷ (net sales of the last 30 days ÷ min(30, days open)). Live: 3.6. Credit share over 30 days: live 69.5%. | Finance → Balance, Receivables (owner, manager) | Map finance #5 (new line) |
| Money check, receivables part | Σ balance of open credit sales with (`collect_by` − `business_date`) > usual_days **and** (today − `business_date`) ≤ `very_late_after`. Live: ₱2,080. | Restock money check | Method 8 budget |
| Later: bad-debt estimate | Σ balance × PD(age group); PD = (written off + ½) ÷ (resolved that reached the group + 1). Live: ₱58. | Finance, Receivables | New (Later list) |
| Later: `write_off_sale(p_sale, p_note)` | Owner only. Balance to 0, with a Bad debts expense on the day it is written off. The balance identity still holds: receivables down, profit earned down. | Sale page, Collectibles | New (Later list) |

**Database tests to add** (in `supabase/tests/pos_test.sql`, with check 19 of the design):

- An open credit sale whose age is beyond every paid sale changes neither threshold.
- After `very_late_after` + 1 days it is Very late.
- Eight stuck balances do not move `late_after`.
- `collection_days()` returns no amounts to a cashier.

## 6. Risks and mitigations: what would prove this wrong

- **Buyers stop paying when Batch 3's new buyers arrive.** The model rests on 31 collections from mostly regular
  buyers.
  - Watch: owed in days of sales above about 7, or any Very late balance.
  - Mitigation: rec. 3's warning, and the owner's one-tab rule.
- **Asking first-week buyers to pay at the till loses sales.** It might, if credit is why they buy.
  - Today supply caps sales: every piece sells, and buyers mostly leave when their flavour is out (stock-and-ordering
    branch). A modest tightening is therefore unlikely to cost pieces sold.
  - Test it on Batch 3: if its pace with a full shelf falls well below 3.4 a day while credit falls, ease off.
- **The order-timing model is deterministic.** It uses one path of expected values, with devices left out and a
  7-day delivery guess. Faster sales bring the order day forward too, as the cash branch found.
  - The direction (credit plus paying at order is costly; either alone is not) holds at order days of 4 to 6 Dec and
    at a ₱7,214 order.
  - The size could be ₱1,000 to ₱2,300.
- **Zero defaults is not zero risk.** The cautious rates (1.6% / 8.3% / 25%) and the 95% bound (6%) say so.
  - One ₱680 loss would cost 7.1% of gross profit to date.
  - Mitigation: the write-off and estimate (rec. 7) once triggered, and no open tab over two pods without the owner.
- **Name matching.** A buyer typed two ways looks like two buyers. That hides stacked tabs and splits their history.
  - Mitigation: the Sell page already suggests names. SOP 9 says to spell names the same way every time.

## 7. Next 30 / 60 / 90 days

- **30 days (by 26 Dec):**
  - Owner sets the credit rule (rec. 6) and asks the first-week buyers of Batch 3 to pay at the till while the
    supplier is paid at order (rec. 1).
  - Follow up the two Late balances (₱380) now.
  - Build recs. 2 to 5 with the planning engine, with the DB tests above. Update the SOP 9 check to "Follow up on
    every sale marked Late or Very late. Before a new Not paid yet sale to someone who owes, ask for the old one
    first."
  - Add the Planning sections below.
- **60 days:**
  - Review the share of credit in Batch 3's first week against its pace, and owed in days of sales against its usual
    range.
  - Decide whether Very late stops new credit as a hard rule.
- **90 days:**
  - With about 100 collections, check rec. 8's trigger (buyers with 3 or more paid sales) and rec. 7's (any balance
    30 days past Very late).
  - Look for a payday pattern in collections (the 15th and 30th), which needs 8 or more weeks.

## 8. Help → Planning: methods from this branch

These are standard accounting, statistics and finance methods, not McKinsey property. Where a firm or author made one
well known, it says so. They replace and extend design v2's Planning section 7, "collect".

1. **Late and Very late, from your own buyers (receivables ageing)**
   - *Where it comes from:* ageing what customers owe is a long-standing accounting and credit-management practice.
     IFRS 9 (IASB, 2014) turns it into a "provision matrix" for trade receivables. Using the shop's own payment times
     instead of fixed 30 / 60 / 90-day buckets is plain statistics (percentiles). Counting balances that are still
     open is survival analysis (Kaplan and Meier, 1958). The app uses the simpler paid-in-full version: it gives
     nearly the same days here and cannot be fooled by balances that stop being paid.
   - *In this shop:* of 31 Not paid yet sales paid in full, half were paid within 9 days and 8 in 10 within 11, so
     Late = owed more than 11 days and Very late = more than 18. The old 7-day rule flagged 65% of buyers who then
     paid normally; this one flags 16%. Today ₱1,700 is Usual, ₱380 Late and ₱0 Very late. The days are recomputed
     from the last 180 days each time. Until 10 sales are paid in full they are 7 and 30 days, and the screen says so.
   - *How to use, on Collectibles (Owed on a phone):*
     1. Read the line under the totals: "Late = owed longer than N days. 8 in 10 buyers pay by then."
     2. Message every buyer with a Late chip.
     3. For a Very late one, tell the owner: no new credit until it is paid.
     4. At the weekly review (SOP 13), go through Late and Very late first.
2. **How many days of sales are owed (DSO)**
   - *Where it comes from:* days sales outstanding (receivables ÷ sales a day) is a standard working-capital ratio and
     part of the cash conversion cycle (Richards and Laughlin, 1980). McKinsey's *Valuation* uses it in the return on
     capital tree, but it is not McKinsey's.
   - *In this shop:* owed ₱2,080 = 3.6 days of sales today; since opening it has run from 2.3 to 6.7 days. It is
     simply the share sold on credit (70% to 73%) × how long buyers take (9.3 days, by value). It grows with the shop:
     at a full shelf about ₱8,150 would be owed, more than one order. Each 10 points of sales paid at the till instead
     frees about ₱595 today.
   - *How to use, monthly, on Sales → Finance (last month picked):*
     1. Under Receivables, read "= N days of sales" and the share sold on credit.
     2. Compare them with the month before.
     3. If the days rose but the credit share didn't, buyers are paying more slowly: chase Late sooner.
     4. If the credit share rose, ask more buyers to pay at the till.
3. **Who gets credit, and how much (the credit decision)**
   - *Where it comes from:* the credit decision in corporate-finance textbooks (for example Brealey, Myers and Allen,
     *Principles of Corporate Finance*, on credit management): give credit when the chance of being paid × what the
     sale brings beats its cost. Also the "character" test, the buyer's track record, from lenders' traditional "five
     Cs of credit". Not McKinsey's.
   - *In this shop:* while every piece sells, a credit sale mostly replaces a cash sale to someone else. So credit only
     pays with buyers who reliably pay, and these do: none of 31 failed to pay. If stock ever sits unsold, a one-off
     credit sale beats no sale whenever the chance of being paid is over 51% (cost ÷ price). 4 credit sales went to
     buyers who already owed. The most anyone owed at once was ₱1,280.
   - *How to use, on Sell:*
     1. Pick Not paid yet and type the buyer. If they already owe, the app shows "Already owes ₱X since {date}".
     2. Ask for the old tab first.
     3. If it is Late or Very late, the app warns: ask them to pay before taking more on credit, as the owner's rule
        says.
     4. Owner: write the rule into SOP 9 (who may buy on credit, one open tab, a first credit of one pod).
4. **What credit costs: bad debt against timing (expected loss; cash on the order day)**
   - *Where it comes from:*
     - expected loss = PD × LGD × EAD, from bank credit-risk rules (Basel II, BCBS 2004);
     - the cautious small-sample rate: Jeffreys, 1946; the "add a half" estimate;
     - the "rule of three" for zero events: Hanley and Lippman-Hand, 1983;
     - the cost of money tied up in working capital, from standard finance.
     McKinsey's risk work uses the same formula; none of it is McKinsey's.
   - *In this shop:*
     - Bad debt: ₱2,080 owed × cautious rates (1.6% Usual, 8% Late, 25% Very late) × 100% lost = about ₱58. On new
       credit it is about ₱220 a month. The worst single loss today would be ₱680 (7% of gross profit).
     - Timing: on Batch 4's order day, credit holds back about ₱2,155. If the supplier is paid at order, that costs
       about ₱1,588 of gross profit (4.5 days with an empty shelf). Paid on pick-up, it costs about ₱0.
   - *How to use:*
     1. On Restock, read the money check. It counts only what buyers usually pay by the order day, never Very late
        balances.
     2. If it says the money is short and the supplier wants payment at order, ask buyers in the new batch's first
        week to pay at the till.
     3. Monthly, on Sales → Finance → Receivables, treat Very late balances as money you may not get, and leave them out
        of plans.

**Weekly routine (Collectibles, 5 minutes):** follow up Late and Very late first (SOP 9).

**Monthly routine (Sales → Finance):**

1. Read owed in days of sales and the share sold on credit against last month.
2. Decide on every Very late balance: keep chasing, or stop new credit.

**PLAN_WORDS additions:**

- "Late / Very late: owed longer than 8 in 10 of your buyers take to pay / at least a week past that, worked out from
  the sales you've collected."
- "Days of sales owed: what buyers owe ÷ an average day's sales."

## 9. Open questions, data gaps and sources

**Open questions**

1. What is the owner's credit rule: who may buy on credit, how much, one open tab or more, and does Very late stop new
   credit? The HISTORY open item "SOP 9 assumes buyers who owe are chased after 7 days" is still unconfirmed; the data
   says 11 days.
2. Will the supplier accept payment on pick-up? That decides whether credit costs about ₱1,588 a cycle or about ₱0
   (cash-and-capital rec. 2).
3. When a buyer won't pay, does the owner want to write it off, and at what age? The app has no write-off today.
4. Are buyers' names always typed the same way? Matching is by name only.
5. Do buyers pay around paydays (the 15th and 30th)? 31 days is too short to tell.
6. Would credit buyers buy for cash? Batch 3's first week can test this (rec. 1).
7. Will the ₱40 left on one Late sale be collected, or was it forgiven as change?

**Data gaps**

- There are no defaults, so every loss rate is a cautious estimate.
- There are 31 collections and no measured delivery time.
- Follow-ups are not recorded, so nobody can measure whether chasing speeds payment.

**No published loss rate for Philippine store credit was found.** Local studies describe unpaid store credit ("utang")
as a common problem but do not quantify it, for example
[ejournals.ph, a Catanduanes sari-sari store case study, 2017](https://ejournals.ph/article.php?id=14871) and
[Philstar, 16 Jun 2003](https://philstar.com/business-as-usual/2003/06/16/210354/what-convenient-about-convenience-stores).
So the shop's own history is the only basis for PD.

**Sources**

- Shop data: the live Supabase project, read-only SELECTs, 26 Nov 2026 18:59 and 19:41 Manila (through the data block
  of `analysis/baseline.py`). Also the planning design v2 (method 9 and the maths, UX and build reviews) and the
  suggestion map (finance #5, ops #10, ops #16, db #10, critic #3, critic #14).
- Other branches: `analysis/stock-and-ordering.md` (order by 5 Dec, the 7-day / 2.22 cash row) and
  `analysis/cash-and-capital.md` (the ₱6,224 next order, Monte Carlo top-ups, pick-up terms).
- BSP ceiling on credit-card interest, 3% a month (36% a year), Circular No. 1165, January 2023
  ([Manila Bulletin, 13 Jan 2023](https://mb.com.ph/2023/01/13/bsp-approves-higher-3-cap-on-credit-card-rate)), retained
  in August 2023 ([Manila Bulletin, 22 Aug 2023](https://mb.com.ph/2023/8/22/credit-card-cap-of-3-monthly-interest-rate-stays-bsp)).
  The current figure could not be confirmed past early 2024; check it with the BSP.
- "5-6" informal lending at 20% a period, usually a month:
  [Kyoto Review, "The 'Bombay 5-6': Last Resource Informal Financiers for Philippine Micro-Enterprises"](https://kyotoreview.org/?p=5250)
  and [Inquirer, "Alternative to '5-6' lending"](https://business.inquirer.net/221209/alternative-5-6-lending) (2016).
- IFRS 9 *Financial Instruments* (IASB, July 2014), simplified approach and provision matrix for trade receivables, as
  explained in [BDO Australia, August 2018](https://bdo.com.au/en-au/accounting-news/accounting-news-august-2018/ifrs-9)
  and the [PwC provision matrix practical guide (2020)](https://www.pwc.ch/en/publications/2020/IFRS%209%20-%20Impairment%20-%20Provision%20Matrix%20-%20Practical%20Guide.pdf).
  This source gives the method only; no rates from it are used here.
- Basel Committee on Banking Supervision, *International Convergence of Capital Measurement and Capital Standards*
  (Basel II), June 2004 (revised June 2006). Expected loss = PD × LGD × EAD; default is more than 90 days past due
  (para. 452). The 90-day bank definition is too long for 9-day tabs, so this file uses "never paid" [A2].
- Kaplan, E. L. and Meier, P., "Nonparametric estimation from incomplete observations", *Journal of the American
  Statistical Association* 53(282), 1958, pp. 457–481.
- Jeffreys, H., "An invariant form for the prior probability in estimation problems", *Proceedings of the Royal Society
  A* 186, 1946, pp. 453–461. Brown, Cai and DasGupta, "Interval estimation for a binomial proportion", *Statistical
  Science* 16(2), 2001 (the Jeffreys interval). Pluto, K. and Tasche, D., "Thinking positively", *Risk*, August 2005
  (low-default portfolios).
- Hanley, J. A. and Lippman-Hand, A., "If nothing goes wrong, is everything all right?", *JAMA* 249(13), 1983,
  pp. 1743–1745 (the rule of three).
- Brealey, R., Myers, S. and Allen, F., *Principles of Corporate Finance* (McGraw-Hill), chapter on credit management
  (the credit decision).
- Richards, V. D. and Laughlin, E. J., "A Cash Conversion Cycle Approach to Liquidity Analysis", *Financial Management*
  9(1), 1980 (as cited in the cash-and-capital branch).

Credit, tax and accounting figures here are planning estimates, not advice. A qualified accountant should confirm how a
write-off is booked and taxed.
