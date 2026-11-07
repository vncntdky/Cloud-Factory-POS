"use client";

// P&L forms: add an expense, to a batch or general (owners and managers), and change the profit
// split (owner).
// Each is folded away behind a button until needed. return_to says which page to come back to.
import { useState } from "react";
import { addExpense, saveSplit, type RestockFormState as PnlFormState } from "@/app/(staff)/restock/actions";
import { Icon } from "@/components/Icon";
import { EXPENSE_CATEGORIES } from "@/lib/pnl";
import { useFormAction } from "@/lib/use-form-action";

function FormError({ state }: { state: PnlFormState }) {
  if (!state?.error) return null;
  return (
    <p className="field__error" role="alert">
      <Icon name="alert" />
      {state.error}
    </p>
  );
}

/** With batchId the expense goes to that batch; otherwise you pick a batch, or General. */
export function ExpenseForm({
  batchId,
  batches,
  defaultBatch = "",
  returnTo,
  today,
  earliest,
}: {
  batchId?: string;
  batches?: { id: string; label: string }[];
  defaultBatch?: string;
  returnTo: string;
  today: string;
  earliest: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, onSubmit, pending] = useFormAction<PnlFormState>(addExpense, null);
  if (!open) {
    return (
      <div>
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => setOpen(true)} aria-expanded={false}>
          <Icon name="plus" />
          Add expense
        </button>
      </div>
    );
  }
  const bad = (f: string) => (state?.field === f ? true : undefined);
  return (
    <form onSubmit={onSubmit} className="stack" aria-label="Add expense">
      <input type="hidden" name="return_to" value={returnTo} />
      {batchId && <input type="hidden" name="batch_id" value={batchId} />}
      <div className="form-grid form-grid--2">
        {!batchId && (
          <div className="field span-all">
            <label className="field__label" htmlFor="exp-batch">
              Charge to
            </label>
            <div className="select-wrap">
              <select
                id="exp-batch"
                name="batch_id"
                className="select"
                defaultValue={defaultBatch}
                aria-invalid={bad("batch_id")}
              >
                <option value="">General (whole shop, not a batch)</option>
                {(batches ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
            {(batches ?? []).length === 0 && (
              <p className="field__hint">
                No batches yet, so only General. <a href="/restock/batches/before">Turn your current stock into a batch</a> or
                receive one to charge a batch.
              </p>
            )}
          </div>
        )}
        <div className="field">
          <label className="field__label" htmlFor="exp-category">
            For
          </label>
          <div className="select-wrap">
            <select id="exp-category" name="category" className="select" defaultValue="salary" aria-invalid={bad("category")}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id === "other" ? "Other" : c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="exp-amount">
            Amount
          </label>
          <div className="input-affix">
            <span className="input-affix__prefix" aria-hidden="true">
              ₱
            </span>
            <input
              id="exp-amount"
              name="amount"
              className="input input--num"
              inputMode="decimal"
              required
              aria-invalid={bad("amount")}
            />
          </div>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="exp-date">
            Paid on
          </label>
          <input
            id="exp-date"
            name="spent_on"
            type="date"
            className="input"
            defaultValue={today}
            min={earliest}
            max={today}
            required
            aria-invalid={bad("spent_on")}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="exp-note">
            Note <span className="optional">(optional)</span>
          </label>
          <input id="exp-note" name="note" className="input" maxLength={200} placeholder="Who, which period, receipt no.…" />
        </div>
      </div>
      <FormError state={state} />
      <div className="btn-row">
        <button type="submit" className="btn btn--primary btn--sm" aria-busy={pending || undefined} disabled={pending}>
          Save expense
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function SplitForm({ returnTo, owner, manager }: { returnTo: string; owner: number; manager: number }) {
  const [open, setOpen] = useState(false);
  const [state, onSubmit, pending] = useFormAction<PnlFormState>(saveSplit, null);
  if (!open) {
    return (
      <button type="button" className="text-btn" onClick={() => setOpen(true)} aria-expanded={false}>
        Change split
      </button>
    );
  }
  return (
    <form onSubmit={onSubmit} className="stack" aria-label="Profit split">
      <input type="hidden" name="return_to" value={returnTo} />
      <div className="form-grid form-grid--2">
        <div className="field">
          <label className="field__label" htmlFor="split-owner">
            Owner parts
          </label>
          <input
            id="split-owner"
            name="owner_parts"
            className="input input--num"
            inputMode="numeric"
            defaultValue={owner}
            required
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="split-manager">
            Manager parts
          </label>
          <input
            id="split-manager"
            name="manager_parts"
            className="input input--num"
            inputMode="numeric"
            defaultValue={manager}
            required
          />
        </div>
      </div>
      <p className="field__hint">2 and 1 = owner two thirds, manager one third. 1 and 1 = half each.</p>
      <FormError state={state} />
      <div className="btn-row">
        <button type="submit" className="btn btn--primary btn--sm" aria-busy={pending || undefined} disabled={pending}>
          Save split
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}
