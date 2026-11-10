"use client";

// Owner: record money put into the business (not a sale, not profit).
import { useState } from "react";
import { addCapital, type RestockFormState } from "@/app/(staff)/restock/actions";
import { Icon } from "@/components/Icon";
import { useFormAction } from "@/lib/use-form-action";

export function CapitalForm({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  const [state, onSubmit, pending] = useFormAction<RestockFormState>(addCapital, null);
  if (!open) {
    return (
      <div>
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => setOpen(true)}>
          <Icon name="plus" />
          Record capital put in
        </button>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} className="stack" aria-label="Record capital put in">
      <div className="form-grid form-grid--2">
        <div className="field">
          <label className="field__label" htmlFor="cap-amount">
            Amount put in
          </label>
          <div className="input-affix">
            <span className="input-affix__prefix" aria-hidden="true">
              ₱
            </span>
            <input id="cap-amount" name="amount" className="input input--num" inputMode="decimal" required aria-invalid={state?.field === "amount" || undefined} />
          </div>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="cap-date">
            Date
          </label>
          <input id="cap-date" name="put_in_on" type="date" className="input" defaultValue={today} max={today} required />
        </div>
        <div className="field span-all">
          <label className="field__label" htmlFor="cap-note">
            Note <span className="optional">(optional)</span>
          </label>
          <input id="cap-note" name="note" className="input" maxLength={200} placeholder="e.g. Cash for the December order" />
        </div>
      </div>
      <p className="t-sm muted">Money the owners put into the business. It adds to cash and capital, never to sales or profit.</p>
      {state?.error && (
        <p className="field__error" role="alert">
          <Icon name="alert" />
          {state.error}
        </p>
      )}
      <div className="btn-row">
        <button type="submit" className="btn btn--primary btn--sm" disabled={pending} aria-busy={pending || undefined}>
          Save capital
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}
