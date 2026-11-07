"use client";

// Edit a batch's restock costs (shipping, tax, MOOE, other) after it was received. Folded away
// until "Edit restock costs" is tapped.
import { useState } from "react";
import { saveBatchCosts, type RestockFormState } from "@/app/(staff)/restock/actions";
import { Icon } from "@/components/Icon";
import { RestockCostFields } from "@/components/restock/RestockCostFields";
import { useFormAction } from "@/lib/use-form-action";

export type BatchCosts = {
  shipping_cents: number;
  tax_cents: number;
  mooe_cents: number;
  other_cents: number;
  other_label: string | null;
};

export function BatchCostsForm({ id, batch }: { id: string; batch: BatchCosts }) {
  const [open, setOpen] = useState(false);
  const [state, onSubmit, pending] = useFormAction<RestockFormState>(saveBatchCosts.bind(null, id), null);
  if (!open) {
    return (
      <div>
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => setOpen(true)} aria-expanded={false}>
          <Icon name="edit" />
          Edit restock costs
        </button>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} className="stack" aria-label="Restock costs">
      <RestockCostFields initial={batch} invalid={state?.field} />
      {state?.error && (
        <p className="field__error" role="alert">
          <Icon name="alert" />
          {state.error}
        </p>
      )}
      <div className="btn-row">
        <button type="submit" className="btn btn--primary btn--sm" aria-busy={pending || undefined} disabled={pending}>
          Save costs
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}
