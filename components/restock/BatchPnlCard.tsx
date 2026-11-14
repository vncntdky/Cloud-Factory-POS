// A batch's running profit and loss, line by line (the same statement as Sales → Finance → Batches):
// sales, discounts, what the pieces sold cost, each expense, net profit so far, and what the rest
// would add. Below it: the batch's restock costs, the owner / manager split, and the batch's
// expenses with Add / Edit / Remove. Owners and managers; only the owner changes the split.
import { deleteBatchExpense, setPaidFromFunds } from "@/app/(staff)/restock/actions";
import type { Batch, BatchStatement, Expense } from "@/app/(staff)/restock/data";
import { Icon } from "@/components/Icon";
import { Money } from "@/components/Money";
import { BatchSplit } from "@/components/finance/BatchSplit";
import { BatchStatementLines } from "@/components/finance/BatchStatementLines";
import { BatchCostsForm } from "@/components/restock/BatchCostsForm";
import { ExpenseForm, SplitForm } from "@/components/restock/PnlForms";
import { EditExpense } from "@/components/finance/EditForms";
import { EXPENSE_CATEGORIES, shareLabel } from "@/lib/pnl";
import { addDays, formatManilaDate } from "@/lib/time";

export function BatchPnlCard({
  batch,
  st,
  failed,
  taxRateBp,
  expenses,
  split,
  isOwner,
  today,
  flash,
}: {
  batch: Batch & { id: string };
  st: BatchStatement;
  /** The statement couldn't be loaded: show the forms, not zeros. */
  failed?: boolean;
  taxRateBp: number;
  /** Every expense charged to this batch (taxes paid included), for the list below. */
  expenses: Expense[];
  split: { owner: number; manager: number };
  isOwner: boolean;
  today: string;
  flash?: { expense?: string; split?: string; costs?: string };
}) {
  const returnTo = `/restock/batches/${batch.id}`;
  const total = split.owner + split.manager;
  return (
    <section className="card stack" id="pnl" aria-labelledby="pnl-t">
      <div className="card__head">
        <h2 className="card__title" id="pnl-t">
          Profit and loss
        </h2>
        <span className="t-caption muted">
          {st.sold} of {st.received} pcs sold
        </span>
      </div>
      {flash?.expense === "added" && <p className="t-sm notice-inline">Expense saved.</p>}
      {flash?.expense === "removed" && <p className="t-sm notice-inline">Expense removed.</p>}
      {flash?.expense === "edited" && <p className="t-sm notice-inline">Expense updated.</p>}
      {flash?.split === "saved" && <p className="t-sm notice-inline">Profit split saved.</p>}
      {flash?.costs === "saved" && <p className="t-sm notice-inline">Restock costs saved.</p>}
      {flash?.expense === "error" && (
        <p className="field__error" role="alert">
          <Icon name="alert" />
          Couldn&apos;t change that expense. Try again.
        </p>
      )}

      {failed ? (
        <p className="field__error" role="alert">
          <Icon name="alert" />
          Couldn&apos;t load the profit and loss. Reload to try again.
        </p>
      ) : (
        <>
          <BatchStatementLines batch={batch} st={st} taxRateBp={taxRateBp} />
          {st.received > 0 && (
            <p className="t-sm muted">
              Cost per piece, all in: <Money cents={Math.round(st.costInFull / st.received)} />.
            </p>
          )}
        </>
      )}
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

      {!failed && (
        <div className="pnl-split">
          <div className="row row--between row--wrap">
            <h3 className="eyebrow">
              Split · owner {shareLabel(split.owner, total)}, manager {shareLabel(split.manager, total)}
            </h3>
            {isOwner && <SplitForm returnTo={returnTo} owner={split.owner} manager={split.manager} />}
          </div>
          <BatchSplit st={st} split={split} />
        </div>
      )}

      <div className="stack stack-2">
        <h3 className="eyebrow">Expenses for this batch</h3>
        {expenses.length === 0 ? (
          <p className="t-sm muted">None yet. Add salaries, rent and other costs for this batch so its net profit is right.</p>
        ) : (
          <ul className="list list--plain" role="list">
            {expenses.map((e) => (
              <li key={e.id} className="list-row list-row--compact list-row--wrap">
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
                <EditExpense expense={e} returnTo={returnTo} today={today} earliest={addDays(today, -400)} />
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
