# Why was the shelf empty? Should the empty-shelf cost count only planning days?

The owner asked: *"Should opportunity cost only account for days with no stock on shelf because of poor restock
planning?"*

As of **Friday 27 Nov 2026, 12:04 Manila**. I re-checked the live data read-only at that minute. Nothing has changed
since 26 Nov 11:16: 52 sales, 36 payments, 81 stock movements, and Batch 3 is still on the way.

The brief quoted ₱1,418 / ₱8,226 for November. That was the 10:01 reading of the same figure. The open gap adds about
₱15 an hour (₱354 a day) until Batch 3 arrives.

Every number below comes from `analysis/empty-shelf-causes.py`:

- Run `python3 analysis/empty-shelf-causes.py`. It runs offline in a few seconds and needs only numpy and pandas. Add
  `--now "YYYY-MM-DD HH:MM:SS"` to measure the open gap at another time.
- It reads the data block of `analysis/baseline.py` and adds the entry times, to the second, of the records the rules
  need.
- It reproduces the scorecard's own figures (₱354 a day; ₱1,418 / ₱8,226 at 10:01).
- It writes `analysis/empty-shelf-causes_metrics.json`.

The same split, written as SQL for the scorecard, ran read-only on the live database as the owner and gave the same
minutes to the second. Amounts are pesos (₱). Lost profit is shown in brackets.

## Bottom line

**No. Keep counting every hour the shelf is empty.** Each one cost the shop the same ₱354 a day of profit, whatever
the reason, and that total is what being in stock is worth.

**But you are right that the total is the wrong yardstick for the reorder plan.** Split it by cause, worked out from
the app's own records, and judge the plan only on the part where the order went in late while the money for it was
there.

- **November so far: 4.09 days with nothing on the shelf, (₱1,449).** That splits into:
  - ordered late (₱352);
  - not recorded (₱1,083), because Batch 2 has no order day;
  - waiting for money (₱14);
  - the supplier ₱0, and by choice ₱0.

  So the plan's share is **(₱352) at least and (₱1,435) at most**.
- **The gap open now will cost about (₱2,070) by Batch 3's expected arrival.** That is Wed 2 Dec 07:34, on the 7-day
  starting guess. **(₱2,056) of it is planning.** The fund could pay Batch 3's ₱7,214 from 19 Nov 12:11, and a reserve
  had been kept for it since 13 Nov, but the order went in on 25 Nov 07:34, **5.8 days later**. The supplier isn't
  late: a 25 Nov order is due on 2 Dec.
- **A planning-only number would show (₱352) of (₱1,449) this month (24%).** It would hide two things:
  - the 3.06 days in early November that nobody can explain yet;
  - what payouts cost when the fund can't pay the next order. In the math check's trials, the fund is short of
    Batch 4's money 98% of the time.

**Decisions needed:**

1. Approve the five-part split on the scorecard (§8).
2. Start recording four things:
   - an order day for every batch (and fill in Batches 1 and 2 if you remember them);
   - the payment terms of each order;
   - a daily copy of the plan's order-by date;
   - dated notes for gaps you choose on purpose.

## Situation, complication, resolution

- **Situation.** The scorecard values every hour with nothing on the shelf at ₱354 a day: 2.22 pieces a day while the
  shop has stock × ₱159.45 of profit a piece. For November so far that is at least (₱1,449) and at most (₱8,275) with
  thin shelves.
- **Complication.** A shelf can be empty for five different reasons, and only one of them is the reorder plan's
  fault:
  - the order went in late;
  - the fund couldn't pay;
  - the supplier was slow;
  - the owners chose it;
  - nobody recorded when the order went in.

  If the total counts only planning, it understates what empty shelves cost, hides the money and supplier causes, and
  rewards not recording order days. If it counts everything against the plan, the person ordering is blamed for
  payouts and the supplier.
- **Resolution.**
  - Keep the total as the headline.
  - Give every empty minute exactly one cause, by fixed rules applied in a stated order, so the parts add up to the
    total.
  - Judge the plan on **Ordered late**.
  - Take **Waiting for money** to the payout decision.
  - Record the four things that make the split complete.

## Assumptions

| # | Assumption |
|---|---|
| A1 | **Data.** The data is the `baseline.py` data block (26 Nov 18:59 pull), plus entry times to the second from a read-only check at 27 Nov 12:04:45. All figures are as of that minute. |
| A2 | **Value of an empty minute.** I use the scorecard's own value: pace while the shop has stock (2.22 a day; 90 days, timed to the minute) × landed gross profit (₱159.45) = **₱354 a day**. For the high estimate it is **₱576 a day** at the full-shelf pace. The cause never changes the value. |
| A3 | **Usual delivery time.** It is **7 days**, the app's starting guess: no batch has both an order day and an Arrived day yet. Later it is learned as (recorded days + 7) ÷ (orders + 1), from batches other than the one judged. Tested at 5 and 10 days. |
| A4 | **The moment an order went in.** It is the order day at the time it was entered, if entered that day. Batch 3: 25 Nov 07:34:58. An order day entered later counts at noon. |
| A5 | **Money the fund could put toward an order.** It is company cash − tax still owed − what is owed to suppliers on other batches. Both deductions are ₱0 today. The inventory reserve counts as available, because it is kept for exactly this order. Each receipt and payment counts when it was entered, but no later than its own day. |
| A6 | **Payment terms** come from the payment records: paid before the batch came = at order, otherwise on pick-up. Batch 2's "paid on 9 Nov" comes from the 26 Nov change that gave every older batch one payment on its arrival day. It is a book convention, so it is tested both ways. |
| A7 | **The batch that ends a gap** is the one whose restock ended it (Batch 2), or the earliest order on the way (Batch 3). |
| A8 | **Privacy.** No buyer names; only totals. |

## 1. What the number is for

An **opportunity cost** is the profit given up by not taking the best alternative that was really open. It belongs to
a choice and to the person who made it (Buchanan, 1969). So "what did empty shelves cost?" and "what did this decision
cost?" are different questions with different numbers.

| What you want to know | The alternative | The right number | November so far |
|---|---|---|---|
| What empty shelves cost the shop, and how hard to push on staying in stock | Stock on the shelf | **All causes** | (₱1,449) at least, (₱8,275) at most |
| Is the reorder plan, and whoever orders, doing well? | The order placed in time | **Ordered late**; with Not recorded as the top of the range | (₱352) to (₱1,435) |
| Should we pay out, and how much should we keep for the next order? | The money kept in the fund | **Waiting for money** | (₱14); Batch 4 is at risk (§7 #4) |
| Are the supplier's terms and speed good enough? | A faster or more reliable supplier | **Supplier** | ₱0 so far (no delivery measured yet) |
| What did our own choices cost? | Not taking that choice | **By choice** | ₱0 (nothing recorded) |

Management accountants call this **responsibility accounting**: judge people on what they control, and keep the full
cost on the books. Antle and Demski (1988) sharpened the rule. Information about things a manager doesn't control is
still worth using: it filters noise out of the judgement. That is what the split does, instead of dropping those
hours. Merchant (1987) found that firms often hold managers to some things they can't control, on purpose, so that
they react to them. That is one more reason to keep the total in view.

Retail out-of-stock studies work the same way. Gruen, Corsten and Bharadwaj (2002) traced out-of-stocks to where they
started: store ordering and forecasting, shelf restocking, or upstream supply. Most started inside the store. Here the
same idea is applied to the whole shop.

**Incentives decide the design.**

- **Counting only planning hours would reward the wrong things:**
  - not recording order days, because an unknown cause would be excused;
  - payouts would look free;
  - slow deliveries would vanish from view.
- **Charging every hour to the plan would also backfire.** The person ordering would be blamed for the owners'
  payouts and for the supplier. The natural reaction is to order too early or too much, which ties up the cash the
  fund needs.
- **So the design follows four rules:**
  - every rule works from records, never from reasons typed afterwards;
  - Not recorded counts toward the top of the plan's range;
  - By choice can only come from a note the owner makes in advance;
  - Waiting for money is computed from the fund's own balance.

## 2. The cause tree for time with nothing on the shelf

Each empty minute *t* goes to **the first cause that applies**, in this order. The rules use one more moment, **τ =
t − the usual delivery time** (7 days today): the latest moment an order had to be in for stock to be on the shelf at
*t*, on a usual delivery.

| Order | Cause | Rule, worked out from the records | Who can change it | The lever |
|---|---|---|---|---|
| 1 | **By choice** | A dated owner note covers it: shop closed at *t*, ordering paused on purpose at τ, or stopped carrying stock | Owners | The decision itself, weighed at ₱354 a day |
| 2 | **Waiting for money** | On the terms used, the company fund couldn't pay what was due when it was due. Paid at order: tested at τ, while the order wasn't paid yet. Paid on pick-up: tested at *t*. Why it was short, tested in this order: payouts since the last order, then money owed by buyers, then not earned yet | Owners (payouts, reserve, top-ups) and the supplier's terms | Keep the next order's money before payouts, pay on pick-up, collect what's owed |
| 3 | **Supplier: couldn't take the order** | A dated supplier note covers τ | Supplier | Another supplier, or order earlier |
| 4 | **Not recorded** | The batch that ended the gap has no order day, so 5 and 6 can't be told apart | Whoever records orders | Record the order day |
| 5 | **Ordered late (planning)** | At τ the order wasn't in yet, the money was there, and nothing above applies | The reorder plan and whoever orders | Order by the plan's order-by date |
| 6 | **Supplier: slower than usual** | At τ the order was already in, but the stock came later than the usual delivery time | Supplier (the plan's spare stock covers normal swings) | Spare stock, supplier terms, another supplier |

- **Parts add up exactly.** 5 and 6 never overlap (τ is either before or after the order), so every minute has exactly
  one cause.
- **Why this order.**
  1. Choices made on purpose come first.
  2. Next comes anything that made an on-time order impossible (money, a supplier hold): the plan can't be blamed for
     hours it couldn't have prevented.
  3. Then missing records, then the plan.
  4. The supplier's slow delivery is the rest.
- **The order matters only where money and planning overlap.** Tested the other way round (planning before money),
  Waiting for money falls from (₱14) to ₱0 at 7 days' delivery, and from (₱1,076) to ₱0 at 10 days.

**Which "should have ordered by" date:**

- **For the pesos: the latest on-time day** = the moment the shelf emptied − the usual delivery time.
  - It is the latest an order could go in and still arrive in time on a usual delivery.
  - Every hour after it was avoidable, which is fair to the person ordering.
  - Spare stock, normal swings in delivery and the plan's caution don't count against them.
- **For the process: the plan's order-by date** (the reorder point, with spare stock), read from a daily copy of what
  the plan said.
  - It comes earlier, by the spare stock.
  - Ordering after it but before the latest on-time day is a risk taken, not a loss.
  - Report it in days late, with that day's money check, not in pesos.

## 3. The two empty stretches

### 3.1 Fri 6 Nov 18:31 to Mon 9 Nov 19:55: Batch 2 has no order day

| | |
|---|---|
| Shelf empty | 6 Nov 18:31:43 (Batch 1's last piece) to 9 Nov 19:55:50 (Batch 2's first restock): **3.06 days, (₱1,083)** |
| Ended by | Batch 2, 30 Black TEO. **No order day recorded.** |
| Paid | ₱5,194 from the company fund, on its arrival day (book convention, A6) |
| Fund when the shelf emptied | ₱5,120, ₱74 short; ₱5,440 from 18:32:08, and never below the bill again before Batch 2 came (₱7,680 just before) |
| **Split** | Waiting for money 25 seconds (₱0) · **Not recorded 3.06 days (₱1,083)** |

What the records can and cannot say:

1. **Money did not hold Batch 2 up, on the terms recorded.** From 25 seconds after the shelf emptied, the fund could
   have paid on pick-up. The 25 seconds were credit not yet collected (buyers owed ₱4,480), not a payout.
2. **"Paid on arrival" is the only reading that fits.** Had Batch 2 been paid at order, the fund needed ₱5,194 five to
   seven days before 9 Nov. It held ₱2,240 to ₱3,840 then (43% to 74%). That only works if delivery took 3.06 days or
   less.
3. **Cash on the latest on-time day was ₱2,240 (1 Nov, at 5 days), ₱1,600 (30 Oct, at 7) or ₱0 (27 Oct, at 10).** That
   is 0% to 43% of the bill. It doesn't matter when paying on pick-up. Paying at order, all 3.06 days would be Waiting
   for money.
4. **The 3.06 days were a late order, a slow delivery, or both. Without the order day, the records can't say which.**
   - If delivery took the usual 5, 7 or 10 days, the order went in on 4 Nov, 2 Nov or 30 Oct (19:55), with 1, 6 or 7
     pieces left. That is 3.06 days after the latest on-time day: all **ordered late**.
   - If the order went in on time, delivery took 3.06 days longer than usual: all **supplier**.
   - The shop's habit of ordering near sell-out makes a late order the likelier story. Batch 3 went in with 1 piece
     left. But that is an inference, not a record.

**So what:** this is three quarters of November's empty-shelf cost. One number would settle it: the day Batch 2 was
ordered. You can still enter it on Batch 2's page (Edit supplier, date or note).

### 3.2 From Thu 26 Nov 11:16: Batch 3 ordered on 25 Nov and paid at order

| When | What happened | The fund |
|---|---|---|
| Fri 13 Nov 08:37 | Reserve set to ₱7,194 for the next order | ₱3,806 |
| **Thu 19 Nov 11:16** | **Latest on-time day** (the shelf emptied 26 Nov 11:16, − 7 days) | ₱6,926, ₱288 short of ₱7,214 |
| **Thu 19 Nov 12:11** | A ₱340 payment comes in: **the fund can pay Batch 3 at order, and stays able** | ₱7,266 |
| Wed 25 Nov 02:04 | Reserve set to ₱7,014 | ₱11,446 |
| **Wed 25 Nov 07:34** | **Batch 3 ordered and paid, ₱7,214** (40 pieces), 1.15 days before the shelf emptied | ₱4,232 after |
| Wed 25 Nov 07:48 | Payout of ₱4,232 (owner : manager 2 : 1) | ₱0 |
| Thu 26 Nov 11:16 | Last piece sold: **shelf empty** | ₱0; ₱340 from 11:16:44 |
| Wed 2 Dec 07:34 | Expected arrival: order + 7 days (starting guess) | — |

| Lost profit, gap from 26 Nov | So far (to 27 Nov 12:04) | By the expected arrival (2 Dec 07:34) |
|---|---|---|
| Ordered late (planning) | 0.996 days (₱352) | **5.81 days (₱2,056)** |
| Waiting for money | 55 minutes (₱14) | 55 minutes (₱14) |
| Supplier, not recorded, by choice | ₱0 | ₱0 |
| **Total** | **1.03 days (₱366)** | **5.85 days (₱2,070)** |

- **Why ordered late.**
  - The order went in 5.8 days after the money for it was in the fund. The owners had kept a reserve for it since
    13 Nov.
  - The order is on its way and the supplier isn't late. Seven days is the usual time, so stock on 2 Dec is on time
    for a 25 Nov order.
  - The shelf is empty because the order went in after 19 Nov.
- **Why 55 minutes of waiting for money.** On 19 Nov at 11:16 the fund was ₱288 short while buyers owed ₱5,000. That
  is money owed by buyers, not a payout: there was no payout before 25 Nov.
- **Within November**, if Batch 3 comes on 2 Dec, the shelf will be empty 7.59 days, about (₱2,686). Of that, (₱1,590)
  will be ordered late.

### 3.3 Sensitivity: delivery time and payment terms

| Delivery | Payment terms | 6–9 Nov (3.06 days, ₱1,083) | From 26 Nov, to the expected arrival | From 26 Nov, so far (1.03 days, ₱366) |
|---|---|---|---|---|
| 5 days | as recorded | Not recorded (₱1,083) | 3.85 days (₱1,362): all ordered late | All ordered late |
| **7 days** | **as recorded** | **Not recorded (₱1,083)** | **5.85 days (₱2,070): ordered late (₱2,056), money (₱14)** | **Ordered late (₱352), money (₱14)** |
| 10 days | as recorded | Not recorded (₱1,083) | 8.85 days (₱3,132): ordered late (₱2,056), money (₱1,076) | All waiting for money (₱366) |
| any | the other terms | Paid at order: all waiting for money (₱1,083) | On pick-up: all ordered late (₱1,362 / ₱2,070 / ₱3,132) | All ordered late |

**So what:**

- **The plan's part of the current gap is 5.81 days, (₱2,056), for any delivery time of 6.96 days or more.**
  - It is smaller only if delivery is faster: 3.85 days at 5 days' delivery.
  - A slower delivery adds money days, not planning days. Before 19 Nov 12:11 the fund couldn't have paid at order
    anyway, because ₱5,060 was still owed by buyers on 16 Nov.
- **The payment terms decide the money part.** On pick-up terms the same hours are all planning. Paying at order turns
  the early ones into waiting for money.

## 4. The plan's date and the money

| Should Batch 3 have been ordered by… | When | Batch 3 went in … later | The fund then | Used for |
|---|---|---|---|---|
| The plan's reorder point (22.6 pieces, today's settings, looking back) | Tue 10 Nov 18:54, when 8 of Batch 2's 30 had sold | 14.5 days | ₱3,146 | Process (days) |
| The 10–11 Nov projection (`docs/HISTORY.md`): "order Batch 3 around 12–14 Nov, about ₱6,850" | 12 to 14 Nov | 10.3 to 13.3 days | ₱3,146 to ₱4,146 | Process (days) |
| The money was first enough at order | 19 Nov 08:46 (for ₱6,850) or 12:11 (for ₱7,214) | 5.95 or 5.81 days | ₱6,926 / ₱7,266 | — |
| The latest on-time day | Thu 19 Nov 11:16 | 5.85 days | ₱6,926 | **Pesos** |

**So what:**

- **The plan's date could not be paid at order.**
  - On 12–14 Nov the fund held ₱3,146 to ₱4,146 against about ₱6,850.
  - So, measured against the plan, 12 Nov to 19 Nov was waiting for money.
  - 19 Nov 12:11 to 25 Nov 07:34 (5.8 days) was the order not going in.
  - Both views agree on those 5.8 days.
- **On pick-up terms, the plan's date would have worked.** An order on 13 or 14 Nov would have been due on arrival
  (20 or 21 Nov), when the fund held ₱8,286 or ₱8,966. An order on 12 Nov would have been ₱288 short at noon on 19 Nov.
  This is why the plan needs a money check on its own date, which is already on the engine build list. It is also why
  supplier terms matter.
- **The reorder-point date above is hindsight**, using today's settings. Judging the plan fairly needs a daily copy of
  what it said at the time.

## 5. Thin shelf: the high estimate

The high estimate, (₱8,275), has two parts:

- **(₱2,355)**: nothing on the shelf, valued at the full-shelf pace (4.09 days × ₱576). Its split follows §3:
  - ordered late (₱573);
  - not recorded (₱1,760);
  - money (₱22).
- **(₱5,920)**: shelf partly stocked:
  - Batch 1's last days, 1–6 Nov: 5.77 days with 1 to 6 of 10 flavours. 6 pieces sold, against 20.8 at the
    full-shelf pace: (₱2,366).
  - Batch 2, 9–26 Nov: 8.95 days with 1 to 6 flavours. 10 pieces sold, against 32.3: (₱3,554).

| Why flavours were missing while the shop still had stock | Lost profit | Share |
|---|---|---|
| **Waiting for the next batch** | **(₱5,920)** | **100%** |
| Not reordered by choice | ₱0 | 0% |

- **All 20 flavours sold out, and none was reordered.** Every batch was a new line.
- **Every arrival put 10 flavours back.** The shelf count recovered whichever line came, so no slot stayed empty past
  the next batch.
- **Flavour-days missing while the shop still had stock:** about 52 (Batch 1) and 65 (Batch 2).
- **Not reordering XBLACK MAX was a line choice, not an empty slot.** It changed which flavours were on the shelf, not
  how many. If it cost anything, the cost is the pace gap between lines: ₱88 against ₱50 a day per flavour on the
  shelf (products branch, unproven). That is not part of this figure.
- **Whose part "waiting for the next batch" is.** Mostly the plan's (when the next batch comes), and partly the depth
  of 3 pieces a flavour.
  - In the stock branch's simulation, ordering at the reorder point cut sales lost from 1.42 to 0.59 a day, about 58%.
  - The rest is single flavours running out.
  - The math check adds that if thin shelves lose no sales at all, the high estimate overstates.
- **What a real split needs:**
  - the range the shop means to carry: a dated "stop carrying" note per product or line, so a deliberate cut stops
    counting as a gap;
  - the next order's lines, which Order stock already records.

## 6. November on the scorecard

| Why the shelf was empty, 1–27 Nov (to 12:04) | Days | Lost profit | Share |
|---|---|---|---|
| Ordered late (planning) | 1.00 | (₱352) | 24% |
| Not recorded (Batch 2 has no order day) | 3.06 | (₱1,083) | 75% |
| Waiting for money | 0.04 | (₱14) | 1% |
| Supplier (slower than usual) | 0 | ₱0 | 0% |
| By choice | 0 | ₱0 | 0% |
| **Nothing on the shelf: the "at least" figure** | **4.09** | **(₱1,449)** | 100% |
| Shelf partly stocked: waiting for the next batch | | (₱5,920) | |
| Nothing on the shelf, valued at the full-shelf pace | | (₱2,355) | |
| **The "at most" figure** | | **(₱8,275)** | |

- **Judge the plan on (₱352) at least and (₱1,435) at most.** The higher figure counts the 3.06 days with no order
  day.
- **25% of the empty time has a known cause.** The target is 90% or more, which needs an order day on every batch.

## 7. Recommendations

Ranked by peso impact × feasibility.

| # | Recommendation | ₱ impact | Owner | Timing | First step | KPI |
|---|---|---|---|---|---|---|
| 1 | **Keep the total as the headline, and add the five-part split** to the scorecard: KPI line, opportunity-cost box, definitions | It names the current gap's (₱2,056) as the plan's and the (₱1,083) as unknown, at no data cost | Engineering | Before the next scorecard publish | Add the tested SQL (§8) to `ops.v3.sql` | Parts add up to "at least" exactly; share with a known cause |
| 2 | **Judge the reorder plan, and whoever orders, on "Ordered late"**, as a range (at most = + Not recorded), at the monthly review | The lever behind it, ordering by the reorder point, is worth +₱3.7k to ₱4.0k a month of gross profit in the base case. It could be as low as about ₱1.1k if thin shelves lose nothing (stock branch; math check) | Owner | Monthly, from the December review | Read the plan line on the scorecard | Ordered-late days a month (target 0) |
| 3 | **Record an order day for every batch.** Fill in Batches 1 and 2 if you remember them; Receive batch should ask "When did you order it?" | Turns (₱1,083), 75% of this month's empty-shelf cost, into a known cause. It also gives the first two delivery times: each day of error in delivery time is about ₱354 a cycle | Owner or manager; engineering for Receive batch | Now (batch page, Edit); Receive batch with the planning engine | Enter Batch 2's order day | Share with a known cause 90% or more; every order has both dates |
| 4 | **Show "Waiting for money" next to the payout**, with the next order's money check | Batch 4 at ₱5,664: the fund is short in 98% of trials, with (₱953 to ₱1,551) of profit at risk (math check). The 25 Nov payout is why | Owner decides; engineering shows it | Before the next payout | Keep the next order's money before paying out (cash branch) | Waiting-for-money days per order (target 0) |
| 5 | **Record each order's payment terms, and ask the supplier for payment on pick-up** | The terms decide whether a gap is money or planning (6–9 Nov: ₱1,083 either way). Pick-up terms would have made the plan's 12–14 Nov date affordable. They cut Batch 4's chance of being short from 100% to 17% (cash branch, at ₱6,224) | Owner (supplier); engineering (field) | With the Batch 4 order | One message to the supplier | Days paid before arrival |
| 6 | **Keep a daily copy of the plan's order-by date** and that day's money check | Lets the plan be judged in days late against what it said at the time. No pesos by itself | Engineering | With the planning engine (task 23) | Add the daily snapshot | Days from the plan's date to the real order |
| 7 | **Dated owner notes** for "by choice" (closed, paused, stopped carrying) and "supplier can't take orders", made at the time | ₱0 today. It keeps chosen gaps and supplier holds out of Ordered late without opening a door to excuses | Engineering | After 1 to 6 | Owner-only record with a date range | Notes made before the gap began |

*Not recommended:* blaming the plan for the whole total, or reporting only the planning part as "the" opportunity
cost. *Left out:* re-estimating the ₱354, a forecast split of Batch 4's gap (§9) and per-flavour cost rates. None of
these change the answer.

## 8. What the scorecard and the app need

**On the scorecard** (`ops.v3.sql`; the field list and SQL are in the appendix):

- **Profit lost to empty shelves KPI.** Keep it, and add a line under it: "Ordered late ₱352 · Not recorded ₱1,083 ·
  Waiting for money ₱14". Show only the parts above 0, largest first.
- **Opportunity-cost box**, two new lines:
  - **"Judge the reorder plan on Ordered late: ₱352 to ₱1,435."** The higher figure counts days with no order day.
  - **"Waiting for money: ₱14."** This line belongs to the payout and reserve decisions.
- **"Empty now" line.** "₱366 so far: ₱352 because the order went in late, ₱14 waiting for money. By the expected
  arrival, 2 Dec (a starting guess): about ₱2,070."
- **Definitions.** Add "Why the shelf was empty": the six rules, their order, and that the parts add up to the "at
  least" figure.

**In the app** (Postgres first, as always):

- **Record:**
  - an order day on every batch (Receive batch too);
  - payment terms at order;
  - a daily copy of the plan's order-by date and money check;
  - dated owner notes (closed, paused, stopped carrying, supplier hold);
  - optionally, the day the supplier said a pick-up order was ready.
- **Show:**
  - Restock: why the shelf is empty now;
  - each batch's report: the gap before it arrived, split by cause;
  - Owner distributions: Waiting for money, next to Safe to distribute.

## 9. Risks: what would prove this wrong

- **The usual delivery time is a guess (7 days).**
  - At 10 days, three more days of the current gap become waiting for money, (₱1,076), and the planning part stays at
    (₱2,056).
  - At 5 days, the gap shrinks to 3.85 days, all planning, (₱1,362).
  - Batch 3's Arrived day is the first real measurement.
- **The supplier may not have been able to take the order before 25 Nov.** For example, BLXCK Signature may not have
  been available yet. Then the 5.8 days are the supplier's, not the plan's.
  - Test: ask the supplier, and say why the order went in on 25 Nov when the money and the reserve were ready from
    19 Nov.
  - From now on, record a dated supplier note.
- **Batch 2's "paid on arrival" is a book convention.** If it was really paid at order (with a delivery of 3 days or
  less), the (₱1,083) is waiting for money, not a late order.
- **Entry times stand in for when money arrived.** A payment entered late makes the fund look poorer than it was. That
  shifts hours from planning to money. Enter payments when they come in.
- **The ₱354 assumes the usual pace on every empty day.** No closed days are recorded, and novelty fading could mean a
  lower true pace (baseline risk). This moves the total, not the split.
- **Gaming.** Notes could be used to excuse late orders. Mitigation: owner-only, dated before the gap begins, and shown
  on the scorecard. Not recording an order day doesn't help, because it counts toward the top of the plan's range.
- **The next gap will look different.** On the cash branch's numbers, Batch 4's gap is likely to include waiting for
  money, caused by the 25 Nov payout. If it shows up as ordered late instead, the money check isn't working.

## 10. Next 30 / 60 / 90 days

- **30 days (to 26 Dec)**
  - Tap Arrived on Batch 3 the day it comes. This gives the first real delivery time, and the split re-learns it.
  - Enter Batches 1 and 2's order days if known.
  - Add the split to the scorecard.
  - Keep the next order's money before any payout.
  - Order Batch 4 by the plan's date (about 2 to 7 Dec), on pick-up terms if the supplier agrees.
- **60 days (to 25 Jan)**
  - At the first monthly review, read Ordered late (target 0 days) and the share with a known cause (90% or more).
  - Payment terms and the daily plan copy are live with the planning engine.
- **90 days (to 24 Feb)**
  - With three or more orders that have both dates, the usual delivery time is learned and the Supplier part becomes
    meaningful.
  - Review whether By choice notes are used as intended.

## 11. Open questions, data gaps and sources

**Open questions**

1. When were Batches 1 and 2 ordered? This explains (₱1,083) and gives two delivery times.
2. Why did Batch 3 go in on 25 Nov? The money was there from 19 Nov 12:11, and the reserve from 13 Nov. Could the
   supplier have taken it earlier?
3. What terms does the supplier accept: at order, a part payment, or on pick-up?
4. Does the shop close on some days? If so, record them: they come out of both the pace and the empty time.

**Data gaps**

- No order has both dates.
- Batch 1 and 2 payment days are a book convention.
- There are no dated decisions, supplier notes or plan copies yet.
- Small data correction: the first reserve decision (₱0) was entered on 10 Nov at 04:46, not 02:04. Batch 2 itself was
  entered at 02:04.

**Sources**

- **Shop data**
  - the data block in `analysis/baseline.py` (26 Nov 18:59);
  - read-only checks inside begin … rollback: 27 Nov 12:04:45 (counts, entry times) and 27 Nov 13:52:34 (the SQL
    split run as the owner, rolled back), which matched the script to the second;
  - `docs/HISTORY.md` (the 10–11 Nov projection).
- **Earlier analyses reused**
  - `baseline.md` §6 (₱354 / ₱576);
  - `stock-and-ordering.md` §4.2 (reorder point 22.6) and §4.3 (sales lost 1.42 to 0.59 a day; +₱3.7k to ₱4.0k);
  - `cash-and-capital.md` §4.4 (pick-up: 17%);
  - `math-check.md` §4.1 and §4.3 ii and iii (Batch 4 at ₱5,664: 98%, ₱953 to ₱1,551; as low as ₱1.1k);
  - the products branch (₱88 / ₱50).
- **External** (generic searches, 27 Nov 2026; the source pages themselves couldn't be opened from this session, so
  only what the searches confirmed is used)
  - Opportunity cost:
    - J. M. Buchanan, *Cost and Choice: An Inquiry in Economic Theory* (1969; Liberty Fund edition on Econlib): cost
      belongs to the chooser at the moment of choice;
    - "the value of the next-highest-valued alternative": *Concise Encyclopedia of Economics*, "Opportunity Cost"
      (Econlib).
  - Controllability:
    - R. Antle and J. Demski, "The Controllability Principle in Responsibility Accounting", *The Accounting Review*
      63(4), 1988;
    - K. Merchant, "How and why firms disregard the controllability principle", in W. Bruns and R. Kaplan (eds.),
      *Accounting & Management: Field Study Perspectives* (HBS Press, 1987).
  - Retail out-of-stocks:
    - T. Gruen, D. Corsten and S. Bharadwaj, *Retail Out-of-Stocks: A Worldwide Examination of Extent, Causes and
      Consumer Responses* (GMA, 2002);
    - D. Corsten and T. Gruen, "Desperately seeking shelf availability", *International Journal of Retail &
      Distribution Management* 31(12), 2003;
    - "Stock-Outs Cause Walkouts", *Harvard Business Review*, May 2004.

    The root-cause stages and "most causes are in the store" come from a literature review summarising them
    ([core.ac.uk](https://core.ac.uk/download/72840065.pdf)). The report's exact percentages couldn't be re-checked,
    so none are quoted.
- This is planning arithmetic, not accounting or legal advice.

## Appendix: for the builder (scorecard fields)

These are new fields in `ops.v3.sql`. Every existing field keeps its name and meaning.

- **Period split of the "at least" figure:**
  - days: `empty_choice_days`, `empty_money_days`, `empty_unrecorded_days`, `empty_late_order_days`,
    `empty_supplier_days`;
  - pesos: `lost_profit_choice`, `lost_profit_money`, `lost_profit_unrecorded`, `lost_profit_late_order`,
    `lost_profit_supplier`. These are whole pesos by largest remainder, so they add up to `lost_profit_low`.
- **The plan's range and data quality:**
  - `plan_lost_profit_low` (ordered late) and `plan_lost_profit_high` (+ not recorded);
  - `known_cause_pct`.
- **The high estimate:** `lost_profit_high_empty` and `lost_profit_high_thin`, with `thin_wait_next_batch` and
  `thin_by_choice`.
- **The open gap:**
  - `empty_now_*_cost` for each cause;
  - `expected_arrival`;
  - `empty_to_arrival_days` and `empty_to_arrival_cost`, with `empty_to_arrival_late_order_cost`,
    `empty_to_arrival_money_cost` and `empty_to_arrival_supplier_cost`;
  - `latest_on_time`, `money_enough_at`, `ordered_at`, `pay_terms`, `order_days_late`.
- **Delivery time:** `lead_days` becomes the engine's blend, (Σ recorded days + 7) ÷ (n + 1). It is still 7 today.

Live values, 27 Nov 12:04:45, month:

| Field | Value |
|---|---|
| `empty_*_days` | money 0.038, unrecorded 3.058, late_order 0.996 |
| `lost_profit_*` | money 14, unrecorded 1,083, late_order 352 (adds to 1,449) |
| `plan_lost_profit_low` / `plan_lost_profit_high` | 352 / 1,435 |
| `known_cause_pct` | 25 |
| `lost_profit_high_empty` / `lost_profit_high_thin` | 2,355 / 5,920 |
| `empty_now_*_cost` | money 14, late_order 352 (adds to 366) |
| `expected_arrival` | 2026-12-02T07:34 |
| `empty_to_arrival_cost` | 2,070 (late_order 2,056, money 14) |

The tested SQL is in the session scratchpad, which is temporary:
`/tmp/claude-0/-home-user-cloud-factory-pos/1266ee19-7c3f-596f-a8a9-3b4759fe376f/scratchpad/empty-shelf-causes/causes-check.sql`.
Its new CTEs are also written out in the scorecard spec handed to the builder.
