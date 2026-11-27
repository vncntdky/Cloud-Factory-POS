# Cloud Factory: math check of the strategy review

As of **Friday 27 Nov 2026, 09:20 Manila**. The live data hasn't changed since the 26 Nov 18:59 pull: 52 sales, 36 payments,
81 stock movements, Batch 3 still on the way, cash ₱340.

Every number below comes from `analysis/math-check.py`:

- `python3 analysis/math-check.py` runs in about 25 seconds, with numpy and pandas only.
- Add `--rerun` and it also re-runs every other `analysis/*.py` in a temporary copy (about 3 more minutes) and compares
  their output files with the ones in the repo.
- It writes one new file, `analysis/math-check_metrics.json`. No existing file was changed.

Where I re-ran a branch model with one input changed, the script runs the branch's own code with that one change marked.
It doesn't re-type the model.

## Assumptions

| # | Assumption |
|---|---|
| A1 | "Correct" means two things: the number follows from the shop's data and the stated formula, and the words say what the number says. For judgement calls, such as the 95% service level, I check only that they are applied consistently. |
| A2 | The data is the data block in `baseline.py`. I compared it with the live database, read-only. The md5 fingerprints of sales, sale lines, payments, stock movements and products match row for row (26 Nov 20:50). Counts and the owner's `finance_report` were unchanged at 27 Nov 09:20. |
| A3 | "Order-free" splits of a product of factors are the Shapley average of all six step orders, or the log-mean (LMDI) split. Both are standard. Neither is the one true answer, but neither depends on which factor is changed first. |
| A4 | Day-to-day dispersion uses whole calendar days with stock all day (25 days), or with 7+ flavours all day (9 days). These samples are small, so read those figures as indicative. |
| A5 | I re-checked external figures with generic web searches only. No search used the shop's name, the owner's name or any shop figure. |
| A6 | Privacy: only totals are used. Buyer numbers are pseudonymous and appear only in counts. |

## 1. Bottom line

**The arithmetic is sound. Every script re-runs to the same output, and the data matches the live database. Every
recommendation still points the right way. But some conclusions are stated more strongly than the numbers support, and
eight items must be fixed before the engine and the Planning page are built.**

- **What holds.**
  - All six scripts re-run with identical output files.
  - All 33 scripted checks pass (rounding aside). So do the 5 fingerprints, the engine dates, the simulation
    reproductions and the EOQ figures. They cover the fact base, the engine (λ 2.014, reorder point 22.6, target 55.7,
    next order 33 pieces, Order by 7 Dec), the collections rules (9 / 11 / 18) and the profit bridge totals.
  - I found no centavo / peso slips and no double counting in the totals.
  - Keeping the next order's money before payouts is worth **+₱363 a month** in the stock model under the adopted
    rule. The review quotes +₱432, which is for a stricter rule.
- **The eight items to fix before the build.** Each changes a number or a sentence the owner will see:
  1. **"What moved net profit" depends on the order of its steps.** Being out of stock is 25% to 53% of October's drop,
     depending on that order; the review's order gives the top of the range. A split that doesn't depend on the order
     gives about 39%. On that split, the biggest minus is the opening rush, not flavours on the shelf.
  2. **Fits your money is 13 pieces, not 14.** A 14-piece order still pays the whole ₱249 order fee: ₱2,509 against
     ₱2,420 of budget.
  3. **"1 order cycle in 20" is not supported.** Daily sales vary 2.4 to 3.3 times as much as the formula assumes. The
     9 spare pieces then cover about 89% of cycles (about 1 in 9 short). 95% needs about 12 spare pieces.
  4. **R = 14.5 is not "from the arrival days".** It mixes two arrival days with one order day. On any single definition
     the gaps are 13 and 23 days, which gives R = 18. That moves the next order from 33 to 42 pieces.
  5. **"Pay out up to two thirds of profit" is too generous.** It treats one batch's cost as all the money tied up. On
     the money the shop really ties up, the limit is about **56%**.
  6. **Card 14's "82% of repeat buyers chose a new flavour" mostly measures stock-outs.** In 7 of those 9 buys, the
     flavour the buyer had before was already sold out.
  7. **The fee rule makes fees grow in step with pieces.** The review's own fit says fees are almost flat. The rule
     overstates the fee by ₱97 at 52 pieces.
  8. **"₱985 more in total, but 31% less a day" mixes net and gross profit.** Batch 2's gross profit was only ₱445
     higher.
- **Errors in the analysis, not the build:**
  - **Money needed for a full shelf is understated by ₱3.8k.** It is about ₱14.7k when paying at order and ₱10.3k on
    pick-up. Both are above the ₱9,634 the owners have in the business.
  - **The Batch 4 shortfall is quoted for the order size the review rejected (₱6,224).** At the adopted ₱5,664, the
    fund is short in 98% of trials, with a median owner top-up of ₱2,050 (not ₱2,598).

**Decisions needed:**

1. **Engineering:** apply fixes 1, 2, 3 and 7 in the engine spec and DB tests (release 1; the bridge is release 2).
2. **The review's author:**
   - correct the Help text (fixes 3, 4, 5, 6 and 8);
   - correct the analysis figures in §4 below before the review is shared.

## 2. Situation, complication, resolution

- **Situation.** The engagement gives the owner one headline figure: ordering on time adds about ₱4.0k a month of gross
  profit. It also gives engineering a build list and a 16-card Planning page. Everything rests on six Python scripts and
  one data pull.
- **Complication.** The scripts compute what they say. But five formulas are the wrong ones for the quantity they
  measure:
  - working capital;
  - spare-stock lumpiness;
  - the fee rule;
  - the order of the profit-bridge steps;
  - the base for self-funded growth.

  Some figures are also quoted from model runs at inputs the review rejected (₱6,224 on 5 Dec). And three sentences say
  more than the data shows:
  - flavour rotation;
  - "from the arrival days";
  - "1 cycle in 20".
- **Resolution.**
  - Fix the formulas and the wording above.
  - Keep the recommendations. Their direction holds in every re-run.
  - Re-run `analysis/math-check.py` after the edits.

## 3. Issue tree

The question: **are the numbers, formulas and conclusions in the strategy review and the branch files right, and which
errors would reach the app or the owner?** The branches don't overlap and leave nothing out.

- **A. Inputs.** Is the data the shop's real data? **Yes.** The md5 fingerprints match and `finance_report` is equal.
- **B. Arithmetic.** Do the scripts compute what they say? **Yes**, with one off-by-one (Fits your money).
- **C. Formulas** ★ Is each formula right for the quantity it measures?
  - working capital
  - lumpiness
  - fee rule
  - bridge order
  - growth base
- **D. Inference** ★ Do the numbers support the words?
  - rotation
  - R "from the arrival days"
  - "1 in 20"
  - "53%"
  - "two thirds"
  - ₱766
  - ₱985
  - "in every test"
- **E. Consistency** ★ Are quoted figures from the adopted model?
  - the order size and day (₱6,224 on 5 Dec, against ₱5,664 on 7 Dec)
  - the payout rule used in the stock simulation
- **F. Sources.** Is each external figure dated and traceable? **Yes**, except one end of a range.

★ marks the branches where the errors are.

*Pruned:* I didn't re-derive v1's 497 pieces; the stock branch reproduced the maths review exactly. I also didn't
re-check the products branch's ABC simulation; it only feeds a display.

## 4. Analysis

### 4.1 What holds (recomputed independently)

| Area | Figures checked | Result |
|---|---|---|
| Data | md5 of 52 sales, 60 sale lines, 36 payments, 81 movements, 31 products; `finance_report` end figures; the entry times of the reserve, Batch 3 and the payout | Identical to live |
| Re-runs | `baseline`, `cash-and-capital`, `credit-and-collections`, `products-pricing-mix`, `stock-and-ordering`, `strategy-review` | All exit 0. Metrics files identical; the stock script writes none and its printout matches |
| Fact base, on a minute grid | Net sales ₱19,800; landed gross profit ₱9,567 (48.3%; 50.8% at unit cost); ₱159.45 a piece; 27.03 days with stock; 3.38 days fully empty; 2.22 pieces a day; ₱354 / ₱576 an empty day; ₱2,478 = 25.9% of gross profit; net profit ₱8,827; balance ₱9,634 = ₱9,634; payout 47.9% of profit | All match |
| Engine | λ 2.014 by direct numerical integration; reorder point 22.64 (14.1 sold during delivery + 8.5 spare); target 55.73; next order 33; Order by Mon 7 Dec (Sat 5 Dec for pods only); v2 at R 18: 43 pieces, ₱7,276 | All match |
| Collections | 31 paid in full; 9 / 11 / 18 days; 20 of 31 good payers marked Late at 7 days, 5 at 11; ₱1,700 / ₱380 / ₱0; expected bad debt ₱58; Jeffreys upper bound 5.9% (quoted as 6.0%); ₱220 a month on new credit | All match |
| Payout rule | Hold ₱3,584; v2 suggests ₱3,492; adopted rule suggests ₱0 on 25 Nov | Match. The ₱0 has a margin of only ₱92 |
| Profit bridge | ₱730 → ₱201 a day; the effects add up exactly to −₱528.98 | Match. The split between effects is item 4.2a |
| Stock simulation | Reproduces ₱6,674 / ₱10,712 / ₱11,144 exactly; the test gains +₱3,221 / +₱4,283 / +₱4,706 / +₱7,659 are the right differences | Match |
| Order economics | EOQ 83 and 105 pieces (37 and 29 days of cover); ₱78 and ₱184 a month saved; a 90% to 97.5% service level moves the next order 32 → 34 pieces | Match |
| Credit maths | ₱481 / ₱898 freed by chasing from day 11; ₱305 more cash from "old tab first"; break-even PD = (share needing credit × ₱159.45 − ₱3.1) ÷ ₱330, which gives 3.9% / 11.1% / 23.2% | Match. The formula is right |
| Products | 1% on price = ₱192 a month; +₱10 = −₱275 to +₱462; −₱479 for each 5% cost rise not passed on; a ₱50 discount needs 42.8% more sales; ₱88 / ₱50 a day per flavour; 7 devices tie up ₱1,446 = 8.4 pods = ₱1,419 | Match |
| Tax | 3% = ₱594 to date and ₱575 a month; the 25 Nov payout was ₱584 over a 3% cap | Match |

**So what:** the arithmetic can be trusted. The problems are in the choice of formula and in the wording.

### 4.2 Errors that would reach the app or the owner

**a. The profit bridge depends on the order of its steps** (§4.5, §9.1 item 12, cards 1 and 15; products §5.8, §7.3)

Pieces a day = days with stock × flavours on the shelf × sales per flavour. The bridge changes one factor at a time, in
the order days → flavours → per flavour, and values each step at the previous factors. Changing the order changes the
answer:

| Order of the steps | Days with stock | Flavours on the shelf | Sales per flavour | Being in stock as a share of the drop |
|---|---|---|---|---|
| days → flavours → per flavour (the review's) | −42.5 | **−239.4** | −235.6 | **53.3%** (the highest of all six orders) |
| days → per flavour → flavours | −42.5 | −113.5 | **−361.5** | 29.5% |
| per flavour → days → flavours | −20.2 | −113.5 | −383.9 | 25.3% |
| Shapley (average of the 6 orders) | −26.5 | −182.6 | **−308.4** | **39.5%** |
| Log-mean (LMDI), order-free | −25.2 | −179.5 | **−312.9** | **38.7%** |

The bridge values the change in flavours at October's opening-rush selling rate (0.656 a flavour-day). That inflates
the stock effect.

- **So what:** "more than half of the drop" (cards 1 and 15) is the upper end of a 25% to 53% range. An order-free split
  says about two fifths.
- **And the card would point at the wrong action.** Its biggest minus would be the opening rush wearing off (sales per
  flavour), not flavours on the shelf.
- **The fix:** build `profit_bridge` with the LMDI split. Each factor's effect = (change in pieces a day × last month's
  profit a piece) × ln(this month's factor ÷ last month's) ÷ ln(this month's pieces a day ÷ last month's). It is exact
  and additive, so the "Σ effects = Δ" test still passes.
- **Card text:** "Being out of stock was about two fifths of the drop; most of the rest was the opening rush."

**b. Fits your money: 13 pieces, not 14** (§1 decision 3, §4.3, §4.6, §9.1 item 2 live check, card 7)

- **The review's maths:** it prices each piece at cost × 1.0463, the fee share of the 36-piece suggestion. 14 pieces
  then carry only ₱105 of fees.
- **What the order really costs:** a 14-piece order still pays the whole order fee. That is ₱249 by the design's own
  fee rule, or ₱206 by the ₱174 + ₱2.25 fit. So 14 pieces cost ₱2,509 against the ₱2,420 budget.
- **What fits:** 13 pieces (₱2,344).
- **"Two methods agree" is a coincidence.** The stock branch's 14 used a different cash figure (₱2,517 on 4 Dec), and it
  is on a knife edge: 14.01.
- **So what:** the DB live check would fail once the fee is charged correctly. The rule should be: the largest n for
  which the cost of the n fastest pieces + fee(n) ≤ budget.

**c. Spare stock: "1 order cycle in 20" isn't supported** (§4.3 formulas, §9.1 formulas, card 5; design v2 method 5)

- **Lumpiness is measured per sale line (1.033).** For the shop's total, buyers arrive as sales, and 8 of 51 sales took
  2 or 3 pieces. Per sale, lumpiness is **1.333**.
- **Daily sales are also bursty.** Batch 2 sold 8 pieces on 10 Nov, then 0 on each of the next two days with a full
  shelf.

| Variance ÷ mean of pieces sold | Value |
|---|---|
| Assumed by the formula | 1.03 |
| 25 whole days with stock | 2.67 |
| 9 whole days with 7+ flavours | 2.53 |
| 2-day blocks / 3-day blocks | 2.39 / 3.29 (it doesn't average out) |

| Same 8.55 spare pieces, with demand spread as | Cycles without running short | Spare pieces needed for 95% |
|---|---|---|
| The formula (line lumpiness) | 95.0% | 8.5 |
| Per-sale lumpiness | 93.7% | 9.2 |
| Measured on days with stock | **88.7%** (about 1 in 9 short) | **11.6** (+3 pieces, about ₱520 of stock) |

- **So what:** card 5 overstates how safe the plan is.
- **The fix:**
  - compute lumpiness per sale: Σ(pieces per sale)² ÷ Σ pieces;
  - better, use the measured variance ÷ mean of daily sales on days with stock, shrunk toward 1 while history is short;
  - card 5: "short in about 1 cycle in 10 while history is short".

**d. Order rhythm: R = 14.5 is a judgement, not "the arrival days"** (§4.3, A10, §9.1, §9.2 method 2, card 6)

| Order days used | Gaps | R | Next order |
|---|---|---|---|
| 27 Oct arrival, 9 Nov arrival, 25 Nov **order** (adopted) | 13, 16 | 14.5 | 33 pieces, ₱5,664 |
| Order days estimated as arrival − 7 (v2) | 13, 23 | 18 | 42 pieces, ₱7,179 |
| Arrival days, with Batch 3 due 2 Dec | 13, 23 | 18 | 42 pieces |

- **The 16-day gap mixes two definitions.** It runs from Batch 2's arrival to Batch 3's order day.
- **So what:** 14.5 may be the better number, because it is close to how long a batch lasts (13.5 days). But that is a
  judgement, and it moves the next order by 9 pieces (₱1.5k).
- **The fix:** say so. Label R "starting guess" until two order-to-order gaps exist, and correct the sentence in §4.3.

**e. "Pay out up to about two thirds of profit"** (§4.2, owner decision 3, card 8, monthly routine step 6)

- **The review's maths:** growth per cycle = (1 − payout ratio) × batch net profit ÷ batch cost (86%). That assumes the
  money tied up equals one batch's cost.
- **What the shop really carries:**
  - credit sales still owed at full price, which overlap the next batch;
  - from Batch 3 on, a prepaid order on the way.

| Return per 14.5-day cycle, measured on | Return | Growth at the 47.9% payout ratio | Payout cap for the 31% growth to a full-shelf order |
|---|---|---|---|
| Batch cost (the review) | 86.1% | 44.9% | 64% |
| Average money tied up, ₱5,884 (baseline §11) | 70.2% | **36.6%** | **56%** |
| Equity today, ₱9,634 (a peak: Batch 3 prepaid) | 42.9% | 22.3% | 28% |

- **So what:** "at most about half of profit while orders grow" is the defensible guide. Paying the supplier at order
  pushes it lower.
- **Verdict:** a method choice, so this is plausible rather than certain.

**f. "Buyers rotate flavours: 82% of repeat buys within a line were a new flavour"** (card 14; products §5.4)

- **Most of those buys had no choice.** In 7 of the 9 "new flavour" repeat buys, the flavour the buyer had bought before
  was already sold out (3 pieces a flavour).
- **When it was still on the shelf (4 cases),** 2 of the 4 buyers took it again.
- **"9 of 11 followed the shop to Black TEO"** had no choice either: XBLACK MAX was sold out.
- **So what:** drop the 82% as evidence of taste. "Carry every flavour" can rest on the breadth result: dropping the 3
  slowest flavours loses 11% to 15% of a line's sales.

**g. The fee rule grows with pieces** (§9.1 next-order formula; contradicts A5)

The rule is fees = ₱249 × max(1, pieces ÷ 33.3). That makes fees grow in step with pieces above 33. The review's own fit
is ₱174 + ₱2.25 a piece.

| Pieces | Design rule | Fit | Overstated by |
|---|---|---|---|
| 36 | ₱269 | ₱255 | ₱14 |
| 52 (full-shelf order) | ₱388 | ₱291 | ₱97 |
| 100 | ₱747 | ₱399 | ₱348 |

- **So what:** small today, but the error grows with the shop, and the owner asked for suggestions that scale.
- **The fix:** fee(q) = a + b·q from the last batches, falling back to the average while there is only one order size.

**h. "Batch 2 made ₱985 more in total, but 31% less a day"** (§4.5, card 12; products §1, §5.3)

| Measure | Batch 1 | Batch 2 | Change |
|---|---|---|---|
| Gross profit in total | ₱4,561 | ₱5,006 | +₱445 |
| Net profit in total, after the expenses charged to each batch | ₱3,921 | ₱4,906 | +₱985 |
| Gross profit a day on the shelf | ₱439 | ₱301 | −31% |
| Net profit a day on the shelf | ₱378 | ₱295 | −22% |

- **₱540 of the ₱985 is the ₱640 "other" expense charged to Batch 1.**
- **The fix:** "₱445 more gross profit in total, but 31% less gross profit a day on the shelf".

### 4.3 Errors in the analysis (they don't reach the build)

| # | Where | Claim | Problem | Correct |
|---|---|---|---|---|
| i | §4.2; cash §4.7 and its script | A full shelf needs ₱10,903 paying at order, ₱6,566 on pick-up; equity is ₱9,634 | Working capital = landed COGS a day × (DSO + DIO + days prepaid). But DSO is measured against sales, so what buyers owe is valued at cost, about half its face value. On last month's history this formula gives ₱3,961, against the ₱5,884 really tied up; valuing receivables at sale price gives ₱5,878 | Full shelf: **₱14,678** paying at order and **₱10,342** on pick-up, both above equity. At plan pace: ₱8,132 / ₱5,729. Pick-up still frees ₱2.4k–4.3k (that part is right). So pick-up alone doesn't make a full shelf affordable; another ~₱0.7k must be kept back from profit |
| ii | §1, §4.2, §4.6, §5 #3, card 10 | Batch 4: short in 100% of trials, median top-up ₱2,598, ₱1.2k–1.9k lost; credit holds back ₱2,155 | These runs use the rejected ₱6,224 order on 5–6 Dec | At the adopted ₱5,664 on 7 Dec, with the branches' own code: short in **98%** of trials, median top-up **₱2,050**, ₱953–1,551 lost. Credit holds back **₱3,141** on 7 Dec; the ₱1,588 loss is unchanged. The direction holds |
| iii | §1, §4.1, §4.7, §5 #1 | +₱4.0k a month; +₱3.2k–4.7k "in every test" | The middle figure (₱4,039) compares "pay out all" runs. The tests compare "keep the next order" runs, where the base gain is **₱3,727**. Every test also keeps the walk-away model. If thin shelves lose no sales and only fully empty days do, the gain is (3.82 − 0.84) × ₱354 = **₱1.1k a month**. The data partly back the review: Batch 2 sold 2.60 a day in both halves of its 7.7 full-shelf days, and the 15% switching fit is stable across seeds (loss 1.72 ± 0.10 against 2.11 ± 0.18 at 30%) | "+₱3.7k–4.0k in the base case, ₱3.2k–4.7k across switching and delivery tests; as low as ~₱1.1k if thin shelves don't lose sales." Batch 3 is the test (H1) |
| iv | §1 decision 3, §5 #1, §7 | Order Batch 4 about 5–7 Dec | The date uses λ 2.01, a pace that includes thin-shelf days. The review's own full-shelf pace is 3.4–3.6. At 2.5 a day the date is 4 Dec; at 2.8 or more it is the arrival day (2 Dec). With a 29-day half-life, the engine reacts slowly: at 3.61 a day it first says Order now on 5 Dec | "Order between arrival (about 2 Dec) and 7 Dec. If Batch 3 sells more than about 2.5 a day in its first two days, order at once." Each day late with a full shelf costs ~₱576 |
| v | §4.7, §5 ranking (script §F) | ₱ a month for R3, R4, R6, R7, R8 and R13 | The middle values aren't derived from the cited figures. R7's own basis says "one-off cash, not profit", yet it enters ₱100–600 a month; ₱305–898 of cash is worth ₱9–27 a month at 3% a month. R4's and R8's highs are one-cycle Batch 4 losses put in a per-month column | Label them as judgements, and value R7 at its financing cost. The top two places don't change; R7 drops to the bottom, level with R12 |
| vi | §5 must-do, risk table | At ₱10k a month of rent and pay, the 31 days were a ₱766 loss | ₱766 = gross profit − ₱10k × 31/30. That treats ₱10k as all running costs | Rent and pay of ₱10k on top of the recorded ₱740 give a **₱1,506** loss. Or say "₱10k a month of all running costs" |
| vii | §4.1 | Payouts rise from ₱5.5k to ₱6.9k a month | ₱6.9k is the simulation's stricter rule, which keeps the full target (~₱9–10k) | The adopted rule: **₱7.8k** a month of payouts and +₱363 of gross profit. This error is in the shop's favour |

### 4.4 Minor slips

- **The payout share (§4.2).** "92.6% of the month's operating cash" divides by cash collected up to 26 Nov. At 07:48 on
  25 Nov the payout was **100%** of the operating cash generated so far (₱4,232).
- **The weighted collections (§4.6, §9.3).** "The weighted version differs by ₱86" is the cash branch's figure, to
  10 Dec, counting two open balances as paid at 16 days. To 7 Dec, from paid-in-full sales only, it differs by ₱142
  (₱1,938 against ₱2,080).
- **The price-gap share (§4.5).** "6–31% of the speed gap" divides shortfalls, while the "−8.4 to explain all" is
  computed in logs. On one basis (logs) the share is 5–26%. Either way, price is the smaller part.
- **The elasticity range.** The upper end, −2.2, isn't in the listed sources: Huang et al. 2014 give −1.2 for
  disposables and −1.9 for reusables, and NBER w32435 gives −1.5 to −2.1. Immaterial.
- **Delivery doubt (stock branch only).** Its §4.2 table says delivery doubt is "48% of spare stock", and its §7 says
  "half". 48% is the share of the variance; it is 28% of the pieces (9.2 against 6.6). The review's card 5 is right.
- **Cash before 25 Nov (baseline §5).** "₱11,786 before 25 Nov" includes ₱340 collected on 26 Nov. Cash at the end of
  24 Nov was ₱11,446.

## 5. Recommendations (fixes, ranked by impact × feasibility)

| # | Fix | Impact | Feasibility | Owner | Timing | First step | KPI |
|---|---|---|---|---|---|---|---|
| 1 | Charge the order fee once in Fits your money | Right count: 13, not 14. Avoids small orders that overrun the cash | High | Engineering | Release 1 | Change the method 8 spec and the live check (fits 13) | DB test: live data gives 13 |
| 2 | Spare stock: lumpiness per sale, with a dispersion factor from in-stock days | Spare 9 → 9–12 pieces; card 5 states the real risk | High | Engineering + the review's author | Release 1 | Replace Σqty² ÷ Σqty over lines with the same sum over sales | Share of cycles that run short, tracked from Batch 4 on |
| 3 | Order-free profit bridge (LMDI) | The card points at the real biggest minus. 53% → 39% on Oct → Nov | High | Engineering | Release 2 | Write the effects as ΔQ·m₁·ln(x₂/x₁) ÷ ln(Q₂/Q₁) | Biggest minus unchanged when the factor order is swapped |
| 4 | Help text: payout cap about half, rotation, ₱445 / ₱985, R labelled a guess, "1 in 10" | The owner doesn't over-pay out, and lines aren't judged on a stock-out artefact | High | The review's author | Before the Planning page ships | Edit cards 5, 6, 8, 12 and 14, and §10's monthly routine | Every Help number traced to `math-check` |
| 5 | Linear fee rule a + b·q | No over-estimate as orders grow (₱97 at 52 pieces) | High | Engineering | Release 1 | Least-squares fit in `plan_params`, falling back to the mean | Estimate within 10% of each new batch's fees |
| 6 | Re-quote the Batch 4 figures at ₱5,664 on 7 Dec, and give the Order-by window as 2–7 Dec | The owner plans a ₱2.0k top-up, not ₱2.6k, and watches the first two days | High | The review's author | Before the owner reads §1 | Replace the §1, §4.2 and §5 #3 numbers | Batch 4 ordered by its live Order-by date |
| 7 | Correct the working-capital table, the ₱766, the ranking units and the minor slips | Accurate capital need (₱14.7k / ₱10.3k at a full shelf) | High | The review's author | Before the review is shared | Use receivables at sale value | — |

## 6. Risks: what would prove this check wrong

- **Burstiness may fade.** It rests on 25 days. If Batch 3 and Batch 4 days look Poisson (variance close to the mean),
  the 95% claim stands. Watch the daily counts in December.
- **A fixed-order bridge can be a fair convention.** If the owners want stock effects counted first on purpose, the 53%
  is defensible, but only if it is labelled as a convention. The card's pointer shouldn't flip on a convention.
- **Rotation rests on 11 repeat buys.** A few more could change it either way. The test is a re-ordered line next to a
  new one.
- **The payout cap could be right.** If pick-up terms and till payments shrink the money tied up to one batch's cost,
  64% is right again.

## 7. Next 30 / 60 / 90 days

- **30 days:**
  - Apply fixes 1, 2, 4, 5 and 6 before release 1; fix 3 goes with release 2.
  - Re-run `python3 analysis/math-check.py --rerun` after the edits.
- **60 days:** with Batch 3 and Batch 4, re-measure:
  - daily dispersion;
  - R from two order-to-order gaps;
  - the H1 walk-away test.
- **90 days:** re-run the whole engagement on 3 months of data. Check the payout cap against the real money tied up
  under the new supplier terms.

## 8. Open questions, data gaps and sources

**Open questions:**

1. **The ₱640 "other" expense on 9 Nov.** Is it a Batch 1 cost or a start-up cost? It drives ₱540 of the ₱985 and the
   78% / 95% batch returns.
2. **How the bridge should split effects.** Should it be order-free, or follow a stated convention? This is a decision
   for the owner and engineering.
3. **Do buyers come in groups** (paydays, friends)? The burstiness suggests so. If they do, the shop needs more spare
   stock than the textbook formula gives.
4. **Batch 3's pace in its first two days.** It decides whether Batch 4 is ordered on arrival (about 2 Dec) or around
   5–7 Dec.

**Data gaps:**

- 25 days with stock all day.
- 11 repeat buys inside a line.
- No order with both an order day and an arrival day.
- No order-to-order gap.

**Sources:**

- **Shop data:**
  - Supabase project, read-only SELECTs: md5 fingerprints on 26 Nov 2026 at 20:50 Manila, and counts and the owner's
    `finance_report` (rolled back) on 27 Nov at 09:20;
  - the `baseline.py` data block;
  - design v2 (`planning-design-v2.md`) for the method definitions.
- **External**, re-checked 27 Nov 2026 with generic searches:
  - **Percentage tax** back to 3% from 1 July 2023, under BIR RMC 69-2023
    ([Forvis Mazars PH](https://forvismazars.com/ph/en/insights/tax-alerts/bir-revenue-memorandum-circular-no.-69-2023);
    [Grant Thornton PH](https://www.grantthornton.com.ph/alerts-and-publications/technical-alerts/tax-alert/2023/reversion-of-regular-corporate-income-tax-to-10-for-proprietary-educational-institutions-and-non-profit-hospitals-percentage-tax-to-3-and-minimum-corporate-income-tax-to-2-effective-july-1-2023/)).
  - **VAT threshold** of ₱3M, cross-referenced as Sec. 109(BB) in RA 10963
    ([Senate copy of RA 10963](https://issuances-library.senate.gov.ph/sites/default/files/2022-03/ra%2010963.pdf);
    [PwC TRAIN summary](https://www.pwc.com/ph/en/tax/train/TRAIN%20Law%20(PwC%20Philippines).pdf)).
  - **BSP credit-card ceiling** of 3% a month (Circular 1165, January 2023), kept in August 2023
    ([EastWest FAQ](https://www.eastwestbanker.com/news-advisories/frequently-asked-questions-bsp-circular-no-1165-series-2023);
    [Philstar, 23 Aug 2023](https://philstar.com/business/2023/08/23/2290593/bsp-keeps-rate-cap-credit-card-transactions)).
    Whether it still applies wasn't confirmed.
  - **Vapor excise** for nicotine salt: ₱52 a mL in 2023, then +5% a year, which gives ₱60.20 in 2026
    ([Inquirer](https://business.inquirer.net/288843/higher-taxes-on-alcoholic-drinks-e-cigarettes-effective-from-jan-1);
    [HB 5364](https://docs.congress.hrep.online/legisdocs/basic_20/HB05364.pdf)).
  - **Price leverage:** Marn and Rosiello, *HBR* 1992. 1% on price gives +11.1% operating profit across 2,463 companies
    ([PDF](https://pages.charlotte.edu/wp-content/uploads/sites/868/2014/12/ManagingPrice.pdf)).
  - **E-cigarette elasticities:** Huang, Tauras and Chaloupka 2014, about −1.2 for disposables and −1.9 for reusables
    ([PubMed](https://pubmed.ncbi.nlm.nih.gov/24935898/)).

This is a check of planning arithmetic. It isn't tax, legal or accounting advice.
