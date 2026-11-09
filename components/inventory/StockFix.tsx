"use client";

// Edit or remove one stock change (restock, count, opening stock, damaged / lost) entered by
// mistake. Owners and managers. Sales and voids are fixed from the sale instead.
import { useState } from "react";
import { editStockChange, removeStockChange, type ProductFormState } from "@/app/(staff)/inventory/actions";
import { Icon } from "@/components/Icon";
import { centsToInput } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";

export type FixableChange = {
  id: string;
  kind: "opening" | "restock" | "count" | "waste";
  delta: number;
  on_hand_after: number;
  unit_cost_cents: number | null;
};

const QTY_LABEL = {
  opening: "Pieces at the start",
  restock: "Pieces received",
  count: "On the shelf",
  waste: "Pieces lost",
} as const;

export function StockFix({ change, productId }: { change: FixableChange; productId: string }) {
  const [open, setOpen] = useState(false);
  const [state, onSubmit, pending] = useFormAction<ProductFormState>(editStockChange.bind(null, change.id, productId), null);
  // What the form asks for, from what was recorded.
  const qty = change.kind === "count" ? change.on_hand_after : Math.abs(change.delta);

  if (!open) {
    return (
      <button type="button" className="text-btn stock-fix__open" onClick={() => setOpen(true)} aria-expanded={false}>
        Fix
      </button>
    );
  }
  return (
    <div className="stock-fix">
      <form onSubmit={onSubmit} className="stock-fix__form" aria-label="Fix this stock change">
        <div className="field">
          <label className="field__label" htmlFor={`fix-${change.id}`}>
            {QTY_LABEL[change.kind]}
          </label>
          <div className="input-affix input-affix--suffix">
            <input
              id={`fix-${change.id}`}
              name="qty"
              className="input input--num"
              inputMode="numeric"
              defaultValue={qty}
              required
              aria-invalid={state?.field === "qty" || undefined}
            />
            <span className="input-affix__suffix">pcs</span>
          </div>
        </div>
        {change.kind === "restock" && (
          <div className="field">
            <label className="field__label" htmlFor={`fix-cost-${change.id}`}>
              Cost per piece
            </label>
            <div className="input-affix">
              <span className="input-affix__prefix" aria-hidden="true">
                ₱
              </span>
              <input
                id={`fix-cost-${change.id}`}
                name="unit_cost"
                className="input input--num"
                inputMode="decimal"
                defaultValue={change.unit_cost_cents === null ? "" : centsToInput(change.unit_cost_cents)}
                aria-invalid={state?.field === "unit_cost" || undefined}
              />
            </div>
          </div>
        )}
        {state?.error && (
          <p className="field__error" role="alert">
            <Icon name="alert" />
            {state.error}
          </p>
        )}
        <div className="btn-row">
          <button type="submit" className="btn btn--primary btn--sm" disabled={pending} aria-busy={pending || undefined}>
            Save fix
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </button>
        </div>
      </form>
      <form
        action={removeStockChange}
        onSubmit={(e) => {
          if (!confirm("Remove this stock change? The shelf count goes back to what it was without it.")) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={change.id} />
        <input type="hidden" name="product_id" value={productId} />
        <button type="submit" className="btn btn--danger-ghost btn--sm">
          <Icon name="trash" />
          Remove it
        </button>
      </form>
      <p className="t-sm muted">Later stock changes adjust to match. A later count stays as counted.</p>
    </div>
  );
}
