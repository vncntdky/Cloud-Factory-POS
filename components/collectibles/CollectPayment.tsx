"use client";

// "Collect" on an unpaid sale: amount (the full balance by default, or part of it), how they paid,
// and the reference for GCash / Maya / card / bank. Opens in a dialog.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { recordPayment, type CollectState } from "@/app/(staff)/collectibles/actions";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/Toaster";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, centsToInput, pesos2, toCents, type PaymentMethod } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";

export function CollectPayment({
  saleId,
  buyer,
  label,
  balanceCents,
  size = "sm",
}: {
  saleId: string;
  buyer: string;
  /** "Sale #7 · Tue 27 Oct" */
  label: string;
  balanceCents: number;
  size?: "sm" | "md";
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [state, onSubmit, pending] = useFormAction<CollectState>(recordPayment.bind(null, saleId), { error: null });
  const [amount, setAmount] = useState(centsToInput(balanceCents));
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const cents = toCents(amount);
  const tooMuch = cents !== null && cents > balanceCents;

  useEffect(() => {
    if (!state.done) return;
    dialog.current?.close();
    toast(
      state.balanceCents
        ? `Collected ${pesos2(state.amountCents)} from ${buyer} · ${pesos2(state.balanceCents)} still owed`
        : `${buyer} paid in full`,
    );
    router.refresh();
  }, [state, buyer, router]);

  function open() {
    setAmount(centsToInput(balanceCents));
    setMethod("cash");
    dialog.current?.showModal();
  }

  return (
    <>
      <button type="button" className={`btn btn--money${size === "sm" ? " btn--sm" : ""}`} onClick={open}>
        <Icon name="wallet" />
        Collect
      </button>
      <dialog ref={dialog} className="dialog" aria-labelledby={`collect-t-${saleId}`}>
        <form onSubmit={onSubmit} className="dialog-form">
          <header className="sheet__head">
            <h2 className="sheet__title" id={`collect-t-${saleId}`}>
              Collect from {buyer}
            </h2>
          </header>
          <div className="sheet__body stack stack-4">
            <p className="t-sm muted">
              {label} · owes {pesos2(balanceCents)}
            </p>
            <input type="hidden" name="method" value={method} />
            <div className="field">
              <label className="field__label" htmlFor={`collect-amt-${saleId}`}>
                Amount received
              </label>
              <div className="input-affix">
                <span className="input-affix__prefix input-affix__prefix--lg">₱</span>
                <input
                  id={`collect-amt-${saleId}`}
                  name="amount"
                  className="input input--num"
                  inputMode="decimal"
                  enterKeyHint="done"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-invalid={tooMuch || undefined}
                  aria-describedby={`collect-amt-h-${saleId}`}
                />
              </div>
              <p className={tooMuch ? "field__error" : "field__hint"} id={`collect-amt-h-${saleId}`}>
                {tooMuch ? (
                  <>
                    <Icon name="alert" />
                    More than the {pesos2(balanceCents)} owed
                  </>
                ) : (
                  "Less than the full amount is fine; the rest stays owed."
                )}
              </p>
            </div>
            <fieldset className="fieldset">
              <legend className="eyebrow">Paid with</legend>
              <div className="choice-group" role="radiogroup" aria-label="Paid with">
                {PAYMENT_METHODS.map((m) => (
                  <button key={m} type="button" className="choice" role="radio" aria-checked={method === m} onClick={() => setMethod(m)}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </button>
                ))}
              </div>
            </fieldset>
            {method !== "cash" && (
              <div className="field">
                <label className="field__label" htmlFor={`collect-ref-${saleId}`}>
                  Reference no. <span className="optional">(optional)</span>
                </label>
                <input id={`collect-ref-${saleId}`} name="reference" className="input" autoComplete="off" maxLength={60} />
              </div>
            )}
            {state.error && (
              <p className="field__error" role="alert">
                <Icon name="alert" />
                {state.error}
              </p>
            )}
          </div>
          <footer className="sheet__foot">
            <button type="button" className="btn btn--secondary" onClick={() => dialog.current?.close()}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn--money"
              disabled={pending || tooMuch}
              aria-busy={pending || undefined}
            >
              {pending ? "Saving…" : `Record ${cents !== null && cents > 0 ? pesos2(cents) : "payment"}`}
            </button>
          </footer>
        </form>
      </dialog>
    </>
  );
}
