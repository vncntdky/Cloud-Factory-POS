# Browser tests

End-to-end checks that drive the real app in Chromium (Playwright) against a small mock of the
Supabase APIs, so no real data is touched. Each suite prints one `ok` / `FAIL` line per check.

## Run

```bash
# 1. Build and start the app against the mock (port 54321)
rm -rf .next
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_test npm run build
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 npx next start -p 3100 -H 127.0.0.1 &

# 2. For each suite: start a FRESH mock (suites change its state), then run the suite
node e2e/mock-restock.js &   # ROLE=owner|manager|cashier, NOBATCH=1, SHOTS=1 as the suite needs
node e2e/test-finance.js     # ROLE=owner|manager
kill %2
```

Restart the mock between suites. Screenshots go to `e2e/shots/` (git-ignored).

| Suite | Mock | Env |
|---|---|---|
| test-new.js (reservations, stock fixes, distributions) | mock-restock.js | |
| test-restock.js (reorder plan, ordering the suggested order then Arrived, batches) | mock-restock.js | ROLE |
| test-expenses.js, test-batchpnl.js, test-receive-cat.js | mock-restock.js | ROLE for batchpnl; FIN=batches (mock and suite) makes Profit & loss follow the batch rows, to check the batches tie out to it; SOLDOUT=1 (mock and suite) sells out the stock from before batches, to check a sold-out batch |
| test-batchfix.js (batch-tagged stock, fix, add to batch) | mock-restock.js | NOBATCH=1 for the no-batch case |
| test-makebatch.js | mock-restock.js with NOBATCH=1 | |
| test-finance.js, test-edits.js (Finance, owner edits) | mock-restock.js | ROLE=owner / manager (same on both) |
| test-help.js (Help & SOPs) | mock-restock.js | ROLE=owner / manager / cashier (same on all) |
| test-import.js (Inventory → Import CSV) | mock-restock.js | ROLE=owner / manager / cashier (same on all) |
| test-orders.js (order → payments → Arrived → back on the way → remove; Reorder's on the way and days to arrive; Finance's stock on the way and owed to suppliers; a delivery not paid yet) | mock-restock.js with ORDER=1 (Batch 2 ordered 3 days ago, ₱1,000 down) | ROLE=owner / manager (same on both) |
| test-report.js (Sales → Finance → Report, owner; changing a batch's date there) | mock-restock.js with REPORT=1 (a second batch) or REPORT=3 (a third, nothing sold: All batches) | ROLE=owner / manager / cashier with REPORT=1; ROLE=owner with REPORT=3 (same on both) |
| test-dash.js (dashboard) | mock-dash.js | ROLE=cashier for the staff check |
| test-delete.js (owner deletes) | mock-delete.js | MODE=product / sale, ROLE=manager |

Handbook screenshots (public/help/*.webp): start mock-restock.js with `SHOTS=1 ORDER=1`, then
`node e2e/shots-handbook.js <out-dir>`; restart it with `SHOTS=1` only for `node e2e/shots-finance.js <out-dir>`.
Convert the PNGs to WebP (quality 80): 05a-order-top → order-details, 05b-order-items → order-pieces,
05c-order-payment → order-payment, 05d-order-arrived → order-arrived, 06-batch-fix → batch-fix, the rest by
their names.

Playwright and Chromium come preinstalled in the Claude Code cloud container (`/opt/pw-browsers/chromium`).
Elsewhere, install Playwright (`npm i -D playwright && npx playwright install chromium`), and on
another machine, change `executablePath` or remove it.

Database rules have their own tests: `supabase/tests/run.sh` (see CLAUDE.md).
