# Empty-shelf causes: adversarial review

Independent challenge of `analysis/empty-shelf-causes.md` (strategy consultant, 27 Nov 2026), run after it with the math check (`analysis/empty-shelf-causes-check.md`). Question: should the empty-shelf opportunity cost count only the days the shelf was empty because of poor restock planning? Figures are the consultant's, re-run and reproduced; November is to 27 Nov 12:04:45 Manila.

## Verdict

Right in principle, overbuilt in practice. The consultant is right about the principle. The shop's cost of empty shelves should count every empty hour, and the restock plan should be judged only on the hours a better-timed order would have saved. That matches what an opportunity cost is: the value of the alternative that was really open to the person choosing. It is also the controllability rule of responsibility accounting, and it is how the retail out-of-stock studies trace causes.

The owner is more right than the answer's flat 'No' admits. To judge the ordering, count only the days that ordering on time would have saved. For November that is ₱352 for certain. It rises to ₱1,435 (99% of the ₱1,449 lost to empty shelves) if the 6–9 Nov gap, which has no order day, was also a late order. The consultant itself calls a late order the likelier story. The real case for keeping all causes looks forward, not at November: payouts caused ₱0 of empty time so far, but Batch 4 is short of money in 98% of the math check's trials because of the 25 Nov payout.

I re-ran analysis/empty-shelf-causes.py and its numbers reproduce exactly. What to change:
1. Answer with two named numbers instead of a five-part split on the daily card.
2. Lead the scorecard with the nothing-on-the-shelf figure, 'about ₱1,449'. Today's headline is the 'at most' figure, ₱8,275, and 71% of it is thin-shelf time that the math check calls unproven. 'At least' is also not a floor, because some buyers wait for the next batch.
3. Replace the minute-by-minute waterfall with a per-gap split in days. It gives the same numbers from three subtractions.
4. Test 'waiting for money' against the smallest restock, not the order as placed (which included ₱2,000 of new devices).
5. Treat a missing order day as unknown for Batches 1 and 2, which came before the field existed, and as ordered late from now on.
6. Show money at the payout decision only as a check on the next order.
7. Hold off on the notes table, the known-cause share, the thin-shelf by-choice fields and the duplicate database function until something needs them.

Before any cause goes on the scorecard, ask the owner two questions. When was Batch 2 ordered? Why did Batch 3 go in on 25 Nov, and could the supplier have taken it on 19 Nov?

## The case for counting only planning

1. Opportunity cost belongs to a decision. It is the value of the best alternative that was really open to the chooser at that moment (Buchanan). When the fund could not pay, or the supplier could not ship, 'order earlier' was not open, so those hours are not a cost of the restock decision. They are a loss whose opportunity cost belongs to other choices (the payout, credit, the supplier). That cost should be shown where those choices are made, before they are made: a payout screen that says 'this leaves the next order short' beats a stock line after the fact.
2. A feedback number should move only when the action it tracks fails. Supplier speed and when buyers pay say little about ordering discipline (the informativeness test of Holmström, and of Antle and Demski). Mixing them in lets real lateness hide as bad luck, and lets bad luck read as lateness.
3. On this month's data it costs almost no information. If the 6–9 Nov gap was a late order (the consultant's own likelier story), planning is ₱1,435 of ₱1,449 (99%). The rest is ₱14: 55 minutes when buyers still owed ₱5,000.
4. Behaviour. The person ordering can drive this number to zero, which motivates. A number that rises because the owner paid out or the supplier was slow invites arguments between two partners who split profit 2 : 1, and the manager can place orders too.
5. It is cheaper to build: per gap, days late = order day minus (the day the shelf ran out minus the delivery days).
Where it fails: it still needs the cause rules. It would show ₱0 for exactly the gap the analyses predict next (Batch 4, short of money because of the 25 Nov payout). And if unknown days are left out, not recording an order day pays off.

## The case for no split at all

1. Two people run the shop and share its profit 2 : 1, so every empty hour costs both of them, and the profit share already is the incentive. Two decisions interact here: who pays out and who orders. When decisions interact like that, holding each person to the joint result can be the better arrangement (Arya, Glover and Radhakrishnan 2007, revisiting Antle and Demski). Firms often hold managers to things they don't control on purpose, so that they react to them (Merchant 1987): order earlier when cash is tight, ask for pick-up terms, chase credit, keep spare stock against a slow supplier.
2. Every cause has the same remedy, stock on the shelf sooner, and every lever is the owners'.
3. Today the split is mostly unknown or assumed:
   - 75% of it has no order day;
   - the rest rests on a delivery time that has never been measured (7 days);
   - its boundaries come from when records were typed: the 25 seconds and 55 minutes of 'waiting for money', and 22 of 51 sales entered within two minutes of another sale.
   The shop has had two gaps in its life. That doesn't need a rule engine.
4. The retail studies report availability and lost sales as one figure. Causes are found by examining each out-of-stock event, to direct the fix.
5. The split costs about 25 fields, 100 lines of SQL, two tables, a database function, tests and four screens. That competes with the planning engine, which prevents gaps instead of explaining them.
Where it fails: one total can't tell whether the reorder plan works, or whether a payout caused a gap. The Batch 4 decision turns on exactly that: keep money back, or order the 13 pieces the cash buys.

## Objections that hold

1. The flat 'No' undersells the owner. For the restock plan the owner is right: its opportunity cost is only the days a better-timed order would have saved. The consultant agrees in substance ('judge the plan only on Ordered late'), so the answer is 'two numbers', not 'No'.

2. Two claims aren't backed by November's data: that a planning-only figure 'would show 24%', and that it 'would hide what payouts cost'. Payouts caused ₱0 of empty time this month; by the consultant's own attribution the ₱14 was money buyers still owed. A planning-only figure that counts the unrecorded 6–9 Nov gap as late, which the consultant calls likelier, is ₱1,435, or 99%. The real argument for keeping all causes is the predicted Batch 4 squeeze: short in 98% of trials, caused by the 25 Nov payout.

3. It answers only half the question. The owner asked about days with no stock on the shelf, but the scorecard's KPI value is the 'at most' figure, ₱8,275 (index.html binds it to lost_profit_high). 71.5% of that figure is thin-shelf time, which the math check says may be worth far less (about ₱1.1k against ₱3.7k a month). The proposed sub-line splits the 'at least' ₱1,449 under that ₱8,275 headline, so the parts don't add up to the number above them.

4. 'At least' isn't a floor. On Batch 2's first evening, 8 pieces sold in 11 minutes (18:43–18:54 on 10 Nov), and 5 of the 7 buyers were Batch 1 regulars. If that was demand that waited out the gap, 6–9 Nov cost about ₱346, not ₱1,083. But opening day also sold 8, so novelty could explain it. And 11 of 20 Batch 1 buyers haven't come back, which could mean lost customers, worth more than ₱354 a day. In the Gruen et al. averages, with in-store swaps removed, about a quarter of buyers delay their purchase. Both directions are open.

5. The precision is false. The minute and second boundaries are typing times. 22 of 51 sales were entered within two minutes of another sale, and 12 of 36 payments share a minute: four at 9 Nov 19:48, seven minutes before Batch 2 was put on the shelf in the app. The 25 seconds and 55 minutes of 'waiting for money' come from the order in which records were typed. Batch 3's order minute (07:34:58) is when a Receive batch record was entered to show its cost; only the day, 25 Nov, is the owner's word.

6. The money test uses the order as placed: ₱7,214, including ₱2,000 for the first devices the shop has ordered. It should use the smallest restock that would have kept the shelf from emptying. Against a pods-only line (about ₱5,190), money is ₱0 at 7 days' delivery and ₱501 (not ₱1,076) at 10 days. Against one of each flavour (about ₱1,850) it is ₱0 at any delivery time. So ordering more, or adding a product, moves hours from 'ordered late' to 'waiting for money'. That contradicts the shop's own 'order what the cash buys' rule. A ₱288 shortfall that a small owner top-up would close doesn't bind either. In the Batch 4 squeeze, this rule decides whether the gap reads 'payout' or 'ordering'.

7. 'Not recorded' is neither a cause nor anyone's lapse. The order-day column (stock_batches.ordered_on) was only added on 26 Nov (20261126000000_batch_orders.sql), so Batches 1 and 2 could not have had one; giving the bucket a 'who' blames the person ordering for the app's history. Also, the proposed KPI, 'ordered-late days per month', leaves unknown days out, so not recording an order day does help on the KPI. That contradicts the claim that it doesn't.

8. Showing the past 'Waiting for money' (₱14 in 90 days) next to Safe to distribute would reassure the owner just before the payout-driven Batch 4 shortfall the analyses predict. At the moment of a payout, only the check on the next order is useful: a cost is borne when the choice is made.

9. The build is out of proportion. The per-minute waterfall gives exactly the same split as three subtractions per gap; I checked this at 5, 7 and 10 days.
   - Ordered late = order minus the later of the latest on-time day and the day the money was enough.
   - Waiting for money = the day the money was enough minus the latest on-time day.
   - Supplier = arrival minus (order plus usual delivery).
   The extras add code, tests and screen lines without changing any decision:
   - largest-remainder rounding;
   - known_cause_pct, which one backfill cures;
   - thin_wait_next_batch and thin_by_choice, which are always 100% and 0% today;
   - a second copy of the rules in a database function;
   - a shelf_notes table worth ₱0.
   The notes design also has a loophole: add_shelf_note accepts a start up to a day back, against its own rule that a note must be made before the gap starts.

10. The scorecard line judges the plan in pesos ('Judge the reorder plan on Ordered late: ₱352 to ₱1,435'). Pesos multiply the days late by pace and margin, which the person ordering doesn't control. Days late is the controllable measure, and it is the consultant's own KPI. 'Judge' and 'Not recorded' are blame words to put on a partner's phone every day.

11. The open gap's ₱2,056 'ordered late' is a single number resting on two things nobody has checked:
   - a 7-day delivery that has never been measured;
   - the assumption that the supplier could have taken the BLXCK Signature and device order before 25 Nov.
   On the owner's own 5–7 days, the late-order part is ₱1,362 to ₱2,056 (about 4 to 6 days late). 'The supplier isn't late' is premature before anything has been delivered.

12. 'Whoever orders' has no owner. Owners and managers can both order (order_batch checks is_manager, which includes the owner), so 'ordered late' lands on whoever typed the order unless one person is named as owning the order-by date.


## Changes recommended

1. Recommendation: answer the owner with two named numbers. 'Profit lost to empty shelves' is all causes, the shop's cost. 'Ordering on time would have saved' is the yardstick for the plan. Say it plainly: yes for judging the ordering, no for the shop's cost.

2. Recommendation: give the case for counting all causes as a forward risk, not as November's history. Batch 4 is short of money in 98% of the math check's trials because of the 25 Nov payout, and a planning-only number would show that gap as ₱0.

3. Recommendation: before publishing any cause, ask the owner two things: Batch 2's order day (to enter on its page) and why Batch 3 went in on 25 Nov.

4. Recommendation, order of work:
   - build the planning engine first;
   - add only the per-gap split to the scorecard now;
   - keep payment terms, the Receive batch order day and the daily plan copy as engine features;
   - hold off on shelf_notes, known_cause_pct, thin_by_choice, thin_wait_next_batch and the empty_shelf_causes database function until a real case needs them.

5. Cause rule: work per empty stretch, in days to one decimal, from five moments: the shelf ran out, the latest on-time day (ran out minus usual delivery), the money was enough, the order day, and arrival.
   - Ordered late = order minus the later of the latest on-time day and money enough.
   - Waiting for money = money enough minus the latest on-time day.
   - Supplier = arrival minus (order plus usual delivery).
   - No order day = unknown.
   On this data it gives the same numbers as the waterfall.

6. Cause rule: count 'waiting for money' only when the fund couldn't pay the smallest restock the supplier accepts. Until that is known, use one line of pods with fees (about ₱5,190 today), never add-ons such as devices. Ignore shortfalls a small owner top-up would close (for example under ₱500), and any part shorter than 0.1 day.

7. Cause rule: Batches 1 and 2 stay 'unknown', because the app had no order day before 26 Nov. From now on, Receive batch asks 'When did you order it?' with a 'Don't know' choice, and 'Don't know' counts as ordered late. 'Supplier slow' needs a recorded order day.

8. Cause rule: judge the person who owns the order-by date in days late, against the plan's own date once the daily plan copy exists. Pesos only show the stakes. Show the open gap's late-order part as a range for 5 to 7 days' delivery until Batch 3 measures delivery.

9. Valuation: keep ₱354 a day but call the figure 'about', not 'at least'. When Batch 3 arrives, check its first two days of sales and how many Batch 2 buyers return. Lower the figure if demand waits for restock; raise it if buyers don't come back.

10. Scorecard wording, KPI: show 'Profit lost to empty shelves: about ₱1,449 this month' as the KPI value. Sub-line: 'Ordering on time would have saved ₱352 (1.0 day). 6–9 Nov (₱1,083) has no order day: add it on Batch 2's page.' Second sub-line: 'Up to ₱8,275 if thin shelves lose sales too (Batch 3 will tell).'

11. Scorecard wording, empty-now line: 'Empty since Thu 26 Nov 11:16. Batch 3 was ordered 25 Nov; to arrive in time it had to go in by about 19 Nov, when the money was there. About ₱366 so far, ₱1,360 to ₱2,070 by the time it comes (delivery 5 to 7 days, not measured yet).'

12. Scorecard wording: title the box 'What empty shelves cost you', and define opportunity cost once as 'what a different choice would have saved'. Replace 'Judge the reorder plan' with 'Ordering on time would have saved', and 'Not recorded' with 'No order day'. Show 'Waiting for money' and 'Supplier' lines only when they reach 0.1 day.

13. Owner distributions: show only the forward check, not the 90-day history: 'Paying out ₱X now leaves the next order (order by D) short by ₱Y: about Z days empty, about ₱W of profit.'

14. Monthly review, not the daily card: one row per empty stretch with its dates, order day, delivery days, and the split in days and pesos. Notes for gaps chosen on purpose can be added there in words, without scoring them.

15. SOP and Help: name who owns the order-by date (the owner, with the manager as back-up). Record the order the day it is placed, and tap Arrived the day it comes. Change lib/help.ts and the SOP doc together.


## Sources

- Shop data and code, read only:
  - analysis/empty-shelf-causes.py, re-run with --no-json: output identical to analysis/empty-shelf-causes.md;
  - the data block of analysis/baseline.py;
  - analysis/math-check.md §4.1 and §4.3 (thin-shelf ₱1.1k; Batch 4 short in 98% of trials);
  - analysis/stock-and-ordering.md §4.3–4.4;
  - docs/HISTORY.md (5–7 day delivery; the 10–11 Nov projection).

- Repository facts:
  - supabase/migrations/20261126000000_batch_orders.sql adds stock_batches.ordered_on on 26 Nov;
  - supabase/migrations/20261126000100_batch3_on_the_way.sql: Batch 3 was entered by Receive batch on 25 Nov to show its cost;
  - is_manager() covers owner and manager;
  - the scorecard's index.html binds the KPI value to lost_profit_high.

- My checks, scratchpad only, nothing written to the repository:
  - /tmp/claude-0/-home-user-cloud-factory-pos/1266ee19-7c3f-596f-a8a9-3b4759fe376f/scratchpad/challenge/check.py: first-day sales, returning buyers, entry-time clustering, the per-gap formula;
  - /tmp/claude-0/-home-user-cloud-factory-pos/1266ee19-7c3f-596f-a8a9-3b4759fe376f/scratchpad/challenge/fund.py: the money test against other order sizes, using the consultant's own fund functions.

- J. M. Buchanan, Cost and Choice (1969): cost is borne by the chooser at the moment of choice.

- R. Antle and J. Demski, 'The Controllability Principle in Responsibility Accounting', The Accounting Review 63(4), 1988, pp. 700–718 (https://www.proquest.com/docview/1301315346); B. Holmström, 'Moral hazard and observability', Bell Journal of Economics, 1979 (informativeness).

- A. Arya, J. Glover and S. Radhakrishnan, 'The controllability principle in responsibility accounting: another look', in Essays in Accounting Theory in Honour of Joel S. Demski (Springer, 2007): an agent can be held responsible for a variable he doesn't conditionally control when decisions interact (https://link.springer.com/chapter/10.1007/978-0-387-30399-4_9).

- K. Merchant, 'How and why firms disregard the controllability principle', in Bruns and Kaplan (eds.), Accounting & Management: Field Study Perspectives (HBS Press, 1987).

- T. Gruen, D. Corsten and S. Bharadwaj, Retail Out-of-Stocks: A Worldwide Examination of Extent, Causes and Consumer Responses (GMA/FMI/CIES, 2002).
  - Out-of-stock rate about 8%.
  - Consumer responses: 31% buy at another store, 26% another brand, 19% the same brand, 15% delay, 9% don't buy.
  - Most root causes are in the store (about 72%): ordering and forecasting nearly half, shelving and replenishment 25%.
  - Summaries: FMI press release, 14 Oct 2002 (https://www.fmi.org/newsroom/news-archive/view/2002/10/14/new-industry-study-explores-root-causes-of-global-out-of-stock-dilemma); Progressive Grocer (https://progressivegrocer.com/study-75-percent-global-out-stock-issues-must-be-corrected-retail).

- D. Corsten and T. Gruen, 'Stock-Outs Cause Walkouts', Harvard Business Review, May 2004 (summary: https://es.scribd.com/document/282295387/Stock-Outs-Cause-Walkouts); 'Desperately seeking shelf availability', IJRDM 31(12), 2003 (https://www.emeraldinsight.com/doi/abs/10.1108/09590550310507731).

- ECR Europe and Roland Berger, Optimal Shelf Availability (2003): store ordering is the top root cause, about 35%, as cited in a GS1 Italy deck (https://gs1it.org/content/public/df/e3/dfe3bd6d-d461-42a2-95df-d34454f7bba4/osaday_jtupper.pdf). Also the OSA literature review at https://core.ac.uk/download/72840065.pdf.

- Caveat: the root-cause percentages come from search summaries and trade press, which differ from each other. The original tables couldn't be opened from this session, because supermarketnews.com and epub.uni-regensburg.de are not on its network allowlist. Use them for direction only. The quarter-who-delay figure is my rough application of the 2002 averages to a whole-shop stock-out.
