"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { voidSale, type VoidState } from "@/app/(staff)/sales/actions";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/Toaster";
import { useFormAction } from "@/lib/use-form-action";

/** Print button. With autoPrint (?print=1 from the register), opens the print dialog once. */
export function PrintButton({ autoPrint }: { autoPrint?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!autoPrint) return;
    const t = window.setTimeout(() => window.print(), 300);
    // Drop ?print=1 so a reload doesn't print again.
    router.replace(window.location.pathname, { scroll: false });
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <button type="button" className="btn btn--primary" onClick={() => window.print()}>
      <Icon name="printer" />
      Print receipt
    </button>
  );
}

/** Void with a reason, confirmed in a dialog. Owners and managers. */
export function VoidSale({ id, label }: { id: string; label: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [state, onSubmit, pending] = useFormAction<VoidState>(voidSale.bind(null, id), { error: null });

  useEffect(() => {
    if (state.done) {
      dialog.current?.close();
      toast(`${label} voided · stock put back`);
      router.refresh();
    }
  }, [state, label, router]);

  return (
    <>
      <button type="button" className="btn btn--danger-ghost" onClick={() => dialog.current?.showModal()}>
        <Icon name="undo" />
        Void sale
      </button>
      <dialog ref={dialog} className="dialog" role="alertdialog" aria-labelledby="void-title">
        <form onSubmit={onSubmit} className="dialog-form">
          <header className="sheet__head">
            <h2 className="sheet__title" id="void-title">
              Void {label}?
            </h2>
          </header>
          <div className="sheet__body stack stack-3">
            <p>The sale stays in the records as voided, its money comes off the totals, and the pieces go back into stock.</p>
            <div className="field">
              <label className="field__label" htmlFor="void-reason">
                Reason
              </label>
              <input
                id="void-reason"
                name="reason"
                className="input"
                required
                maxLength={200}
                placeholder="Wrong flavour rung up, customer returned it unopened…"
                aria-invalid={state.error ? true : undefined}
                aria-describedby={state.error ? "void-error" : undefined}
              />
              {state.error && (
                <p className="field__error" id="void-error" role="alert">
                  <Icon name="alert" />
                  {state.error}
                </p>
              )}
            </div>
          </div>
          <footer className="sheet__foot">
            <button type="button" className="btn btn--secondary" onClick={() => dialog.current?.close()}>
              Keep sale
            </button>
            <button type="submit" className="btn btn--danger" disabled={pending} aria-busy={pending || undefined}>
              {pending ? "Voiding…" : "Void sale"}
            </button>
          </footer>
        </form>
      </dialog>
    </>
  );
}
