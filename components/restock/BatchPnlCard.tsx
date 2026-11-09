// A batch's P&L: what its pieces have sold for so far against everything the batch cost (goods,
// restock costs and its expenses, charged in full), the owner / manager split, and the batch's
// expenses with Add / Remove. Owners and managers; only the owner changes the split.
import { Fragment } from "react";
import { deleteBatchExpense, setPaidFromFunds } from "@/app/(staff)/restock/actions";
import type { Batch, BatchPnl, Expense } from "@/app/(staff)/restock/data";
import { Icon } from "@/components/Icon";
import { Kpi, KpiGrid } from "@/components/Kpi";
import { Money } from "@/components/Money";
import { BatchCostsForm } from "@/components/restock/BatchCostsForm";
import { ExpenseForm, SplitForm } from "@/components/restock/PnlForms";
import { EXPENSE_CATEGORIES, shareLabel, splitProfit } from "@/lib/pnl";
import { addDays, formatManilaDate } from "@/lib/time";

export function BatchPnlCard({
  batch,
  pnl,
  expenses,
  received,
  sold,
  owed,
  split,
  isOwner,
  today,
  flash,
}: {
  batch: Batch & { id: string };
  pnl: BatchPnl;
  expenses: Expense[];
  received: number;
  sold: number;
  owed: number;
  split: { owner: number; manager: number };
  isOwner: boolean;
  today: string;
  flash?: { expense?: string; split?: string; costs?: string };
}) {
  const returnTo = `/restock/batches/${batch.id}`;
  const total = split.owner + split.manager;
  const now = pnl.net === null ? null : splitProfit(pnl.net, split.owner, split.manager);
  const later = pnl.projected === null ? null : splitProfit(pnl.projected, split.owner, split.manager);
  const left = received - sold;
  return (
    <section className="card stack" id="pnl" aria-labelledby="pnl-t">
      <div className="card__head">
        <h2 className="card__title" id="pnl-t">
          Profit and loss
        </h2>
        <span className="t-caption muted">
          {sold} of {received} pcs sold
        </span>
      </div>
      {flash?.expense === "added" && <p className="t-sm notice-inline">Expense saved.</p>}
      {flash?.expense === "removed" && <p className="t-sm notice-inline">Expense removed.</p>}
      {flash?.split === "saved" && <p className="t-sm notice-inline">Profit split saved.</p>}
      {flash?.costs === "saved" && <p className="t-sm notice-inline">Restock costs saved.</p>}
      {flash?.expense === "error" && (
        <p className="field__error" role="alert">
          <Icon name="alert" />
          Couldn&apos;t change that expense. Try again.
        </p>
      )}

      <dl className="cost-list pnl">
        <dt>Sales so far</dt>
        <dd>
          <Money cents={pnl.sales} />
        </dd>
        <dt>Goods ({received} pcs)</dt>
        <dd>
          {pnl.goods === null ? (
            "Some pieces have no cost"
          ) : (
            <>
              − <Money cents={pnl.goods} />
            </>
          )}
        </dd>
        <dt>Shipping</dt>
        <dd>
          − <Money cents={batch.shipping_cents} />
        </dd>
        <dt>Tax</dt>
        <dd>
          − <Money cents={batch.tax_cents} />
        </dd>
        <dt>MOOE</dt>
        <dd>
          − <Money cents={batch.mooe_cents} />
        </dd>
        {batch.other_cents > 0 && (
          <>
            <dt>{batch.other_label || "Other restock cost"}</dt>
            <dd>
              − <Money cents={batch.other_cents} />
            </dd>
          </>
        )}
        {EXPENSE_CATEGORIES.map((ec) => {
          const sum = pnl.expensesBy.get(ec.id) ?? 0;
          if (sum === 0 && ec.id !== "salary") return null;
          return (
            <Fragment key={ec.id}>
              <dt>{ec.label}</dt>
              <dd>
                − <Money cents={sum} />
              </dd>
            </Fragment>
          );
        })}
        <dt className="cost-list__total">Net so far</dt>
        <dd className={`cost-list__total${pnl.net !== null && pnl.net < 0 ? " text-alert" : ""}`}>
          {pnl.net === null ? "–" : <Money cents={pnl.net} />}
        </dd>
        {left > 0 && (
          <>
            <dt>{left} pcs left, at today&apos;s prices</dt>
            <dd>
              + <Money cents={pnl.remainingValue} />
            </dd>
            <dt className="cost-list__total">When sold out</dt>
            <dd className={`cost-list__total${pnl.projected !== null && pnl.projected < 0 ? " text-alert" : ""}`}>
              {pnl.projected === null ? "–" : <Money cents={pnl.projected} />}
            </dd>
          </>
        )}
        <dt>Cost per piece, all in</dt>
        <dd>{pnl.totalCost === null || received === 0 ? "–" : <Money cents={Math.round(pnl.totalCost / received)} />}</dd>
      </dl>
      <p className="t-sm muted">
        Every cost of the batch is counted in full, so &ldquo;Net so far&rdquo; is negative until sales cover them.
        {owed > 0 && (
          <>
            {" "}
            <Money cents={owed} /> of its sales isn&apos;t paid yet.
          </>
        )}
      </p>
      <BatchCostsForm id={batch.id} batch={batch} />
      <form action={setPaidFromFunds} className="row row--between row--wrap pnl-funds">
        <input type="hidden" name="id" value={batch.id} />
        <input type="hidden" name="paid" value={batch.paid_from_funds ? "0" : "1"} />
        <span className="t-sm">
          {batch.paid_from_funds
            ? "Paid from company funds: its goods and restocking fees come out of the fund."
            : "Not paid from company funds."}
        </span>
        <button type="submit" className="text-btn">
          {batch.paid_from_funds ? "Not from the fund" : "Paid from the fund"}
        </button>
      </form>

      <div className="pnl-split">
        <div className="row row--between row--wrap">
          <h3 className="eyebrow">
            Split · owner {shareLabel(split.owner, total)}, manager {shareLabel(split.manager, total)}
          </h3>
          {isOwner && <SplitForm returnTo={returnTo} owner={split.owner} manager={split.manager} />}
        </div>
        <KpiGrid aria-label="Profit split">
          <Kpi
            label="Owner"
            value={now === null ? "–" : <Money cents={now.owner} />}
            meta={
              later && left > 0 ? (
                <>
                  when sold out: <Money cents={later.owner} />
                </>
              ) : (
                "of net so far"
              )
            }
          />
          <Kpi
            label="Manager"
            value={now === null ? "–" : <Money cents={now.manager} />}
            meta={
              later && left > 0 ? (
                <>
                  when sold out: <Money cents={later.manager} />
                </>
              ) : (
                "of net so far"
              )
            }
          />
        </KpiGrid>
        {pnl.net !== null && pnl.net < 0 && <p className="t-sm muted">Shares are negative until the batch pays for itself.</p>}
      </div>

      <div className="stack stack-2">
        <h3 className="eyebrow">Expenses for this batch</h3>
        {expenses.length === 0 ? (
          <p className="t-sm muted">None yet. Add salaries, rent and other costs for this batch so its net profit is right.</p>
        ) : (
          <ul className="list list--plain" role="list">
            {expenses.map((e) => (
              <li key={e.id} className="list-row list-row--compact">
                <span className="list-row__main">
                  <span className="list-row__title">
                    <span>{EXPENSE_CATEGORIES.find((x) => x.id === e.category)?.label ?? e.category}</span>
                  </span>
                  <span className="list-row__meta">
                    {formatManilaDate(e.spent_on)}
                    {e.note && ` · ${e.note}`}
                  </span>
                </span>
                <span className="list-row__trail">
                  <span className="num">
                    <Money cents={e.amount_cents} />
                  </span>
                </span>
                <form action={deleteBatchExpense}>
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <button type="submit" className="icon-btn" aria-label={`Remove ${e.note ?? e.category} expense`}>
                    <Icon name="trash" />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <ExpenseForm batchId={batch.id} returnTo={returnTo} today={today} earliest={addDays(today, -400)} />
      </div>
    </section>
  );
}
