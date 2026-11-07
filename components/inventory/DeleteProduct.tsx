"use client";

// Delete a test product for good: its stock history, cost and photo, and optionally its sales.
// Owner only, confirmed in a dialog that says what goes.
import { useRef } from "react";
import { deleteProduct, type ProductFormState } from "@/app/(staff)/inventory/actions";
import { Icon } from "@/components/Icon";
import { Money } from "@/components/Money";
import { useFormAction } from "@/lib/use-form-action";

export type ProductUsage = {
  /** Stock history entries. */
  moves: number;
  /** Sales that include it, and how many of those also have other products. */
  sales: number;
  mixed: number;
  salesCents: number;
};

export function DeleteProduct({ id, label, usage }: { id: string; label: string; usage: ProductUsage }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, onSubmit, pending] = useFormAction<ProductFormState>(deleteProduct.bind(null, id), null);
  return (
    <section className="card stack" aria-labelledby="delete-t">
      <div className="card__head">
        <h2 className="card__title" id="delete-t">
          Delete product
        </h2>
      </div>
      <p className="t-sm muted">For test products. To stop selling a real one, untick “For sale” instead: its history stays.</p>
      <div>
        <button type="button" className="btn btn--danger-ghost" onClick={() => dialog.current?.showModal()}>
          <Icon name="trash" />
          Delete product
        </button>
      </div>
      <dialog ref={dialog} className="dialog" role="alertdialog" aria-labelledby="delete-product-title">
        <form onSubmit={onSubmit} className="dialog-form">
          <header className="sheet__head">
            <h2 className="sheet__title" id="delete-product-title">
              Delete {label}?
            </h2>
          </header>
          <div className="sheet__body stack stack-3">
            <p>
              It disappears from Inventory, the register, Restock and batch sales, with its {usage.moves} stock history{" "}
              {usage.moves === 1 ? "entry" : "entries"}, cost and photo. This can&apos;t be undone.
            </p>
            {usage.sales > 0 && (
              <label className="check-row" htmlFor="del-sales">
                <input id="del-sales" type="checkbox" className="check" name="with_sales" value="1" />
                <span className="grow">
                  <span className="check-row__title">
                    Also delete its {usage.sales} sale{usage.sales === 1 ? "" : "s"} (<Money cents={usage.salesCents} />)
                  </span>
                  <span className="t-sm muted">
                    {usage.mixed > 0
                      ? `${usage.mixed} of them also have other products: the whole sale goes and those pieces go back on the shelf. `
                      : ""}
                    Leave unticked to keep them in Sales under this name.
                  </span>
                </span>
              </label>
            )}
            {state?.error && (
              <p className="field__error" role="alert">
                <Icon name="alert" />
                {state.error}
              </p>
            )}
          </div>
          <footer className="sheet__foot">
            <button type="button" className="btn btn--secondary" onClick={() => dialog.current?.close()}>
              Keep product
            </button>
            <button type="submit" className="btn btn--danger" disabled={pending} aria-busy={pending || undefined}>
              {pending ? "Deleting…" : "Delete product"}
            </button>
          </footer>
        </form>
      </dialog>
    </section>
  );
}
