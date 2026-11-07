"use client";

// The reorder plan's three numbers: how long a batch takes to arrive, spare days, and how long
// each order should last. Folded away until "Change" is tapped.
import { useState } from "react";
import { saveRestockPlan, type RestockFormState } from "@/app/(staff)/restock/actions";
import { Icon } from "@/components/Icon";
import type { RestockPlan } from "@/lib/restock";
import { useFormAction } from "@/lib/use-form-action";

const FIELDS = [
  { name: "lead", label: "Batch arrives in", hint: "Days from ordering to stock on the shelf." },
  { name: "buffer", label: "Spare days", hint: "Extra in case a delivery is late or sales jump." },
  { name: "cover", label: "Each order lasts", hint: "How long a batch should keep you stocked." },
] as const;

export function PlanForm({ plan }: { plan: RestockPlan }) {
  const [open, setOpen] = useState(false);
  const [state, onSubmit, pending] = useFormAction<RestockFormState>(saveRestockPlan, null);

  if (!open) {
    return (
      <div>
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => setOpen(true)} aria-expanded={false}>
          <Icon name="edit" />
          Change these days
        </button>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} className="stack" aria-label="Reorder plan">
      <div className="form-grid form-grid--3">
        {FIELDS.map((f) => (
          <div className="field" key={f.name}>
            <label className="field__label" htmlFor={`plan-${f.name}`}>
              {f.label}
            </label>
            <div className="input-affix input-affix--suffix">
              <input
                id={`plan-${f.name}`}
                name={f.name}
                className="input input--num"
                inputMode="numeric"
                defaultValue={plan[f.name]}
                required
                aria-invalid={state?.field === f.name || undefined}
                aria-describedby={`plan-${f.name}-h`}
              />
              <span className="input-affix__suffix">days</span>
            </div>
            <p className="field__hint" id={`plan-${f.name}-h`}>
              {f.hint}
            </p>
          </div>
        ))}
      </div>
      {state?.error && (
        <p className="field__error" role="alert">
          <Icon name="alert" />
          {state.error}
        </p>
      )}
      <div className="btn-row">
        <button type="submit" className="btn btn--primary btn--sm" aria-busy={pending || undefined} disabled={pending}>
          Save plan
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}
