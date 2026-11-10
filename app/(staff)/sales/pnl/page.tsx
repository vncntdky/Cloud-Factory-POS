// Sales → Finance (owners and managers): the shop's statements, worked out live from sales, stock,
// batches, expenses, owner capital and distributions (finance_report, supabase/migrations/…_finance.sql).
//   Overview       safe to distribute, key numbers, the cash bridge, next restock, distributions, who owes
//   Profit & loss  accrual: counted when sold (cost = landed cost of the pieces sold)
//   Cash flow      cash: counted when money moves
//   Balance        what the business holds = what it owes + the owners' share; owner capital
//   Batches        each batch's P&L side by side, expenses
import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { Kpi, KpiGrid } from "@/components/Kpi";
import { Main } from "@/components/Main";
import { Money } from "@/components/Money";
import { NotAllowed } from "@/components/NotAllowed";
import { Topbar } from "@/components/Topbar";
import { CapitalForm } from "@/components/finance/CapitalForm";
import { CashBridge } from "@/components/finance/CashBridge";
import { PeriodSelect } from "@/components/finance/PeriodSelect";
import { TaxRateForm } from "@/components/finance/TaxRateForm";
import { ExpenseForm, SplitForm } from "@/components/restock/PnlForms";
import { ReleaseForm } from "@/components/restock/ReleaseForm";
import { SetAsideForm } from "@/components/restock/SetAsideForm";
import { deleteCapital, undoRelease } from "@/app/(staff)/restock/actions";
import { requireActiveStaff, type ServerSupabase } from "@/lib/auth";
import { friendlyError } from "@/lib/db-errors";
import {
  balance,
  cashFlow,
  formatDay,
  periodOptions,
  profitAndLoss,
  receivablesAging,
  type FinanceReport,
} from "@/lib/finance";
import { PAYMENT_METHOD_LABELS, type SaleMethod } from "@/lib/format";
import { can } from "@/lib/permissions";
import { EXPENSE_CATEGORIES, shareLabel, splitProfit } from "@/lib/pnl";
import { addDays, formatManilaDate, manilaToday } from "@/lib/time";
import { batchPnl, batchTitle, loadBatches, totals } from "../../restock/data";

export const dynamic = "force-dynamic";

const VIEWS = [
  { id: "overview", label: "Overview" },
  { id: "pl", label: "Profit & loss" },
  { id: "cash", label: "Cash flow" },
  { id: "balance", label: "Balance" },
  { id: "batches", label: "Batches" },
] as const;
type View = (typeof VIEWS)[number]["id"];

type SP = {
  view?: string;
  period?: string;
  split?: string;
  expense?: string;
  released?: string;
  kept?: string;
  capital?: string;
  tax?: string;
};

type Funds = {
  needs_decision: boolean;
  kept_cents: number;
  set_aside_cents: number;
  set_aside_used_cents: number;
  set_aside_at: string | null;
  set_aside_note: string | null;
  last_batch_no: number | null;
  last_batch_cents: number | null;
};

type Release = { id: string; amount_cents: number; owner_cents: number; manager_cents: number; note: string | null; released_on: string };

const pct = (x: number | null) => (x === null ? "–" : `${(x * 100).toFixed(1)}%`);
const CATEGORY = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.id, c.label])) as Record<string, string>;

function Amount({ cents }: { cents: number | null }) {
  if (cents === null) return <>–</>;
  return <span className={cents < 0 ? "text-alert" : undefined}>{<Money cents={cents} />}</span>;
}

/** One statement line. Costs and money out show in brackets. */
function Line({
  label,
  hint,
  cents,
  out,
  total,
  sub,
  extra,
}: {
  label: ReactNode;
  hint?: ReactNode;
  cents: number;
  out?: boolean;
  total?: boolean;
  sub?: boolean;
  extra?: ReactNode;
}) {
  const cls = total ? "cost-list__total" : sub ? "fin-sub" : undefined;
  const neg = out ? cents > 0 : cents < 0;
  return (
    <>
      <dt className={cls}>
        {label}
        {hint && <span className="fin-hint">{hint}</span>}
      </dt>
      <dd className={cls}>
        {neg ? (
          <span className={total ? "text-alert" : undefined}>
            (<Money cents={Math.abs(cents)} />)
          </span>
        ) : (
          <Money cents={Math.abs(cents)} />
        )}
        {extra && <span className="fin-pct"> {extra}</span>}
      </dd>
    </>
  );
}

function Basis({ children }: { children: ReactNode }) {
  return <span className="chip fin-basis">{children}</span>;
}

function Notice({ children, danger }: { children: ReactNode; danger?: boolean }) {
  return (
    <div className={`notice ${danger ? "notice--danger" : "notice--success"}`} role={danger ? "alert" : "status"}>
      <Icon name={danger ? "alert" : "check"} />
      <div>
        <p className="notice__title">{children}</p>
      </div>
    </div>
  );
}

async function loadReport(supabase: ServerSupabase, period: string | undefined, today: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(period ?? "");
  let from = "2020-01-01";
  let to = today;
  let value = "all";
  if (m && `${m[1]}-${m[2]}-01` <= today) {
    from = `${m[1]}-${m[2]}-01`;
    const next = Number(m[2]) === 12 ? `${Number(m[1]) + 1}-01-01` : `${m[1]}-${String(Number(m[2]) + 1).padStart(2, "0")}-01`;
    const last = addDays(next, -1);
    to = last > today ? today : last;
    value = `${m[1]}-${m[2]}`;
  }
  const { data, error } = await supabase.rpc("finance_report", { p_from: from, p_to: to });
  return { report: data as FinanceReport | null, error, value };
}

export default async function FinancePage({ searchParams }: { searchParams: Promise<SP> }) {
  const { supabase, profile } = await requireActiveStaff();
  if (!can(profile, "seeCosts")) return <NotAllowed title="Finance" what="Finance" />;
  const sp = await searchParams;
  const view: View = (VIEWS.find((v) => v.id === sp.view)?.id ?? "overview") as View;
  const today = manilaToday();
  const isOwner = can(profile, "editSettings");
  const href = (v: View) => {
    const q = new URLSearchParams();
    if (v !== "overview") q.set("view", v);
    if (sp.period && v !== "batches") q.set("period", sp.period);
    const s = q.toString();
    return `/sales/pnl${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <Topbar title="Finance" />
      <Main>
        <div className="stack stack-6 fin">
          <nav className="segmented" aria-label="Sales">
            <Link className="segmented__option" href="/sales">
              Daily sales
            </Link>
            <Link className="segmented__option" href="/sales/dashboard">
              Dashboard
            </Link>
            <Link className="segmented__option" href="/sales/pnl" aria-current="page">
              Finance
            </Link>
          </nav>
          <nav className="filter-row fin-views" aria-label="Finance">
            {VIEWS.map((v) => (
              <Link key={v.id} className="filter-chip" href={href(v.id)} aria-current={view === v.id ? "page" : undefined}>
                {v.label}
              </Link>
            ))}
          </nav>
          {view === "batches" ? (
            <BatchesView supabase={supabase} isOwner={isOwner} sp={sp} />
          ) : (
            <StatementsView supabase={supabase} view={view} sp={sp} today={today} isOwner={isOwner} />
          )}
        </div>
      </Main>
    </>
  );
}

async function StatementsView({
  supabase,
  view,
  sp,
  today,
  isOwner,
}: {
  supabase: ServerSupabase;
  view: Exclude<View, "batches">;
  sp: SP;
  today: string;
  isOwner: boolean;
}) {
  const [{ report, error, value }, fundsRes, releasesRes, splitRes, capitalRes, ownerBatchesRes] = await Promise.all([
    loadReport(supabase, sp.period, today),
    view === "overview" ? supabase.rpc("company_funds") : Promise.resolve({ data: null }),
    view === "overview"
      ? supabase
          .from("fund_releases")
          .select("id, amount_cents, owner_cents, manager_cents, note, released_on")
          .order("released_on", { ascending: false })
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase.from("settings").select("split_owner_parts, split_manager_parts").maybeSingle(),
    view === "balance"
      ? supabase.from("capital_contributions").select("id, amount_cents, note, put_in_on").order("put_in_on", { ascending: false })
      : Promise.resolve({ data: [] }),
    view === "balance"
      ? supabase.from("stock_batches").select("id, batch_no, received_on").eq("paid_from_funds", false).order("batch_no")
      : Promise.resolve({ data: [] }),
  ]);
  if (error || !report) {
    return <Notice danger>Couldn&apos;t load the finances. {friendlyError(error)}</Notice>;
  }
  const splitRow = splitRes.data as { split_owner_parts: number; split_manager_parts: number } | null;
  const split = { owner: splitRow?.split_owner_parts ?? 2, manager: splitRow?.split_manager_parts ?? 1 };
  const parts = split.owner + split.manager;
  const pl = profitAndLoss(report);
  const cf = cashFlow(report);
  const bs = balance(report);
  const now = report.now;
  const shares = splitProfit(Math.max(0, Number(now.safe_to_distribute)), split.owner, split.manager);
  const toLabel = formatDay(report.to);
  const bridge = [
    { label: "Opening cash", cents: cf.opening, kind: "total" as const },
    { label: "Owner capital", cents: cf.capitalCash + cf.capitalStock, kind: "in" as const },
    { label: "Customer receipts", cents: cf.receipts, kind: "in" as const },
    { label: "Stock bought", cents: cf.goods, kind: "out" as const },
    { label: "Restocking fees", cents: cf.fees, kind: "out" as const },
    { label: "Operating expenses", cents: cf.opex, kind: "out" as const },
    { label: "Taxes paid", cents: cf.taxPaid, kind: "out" as const },
    { label: "Owner draws", cents: cf.distributions, kind: "out" as const },
    { label: "Closing cash", cents: cf.closing, kind: "total" as const },
  ];

  return (
    <>
      <div className="fin-period">
        <PeriodSelect value={value} options={periodOptions(report.first_day, today)} />
        <span className="t-sm muted">
          {view === "balance" ? `As of ${toLabel}` : `${formatDay(report.from < (report.first_day ?? report.from) ? report.first_day ?? report.from : report.from)} – ${toLabel}`}
        </span>
      </div>

      {view === "overview" && (
        <>
          {sp.released === "1" && <Notice>Distribution recorded.</Notice>}
          {sp.released === "undone" && <Notice>Distribution undone: the money is back in the business.</Notice>}
          {sp.released === "error" && <Notice danger>Couldn&apos;t change that distribution. Try again.</Notice>}
          <KpiGrid aria-label="Key numbers">
            <Kpi
              variant="hero"
              wide
              label="Safe to distribute"
              value={<Money cents={Math.max(0, Number(now.safe_to_distribute))} />}
              meta={
                <>
                  today · owner <Money cents={shares.owner} /> · manager <Money cents={shares.manager} />
                </>
              }
              href="#distributions"
            />
            <Kpi label="Net sales" value={<Money cents={pl.net} />} meta="after discounts" />
            <Kpi label="Gross margin" value={pct(pl.grossMargin)} meta="after landed cost of goods sold" />
            <Kpi
              label="Net profit (est.)"
              variant={pl.netProfit < 0 ? "alert" : undefined}
              value={<Money cents={pl.netProfit} />}
              meta={pl.netMargin === null ? "no sales yet" : `${pct(pl.netMargin)} of net sales, after tax`}
              href={href2("pl", sp)}
            />
            <Kpi label="Closing cash" value={<Money cents={cf.closing} />} meta="drawer, e-wallets and bank" href={href2("cash", sp)} />
          </KpiGrid>

          <section className="card stack" aria-labelledby="bridge-t">
            <div className="card__head">
              <h2 className="card__title" id="bridge-t">
                Where the cash went
              </h2>
              <Basis>Cash</Basis>
            </div>
            <CashBridge
              steps={bridge}
              label={`Cash bridge: opening ${cf.opening / 100} pesos, closing ${cf.closing / 100} pesos`}
            />
            <p className="t-sm muted">
              Counted when money moves. Owner capital includes stock the owners paid for themselves (a batch not paid from the
              company funds).
            </p>
          </section>

          <div className="fin-grid">
            <section className="card stack" id="distributions" aria-labelledby="dist-t">
              <div className="card__head">
                <h2 className="card__title" id="dist-t">
                  Owner distributions
                </h2>
                <Basis>Today</Basis>
              </div>
              <dl className="cost-list">
                <Line label="Profit kept in the business" hint="profit earned, less distributions" cents={Number(now.retained)} />
                <Line label="Cash" cents={Number(now.cash)} sub />
                <Line label="Tax reserve" hint="estimated tax not yet paid" cents={Number(now.tax_reserve)} out sub />
                <Line label="Inventory reserve" hint="kept for the next restock" cents={Number(now.inventory_reserve)} out sub />
                <Line label="Spare cash" cents={Number(now.spare_cash)} total />
                <Line label="Safe to distribute" hint="the lower of profit kept and spare cash" cents={Math.max(0, Number(now.safe_to_distribute))} total />
              </dl>
              {isOwner ? (
                <ReleaseForm available={Math.max(0, Number(now.safe_to_distribute))} split={split} />
              ) : (
                <p className="t-sm muted">Only the owner records distributions.</p>
              )}
              <ReleasedList releases={(releasesRes.data ?? []) as Release[]} isOwner={isOwner} />
            </section>

            <div className="stack stack-6">
              <section className="card stack" aria-labelledby="restock-t">
                <div className="card__head">
                  <h2 className="card__title" id="restock-t">
                    Inventory reserve
                  </h2>
                  <Basis>Today</Basis>
                </div>
                {sp.kept === "1" && <p className="t-sm notice-inline">Saved: the business keeps that for the next restock.</p>}
                <ReserveCard funds={fundsRes.data as Funds | null} spare={Number(now.cash) - Number(now.tax_reserve)} />
              </section>

              <section className="card stack" aria-labelledby="ar-t">
                <div className="card__head">
                  <h2 className="card__title" id="ar-t">
                    Receivables by age
                  </h2>
                  <Basis>Today</Basis>
                </div>
                <dl className="cost-list">
                  {receivablesAging(report).map((b) => (
                    <Line
                      key={b.label}
                      label={b.label}
                      hint={
                        b.items.length > 0
                          ? b.items.map((x) => `${x.customer_name?.trim() || "No name"} ₱${(x.cents / 100).toLocaleString("en-PH")}`).join(" · ")
                          : undefined
                      }
                      cents={b.cents}
                    />
                  ))}
                </dl>
                <Link className="text-btn" href="/collectibles">
                  Collect in Collectibles
                </Link>
              </section>
            </div>
          </div>
        </>
      )}

      {view === "pl" && (
        <section className="card stack" id="pl" aria-labelledby="pl-t">
          <div className="card__head">
            <h2 className="card__title" id="pl-t">
              Profit &amp; loss
            </h2>
            <Basis>Accrual</Basis>
          </div>
          {sp.tax === "saved" && <p className="t-sm notice-inline">Tax rate saved.</p>}
          <dl className="cost-list">
            <Line label="Gross sales" hint={`${pl.sales} sale${pl.sales === 1 ? "" : "s"}`} cents={pl.gross} />
            <Line label="Discounts" cents={pl.discounts} out />
            <Line label="Net sales" cents={pl.net} total />
            <Line label="Cost of goods sold" hint="landed cost of the pieces sold: goods + restocking fees" cents={pl.cogs} out />
            <Line label="Gross profit" cents={pl.grossProfit} total extra={pct(pl.grossMargin)} />
            {Object.entries(pl.opexBy).map(([k, v]) => (
              <Line key={k} label={CATEGORY[k] ?? k} cents={v} out sub />
            ))}
            {pl.countDiffs !== 0 && (
              <Line label="Stock count differences" hint="counts and losses at landed cost" cents={pl.countDiffs} sub />
            )}
            <Line label="Operating profit" cents={pl.operating} total extra={pct(pl.operatingMargin)} />
            <Line label={`Percentage tax (${(pl.taxRate * 100).toFixed(pl.taxRate * 100 % 1 ? 2 : 0)}%, est.)`} cents={pl.tax} out />
            <Line label="Net profit" cents={pl.netProfit} total extra={pct(pl.netMargin)} />
          </dl>
          {pl.cogsUncosted > 0 && (
            <p className="t-sm muted">
              {pl.cogsUncosted} piece{pl.cogsUncosted === 1 ? "" : "s"} sold had no cost, so cost of goods sold is low.
            </p>
          )}
          <p className="t-sm muted">
            Counted when sold, paid or not. Cost is what the sold pieces cost, not what was bought. The tax line is an estimate
            on net sales; record the tax you pay as an expense under Taxes paid.
          </p>
          {isOwner && <TaxRateForm bp={Number(report.end.tax_rate_bp)} />}
        </section>
      )}

      {view === "cash" && (
        <section className="card stack" aria-labelledby="cf-t">
          <div className="card__head">
            <h2 className="card__title" id="cf-t">
              Cash flow
            </h2>
            <Basis>Cash</Basis>
          </div>
          <CashBridge steps={bridge} label={`Cash bridge: opening ${cf.opening / 100} pesos, closing ${cf.closing / 100} pesos`} />
          <dl className="cost-list">
            <Line label="Opening cash" cents={cf.opening} total />
            <Line label="Owner capital put in" cents={cf.capitalCash} />
            {cf.capitalStock !== 0 && <Line label="Stock paid by the owners" hint="also in Stock bought below" cents={cf.capitalStock} />}
            <Line label="Customer receipts" cents={cf.receipts} />
            {Object.entries(cf.receiptsBy).map(([m, v]) => (
              <Line key={m} label={PAYMENT_METHOD_LABELS[m as SaleMethod] ?? m} cents={v} sub />
            ))}
            <Line label="Stock bought" cents={cf.goods} out />
            <Line label="Restocking fees" hint="shipping, tax, MOOE, other" cents={cf.fees} out />
            <Line label="Operating expenses" cents={cf.opex} out />
            <Line label="Taxes paid" cents={cf.taxPaid} out />
            <Line label="Owner distributions" cents={cf.distributions} out />
            <Line label="Closing cash" cents={cf.closing} total />
          </dl>
          <p className="t-sm muted">Counted when money moves. Sales not paid yet come in here when they&apos;re collected.</p>
        </section>
      )}

      {view === "balance" && (
        <>
          {sp.capital === "added" && <Notice>Capital recorded.</Notice>}
          {sp.capital === "removed" && <Notice>Capital entry removed.</Notice>}
          {sp.capital === "error" && <Notice danger>Couldn&apos;t change that capital entry. Try again.</Notice>}
          <section className="card stack" aria-labelledby="bs-t">
            <div className="card__head">
              <h2 className="card__title" id="bs-t">
                What the business holds
              </h2>
              <Basis>As of {toLabel}</Basis>
            </div>
            <dl className="cost-list">
              <Line label="Cash" hint="drawer, e-wallets and bank" cents={bs.cash} />
              <Line label="Receivables" hint="sales not paid yet" cents={bs.receivables} />
              <Line label="Inventory at cost" hint="pieces on the shelf at landed cost" cents={bs.inventory} />
              <Line label="Total assets" cents={bs.assets} total />
              <Line label="Tax payable (est.)" cents={bs.taxPayable} sub />
              <Line label="Owner capital" cents={bs.capital} sub />
              <Line label="Profit earned" cents={bs.profitEarned} sub />
              <Line label="Owner distributions" cents={bs.distributions} out sub />
              <Line label="Owed + owners' share" cents={bs.taxPayable + bs.ownersShare} total />
            </dl>
            <p className="t-sm muted">
              {bs.capital > 0
                ? `The owners put in ₱${(bs.capital / 100).toLocaleString("en-PH")}; the business now holds ₱${(bs.assets / 100).toLocaleString("en-PH")}.`
                : "Both totals always match: everything the business holds is either owed (tax) or belongs to the owners."}
            </p>
          </section>

          <section className="card stack" id="capital" aria-labelledby="cap-t">
            <div className="card__head">
              <h2 className="card__title" id="cap-t">
                Owner capital
              </h2>
              <span className="t-caption muted">
                <Money cents={bs.capital} />
              </span>
            </div>
            <ul className="list list--plain" role="list">
              {((ownerBatchesRes.data ?? []) as { id: string; batch_no: number; received_on: string }[]).map((b) => (
                <li key={b.id} className="list-row list-row--compact">
                  <span className="list-row__main">
                    <span className="list-row__title">
                      <span>Batch {b.batch_no} stock, paid by the owners</span>
                    </span>
                    <span className="list-row__meta">
                      {formatManilaDate(b.received_on)} · switch it on its{" "}
                      <Link href={`/restock/batches/${b.id}#pnl`}>batch page</Link> if the fund paid
                    </span>
                  </span>
                </li>
              ))}
              {((capitalRes.data ?? []) as { id: string; amount_cents: number; note: string | null; put_in_on: string }[]).map((c) => (
                <li key={c.id} className="list-row list-row--compact">
                  <span className="list-row__main">
                    <span className="list-row__title">
                      <span>
                        <Money cents={Number(c.amount_cents)} /> put in
                      </span>
                    </span>
                    <span className="list-row__meta">
                      {formatManilaDate(c.put_in_on)}
                      {c.note && ` · ${c.note}`}
                    </span>
                  </span>
                  {isOwner && (
                    <form action={deleteCapital}>
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" className="icon-btn" aria-label="Remove this capital entry">
                        <Icon name="trash" />
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
            {isOwner ? <CapitalForm today={today} /> : <p className="t-sm muted">Only the owner records capital.</p>}
          </section>
        </>
      )}
      <p className="t-sm muted">
        Split for distributions: owner {shareLabel(split.owner, parts)}, manager {shareLabel(split.manager, parts)}.
      </p>
    </>
  );
}

function href2(v: View, sp: SP) {
  const q = new URLSearchParams({ view: v });
  if (sp.period) q.set("period", sp.period);
  return `/sales/pnl?${q.toString()}`;
}

function ReserveCard({ funds, spare }: { funds: Funds | null; spare: number }) {
  if (!funds) return null;
  return (
    <SetAsideForm
      s={{
        needsDecision: funds.needs_decision,
        kept: Number(funds.kept_cents),
        setAside: Number(funds.set_aside_cents),
        used: Number(funds.set_aside_used_cents),
        setAt: funds.set_aside_at,
        note: funds.set_aside_note,
        lastBatchNo: funds.last_batch_no,
        lastBatchCents: funds.last_batch_cents === null ? null : Number(funds.last_batch_cents),
        balance: spare,
      }}
    />
  );
}

function ReleasedList({ releases, isOwner }: { releases: Release[]; isOwner: boolean }) {
  const owner = releases.reduce((s, r) => s + r.owner_cents, 0);
  const manager = releases.reduce((s, r) => s + r.manager_cents, 0);
  return (
    <div className="stack stack-2">
      <h3 className="eyebrow">Distributed</h3>
      {releases.length === 0 ? (
        <p className="t-sm muted">Nothing distributed yet.</p>
      ) : (
        <ul className="list list--plain" role="list">
          {releases.map((r) => (
            <li key={r.id} className="list-row list-row--compact">
              <span className="list-row__main">
                <span className="list-row__title">
                  <span>
                    <Money cents={r.amount_cents} />
                  </span>
                </span>
                <span className="list-row__meta">
                  {formatManilaDate(r.released_on)} · owner <Money cents={r.owner_cents} /> · manager <Money cents={r.manager_cents} />
                  {r.note && ` · ${r.note}`}
                </span>
              </span>
              {isOwner && (
                <form action={undoRelease}>
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className="icon-btn" aria-label="Undo this distribution">
                    <Icon name="undo" />
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {releases.length > 0 && (
        <p className="t-sm muted">
          So far: owner <Money cents={owner} />, manager <Money cents={manager} />.
        </p>
      )}
    </div>
  );
}

async function BatchesView({ supabase, isOwner, sp }: { supabase: ServerSupabase; isOwner: boolean; sp: SP }) {
  const [{ list, expenses, prices, error }, splitRes] = await Promise.all([
    loadBatches(supabase),
    supabase.from("settings").select("split_owner_parts, split_manager_parts").maybeSingle(),
  ]);
  const splitRow = splitRes.data as { split_owner_parts: number; split_manager_parts: number } | null;
  const split = { owner: splitRow?.split_owner_parts ?? 2, manager: splitRow?.split_manager_parts ?? 1 };
  const parts = split.owner + split.manager;
  const rows = list.map(({ batch, rows: lines }) => {
    const t = totals(lines);
    const pnl = batchPnl(batch, lines, expenses, prices);
    return { batch, t, pnl, now: pnl.net === null ? null : splitProfit(pnl.net, split.owner, split.manager) };
  });
  const known = rows.filter((r) => r.pnl.net !== null);
  const sum = (f: (r: (typeof rows)[number]) => number) => known.reduce((n, r) => n + f(r), 0);
  const generalExpenses = expenses.filter((e) => !e.batch_id).reduce((n, e) => n + e.amount_cents, 0);
  const batchesNet = sum((r) => r.pnl.net ?? 0);
  const totalNet = batchesNet - generalExpenses;
  const totalProjected = sum((r) => r.pnl.projected ?? 0) - generalExpenses;
  const totalSplit = splitProfit(totalNet, split.owner, split.manager);
  const projectedSplit = splitProfit(totalProjected, split.owner, split.manager);
  const missing = rows.length - known.length;
  const profile = { isOwner };

  return (
    <>
      {error ? (
        <div className="notice notice--danger" role="alert">
          <Icon name="alert" />
          <div>
            <p className="notice__title">Couldn&apos;t load the P&amp;L.</p>
            <p>{friendlyError(error)}</p>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No batches yet."
          text="Each batch gets its own profit and loss. Receive a batch under Restock, then add its expenses on the batch's page."
          action={
            <Link className="btn btn--money" href="/restock/receive">
              <Icon name="plus" />
              Receive batch
            </Link>
          }
        />
      ) : (
        <>
          {sp.expense === "added" && (
            <div className="notice notice--success" role="status">
              <Icon name="check" />
              <div>
                <p className="notice__title">Expense saved.</p>
              </div>
            </div>
          )}
          {sp.split === "saved" && (
            <div className="notice notice--success" role="status">
              <Icon name="check" />
              <div>
                <p className="notice__title">Profit split saved.</p>
              </div>
            </div>
          )}
          <section className="stack stack-3" aria-labelledby="pnl-total-t" id="pnl">
            <div className="row row--between row--wrap">
              <h2 className="eyebrow" id="pnl-total-t">
                All batches · owner {shareLabel(split.owner, parts)}, manager {shareLabel(split.manager, parts)}
              </h2>
              {profile.isOwner && (
                <SplitForm returnTo="/sales/pnl?view=batches" owner={split.owner} manager={split.manager} />
              )}
            </div>
            <KpiGrid aria-label="All batches">
              <Kpi
                wide
                label={generalExpenses > 0 ? "Shop net so far" : "Net so far"}
                value={<Money cents={totalNet} />}
                meta={
                  <>
                    when everything sells: <Money cents={totalProjected} />
                  </>
                }
              />
              <Kpi
                label="Owner"
                value={<Money cents={totalSplit.owner} />}
                meta={
                  <>
                    when sold out: <Money cents={projectedSplit.owner} />
                  </>
                }
              />
              <Kpi
                label="Manager"
                value={<Money cents={totalSplit.manager} />}
                meta={
                  <>
                    when sold out: <Money cents={projectedSplit.manager} />
                  </>
                }
              />
            </KpiGrid>
            <p className="t-sm muted">
              Each batch&apos;s goods, shipping, tax, MOOE and expenses are counted in full, so a new batch shows a loss until
              its sales cover them. &ldquo;When sold out&rdquo; adds the pieces left at today&apos;s prices.
              {missing > 0 &&
                ` ${missing} batch${missing === 1 ? " has" : "es have"} pieces without a cost and ${missing === 1 ? "isn't" : "aren't"} in the totals.`}
            </p>
          </section>

          <section className="card stack" aria-labelledby="pnl-exp-t">
            <div className="card__head">
              <h2 className="card__title" id="pnl-exp-t">
                Expenses
              </h2>
              <Link className="text-btn" href="/restock/expenses">
                See all
              </Link>
            </div>
            <dl className="cost-list pnl">
              <dt>Batches, net so far</dt>
              <dd>
                <Money cents={batchesNet} />
              </dd>
              <dt>General expenses (not in a batch)</dt>
              <dd>
                − <Money cents={generalExpenses} />
              </dd>
              <dt className="cost-list__total">Shop net so far</dt>
              <dd className={`cost-list__total${totalNet < 0 ? " text-alert" : ""}`}>
                <Money cents={totalNet} />
              </dd>
            </dl>
            <p className="t-sm muted">
              Charge an expense to a batch (it goes into that batch&apos;s P&amp;L) or to the whole shop (it comes off the
              total above, before the split).
            </p>
            <ExpenseForm
              batches={list
                .filter((b) => b.batch.id !== null)
                .map((b) => ({
                  id: b.batch.id as string,
                  label: `${batchTitle(b.batch)}${b.batch.supplier ? ` · ${b.batch.supplier}` : ""}`,
                }))}
              returnTo="/sales/pnl?view=batches"
              today={manilaToday()}
              earliest={addDays(manilaToday(), -400)}
            />
          </section>

          <div className="table-wrap">
            <table className="table table--stack table--dash" role="table">
              <thead role="rowgroup">
                <tr role="row">
                  <th role="columnheader" scope="col">
                    Batch
                  </th>
                  <th role="columnheader" scope="col" className="num">
                    Sold
                  </th>
                  <th role="columnheader" scope="col" className="num">
                    Sales
                  </th>
                  <th role="columnheader" scope="col" className="num">
                    Costs
                  </th>
                  <th role="columnheader" scope="col" className="num">
                    Net so far
                  </th>
                  <th role="columnheader" scope="col" className="num">
                    When sold out
                  </th>
                  <th role="columnheader" scope="col" className="num">
                    Owner
                  </th>
                  <th role="columnheader" scope="col" className="num">
                    Manager
                  </th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {rows.map(({ batch, t, pnl, now }) => (
                  <tr key={batch.id ?? "before"} role="row">
                    <td role="cell" data-label="" className="cell-primary">
                      <Link href={`/restock/batches/${batch.id ?? "before"}${batch.id ? "#pnl" : ""}`}>
                        {batchTitle(batch)}
                        {batch.supplier && ` · ${batch.supplier}`}
                      </Link>
                      <span className="t-caption muted pnl-when">
                        {batch.received_on ? formatManilaDate(batch.received_on) : `from ${formatManilaDate(t.firstIn)}`}
                      </span>
                    </td>
                    <td role="cell" data-label="Sold" className="num">
                      {t.sold} / {t.received}
                    </td>
                    <td role="cell" data-label="Sales" className="num">
                      <Money cents={pnl.sales} />
                    </td>
                    <td role="cell" data-label="Costs" className="num">
                      <Amount cents={pnl.totalCost} />
                    </td>
                    <td role="cell" data-label="Net so far" className="num">
                      <Amount cents={pnl.net} />
                    </td>
                    <td role="cell" data-label="When sold out" className="num">
                      <Amount cents={pnl.projected} />
                    </td>
                    <td role="cell" data-label="Owner" className="num">
                      <Amount cents={now?.owner ?? null} />
                    </td>
                    <td role="cell" data-label="Manager" className="num">
                      <Amount cents={now?.manager ?? null} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="t-sm muted">Tap a batch to see its full P&amp;L.</p>
        </>
      )}
    </>
  );
}
