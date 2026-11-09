// Sales → P&L (owners and managers): every batch's profit and loss side by side. Each batch's
// sales so far against everything it cost (goods, shipping, tax, MOOE, other, and the expenses
// charged to it), what it should make once the rest sells, and the owner / manager split. Tap a
// batch for its full P&L and to add expenses.
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { Kpi, KpiGrid } from "@/components/Kpi";
import { Main } from "@/components/Main";
import { Money } from "@/components/Money";
import { NotAllowed } from "@/components/NotAllowed";
import { Topbar } from "@/components/Topbar";
import { FundsCard, type Funds, type Release } from "@/components/restock/FundsCard";
import { ExpenseForm, SplitForm } from "@/components/restock/PnlForms";
import { requireActiveStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/db-errors";
import { can } from "@/lib/permissions";
import { shareLabel, splitProfit } from "@/lib/pnl";
import { addDays, formatManilaDate, manilaToday } from "@/lib/time";
import { batchPnl, batchTitle, loadBatches, totals } from "../../restock/data";

export const dynamic = "force-dynamic";

function Amount({ cents }: { cents: number | null }) {
  if (cents === null) return <>–</>;
  return <span className={cents < 0 ? "text-alert" : undefined}>{<Money cents={cents} />}</span>;
}

export default async function PnlPage({
  searchParams,
}: {
  searchParams: Promise<{ split?: string; expense?: string; released?: string }>;
}) {
  const { supabase, profile } = await requireActiveStaff();
  if (!can(profile, "seeCosts")) return <NotAllowed title="P&L" what="Profit and loss" />;
  const sp = await searchParams;
  const [{ list, expenses, prices, error }, splitRes, fundsRes, releasesRes] = await Promise.all([
    loadBatches(supabase),
    supabase.from("settings").select("split_owner_parts, split_manager_parts").maybeSingle(),
    supabase.rpc("company_funds"),
    supabase
      .from("fund_releases")
      .select("id, amount_cents, owner_cents, manager_cents, note, released_on")
      .order("released_on", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  const funds = fundsRes.data as Funds | null;
  const releases = (releasesRes.data ?? []) as Release[];
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
  // General expenses (not in a batch) come off the shop's total, before the split.
  const generalExpenses = expenses.filter((e) => !e.batch_id).reduce((n, e) => n + e.amount_cents, 0);
  const batchesNet = sum((r) => r.pnl.net ?? 0);
  const totalNet = batchesNet - generalExpenses;
  const totalProjected = sum((r) => r.pnl.projected ?? 0) - generalExpenses;
  const totalSplit = splitProfit(totalNet, split.owner, split.manager);
  const projectedSplit = splitProfit(totalProjected, split.owner, split.manager);
  const missing = rows.length - known.length;

  return (
    <>
      <Topbar title="P&L" />
      <Main>
        <div className="stack stack-6">
          <nav className="segmented" aria-label="Sales">
            <Link className="segmented__option" href="/sales">
              Daily sales
            </Link>
            <Link className="segmented__option" href="/sales/dashboard">
              Dashboard
            </Link>
            <Link className="segmented__option" href="/sales/pnl" aria-current="page">
              P&amp;L
            </Link>
          </nav>

          {sp.released === "1" && (
            <div className="notice notice--success" role="status">
              <Icon name="check" />
              <div>
                <p className="notice__title">Profit released.</p>
              </div>
            </div>
          )}
          {sp.released === "undone" && (
            <div className="notice notice--success" role="status">
              <Icon name="check" />
              <div>
                <p className="notice__title">Release undone: the money is back in the fund.</p>
              </div>
            </div>
          )}
          {funds && <FundsCard funds={funds} releases={releases} split={split} isOwner={can(profile, "editSettings")} />}

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
                  {can(profile, "editSettings") && (
                    <SplitForm returnTo="/sales/pnl" owner={split.owner} manager={split.manager} />
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
                  returnTo="/sales/pnl"
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
        </div>
      </Main>
    </>
  );
}
