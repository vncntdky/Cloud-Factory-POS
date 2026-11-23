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
21. **Running net profit per batch and the register** (13 Nov): Finance → Batches lists each batch's net
    profit so far with a running total, then every batch's full statement (gross sales, discounts, cost of
    the pieces sold, each expense, net profit so far, what's left, the batch's cost in full); the batch
    page shows the same statement. Finance → Overview shows what the register should hold today.
22. **Owner / manager split on each batch** (14 Nov): Finance → Batches shows each batch's owner and
    manager share of its net profit so far, as two columns in the running net profit and as tiles under
    each batch's statement (with each share when the batch sells out). Same tiles as the batch page
    (`components/finance/BatchSplit.tsx`). Shares are before general expenses; payouts still follow
    Safe to distribute. The last column is now "Running net profit". With seven columns the running list
    stays cards until the screen is 1280px wide (`.fin-run` in `app/globals.css` repeats the
    `.table--stack` rules for that range).
23. **SOPs brought up to date** (14 Nov): every SOP, picture caption, word and problem in Help & SOPs was
    checked against the app (97 findings, each checked a second time) and rewritten where it had drifted:
    sign-in and staff accounts, selling (a second tap takes a product out of the cart), receipts, collecting,
    voiding, end-of-day cash (cash paid out of the drawer), expenses, the restock plan, the inventory reserve,
    distributions, capital, tax rate and profit split. SOP 2 now covers changing, stopping and deleting a
    product; new SOP 17 covers shop settings. Managers now see every SOP (owner-only ones marked Owner). The
    Finance register card says plainly when a drawer count is higher or lower than its figure; expense hints no
    longer call delivery shipping an expense. Restock → Batches shows each batch's net profit so far with the
    owner and manager shares. The SOP doc and Finance guide were rebuilt as Claude Docs in the owner's account
    (links in CLAUDE.md); `docs/sop-doc.js` prints lib/help.ts as the doc's sections.
24. **New products** (23 Nov, live, added with `save_product` as the owner, 0 pieces until received):
    category **BLXCK Signature 88000** with 10 flavours (Mango, Strawberry, Watermelon, Yakult, Banana,
    Grapes, Bubblegum, Melon, Mix Berries, Black), brand "BLXCK Signature", ₱340, cost ₱165; and the
    **XBLACK Transparent Device** (variant V5) in Device, ₱350, cost ₱200. Their photos were not uploaded
    yet: this session's network can't reach the Supabase project (the owner can upload them on each
    product page, or allow `pyjhwbfdxrjeitwjztna.supabase.co` in the environment's network settings).

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
- Money paid to a supplier before the stock arrives isn't recorded: until the batch is received, Finance cash
  reads high by that amount (and so does "Should be in the register" when it was paid from the drawer). A
  "paid, on the way" entry would fix it.
- The register figure takes every payment as cash from the drawer. Recording how each payment was made
  (cash, GCash, bank) and cash taken out to deposit would make it exact; a nightly drawer count would too.
- A recorded loss isn't used up first in, first out: after the product is restocked, the lost pieces can
  show as "left" in the next batch. Deleting a product also removes what was paid for it from Finance.
- Distributions recorded before a split change keep their old shares unless edited.
- SOP 9 assumes buyers who owe are chased after 7 days: the owner hasn't confirmed that limit.
- The system map exists only in the original account and its money section uses the old Company funds labels;
  the Finance guide replaces it. Recreate it in the owner's account if it is still wanted.
- The SOP doc and Finance guide doc are copies: when lib/help.ts or docs/finance-guide.md changes, update the
  doc too (`node docs/sop-doc.js`).
- Each page still crosses the Pacific (Philippines ↔ US East); moving Supabase and Vercel to Singapore would
  speed every tap, but it is a project of its own.
