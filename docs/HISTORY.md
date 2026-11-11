# Project history and decisions

What was asked, built and decided while building the app with Claude (Oct–Nov 2026). Newest work is at
the bottom. Commits on `main` hold the code for each step.

## Built, in order

1. **Repo and deploy**: code moved to GitHub `vncntdky/Cloud-Factory-POS`, deployed on Vercel.
2. **Product photos** when adding a product (shrunk in the browser, Supabase Storage).
3. **Restock tab**: pace-based reorder points and suggested orders, batches (supplier deliveries), sales by batch (FIFO).
4. **Owner deletes** of test sales and test products (they were skewing the numbers).
5. **Batch "still owed"** and **restocking costs** (shipping, tax, MOOE, other).
6. **Sales → Dashboard** (owner and manager only): unit economics, charts, best sellers with speed, slowest
   movers including sold-out ones, busiest times, category filter.
7. **Black TEO** category with its flavours (₱340, cost ₱165), photos cropped from the poster.
8. **P&L** with expenses and the owner / manager split (2/3 : 1/3), per batch and as its own view; general
   expenses page (Restock → Expenses); add expense from a batch, the P&L and the expenses page.
9. **Inventory** folds by category; Receive batch has category chips ("keep the UI simple and functional").
10. **Turn into a batch** for stock that came in before batches existed.
11. **Reservations** (all roles), **Company funds**, **fix / remove stock changes** (owner and manager).
12. **Speed**: instant feedback on taps and fewer round trips.
13. **Fix restocks on existing batches** and add a missed product to a batch; **every count and loss is tagged
    to a batch** (the owner found counts could be saved without a batch).
14. **Batch 2 clean-up** (live data): Sparkle Squeeze's 3 pieces (entered as a count) became a restock in
    Batch 2; Black Wave and Red Cannon were removed from Batch 2 (never arrived). Batch 2 = 10 Black TEO
    flavours × 3 = 30 pieces at ₱165, plus ₱244 fees.
15. **Batch 1 was paid by the owners**, so it is not charged to the company funds; its profit is releasable.
16. **Inventory reserve** decided by the owners (instead of an automatic reserve): new batches use it up, then
    the app asks again.
17. **System map**, **SOPs**, **App handbook** with annotated screenshots, and the **Help & SOPs** page in the app.
18. **Performance**: bundled login key (no key fetch per page), resized photo thumbnails.
19. **Finance** rebuilt with standard labels: Overview, Profit & loss, Cash flow (waterfall), Balance, Batches;
    landed cost; owner capital; tax estimate; safe-to-distribute limit; receivables by age; Payment fees and
    Taxes paid expense types. See `docs/finance-guide.md`.
20. **Owner can edit everything**: expenses, capital, distributions, batch details, tax rate and split.

## Decisions the owner made

- Funds show gross sales, net sales and "floating" (unpaid and non-cash money).
- Batch goods and restocking fees are paid from the company funds; Batch 1 is the exception (owner-paid).
- Owner and manager shares are profit only; no capital is returned. Split 2 : 1.
- Instead of a fixed reserve, the owners set an inventory reserve for each next restock.
- Only owners and managers see costs, the dashboard and Finance; staff sell, reserve and collect.
- Restocking: plan for a 5–7 day delivery gap (the app's plan is 7 days delivery + 3 buffer, 14 days cover).

## Live state at hand-off (11 Nov 2026)

- Batch 1: XBLACK MAX pods (category TRANSPARENT V2 PODS), 10 flavours × 3, ₱320 each, cost ₱160, owner-paid
  ₱4,800, sold out 27 Oct – 6 Nov (about 2.7 pieces a day; 23 of 30 in the first 4 days; 70% rung up as
  not paid yet, mostly collected since).
- Batch 2: Black TEO, 30 pieces, arrived 9 Nov, none sold yet at hand-off.
- Since opening: net sales ₱9,600, net profit ₱3,860 (tax rate is 0%), cash ₱2,186, owed ₱1,280
  (RODS ₱960, PAOLO ₱320), Batch 2 stock ₱5,194, safe to distribute ₱2,186, nothing distributed yet.
- Tax rate was set to **0%** in the app on 10 Nov (default 3%); confirm with an accountant.

## Projection and restock plan (made 10–11 Nov, from Batch 1's pace)

- Black TEO at Batch 1's pace: about 23 sold 11–14 Nov, sold out around 21 Nov (₱10,200 of sales).
- Order **Batch 3 around 12–14 Nov**, about 40 pieces (4 per flavour, tilted to the fastest sellers), about
  ₱6,850 with shipping; it arrives 17–19 Nov. Order Batch 4 around 25 Nov.
- End of November with Batch 3: about ₱30,680 net sales since opening, ₱14,271 net profit, ₱14,962 cash,
  about ₱8,112 safe to distribute after keeping ₱6,850 for Batch 4 (assumes no new expenses, 0% tax).
- Redo the projection with Black TEO's real pace after a week of sales (Sales → Dashboard).

## Open items

- Not built yet (need a workflow decided): monthly close, nightly drawer count, cash split by drawer /
  e-wallet / bank, supplier bills (payables), accountant export, VAT (only above ₱3M yearly sales).
- Editing or undoing a recorded customer payment (suggested next).
- Distributions recorded before a split change keep their old shares unless edited.
- SOP 9 assumes buyers who owe are chased after 7 days: the owner hasn't confirmed that limit.
- The system map artifact's money section still uses the old Company funds labels; the Finance guide replaces it.
- Each page still crosses the Pacific (Philippines ↔ US East); moving Supabase and Vercel to Singapore would
  speed every tap, but it is a project of its own.
