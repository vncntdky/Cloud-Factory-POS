// Restock: what to order and when, from how fast each product sells (Reorder), and how each
// delivery batch has sold (Batches, ?view=batches). Owners and managers.
import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { Kpi, KpiGrid } from "@/components/Kpi";
import { Main } from "@/components/Main";
import { Money } from "@/components/Money";
import { NotAllowed } from "@/components/NotAllowed";
import { Topbar } from "@/components/Topbar";
import { CopyOrder } from "@/components/restock/CopyOrder";
import { PlanForm } from "@/components/restock/PlanForm";
import { ExpenseForm } from "@/components/restock/PnlForms";
import { requireActiveStaff, type ServerSupabase } from "@/lib/auth";
import { friendlyError } from "@/lib/db-errors";
import { productLabel } from "@/lib/format";
import { can } from "@/lib/permissions";
import { photoThumb } from "@/lib/photos";
import { splitProfit } from "@/lib/pnl";
import { PACE_DAYS, daysLeftLabel, paceLabel, type PlanStatus } from "@/lib/restock";
import { addDays, formatManilaDate, manilaToday } from "@/lib/time";
import { applyLeadDays, applyReorderPoints } from "./actions";
import {
  batchStatement,
  batchTitle,
  loadBatchStatements,
  loadBatches,
  loadReorderPlan,
  totals,
  type RestockProduct,
} from "./data";

export const dynamic = "force-dynamic";

type SP = { view?: string; plan?: string; alerts?: string; expense?: string; order?: string };

const SECTIONS: { status: PlanStatus; title: string }[] = [
  { status: "order", title: "Order now" },
  { status: "soon", title: "Order within a week" },
  { status: "ok", title: "Enough stock" },
  { status: "idle", title: `No sales in ${PACE_DAYS} days` },
];

export default async function RestockPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { supabase, profile } = await requireActiveStaff();
  if (!can(profile, "editStock")) return <NotAllowed title="Restock" what="Restocking" />;
  const sp = await searchParams;
  const view = sp.view === "batches" ? "batches" : "reorder";

  const alerts = sp.alerts === undefined ? null : sp.alerts === "error" ? -1 : Number(sp.alerts) || 0;
  const planError = sp.plan === "error";
  const notice =
    sp.plan === "saved"
      ? "Reorder plan saved."
      : alerts === null || alerts < 0
        ? null
        : alerts === 0
          ? "Low-stock alerts already match the reorder points."
          : `Low-stock alerts updated for ${alerts} product${alerts === 1 ? "" : "s"}.`;

  return (
    <>
      <Topbar
        title="Restock"
        actions={
          <Link className="btn btn--money btn--sm" href="/restock/order">
            <Icon name="plus" />
            Order stock
          </Link>
        }
      />
      <Main>
        <div className="stack stack-6">
          {notice && (
            <div className="notice notice--success" role="status">
              <Icon name="check" />
              <div>
                <p className="notice__title">{notice}</p>
              </div>
            </div>
          )}
          {planError && (
            <div className="notice notice--danger" role="alert">
              <Icon name="alert" />
              <div>
                <p className="notice__title">Couldn&apos;t change the delivery time. Try again.</p>
              </div>
            </div>
          )}
          {alerts === -1 && (
            <div className="notice notice--danger" role="alert">
              <Icon name="alert" />
              <div>
                <p className="notice__title">Couldn&apos;t update the low-stock alerts. Try again.</p>
              </div>
            </div>
          )}
          <nav className="segmented" aria-label="Restock">
            <Link className="segmented__option" href="/restock" aria-current={view === "reorder" ? "page" : undefined}>
              Reorder
            </Link>
            <Link
              className="segmented__option"
              href="/restock?view=batches"
              aria-current={view === "batches" ? "page" : undefined}
            >
              Batches
            </Link>
            <Link className="segmented__option" href="/restock/expenses">
              Expenses
            </Link>
          </nav>
          {view === "reorder" ? (
            <ReorderView supabase={supabase} />
          ) : (
            <BatchesView supabase={supabase} expense={sp.expense} removed={sp.order === "removed"} />
          )}
        </div>
      </Main>
    </>
  );
}

function Thumb({ path }: { path: string | null }) {
  const src = photoThumb(path, 128);
  return (
    <span className="list-row__lead thumb" aria-hidden="true">
      {src ? <img src={src} alt="" loading="lazy" decoding="async" /> : <Icon name="image" />}
    </span>
  );
}

function PlanChip({ p }: { p: RestockProduct }) {
  if (p.plan.status === "order")
    return (
      <span className="chip chip--reorder">
        <Icon name="alert" />
        {p.on_hand <= 0 ? "Out" : "Order now"}
      </span>
    );
  if (p.plan.status === "soon") return <span className="chip chip--low">Soon</span>;
  return null;
}

function ProductRow({ p, thumbs }: { p: RestockProduct; thumbs: boolean }) {
  const { plan } = p;
  const meta: ReactNode[] = [];
  if (plan.status === "idle") {
    meta.push(p.lastSoldAt ? `Last sold ${formatManilaDate(p.lastSoldAt)}` : "No sales yet", `alert at ${p.reorder_at}`);
  } else {
    meta.push(paceLabel(plan.perDay));
    if (p.on_hand > 0) meta.push(`${daysLeftLabel(plan.daysLeft)} left`);
    meta.push(`reorder at ${plan.reorderPoint}`);
  }
  if (plan.onOrder > 0) {
    meta.push(`${plan.onOrder} on the way`);
  }
  if (p.reserved > 0) {
    meta.push(`${p.reserved} reserved`);
  }
  return (
    <li>
      <Link className="list-row" href={`/inventory/${p.id}`}>
        {thumbs && <Thumb path={p.photo_path} />}
        <span className="list-row__main">
          <span className="list-row__title">
            <span>{productLabel(p)}</span>
            <PlanChip p={p} />
          </span>
          <span className="list-row__meta">{meta.join(" · ")}</span>
        </span>
        <span className="list-row__trail stock-count">
          <span className={`num-lg${p.on_hand <= 0 ? " num--danger" : ""}`}>{p.on_hand}</span>
          <span className="t-caption muted">{plan.suggest > 0 ? `order ${plan.suggest}` : "pcs"}</span>
        </span>
      </Link>
    </li>
  );
}

async function ReorderView({ supabase }: { supabase: ServerSupabase }) {
  const [{ products, plan, onTheWay, lead, error }, shop] = await Promise.all([
    loadReorderPlan(supabase),
    supabase.from("settings").select("business_name").maybeSingle(),
  ]);
  if (error) {
    return (
      <div className="notice notice--danger" role="alert">
        <Icon name="alert" />
        <div>
          <p className="notice__title">Couldn&apos;t load the reorder plan.</p>
          <p>{friendlyError(error)}</p>
        </div>
      </div>
    );
  }
  if (products.length === 0) {
    return <EmptyState title="No products yet." text="Add products in Inventory; the reorder plan starts once they sell." />;
  }

  const toOrder = products.filter((p) => p.plan.suggest > 0);
  const orderNow = products.filter((p) => p.plan.status === "order").length;
  const soon = products.filter((p) => p.plan.status === "soon").length;
  const pieces = toOrder.reduce((n, p) => n + p.plan.suggest, 0);
  const costKnown = toOrder.every((p) => p.cost_cents !== null);
  const orderCost = toOrder.reduce((n, p) => n + p.plan.suggest * (p.cost_cents ?? 0), 0);
  const changes = products.filter((p) => p.plan.reorderPoint !== null && p.plan.reorderPoint !== p.reorder_at).length;
  const shortest = Math.min(...products.filter((p) => p.plan.status !== "idle").map((p) => p.plan.basedOnDays), Infinity);
  const thumbs = products.some((p) => p.photo_path);
  const shopName = (shop.data as { business_name?: string } | null)?.business_name ?? "";
  const orderText = [
    `Order${shopName ? ` for ${shopName}` : ""} (${formatManilaDate(new Date())})`,
    ...toOrder.map((p) => `• ${productLabel(p)} × ${p.plan.suggest}`),
    `Total: ${pieces} pcs`,
  ].join("\n");

  return (
    <>
      <KpiGrid aria-label="Reorder">
        <Kpi
          variant={orderNow > 0 ? "alert" : undefined}
          label="Order now"
          value={<span className="num">{orderNow}</span>}
          meta={orderNow === 1 ? "product" : "products"}
        />
        <Kpi label="Within a week" value={<span className="num">{soon}</span>} meta={soon === 1 ? "product" : "products"} />
        {onTheWay.length > 0 && (
          <Kpi
            label="On the way"
            value={<span className="num">{onTheWay.reduce((n, b) => n + b.pieces, 0)} pcs</span>}
            meta={`${onTheWay.length} order${onTheWay.length === 1 ? "" : "s"} · counted as in stock`}
            href="#coming-t"
          />
        )}
        <Kpi
          wide
          label="Suggested order"
          value={<span className="num">{pieces} pcs</span>}
          meta={
            pieces === 0 ? (
              "Nothing to order yet"
            ) : costKnown ? (
              <>
                about <Money cents={orderCost} /> at cost
              </>
            ) : (
              `${toOrder.length} products`
            )
          }
        />
      </KpiGrid>

      <section className="card stack" aria-labelledby="plan-t">
        <div className="card__head">
          <h2 className="card__title" id="plan-t">
            How it&apos;s worked out
          </h2>
        </div>
        <p className="t-sm">
          Each product&apos;s pace is what it sold in the last {PACE_DAYS} days. Its <strong>reorder point</strong> is{" "}
          {plan.lead + plan.buffer} days of sales: {plan.lead} for an order to arrive and {plan.buffer} spare. When its stock
          (on the shelf plus already on the way) gets there, order enough for {plan.lead + plan.buffer + plan.cover} days.
        </p>
        {lead.gaps.length > 0 ? (
          <div className="stack stack-2">
            <p className="t-sm">
              <strong>Order to arrival:</strong>{" "}
              {lead.gaps.map((g) => `Batch ${g.batchNo} took ${g.days} day${g.days === 1 ? "" : "s"}`).join(", ")}
              {lead.gaps.length > 1 && ` (${lead.average} on average)`}.
              {lead.average !== null && lead.average !== plan.lead && ` The plan uses ${plan.lead}.`}
            </p>
            {lead.average !== null && lead.average !== plan.lead && lead.average <= 90 && (
              <form action={applyLeadDays}>
                <input type="hidden" name="lead" value={lead.average} />
                <button type="submit" className="btn btn--secondary btn--sm">
                  Use {lead.average} day{lead.average === 1 ? "" : "s"} for delivery
                </button>
              </form>
            )}
          </div>
        ) : (
          <p className="t-sm muted">
            Order stock with Order stock and tap Arrived when it comes: the days in between show here, so the delivery time
            matches your supplier.
          </p>
        )}
        {shortest < 7 && (
          <p className="t-sm muted">
            Some products have under a week of sales, so their numbers are rough and will settle as more sales come in.
          </p>
        )}
        <PlanForm plan={plan} />
      </section>

      {onTheWay.length > 0 && (
        <section className="stack stack-2" aria-labelledby="coming-t">
          <div className="section-head">
            <h2 className="eyebrow" id="coming-t">
              On the way
            </h2>
            <span className="section-head__count num">{onTheWay.length}</span>
          </div>
          <ul className="list" role="list">
            {onTheWay.map((b) => {
              const since = b.ordered_on ? daysSince(b.ordered_on, manilaToday()) : null;
              return (
                <li key={b.id}>
                  <Link className="list-row" href={`/restock/batches/${b.id}`}>
                    <span className="list-row__main">
                      <span className="list-row__title">
                        <span>
                          Batch {b.batch_no}
                          {b.supplier && ` · ${b.supplier}`}
                        </span>
                        <span className="chip chip--info">On the way</span>
                      </span>
                      <span className="list-row__meta">
                        {b.ordered_on && `Ordered ${formatManilaDate(b.ordered_on)}`}
                        {since !== null && ` · ${since === 0 ? "today" : `${since} day${since === 1 ? "" : "s"} ago`}`}
                        {since !== null && since > plan.lead && ` · later than the ${plan.lead}-day delivery time`}
                      </span>
                    </span>
                    <span className="list-row__trail stock-count">
                      <span className="num-lg">{b.pieces}</span>
                      <span className="t-caption muted">pcs</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="t-sm muted">Open it and tap Arrived when it comes in: its pieces go on the shelf.</p>
        </section>
      )}

      {(toOrder.length > 0 || changes > 0) && (
        <div className="stack stack-2">
          <div className="btn-row">
            {toOrder.length > 0 && (
              <>
                <Link className="btn btn--primary" href="/restock/order?suggested=1">
                  <Icon name="box" />
                  Order this
                </Link>
                <CopyOrder text={orderText} />
              </>
            )}
            {changes > 0 && (
              <form action={applyReorderPoints}>
                <button type="submit" className="btn btn--secondary">
                  <Icon name="bell" />
                  Update low-stock alerts ({changes})
                </button>
              </form>
            )}
          </div>
          {changes > 0 && (
            <p className="t-sm muted">
              Sets each selling product&apos;s low-stock alert (the Inventory badge) to its reorder point.
            </p>
          )}
        </div>
      )}

      {SECTIONS.map((s) => {
        const items = products.filter((p) => p.plan.status === s.status);
        if (items.length === 0) return null;
        if (s.status !== "idle") items.sort((a, b) => (a.plan.daysLeft ?? 0) - (b.plan.daysLeft ?? 0));
        return (
          <section key={s.status} className="stack stack-2" aria-labelledby={`sec-${s.status}`}>
            <div className="section-head">
              <h2 className="eyebrow" id={`sec-${s.status}`}>
                {s.title}
              </h2>
              <span className="section-head__count num">{items.length}</span>
            </div>
            <ul className="list" role="list">
              {items.map((p) => (
                <ProductRow key={p.id} p={p} thumbs={thumbs} />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

/** A profit figure: red when it's a loss. */
function Profit({ cents }: { cents: number }) {
  return <span className={cents < 0 ? "text-alert" : undefined}>{<Money cents={cents} />}</span>;
}

async function BatchesView({ supabase, expense, removed }: { supabase: ServerSupabase; expense?: string; removed?: boolean }) {
  const [{ list, expenses, error }, { statements, error: statementsError }, settingsRes] = await Promise.all([
    loadBatches(supabase),
    loadBatchStatements(supabase),
    supabase.from("settings").select("split_owner_parts, split_manager_parts, tax_rate_bp").maybeSingle(),
  ]);
  if (error) {
    return (
      <div className="notice notice--danger" role="alert">
        <Icon name="alert" />
        <div>
          <p className="notice__title">Couldn&apos;t load batches.</p>
          <p>{friendlyError(error)}</p>
        </div>
      </div>
    );
  }
  const hasBatches = list.some((b) => b.batch.id !== null);
  const all = totals(list.flatMap((b) => b.rows));
  const today = manilaToday();
  // Each batch's net profit so far and the owner / manager shares of it: the same figures as Sales →
  // Finance → Batches. Left out, not guessed, if the statements or the settings didn't load.
  const settings = settingsRes.data as { split_owner_parts: number; split_manager_parts: number; tax_rate_bp: number } | null;
  const profitShown = !statementsError && !settingsRes.error && settings !== null;
  const split = { owner: settings?.split_owner_parts ?? 2, manager: settings?.split_manager_parts ?? 1 };
  const taxRateBp = Number(settings?.tax_rate_bp ?? 0);
  // Stock from before batches was paid from the till: nothing is owed on it.
  const owedSuppliers = list.reduce((n, b) => n + (b.batch.id === null ? 0 : Math.max(0, b.money.owed)), 0);
  return (
    <>
      {removed && (
        <div className="notice notice--success" role="status">
          <Icon name="check" />
          <div>
            <p className="notice__title">Order removed.</p>
          </div>
        </div>
      )}
      {expense === "added" && (
        <div className="notice notice--success" role="status">
          <Icon name="check" />
          <div>
            <p className="notice__title">Expense saved.</p>
            <p>
              See it under <Link href="/restock/expenses">Expenses</Link>, and in the batch&apos;s P&amp;L.
            </p>
          </div>
        </div>
      )}
      <section className="card stack" aria-labelledby="batch-exp-t">
        <div className="card__head">
          <h2 className="card__title" id="batch-exp-t">
            Expenses
          </h2>
          <Link className="text-btn" href="/restock/expenses">
            See all
          </Link>
        </div>
        <p className="t-sm muted">
          Salaries, rent, utilities, supplies: charge them to a batch, or to the whole shop. A delivery&apos;s shipping, tax
          and MOOE go on the batch&apos;s restock costs.
        </p>
        <ExpenseForm
          batches={list
            .filter((b) => b.batch.id !== null)
            .map((b) => ({
              id: b.batch.id!,
              label: `${batchTitle(b.batch)}${b.batch.supplier ? ` · ${b.batch.supplier}` : ""}`,
            }))}
          returnTo="/restock?view=batches"
          today={today}
          earliest={addDays(today, -400)}
        />
      </section>
      {list.length > 0 && (
        <KpiGrid aria-label="All batches">
          <Kpi wide label="Sales" value={<Money cents={all.sales} />} meta={`${all.sold} pcs sold`} />
          <Kpi
            wide
            label="Still owed"
            variant={all.owed > 0 ? "alert" : undefined}
            value={<Money cents={all.owed} />}
            meta={all.owed > 0 ? "Customers who haven't paid, by batch below" : "Every customer has paid"}
          />
          {owedSuppliers > 0 && (
            <Kpi
              wide
              label="To pay suppliers"
              variant="alert"
              value={<Money cents={owedSuppliers} />}
              meta="Orders and deliveries not paid yet, by batch below"
            />
          )}
        </KpiGrid>
      )}
      {!hasBatches && (
        <EmptyState
          compact
          title="No batches yet."
          text="When you order from a supplier, tap Order stock and enter the pieces for each product; tap Arrived on it when it comes. Its sales show here."
          action={
            <Link className="btn btn--money" href="/restock/order">
              <Icon name="plus" />
              Order stock
            </Link>
          }
        />
      )}
      {list.length > 0 && (
        <section className="stack stack-2" aria-labelledby="batches-t">
          <div className="section-head">
            <h2 className="eyebrow" id="batches-t">
              Batches
            </h2>
            <span className="section-head__count num">{list.filter((b) => b.batch.id !== null).length}</span>
          </div>
          <p className="t-sm muted">
            Sales are matched to batches first in, first out: the oldest pieces on the shelf sell first.
            {profitShown && " Owner and manager are their shares of each batch's net profit so far, before general expenses."}{" "}
            Stock already here? <Link href="/restock/receive">Receive batch</Link>.
          </p>
          {!profitShown && (
            <p className="field__error" role="alert">
              <Icon name="alert" />
              Couldn&apos;t load each batch&apos;s net profit. Reload to try again.
            </p>
          )}
          <ul className="list" role="list">
            {list.map(({ batch, rows, lines, money }) => {
              if (batch.id !== null && batch.received_on === null) {
                const pcs = lines.reduce((n, l) => n + l.qty, 0);
                return (
                  <li key={batch.id}>
                    <Link className="list-row" href={`/restock/batches/${batch.id}`}>
                      <span className="list-row__main">
                        <span className="list-row__title">
                          <span>
                            {batchTitle(batch)}
                            {batch.supplier && ` · ${batch.supplier}`}
                          </span>
                          <span className="chip chip--info">On the way</span>
                        </span>
                        <span className="list-row__meta list-row__meta--wrap">
                          {batch.ordered_on && `Ordered ${formatManilaDate(batch.ordered_on)} · `}
                          {pcs} pcs · <Money cents={money.cost} />
                          {" · "}
                          {money.uncosted > 0 ? (
                            "cost not entered for every line"
                          ) : money.owed > 0 ? (
                            <span className="text-alert">
                              <Money cents={money.owed} /> to pay
                            </span>
                          ) : (
                            "paid"
                          )}
                        </span>
                      </span>
                      <span className="list-row__trail stock-count">
                        <span className="num-lg">{pcs}</span>
                        <span className="t-caption muted">coming</span>
                      </span>
                    </Link>
                  </li>
                );
              }
              const t = totals(rows);
              const share = t.received > 0 ? t.sold / t.received : 0;
              const when = batch.received_on ? formatManilaDate(batch.received_on) : `from ${formatManilaDate(t.firstIn)}`;
              const st = profitShown ? batchStatement(statements.get(batch.id ?? ""), batch, expenses, taxRateBp) : null;
              const shares = st ? splitProfit(st.netProfit, split.owner, split.manager) : null;
              return (
                <li key={batch.id ?? "before"}>
                  <Link className="list-row" href={`/restock/batches/${batch.id ?? "before"}`}>
                    <span className="list-row__main">
                      <span className="list-row__title">
                        <span>
                          {batchTitle(batch)}
                          {batch.supplier && ` · ${batch.supplier}`}
                        </span>
                        {t.received > 0 && t.left === 0 && (
                          <span className="chip chip--ok">{t.sold >= t.received ? "Sold out" : "None left"}</span>
                        )}
                      </span>
                      <span className="list-row__meta list-row__meta--wrap">
                        {when} · {t.sold} of {t.received} pcs sold · <Money cents={t.sales} />
                        {t.owed > 0 && (
                          <>
                            {" · "}
                            <span className="text-alert">
                              <Money cents={t.owed} /> owed
                            </span>
                          </>
                        )}
                        {batch.id !== null && money.owed > 0 && (
                          <>
                            {" · "}
                            <span className="text-alert">
                              <Money cents={money.owed} /> to pay the supplier
                            </span>
                          </>
                        )}
                      </span>
                      {st && shares && (
                        <span className="list-row__meta list-row__meta--wrap">
                          Net profit so far <Profit cents={st.netProfit} /> · owner <Profit cents={shares.owner} /> · manager{" "}
                          <Profit cents={shares.manager} />
                        </span>
                      )}
                      <span className="meter" aria-hidden="true">
                        <span style={{ width: `${Math.min(100, share * 100)}%` }} />
                      </span>
                    </span>
                    <span className="list-row__trail stock-count">
                      <span className="num-lg">{Math.round(share * 100)}%</span>
                      <span className="t-caption muted">sold</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}

/** Whole days from one Manila date to another. */
function daysSince(from: string, to: string) {
  return Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000));
}
