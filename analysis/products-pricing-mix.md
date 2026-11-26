# Products, pricing and mix: which lines to carry, what to charge, what the app should show (branch 3 of 4)

As of **Thursday 26 Nov 2026, 18:59 Manila**. I re-checked the live data at 19:45: 51 completed sales, 60 pieces,
₱19,800, ₱0 discounts, every sale line at its list price, all payments in cash, 81 stock movements, Batch 3 still on
the way. Nothing had changed.

Every number below comes from `analysis/products-pricing-mix.py`. Run `python3 analysis/products-pricing-mix.py`. It
takes about 12 seconds and needs only numpy and pandas. The script runs only the data block of `analysis/baseline.py`
and writes one new file, `analysis/products-pricing-mix_metrics.json`. Amounts are in pesos (₱). "Gross profit"
and "margin" mean after restocking fees (landed cost) unless a line says otherwise.

The other branches: stock and ordering (when and how much), cash and capital (money for the order, payouts), credit
and collections (Not paid yet sales). This branch covers which lines and flavours to carry, prices, discounts, the
product-mix figure the app shows, and the monthly profit review.

## Assumptions

| # | Assumption |
|---|---|
| A1 | Data: the read-only pull of 26 Nov 18:59 (the fact base's), re-checked at 19:45. "A month" means 30 days. |
| A2 | Landed margin of a piece = price − unit cost − its batch's restocking fees ÷ pieces received. For Batch 3 the pieces ordered are used (₱6.60 a piece). |
| A3 | A flavour's speed = pieces sold ÷ days it was on the shelf. Every flavour sold exactly 3, then sold out. Where an unbiased rate is needed, (pieces − 1) ÷ days is used. Rankings don't change. |
| A4 | Launch effect: "first 24 h left out" figures drop each batch's first day. The data cannot fully separate a line's appeal from the opening rush of Batch 1 or from novelty. |
| A5 | Price response: the shop has no estimate (two prices on two different lines). Published e-cigarette own-price elasticities run from −0.4 to −2.2 (sources in §11). A single shop's can be higher, so −3.0 is tested too. |
| A6 | When a buyer's flavour is out, 15% take another flavour and 85% leave (the stock branch's fit to Batches 1 and 2). |
| A7 | Holding cost, for the service-level test: 25% a year of landed cost, or 10% an order cycle while cash is short (the stock branch's two cases). |
| A8 | The profit bridge is per day: October = 27–31 Oct (5 days), November = 1–26 Nov to 18:59 (25.8 days). Tax is 0%, as set in the app. Expenses are as recorded; rent and pay are not recorded. |
| A9 | BLXCK Signature and the device have no sales. Their figures are projections at the two known lines' speeds. |
| A10 | Supplier cost risk: the Philippine excise on vapor products rises 5% every January (RA 11467). Whether the supplier passes it on is unknown, so a 5% cost rise is the test. |
| A11 | Privacy: buyers are pseudonymous numbers. Only counts are used. No search used the shop's name, the owner's name or any shop figure. |

## 1. Bottom line

**The product lever is which line fills the shelf. Price, discounts and flavour classes move little.**

- **Line.** Each XBLACK MAX flavour earned **₱88 of gross profit a day on the shelf**, against **₱50** for each
  Black TEO flavour (1.8×). Per batch it was ₱439 a day against ₱301, although Batch 2 made ₱985 more in total. The
  ₱20 price gap explains at most 6–31% of the speed gap. If half the rest is real line appeal, a shelf of the faster
  line is worth about **₱1.6k a month** (₱3.2k if all of it is). This is not proven: Batch 1 was the opening batch,
  and buyers rotate flavours.
- **Price.** At a 48% margin, 1% on price adds only **₱192 a month**: +2.2% of net profit, a quarter of the
  large-company benchmark (+8.7%). +₱10 a piece is worth −₱275 to +₱462 a month, depending on how buyers react. Being
  in stock is worth about 20 times more than 1% on price (stock branch: +₱3.7k–4.0k a month). Hold prices, but pass
  on cost rises: each 5% cost rise not passed on costs ₱479 a month.
- **Leakage.** None today: ₱0 discounts, every line at list price, all payments in cash. The ₱50 staff discount
  limit could cost ₱247–740 a month if it were used.
- **Design method 4.** Keep v2: ABC on value pace, for display only, with one pooled safety stock. Class-based service
  levels add only 1.2 to 4.0 pieces. Design v1's 44 spare pieces came from separate per-flavour pools (+20) and
  rounding each flavour up (+11.5). With 3 pieces a flavour, a flavour keeps its class into the next batch only
  63–64% of the time. So B and C must stay off the screen.
- **What the app should show.** One product-mix figure, "₱ a day per flavour on the shelf, by line", on the Restock
  card and in the batch report. Add a "What moved net profit" card to Profit & loss: a per-day MECE bridge whose lines
  add up exactly. Fix the Dashboard's best-seller sort and its margin label.

**Decisions needed:**

1. **Owner:** approve re-ordering XBLACK MAX's fastest flavours at ₱320 in Batch 4, next to BLXCK, as a clean test.
2. **Owner:** keep discounts at ₱0 and lower the staff limit to ₱20.
3. **Engineering:** build the line figure and the profit bridge with the planning engine.

## 2. Situation, complication, resolution

- **Situation.**
  - Four lines: XBLACK MAX ₱320, Black TEO ₱340, BLXCK Signature ₱340 and the XBLACK device ₱350.
  - So far each batch has been one line, 3 pieces a flavour. Every piece sold at list price, and every flavour sold
    out in 1.4 to 16.4 days.
  - Landed margin is 48.3% (₱159.45 a piece). Net profit is ₱8,827 in 31 days.
- **Complication.**
  1. Sales capped by supply make a Pareto by value meaningless: 16 of 20 flavours make 80%.
  2. The batch report leads with each batch's total profit, which favours the slower line. Batch 2 made +₱985 in
     total but 31% less gross profit per day on the shelf.
  3. Batch 3 adds a new line and 10 untested devices (₱2,066, 29% of the batch), and it doesn't re-order the fastest
     line.
  4. Design v1 tied ABC classes to service levels. That would have added 35 spare pieces (₱6.0k).
  5. Margins are high, so price changes move profit little.
- **Resolution.**
  - Judge and fund lines by "₱ a day per flavour on the shelf".
  - Carry every flavour of a line.
  - Test re-ordering the fastest line next to the new one.
  - Hold prices, but protect the peso margin when costs rise.
  - Keep v2's display-only ABC.
  - Run a per-day MECE profit bridge every month, in the app.

## 3. Issue tree (★ = prioritised)

Question: **which lines, flavours and prices earn the most gross profit per day of shelf and per peso of stock, and
what should the app work out so the owner can decide at each order and each month?** The branches are mutually
exclusive and collectively exhaustive for product decisions.

- **A. Which lines fill the shelf**
  - A1 ★ Shelf productivity by line: ₱ a day per flavour on the shelf (speed × margin a piece) (§5.3)
  - A2 ★ First run against re-order: line appeal or novelty? A test (§5.3, §5.4)
  - A3 ★ Items with no history: BLXCK (a new line), the device (a new kind of item) (§5.7)
- **B. Which flavours inside a line**
  - B1 Breadth: carry every flavour (§5.7)
  - B2 Depth by speed: small, about ₱0.5k a month (stock branch, not repeated here)
  - B3 ★ ABC classes and service levels: design method 4 (§5.1, §5.2)
- **C. What each piece earns**
  - C1 Price level and price leverage (§5.5)
  - C2 Price structure across lines (₱320 / ₱340 / ₱350) (§5.5)
  - C3 ★ Supplier cost changes and keeping the margin (§5.5)
- **D. How much of the price the shop keeps (pocket price)**
  - D1 Discounts and the staff limit (§5.6)
  - D2 Payment fees and voids (§5.6)
  - D3 Credit: 10.5% of sales not yet in hand. This belongs to the credit branch and is only shown here.
- **E. How the owner sees it**
  - E1 ★ The monthly profit review: a per-day MECE bridge (§5.8)
  - E2 ★ The one product-mix figure the app shows (§7)

*Pruned:*

- Multi-piece pricing and bundles: 8 of 51 sales had 2 or more pieces, and supply is the limit.
- Price endings.
- Flavour-level depth: the stock branch covers it.
- Credit terms: the credit branch covers them.
- Cash for orders: the cash branch covers it.

**Workplan.** One analyst, from the 26 Nov data, done in this file:

| Branch | Hypothesis | Analysis | Data |
|---|---|---|---|
| A | The line, not the flavour, carries the signal | Gross profit per shelf-day and per flavour-day by line; same-shelf comparison; price share of the gap | Stock timeline, sale lines, batch fees |
| B3 | Class-based z inflates stock without economic basis | Spare-stock split; critical ratio; class stability simulation | Design v2 pace replica |
| C | Price is a weak lever at this margin | 1% rule, break-even volume, elasticity cases, cost pass-through | Margins, published elasticities |
| D | No leakage today; the risk sits in the staff limit | Pocket price waterfall | Sales, payments, settings |
| E | A per-day bridge finds the branch that moved | Exact MECE bridge, Oct → Nov and Batch 1 → 2 | P&L lines, stock timeline |

## 4. Prioritising (impact × feasibility)

| Branch | ₱ at stake a month | Feasibility | Priority |
|---|---|---|---|
| A1/A2 Line choice | ₱0 to ₱3.2k (₱1.6k if half the gap is real) | Medium: needs the supplier to re-sell the line | **1** |
| E1 Monthly bridge | Diagnostic. On Oct → Nov it puts 53% of the drop on being out of stock | High | **2** |
| B3 ABC → service level | Avoids ₱6.0k of extra stock, once | High (v2 already does it) | **3** |
| C3 Cost pass-through | −₱479 for each 5% cost rise not passed on | High | **4** |
| A3 New-item sizing | ₱1.4k of pod gross profit a cycle tied up in 7 extra devices | High | **5** |
| B1 Breadth | Dropping the slowest 3 flavours loses 11–15% of a line's sales | High | 6 |
| C1/C2 Price level | +₱115 to +₱462 for +₱10 (−₱275 if buyers are very price-sensitive) | Medium | 7 |
| D1 Discounts | ₱0 now; ₱247–740 if the staff limit gets used | High | 8 |

## 5. Analysis

### 5.1 Pareto and ABC: six ways to rank the 20 flavours that sold

Share-ahead rule (design v2): a flavour is A when the products strictly ahead of it hold less than 80%, B when they
hold less than 95%, otherwise C. Equal values share a class.

| Ranking | Flavours for 80% | Top 4 share | Gini | A / B / C |
|---|---|---|---|---|
| Net sales value | 16 | 20.6% | 0.02 | 20 / 0 / 0 |
| Gross profit (landed) | 16 | 20.9% | 0.02 | 20 / 0 / 0 |
| Speed on the shelf (raw) | **12** | **44.7%** | 0.38 | 12 / 6 / 2 |
| Gross profit a day on the shelf | 12 | 43.8% | 0.37 | 12 / 6 / 2 |
| **Design v2: value pace = shrunk pace × price, ₱ a day** | 14 | 29.4% | 0.19 | **14 / 5 / 1** |
| Value pace with landed margin instead of price | 14 | 29.1% | 0.18 | 14 / 5 / 1 |

- **Fastest:** Mixed Berries sold its 3 in 1.4 days, Strawberry Ice 2.2, Gummy Bear 3.3, Mango 3.4 and Blackcurrant
  3.4. All five are XBLACK MAX. Red Pulp (Black TEO) is sixth at 3.5 days.
- **Slowest:** Sparkle Squeeze 16.4 days, Bacteria Monster 13.1 and Very More 13.1, all Black TEO.
- **Design v2's classes:**
  - A: all 10 XBLACK MAX flavours, plus Red Pulp, Yellow Summer, Ice Monkey and Trouble Purple
  - B: 5 more Black TEO flavours
  - C: Sparkle Squeeze
- **Agreement:** value pace and landed-margin pace rank alike (Spearman 0.993) and give the same class to all 20.
- **By line:** Black TEO earned 52.3% of the gross profit, XBLACK MAX 47.7%.

**So what:**

- Rank by speed on the shelf, never by pieces or pesos sold. Every flavour got 3 pieces, so sales show what was
  bought, not what buyers want.
- Ranking by price instead of margin changes nothing today. So costs can stay out of the shared engine, as the build
  review wants.
- After shrinkage the A class is almost exactly "XBLACK MAX". The useful signal is at the line level, not the flavour
  level.

### 5.2 Design method 4: ABC → service levels (v1) against one pooled safety stock (v2)

**Where v1's extra stock comes from.** Shop pace 2.05 a day, delivery 7 days (spread 1.75), lumpiness 1.033,
classes on value pace (A 14 / B 5 / C 1). Landed cost about ₱171 a pod.

| Spare stock built as | Pieces | Extra over v2 | Extra cash |
|---|---|---|---|
| One pool for the shop, z 1.645 (design v2) | 8.7 | — | — |
| One pool per class, same z 1.645 | 11.2 | +2.5 | ₱429 |
| One pool per class, z 1.96 / 1.645 / 1.28 | 12.4 | +3.7 | ₱637 |
| Per flavour, z 1.645, not rounded | 28.5 | +19.9 | ₱3,394 |
| Per flavour, z by class, not rounded | 32.5 | +23.8 | ₱4,072 |
| **Per flavour, z by class, each rounded up (design v1)** | **44.0** | **+35.3** | **₱6,039** |

Class z itself adds 1.2 pieces when classes are pooled, or 4.0 per flavour. Splitting the shop into per-flavour pools
adds 19.9. Rounding each flavour up adds 11.5.

**Is there an economic case for different service levels?** The newsvendor critical ratio is Cu ÷ (Cu + Co):

- Cu = margin lost on a missed sale = landed margin × 85% of buyers who leave.
- Co = cost of one extra piece held for a cycle.

| Line | Cu | Co, 25% a year | Ratio | z | Co, 10% a cycle | Ratio | z |
|---|---|---|---|---|---|---|---|
| XBLACK MAX | ₱129.2 | ₱2.1 | 98.4% | 2.15 | ₱16.8 | 88.5% | 1.20 |
| Black TEO | ₱141.8 | ₱2.1 | 98.5% | 2.17 | ₱17.3 | 89.1% | 1.23 |
| BLXCK Signature | ₱143.1 | ₱2.1 | 98.5% | 2.18 | ₱17.2 | 89.3% | 1.24 |
| Device | ₱121.9 | ₱2.5 | 98.0% | 2.04 | ₱20.7 | 85.5% | 1.06 |

The best service level depends on margin a piece against holding cost, not on how fast a product sells. Every pod line
has nearly the same margin, so they land within ±0.03 of each other. That range, 88% to 98%, contains v2's 95%.

**How stable are classes built on 3 pieces a flavour?** I simulated 10,000 pairs of batches with the same true demand.

| True spread | Ranked on | Class matches the truth | Same class next batch | "Top seller" shown (truth is not concentrated) |
|---|---|---|---|---|
| Each flavour's own speed (A = 12) | raw 3 ÷ days | 59.2% | 52.8% | 66.0% of batches |
| Each flavour's own speed | **app: shrunk to its line, k = 7** | 66.4% | **63.2%** | **0.0%** |
| Design-v2 shrunk speeds (A = 14) | raw 3 ÷ days | 59.6% | 49.9% | 16.6% |
| Design-v2 shrunk speeds | **app** | 70.3% | **64.2%** | **0.0%** |
| Own speeds, 6 pieces a flavour sold | app | 70.6% | 65.8% | 0.0% |
| Own speeds, 12 pieces a flavour sold | app | 74.8% | 68.7% | 0.0% |

**Verdict on method 4: adopt v2 as written. Do not bring back class-based service levels.**

1. **No economic basis.** Class z is immaterial (+1.2 pieces, about ₱200) and has no economic basis here.
2. **The real inflation.** v1's extra 35 pieces came from separate per-flavour pools and per-flavour rounding.
   v2's pooled spare stock removes both.
3. **Classes are noisy.** At this scale about 1 flavour in 3 changes class from one batch to the next, even after
   12 pieces. So B and C must never show, and classes must not drive anything that costs money. v2 uses them only for
   display and for the order of the shortfall copy; Fits your money uses pace order.
4. **The Top seller test works.** On this shop's data, v2's rule (shrunk ranking, shown only when A is half the
   products or fewer) never fired falsely in 20,000 simulated batches. Raw speeds would have shown a wrong "Top seller"
   in 17–66% of batches. Today it correctly shows nothing.

### 5.3 Contribution margin and shelf productivity by line

| | XBLACK MAX (Batch 1) | Black TEO (Batch 2) |
|---|---|---|
| Price / unit cost / fees a piece | ₱320 / ₱160 / ₱7.97 | ₱340 / ₱165 / ₱8.13 |
| Landed margin a piece | **₱152.03 (47.5%)** | **₱166.87 (49.1%)** |
| Pieces, gross profit | 30, ₱4,561 | 30, ₱5,006 |
| Days from arrival to the last sale | 10.39 | 16.64 |
| Pieces a day | 2.89 | 1.80 |
| **Gross profit a day on the shelf** | **₱439** | **₱301 (−31.5%)** |
| Flavour-days on the shelf | 51.5 | 100.8 |
| **Gross profit a day per flavour on the shelf** | **₱88.48** (₱87.82 recency-weighted) | **₱49.65** (₱50.12 weighted) |
| Pieces a day, first 24 h left out | 2.34 | 1.41 (−40%) |
| Gross profit a day, first 24 h left out | ₱356 | ₱235 |
| Average stock while selling | 8.5 pcs, ₱1,428 | 10.9 pcs, ₱1,884 |
| Gross profit per ₱1 of stock (GMROI): a cycle / a month | 3.19 / **9.2** | 2.66 / **4.8** |
| Net profit (batch statement) | ₱3,921 | ₱4,906 (+₱985) |
| Net profit a day on the shelf | ₱378 | ₱295 (−22%) |

Gross profit a day per flavour = Σ (pieces × landed margin) ÷ Σ days each flavour was on the shelf.

**With the same number of flavours on the shelf** (pieces per flavour-day; each sale counted at the shelf just before
it):

| Flavours of the line on the shelf | XBLACK MAX | Black TEO | Ratio |
|---|---|---|---|
| 7 to 10 | 0.654 (opening days) | 0.281 | 2.3× |
| 4 to 6 | 0.405 | 0.247 | 1.6× |
| 1 to 3 | 0.810 | 0.751 | 1.1× |

**Does the ₱20 price gap explain the speed gap?** Black TEO sold 40% slower once the first day is left out. For price
alone to explain that, buyers would need an elasticity of −8.4, far outside the published −0.4 to −2.2. At the
published values the price gap explains 6% (−0.4), 17.5% (−1.2), 23% (−1.6) or 31% (−2.2) of the gap.

**Batch 3's lines, not sold yet:**

| Line | Price | Landed cost | Margin a piece | On order |
|---|---|---|---|---|
| BLXCK Signature | ₱340 | ₱171.60 | ₱168.40 (49.5%), the best of all lines | 30 pcs, ₱5,148 |
| Device | ₱350 | ₱206.60 | ₱143.40 (41.0%), the lowest | 10 pcs, ₱2,066 (28.6% of the batch) |

At Black TEO's pace BLXCK would earn ₱304 a day. At XBLACK MAX's it would earn ₱486.

**So what:**

- **Two yardsticks.** A batch's total profit rewards a slow line that sells longer at a higher price. Gross profit a
  day on the shelf, and per peso of stock, show what the shelf and the cash really earn. Those are the shop's two
  limits.
- **Keep the faster line in play.** XBLACK MAX earned 1.8× more per flavour on the shelf, 1.6× even with the same
  number of flavours on the shelf, and price explains less than a third of it. But it was the opening batch. Re-order
  it next to a new line before concluding.
- **Lever size.** (₱356 − ₱235) × 26.2 in-stock days a month = **₱3.2k a month** if all of the gap is real, ₱1.6k if
  half is.

### 5.4 Buyers rotate flavours and follow the shop (counts only)

- **Repeat buyers:** 31 buyers; 11 bought on 2 or more sales.
- **They follow the shop:** 9 of those 11 bought both XBLACK MAX and, later, Black TEO.
- **They rotate flavours:** of 20 repeat purchases, 18 (90%) took a flavour the buyer had not bought before. Inside
  a line the buyer already knew it was 9 new against 2 the same (82% new). 9 purchases were the buyer's first piece of
  a new line.
- **Multi-piece sales:** 8 sales had 2 or more pieces, and all 8 mixed flavours.

**So what:** buyers are loyal to the shop, not to a line or a flavour, and they work through the flavours.

- **Breadth matters:** a shelf with every flavour gives each buyer something new.
- **Flavour favourites matter less** than flavour speed suggests, which agrees with the stock branch's small value
  for depth (₱0.5k a month).
- **The re-order could be slower:** a re-ordered line offers fewer flavours that are new to its buyers, so it may sell
  slower than its first run. The line test (§6, recommendation 1) must compare the re-order with the new line on the
  shelf at the same time, not with Batch 1.

### 5.5 Price leverage, break-even volume and cost changes

| Measure | Value | Formula |
|---|---|---|
| Average price, landed cost, margin | ₱330, ₱170.55, **₱159.45 (48.3%)** | net ÷ pieces |
| Gross profit a month | ₱9,258 | 58.1 pieces × ₱159.45 |
| **1% on price, volume held** | **+₱192 a month = +2.1% of gross profit** | 1% × ₱330 × 58.1 |
| 1% more pieces | +₱93 a month | 0.58 × ₱159.45 |
| 1% on price against recorded net profit (₱8,542 a month) | +2.2% | the toolkit's large-company benchmark is +8.7% at an 11.5% margin; Marn and Rosiello found +11.1% |
| Same, with unrecorded rent and pay of ₱3k / ₱6k / ₱8k a month | +3.5% / +7.5% / +35% | 1% of sales ÷ operating profit |

**Break-even volume:** how much volume can change before gross profit drops. The formula is −c ÷ (m + c), with m the
margin share and c the price change as a share.

| Price change | ₱340 line (m 49.1%) | ₱320 line (m 47.5%) |
|---|---|---|
| +₱10 | may lose 5.7% | may lose 6.2% |
| +₱20 | may lose 10.7% | may lose 11.6% |
| −₱10 | needs +6.4% | needs +7.0% |
| −₱20 | needs +13.6% | needs +15.1% |
| **−₱50 (the staff limit)** | **needs +42.8%** | needs +49.0% |

**+₱10 on the ₱340 pods, at published elasticities:**

| Elasticity | −0.4 | −1.2 | −1.6 | −2.2 | −3.0 (a single shop, tested) |
|---|---|---|---|---|---|
| Pieces | −1.2% | −3.4% | −4.5% | −6.2% | −8.3% |
| Gross profit | +4.8% | +2.4% | +1.2% | −0.6% | −2.8% |
| ₱ a month | **+₱462** | +₱230 | +₱115 | −₱54 | **−₱275** |

**Cost pass-through.** If the supplier's cost rises 5% (₱165 → ₱173.25), the margin falls from ₱168.40 to ₱160.15 a
piece. That is **−₱479 a month** at today's volume.

- To keep the peso margin, the price goes to ₱348.25 (₱350).
- To keep the margin %, it goes to ₱356.35 (₱355).
- Context: the excise on nicotine-salt vapor products went from ₱57.33 to ₱60.20 a mL in January 2026, and RA 11467
  adds 5% every year.

**So what:**

- **Price is a weak lever here** because margins are high. It is about one twentieth of being in stock (stock branch
  +₱3.7k–4.0k a month).
- **A +₱10 rise has an uncertain sign** (−₱275 to +₱462 a month). Don't change prices now.
- **Pass on cost rises.** The one price rule worth automating is to pass on cost rises at least peso for peso.
- **One change at a time.** Keep XBLACK MAX at ₱320 while its re-order is tested, so line and price aren't mixed up.

### 5.6 Pocket price waterfall and discounts (an average piece)

| Step | ₱ a piece |
|---|---|
| List price | 330.00 |
| − discounts | 0.00 (₱0 on 51 sales; every line at list price) |
| − payment fees | 0.00 (all 50 payments in cash) |
| − written off | 0.00 |
| **= pocket price (earned)** | **330.00** |
| − still owed, not in hand yet | −34.67 (10.5%; the credit branch covers it) |
| = cash in hand so far | 295.33 |
| − landed cost (goods + restocking fees) | −170.55 |
| − expenses | −12.33 (₱740 ÷ 60) |
| **= net profit a piece** | **147.12** |

**The risk is the staff limit.** It is ₱50 a sale, 15% of a ₱340 piece and 30% of its margin. Staff giving it on 10%
of sales would cost ₱247 a month (2.7% of gross profit). On 30% of sales it would cost ₱740 (8.0%). A ₱50 discount
pays for itself only with 43% more sales, and a shop that sells out can't get them.

**So what:** there is no leakage to fix today. Keep it that way with an owner policy: discounts stay ₱0, and the staff
limit drops to ₱20. The monthly bridge's Discounts line will show any change. The only big gap between list and cash
is credit, handled by the credit branch.

### 5.7 New lines, new flavours and the device: how big should a first order be?

- **Pod flavour speed on the shelf** (unbiased): slowest 0.12 a day, median 0.27, fastest 1.42.
- **What one 18-day order cycle sells:** 2.2 pieces at the slowest speed, 4.8 at the median.
- **The device:** 10 devices last **82 days** at the slowest pod flavour's speed, 37 days at the median. They hold
  ₱2,066, 29% of Batch 3's cost. The 7 beyond a 3-piece test hold ₱1,446. That is 8.4 pods, or **₱1,419 of pod gross
  profit each cycle** if those pods sell.
- **Breadth:** the slowest 3 of 10 flavours hold 12.7% of XBLACK MAX's speed and 18.0% of Black TEO's. Dropping them
  would lose about 11% and 15% of the line's sales, because 85% of their buyers leave.

**So what: size first orders like this**

- **A new line:** order every flavour, the same number of each. Size the total from the shop's pace (Restock's
  Suggested order), not from a guess. Buyers rotate flavours, so breadth sells.
- **A new flavour in a known line:** order what its line's median flavour gets. The engine's shrinkage leans on the
  category during its first week.
- **A new kind of item** (like the device): start at about one cycle's sales at the slowest flavour's speed, so 2 to 3
  pieces, or the supplier's minimum. Re-order once about half have sold. The 10 devices are already paid, so this
  rule applies from the next new item.
- **Dropping a flavour:** only when Restock lists it as Not selling (nothing today).

### 5.8 The monthly profit review: a MECE tree as a per-day bridge

The tree, with no overlaps and no gaps:

- **Net profit a day** = pieces a day × profit a piece − expenses a day − tax a day + count differences a day
  - **1 Pieces a day** = share of days with stock × flavours on the shelf × sales per flavour a day
  - **2 Price a piece** = list price (the mix of lines) − discounts a piece
  - **3 Cost a piece** = unit cost + restocking fees a piece
  - **4 Expenses, tax and counts**

Each effect is worked out in turn, and the effects add up exactly. Lines 1a–1c value the change in pieces at last
month's profit a piece. Lines 2–3 value the change in price and cost at this month's pieces.

**October (27–31) → November (1–26), a day.**

| | October | November |
|---|---|---|
| Days, of which with stock | 5.00, 4.61 | 25.79, 22.41 |
| Flavours on the shelf while open | 7.93 | 5.17 |
| Pieces a day per flavour on the shelf | 0.656 | 0.311 |
| **Net profit a day** | **₱730** | **₱201** |

| Effect | ₱ a day | Per 30 days | Share of the change |
|---|---|---|---|
| 1a Days with stock | −42.66 | −₱1,280 | 8.1% |
| 1b Flavours on the shelf | **−239.38** | −₱7,181 | **45.3%** |
| 1c Sales per flavour on the shelf | **−235.51** | −₱7,065 | **44.5%** |
| 2a Price and mix | +23.26 | +₱698 | −4.4% |
| 2b Discounts | 0.00 | ₱0 | 0% |
| 3a Cost a piece (goods) | −5.82 | −₱174 | 1.1% |
| 3b Restocking fees a piece | −0.19 | −₱6 | 0.0% |
| 4a Expenses | −28.69 | −₱861 | 5.4% |
| 4b Tax, 4c count differences | 0.00 | ₱0 | 0% |
| **= Change in net profit** | **−528.98** | **−₱15,870** | 100% |

**Batch 1 → Batch 2, totals.**

| Effect | ₱ |
|---|---|
| Pieces | 0 |
| Price and mix | +600 |
| Cost a piece | −150 |
| Restocking fees | −5 |
| Expenses charged | +540 |
| **= Change in net profit** | **+985** (₱3,921 → ₱4,906) |

Per day on the shelf the picture reverses: net profit fell from ₱378 to ₱295 a day (−22%).

**So what:**

- **The bridge points to the right lever.** Being in stock (1a + 1b) is **53% of November's drop**, ₱282 a day. Sales
  per flavour is 45%, mostly October's opening rush. Price, discounts and cost hardly moved.
- **Per day is the right base.** Totals mislead when months or batches differ in length.
- **Build it.** The owner can't do this on a phone by hand. The app should work it out and show it (§7.3).

## 6. Recommendations (ranked by ₱ impact × feasibility)

| # | Recommendation | ₱ impact (math) | Feasibility | App change | Build now? | Owner | Timing | First step | KPI |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Test re-ordering the fastest proven line**: in Batch 4, re-order XBLACK MAX's fastest flavours at ₱320 (the engine already leans to them), on the shelf next to BLXCK | ₱0 to +₱3.2k a month: (₱356 − ₱235) × 26.2 in-stock days; ₱1.6k if half is real. Downside small: every piece so far sold within 16.4 days | Medium (supplier must still sell it) | None for the test; rec 2 measures it | No: owner action | Owner | Batch 4 order (order-by about 5–6 Dec) | Ask the supplier whether XBLACK MAX is still available at ₱160 | ₱ a day per flavour on the shelf, re-ordered XBLACK MAX against BLXCK over the same days |
| 2 | **Show one mix figure: "₱ a day per flavour on the shelf, by line"** | Steers every line choice (rec 1 is worth up to ₱3.2k a month); avoids the total-profit trap (Batch 2 +₱985 in total, −31% a day) | High | `restock_plan.mix.lines[]`; a Product mix sentence on Restock's "Worked out from your history"; a batch report tile (§7.2) | **Yes** | Engineering | With the engine (D17, C15) | Add the per-category sum to restock_plan | Share of each order's cost in the best-earning line |
| 3 | **Monthly "What moved net profit" bridge** on Finance → Profit & loss | Diagnostic: on Oct → Nov it puts 53% of a ₱529-a-day drop (₱8.5k per 30 days) on being out of stock | High | New `profit_bridge(p_from, p_to)` + a card reusing `CashBridge` (§7.3) | **Yes** | Engineering, then owner and manager monthly | With the Planning tab (E20) | Write the function and its two tests | Review done in the month's first week; the biggest minus has one action |
| 4 | **Adopt v2's method 4 as is**: ABC for display and order priority only, one pooled z, B and C never shown | Avoids ₱6.0k of extra spare stock (v1) and wrong "Top seller" labels in 17–66% of batches | High | None beyond v2 (§7.1) | **Yes** (already in v2) | Engineering | With the engine | Keep the ABC tests (v2 test 13) | Spare stock in the plan stays the pooled figure (8.7 pcs today); no Top seller shown while sales are spread |
| 5 | **Pass supplier cost rises on to the price, at least peso for peso** | −₱479 a month for each 5% cost rise not passed on; ₱165 → ₱173 means ₱340 → ₱350 | High | Cost-change margin check on Order stock / Arrived (map #83) | Next, before the first January order | Owner; engineering | First order of 2027 | Ask the supplier if January prices change | Landed margin a pod ≥ ₱159 |
| 6 | **Size new kinds of item small** (about 3); don't re-order devices until about half have sold | ₱1,419 of pod gross profit a cycle tied up in 7 extra devices | High | None (v2 "New": no suggestion); Help text | No | Owner | From the next new item | Find out why 10 devices were ordered (supplier minimum?) | Days to sell the first 3 devices |
| 7 | **Carry every flavour of a line**; drop only Not selling ones | Dropping the slowest 3 loses 11–15% of a line's sales | High | SOP 13 wording (§7.6) | Yes (text) | Owner | Now | Change the "stop reordering the slowest" step | Flavours on the shelf while open (bridge 1b), at least 7 |
| 8 | **Hold list prices now; test +₱10 later on one line**, with another line on the shelf, after 2 cycles fully in stock | +₱115 to +₱462 a month (−₱275 if buyers are very price-sensitive) | Medium | None (the bridge's Price and mix line and rec 2 measure it) | No | Owner | After Batch 5 | Pick the test line and batch | ₱ a day per flavour of the test line against the other |
| 9 | **Keep discounts at ₱0; lower the staff limit to ₱20** | Avoids ₱247–740 a month of risk; a ₱50 discount needs +43% sales | High | None now; Settings hint later (map #52/#73) | No | Owner | This week | Settings → Staff discount limit | Discounts ÷ gross sales (now 0%) |
| 10 | **Dashboard: sort Best sellers by speed; label margins "before restocking fees"** | No direct ₱; avoids misreading once flavours get different numbers of pieces (the Dashboard shows ₱167.50 a piece, Finance ₱159.45) | High | dashboard/page.tsx:241 sort, captions (map #42/#43) | **Yes** (tiny) | Engineering | With the engine | Change one sort and two labels | — |

*What I would not build now:*

- class-based service levels
- a price-suggestion engine (map #47), until there is a price test
- a markdown engine for old stock (map #88): Not selling covers it, and ₱0 is tied up
- bundle pricing
- per-flavour scorecards: a flavour keeps its class only about 2 times in 3
- a "typical batch" benchmark (map #92), until there are 4 batches

## 7. What the app should calculate and show (ties to the design sections and map items)

### 7.1 Method 4 (Product mix, ABC): keep v2

No change to v2's method 4:

- ranked products = in plan and stocked
- value pace = round(pace × price) pesos a day
- class from the share strictly ahead
- Top seller only when A is half the ranked products or fewer
- classes never set z; B and C never on screen

Add these as notes, so nobody "improves" it later:

1. Per-class z is rejected: it adds 1.2–4.0 pieces with no economic basis, because the critical ratio follows margin a
   piece, which is about the same for every pod line.
2. Value pace and landed-margin pace give identical classes. That is why costs stay out of `plan_core`.
3. With 3 pieces a flavour, about 1 flavour in 3 changes class each batch. So nothing that costs money may depend on
   the class.

### 7.2 The one mix figure: ₱ a day per flavour on the shelf, by line

**In `restock_plan` (manager only; costs may be joined here, never in `plan_core`):**

```
mix: { ranked, top_count, concentrated, new,
       lines: [{ category_id, name, flavours, shelf_days, sold_90, gp_day_per_flavour_cents }],
       best_category_id }
```

- `gp_day_per_flavour_cents` = Σᵢ wsoldᵢ × marginᵢ ÷ Σᵢ exposureᵢ, over the category's active products with
  exposure > 0. The marginᵢ term is price − cost − the average fee a piece (`money.fees.avg_cents ÷
  money.fees.avg_pcs`).
- `shelf_days` is the raw sum of its flavours' days on the shelf. A line is listed once the line itself has had stock
  (any of its products above 0) for at least 7 days.
- `best_category_id` is set only when 2 or more lines are listed.
- **Live:** TRANSPARENT V2 PODS (XBLACK MAX) ₱87.82; Black TEO ₱50.12. BLXCK and the device appear once they've had a
  week on the shelf.

**Restock → "Worked out from your history" → Product mix**, added after v2's spread / concentrated sentence:

> "Per flavour on the shelf, XBLACK MAX earned about ₱88 a day and Black TEO about ₱50. Lean the next order toward
> the line that earns most, next to any new line you're trying."

Source line: "Gross profit of each line's sales ÷ the days its flavours were on the shelf, since 27 Oct. Recent weeks
count most. A line shows once its flavours have had a week on the shelf."

**Batch report** (`lib/batch-report.ts`, `report/page.tsx`, beside the C15 change):

- **Tile:** "Gross profit a day on the shelf". Value ₱301; compared figure "Batch 1 ₱439 (−31%)"; meta "₱50 a day per
  flavour (Batch 1 ₱88)".
- **Working:** gross profit = net − goods − fees from the batch statement. Days = from arrival to the last sale, the
  report's existing pace base. Flavour-days = Σ of each flavour's days on the shelf, from the report's flavour
  sell-out days, or to today while it is still selling.
- **What to do next:** when the compared batch earned more a day, add "Batch {n} earned more a day on the shelf
  (₱{x} against ₱{y}). Consider re-ordering its fastest flavours next to your new line."

### 7.3 "What moved net profit": the monthly bridge

**New SQL** (migration with the Planning tab; `security definer`, `stable`, `set search_path = ''`; owner and manager
via `is_manager()`, else 42501):

```
public.profit_bridge(p_from date, p_to date) returns jsonb
{ this:   { from, to, days, open_days, flavour_days, pieces, gross_cents, discount_cents, net_cents,
            goods_cents, fee_cents, opex_cents, tax_cents, diffs_cents, net_profit_cents },
  before: { …the same for the previous period… },
  per_day: { this_cents, before_cents },
  effects: [{ key, cents_per_day }],   -- keys in this order: days_with_stock, flavours, per_flavour, price_mix,
                                       -- discounts, goods_cost, fees, expenses, tax, count_diffs
  biggest: key }                       -- the most negative effect
```

**What feeds it:**

- **The previous period** is the calendar month before when the range is a whole month. Otherwise it is the same
  number of days just before.
- **days** = calendar days from the later of the range start and the shop's first day (`finance_report`'s
  `first_day`) to the earlier of the range end and now(). The current month counts in fractional days. Without this,
  picking October would divide its 5 open days by 31.
- **open_days and flavour_days** come from the running sum of `stock_movements.delta` (as in `plan_core`). They are
  the time with at least one product above 0, and the Σ over products of their time above 0.
- **Pieces, gross, discounts and net** = completed sales by `business_date`.
- **goods_cents and fee_cents** are the unit cost and fee-share split of the same `batch_matches()` rows that
  `finance_totals` uses for COGS.
- **Expenses, tax and count differences** are taken as in `finance_totals`.

**Effects** (as in `products-pricing-mix.py` §10), with o = open share, f = flavours on the shelf while open,
q = pieces per flavour-day, m = profit a piece, Q = pieces a day:

| Key | Effect |
|---|---|
| days_with_stock | (o₂ − o₁) f₁ q₁ m₁ |
| flavours | o₂ (f₂ − f₁) q₁ m₁ |
| per_flavour | o₂ f₂ (q₂ − q₁) m₁ |
| price_mix | Q₂ Δ(gross ÷ pieces) |
| discounts | −Q₂ Δ(discount ÷ pieces) |
| goods_cost | −Q₂ Δ(goods ÷ pieces) |
| fees | −Q₂ Δ(fees ÷ pieces) |
| expenses, tax, count_diffs | − Δ per day for expenses and tax, + Δ per day for count differences |

When the previous period has no pieces, return `effects: null` ("Nothing sold in {month} to compare with").

**Tests in `pos_test.sql`:**

1. Σ effects = this.per_day − before.per_day, within 1 centavo.
2. this.net_profit_cents = finance_report(p_from, p_to) end − start net profit.
3. A cashier gets 42501.
4. A month with a stock-out shows a negative days_with_stock.

**Card on Finance → Profit & loss** (when a month is picked, not Since opening), under the statement:

- **Title:** "What moved net profit". Head: "₱201 a day (October ₱730)".
- **Chart:** `CashBridge` with these steps:
  - total = last month a day
  - each non-zero effect as in / out (|x| ≥ ₱1 a day), with short labels: Days with stock, Flavours on shelf, Sales
    per flavour, Price & mix, Discounts, Cost a piece, Fees a piece, Expenses, Tax, Counts
  - total = this month a day
- **List under the chart:** one Line row each, for example "−₱239 a day · Flavours on the shelf: 5.2 on average
  (October 7.9)".
- **Biggest minus:** "Biggest change: {label}. {action}". Actions:

  | Biggest minus | Action |
  |---|---|
  | Days with stock | "Order earlier: Restock → Order by." |
  | Flavours on the shelf | "Keep every flavour in stock: order before flavours run out, and order every flavour of a new line." |
  | Sales per flavour | "Each flavour sold slower: compare lines on Restock (Product mix) and lean the next order toward the one that earns most." |
  | Price and mix | "A cheaper line sold more, or a price went down: check prices in Inventory." |
  | Discounts | "Check discounts on Daily sales and the staff limit in Settings." |
  | Cost a piece | "The supplier's price went up: raise the price by at least the increase." |
  | Fees a piece | "Restocking fees a piece went up: fewer, bigger orders spread them." |
  | Expenses | "Check each expense type (Restock → Expenses)." |
  | Tax | "Your tax rate changed (Finance settings)." |
  | Count differences | "Pieces went missing: count the shelf (SOP 5)." |

- **Footer:** "Per day, so months of different lengths compare. The lines add up to the change exactly. How to use it:
  Help → Planning."
- **Partial month:** when the previous month had fewer than 28 days open: "{Month} had {n} days open."

### 7.4 Dashboard (map #42, #43)

- **Sort:** `dashboard/page.tsx:241` sorts Best sellers by `perDay`, then pieces, with the caption "fastest on the
  shelf".
- **Labels:** the profit-per-piece tile and the Margin column say "before restocking fees" (the RPC uses
  `sale_items.unit_cost_cents`). It shows ₱167.50 a piece against Finance's landed ₱159.45, 50.8% against 48.3%.
- **Later list:** moving the Dashboard to landed cost and to `plan_core`'s pace.

### 7.5 Later (add to the HISTORY open items)

- **Cost-change margin check (map #83), before the first January 2027 order.** When Order stock or Arrived changes a
  cost, show the old and new landed margin, flag a cost at or above the price, and offer "price that keeps your ₱
  margin: ₱{price + Δcost}".
- **Settings hint for the staff discount limit (map #52, #73):** "Discounts so far: ₱0 on {n} sales. A ₱50 discount on
  a ₱340 piece needs 43% more sales to pay for itself."
- **Starting-order hint for a new line** (map #84): "the same number of each flavour; total from Suggested order".
- **Add-product price hint** (map #47): only after a price test.

### 7.6 Help text changes (lib/help.ts and the SOP doc together)

- **SOP 13 step 3** becomes: "Look at Best sellers (fastest on the shelf) and Slowest movers. A flavour that sold out
  slowly still earns its place in its line, because buyers like to try every flavour. Stop reordering only what
  Restock lists as Not selling."
- **SOP 3 (Order)** gets a new hint: "A new line: order every flavour, the same number of each. A new kind of item: start
  with about 3."
- **docs/finance-guide.md, Monthly routine step 2** becomes: "Profit & loss → What moved net profit: find the biggest
  minus and agree one action." Then update the Finance guide doc.
- **PLAN_WORDS** gets two new words:
  - "Earns a day on the shelf: gross profit a flavour makes for each day it is on the shelf; the line figure on
    Restock."
  - "What moved net profit: the monthly bridge on Profit & loss; its lines add up to the change in net profit a day."

## 8. Help → Planning page: the methods from this branch

Honest framing: two of these come from McKinsey consultants: the pocket price waterfall and the 1% price rule
(Marn and Rosiello, 1992). MECE was made standard at McKinsey by Barbara Minto. The rest are standard retail,
statistics and accounting methods, which no firm owns. What makes them the shop's own is that every number comes from
its sales.

1. **Top sellers: the 80/20 rule and ABC, by speed** (supersedes item 5 of the stock branch's list)
   - *Where it comes from:*
     - Vilfredo Pareto's observation on incomes (1896).
     - Joseph Juran named the "vital few" idea after Pareto; his own account is from 1974.
     - ABC inventory analysis comes from H. F. Dickie of General Electric, "ABC Inventory Analysis Shoots for Dollars,
       Not Pennies" (1951).
   - *In this shop:*
     - Rank by sales a day on the shelf × price, not by pieces: every flavour got 3, so by pesos 16 of 20 "make 80%".
     - By speed, 12 of 20 make 80%, and the 4 fastest (all XBLACK MAX) make 45%.
     - After the app's smoothing 14 of 20 are A, so no Top seller shows yet.
     - With 3 pieces a flavour a flavour's group repeats only about 2 times in 3, so the app shows only Top seller, and
       only when a few clearly lead.
   - *How to use it (Restock):*
     1. Open Restock → Worked out from your history → Product mix.
     2. If it says "N of your M products make 80% of sales", those rows show Top seller.
     3. Never let a Top seller run out: order on or before Order by.
     4. When money is short, pick Fits your money: it orders the fastest first.
     5. If it says sales are spread, don't pick favourites: order every flavour.
2. **Which line earns most from the shelf (shelf productivity, GMROI, moving money to the winners)**
   - *Where it comes from:*
     - Gross margin return on inventory (GMROI) and sales per unit of shelf space are standard retail merchandising
       measures.
     - "Profit per unit of what limits you" is from Eliyahu Goldratt's Theory of Constraints (*The Goal*, 1984).
     - The habit of moving money each cycle to what earns most is McKinsey's resource-reallocation research (Hall,
       Lovallo and Musters, *McKinsey Quarterly*, March 2012).
   - *In this shop:*
     - Each XBLACK MAX flavour earned ₱88 a day on the shelf, each Black TEO flavour ₱50. Per batch it was ₱439
       against ₱301 a day, although Batch 2 made ₱985 more in total.
     - Each peso of XBLACK MAX stock earned ₱9.2 of gross profit a month, Black TEO's ₱4.8.
     - The shop is limited by shelf days and cash, so per day is the yardstick.
   - *How to use it (Restock card; Sales → Finance → Report):*
     1. Before each order, read Product mix: which line earns most a day per flavour.
     2. Lean the order toward it, and keep one new or test line next to it.
     3. After each batch, open Report and compare "Gross profit a day on the shelf", not just net profit.
     4. Each month, move a bit more of the order to the line that keeps earning most.
3. **Push, keep, fix or drop (menu engineering: speed × profit a piece)**
   - *Where it comes from:* the menu engineering matrix of Kasavana and Smith (Michigan State University, 1982). It
     sorts items into Stars, Plowhorses, Puzzles and Dogs.
   - *In this shop:*
     - Fast with a lower margin: XBLACK MAX, ₱152 a piece. Push it and re-order it.
     - Slower with a higher margin: Black TEO, ₱167. Keep it, with all its flavours, but don't over-buy.
     - New: BLXCK, ₱168, the best margin. Test it with every flavour.
     - No history and the lowest margin: the device, ₱143 (41%). Start small.
     - Drop only Not selling items; there are none today.
   - *How to use it (monthly; Report, product pages, Restock):*
     1. For each line, note its speed (Report) and profit a piece (product page).
     2. Fast and high margin: push. Fast and low margin: keep, and watch the price. Slow and high margin: keep, but
        order less. Slow and low margin: fix the price or order size, or drop it.
     3. For flavours, drop only Not selling ones. A slow flavour still brings buyers who try every flavour.
4. **Price: the 1% rule and the pocket price waterfall**
   - *Where it comes from:*
     - Michael Marn and Robert Rosiello of McKinsey, "Managing Price, Gaining Profit", *Harvard Business Review*,
       1992. In 2,463 companies, 1% on price raised operating profit 11.1%.
     - The waterfall itself: "The power of pricing", *McKinsey Quarterly*, 2003.
   - *In this shop:*
     - The margin is 48%, so 1% on price adds only ₱192 a month (2.1% of gross profit). +₱10 adds −₱275 to +₱462 a
       month, depending on how buyers react. Being in stock is worth far more.
     - The waterfall: list ₱330 → discounts ₱0 → payment fees ₱0 → ₱330 earned → ₱295 collected so far.
     - A ₱50 discount on a ₱340 piece needs 43% more sales to pay for itself.
   - *How to use it (Profit & loss, product page, Settings):*
     1. Monthly: Discounts on Profit & loss should be ₱0 or small.
     2. When the supplier's cost changes, raise the price on the product page by at least the increase. For example,
        ₱165 → ₱173 means ₱340 → ₱350.
     3. Don't cut prices to sell faster while the shelf sells out anyway.
     4. Test a price on one line, with another line on the shelf, for one batch. Compare their ₱ a day per flavour.
5. **Sizing a new flavour or line (borrow from what you know, then learn)**
   - *Where it comes from:* shrinkage estimation in statistics (James and Stein, 1961; Efron and Morris, 1975). A thin
     history leans on its group. Retail test-and-learn practice is the same idea.
   - *In this shop:*
     - A new line gets every flavour, the same number each, sized from the shop's pace.
     - A new kind of item starts at about 3. At the slowest flavour's speed, 10 devices last about 82 days and hold
       ₱2,066 (29% of Batch 3).
     - The app shows it as New until it is on the shelf, then leans on its category for the first week.
   - *How to use it (Inventory → Add product; Restock → Order stock; Restock → New):*
     1. Add every flavour (SOP 2).
     2. Order the same number of each; a new kind of item starts at about 3 (SOP 3).
     3. Tap Arrived the day it comes.
     4. After a week on the shelf, read its pace on Restock.
     5. Re-order what sold; don't re-order what Restock lists as Not selling.
6. **The monthly profit review: a profit tree with no gaps or overlaps (MECE) and a bridge**
   - *Where it comes from:*
     - MECE: Barbara Minto at McKinsey (*The Pyramid Principle*).
     - Profit and driver trees are the core of consulting problem solving (*Bulletproof Problem Solving*, Conn and
       McLean, 2018).
     - The price, volume and mix bridge is standard management-accounting variance analysis.
   - *In this shop:*
     - Net profit a day = pieces a day × profit a piece − expenses a day − tax.
     - Pieces a day = days with stock × flavours on the shelf × sales per flavour.
     - October → November: ₱730 → ₱201 a day. Days with stock −₱43, flavours on the shelf −₱239, sales per flavour
       −₱236 (the opening rush), price and mix +₱23, cost a piece −₱6, expenses −₱29.
     - Being in stock is 53% of the drop.
   - *How to use it (Finance → Profit & loss → pick last month → What moved net profit):*
     1. In the month's first week, owner and manager open Profit & loss and pick last month.
     2. Read What moved net profit. The lines add up to the change exactly.
     3. Take the biggest minus. The card names its action.
     4. Check that discounts and cost a piece aren't creeping up.
     5. Agree one action and one number to watch next month (SOP 13).

## 9. Risks, and what would prove this wrong

- **The line gap is the opening rush or novelty, not the line.**
  - *Evidence it may be:* 82% of repeat buys inside a known line took a new flavour.
  - *Test:* in Batch 4, compare re-ordered XBLACK MAX with BLXCK over the same days.
  - *What changes the answer:* if XBLACK MAX earns no more a day per flavour, the shop runs on rotation. Then it
    should keep bringing new lines and treat each as a one- or two-batch product.
- **Buyers are more price-sensitive than published estimates.**
  - *Effect:* +₱10 loses ₱275 a month at −3.0.
  - *Mitigation:* test on one line with a control line, for one batch, and switch back if pieces fall more than 6%.
- **The supplier can't supply XBLACK MAX, or changes its cost.**
  - *Effect:* the line test waits.
  - *Mitigation:* the line figure still ranks whichever lines are available.
- **The January excise rise is passed on.** Margins fall ₱8 a piece unless prices follow, so build the margin check
  (map #83) before then.
- **The device may be a platform.** If XBLACK MAX pods fit the XBLACK device, each device sold creates a pod buyer,
  and devices and those pods belong in the same order. Ask before the next device order.
- **Small samples.**
  - *The limit:* two lines with sales, 20 flavours × 3 pieces. Each line figure could be off by 30–50%, and classes
    repeat only 2 times in 3.
  - *Mitigation:* shrinkage, the "rough" label, and no money decisions on flavour classes.
- **Flavour names and the law.**
  - *The rule:* RA 11900 bans marketing flavour descriptors that unduly appeal to minors (Sec. 12(j), as reported).
  - *Mitigation:* have a lawyer check the shop's flavour names once. A forced drop would remove that flavour's share
    of its line.
- **The bridge is misread in a partial month.** Mitigation: per-day figures, and the card says how many days the
  month before was open.

## 10. Next 30 / 60 / 90 days

- **By 26 Dec**
  1. Tap Arrived on Batch 3 (due about 2 Dec).
  2. Place Batch 4 by the order-by day (about 5–6 Dec), following the engine's suggestion. It leans to XBLACK MAX: keep
     it at ₱320.
  3. Owner: set the staff discount limit to ₱20. Ask the supplier three questions: is XBLACK MAX still available, do
     its pods fit the device, will January prices change?
  4. Engineering: ship the engine with the line figure (rec 2), the Dashboard fixes (rec 10) and the Help changes.
     Then ship `profit_bridge` and its card (rec 3).
  5. First monthly review in early December (November against October): use the card, or the Planning checklist until
     the card ships.
- **By 25 Jan**
  1. Read the line figure: re-ordered XBLACK MAX against BLXCK, over the same days.
  2. Decide: "re-order winners" or "rotate lines".
  3. Build the cost-change margin check before the first January order. Pass any cost rise on, peso for peso.
  4. Second monthly review (December against November).
- **By 24 Feb**
  1. With 4–6 batches, give most of each order to the line that keeps earning most a day per flavour.
  2. If the shop stayed in stock for 2 cycles, run the +₱10 test on one line.
  3. Third monthly review. Refresh the Planning page's examples from the shop's newest numbers.

## 11. Open questions, data gaps and sources

**Open questions**

1. Was XBLACK MAX dropped on purpose (supplier, quality or price)? Can it be re-ordered at ₱160?
2. Do XBLACK MAX pods fit the XBLACK Transparent Device V5? If so, devices create pod buyers.
3. Why 10 devices: a supplier minimum, or a buyer request? What do nearby shops charge for it?
4. Will the supplier sell more than 3 pieces a flavour, or fewer flavours with more pieces each, and at what minimum?
5. Will January's excise rise reach the supplier's prices, and from when?
6. Should the staff discount limit stay ₱50?
7. Are there competitor prices for these pods nearby?
8. Will the owner and manager hold the monthly review in each month's first week?

**Data gaps**

- No shop-level price elasticity: two prices on two different lines.
- No line has been re-ordered, so line appeal and novelty can't be separated yet.
- No device or BLXCK sales.
- No cost change yet.
- No competitor prices.
- Rent and pay are not recorded. That changes price leverage (§5.5), not the line ranking.

**Sources**

- **Shop data:** live Supabase project, read-only SELECTs, 26 Nov 2026 18:59 Manila, re-checked 19:45 (categories,
  prices, costs, settings, payment methods). Also `analysis/baseline.py` (data block), planning design v2 (26 Nov,
  11:26), the suggestion map and the three design reviews (workflow journals), and the stock-and-ordering,
  cash-and-capital and credit-and-collections branches.
- **1% price rule and the pocket price waterfall:**
  - Marn, M. V. and Rosiello, R. L., "Managing Price, Gaining Profit", *Harvard Business Review*, Sep–Oct 1992
    ([PDF via UNC Charlotte](https://pages.charlotte.edu/wp-content/uploads/sites/868/2014/12/ManagingPrice.pdf);
    1% price = +11.1% operating profit, 2,463 companies).
  - Marn, Roegner and Zawada, "The power of pricing", *McKinsey Quarterly*, 2003
    ([McKinsey](https://www.mckinsey.com/capabilities/operations/our-insights/the-power-of-pricing)). Both accessed
    26 Nov 2026.
- **E-cigarette price elasticities:**
  - Huang, Tauras and Chaloupka, *Tobacco Control*, 2014 (disposables about −1.2,
    [PubMed 24935898](https://pubmed.ncbi.nlm.nih.gov/24935898/)).
  - Huang et al., 2018 (disposables −1.6) and a California study, 2012–2017 data (disposables −0.37), both as reported
    in [PMC7674118](https://pmc.ncbi.nlm.nih.gov/articles/PMC7674118).
  - A pooled meta-analysis preprint: −10.7% sales for +10% price
    ([RePEc/OSF](https://econpapers.repec.org/RePEc:osf:osfxxx:4ub2r)).
  - NBER w32435: −1.5 to −2.1 by nicotine strength
    ([NBER](https://nber.org/system/files/working_papers/w32435/w32435.pdf)).
  - All accessed 26 Nov 2026.
- **Methods:**
  - Menu engineering: Kasavana, M. L. and Smith, D. I., Michigan State University, 1982
    ([FIU digital commons](https://digitalcommons.fiu.edu/record/17973/files/V13n195e.pdf);
    [Toast summary](https://pos.toasttab.com/blog/on-the-line/menu-engineering-matrix)).
  - ABC analysis: Dickie, H. F., "ABC Inventory Analysis Shoots for Dollars, Not Pennies", *Factory Management and
    Maintenance*, July 1951 ([summary](https://www.wikipedia.org/wiki/ABC_analysis)).
  - Pareto naming: Juran, J. M., "The Non-Pareto Principle", 1974
    ([juran.com](https://www.juran.com/wp-content/uploads/2021/03/The-Non-Pareto-Principle-1974.pdf)).
  - Resource reallocation: Hall, Lovallo and Musters, "How to put your money where your strategy is", *McKinsey
    Quarterly*, March 2012
    ([McKinsey](https://mckinsey.com/capabilities/strategy-and-corporate-finance/our-insights/how-to-put-your-money-where-your-strategy-is)).
  - GMROI ([Wikipedia](https://en.wikipedia.org/wiki/Gross_margin_return_on_inventory_investment);
    [Shopify](https://www.shopify.com/blog/gmroi)).
  - Price, volume and mix analysis
    ([AccountingTools](https://accountingtools.com/articles/what-is-gross-profit-analysis.html)).
  - All accessed 26 Nov 2026.
  - Attributions without numbers: Goldratt, *The Goal* (1984); James and Stein (1961); Efron and Morris (1975);
    Conn and McLean, *Bulletproof Problem Solving* (2018); Minto, *The Pyramid Principle* (as cited by the cash
    branch).
- **Philippine rules:**
  - Vapor excise: nicotine salt ₱60.20 a mL from January 2026 (from ₱57.33), +5% a year under RA 11467
    ([Manila Bulletin, 15 Jan 2026](https://mb.com.ph/2026/01/15/beer-cigarette-prices-rise-in-fresh-government-tax-round);
    [RA 11467](https://www.tobaccocontrollaws.org/laws/ra-no-11467-philippines)).
  - RA 11900 flavour-descriptor rule
    ([Inquirer](https://newsinfo.inquirer.net/1646790/vape-law-to-regulate-new-products-save-adult-smokers-and-protect-minors-advocates);
    [summary](https://en.wikipedia.com/wiki/Vaporized_Nicotine_and_Non-Nicotine_Products_Regulation_Act)).
  - Both accessed 26 Nov 2026. These are not legal or tax advice; a qualified lawyer or accountant should confirm them.
- **Out-of-stock behaviour:** Gruen, Corsten and Bharadwaj (2002), as cited by the stock branch.
