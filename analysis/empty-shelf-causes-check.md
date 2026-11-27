# Check of "Why was the shelf empty?" (the empty-shelf cost split by cause)

As of **Friday 27 Nov 2026, 15:42 Manila**. This is an independent check of `analysis/empty-shelf-causes.md`, its
script and metrics file, and the SQL handed to the scorecard. I did not use the consultant's code.

The data hasn't changed since 26 Nov 11:16:44. A read-only check at 15:20:47 found 52 sales, 36 payments,
81 stock movements, 3 supplier payments, 5 reserve decisions, 1 payout, 2 expenses, no capital entries and a 0% tax
rate.

Every number below comes from `analysis/empty-shelf-causes-check.py`, except the SQL runs in §5:

- Run `python3 analysis/empty-shelf-causes-check.py`. It works offline in about 30 seconds and needs only numpy
  and pandas. Add `--no-mc` to skip the cash Monte Carlo (about 15 seconds).
- I wrote it from scratch. It classifies every second of every empty stretch. The consultant's script cuts each
  stretch at breakpoints instead, so two different methods are compared.
- It reads the data block of `analysis/baseline.py` and the entry times that `analysis/cash-and-capital.py` added.
  It adds the customer-payment seconds from the read-only check, and asserts they match the data block's minutes,
  amounts and days one for one.
- It writes nothing. Amounts are pesos (₱), and lost profit is shown in brackets. No buyer names or numbers are
  used.

## 1. Bottom line

**The numbers are right and the answer stands. Before the owner reads the analysis, fix two claims. Before
engineering builds the split, fix seven rules in the spec.**

**What holds:**

- **The script re-runs.** With all networking removed it exits cleanly in 12 seconds. Its metrics file comes out
  identical byte for byte (md5 `208cc953…`).
- **All 147 figures I compared agree** with my second-by-second rebuild from the raw data: the two empty stretches,
  ₱354.00 a day, the November range of (₱1,449) to (₱8,275), every split, the sensitivity table, the order-by dates
  and the partly-stocked part.
- **The company fund I rebuilt** from receipts and payments equals the cash branch's ledger on all 31 days, to the
  centavo.
- **The SQL matches.** I re-ran the consultant's SQL live at 15:42:36 (read-only, as the owner). It matches my split
  at that second.
- **The parts add up exactly** to each stretch and to the month. One rate is used throughout, and nothing is
  counted twice.
- **The answer follows from the numbers:** keep the all-causes total as the headline and judge the reorder plan on
  "Ordered late". It is also the standard controllability principle.

**Two claims the owner would read are wrong:**

1. **"Pick-up terms would have made the plan's 12–14 Nov order date affordable."** That is true only on the app's
   7-day guess, and not for 12 Nov. The plan itself expected Batch 3 to arrive 17–19 Nov (5 days). On that timing
   the fund held ₱4,486 to ₱5,906 on 17–18 Nov. It first held the ₱6,850 at 08:46 on 19 Nov, so only a 14 Nov
   order collected after that time would have worked.
2. **"Pick-up cuts Batch 4's chance of being short from 100% to 17% (at ₱6,224)."** The math check says to quote
   Batch 4 at the adopted ₱5,664. With the cash branch's own simulator at ₱5,664, the chance falls from **98% to
   7%** on pick-up, and to **0.1%** had the 25 Nov payout been held. The recommendation gets stronger, not weaker.

**Seven rule and spec defects** (today's numbers are not affected; future data will hit them):

3. **The `money_enough_at` recipe** returns 19 Nov 11:16 (5.85 days late), not the 12:11 (5.81 days) its own expected
   values say.
4. **"Classifying each piece at its midpoint is exact" is false.** It fails whenever money becomes available or
   unavailable without a fund event: a credit sale when the tax rate is above 0%, or another order booked and not
   yet paid. I reproduced this on the SQL itself (§5).
5. **Two orders on the way.** An order placed on time but delivered late gets blamed on the later order that ended
   the gap: "Ordered late" instead of "Supplier".
6. **Part payments.** The money paid at order is counted again when testing the payment on pick-up.
7. **An order recorded, then paid days later** while the money was there: on prepaid terms that delay is the shop's,
   but it goes to the supplier.
8. **A void while the shelf is empty** splits the stretch in two. The first part has no batch, so it is judged as
   "nothing on order".
9. **The shelf counts only products that are active now** (this comes from `ops.v3.sql`). Making a sold-out line
   inactive erases its empty stretches. On the real data that would erase the 6–9 Nov (₱1,083).

There are also some smaller items:

- **Closed days.** The cause tree counts them in the total as "By choice". The app spec takes them out of the total.
- **Wording slips** (listed in §7).
- **The metrics file.** One key collision means 12 sensitivity rows are saved under 2 sets of names.
- **₱1 rounding flips.** At 15:42 the closed 6–9 Nov part already shows ₱1,082 instead of ₱1,083.

**Decisions needed:**

1. **The analysis author:** correct the two owner-facing claims (§4) before the review is shared.
2. **Engineering:** apply fixes 2 to 9 of §8 in the scorecard SQL and in `empty_shelf_causes()`, each with the
   database test listed there, before the split is published.

## 2. How I checked

| Step | What I did |
|---|---|
| 1. Re-run | Copied the scripts to a scratch folder and ran `empty-shelf-causes.py` with networking removed (`unshare -n`). Compared its metrics file and printout with the repo's. |
| 2. Rebuild | My own script, from the raw data block. It rebuilds the shelf from the 81 stock movements, the value of an empty day, and the company fund event by event. It reads the payment terms from the supplier-payment records, then classifies every second of each stretch by the spec's rules (section B). |
| 3. Edge cases | Synthetic stretches through my implementation of the rules. I also ran the consultant's own SQL (`causes-check.sql`) on the same cases. That ran in a throwaway local Postgres 16 with the stub and all 31 migrations, triggers off while loading, then rolled back. |
| 4. Math check | Compared every figure the analysis reuses with `math-check.md`. Re-ran the cash branch's simulator at the adopted ₱5,664 to replace the one figure still quoted at ₱6,224. |
| Live | Two read-only queries inside `begin … rollback`: the entry-time check (15:20:47) and the consultant's SQL as the owner (15:42:36). |

## 3. What holds

| Area | Checked | Result |
|---|---|---|
| Re-run | Exit 0, offline, 12 s. Metrics file identical. Printout identical except the path it prints | Holds |
| The two stretches | 6 Nov 18:31:43 (Batch 1's last sale) to 9 Nov 19:55:50 (Batch 2's first restock): 3.05841 days. 26 Nov 11:16:21 to now, still open: 1.03361 days at 12:04:45 | Holds |
| Value of an empty day | 60 pieces ÷ 27.0258 days with stock = 2.2201 a day. Landed gross profit ₱159.45 a piece; I rebuilt landed cost (₱10,233) and it equals Finance's. So **₱353.9951 a day**, or ₱14.75 an hour. Full shelf: 40 ÷ 11.0809 = 3.6098 a day, so ₱575.58 | Holds |
| November range | At least (₱1,448.56), at most (₱8,275.27) at 12:04:45. At 10:01:30: ₱1,418.26 / ₱8,226.00 / ₱335.59 now, which is the brief's ₱1,418 / ₱8,226 / ₱336. At the brief's 10:44 it would have been ₱1,428.7, so the consultant is right that the brief quoted the 10:01 reading | Holds |
| Company fund | My second-by-second fund equals the cash branch's end-of-day ledger on all 31 days (largest difference ₱0.00) and Finance's ₱340 now | Holds |
| Fund at the moments quoted | ₱5,120 (6 Nov sell-out), ₱5,440 (18:32:08), ₱7,680 (just before Batch 2), ₱3,806 (13 Nov reserve), ₱6,926 (19 Nov 11:16), ₱7,266 (12:11), ₱11,446 (end of 24 Nov), ₱4,232 (after Batch 3), ₱0 (after the payout), ₱340 | Holds |
| Owed by buyers | ₱4,480 (6 Nov sell-out), ₱5,000 (19 Nov 11:16), ₱5,060 (16 Nov 11:16) | Holds |
| Payment terms | Batch 1 paid by the owners. Batch 2 on pick-up: the 26 Nov migration dated its payment on the arrival day with the batch's own entry time, so this is a book convention, as the analysis says. Batch 3 paid at order. Tax payable and money owed on other batches are ₱0 at every moment the rules look at | Holds |
| Stretch 1 split | Waiting for money 25 s, then Not recorded 3.05812 days (₱1,082.56). Counting Batch 2's payment at the end of 9 Nov instead of at its arrival changes nothing | Holds |
| Stretch 2 split | Waiting for money 0.03808 days (26 Nov 11:16:21 to 12:11:11), then Ordered late: 0.99553 days to 12:04:45 (₱352.41), or 5.80818 days to 2 Dec 07:34:58 (₱2,056.07) | Holds |
| November split | Money 0.03837 + Not recorded 3.05812 + Ordered late 0.99553 = 4.09203 days. That equals the empty time exactly. Whole pesos by largest remainder: ₱14 + ₱1,083 + ₱352 = ₱1,449 | Holds |
| Plan range and shares | (₱352) to (₱1,435). Known cause 25.3%. A planning-only figure is 24.3% of the total | Holds |
| One rate | Every part is days × ₱353.9951. The high estimate's empty part is ₱2,355.30 (late ₱573.01, not recorded ₱1,760.20, money ₱22.08). Its partly-stocked part is ₱5,919.97 | Holds |
| Sensitivity | Every row of the 5 / 7 / 10-day × payment-terms table. The late part is 5.8082 days for any delivery of 6.9619 days or more, otherwise delivery − 1.1537 days. Testing planning before money makes money ₱0 at 7 and 10 days | Holds |
| Order-by dates | Reorder point 22.6 first crossed 10 Nov 18:54:29: 8 of 30 sold, fund ₱3,146, 14.53 days before the order. ₱6,850 first held 19 Nov 08:46:15. Latest on-time moment 19 Nov 11:16:21. Money enough 19 Nov 12:11:11, 5.8082 days before the order. 1 piece left when Batch 3 was ordered | Holds |
| Batch 3 on pick-up instead | Safe to distribute at 07:48 would still have been ₱4,232 (profit kept ₱8,660.13), so the payout fits. ₱7,554 in the fund on pick-up | Holds |
| Partly-stocked part | Batch 1's tail: 5.7720 days, 6 pieces, (₱2,365.58). Batch 2: 8.9455 days, 10 pieces, (₱3,554.39). 52.32 and 65.25 flavour-days missing. No flavour was reordered | Holds |
| Live SQL | At 15:42:36: Ordered late 1.14682, Not recorded 3.05812, Waiting for money 0.03837 (4.24331 days). My script at the same second gives the same numbers | Holds |

**So what:** the analysis can be trusted as arithmetic. The problems are in two sentences and in rules that today's
records don't exercise.

## 4. Errors the owner would read

### 4.1 "Pick-up terms would have made the plan's 12–14 Nov date affordable"

Where: §4 ("On pick-up terms, the plan's date would have worked"), §7 #5 and recommendation 5.

The claim rests on the app's 7-day guess. The 10–11 Nov projection in `docs/HISTORY.md` assumed something else:
"order Batch 3 around 12–14 Nov … it arrives 17–19 Nov", a 5-day delivery.

On pick-up terms the bill is due the day the batch is collected. The fund on that day:

| Ordered | Delivery | Collected | Fund that day (start / noon / end) | ₱6,850 (projection) | ₱7,214 (Batch 3) |
|---|---|---|---|---|---|
| 12 Nov | 5 days | 17 Nov | ₱4,486 / ₱4,486 / ₱5,566 | No | No |
| 13 Nov | 5 days | 18 Nov | ₱5,566 / ₱5,566 / ₱5,906 | No | No |
| 14 Nov | 5 days | 19 Nov | ₱5,906 / ₱6,926 / ₱8,286 | From 08:46 | From 12:11 |
| 12 Nov | 7 days | 19 Nov | ₱5,906 / ₱6,926 / ₱8,286 | From 08:46 | From 12:11 (₱288 short at noon) |
| 13 Nov | 7 days | 20 Nov | ₱8,286 all day, ₱8,966 at the end | Yes | Yes |
| 14 Nov | 7 days | 21 Nov | ₱8,966 all day, ₱9,646 at the end | Yes | Yes |

- **Wrong as stated:** "12–14 Nov affordable (fund ₱8,286–₱8,966 on arrival)". The 12 Nov order fails even on
  7 days, and on the plan's own 5 days only the 14 Nov order works.
- **Correct:** "On pick-up terms, a 13–14 Nov order would have been affordable only if delivery takes about 7 days.
  On the 5 days the plan assumed, the fund was ₱1,300 to ₱2,700 short on 17–18 Nov, and had the money only from
  19 Nov."
- **So what:** pick-up terms alone wouldn't have rescued the plan's date. The plan also needed a smaller order, or
  about ₱1.3k to ₱2.7k more. That strengthens the analysis's own point that the plan needs a money check on its
  order-by date.

### 4.2 "From 100% to 17% (cash branch, at ₱6,224)"

Where: recommendation 5 and §7 #5. Recommendation 4 already uses the math check's 98% at ₱5,664, so these two
recommendations quote two different order sizes side by side.

These are the cash branch's own `simulate()` results, 10,000 trials with seed 7. The ₱6,224 rows reproduce that
branch's own figures.

| Batch 4 order | Paid at order | On pick-up | 25 Nov payout held, paid at order |
|---|---|---|---|
| ₱6,224 (rejected size) | 99.7% short, median top-up ₱2,598 | 16.6%, ₱452 | 1.7%, ₱114 |
| **₱5,664 (adopted)** | **98.4%**, ₱2,050; (₱953 to ₱1,551) of gross profit at risk | **7.2%**, ₱529; (₱8 to ₱13) at risk | **0.1%** |

- **Correct:** "Pick-up terms cut Batch 4's chance of being short from 98% to about 7%. Holding the 25 Nov payout
  would have cut it to almost 0%."
- **So what:** both levers are confirmed at the adopted order size: keeping the next order's money before a payout
  (recommendation 4) and pick-up terms (recommendation 5).

## 5. The rules on edge cases

I put synthetic stretches through my implementation of the spec's rules. I also ran the consultant's SQL on every
case except E2 and E4. It agreed with my implementation everywhere except E8 and E9. There it agreed with my copy of
its breakpoint method instead, and that difference is the defect. Day 0 is a made-up start date. The usual delivery
is 7 days. The shelf empties on day 10 unless stated.

| # | Case | The rules give (days) | It should say | Verdict |
|---|---|---|---|---|
| E5 | Ordered day 7, before the sell-out, paid at order; arrives day 20 | Ordered late 4, supplier 6 | The same | Correct |
| E1 | Shelf empty, nothing on order. Fund ₱3,000, then ₱5,000 from day 5; last company batch ₱5,000 | Money 2, late 3 | The same | Correct |
| E11 | A stretch across the month end (28 Nov 12:00 to 3 Dec 12:00) | Nov: late 2.5. Dec: late 1.0 and supplier 1.5 | The same; the clipping is exact | Correct |
| E4 | One order: on pick-up, then paid at order (Python only) | Pick-up: money 1, late 8. At order: money 8, late 1 | The same | Correct |
| E2 | Batch with no order day, money there (Python only) | Not recorded 3 | The same | Correct |
| **E6** | **Two orders.** X ordered and paid day 1 (due day 8), still on the way. Y ordered day 12, came day 15 | **Ordered late 5** | **Supplier 5** | **Wrong.** The rules look only at the batch that ended the gap. An open stretch uses the earliest order on the way, so its split can also change when it closes |
| **E7** | **Part payment.** ₱3,000 at order on day 12 and ₱3,000 on arrival on day 19. Fund ₱5,000, then ₱2,000 after the first payment, ₱3,000 from day 16 | **Late 5, money 4** | **Money 6, late 3** | **Wrong.** An on-time order pays ₱3,000 at τ, so on arrival on days 10–12 only ₱2,000 is left. The test on arrival counts that ₱3,000 a second time |
| **E8** | **Tax rate 3%.** Fund ₱5,200. A ₱10,000 credit sale on day 4 adds ₱300 of tax payable, so the money is short until a ₱200 collection on day 5. Bill ₱5,000 at order on day 12 | **Money 2, late 7** | **Money 1, late 8** | **Wrong.** The credit sale is not a breakpoint, so a whole piece takes its midpoint's cause |
| **E9** | **Another order** (₱2,000, unpaid) booked on day 4. Bill ₱5,000 at order on day 12. Fund ₱6,000 | **Money 9** | **Late 1, money 8** | **Wrong.** The other order's booking date is not a breakpoint |
| **E10** | **Ordered day 3, paid day 6** with the money there. It came day 13, 7 days after paying | **Supplier 3** | **Late 3**, on prepaid terms | **Wrong.** On prepaid terms the delivery time starts at payment |
| **E12** | **A void while the shelf is empty.** Sold out day 10, an old sale voided day 12, sold again day 13. X (ordered and paid day 1, due day 8) arrives day 18 | **Late 2, then supplier 5** | **Supplier 7** | **Wrong.** The void ends the first stretch with no batch, so that part is judged as "nothing on order" |
| E3 | **No order day, but paid (dated) day 5.** Came day 20 | Not recorded 10 | Not recorded about 3, supplier about 7 | Information lost. A payment before the batch came proves it had been ordered by then |
| **E13** | **The old line made inactive.** P1 sold out day 10; the new line came day 13 and sold out day 20 | **Active:** late 3 + 7 = 10. **Inactive:** late 7 | 10 either way | **Wrong** (inherited from `ops.v3.sql`). History changes when a product is made inactive. On the real data, making Batch 1's 10 sold-out flavours inactive would remove the 6–9 Nov stretch, its (₱1,083) and part of the pace |

The SQL results come from the harness at
`/tmp/claude-0/-home-user-cloud-factory-pos/1266ee19-7c3f-596f-a8a9-3b4759fe376f/scratchpad/audit-esc/sqltest/harness.py`,
with its output in `sql_edge_results.txt` in the same folder. The scratchpad is temporary. The Python rows are in
section 12 of this check's script.

**How likely each is here:**

- **E7 (part payment).** Order stock already offers a downpayment, so this will come up.
- **E8 (tax).** The tax rate is 0% only until the accountant confirms it. The default is 3%.
- **E6 and E9 (two orders at once).** These start as soon as Batch 4 is ordered while Batch 3 is on the way, which the
  math check's 2–7 Dec window allows.
- **E12 (a void).** On 25 Nov a void and re-ring happened 25 seconds apart. It did no harm only because Sparkle
  Squeeze was still on the shelf.
- **E13 (an inactive product).** A natural tidy-up for a line that isn't coming back.

## 6. Spec defects

| # | Where | What it says | Problem | Correct |
|---|---|---|---|---|
| a | Scorecard spec A, `money_enough_at` | "m0 = the last fund moment before order_at with available < due; money_enough_at = the next fund moment after m0, or latest_on_time if m0 is before it" | Here m0 = 19 Nov 08:46:15, which is before latest_on_time (11:16:21). Read literally, that gives 11:16:21 and `order_days_late` 5.85. Section F expects 12:11 and 5.81, and so does the spec's own first sentence | `money_enough_at = greatest(latest_on_time, the next fund moment after m0)`, or latest_on_time when there is no m0 |
| b | Scorecard spec C | "The cause can only change at the breakpoints in bp, so classifying each piece at its midpoint is exact" | Available money also changes at events the list leaves out: completed sales when `tax_rate_bp` > 0, another batch's `booked_at`, and owner or investment payments on other batches. See E8 and E9 | Add those times to `bp`, each also shifted by +L for the at-order test. Or classify a per-minute grid; the data is small |
| c | Cause tree 1 vs app spec 1 | "By choice: shop closed at t … counts_in_total: true" vs "Closed days … leave the pace denominator and the empty time" | Contradiction. A closed shop loses no sales, so its empty hours aren't an opportunity cost | Closed time leaves both the empty time and the pace. "By choice" covers only paused ordering and stopped carrying |
| d | Cause tree 1 vs `add_shelf_note` | "made by the owner before the gap starts" vs "refuses from_at earlier than now() − 1 day" | A "closed" note can still be dated up to a day into a gap | Say which rule holds. If same-day notes are wanted, say so |
| e | Scorecard spec, GOAL | "Keep every existing ops field (same names, meanings, values)", then `lead_days` "becomes the planning engine's blend" | That changes the meaning of `lead_days`, and of `cost_of_ordering_at_sellout`, which uses it. It is still 7 today | List it as a changed field |
| f | App spec 1 and 3 | `plan_snapshots` "upserted by the first Restock load of the day"; test "Exactly one plan_snapshots row per day" | A day with no Restock visit has no row | Use pg_cron, or test "at most one row a day" |
| g | Payment terms field | `pay_terms` in ('at_order', 'on_pickup', 'part') | There is no option for "paid after delivery" (supplier credit). The pick-up test would then ask for money the shop didn't need on arrival | Add 'after_delivery', and test it against the due day |

## 7. Minor slips

- **Stretch 1, "the fund held only ₱1,600 to ₱3,840 five to seven days before arrival"** (structured result, basis
  and sensitivity). Five to seven days before arrival it held ₱2,240 to ₱3,840, as the .md's §3.1 says. ₱1,600 was
  the fund on 30 Oct at 18:31, the latest on-time day at 7 days, which is 10 days before arrival.
- **§7 #5, "(6–9 Nov: ₱1,083 either way)".** On the recorded terms the ₱1,083 is "Not recorded"; paid at order it
  would be "Waiting for money". Neither is planning, so "either way" misleads.
- **§8, the KPI sub-line example "Ordered late ₱352 · Not recorded ₱1,083 · Waiting for money ₱14"** isn't largest
  first, as its own rule says. Scorecard spec E has the right order.
- **The answer's list "by choice, then waiting for money, then not recorded, then ordered late, then supplier"**
  leaves out that a supplier hold is tested before Not recorded (cause tree 3). It is ₱0 today.
- **"The supplier isn't late"** depends on the 7-day guess. On the owner's own 5-day plan, a 25 Nov order is due
  30 Nov. A 2 Dec arrival would then show (₱1,362) ordered late and (₱708) supplier, out of the same (₱2,070).
- **The metrics file.** The 12 sensitivity rows share 10 key names (two stretches × five causes), so only each
  stretch's last row survives. For example, `shown_sensitivity_stretch_2_late_order` = 3,132 is the 10-day pick-up
  what-if, not the recorded case. The printout is right.
- **Rounding on a moving total.** Largest-remainder rounding of the month makes a closed stretch's pesos change by
  ₱1 as the open stretch grows. At 15:42 the month shows Not recorded ₱1,082 (₱1,083 at 12:04), and the open
  stretch shows Waiting for money ₱13 (₱14 at 12:04). The batch page would still say ₱1,083. Round each closed
  stretch on its own and give the open one the remainder. The spec's "expected live values" depend on the time of
  day for the same reason.

## 8. Fixes, ranked by impact and ease

| # | Fix | Impact | Owner | Timing | KPI or test |
|---|---|---|---|---|---|
| 1 | Correct §4.1 and §4.2 in recommendation 5, §4 and §7 #5 | The owner gets the right reason for pick-up terms (98% → 7%), and doesn't think pick-up alone would have saved 12–14 Nov | Analysis author | Before the review is shared | Every number quoted at ₱5,664 |
| 2 | `money_enough_at = greatest(latest_on_time, the next fund moment after m0)` | The harness's expected 12:11 and 5.81 days come out | Engineering | Before the scorecard publish | Section F values reproduce |
| 3 | Add the missing breakpoints, or use a per-minute grid | Correct splits once the tax rate is above 0% or two orders are on the way | Engineering | Before the tax rate changes, or before Batch 4 is ordered | DB tests E8 and E9 |
| 4 | Judge against every order outstanding at τ, not only the batch that ended the gap: supplier if any order placed by τ hadn't come by t | Nobody ordering is blamed for a late delivery | Engineering | With `empty_shelf_causes()` (task 23) | DB test E6 |
| 5 | On part terms, test available(t) − the part paid ahead (if paid after t) against the part due on pick-up | No pesos counted twice | Engineering | With the downpayment in Order stock | DB test E7 |
| 6 | On prepaid terms, the order counts as placed when it is paid: the later of the order day and the first payment | A payment delay goes to the shop, not the supplier | Engineering | Same | DB test E10 |
| 7 | Merge empty stretches split by stock that didn't come from a batch (a void or a count), and judge them against the next batch to arrive | A void no longer turns a supplier delay into "ordered late" | Engineering | Same | DB test E12 |
| 8 | Build the shelf from every product, not only active ones (in `ops.v3.sql` too) | Making a line inactive can't erase its history | Engineering | With fix 3 | DB test E13 |
| 9 | Use a payment dated before arrival as the latest possible order day | Some "Not recorded" becomes a known cause | Engineering | With Receive batch's order day | DB test E3 |
| 10 | Settle §6 c to g and the slips in §7 | Specs that agree with each other | Analysis author and engineering | Before the build | — |

## 9. Against the math check

| Figure in the analysis | Math check | Agrees? |
|---|---|---|
| Ordering by the reorder point is worth +₱3.7k to ₱4.0k a month in the base case, or about ₱1.1k if thin shelves lose nothing | §4.3 iii | Yes |
| Batch 4 at ₱5,664: short in 98% of trials, (₱953 to ₱1,551) at risk (recommendation 4) | §4.3 ii | Yes (98.4% re-run) |
| Batch 4 on pick-up: "100% to 17% (at ₱6,224)" (recommendation 5) | §4.3 ii and fix 6: re-quote at ₱5,664 | **No:** 98% → 7% |
| Reorder point 22.6 pieces | §4.1 (22.64) | Yes |
| Cash ₱11,446 at the end of 24 Nov | §4.4 (₱11,786 corrected to ₱11,446) | Yes |
| ₱354 / ₱576 a day; 27.03 days with stock | §4.1 | Yes |
| Order Batch 4 about 2 to 7 Dec (§10) | §4.3 iv | Yes |
| "The plan's spare stock covers normal swings" (cause 6) | §4.2 c: about 1 cycle in 9 runs short while history is short | Loosely. The supplier bucket also holds the spare stock's own misses |
| Lost sales 1.42 → 0.59 a day when ordering at the reorder point | Stock branch table, pay-out-all rows; not corrected by the math check | Yes |

## 10. Risks and open points

- **The ₱354 assumes every empty day's sales are lost, not just delayed.** The data don't show a catch-up. After the
  6–9 Nov gap, 8 pieces sold on the first full evening (10 Nov, within 11 minutes), then none for two days. That is
  2.67 a day over 72 hours, against 2.22. But 25 days of history can't rule a catch-up out. If buyers wait, the
  total is smaller. The split stays the same.
- **Everything still rests on the 7-day guess and on Batch 2's book-convention payment day.** The analysis says so.
  Batch 3's Arrived day is the first real delivery time.
- **The SQL edge cases ran in a local copy of the schema**, built from the repo's migrations, not on the live
  project. The live run (15:42:36) only re-tested today's data.

## 11. Sources

**Shop data:**

- The `analysis/baseline.py` data block (26 Nov 18:59).
- The entry times in `analysis/cash-and-capital.py` (26 Nov 19:18).
- Read-only checks inside `begin … rollback`:
  - 27 Nov 15:20:47: counts, payment seconds, entry times, zero-change movements, inactive products, tax rate;
  - 27 Nov 15:42:36: the consultant's `causes-check.sql`, run as the owner.
- `docs/HISTORY.md` (the 10–11 Nov projection) and `supabase/migrations/20261126000000_batch_orders.sql` (how
  Batches 1 and 2 got their payment days).

**Earlier analyses:** `math-check.md` §4.1 to §4.4, `cash-and-capital.py` (`simulate()`, re-run here at ₱5,664) and
`stock-and-ordering.md`.

This is a check of planning arithmetic and of a build spec. It isn't accounting advice.
