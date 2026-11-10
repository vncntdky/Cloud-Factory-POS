"use client";

// Edit forms for money records, each folded behind an "Edit" button on its row:
// expenses (owners and managers), capital put in and distributions (owner), batch details.
import { useState, type ReactNode } from "react";
import {
  updateBatchDetails,
  updateCapital,
  updateExpense,
  updateRelease,
  type RestockFormState,
} from "@/app/(staff)/restock/actions";
import { Icon } from "@/components/Icon";
import { Money } from "@/components/Money";
import { centsToInput, toCents } from "@/lib/format";
import { EXPENSE_CATEGORIES } from "@/lib/pnl";
import { splitProfit } from "@/lib/pnl";
import { useFormAction } from "@/lib/use-form-action";

function Shell({
  label,
  state,
  pending,
  onSubmit,
  onCancel,
  children,
}: {
  label: string;
  state: RestockFormState;
  pending: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} className="stack edit-form" aria-label={label}>
      <div className="form-grid form-grid--2">{children}</div>
      {state?.error && (
        <p className="field__error" role="alert">
          <Icon name="alert" />
          {state.error}
        </p>
      )}
      <div className="btn-row">
        <button type="submit" className="btn btn--primary btn--sm" disabled={pending} aria-busy={pending || undefined}>
          Save changes
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function EditButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className="text-btn edit-open" onClick={onClick} aria-label={label}>
      Edit
    </button>
  );
}

function Peso({ id, name, value, invalid, label }: { id: string; name: string; value: string; invalid?: boolean; label: string }) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="input-affix">
        <span className="input-affix__prefix" aria-hidden="true">
          ₱
        </span>
        <input id={id} name={name} className="input input--num" inputMode="decimal" defaultValue={value} required aria-invalid={invalid || undefined} />
      </div>
    </div>
  );
}

function DateField({ id, name, value, min, max, label }: { id: string; name: string; value: string; min?: string; max: string; label: string }) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input id={id} name={name} type="date" className="input" defaultValue={value} min={min} max={max} required />
    </div>
  );
}

function Note({ id, value }: { id: string; value: string | null }) {
  return (
    <div className="field span-all">
      <label className="field__label" htmlFor={id}>
        Note <span className="optional">(optional)</span>
      </label>
      <input id={id} name="note" className="input" maxLength={200} defaultValue={value ?? ""} />
    </div>
  );
}

export type EditableExpense = {
  id: string;
  batch_id: string | null;
  category: string;
  amount_cents: number;
  spent_on: string;
  note: string | null;
};

/** batches: lets you move the expense to another batch or General; without it the batch stays. */
export function EditExpense({
  expense: e,
  batches,
  returnTo,
  today,
  earliest,
}: {
  expense: EditableExpense;
  batches?: { id: string; label: string }[];
  returnTo: string;
  today: string;
  earliest: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, onSubmit, pending] = useFormAction<RestockFormState>(updateExpense.bind(null, e.id), null);
  if (!open) return <EditButton onClick={() => setOpen(true)} label={`Edit ${e.note ?? e.category} expense`} />;
  const k = e.id.slice(0, 8);
  return (
    <Shell label="Edit expense" state={state} pending={pending} onSubmit={onSubmit} onCancel={() => setOpen(false)}>
      <input type="hidden" name="return_to" value={returnTo} />
      {batches ? (
        <div className="field span-all">
          <label className="field__label" htmlFor={`ee-batch-${k}`}>
            Charge to
          </label>
          <div className="select-wrap">
            <select id={`ee-batch-${k}`} name="batch_id" className="select" defaultValue={e.batch_id ?? ""}>
              <option value="">General (whole shop, not a batch)</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <input type="hidden" name="batch_id" value={e.batch_id ?? ""} />
      )}
      <div className="field">
        <label className="field__label" htmlFor={`ee-cat-${k}`}>
          For
        </label>
        <div className="select-wrap">
          <select id={`ee-cat-${k}`} name="category" className="select" defaultValue={e.category}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id === "other" ? "Other" : c.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Peso id={`ee-amt-${k}`} name="amount" label="Amount" value={centsToInput(e.amount_cents)} invalid={state?.field === "amount"} />
      <DateField id={`ee-date-${k}`} name="spent_on" label="Paid on" value={e.spent_on} min={earliest} max={today} />
      <Note id={`ee-note-${k}`} value={e.note} />
    </Shell>
  );
}

export function EditCapital({
  entry: c,
  today,
}: {
  entry: { id: string; amount_cents: number; put_in_on: string; note: string | null };
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, onSubmit, pending] = useFormAction<RestockFormState>(updateCapital.bind(null, c.id), null);
  if (!open) return <EditButton onClick={() => setOpen(true)} label="Edit this capital entry" />;
  const k = c.id.slice(0, 8);
  return (
    <Shell label="Edit capital" state={state} pending={pending} onSubmit={onSubmit} onCancel={() => setOpen(false)}>
      <Peso id={`ec-amt-${k}`} name="amount" label="Amount put in" value={centsToInput(Number(c.amount_cents))} invalid={state?.field === "amount"} />
      <DateField id={`ec-date-${k}`} name="put_in_on" label="Date" value={c.put_in_on} max={today} />
      <Note id={`ec-note-${k}`} value={c.note} />
    </Shell>
  );
}

export function EditRelease({
  release: r,
  max,
  split,
  today,
  earliest,
}: {
  release: { id: string; amount_cents: number; released_on: string; note: string | null };
  /** This distribution plus what's still safe to distribute. */
  max: number;
  split: { owner: number; manager: number };
  today: string;
  earliest: string;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(centsToInput(r.amount_cents));
  const [state, onSubmit, pending] = useFormAction<RestockFormState>(updateRelease.bind(null, r.id), null);
  if (!open) return <EditButton onClick={() => setOpen(true)} label="Edit this distribution" />;
  const k = r.id.slice(0, 8);
  const s = splitProfit(Math.max(0, toCents(amount) ?? 0), split.owner, split.manager);
  return (
    <Shell label="Edit distribution" state={state} pending={pending} onSubmit={onSubmit} onCancel={() => setOpen(false)}>
      <div className="field">
        <label className="field__label" htmlFor={`er-amt-${k}`}>
          Amount
        </label>
        <div className="input-affix">
          <span className="input-affix__prefix" aria-hidden="true">
            ₱
          </span>
          <input
            id={`er-amt-${k}`}
            name="amount"
            className="input input--num"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            aria-invalid={state?.field === "amount" || undefined}
          />
        </div>
        <p className="field__hint">
          Up to <Money cents={max} />. Owner gets <Money cents={s.owner} />, manager <Money cents={s.manager} />.
        </p>
      </div>
      <DateField id={`er-date-${k}`} name="released_on" label="Date paid out" value={r.released_on} min={earliest} max={today} />
      <Note id={`er-note-${k}`} value={r.note} />
    </Shell>
  );
}

export function BatchDetailsForm({
  batch: b,
  today,
  earliest,
}: {
  batch: { id: string; supplier: string | null; received_on: string; note: string | null };
  today: string;
  earliest: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, onSubmit, pending] = useFormAction<RestockFormState>(updateBatchDetails.bind(null, b.id), null);
  if (!open) {
    return (
      <button type="button" className="text-btn" onClick={() => setOpen(true)}>
        Edit supplier, date or note
      </button>
    );
  }
  return (
    <Shell label="Edit batch details" state={state} pending={pending} onSubmit={onSubmit} onCancel={() => setOpen(false)}>
      <div className="field">
        <label className="field__label" htmlFor="bd-supplier">
          Supplier <span className="optional">(optional)</span>
        </label>
        <input id="bd-supplier" name="supplier" className="input" maxLength={60} defaultValue={b.supplier ?? ""} />
      </div>
      <DateField id="bd-date" name="received_on" label="Arrived on" value={b.received_on} min={earliest} max={today} />
      <Note id="bd-note" value={b.note} />
    </Shell>
  );
}
