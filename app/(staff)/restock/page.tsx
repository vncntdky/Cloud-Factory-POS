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
import { requireActiveStaff, type ServerSupabase } from "@/lib/auth";
import { friendlyError } from "@/lib/db-errors";
import { productLabel } from "@/lib/format";
import { can } from "@/lib/permissions";
import { photoUrl } from "@/lib/photos";
import { PACE_DAYS, daysLeftLabel, paceLabel, type PlanStatus } from "@/lib/restock";
import { formatManilaDate } from "@/lib/time";
import { applyReorderPoints } from "./actions";
import { batchTitle, loadBatches, loadReorderPlan, totals, type RestockProduct } from "./data";

export const dynamic = "force-dynamic";

type SP = { view?: string; plan?: string; alerts?: string };

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
          <Link className="btn btn--money btn--sm" href="/restock/receive">
            <Icon name="plus" />
            Receive batch
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
          </nav>
          {view === "reorder" ? <ReorderView supabase={supabase} /> : <BatchesView supabase={supabase} />}
        </div>
      </Main>
    </>
  );
}

function Thumb({ path }: { path: string | null }) {
  const src = photoUrl(path);
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
  const [{ products, plan, error }, shop] = await Promise.all([
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
          {plan.lead + plan.buffer} days of sales: {plan.lead} for the batch to arrive and {plan.buffer} spare. When the shelf
          gets there, order enough for {plan.lead + plan.buffer + plan.cover} days.
        </p>
        {shortest < 7 && (
          <p className="t-sm muted">
            Some products have under a week of sales, so their numbers are rough and will settle as more sales come in.
          </p>
        )}
        <PlanForm plan={plan} />
      </section>

      {(toOrder.length > 0 || changes > 0) && (
        <div className="stack stack-2">
          <div className="btn-row">
            {toOrder.length > 0 && (
              <>
                <Link className="btn btn--primary" href="/restock/receive?suggested=1">
                  <Icon name="box" />
                  Receive this order
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

async function BatchesView({ supabase }: { supabase: ServerSupabase }) {
  const { list, error } = await loadBatches(supabase);
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
  return (
    <>
      {list.length > 0 && (
        <KpiGrid aria-label="All batches">
          <Kpi wide label="Sales" value={<Money cents={all.sales} />} meta={`${all.sold} pcs sold`} />
          <Kpi
            wide
            label="Still owed"
            variant={all.owed > 0 ? "alert" : undefined}
            value={<Money cents={all.owed} />}
            meta={all.owed > 0 ? "Not paid yet, by batch below" : "Everything is paid"}
          />
        </KpiGrid>
      )}
      {!hasBatches && (
        <EmptyState
          compact
          title="No batches yet."
          text="When a supplier order arrives, tap Receive batch and enter the pieces for each product. Its sales show here."
          action={
            <Link className="btn btn--money" href="/restock/receive">
              <Icon name="plus" />
              Receive batch
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
          </p>
          <ul className="list" role="list">
            {list.map(({ batch, rows }) => {
              const t = totals(rows);
              const share = t.received > 0 ? t.sold / t.received : 0;
              const when = batch.received_on ? formatManilaDate(batch.received_on) : `from ${formatManilaDate(t.firstIn)}`;
              return (
                <li key={batch.id ?? "before"}>
                  <Link className="list-row" href={`/restock/batches/${batch.id ?? "before"}`}>
                    <span className="list-row__main">
                      <span className="list-row__title">
                        <span>
                          {batchTitle(batch)}
                          {batch.supplier && ` · ${batch.supplier}`}
                        </span>
                        {t.received > 0 && t.sold >= t.received && <span className="chip chip--ok">Sold out</span>}
                      </span>
                      <span className="list-row__meta">
                        {when} · {t.sold} of {t.received} pcs sold · <Money cents={t.sales} />
                        {t.owed > 0 && (
                          <>
                            {" · "}
                            <span className="text-alert">
                              <Money cents={t.owed} /> owed
                            </span>
                          </>
                        )}
                      </span>
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
