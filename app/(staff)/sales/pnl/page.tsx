// Sales → Finance (owners and managers): the shop's statements, worked out live from sales, stock,
// batches, expenses, owner capital and distributions (finance_report, supabase/migrations/…_finance.sql).
//   Overview       safe to distribute, key numbers, the cash bridge, next restock, distributions, who owes
//   Profit & loss  accrual: counted when sold (cost = landed cost of the pieces sold)
//   Cash flow      cash: counted when money moves
//   Balance        what the business holds = what it owes + the owners' share; owner capital
//   Batches        each batch's running profit and loss line by line, the running total, expenses
// The Overview also shows what the register should hold today (cash in, less everything paid out).
import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { Kpi, KpiGrid } from "@/components/Kpi";
import { Main } from "@/components/Main";
import { Money } from "@/components/Money";
import { NotAllowed } from "@/components/NotAllowed";
import { Topbar } from "@/components/Topbar";
import { BatchStatementLines } from "@/components/finance/BatchStatementLines";
import { CapitalForm } from "@/components/finance/CapitalForm";
import { EditCapital, EditRelease } from "@/components/finance/EditForms";
import { CashBridge } from "@/components/finance/CashBridge";
import { Line } from "@/components/finance/Line";
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
import { batchStatement, batchTitle, loadBatchStatements, loadBatches, totals } from "../../restock/data";

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
  const reg = now.register ?? null;
  const elsewhere = reg ? Object.entries(reg.elsewhere_by_method ?? {}).filter(([, v]) => Number(v) !== 0) : [];
  const paymentFees = Number(reg?.payment_fees ?? 0);
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
          {sp.released === "edited" && <Notice>Distribution updated.</Notice>}
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
            {reg && (
              <Kpi
                wide
                label="Should be in the register"
                variant={Number(reg.expected) < 0 ? "alert" : undefined}
                value={<Money cents={Number(reg.expected)} />}
                meta="cash only, today · tap to see how"
                href="#register"
              />
            )}
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

          {reg && (
            <section className="card stack" id="register" aria-labelledby="reg-t">
              <div className="card__head">
                <h2 className="card__title" id="reg-t">
                  Should be in the register
                </h2>
                <Basis>Today</Basis>
              </div>
              <dl className="cost-list">
                <Line label="Cash sales and collections" hint="everything paid in cash since opening" cents={Number(reg.cash_received)} />
                {Number(reg.capital_cash) !== 0 && <Line label="Owner capital put in" cents={Number(reg.capital_cash)} />}
                <Line label="Stock bought" hint="batches paid from company funds" cents={Number(reg.stock)} out />
                <Line label="Restocking fees" hint="shipping, tax, MOOE, other" cents={Number(reg.fees)} out />
                <Line
                  label="Expenses"
                  hint={paymentFees !== 0 ? "without payment fees: those come off the e-wallet or bank" : undefined}
                  cents={Number(reg.expenses)}
                  out
                />
                {Number(reg.tax_paid) !== 0 && <Line label="Taxes paid" cents={Number(reg.tax_paid)} out />}
                {Number(reg.distributions) !== 0 && <Line label="Owner distributions" cents={Number(reg.distributions)} out />}
                <Line label="Should be in the register" cents={Number(reg.expected)} total />
                {(elsewhere.length > 0 || paymentFees !== 0) && (
                  <>
                    {elsewhere.map(([m, v]) => (
                      <Line
                        key={m}
                        label={`Received by ${PAYMENT_METHOD_LABELS[m as SaleMethod] ?? m}`}
                        hint="since opening · it went there, not into the drawer"
                        cents={Number(v)}
                        sub
                      />
                    ))}
                    {paymentFees !== 0 && <Line label="Payment fees" cents={paymentFees} out sub />}
                    <Line label="All money" hint="drawer, e-wallets and bank · same as Closing cash" cents={Number(now.cash)} total />
                  </>
                )}
              </dl>
              {Number(reg.expected) < 0 && (
                <p className="t-sm text-alert">
                  More was paid out than cash came in, so some payments were not made from the drawer. Add those back.
                </p>
              )}
              <p className="t-sm muted">
                This is the shop&apos;s paper cash since opening, wherever it is kept. It takes every payment as cash from the
                drawer, so your count will differ when:
              </p>
              <ul className="t-sm muted fin-notes">
                <li>You paid for stock, a fee or an expense by GCash or bank: add that back.</li>
                <li>You paid a supplier for stock that hasn&apos;t arrived: take that off. The app counts it when you receive the batch.</li>
                <li>Cash was taken out of the drawer to keep or deposit: add it back.</li>
                <li>The drawer started with a float not recorded as owner capital: add it.</li>
              </ul>
              <p className="t-sm muted">
                For today only, see <Link href="/sales">Daily sales</Link>.
              </p>
            </section>
          )}

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
              <ReleasedList
                releases={(releasesRes.data ?? []) as Release[]}
                isOwner={isOwner}
                safe={Math.max(0, Number(now.safe_to_distribute))}
                split={split}
                today={today}
              />
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

          {isOwner && (
            <section className="card stack" id="settings" aria-labelledby="set-t">
              <div className="card__head">
                <h2 className="card__title" id="set-t">
                  Finance settings
                </h2>
                <span className="chip chip--ok">Owner only</span>
              </div>
              {sp.tax === "saved" && <p className="t-sm notice-inline">Tax rate saved.</p>}
              {sp.split === "saved" && <p className="t-sm notice-inline">Profit split saved.</p>}
              <dl className="cost-list">
                <dt>
                  Percentage tax on net sales
                  <span className="fin-hint">used for the tax estimate and the tax reserve</span>
                </dt>
                <dd>{(Number(report.end.tax_rate_bp) / 100).toString()}%</dd>
                <dt>
                  Profit split
                  <span className="fin-hint">how each distribution is shared</span>
                </dt>
                <dd>
                  owner {shareLabel(split.owner, parts)}, manager {shareLabel(split.manager, parts)}
                </dd>
              </dl>
              <div className="stack stack-2">
                <TaxRateForm bp={Number(report.end.tax_rate_bp)} returnTo="/sales/pnl" />
                <SplitForm returnTo="/sales/pnl" owner={split.owner} manager={split.manager} />
              </div>
              <p className="t-sm muted">
                Everything else is edited where it lives: distributions and the inventory reserve above, owner capital on
                Balance, expenses under Restock → Expenses, and each batch&apos;s costs and details on its page.
              </p>
            </section>
          )}
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
          {sp.capital === "edited" && <Notice>Capital entry updated.</Notice>}
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
                <li key={c.id} className="list-row list-row--compact list-row--wrap">
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
                  {isOwner && <EditCapital entry={c} today={today} />}
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

function ReleasedList({
  releases,
  isOwner,
  safe,
  split,
  today,
}: {
  releases: Release[];
  isOwner: boolean;
  safe: number;
  split: { owner: number; manager: number };
  today: string;
}) {
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
            <li key={r.id} className="list-row list-row--compact list-row--wrap">
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
                <EditRelease release={r} max={r.amount_cents + safe} split={split} today={today} earliest={addDays(today, -400)} />
              )}
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
  const today = manilaToday();
  const [{ list, expenses, error }, { statements, error: statementsError }, settingsRes, reportRes, stockRes] = await Promise.all([
    loadBatches(supabase),
    loadBatchStatements(supabase),
    supabase.from("settings").select("split_owner_parts, split_manager_parts, tax_rate_bp").maybeSingle(),
    supabase.rpc("finance_report", { p_from: "2020-01-01", p_to: today }),
    supabase.rpc("stock_value"),
  ]);
  const settings = settingsRes.data as { split_owner_parts: number; split_manager_parts: number; tax_rate_bp: number } | null;
  const split = { owner: settings?.split_owner_parts ?? 2, manager: settings?.split_manager_parts ?? 1 };
  const parts = split.owner + split.manager;
  const taxRateBp = Number(settings?.tax_rate_bp ?? 0);
  // Oldest first, so the running total reads down the page like a ledger.
  let running = 0;
  const ledger = list
    .map(({ batch, rows: lines }) => {
      const t = totals(lines);
      // A batch's arrival date, or when the first piece came in for stock from before batches.
      return { batch, since: batch.received_on ?? t.firstIn, st: batchStatement(statements.get(batch.id ?? ""), batch, expenses, taxRateBp) };
    })
    .sort((a, b) => a.since.slice(0, 10).localeCompare(b.since.slice(0, 10)) || (a.batch.batch_no ?? -1) - (b.batch.batch_no ?? -1))
    .map((r) => {
      running += r.st.netProfit;
      return { ...r, running };
    });
  const batchesNet = running;
  // Taxes paid aren't an expense: they lower the tax still owed, not the profit.
  const general = expenses.filter((e) => !e.batch_id && e.category !== "tax");
  const generalTotal = general.reduce((n, e) => n + e.amount_cents, 0);
  // Profit & loss is the reference. What it counts that no batch does (sales of a product since
  // removed or of pieces sold beyond the stock count, rounding) gets its own row, so the running
  // total always ends at the net profit in Profit & loss.
  const report = reportRes.error ? null : (reportRes.data as FinanceReport | null);
  const shopNet = report ? Number(report.end.net_profit) : batchesNet - generalTotal;
  const other = shopNet - (batchesNet - generalTotal);
  // When everything sells: the whole shelf at today's prices, less what it cost (and the tax on it).
  const stock = stockRes.error ? null : (stockRes.data as { retail_cents: number } | null);
  const whenSoldOut =
    report && stock
      ? shopNet + Number(stock.retail_cents) - Number(report.end.inventory) - Math.round((Number(stock.retail_cents) * taxRateBp) / 10000)
      : ledger.reduce((n, r) => n + r.st.whenSoldOut, 0) - generalTotal + other;
  const totalSplit = splitProfit(shopNet, split.owner, split.manager);
  const projectedSplit = splitProfit(whenSoldOut, split.owner, split.manager);
  const anchor = (id: string | null) => `b-${id ?? "before"}`;
  // Batches still selling, and the newest one, start open; sold-out ones are folded.
  const newest = ledger.at(-1)?.batch.id ?? null;

  return (
    <>
      {error || statementsError ? (
        <div className="notice notice--danger" role="alert">
          <Icon name="alert" />
          <div>
            <p className="notice__title">Couldn&apos;t load the P&amp;L.</p>
            <p>{friendlyError(error ?? statementsError)}</p>
          </div>
        </div>
      ) : ledger.length === 0 ? (
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
                Whole shop · owner {shareLabel(split.owner, parts)}, manager {shareLabel(split.manager, parts)}
              </h2>
              {isOwner && <SplitForm returnTo="/sales/pnl?view=batches" owner={split.owner} manager={split.manager} />}
            </div>
            <KpiGrid aria-label="Whole shop">
              <Kpi
                wide
                label="Shop net profit so far"
                variant={shopNet < 0 ? "alert" : undefined}
                value={<Money cents={shopNet} />}
                meta={
                  <>
                    when everything sells: <Money cents={whenSoldOut} />
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
            {report ? (
              <p className="t-sm muted">
                Profit on the pieces sold so far, after their cost, fees and expenses. The shop total matches Profit &amp; loss
                since opening. &ldquo;When sold out&rdquo; adds the pieces left at today&apos;s prices.
              </p>
            ) : (
              <p className="t-sm text-alert">
                Couldn&apos;t check this against Profit &amp; loss just now, so the shop total here is the batches less general
                expenses. Reload to try again.
              </p>
            )}
          </section>

          <section className="stack stack-3" aria-labelledby="run-t">
            <h2 className="eyebrow" id="run-t">
              Running net profit by batch · oldest first
            </h2>
            <div className="table-wrap">
              <table className="table table--stack" role="table">
                <thead role="rowgroup">
                  <tr role="row">
                    <th role="columnheader" scope="col">
                      Batch
                    </th>
                    <th role="columnheader" scope="col" className="num">
                      Sold
                    </th>
                    <th role="columnheader" scope="col" className="num">
                      Net sales
                    </th>
                    <th role="columnheader" scope="col" className="num">
                      Net profit so far
                    </th>
                    <th role="columnheader" scope="col" className="num">
                      Running total
                    </th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {ledger.map(({ batch, since, st, running: total }) => (
                    <tr key={batch.id ?? "before"} role="row">
                      <td role="cell" data-label="" className="cell-primary">
                        <a href={`#${anchor(batch.id)}`}>
                          {batchTitle(batch)}
                          {batch.supplier && ` · ${batch.supplier}`}
                        </a>
                        <span className="t-caption muted pnl-when">
                          {batch.received_on ? formatManilaDate(batch.received_on) : `from ${formatManilaDate(since)}`}
                        </span>
                      </td>
                      <td role="cell" data-label="Sold" className="num">
                        {st.sold} / {st.received}
                      </td>
                      <td role="cell" data-label="Net sales" className="num">
                        <Money cents={st.net} />
                      </td>
                      <td role="cell" data-label="Net profit so far" className="num">
                        <Amount cents={st.netProfit} />
                      </td>
                      <td role="cell" data-label="Running total" className="num">
                        <Amount cents={total} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot role="rowgroup">
                  <tr role="row">
                    <td role="cell" colSpan={4}>
                      General expenses (not in a batch)
                    </td>
                    <td role="cell" className="num">
                      <Amount cents={-generalTotal} />
                    </td>
                  </tr>
                  {other !== 0 && (
                    <tr role="row">
                      <td role="cell" colSpan={4}>
                        Not in any batch
                        <span className="fin-hint">sales of removed products or of pieces sold beyond the count, and rounding</span>
                      </td>
                      <td role="cell" className="num">
                        <Amount cents={other} />
                      </td>
                    </tr>
                  )}
                  <tr role="row">
                    <td role="cell" colSpan={4}>
                      Shop net profit so far
                    </td>
                    <td role="cell" className="num">
                      <Amount cents={shopNet} />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="t-sm muted">Tap a batch for every line behind its number.</p>
          </section>

          <section className="card stack" aria-labelledby="pnl-exp-t">
            <div className="card__head">
              <h2 className="card__title" id="pnl-exp-t">
                General expenses
              </h2>
              <Link className="text-btn" href="/restock/expenses">
                See all
              </Link>
            </div>
            <dl className="cost-list pnl">
              {general.map((e) => (
                <Line
                  key={e.id}
                  label={CATEGORY[e.category] ?? e.category}
                  hint={`${formatManilaDate(e.spent_on)}${e.note ? ` · ${e.note}` : ""}`}
                  cents={e.amount_cents}
                  sub
                />
              ))}
              <Line label="General expenses (not in a batch)" cents={generalTotal} out total />
            </dl>
            <p className="t-sm muted">
              Charge an expense to a batch (it shows as its own line in that batch below) or to the whole shop (it comes off
              the shop total above, before the split).
            </p>
            <ExpenseForm
              batches={list
                .filter((b) => b.batch.id !== null)
                .map((b) => ({
                  id: b.batch.id as string,
                  label: `${batchTitle(b.batch)}${b.batch.supplier ? ` · ${b.batch.supplier}` : ""}`,
                }))}
              returnTo="/sales/pnl?view=batches"
              today={today}
              earliest={addDays(today, -400)}
            />
          </section>

          {[...ledger].reverse().map(({ batch, since, st }) => {
            const share = splitProfit(st.netProfit, split.owner, split.manager);
            const title = batchTitle(batch);
            return (
              <details key={batch.id ?? "before"} className="cat fin-batch" id={anchor(batch.id)} open={st.left > 0 || batch.id === newest}>
                <summary className="cat__head">
                  <span className="cat__main">
                    <span className="cat__name">
                      {title}
                      {batch.supplier && ` · ${batch.supplier}`}
                    </span>
                    <span className="cat__meta">
                      {batch.received_on ? `Arrived ${formatManilaDate(batch.received_on)}` : `From ${formatManilaDate(since)}`} ·{" "}
                      {st.sold} of {st.received} pcs sold
                    </span>
                  </span>
                  <span className="fin-batch__net">
                    <Amount cents={st.netProfit} />
                  </span>
                  <Icon name="chevron-down" className="cat__chevron" />
                </summary>
                <div className="stack fin-batch__body">
                  <BatchStatementLines batch={batch} st={st} taxRateBp={taxRateBp} />
                  <p className="t-sm muted">
                    This batch&apos;s share before general expenses: owner <Money cents={share.owner} />, manager{" "}
                    <Money cents={share.manager} />. What can be paid out is on Overview → Safe to distribute.
                  </p>
                  <Link className="text-btn" href={`/restock/batches/${batch.id ?? "before"}${batch.id ? "#pnl" : ""}`}>
                    Open batch
                  </Link>
                </div>
              </details>
            );
          })}
        </>
      )}
    </>
  );
}
