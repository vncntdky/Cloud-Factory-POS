// Sales → Dashboard (owners and managers): how the shop is doing over a range. Unit economics
// against the previous period, sales and profit over time, best sellers and slow movers, every
// product's pace, and the busiest times. ?range = 7d | 30d | 90d | 12m, ?sort = the product table.
import Link from "next/link";
import { ColumnChart } from "@/components/charts/ColumnChart";
import { Heatmap, hourLabel, type HeatCell } from "@/components/charts/Heatmap";
import { RankBars } from "@/components/charts/RankBars";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { Kpi, KpiGrid } from "@/components/Kpi";
import { Main } from "@/components/Main";
import { Money } from "@/components/Money";
import { NotAllowed } from "@/components/NotAllowed";
import { Topbar } from "@/components/Topbar";
import { requireActiveStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/db-errors";
import { pesos } from "@/lib/format";
import { can } from "@/lib/permissions";
import { daysLeftLabel, paceLabel } from "@/lib/restock";
import { addDays, formatManilaDate, manilaToday } from "@/lib/time";

export const dynamic = "force-dynamic";

const RANGES = [
  { id: "7d", label: "7 days", days: 7, grain: "day" },
  { id: "30d", label: "30 days", days: 30, grain: "day" },
  { id: "90d", label: "90 days", days: 90, grain: "week" },
  { id: "12m", label: "12 months", days: 365, grain: "month" },
] as const;
type Range = (typeof RANGES)[number];

type Totals = {
  sales_cents: number;
  discount_cents: number;
  cost_cents: number;
  uncosted: number;
  pieces: number;
  sales: number;
  owed_cents: number;
  restock_cents: number;
};
type Bucket = {
  start: string;
  sales_cents: number;
  discount_cents: number;
  cost_cents: number;
  uncosted: number;
  pieces: number;
  sales: number;
};
type ProductRow = {
  product_id: string;
  name: string;
  active: boolean;
  on_hand: number;
  pieces: number;
  sales_cents: number;
  cost_cents: number;
  uncosted: number;
  first_in: string | null;
  last_sold_at: string | null;
};
type Dashboard = { buckets: Bucket[]; current: Totals; previous: Totals; products: ProductRow[]; hours: HeatCell[] };

const DAY_MS = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function bucketLabel(start: string, grain: Range["grain"]) {
  if (grain === "month") return MONTHS[Number(start.slice(5, 7)) - 1];
  return formatManilaDate(start, { weekday: false, year: false });
}

/** "▲ 12%" / "▼ 8%" / "new" vs the previous period, and whether it's good. */
function delta(now: number, before: number, upIsGood = true) {
  if (before === 0 && now === 0) return null;
  if (before === 0) return { text: "new", good: upIsGood };
  const pct = Math.round(((now - before) / Math.abs(before)) * 100);
  if (pct === 0) return { text: "no change", good: true };
  return { text: `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}%`, good: pct > 0 === upIsGood };
}

function Delta({ now, before, label }: { now: number; before: number; label: string }) {
  const d = delta(now, before);
  if (!d) return <>No sales either period</>;
  return (
    <>
      <span className={`delta-chip ${d.good ? "delta-chip--up" : "delta-chip--down"}`}>{d.text}</span> vs {label}
    </>
  );
}

const SORTS = [
  { id: "pieces", label: "Sold" },
  { id: "pace", label: "Per day" },
  { id: "sales", label: "Sales" },
  { id: "profit", label: "Profit" },
  { id: "margin", label: "Margin" },
  { id: "stock", label: "Stock" },
  { id: "days", label: "Days left" },
] as const;
type Sort = (typeof SORTS)[number]["id"];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string; sort?: string }> }) {
  const { supabase, profile } = await requireActiveStaff();
  if (!can(profile, "seeCosts")) return <NotAllowed title="Dashboard" what="The dashboard" />;
  const sp = await searchParams;
  const range = RANGES.find((r) => r.id === sp.range) ?? RANGES[1];
  const sort: Sort = SORTS.some((s) => s.id === sp.sort) ? (sp.sort as Sort) : "pieces";
  const to = manilaToday();
  const from = addDays(to, -(range.days - 1));
  const prevLabel = `previous ${range.label}`;

  const { data, error } = await supabase.rpc("dashboard", { p_from: from, p_to: to, p_grain: range.grain });
  const d = data as Dashboard | null;

  const header = (
    <>
      <nav className="segmented" aria-label="Sales">
        <Link className="segmented__option" href="/sales">
          Daily sales
        </Link>
        <Link className="segmented__option" href="/sales/dashboard" aria-current="page">
          Dashboard
        </Link>
      </nav>
      <div className="filter-row" role="toolbar" aria-label="Range">
        {RANGES.map((r) => (
          <Link
            key={r.id}
            className="filter-chip"
            href={`/sales/dashboard?range=${r.id}`}
            aria-current={r.id === range.id ? "true" : undefined}
          >
            {r.label}
          </Link>
        ))}
      </div>
    </>
  );

  if (error || !d) {
    return (
      <>
        <Topbar title="Dashboard" />
        <Main>
          <div className="notice notice--danger" role="alert">
            <Icon name="alert" />
            <div>
              <p className="notice__title">Couldn&apos;t load the dashboard.</p>
              <p>{friendlyError(error)}</p>
            </div>
          </div>
        </Main>
      </>
    );
  }

  const c = d.current;
  const p = d.previous;
  const profit = c.sales_cents - c.cost_cents;
  const prevProfit = p.sales_cents - p.cost_cents;
  const perSale = c.sales > 0 ? c.sales_cents / c.sales : 0;
  const prevPerSale = p.sales > 0 ? p.sales_cents / p.sales : 0;
  const unitMargin = c.pieces > 0 ? profit / c.pieces : 0;
  const prevUnitMargin = p.pieces > 0 ? prevProfit / p.pieces : 0;
  const pricePerPiece = c.pieces > 0 ? c.sales_cents / c.pieces : 0;
  const incomplete = c.uncosted > 0;

  // Product pace over the range (or since it was first stocked, if later).
  const end = Date.now();
  const rangeStart = new Date(`${from}T00:00:00+08:00`).getTime();
  const products = d.products.map((r) => {
    const startMs = Math.max(rangeStart, r.first_in ? new Date(r.first_in).getTime() : rangeStart);
    const days = Math.max(1, (end - startMs) / DAY_MS);
    const perDay = r.pieces / days;
    const prof = r.sales_cents - r.cost_cents;
    return {
      ...r,
      perDay,
      profit: prof,
      margin: r.sales_cents > 0 ? prof / r.sales_cents : null,
      daysLeft: perDay > 0 ? Math.max(0, r.on_hand) / perDay : null,
    };
  });
  const best = [...products]
    .filter((r) => r.pieces > 0)
    .sort((a, b) => b.pieces - a.pieces || b.sales_cents - a.sales_cents)
    .slice(0, 5);
  const slow = [...products]
    .filter((r) => r.active && r.on_hand > 0)
    .sort((a, b) => a.perDay - b.perDay || b.on_hand - a.on_hand)
    .slice(0, 5);
  const key: Record<Sort, (r: (typeof products)[number]) => number> = {
    pieces: (r) => r.pieces,
    pace: (r) => r.perDay,
    sales: (r) => r.sales_cents,
    profit: (r) => r.profit,
    margin: (r) => r.margin ?? -Infinity,
    stock: (r) => r.on_hand,
    days: (r) => (r.daysLeft === null ? Infinity : r.daysLeft),
  };
  const asc = sort === "days";
  const table = [...products].sort(
    (a, b) => (asc ? key[sort](a) - key[sort](b) : key[sort](b) - key[sort](a)) || a.name.localeCompare(b.name),
  );

  // Busiest slot, named in text.
  const peak = [...d.hours].sort((a, b) => b.sales - a.sales)[0];
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  const labels = d.buckets.map((b) => bucketLabel(b.start, range.grain));
  const bucketHeading = (b: Bucket) =>
    range.grain === "day"
      ? formatManilaDate(b.start)
      : range.grain === "week"
        ? `Week of ${formatManilaDate(b.start, { weekday: false })}`
        : `${MONTHS[Number(b.start.slice(5, 7)) - 1]} ${b.start.slice(0, 4)}`;

  if (c.sales === 0 && p.sales === 0) {
    return (
      <>
        <Topbar title="Dashboard" />
        <Main>
          <div className="stack stack-6">
            {header}
            <EmptyState
              title={`No sales in the last ${range.label}.`}
              text="Pick a longer range, or check back once sales come in."
            />
          </div>
        </Main>
      </>
    );
  }

  return (
    <>
      <Topbar title="Dashboard" />
      <Main>
        <div className="stack stack-6">
          {header}

          <section className="stack stack-3" aria-labelledby="units-t">
            <h2 className="eyebrow" id="units-t">
              How the shop is doing · {formatManilaDate(from, { weekday: false })} – {formatManilaDate(to, { weekday: false })}
            </h2>
            <KpiGrid aria-label="Unit economics">
              <Kpi
                variant="hero"
                wide
                label="Net sales"
                value={<Money cents={c.sales_cents} />}
                meta={<Delta now={c.sales_cents} before={p.sales_cents} label={prevLabel} />}
              />
              <Kpi
                label="Gross profit"
                value={<Money cents={profit} />}
                meta={
                  c.sales_cents > 0
                    ? `${Math.round((profit / c.sales_cents) * 100)}% margin${incomplete ? " · some costs missing" : ""}`
                    : undefined
                }
              />
              <Kpi
                label="Pieces sold"
                value={<span className="num">{c.pieces}</span>}
                meta={<Delta now={c.pieces} before={p.pieces} label="before" />}
              />
              <Kpi
                label="Average sale"
                value={<Money cents={Math.round(perSale)} />}
                meta={
                  <>
                    {c.sales > 0 ? `${(c.pieces / c.sales).toFixed(1)} pcs per sale · ` : ""}
                    <Delta now={perSale} before={prevPerSale} label="before" />
                  </>
                }
              />
              <Kpi
                label="Profit per piece"
                value={<Money cents={Math.round(unitMargin)} />}
                meta={
                  <>
                    avg price <Money cents={Math.round(pricePerPiece)} /> ·{" "}
                    <Delta now={unitMargin} before={prevUnitMargin} label="before" />
                  </>
                }
              />
              <Kpi
                label="After restock costs"
                value={<Money cents={profit - c.restock_cents} />}
                meta={
                  c.restock_cents > 0 ? (
                    <>
                      shipping, tax, MOOE: <Money cents={c.restock_cents} />
                    </>
                  ) : (
                    "No restock costs in this range"
                  )
                }
              />
              <Kpi
                label="Still owed"
                variant={c.owed_cents > 0 ? "alert" : undefined}
                value={<Money cents={c.owed_cents} />}
                meta={c.owed_cents > 0 ? "on sales in this range" : "All paid"}
                href={c.owed_cents > 0 ? "/collectibles" : undefined}
              />
            </KpiGrid>
          </section>

          <section className="card stack" aria-labelledby="trend-t">
            <div className="card__head">
              <h2 className="card__title" id="trend-t">
                Sales and profit
              </h2>
              <span className="t-caption muted">by {range.grain}</span>
            </div>
            <ColumnChart
              title="Sales and profit"
              labels={labels}
              unit="pesos"
              series={[
                {
                  key: "cost",
                  label: "Cost of pieces",
                  color: "muted",
                  values: d.buckets.map((b) => Math.min(b.cost_cents, b.sales_cents)),
                },
                {
                  key: "profit",
                  label: "Gross profit",
                  color: "accent",
                  values: d.buckets.map((b) => Math.max(0, b.sales_cents - b.cost_cents)),
                },
              ]}
              tooltips={d.buckets.map((b) => [
                bucketHeading(b),
                `Sales ${pesos(b.sales_cents)} (${b.sales} sale${b.sales === 1 ? "" : "s"}, ${b.pieces} pcs)`,
                `Cost ${pesos(b.cost_cents)}${b.uncosted ? " · some missing" : ""}`,
                `Profit ${pesos(b.sales_cents - b.cost_cents)}`,
                ...(b.discount_cents > 0 ? [`Discounts ${pesos(b.discount_cents)}`] : []),
              ])}
              table={{
                head: [
                  range.grain === "month" ? "Month" : range.grain === "week" ? "Week of" : "Day",
                  "Sales",
                  "Cost",
                  "Profit",
                  "Pieces",
                ],
                rows: d.buckets.map((b) => [
                  bucketHeading(b),
                  pesos(b.sales_cents),
                  pesos(b.cost_cents),
                  pesos(b.sales_cents - b.cost_cents),
                  String(b.pieces),
                ]),
              }}
            />
            <p className="t-sm muted">
              Each column is net sales: the cost of the pieces sold plus gross profit. Tap a column for details.
            </p>
          </section>

          <div className="dash-grid">
            <section className="card stack" aria-labelledby="unit-t">
              <div className="card__head">
                <h2 className="card__title" id="unit-t">
                  Profit per piece
                </h2>
              </div>
              <ColumnChart
                title="Profit per piece"
                labels={labels}
                unit="pesos"
                series={[
                  {
                    key: "unit",
                    label: "Profit per piece",
                    color: "accent",
                    values: d.buckets.map((b) => (b.pieces > 0 ? Math.max(0, (b.sales_cents - b.cost_cents) / b.pieces) : 0)),
                  },
                ]}
                tooltips={d.buckets.map((b) => [
                  bucketHeading(b),
                  b.pieces > 0
                    ? `Profit per piece ${pesos(Math.round((b.sales_cents - b.cost_cents) / b.pieces))}`
                    : "No pieces sold",
                  ...(b.pieces > 0 ? [`Price per piece ${pesos(Math.round(b.sales_cents / b.pieces))}`] : []),
                ])}
                table={{
                  head: ["Period", "Profit per piece", "Price per piece"],
                  rows: d.buckets.map((b) => [
                    bucketHeading(b),
                    b.pieces > 0 ? pesos(Math.round((b.sales_cents - b.cost_cents) / b.pieces)) : "–",
                    b.pieces > 0 ? pesos(Math.round(b.sales_cents / b.pieces)) : "–",
                  ]),
                }}
              />
            </section>
            <section className="card stack" aria-labelledby="pcs-t">
              <div className="card__head">
                <h2 className="card__title" id="pcs-t">
                  Pieces sold
                </h2>
              </div>
              <ColumnChart
                title="Pieces sold"
                labels={labels}
                unit="count"
                series={[{ key: "pcs", label: "Pieces sold", color: "accent", values: d.buckets.map((b) => b.pieces) }]}
                tooltips={d.buckets.map((b) => [
                  bucketHeading(b),
                  `${b.pieces} pcs in ${b.sales} sale${b.sales === 1 ? "" : "s"}`,
                ])}
                table={{
                  head: ["Period", "Pieces", "Sales"],
                  rows: d.buckets.map((b) => [bucketHeading(b), String(b.pieces), String(b.sales)]),
                }}
              />
            </section>
          </div>

          <div className="dash-grid">
            <section className="card stack" aria-labelledby="best-t">
              <div className="card__head">
                <h2 className="card__title" id="best-t">
                  Best sellers
                </h2>
                <span className="t-caption muted">by pieces sold</span>
              </div>
              {best.length === 0 ? (
                <p className="t-sm muted">No sales in this range.</p>
              ) : (
                <RankBars
                  label="Best sellers"
                  rows={best.map((r) => ({
                    key: r.product_id,
                    label: r.name,
                    value: r.pieces,
                    valueText: `${r.pieces} pcs`,
                    meta: `${pesos(r.sales_cents)} · ${paceLabel(r.perDay)}${r.margin !== null ? ` · ${Math.round(r.margin * 100)}% margin` : ""}`,
                    href: `/inventory/${r.product_id}`,
                  }))}
                />
              )}
            </section>
            <section className="card stack" aria-labelledby="slow-t">
              <div className="card__head">
                <h2 className="card__title" id="slow-t">
                  Slowest movers
                </h2>
                <span className="t-caption muted">in stock, selling least</span>
              </div>
              {slow.length === 0 ? (
                <p className="t-sm muted">Nothing on the shelf is standing still.</p>
              ) : (
                <ul className="list list--plain" role="list">
                  {slow.map((r) => (
                    <li key={r.product_id}>
                      <Link className="list-row list-row--compact" href={`/inventory/${r.product_id}`}>
                        <span className="list-row__main">
                          <span className="list-row__title">
                            <span>{r.name}</span>
                            {r.pieces === 0 && <span className="chip chip--low">No sales</span>}
                          </span>
                          <span className="list-row__meta">
                            {r.pieces === 0
                              ? r.last_sold_at
                                ? `Last sold ${formatManilaDate(r.last_sold_at)}`
                                : "Never sold"
                              : `${paceLabel(r.perDay)} · ${daysLeftLabel(r.daysLeft)} of stock`}
                          </span>
                        </span>
                        <span className="list-row__trail stock-count">
                          <span className="num-lg">{r.on_hand}</span>
                          <span className="t-caption muted">pcs</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="stack stack-2" aria-labelledby="all-t">
            <div className="section-head">
              <h2 className="eyebrow" id="all-t">
                Every product
              </h2>
              <span className="section-head__count num">{table.length}</span>
            </div>
            <div className="table-wrap">
              <table className="table table--stack table--dash" role="table">
                <thead role="rowgroup">
                  <tr role="row">
                    <th role="columnheader" scope="col">
                      Product
                    </th>
                    {SORTS.map((s) => (
                      <th
                        key={s.id}
                        role="columnheader"
                        scope="col"
                        className="num"
                        aria-sort={sort === s.id ? (asc ? "ascending" : "descending") : undefined}
                      >
                        <Link href={`/sales/dashboard?range=${range.id}&sort=${s.id}`} className="th-sort">
                          {s.label}
                        </Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {table.map((r) => (
                    <tr key={r.product_id} role="row">
                      <td role="cell" data-label="" className="cell-primary">
                        <Link href={`/inventory/${r.product_id}`}>{r.name}</Link>
                        {!r.active && <span className="chip chip--hidden">Not for sale</span>}
                      </td>
                      <td role="cell" data-label="Sold" className="num">
                        {r.pieces}
                      </td>
                      <td role="cell" data-label="Per day" className="num">
                        {r.perDay > 0 ? paceLabel(r.perDay) : "–"}
                      </td>
                      <td role="cell" data-label="Sales" className="num">
                        <Money cents={r.sales_cents} />
                      </td>
                      <td role="cell" data-label="Profit" className="num">
                        {r.uncosted > 0 ? "–" : <Money cents={r.profit} />}
                      </td>
                      <td role="cell" data-label="Margin" className="num">
                        {r.margin === null || r.uncosted > 0 ? "–" : `${Math.round(r.margin * 100)}%`}
                      </td>
                      <td role="cell" data-label="Stock" className="num">
                        {r.on_hand}
                      </td>
                      <td role="cell" data-label="Days left" className="num">
                        {daysLeftLabel(r.daysLeft)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {d.hours.length > 0 && (
            <section className="card stack" aria-labelledby="heat-t">
              <div className="card__head">
                <h2 className="card__title" id="heat-t">
                  Busiest times
                </h2>
              </div>
              {peak && (
                <p className="t-sm">
                  Busiest:{" "}
                  <strong>
                    {DAYS[peak.dow]}s around {hourLabel(peak.hour)}
                  </strong>{" "}
                  ({peak.sales} sale{peak.sales === 1 ? "" : "s"} in this range). Useful for staffing and restock timing.
                </p>
              )}
              <Heatmap cells={d.hours} />
            </section>
          )}
        </div>
      </Main>
    </>
  );
}
