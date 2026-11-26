# Vape POS

Register and per-piece inventory for the vape shop. Same stack as Matcha Bee: a Next.js app on Vercel, with Supabase holding the data. No order form, delivery or customer CRM; just the counter.

## What it does

| Screen | What it's for |
|---|---|
| **Sell** (`/`) | Tap a product (with its photo) to add it, tap it again to take it out, or scan its barcode (each scan adds one). A USB/Bluetooth scanner works anywhere on the page, no need to tap the search box. Change quantities with − / + in the cart (photos show there too), then **Charge**: buyer's name (optional), discount, Cash / GCash / Maya / Card / Bank transfer or **Not paid yet**, cash received with quick amounts and change due, and the **age check**. Prints a receipt. |
| **Sales** (`/sales`) | Daily close: money in by method (what the cash drawer should hold), sales not paid yet, money collected on earlier unpaid sales, discounts, voids, top sellers, every sale. Owners and managers: any day or range, gross profit, CSV export. |
| **Sales → Dashboard** (`/sales/dashboard`) | Owners and managers. Filter by **category** and range (7 / 30 / 90 days or 12 months). Against the period before: net sales, gross profit, pieces sold, average sale and pieces per sale, profit per piece and average price, profit after restock costs, still owed. Charts of sales and profit, profit per piece and pieces sold (tap a column for details, or show as a table), best sellers, slowest movers, every product's pace and days of stock left (sortable), and the busiest days and hours. |
| **Sales → Finance** (`/sales/pnl`) | Owners and managers. **Overview**: safe to distribute (the lower of profit kept and spare cash), what the register should hold today (cash in, less everything paid out), net sales, gross margin, net profit, closing cash, a cash waterfall, owner distributions (owner records and edits them), the inventory reserve for the next restock, receivables by age, and Finance settings (owner: tax rate, profit split). **Profit & loss** (accrual, cost of goods at landed cost), **Cash flow** (cash), **Balance** (cash + receivables + inventory = tax payable + owner capital + profit kept; owner records capital), and **Batches** (the running net profit batch by batch with each batch's owner / manager share, then each batch's full statement: gross sales, discounts, cost of the pieces sold, every expense, net profit so far, what's left to sell, the batch's cost in full, and its owner / manager split; general expenses; the whole shop's split). Since opening or any month. See `docs/finance-guide.md`. |
| **Sales → Finance → Report** (`/sales/report`) | Owner only. One batch compared with another (the one before it unless picked): net profit, margin, net sales, pieces sold, selling pace, the day it earned back its cost, still owed and the owner / manager shares, each with the other batch's figure and the change; charts by day since each batch arrived (pieces sold so far; net sales so far against each batch's cost in full); where each peso of net sales went; paid and still owed, with who owes; each flavour's days to sell out; the two statements side by side; what to do next. Also from **Report** on a batch's page. The figures are the batch statements (as on Finance → Batches) plus `batch_report` (each day's sales, flavours, who owes, how it was paid). |
| **Reservations** (product page, all staff) | Hold pieces for a customer (name, pieces, optional hold-until date and note). Held pieces can't be sold to anyone else; Inventory → **Reserved** lists them; the reorder plan and dashboard treat them as spoken for, not slow stock. **Sell** opens the register with the customer's pieces and name; the reservation closes when that sale is charged. |
| **Fix a stock change** (product page, owners and managers) | **Fix** on a restock, count, opening stock or damaged / lost entry: change its pieces (and cost, for a restock) or remove it. Later history adjusts; a later count stays as counted. |
| **Restock → Expenses** (`/restock/expenses`) | Owners and managers. Every expense (salaries, rent, utilities, supplies, payment fees, taxes paid, other), general and per batch, by month, with totals; filter by batch or General; add, edit and remove. |
| **Sale** (`/sales/[id]`) | The receipt (prints on 58/80 mm thermal paper or A4), with the buyer, payments and balance due. **Collect** on an unpaid sale. Owners and managers can **void** a sale with a reason; the pieces go back into stock. |
| **Collectibles** (`/collectibles`) | Who owes the shop: every "Not paid yet" sale, grouped by buyer, oldest first, with the total owed. **Collect** records money received, in full or part, by any method. Every staff member sees it. |
| **Inventory** (`/inventory`) | Products folded into one card per category (count, pieces, out / low); tap a category to open it, or search. Every product with its photo and pieces on the shelf, low-stock and out-of-stock filters, stock value at cost. Tap a product to **upload or replace its photo** (any staff), **restock** (with the new cost per piece), **count**, or record **damaged / lost** pieces. Every change is in its stock history. Owners and managers can **Import** many products from a CSV file (`/inventory/import`): download the template (`public/templates/products-template.csv`), upload, check each row (new / already in the app / example / fix), then add; the database checks every row (`import_products`) and adds all or nothing. |
| **Add product** | Photo (optional), brand, product, flavour / variant, barcode, category, price, cost, low-stock alert, pieces on the shelf now. **Add and enter another** keeps the brand, price and cost, so entering ten flavours of one pod is quick. |
| **Restock → Reorder** (`/restock`) | Owners and managers. Each product's pace (pieces sold in the last 28 days), days of stock left, **reorder point** and **suggested order**, grouped into Order now / within a week / enough / no sales. Pieces already ordered and **on the way** count as in stock, so they aren't suggested twice; the orders on the way are listed, and **Order to arrival** shows how many days recent orders took (**Use N days for delivery** sets the plan's delivery time). **Copy order list** for the supplier, **Order this** to record the order, and **Update low-stock alerts** to set each product's alert to its reorder point. The days behind the maths are editable (below). |
| **Restock → Order stock** (`/restock/order`) | Owners and managers. An order the day it is ordered: supplier, pieces and cost per piece, restocking costs, and how it was paid (in full, downpayment, cash on pick-up) and whose money (company fund, owner's money, investment). It waits **On the way**, off the shelf, until **Arrived** on its page (the day, the pieces that came, what was paid on pick-up). **Receive batch** (`/restock/receive`) records stock already here in one step. |
| **Restock → Batches** (`/restock?view=batches`) | Orders on the way, and every supplier delivery: **payments to the supplier** (record, edit, remove; what is still to pay), back on the way or remove a cancelled order; pieces received, % sold, sales, **still owed** ("Not paid yet" balances, with who owes), each batch's **net profit so far with the owner / manager shares** on its row, gross profit, **restock costs** (shipping, tax, MOOE, other: entered when receiving or later), total and per-piece batch cost, profit after restock costs and pace, with a per-product breakdown. Sales are matched to batches first in, first out. Stock that came in before batches (opening stock, single restocks) has its own entry; **Turn into a batch** on its page makes it a real batch so it can take restock costs and expenses. |
| **Settings** | Shop name, address and message on receipts, minimum age (default 18, per RA 11900), staff discount limit, and **Staff** (turn on sign-ups, change roles, remove access). |

### How stock works

- Each flavour / colour / strength is its own product, counted in whole pieces.
- A sale takes the pieces off when it's charged. A void puts them back.
- Stock only changes through a sale, a void, a restock, a count, or a loss, and each one is logged with who did it.
- The register won't sell more than what's on the shelf. If the shelf has more than the app says, count it in Inventory. While you're first entering stock, the owner can switch this off in Settings.

### How the reorder plan works

- **Pace** = pieces sold in the last 28 days ÷ days (or since the product was first stocked, if sooner).
- **Reorder point** = pace × (days a batch takes to arrive + spare days). Default 7 + 3.
- **Suggested order** = pace × (arrival + spare + days each order should last) − pieces on the shelf. Default lasts 14 days.
- Change the three numbers under **Restock → How it's worked out → Change these days**. Under a week of sales, the numbers are rough.

### Checkout rules (enforced by the database, not just the screen)

- Prices and costs come from the database, never from the register.
- No sale without the age check ("Customer is 18 or older").
- Staff discounts are capped at the limit in Settings (default ₱50); owners and managers can give any discount.
- Cash received must cover the total. Change is calculated for you.
- A sale is never charged twice, even if the Charge button is tapped twice on a slow connection.
- **Not paid yet** needs the buyer's name. The pieces leave stock at once; the total waits in Collectibles until it's collected. A payment can't be more than what's still owed, and counts in Sales on the day it's received. Voiding an unpaid sale clears what's owed.

### Who can do what

| | Owner | Manager | Staff |
|---|---|---|---|
| Sell, see stock levels | ✓ | ✓ | ✓ |
| Sell as Not paid yet, see Collectibles, collect | ✓ | ✓ | ✓ |
| Upload / replace product photos | ✓ | ✓ | ✓ |
| Discount | any | any | up to the limit in Settings |
| Sales | all days, profit, CSV | all days, profit, CSV | today only, no profit |
| Void a sale | ✓ | ✓ | |
| Add / edit products, prices, costs | ✓ | ✓ | |
| Restock, count, damaged / lost | ✓ | ✓ | |
| Restock tab: reorder plan, receive batches, sales by batch | ✓ | ✓ | |
| Delete test sales and products for good | ✓ | | |
| Settings, staff and roles | ✓ | | |

Row-level security and checked database functions enforce all of this. Staff can't read costs or the stock log through the API either.

### Removing test data

The owner can delete a **sale** (Sales → the sale → **Delete sale**) or a **product** (Inventory → the product → **Delete product**, optionally with its sales). Deleted data disappears from Sales, reports, Collectibles, Restock and batch sales as if it never happened, and the pieces a deleted sale took go back on the shelf. It can't be undone. For real sales use **Void**, and for products you no longer sell untick **For sale**: both keep the history.

### Receipts

The printed receipt says "This is not an official receipt." The app isn't a BIR-accredited POS, so keep issuing your BIR-registered official receipts / invoices as usual.

## First-time setup

1. **Deploy on Vercel.** In Vercel, click **Add New → Project** and import this repo. Leave the framework as Next.js. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://pyjhwbfdxrjeitwjztna.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the **publishable** key from Supabase → Project Settings → API Keys (starts with `sb_publishable_`). Never use the secret or `service_role` key here.

   Click **Deploy**. Every push to `main` redeploys automatically.
2. **Point Supabase at the app.** Supabase → **Authentication → URL Configuration**: set **Site URL** to your Vercel address (e.g. `https://vape-pos.vercel.app`) and add `https://vape-pos.vercel.app/**` under **Redirect URLs**. Without this, the "confirm your email" link opens localhost.
3. **Become the owner.** Open the app, tap **Create a staff account**, sign up and confirm your email. **The very first account becomes the owner**, with no SQL needed. Everyone after that waits for you to turn them on in **Settings → Staff**.
4. **Set up the shop.** Settings: shop name, address, receipt message. Then **Inventory → Add product** for everything you sell, with the pieces on the shelf now.

### Install on the counter tablet or phone

Open the app in Chrome (Android) → menu → **Install app**, or in Safari (iPhone / iPad) → **Share → Add to Home Screen**.

## Supabase

Project: **Vape POS** (`pyjhwbfdxrjeitwjztna`, us-east-1, free plan). The schema is in `supabase/migrations/`, already applied to the project.

Free-plan note: a project pauses after 7 days with no activity. A shop that sells every day won't hit this. If it does pause, restore it from the Supabase dashboard.

## Development

```bash
cp .env.example .env.local   # then paste the publishable key
npm install
npm run dev                  # http://localhost:3000
```

Database tests (337 checks: roles, checkout rules, stock, voids, reports, unpaid sales and collecting, batches, orders and supplier payments, finance, imports, batch reports) run on any local Postgres:

```bash
PGHOST=… PGPORT=… PGUSER=postgres supabase/tests/run.sh
```
