// Collectibles: who owes the shop, from sales charged as "Not paid yet". Grouped by buyer, oldest
// first. Every active staff member sees the list and can record a payment (?q= filters by name).
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { Kpi, KpiGrid } from "@/components/Kpi";
import { Main } from "@/components/Main";
import { Money } from "@/components/Money";
import { Topbar } from "@/components/Topbar";
import { CollectPayment } from "@/components/collectibles/CollectPayment";
import { requireActiveStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/db-errors";
import { buyerKey, saleNo } from "@/lib/format";
import { can } from "@/lib/permissions";
import { formatManilaDate, manilaToday, relativeTime } from "@/lib/time";

export const dynamic = "force-dynamic";

type Owed = {
  id: string;
  sale_number: number;
  business_date: string;
  created_at: string;
  customer_name: string | null;
  total_cents: number;
  balance_cents: number;
  items: { name: string; quantity: number }[];
};

type Buyer = { key: string; name: string; owed: number; sales: Owed[] };

export default async function CollectiblesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { supabase, profile } = await requireActiveStaff();
  const q = ((await searchParams).q ?? "").trim().slice(0, 80);
  const { data, error } = await supabase.rpc("collectibles");
  const rows = (data ?? []) as Owed[];
  const today = manilaToday();
  // Staff can open today's sales only; owners and managers any day.
  const canOpen = (s: Owed) => can(profile, "seeSalesHistory") || s.business_date === today;

  // Rows come oldest first, so each buyer's group (and the group order) is oldest first too.
  const byKey = new Map<string, Buyer>();
  for (const r of rows) {
    const key = buyerKey(r.customer_name) || "—";
    const b = byKey.get(key) ?? { key, name: r.customer_name?.trim() || "No name", owed: 0, sales: [] };
    b.owed += r.balance_cents;
    b.sales.push(r);
    byKey.set(key, b);
  }
  const buyers = [...byKey.values()];
  const needle = buyerKey(q);
  const shown = needle ? buyers.filter((b) => b.key.includes(needle)) : buyers;
  const total = buyers.reduce((n, b) => n + b.owed, 0);
  const oldest = rows[0];

  return (
    <>
      <Topbar title="Collectibles" />
      <Main>
        <div className="stack stack-6">
          {error ? (
            <div className="notice notice--danger" role="alert">
              <Icon name="alert" />
              <div>
                <p className="notice__title">Couldn&apos;t load what&apos;s owed.</p>
                <p>{friendlyError(error)}</p>
              </div>
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              title="Nobody owes the shop anything."
              text="When a sale is saved as “Not paid yet”, it waits here under the buyer's name until it's collected."
              action={
                <Link className="btn btn--primary" href="/">
                  Go to Sell
                </Link>
              }
            />
          ) : (
            <>
              <KpiGrid aria-label="Owed">
                <Kpi
                  variant="hero"
                  wide
                  label="Owed to the shop"
                  value={<Money cents={total} />}
                  meta={`${buyers.length} ${buyers.length === 1 ? "buyer" : "buyers"} · ${rows.length} ${rows.length === 1 ? "sale" : "sales"}`}
                />
                {oldest && (
                  <Kpi
                    label="Oldest"
                    value={formatManilaDate(oldest.business_date, { weekday: false })}
                    meta={oldest.business_date === today ? "today" : relativeTime(oldest.created_at)}
                    variant={oldest.business_date < today ? "alert" : undefined}
                  />
                )}
              </KpiGrid>

              {buyers.length > 1 && (
                <form className="search search--lg" role="search" method="get" action="/collectibles">
                  <Icon name="search" className="search__icon" />
                  <input
                    className="input"
                    type="search"
                    name="q"
                    defaultValue={q}
                    placeholder="Search a buyer"
                    aria-label="Search buyers"
                    autoComplete="off"
                    enterKeyHint="search"
                  />
                  <kbd>/</kbd>
                </form>
              )}

              {shown.length === 0 ? (
                <EmptyState
                  compact
                  title={`Nobody called “${q}” owes anything.`}
                  action={
                    <Link className="text-btn" href="/collectibles">
                      Show everyone
                    </Link>
                  }
                />
              ) : (
                shown.map((b, idx) => (
                  <section key={b.key} className="stack stack-2" aria-labelledby={`buyer-${idx}`}>
                    <div className="section-head">
                      <h2 className="t-heading" id={`buyer-${idx}`}>
                        {b.name}
                      </h2>
                      <Money cents={b.owed} owed className="section-head__amount" />
                    </div>
                    <ul className="list" role="list">
                      {b.sales.map((s) => {
                        const label = `Sale ${saleNo(s.sale_number)} · ${formatManilaDate(s.business_date)}`;
                        return (
                          <li key={s.id} className="list-row">
                            <span className="list-row__main">
                              <span className="list-row__title">
                                {canOpen(s) ? <Link href={`/sales/${s.id}`}>{label}</Link> : <span>{label}</span>}
                              </span>
                              <span className="list-row__meta">
                                {s.items.map((i) => (i.quantity > 1 ? `${i.quantity}× ${i.name}` : i.name)).join(", ")}
                              </span>
                            </span>
                            <span className="list-row__trail">
                              <Money cents={s.balance_cents} owed />
                              {s.balance_cents < s.total_cents && (
                                <span className="t-caption muted">
                                  of <Money cents={s.total_cents} />
                                </span>
                              )}
                            </span>
                            <CollectPayment saleId={s.id} buyer={b.name} label={label} balanceCents={s.balance_cents} />
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))
              )}
            </>
          )}
        </div>
      </Main>
    </>
  );
}
