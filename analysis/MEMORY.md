# Memory: Cloud Factory engagement

Last updated: 26 Nov 2026 (strategy review and planning-engine build list). Keep this file short. No personal data:
buyers and staff are never named here.

## Company profile

- **What:** a small vape shop in the Philippines (Manila time, pesos). Opened 27 Oct 2026.
- **Who runs it:** an owner and a manager, who split profit 2 : 1, plus staff at the till.
- **Model:**
  - One supplier delivers a batch of 30 to 40 pieces: one line of 10 flavours × 3 each, plus 10 devices in Batch 3.
  - Everything sells at list price.
  - 73% of sales are on credit ("Not paid yet"), collected in a median of 9 days.
  - Batches 1 and 2 were paid on arrival (Batch 1 with the owner's money). Batch 3 was paid in full at order.
- **Lines** (price / cost):
  - XBLACK MAX pods ₱320 / ₱160
  - Black TEO ₱340 / ₱165
  - BLXCK Signature ₱340 / ₱165
  - XBLACK device ₱350 / ₱200
- **Systems:** the shop's own POS app (Next.js + Supabase; every rule enforced in Postgres). The owner uses it daily
  on a phone.

## Baseline metrics (27 Oct to 26 Nov 2026; data as of 26 Nov 18:59, unchanged at 20:16 Manila)

| Metric | Value |
|---|---|
| Net sales | ₱19,800 (60 pieces, ₱330 average, ₱0 discounts) |
| Gross margin | 48.3% at landed cost (₱159.45 a piece); 50.8% at unit cost |
| Net margin | 44.6% (₱8,827). Overstated: no rent, pay or owner time recorded; tax rate 0% |
| Running costs ("burn") | ₱716 a month recorded |
| Balance | Cash ₱340, receivables ₱2,080, stock on the way ₱7,214 (Batch 3), inventory ₱0 |
| Owner capital / distributions | ₱5,039 / ₱4,232 (25 Nov) |
| Safe to distribute | ₱340 |
| Pace | 2.22 pieces a day with stock; 3.61 with 7–10 flavours on the shelf. Shop fully empty 3.38 of 31 days |
| Cash conversion cycle | 10.6 days (DSO 6.2 + DIO 4.4); 17.6 when the supplier is paid at order |
| Return on money tied up | 150% per 31 days on ₱5,884 (44.6% margin × 3.37 turnover) |
| Cost of money (WACC assumption) | 3% a month, the BSP card-rate ceiling, as the owners' opportunity cost. 1% to 20% tested; the conclusion holds |
| Value of an empty shop-day | ₱354 (average pace) to ₱576 (full shelf) of gross profit |
| Collections | Late after 11 days, Very late after 18 (31 paid in full); expected bad debt ₱58 |

## Key findings (26 Nov)

1. **Empty shelves limit profit.** Ordering on a reorder-point date in whatever size the cash buys lifts gross profit
   from about ₱6.7k to ₱10.7k–11.1k a month (+₱4.0k–4.5k; +₱3.2k–4.7k in every test).
2. **The 25 Nov payout emptied the fund.** It took 100% of Safe to distribute 14 minutes after Batch 3 used up the
   reserve. Batch 4 falls short in 100% of trials (median owner top-up ₱2,598), against 2% had the payout been held and
   17% on pick-up terms.
3. **Credit costs timing, not bad debt.** It costs about ₱1,588 of profit on Batch 4 when the supplier is paid at
   order, against ₱58 of expected bad debt.
4. **Line test.** XBLACK MAX earned ₱88 a day per flavour on the shelf, against ₱50 for Black TEO. Unproven: it was
   the opening batch and ₱20 cheaper.
5. **Price is a weak lever.** 1% on price is about ₱192 a month. Pass-through matters: −₱479 a month per 5% cost rise
   not passed on.

## Key decisions and why

**Recommended 26 Nov, waiting for the owner:**

- **Build the planning engine as design v2 (top-down) with 15 changes.** v1 suggested 497 pieces. The adopted engine
  says: Order by about 7 Dec (5 Dec for pods only), next order about 33 pieces ≈ ₱5,660, the cash buys about 14.
- **Order rhythm from recorded order days, kept to 7–30 days.** Estimating old order days gave an 18-day rhythm. That
  bakes in the late Batch 3 order and makes orders larger than the shop really buys.
- **Delivery time blended with the 7-day guess as one pretend order.** One odd first delivery shouldn't swing the
  date; each day of error costs about ₱354 a cycle.
- **Collections learned from sales paid in full only.** v2 let stuck balances set their own bar, so they could never
  become Very late.
- **The payout suggestion holds the next order** (the part unpaid sales won't cover) plus a month of running costs.
  v2's rule would still have pre-filled ₱3,492 on 25 Nov; this one gives ₱0.
- **Size the next-order estimate from the reorder point.** Don't scale it by a historical company-paid share: Batch 1
  was owner-paid at start-up.
- **No spare stock by flavour class.** It has no economic basis at this volume, and classes are unstable at 3 pieces a
  flavour.
- **The profit bridge and Dashboard fixes go in release 2,** before the first monthly review (first week of January).

**Already decided by the owner** (from `docs/HISTORY.md`):

- Profit split 2 : 1.
- The inventory reserve is set by the owners.
- Owner capital is never paid back.
- Batch 1 was owner-paid.
- Tax rate set to 0% on 10 Nov, to be confirmed with an accountant.
- Stock is recorded at order, then Arrived.

## Open questions

1. How many days does delivery really take? Batch 3's arrival is the first real figure.
2. The supplier: smallest order, pay on pick-up, shipping per piece, XBLACK MAX still available, January excise.
3. Payout policy: soft or hard hold, monthly, and the maximum share of profit.
4. Rent, pay and owner time to record; the tax status and rate (accountant).
5. The credit rule (who, one open tab, Very late stops credit) and a write-off policy.
6. Line strategy (rotate or re-order the fastest), and devices (do they fit the pods? plan them on their own?).

## Files

- `analysis/baseline.md` and `baseline.py`: the fact base.
- `analysis/stock-and-ordering.*`, `cash-and-capital.*`, `credit-and-collections.*`, `products-pricing-mix.*`: the four
  branch studies.
- `analysis/strategy-review.md`, `strategy-review.py`, `strategy-review_metrics.json`: the synthesis, build list and
  Planning page.
