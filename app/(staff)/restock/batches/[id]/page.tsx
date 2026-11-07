// One batch: how its pieces have sold, product by product (first in, first out). id "before" is the
// stock that came in before batches were recorded. Owners and managers.
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Kpi, KpiGrid } from "@/components/Kpi";
import { Main } from "@/components/Main";
import { Money } from "@/components/Money";
import { NotAllowed } from "@/components/NotAllowed";
import { Topbar } from "@/components/Topbar";
import { BatchCostsForm } from "@/components/restock/BatchCostsForm";
import { requireActiveStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/db-errors";
import { productLabel, saleNo } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { can } from "@/lib/permissions";
import { paceLabel } from "@/lib/restock";
import { formatManilaDate } from "@/lib/time";
import { batchTitle, loadBatches, restockCosts, totals, type BatchRow } from "../../data";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

/** Days between two timestamps, at least 1. */
function spanDays(from: string, to: string | Date) {
  return Math.max(1, (new Date(to).getTime() - new Date(from).getTime()) / DAY_MS);
}

function soldLine(r: BatchRow) {
  if (r.sold === 0) return "Not sold yet";
  if (r.sold >= r.received && r.last_sold_at) {
    const d = Math.round(spanDays(r.first_in, r.last_sold_at));
    return `Sold out ${formatManilaDate(r.last_sold_at)}, in ${d} day${d === 1 ? "" : "s"}`;
  }
  return `${paceLabel(r.sold / spanDays(r.first_in, new Date()))} since it arrived`;
}

export default async function BatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ received?: string; costs?: string }>;
}) {
  const { id } = await params;
  if (id !== "before" && !isUuid(id)) notFound();
  const { supabase, profile } = await requireActiveStaff();
  if (!can(profile, "editStock")) return <NotAllowed title="Batch" what="Batches" />;
  const sp = await searchParams;

  const [{ list, error }, products, owedRes] = await Promise.all([
    loadBatches(supabase),
    supabase.from("products").select("id, brand, name, variant, on_hand"),
    supabase.rpc("batch_owed", { p_batch: id === "before" ? null : id }),
  ]);
  const owedSales = (owedRes.data ?? []) as {
    sale_id: string;
    sale_number: number;
    business_date: string;
    customer_name: string | null;
    pcs: number;
    owed_cents: number;
  }[];
  const entry = list.find((b) => (b.batch.id ?? "before") === id);
  if (!error && !entry) notFound();
  const names = new Map(
    ((products.data ?? []) as { id: string; brand: string | null; name: string; variant: string | null }[]).map((p) => [p.id, productLabel(p)]),
  );

  if (error || !entry) {
    return (
      <>
        <Topbar title="Batch" backHref="/restock?view=batches" backLabel="Back to batches" />
        <Main>
          <div className="notice notice--danger" role="alert">
            <Icon name="alert" />
            <div>
              <p className="notice__title">Couldn&apos;t load this batch.</p>
              <p>{friendlyError(error)}</p>
            </div>
          </div>
        </Main>
      </>
    );
  }

  const { batch, rows } = entry;
  const t = totals(rows);
  const left = t.received - t.sold;
  const share = t.received > 0 ? t.sold / t.received : 0;
  const days = spanDays(t.firstIn, t.sold >= t.received && t.lastSoldAt ? t.lastSoldAt : new Date());
  const perDay = t.sold / days;
  const sortedRows = [...rows].sort((a, b) => b.sold / b.received - a.sold / a.received || (names.get(a.product_id) ?? "").localeCompare(names.get(b.product_id) ?? ""));
  const title = batchTitle(batch);
  const extras = restockCosts(batch);
  const totalCost = t.goodsCost === null ? null : t.goodsCost + extras;
  // Restock costs are shared by every piece in the batch; the sold pieces carry their part.
  const profitAfter = t.profit === null ? null : t.profit - (t.received > 0 ? Math.round((extras * t.sold) / t.received) : 0);
  const buyers = new Set(owedSales.map((s) => (s.customer_name ?? "").trim().toLowerCase())).size;

  return (
    <>
      <Topbar title={title} backHref="/restock?view=batches" backLabel="Back to batches" />
      <Main>
        <div className="stack stack-6 narrow">
          {sp.received === "1" && (
            <div className="notice notice--success" role="status">
              <Icon name="check" />
              <div>
                <p className="notice__title">
                  {title} received: {t.received} pcs on the shelf.
                </p>
                <p>Its sales show here as the pieces sell.</p>
              </div>
            </div>
          )}
          {sp.costs === "saved" && (
            <div className="notice notice--success" role="status">
              <Icon name="check" />
              <div>
                <p className="notice__title">Restock costs saved.</p>
              </div>
            </div>
          )}

          <p className="t-sm muted">
            {batch.received_on
              ? `Arrived ${formatManilaDate(batch.received_on)}`
              : `Opening stock and single restocks from ${formatManilaDate(t.firstIn)}, before batches were recorded`}
            {batch.supplier && ` · ${batch.supplier}`}
            {batch.note && ` · ${batch.note}`}
          </p>

          <KpiGrid aria-label="Batch sales">
            <Kpi
              variant="hero"
              wide
              label="Sold"
              value={<span className="num">{Math.round(share * 100)}%</span>}
              meta={`${t.sold} of ${t.received} pcs · ${left} left`}
            />
            <Kpi label="Sales" value={<Money cents={t.sales} />} meta="after discounts" />
            <Kpi
              label="Still owed"
              variant={t.owed > 0 ? "alert" : undefined}
              value={<Money cents={t.owed} />}
              meta={t.owed > 0 ? `${buyers} buyer${buyers === 1 ? "" : "s"} · see below` : "All paid"}
            />
            <Kpi
              label="Gross profit"
              value={t.profit === null ? "–" : <Money cents={t.profit} />}
              meta={t.profit === null ? "Some pieces have no cost" : t.sales > 0 ? `${Math.round((t.profit / t.sales) * 100)}% margin` : undefined}
            />
            {batch.id !== null && (
              <Kpi
                label="After restock costs"
                value={profitAfter === null ? "–" : <Money cents={profitAfter} />}
                meta={extras === 0 ? "No restock costs entered" : "shipping, tax, MOOE… for pieces sold"}
              />
            )}
            <Kpi
              wide
              label="Pace"
              value={t.sold === 0 ? "No sales yet" : paceLabel(perDay)}
              meta={
                t.sold === 0
                  ? undefined
                  : left <= 0
                    ? `Sold out in ${Math.round(days)} day${Math.round(days) === 1 ? "" : "s"}`
                    : `About ${Math.ceil(left / perDay)} more days to sell the rest`
              }
            />
          </KpiGrid>

          {owedSales.length > 0 && (
            <section className="card card--flush" aria-labelledby="owed-t">
              <div className="card__head">
                <h2 className="card__title" id="owed-t">
                  Still owed on this batch
                </h2>
                <span className="t-caption muted">
                  <Money cents={t.owed} />
                </span>
              </div>
              <ul className="list list--plain" role="list">
                {owedSales.map((s) => (
                  <li key={s.sale_id}>
                    <Link className="list-row list-row--compact" href={`/sales/${s.sale_id}`}>
                      <span className="list-row__main">
                        <span className="list-row__title">
                          <span>{s.customer_name?.trim() || "No name"}</span>
                        </span>
                        <span className="list-row__meta">
                          Sale {saleNo(s.sale_number)} · {formatManilaDate(s.business_date)} · {s.pcs} pc{s.pcs === 1 ? "" : "s"} from
                          this batch
                        </span>
                      </span>
                      <span className="list-row__trail">
                        <span className="num text-alert">
                          <Money cents={s.owed_cents} />
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="card__body t-sm muted">
                Tap a sale to collect. A sale with pieces from more than one batch is split by pieces.
              </p>
            </section>
          )}

          {batch.id !== null && (
            <section className="card stack" aria-labelledby="costs-t">
              <div className="card__head">
                <h2 className="card__title" id="costs-t">
                  Batch cost
                </h2>
              </div>
              <dl className="cost-list">
                <dt>Goods ({t.received} pcs)</dt>
                <dd>{t.goodsCost === null ? "Some pieces have no cost" : <Money cents={t.goodsCost} />}</dd>
                <dt>Shipping</dt>
                <dd>
                  <Money cents={batch.shipping_cents} />
                </dd>
                <dt>Tax</dt>
                <dd>
                  <Money cents={batch.tax_cents} />
                </dd>
                <dt>MOOE</dt>
                <dd>
                  <Money cents={batch.mooe_cents} />
                </dd>
                <dt>{batch.other_label || "Other"}</dt>
                <dd>
                  <Money cents={batch.other_cents} />
                </dd>
                <dt className="cost-list__total">Total</dt>
                <dd className="cost-list__total">{totalCost === null ? "–" : <Money cents={totalCost} />}</dd>
                <dt>Per piece</dt>
                <dd>{totalCost === null || t.received === 0 ? "–" : <Money cents={Math.round(totalCost / t.received)} />}</dd>
              </dl>
              <BatchCostsForm id={batch.id} batch={batch} />
            </section>
          )}

          <section className="card card--flush" aria-labelledby="lines-t">
            <div className="card__head">
              <h2 className="card__title" id="lines-t">
                By product
              </h2>
              <span className="t-caption muted">{rows.length}</span>
            </div>
            <ul className="list list--plain" role="list">
              {sortedRows.map((r) => (
                <li key={r.product_id}>
                  <Link className="list-row list-row--compact" href={`/inventory/${r.product_id}`}>
                    <span className="list-row__main">
                      <span className="list-row__title">
                        <span>{names.get(r.product_id) ?? "Removed product"}</span>
                        {r.sold >= r.received && <span className="chip chip--ok">Sold out</span>}
                      </span>
                      <span className="list-row__meta">
                        {soldLine(r)} · <Money cents={r.sales_cents} />
                        {r.owed_cents > 0 && (
                          <>
                            {" · "}
                            <span className="text-alert">
                              <Money cents={r.owed_cents} /> owed
                            </span>
                          </>
                        )}
                      </span>
                      <span className="meter" aria-hidden="true">
                        <span style={{ width: `${Math.min(100, (r.sold / r.received) * 100)}%` }} />
                      </span>
                    </span>
                    <span className="list-row__trail stock-count">
                      <span className="num">
                        {r.sold} / {r.received}
                      </span>
                      <span className="t-caption muted">sold</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <p className="t-sm muted">
            Sales are matched first in, first out: a product&apos;s older pieces sell before this batch&apos;s. Damaged or
            lost pieces aren&apos;t counted here.
          </p>
        </div>
      </Main>
    </>
  );
}
