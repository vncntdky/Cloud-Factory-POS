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
- **Landed cost** per piece = its cost + the batch's restocking fees (shipping, tax, MOOE, other) ÷ pieces received.
- **Finance** (`supabase/migrations/20261118000000_finance.sql`, `lib/finance.ts`, Sales → Finance):
  - Profit & loss is accrual; cash flow is cash; balance: cash + receivables + inventory = tax payable + owner
    capital + profit kept. A DB test checks the identity — keep it passing.
  - **Owner capital** = capital entries + any batch with "paid from company funds" off (Batch 1 was paid by
    the owners).
  - **Safe to distribute** = lower of profit kept and spare cash (cash − tax reserve − inventory reserve).
    `release_profits` / `update_fund_release` refuse more. Split owner : manager is a setting (2 : 1 now).
  - Percentage tax estimate = `settings.tax_rate_bp` × net sales (owner sets it; default 3%, currently 0%).
  - Inventory reserve = what the owners decided to keep for the next restock (`fund_set_asides`); the next
    fund-paid batch uses it up, then Finance asks again.
- Owner can edit every money record (expenses, capital, distributions, batch details, tax rate, split);
  managers can edit expenses and batches; staff sell, reserve and collect.

## Workflow

1. **Migration**: `supabase/migrations/YYYYMMDDHHMMSS_name.sql`, then add checks to `supabase/tests/pos_test.sql`.
2. **Database tests** on a throwaway local Postgres 16 (needs the `postgresql` package; any data dir):
   `PGHOST=<socket dir> PGPORT=<port> PGUSER=postgres bash supabase/tests/run.sh` → prints `failures | checks`
   (258 checks, 0 failures at hand-off).
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

- SOPs + App handbook (two tabs, the same text and pictures as Help & SOPs, 14 Nov):
  https://claude.ai/artifact/4AGjBD9f5jYSuAQ1N9wHyC
- Finance guide (the same text as `docs/finance-guide.md`, 14 Nov): https://claude.ai/artifact/HeShp2BXvro6KcmMWxegsu
- Made in the original account, now out of date and not readable from the owner's account: the old SOPs
  (JopnrD6iEhw99erbLfrG6C), Finance guide (JXSvi5AvpM9QTLDvb9te3B) and System map (AjVFzU2b6UwYdgBNuTukjb).

## Open items

See the end of `docs/HISTORY.md`.
