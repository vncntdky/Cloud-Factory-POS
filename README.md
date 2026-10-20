# Vape POS

Register and per-piece inventory for the vape shop. Same stack as Matcha Bee: a Next.js app on Vercel, with Supabase holding the data. No order form, delivery or customer CRM; just the counter.

## What it does

| Screen | What it's for |
|---|---|
| **Sell** (`/`) | Tap a product or scan its barcode. A USB/Bluetooth scanner works anywhere on the page, no need to tap the search box. Change quantities, then **Charge**: discount, Cash / GCash / Maya / Card / Bank transfer, cash received with quick amounts and change due, and the **age check**. Prints a receipt. |
| **Sales** (`/sales`) | Daily close: money in by method (what the cash drawer should hold), discounts, voids, top sellers, every sale. Owners and managers: any day or range, gross profit, CSV export. |
| **Sale** (`/sales/[id]`) | The receipt (prints on 58/80 mm thermal paper or A4). Owners and managers can **void** a sale with a reason; the pieces go back into stock. |
| **Inventory** (`/inventory`) | Every product with pieces on the shelf, low-stock and out-of-stock filters, stock value at cost. Tap a product to **restock** (with the new cost per piece), **count**, or record **damaged / lost** pieces. Every change is in its stock history. |
| **Add product** | Brand, product, flavour / variant, barcode, category, price, cost, low-stock alert, pieces on the shelf now. **Add and enter another** keeps the brand, price and cost, so entering ten flavours of one pod is quick. |
| **Settings** | Shop name, address and message on receipts, minimum age (default 18, per RA 11900), staff discount limit, and **Staff** (turn on sign-ups, change roles, remove access). |

### How stock works

- Each flavour / colour / strength is its own product, counted in whole pieces.
- A sale takes the pieces off when it's charged. A void puts them back.
- Stock only changes through a sale, a void, a restock, a count, or a loss, and each one is logged with who did it.
- The register won't sell more than what's on the shelf. If the shelf has more than the app says, count it in Inventory. While you're first entering stock, the owner can switch this off in Settings.

### Checkout rules (enforced by the database, not just the screen)

- Prices and costs come from the database, never from the register.
- No sale without the age check ("Customer is 18 or older").
- Staff discounts are capped at the limit in Settings (default ₱50); owners and managers can give any discount.
- Cash received must cover the total. Change is calculated for you.
- A sale is never charged twice, even if the Charge button is tapped twice on a slow connection.

### Who can do what

| | Owner | Manager | Staff |
|---|---|---|---|
| Sell, see stock levels | ✓ | ✓ | ✓ |
| Discount | any | any | up to the limit in Settings |
| Sales | all days, profit, CSV | all days, profit, CSV | today only, no profit |
| Void a sale | ✓ | ✓ | |
| Add / edit products, prices, costs | ✓ | ✓ | |
| Restock, count, damaged / lost | ✓ | ✓ | |
| Settings, staff and roles | ✓ | | |

Row-level security and checked database functions enforce all of this. Staff can't read costs or the stock log through the API either.

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

Database tests (56 checks: roles, checkout rules, stock, voids, reports) run on any local Postgres:

```bash
PGHOST=… PGPORT=… PGUSER=postgres supabase/tests/run.sh
```
