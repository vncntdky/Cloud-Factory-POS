"use client";

// How a batch was paid: in full, part (a downpayment) or not yet, and whose money paid (company fund, owner's money,
// investment). Used when ordering, when receiving a delivery and on Arrived (paid on pick-up). Sends pay = full |
// part | none, pay_amount (pesos, for part) and pay_source.
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Money } from "@/components/Money";
import { toCents } from "@/lib/format";
import { PAYMENT_SOURCES, type PaymentSource } from "@/lib/supplier-payments";

type Pay = "full" | "part" | "none";
export type PayMode = "order" | "receive" | "pickup";

const LABELS: Record<PayMode, Record<Pay, { label: string; hint: string }>> = {
  order: {
    full: { label: "Paid in full", hint: "The whole order is paid now." },
    part: { label: "Downpayment", hint: "Part now, the rest on pick-up." },
    none: { label: "Cash on pick-up", hint: "Nothing paid yet: all of it is paid when you pick it up." },
  },
  receive: {
    full: { label: "Paid in full", hint: "All of it is paid." },
    part: { label: "Part paid", hint: "The rest stays owed to the supplier." },
    none: { label: "Not paid yet", hint: "All of it stays owed to the supplier." },
  },
  pickup: {
    full: { label: "Paid the rest", hint: "Everything still owed is paid on pick-up." },
    part: { label: "Paid part", hint: "The rest stays owed to the supplier." },
    none: { label: "Nothing now", hint: "What's still owed stays owed to the supplier." },
  },
};

export function PaymentFields({
  mode,
  total,
  invalid,
  idPrefix = "pay",
}: {
  mode: PayMode;
  /** What "in full" comes to (centavos), when known: the order's cost, or what's still owed on pick-up. */
  total: number | null;
  invalid?: string;
  idPrefix?: string;
}) {
  // On pick-up with pieces that have no cost, "the rest" can't be worked out: the amount paid is entered instead.
  const canFull = !(mode === "pickup" && total === null);
  const [pay, setPay] = useState<Pay>(!canFull ? "part" : mode === "pickup" && total !== null && total <= 0 ? "none" : "full");
  const [source, setSource] = useState<PaymentSource>("company");
  const [amount, setAmount] = useState("");
  const labels = LABELS[mode];
  const part = toCents(amount);
  const left = total === null ? null : pay === "full" ? 0 : pay === "none" ? total : part === null ? null : total - part;

  return (
    <div className="stack">
      <input type="hidden" name="pay" value={pay} />
      <fieldset className="fieldset">
        <legend className="field__label">{mode === "pickup" ? "Paid on pick-up" : "How it was paid"}</legend>
        <div className="choice-group" role="radiogroup" aria-label={mode === "pickup" ? "Paid on pick-up" : "How it was paid"}>
          {(["full", "part", "none"] as Pay[]).filter((p) => p !== "full" || canFull).map((p) => (
            <button key={p} type="button" className="choice" role="radio" aria-checked={pay === p} onClick={() => setPay(p)}>
              {labels[p].label}
            </button>
          ))}
        </div>
        <p className="field__hint">{labels[pay].hint}</p>
      </fieldset>

      {pay === "part" && (
        <div className="field">
          <label className="field__label" htmlFor={`${idPrefix}-amount`}>
            {mode === "order" ? "Downpayment" : "Amount paid"}
          </label>
          <div className="input-affix">
            <span className="input-affix__prefix" aria-hidden="true">
              ₱
            </span>
            <input
              id={`${idPrefix}-amount`}
              name="pay_amount"
              className="input input--num"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              aria-invalid={invalid === "pay_amount" || undefined}
            />
          </div>
        </div>
      )}

      {pay !== "none" && (
        <fieldset className="fieldset">
          <legend className="field__label">Whose money paid</legend>
          <input type="hidden" name="pay_source" value={source} />
          <div className="choice-group" role="radiogroup" aria-label="Whose money paid">
            {PAYMENT_SOURCES.map((s) => (
              <button key={s.id} type="button" className="choice" role="radio" aria-checked={source === s.id} onClick={() => setSource(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
          <p className="field__hint">
            {source === "company"
              ? "Comes out of the company fund (what sales brought in)."
              : "Counts as owner capital: money the owners put in, not taken from the company fund."}
          </p>
        </fieldset>
      )}

      {total === null && pay === "full" && mode !== "pickup" && (
        <p className="t-sm muted">Enter the cost per piece of every product, so the app knows what in full is.</p>
      )}
      {!canFull && (
        <p className="t-sm muted">Some pieces have no cost per piece, so enter the amount paid. Fix the costs on the batch page once it has arrived.</p>
      )}
      {total !== null && pay === "full" && (
        <p className="t-sm muted">
          <Money cents={total} /> paid {mode === "pickup" ? "on pick-up" : "now"}.
        </p>
      )}
      {total !== null && left !== null && pay !== "full" && (
        <p className={left < 0 ? "field__error" : "t-sm muted"} role={left < 0 ? "alert" : undefined}>
          {left < 0 ? (
            <>
              <Icon name="alert" />
              That&apos;s more than the <Money cents={total} /> {mode === "pickup" ? "still owed" : "it costs"}.
            </>
          ) : (
            <>
              <Money cents={left} /> {mode === "order" ? "to pay on pick-up" : "stays owed to the supplier"}.
            </>
          )}
        </p>
      )}
    </div>
  );
}
