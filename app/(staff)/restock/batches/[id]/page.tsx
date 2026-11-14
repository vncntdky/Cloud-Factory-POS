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
import { StockFix, type FixableChange } from "@/components/inventory/StockFix";
import { AddToBatchForm } from "@/components/restock/AddToBatchForm";
import { BatchDetailsForm } from "@/components/finance/EditForms";
import { BatchPnlCard } from "@/components/restock/BatchPnlCard";
import { MakeBatchForm } from "@/components/restock/MakeBatchForm";
import { requireActiveStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/db-errors";
import { pesos, productLabel, saleNo } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { can } from "@/lib/permissions";
import { paceLabel } from "@/lib/restock";
import { addDays, formatManilaDate, manilaToday } from "@/lib/time";
import { batchStatement, batchTitle, loadBatches, loadBatchStatements, piecesLeft, totals, type BatchRow } from "../../data";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

/** Days between two timestamps, at least 1. */
function spanDays(from: string, to: string | Date) {
  return Math.max(1, (new Date(to).getTime() - new Date(from).getTime()) / DAY_MS);
}

type Move = FixableChange & { product_id: string };

/** One stock change in this batch, in words. */
function moveLine(m: Move) {
  const each = m.unit_cost_cents !== null ? ` at ${pesos(m.unit_cost_cents)} each` : "";
  const pcs = (n: number) => `${n} pc${n === 1 ? "" : "s"}`;
  switch (m.kind) {
    case "opening":
      return `Came in: ${pcs(m.delta)}${each}`;
    case "restock":
      return `Received: ${pcs(m.delta)}${each}`;
    case "count":
      return `Counted ${m.on_hand_after} on the shelf (${m.delta === 0 ? "matched" : m.delta > 0 ? `${m.delta} more` : `${-m.delta} fewer`})`;
    case "waste":
      return `Damaged / lost: ${pcs(-m.delta)}`;
  }
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
  searchParams: Promise<{
    received?: string;
    costs?: string;
    expense?: string;
    split?: string;
    made?: string;
    added?: string;
    fixed?: string;
    details?: string;
  }>;
}) {
  const { id } = await params;
  if (id !== "before" && !isUuid(id)) notFound();
  const { supabase, profile } = await requireActiveStaff();
  if (!can(profile, "editStock")) return <NotAllowed title="Batch" what="Batches" />;
  const sp = await searchParams;

  const movesQuery = supabase
    .from("stock_movements")
    .select("id, product_id, kind, delta, on_hand_after, unit_cost_cents")
    .in("kind", ["opening", "restock", "count", "waste"])
    .order("created_at");
  const [{ list, expenses, error: batchesError }, { statements, error: statementsError }, products, owedRes, splitRes, movesRes, categoriesRes] = await Promise.all([
    loadBatches(supabase),
    loadBatchStatements(supabase),
    supabase.from("products").select("id, brand, name, variant, on_hand, category_id"),
    supabase.rpc("batch_owed", { p_batch: id === "before" ? null : id }),
    supabase.from("settings").select("split_owner_parts, split_manager_parts, tax_rate_bp").maybeSingle(),
    id === "before" ? movesQuery.is("batch_id", null) : movesQuery.eq("batch_id", id),
    supabase.from("categories").select("id, name").order("sort_order").order("name"),
  ]);
  // The page still works without the statement (details, costs, expenses, stock fixes). Without the
  // settings the tax rate and the split would be guesses, so the statement isn't shown then either.
  const error = batchesError;
  const statementFailed = !!statementsError || !!splitRes.error;
  const moves = new Map<string, Move[]>();
  for (const m of (movesRes.data ?? []) as Move[]) moves.set(m.product_id, [...(moves.get(m.product_id) ?? []), m]);
  const splitRow = splitRes.data as { split_owner_parts: number; split_manager_parts: number; tax_rate_bp: number } | null;
  const split = { owner: splitRow?.split_owner_parts ?? 2, manager: splitRow?.split_manager_parts ?? 1 };
  const taxRateBp = Number(splitRow?.tax_rate_bp ?? 0);
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
  const productRows = (products.data ?? []) as {
    id: string;
    brand: string | null;
    name: string;
    variant: string | null;
    category_id: string | null;
  }[];
  const names = new Map(productRows.map((p) => [p.id, productLabel(p)]));
  const categoryOrder = ((categoriesRes.data ?? []) as { id: string; name: string }[]).map((c) => c.id);
  const categoryName = new Map(((categoriesRes.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const pickable = productRows
    .map((p) => ({ id: p.id, label: names.get(p.id)!, category: (p.category_id && categoryName.get(p.category_id)) || "No category", cat: p.category_id }))
    .sort(
      (a, b) =>
        (a.cat ? categoryOrder.indexOf(a.cat) : 1e9) - (b.cat ? categoryOrder.indexOf(b.cat) : 1e9) || a.label.localeCompare(b.label),
    )
    .map(({ id, label, category }) => ({ id, label, category }));

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
  const left = t.left;
  const share = t.received > 0 ? t.sold / t.received : 0;
  const days = spanDays(t.firstIn, t.sold >= t.received && t.lastSoldAt ? t.lastSoldAt : new Date());
  const perDay = t.sold / days;
  const sortedRows = [...rows].sort((a, b) => b.sold / b.received - a.sold / a.received || (names.get(a.product_id) ?? "").localeCompare(names.get(b.product_id) ?? ""));
  const title = batchTitle(batch);
  const returnTo = `/restock/batches/${id}`;
  const st = batchStatement(statements.get(batch.id ?? ""), batch, expenses, taxRateBp);
  const buyers = new Set(owedSales.map((s) => (s.customer_name ?? "").trim().toLowerCase())).size;

  return (
    <>
      <Topbar title={title} backHref="/restock?view=batches" backLabel="Back to batches" />
      <Main>
        <div className="stack stack-6 narrow">
          {sp.made === "1" && (
            <div className="notice notice--success" role="status">
              <Icon name="check" />
              <div>
                <p className="notice__title">{title} made from your earlier stock.</p>
                <p>Add its shipping, tax, MOOE and expenses in the P&amp;L below.</p>
              </div>
            </div>
          )}
          {(sp.added === "1" || sp.fixed === "edited" || sp.fixed === "removed") && (
            <div className="notice notice--success" role="status">
              <Icon name="check" />
              <div>
                <p className="notice__title">
                  {sp.added === "1" ? "Added to the batch." : sp.fixed === "edited" ? "Stock change fixed." : "Stock change removed."}
                </p>
                <p>The shelf count and this batch&apos;s numbers are updated.</p>
              </div>
            </div>
          )}
          {sp.fixed === "error" && (
            <div className="notice notice--danger" role="alert">
              <Icon name="alert" />
              <div>
                <p className="notice__title">Couldn&apos;t change that. Try again.</p>
              </div>
            </div>
          )}
          {sp.received === "1" && (
            <div className="notice notice--success" role="status">
              <Icon name="check" />
              <div>
                <p className="notice__title">
                  {title} received: {t.received} pcs on the shelf.
                </p>
                <p>
                  Its sales show here as the pieces sell.
                  {batch.paid_from_funds && (
                    <>
                      {" "}
                      It was paid from the company funds: <Link href="/sales/pnl#next-restock">decide what to keep for the next restock</Link>.
                    </>
                  )}
                </p>
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
          {sp.details === "saved" && <p className="t-sm notice-inline">Batch details saved.</p>}
          {batch.id !== null && batch.received_on && (
            <BatchDetailsForm
              batch={{ id: batch.id, supplier: batch.supplier, received_on: batch.received_on, note: batch.note }}
              today={manilaToday()}
              earliest={addDays(manilaToday(), -400)}
            />
          )}

          <KpiGrid aria-label="Batch sales">
            <Kpi
              variant="hero"
              wide
              label="Sold"
              value={<span className="num">{Math.round(share * 100)}%</span>}
              meta={`${t.sold} of ${t.received} pcs · ${left} left`}
            />
            <Kpi label="Net sales" value={<Money cents={t.sales} />} meta="after discounts" />
            <Kpi
              label="Still owed"
              variant={t.owed > 0 ? "alert" : undefined}
              value={<Money cents={t.owed} />}
              meta={t.owed > 0 ? `${buyers} buyer${buyers === 1 ? "" : "s"} · see below` : "All paid"}
            />
            <Kpi
              label="Gross profit"
              value={statementFailed ? "–" : <Money cents={st.grossProfit} />}
              meta={
                statementFailed
                  ? undefined
                  : st.uncosted > 0
                    ? "Some pieces have no cost"
                    : st.net > 0
                      ? `${((st.grossProfit / st.net) * 100).toFixed(1)}% margin · after restocking fees`
                      : undefined
              }
            />
            {batch.id !== null && !statementFailed && (
              <Kpi
                label="Net profit so far"
                variant={st.netProfit < 0 ? "alert" : undefined}
                value={<Money cents={st.netProfit} />}
                meta="on the pieces sold · see P&L"
                href="#pnl"
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

          {batch.id === null && <MakeBatchForm />}
          {batch.id !== null && (
            <BatchPnlCard
              batch={{ ...batch, id: batch.id }}
              st={st}
              failed={statementFailed}
              taxRateBp={taxRateBp}
              expenses={expenses.filter((e) => e.batch_id === batch.id)}
              split={split}
              isOwner={can(profile, "editSettings")}
              today={manilaToday()}
              flash={{ expense: sp.expense, split: sp.split, costs: sp.costs }}
            />
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
                        {piecesLeft(r) === 0 && <span className="chip chip--ok">{r.sold >= r.received ? "Sold out" : "None left"}</span>}
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
                  {(moves.get(r.product_id) ?? []).length > 0 && (
                    <ul className="batch-moves t-sm" role="list" aria-label={`Stock changes for ${names.get(r.product_id) ?? "this product"}`}>
                      {(moves.get(r.product_id) ?? []).map((m) => (
                        <li key={m.id} className="batch-move">
                          <span className="batch-move__text muted">{moveLine(m)}</span>
                          <StockFix change={m} productId={r.product_id} returnTo={returnTo} />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
            {batch.id !== null && <AddToBatchForm batchId={batch.id} products={pickable} />}
          </section>
          <p className="t-sm muted">
            Sales are matched first in, first out: a product&apos;s older pieces sell before this batch&apos;s. Counts and
            losses recorded for this batch change what&apos;s left. Tap Fix to correct pieces or cost entered by mistake.
          </p>
        </div>
      </Main>
    </>
  );
}
