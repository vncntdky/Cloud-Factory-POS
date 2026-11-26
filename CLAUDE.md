# Cloud Factory POS — guide for Claude sessions

Point-of-sale, inventory, batches and finance for **Cloud Factory**, a vape shop in the Philippines
(Manila time, pesos, amounts stored in centavos). Owner: Vincent (GitHub `vncntdky`). Three roles:
**owner**, **manager**, **staff** (`cashier` in the database). The owner uses it daily on a phone.

Read `docs/HISTORY.md` for what was built and decided so far, and `docs/finance-guide.md` for the money
rules. The SOPs and app handbook live in `lib/help.ts` (shown in the app under Help & SOPs).

## Services

| What | Where |
|---|---|
| Code | GitHub `vncntdky/Cloud-Factory-POS`, branch `main`. Work has been pushed straight to `main`. |
| App | Vercel, deploys every push to `main` automatically. Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. |
| Database | Supabase project `pyjhwbfdxrjeitwjztna` ("Vape POS", us-east-1). Use the Supabase connector (`apply_migration`, `execute_sql`, `get_advisors`, `query_logs`). |

## Stack and app rules

- Next.js 15.5 App Router, React 19, TypeScript, no CSS framework (`app/globals.css` with tokens, light + dark).
- Forms: server actions + `lib/use-form-action.ts` (keeps fields on error), `redirect()` after a save, `revalidatePath`.
- **No `loading.tsx` and no `experimental.staleTimes`**: both broke redirects / links in Next 15.5. Tapped nav
  links show `components/LinkPending.tsx` instead.
- Auth: `middleware.ts` + `lib/auth.ts` call `getClaims` with the bundled public key `lib/supabase/jwks.ts`
  (saves a 0.3–1.2 s key fetch per page). If Supabase rotates its signing key, update that file (it falls back
  to fetching, so a stale copy only costs speed).
- Product photos: Supabase Storage bucket `product-photos`; thumbnails go through `/_next/image`
  (`photoThumb` in `lib/photos.ts`, `next.config.ts` remote pattern from `NEXT_PUBLIC_SUPABASE_URL`).
- **Every rule is enforced in Postgres** (security-definer RPCs with role checks, RLS). The app only hides
  buttons (`lib/permissions.ts`). New features = migration + RPC + tests first, then UI.

## Domain rules (keep these true)

- **Batches**: every supplier delivery is a batch. Every restock, count and loss names its batch
  (`adjust_stock` requires `p_batch`); a new product's starting pieces need a batch. Sales match batches
  **first in, first out** (`batch_matches`, `batch_sales`).
- **Orders** (`supabase/migrations/20261126000000_batch_orders.sql`): a batch can be ordered first (`order_batch`,
  `stock_batches.ordered_on`, `received_on` null = on the way, pieces in `batch_order_lines`) and marked Arrived
  (`arrive_batch` makes the restock movements). Nothing goes on the shelf, or into a batch, while it is on the way
  (trigger on `stock_movements`). `undo_batch_arrival` puts it back while nothing sold, was counted or is reserved.
  The arrival date can be any day from the order day to today.
- **Supplier payments** (`batch_payments`: amount, day, source company | owner | investment) replace the old
  "paid from company funds" flag. Owner's money and investment both count as owner capital.
- **Landed cost** per piece = its cost + the batch's restocking fees (shipping, tax, MOOE, other) ÷ pieces received.
- **Finance** (`supabase/migrations/20261118000000_finance.sql`, `lib/finance.ts`, Sales → Finance):
  - Profit & loss is accrual; cash flow is cash; balance: cash + receivables + inventory + stock on the way =
    tax payable + owed to suppliers + owner capital + profit kept. A batch's cost counts from its order day and
    moves into inventory on its arrival day; company-fund payments leave cash on the day paid. DB tests check
    the identity — keep them passing.
  - **Owner capital** = capital entries + supplier payments with the owner's money or an investment (Batch 1
    was paid by the owners).
  - **Safe to distribute** = lower of profit kept and spare cash (cash − tax reserve − owed to suppliers −
    inventory reserve).
    `release_profits` / `update_fund_release` refuse more. Split owner : manager is a setting (2 : 1 now).
  - Percentage tax estimate = `settings.tax_rate_bp` × net sales (owner sets it; default 3%, currently 0%).
  - Inventory reserve = what the owners decided to keep for the next restock (`fund_set_asides`); the next
    order the company fund pays for (now or on pick-up) uses it up, then Finance asks again.
- Owner can edit every money record (expenses, capital, distributions, batch details, tax rate, split);
  managers can edit expenses and batches; staff sell, reserve and collect.

## Workflow

0. **Consult first**: before building a feature or answering a business question, consult the strategy consultant
   (`.claude/agents/strategy-consultant.md`: answer first, MECE, 80/20, every number in pesos computed in code from
   the shop's own data). The owner asked for this. Its analyses go in `analysis/`.
1. **Migration**: `supabase/migrations/YYYYMMDDHHMMSS_name.sql`, then add checks to `supabase/tests/pos_test.sql`.
2. **Database tests** on a throwaway local Postgres 16 (needs the `postgresql` package; any data dir):
   `PGHOST=<socket dir> PGPORT=<port> PGUSER=postgres bash supabase/tests/run.sh` → prints `failures | checks`
   (337 checks, 0 failures at hand-off).
3. **Apply live** with the Supabase connector's `apply_migration` (same SQL). Changes that delete or update
   data may ask the owner to confirm.
4. **Live data checks** as the owner, read-only, in a transaction:
   ```sql
   begin;
   select set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role='owner' and active limit 1), 'role','authenticated')::text, true);
   set local role authenticated;
   select public.finance_report('2026-10-01', public.manila_today());
   rollback;
   ```
5. **App**: `npx tsc --noEmit -p .`, then the browser tests in `e2e/` (see `e2e/README.md`).
6. Commit as the repo owner (`vncntdky`), push to `main`; Vercel deploys. Run `rm -rf .next` before committing.

## Writing for the owner

- UI and docs: plain words, short sentences, what the shop owner recognises (Batch, On the shelf, Safe to
  distribute), no jargon without a hint line. Keep the UI simple and functional; phone first; no sideways scroll.
- Help & SOPs: `lib/help.ts` is the in-app copy of the SOP doc. Change both together (`node docs/sop-doc.js`
  prints lib/help.ts as the doc's markdown sections, to paste into the doc); handbook pictures are
  `public/help/*.webp` (regenerate with `e2e/shots-*.js`).
- Money: ₱ with commas; costs in brackets in statements.

## Docs (Claude Docs in the owner's account; private until shared from the doc's Share menu)

- SOPs + App handbook (two tabs, the same text and pictures as Help & SOPs, updated 26 Nov for orders and payments):
  https://claude.ai/artifact/4AGjBD9f5jYSuAQ1N9wHyC
- Finance guide (the same text as `docs/finance-guide.md`, updated 26 Nov): https://claude.ai/artifact/HeShp2BXvro6KcmMWxegsu
- Made in the original account, now out of date and not readable from the owner's account: the old SOPs
  (JopnrD6iEhw99erbLfrG6C), Finance guide (JXSvi5AvpM9QTLDvb9te3B) and System map (AjVFzU2b6UwYdgBNuTukjb).

## Open items

See the end of `docs/HISTORY.md`.
