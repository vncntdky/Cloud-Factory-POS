// Sales: the daily close. ?date= (default today) or ?from=&to= for owners and managers.
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { Kpi, KpiGrid } from "@/components/Kpi";
import { Main } from "@/components/Main";
import { Money } from "@/components/Money";
import { Topbar } from "@/components/Topbar";
import { fetchAll, parseSalesRange } from "@/components/sales/data";
import { requireActiveStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/db-errors";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, paymentMethodLabel, percent, pesos, saleNo } from "@/lib/format";
import { can } from "@/lib/permissions";
import { addDays, formatManilaDate, formatManilaTime, manilaMonthStart, manilaToday } from "@/lib/time";

export const dynamic = "force-dynamic";

type Summary = {
  sales: number;
  voided: number;
  gross_cents: number;
  discount_cents: number;
  net_cents: number;
  pieces: number;
  by_method: Record<string, { count: number; cents: number }>;
  cogs_cents: number | null;
  uncosted_lines: number | null;
  top: { name: string; qty: number; cents: number }[];
};

type SaleRow = {
  id: string;
  sale_number: number;
  business_date: string;
  status: "completed" | "voided";
  total_cents: number;
  payment_method: string;
  created_at: string;
  sale_items: { quantity: number; name: string }[];
};

type SP = { date?: string | string[]; from?: string | string[]; to?: string | string[] };

function rangeLabel(from: string, to: string, today: string) {
  if (from === to) return from === today ? `Today · ${formatManilaDate(from)}` : formatManilaDate(from);
  return `${formatManilaDate(from, { weekday: false })} – ${formatManilaDate(to, { weekday: false })}`;
}

export default async function SalesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { supabase, profile } = await requireActiveStaff();
  // Staff see today only (the database also hides earlier days from them).
  const history = can(profile, "seeSalesHistory");
  const today = manilaToday();
  const { from, to, single } = history ? parseSalesRange(await searchParams) : { from: today, to: today, single: true };

  const [summaryRes, salesRes] = await Promise.all([
    supabase.rpc("sales_summary", { p_from: from, p_to: to }),
    fetchAll<SaleRow>((a, b) =>
      supabase
        .from("sales")
        .select("id, sale_number, business_date, status, total_cents, payment_method, created_at, sale_items(quantity, name)")
        .gte("business_date", from)
        .lte("business_date", to)
        .order("business_date", { ascending: false })
        .order("sale_number", { ascending: false })
        .range(a, b),
    ),
  ]);
  const loadError = summaryRes.error ?? salesRes.error;
  const s = summaryRes.data as Summary | null;
  const sales = salesRes.rows;
  const profit = s && s.cogs_cents !== null ? s.net_cents - s.cogs_cents : null;
  const methods = PAYMENT_METHODS.filter((m) => s?.by_method?.[m]);
  const exportHref = `/sales/export?from=${from}&to=${to}`;

  return (
    <>
      <Topbar
        title="Sales"
        eyebrow={rangeLabel(from, to, today).toUpperCase()}
        actions={
          history ? (
            <a className="btn btn--secondary btn--sm" href={exportHref}>
              <Icon name="download" />
              CSV
            </a>
          ) : undefined
        }
      />
      <Main>
        <div className="stack stack-6">
          {history && (
            <div className="stack stack-3">
              <div className="filter-row" role="toolbar" aria-label="Pick a day">
                <Link className="filter-chip" href="/sales" aria-current={single && from === today ? "true" : undefined}>
                  Today
                </Link>
                <Link
                  className="filter-chip"
                  href={`/sales?date=${addDays(today, -1)}`}
                  aria-current={single && from === addDays(today, -1) ? "true" : undefined}
                >
                  Yesterday
                </Link>
                <Link
                  className="filter-chip"
                  href={`/sales?from=${addDays(today, -6)}&to=${today}`}
                  aria-current={from === addDays(today, -6) && to === today ? "true" : undefined}
                >
                  Last 7 days
                </Link>
                <Link
                  className="filter-chip"
                  href={`/sales?from=${manilaMonthStart()}&to=${today}`}
                  aria-current={!single && from === manilaMonthStart() && to === today ? "true" : undefined}
                >
                  This month
                </Link>
              </div>
              <details className="card sales-pick">
                <summary className="text-btn">
                  <Icon name="calendar" size={20} />
                  Pick a date or range
                </summary>
                <div className="form-grid form-grid--2 sales-pick__body">
                  <form method="get" action="/sales" className="inline-form">
                    <div className="field grow">
                      <label className="field__label" htmlFor="sales-date">
                        Day
                      </label>
                      <input className="input" id="sales-date" name="date" type="date" defaultValue={from} max={today} required />
                    </div>
                    <button type="submit" className="btn btn--secondary">
                      Show
                    </button>
                  </form>
                  <form method="get" action="/sales" className="inline-form">
                    <div className="field grow">
                      <label className="field__label" htmlFor="sales-from">
                        From
                      </label>
                      <input className="input" id="sales-from" name="from" type="date" defaultValue={from} max={today} required />
                    </div>
                    <div className="field grow">
                      <label className="field__label" htmlFor="sales-to">
                        To
                      </label>
                      <input className="input" id="sales-to" name="to" type="date" defaultValue={to} max={today} required />
                    </div>
                    <button type="submit" className="btn btn--secondary">
                      Show
                    </button>
                  </form>
                </div>
              </details>
            </div>
          )}

          {loadError ? (
            <div className="notice notice--danger" role="alert">
              <Icon name="alert" />
              <div>
                <p className="notice__title">Couldn&apos;t load sales.</p>
                <p>{friendlyError(loadError)}</p>
              </div>
            </div>
          ) : (
            <>
              <KpiGrid aria-label="Totals">
                <Kpi
                  variant="hero"
                  wide
                  label={single && from === today ? "Sales today" : "Sales"}
                  value={<Money cents={s?.net_cents ?? 0} />}
                  meta={`${s?.sales ?? 0} ${s?.sales === 1 ? "sale" : "sales"} · ${s?.pieces ?? 0} pcs`}
                />
                {profit !== null ? (
                  <Kpi
                    label="Gross profit"
                    value={<Money cents={profit} />}
                    meta={
                      s && s.net_cents > 0
                        ? `${percent(profit / s.net_cents)} margin${s.uncosted_lines ? ` · ${s.uncosted_lines} without cost` : ""}`
                        : undefined
                    }
                  />
                ) : (
                  <Kpi label="Pieces sold" value={<span className="num">{s?.pieces ?? 0}</span>} />
                )}
                <Kpi
                  label="Discounts"
                  value={<Money cents={s?.discount_cents ?? 0} />}
                  meta={s?.voided ? `${s.voided} voided` : undefined}
                  variant={s?.voided ? "alert" : undefined}
                />
              </KpiGrid>

              <section className="card" aria-labelledby="by-method">
                <div className="card__head">
                  <h2 className="card__title" id="by-method">
                    Money in by method
                  </h2>
                </div>
                <div className="card__body">
                  {methods.length === 0 ? (
                    <p className="t-sm muted">No sales yet.</p>
                  ) : (
                    <dl className="dl">
                      {methods.map((m) => (
                        <div key={m} style={{ display: "contents" }}>
                          <dt>
                            {PAYMENT_METHOD_LABELS[m]} · {s!.by_method[m].count}
                          </dt>
                          <dd>
                            <Money cents={s!.by_method[m].cents} decimals={2} />
                          </dd>
                        </div>
                      ))}
                      <dt className="dl__total">Total</dt>
                      <dd className="dl__total">
                        <Money cents={s?.net_cents ?? 0} decimals={2} />
                      </dd>
                    </dl>
                  )}
                  {(s?.by_method?.cash?.cents ?? 0) > 0 && (
                    <p className="t-sm muted" style={{ marginTop: "var(--space-3)" }}>
                      The cash drawer should have {pesos(s!.by_method.cash.cents, 2)} more than the opening float.
                    </p>
                  )}
                </div>
              </section>

              {s && s.top.length > 0 && (
                <section className="card" aria-labelledby="top-sellers">
                  <div className="card__head">
                    <h2 className="card__title" id="top-sellers">
                      Top sellers
                    </h2>
                  </div>
                  <ol className="list list--plain top-list" role="list">
                    {s.top.map((t) => (
                      <li key={t.name} className="list-row list-row--compact">
                        <span className="list-row__main">
                          <span className="list-row__title">{t.name}</span>
                        </span>
                        <span className="list-row__trail">
                          <span className="num">{t.qty} pcs</span>
                          <Money cents={t.cents} />
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              <section aria-labelledby="sale-list" className="stack stack-3">
                <div className="section-head">
                  <h2 className="t-heading" id="sale-list">
                    {single ? "Sales" : "All sales"}
                  </h2>
                  <span className="section-head__count num">{sales.length}</span>
                </div>
                {sales.length === 0 ? (
                  <EmptyState
                    compact
                    title="No sales yet."
                    action={
                      <Link className="btn btn--primary" href="/">
                        Go to Sell
                      </Link>
                    }
                  />
                ) : (
                  <ul className="list" role="list">
                    {sales.map((sale) => {
                      const pcs = sale.sale_items.reduce((n, i) => n + i.quantity, 0);
                      const voided = sale.status === "voided";
                      return (
                        <li key={sale.id}>
                          <Link className="list-row" href={`/sales/${sale.id}`}>
                            <span className="list-row__lead list-row__time num">{formatManilaTime(sale.created_at)}</span>
                            <span className="list-row__main">
                              <span className="list-row__title">
                                <span>
                                  {saleNo(sale.sale_number)}
                                  {!single && ` · ${formatManilaDate(sale.business_date, { weekday: false })}`}
                                </span>
                                {voided && (
                                  <span className="chip chip--voided">
                                    <Icon name="x" />
                                    Voided
                                  </span>
                                )}
                              </span>
                              <span className="list-row__meta truncate">
                                {paymentMethodLabel(sale.payment_method)} · {pcs} pcs ·{" "}
                                {sale.sale_items.map((i) => (i.quantity > 1 ? `${i.quantity}× ${i.name}` : i.name)).join(", ")}
                              </span>
                            </span>
                            <span className="list-row__trail">
                              <Money cents={sale.total_cents} strike={voided} />
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </Main>
    </>
  );
}
