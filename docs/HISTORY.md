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
    **XBLACK Transparent Device** (variant V5) in Device, ₱350, cost ₱200. The 10 BLXCK photos were cut
    from the supplier's poster and uploaded through the one-off `photo-import-once` edge function (redeployed
    for this, then retired again to a 410 stub). The device has no photo yet (add it on its product page).
25. **Import products from a CSV file** (24 Nov): Inventory → Import (owners and managers). Template at
    `public/templates/products-template.csv` (columns Category, Brand, Product, Flavour / variant, Barcode,
    Selling price, Cost per piece, Low-stock alert at, For sale; two Example rows that are skipped). The
    database function `import_products(rows, commit)` checks every row for the preview, then adds all new rows
    through `save_product`, or nothing if any row has an error; products already in the app (same brand,
    product and flavour) are skipped, never changed. Pieces are not imported (Receive batch). SOP 2 covers it.
    An independent review (12 findings, each checked a second time) led to `20261124010000_import_products_checks.sql`
    and screen fixes: a comma only separates thousands ("340,50" is refused, not read as ₱34,050; in semicolon files
    from comma-decimal regions it is read as ₱340.50), "P340" is read as ₱340, doubled spaces and line breaks in a
    cell don't make a second product or category, a barcode Excel turned into 4.8E+12 says how to keep it as text,
    Windows Excel's plain CSV encoding keeps ñ, a product in the app but Not for sale says so, no connection shows a
    message instead of an error page, and a change between the check and Add marks the row again. The template's
    example rows follow the shop's own names (Brand BLXCK Signature, Product Mango; XBLACK MAX Banana with flavour
    Sweet Smoothie), so a sheet written the same way skips products that are already in the app.
26. **End of Batch 2 report** (24 Nov): a one-off page comparing Batch 2 with Batch 1 (net profit, margin, pace,
    payback, where each peso went, paid and owed, flavours, statement, next steps), sent to the owner as an HTML
    file. Batch 2: ₱4,399.13 net profit so far on 29 of 30 pieces (Batch 1: ₱3,921 on 30); the lead comes from
    expenses (₱100 against ₱640), gross profit is about the same; it sold 2.1 pieces a day against 2.7. As of
    25 Nov, 1:36 a.m., ₱1,740 of its sales was still owed by 5 buyers; Batch 1 was fully paid.
27. **Batch report in the app** (25 Nov, owner only): Sales → Finance → Report, or Report on a batch's page. Pick a
    batch; it is compared with the one before (or another, or nothing). Tiles with the other batch's figure and the
    change, charts by day since arrival (pieces sold so far; net sales so far against the batch's cost in full, with
    the day it was covered), where each peso went, paid and still owed with who owes, flavours, the statements side by
    side and what to do next. Totals are the batch statements (the same as Finance → Batches); the new owner-only
    function `batch_report` adds each day's sales, flavours, who owes and how it was paid
    (`20261125000000_batch_report.sql`, then `20261125010000_batch_report_fixes.sql` after an independent review:
    sales before an edited received date count on day 0, buyers are named as on their oldest open sale, and the
    split by payment method reads each sale once). The review's other fixes are on the page: readouts for a
    younger batch, wording for a batch at a loss or with one piece left, tax and counts in the explanations, a
    centavo of rounding kept off the totals. Pace is pieces sold ÷ days from arrival to the last sale, so a batch with
    its last pieces still on the shelf isn't made to look slower. The page is `app/(staff)/sales/report/page.tsx`,
    the calculations `lib/batch-report.ts`, the charts `components/report/`.
    Compare with **All batches** (25 Nov, asked for once Batch 3 came in): every batch on the charts (the reported
    one in the accent colour, the one before in grey, older ones lighter, each named at its end), the bars, the
    flavours and the statement; the summary and tiles still compare with the batch before. Change arrows wait until
    a batch has sold something.
28. **Change the date a batch arrived from its report** (25 Nov): "Change the date Batch N arrived" under the report's
    first line (owner), next to the existing Edit supplier, date or note on the batch's page (owners and managers).
    New `set_batch_received_on` changes only the date (`20261125020000_batch_received_date.sql`). Both it and
    `update_batch_details` now refuse a date after the day the batch's first piece was recorded in the app (the
    pieces can't be on the shelf before the batch arrived); the details edit checks this only when the date changes.
    The report's days, pace and payback count from the new date.

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
