"use client";

// On a batch's page: add a product that was left off when it was received, or more pieces of one.
// Owners and managers.
import { useState } from "react";
import { addToBatch, type RestockFormState } from "@/app/(staff)/restock/actions";
import { Icon } from "@/components/Icon";
import { useFormAction } from "@/lib/use-form-action";

export type PickProduct = { id: string; label: string; category: string };

export function AddToBatchForm({ batchId, products }: { batchId: string; products: PickProduct[] }) {
  const [open, setOpen] = useState(false);
  const [state, onSubmit, pending] = useFormAction<RestockFormState>(addToBatch.bind(null, batchId), null);
  if (!open) {
    return (
      <div className="batch-add">
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => setOpen(true)}>
          <Icon name="plus" />
          Add a product to this batch
        </button>
      </div>
    );
  }
  const groups = new Map<string, PickProduct[]>();
  for (const p of products) groups.set(p.category, [...(groups.get(p.category) ?? []), p]);
  return (
    <form onSubmit={onSubmit} className="batch-add stack" aria-label="Add a product to this batch">
      <div className="form-grid form-grid--2">
        <div className="field span-all">
          <label className="field__label" htmlFor="atb-product">
            Product
          </label>
          <div className="select-wrap">
            <select id="atb-product" name="product_id" className="select" required defaultValue="" aria-invalid={state?.field === "product_id" || undefined}>
              <option value="" disabled>
                Pick a product…
              </option>
              {[...groups].map(([cat, list]) => (
                <optgroup key={cat} label={cat}>
                  {list.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="atb-qty">
            Pieces received
          </label>
          <div className="input-affix input-affix--suffix">
            <input id="atb-qty" name="qty" className="input input--num" inputMode="numeric" required aria-invalid={state?.field === "qty" || undefined} />
            <span className="input-affix__suffix">pcs</span>
          </div>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="atb-cost">
            Cost per piece <span className="optional">(optional)</span>
          </label>
          <div className="input-affix">
            <span className="input-affix__prefix" aria-hidden="true">
              ₱
            </span>
            <input id="atb-cost" name="unit_cost" className="input input--num" inputMode="decimal" aria-invalid={state?.field === "unit_cost" || undefined} />
          </div>
        </div>
      </div>
      <p className="t-sm muted">The pieces go on the shelf. Leave the cost empty to use the product&apos;s current cost.</p>
      {state?.error && (
        <p className="field__error" role="alert">
          <Icon name="alert" />
          {state.error}
        </p>
      )}
      <div className="btn-row">
        <button type="submit" className="btn btn--money btn--sm" aria-busy={pending || undefined} disabled={pending}>
          Add to batch
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}
