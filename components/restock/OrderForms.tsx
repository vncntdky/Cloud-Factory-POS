"use client";

// A batch's order and payments, on its page: Arrived (the day, the pieces that came, what was paid on pick-up),
// payments to the supplier (record, edit, remove), putting a batch back on the way, removing a cancelled order.
// Owners and managers; the database checks every rule again.
import { useState } from "react";
import {
  addBatchPayment,
  arriveBatch,
  deleteBatchPayment,
  deleteOrder,
  undoArrival,
  updateBatchPayment,
  type RestockFormState,
} from "@/app/(staff)/restock/actions";
import { Icon } from "@/components/Icon";
import { Money } from "@/components/Money";
import { PaymentFields } from "@/components/restock/PaymentFields";
import { centsToInput } from "@/lib/format";
import { PAYMENT_SOURCES, sourceLabel, type PaymentSource } from "@/lib/supplier-payments";
import { formatManilaDate } from "@/lib/time";
import { useFormAction } from "@/lib/use-form-action";

function ErrorLine({ state }: { state: RestockFormState }) {
  if (!state?.error) return null;
  return (
    <p className="field__error" role="alert">
      <Icon name="alert" />
      {state.error}
    </p>
  );
}

export type ArriveLine = { id: string; label: string; qty: number; unit_cost_cents: number | null };

/** Arrived: the day it came, the pieces that came for each ordered line, and what was paid on pick-up. */
export function ArriveForm({
  batchId,
  title,
  lines,
  owed,
  orderedOn,
  today,
}: {
  batchId: string;
  title: string;
  lines: ArriveLine[];
  /** Still owed on the order as ordered (cost in full − paid). */
  owed: number;
  orderedOn: string;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [came, setCame] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.id, String(l.qty)])));
  const [state, onSubmit, pending] = useFormAction<RestockFormState>(arriveBatch.bind(null, batchId), null);
  const pieces = lines.reduce((n, l) => n + (Number(came[l.id]) || 0), 0);
  // Pieces that didn't come aren't owed: what is owed goes down by their cost.
  const short = lines.reduce((n, l) => n + Math.max(0, l.qty - (Number(came[l.id]) || 0)) * (l.unit_cost_cents ?? 0), 0);
  const owedNow = owed - short;

  if (!open) {
    return (
      <div className="stack stack-2">
        <button type="button" className="btn btn--money btn--lg" onClick={() => setOpen(true)}>
          <Icon name="box" />
          Arrived
        </button>
        <p className="t-sm muted">Tap when the order comes in: its pieces go on the shelf and can be sold.</p>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} className="card stack" aria-label={`${title} arrived`}>
      <h2 className="card__title">{title} arrived</h2>
      <div className="field">
        <label className="field__label" htmlFor="arr-date">
          Arrived on
        </label>
        <input
          id="arr-date"
          name="received_on"
          type="date"
          className="input"
          defaultValue={today}
          min={orderedOn}
          max={today}
          required
          aria-invalid={state?.field === "received_on" || undefined}
        />
      </div>
      <fieldset className="fieldset">
        <legend className="field__label">Pieces that came</legend>
        <ul className="list list--plain" role="list">
          {lines.map((l) => (
            <li key={l.id} className="receive-row">
              <span className="receive-row__name">
                <span className="list-row__title">
                  <span>{l.label}</span>
                </span>
                <span className="list-row__meta">ordered {l.qty}</span>
              </span>
              <span className="input-affix input-affix--suffix receive-row__qty">
                <input
                  name={`arrived_${l.id}`}
                  className="input input--num"
                  inputMode="numeric"
                  value={came[l.id] ?? ""}
                  onChange={(e) => setCame((c) => ({ ...c, [l.id]: e.target.value }))}
                  aria-label={`Pieces of ${l.label} that came`}
                  aria-invalid={state?.field === `arrived_${l.id}` || undefined}
                />
                <span className="input-affix__suffix">pcs</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="field__hint">Change a number if fewer came; 0 if none did.</p>
      </fieldset>
      {owed > 0 && <PaymentFields mode="pickup" total={Math.max(0, owedNow)} invalid={state?.field} idPrefix="arr-pay" />}
      <ErrorLine state={state} />
      <div className="btn-row">
        <button type="submit" className="btn btn--money" disabled={pending || pieces === 0} aria-busy={pending || undefined}>
          Put {pieces} pcs on the shelf
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export type PaymentRow = { id: string; amount_cents: number; paid_on: string; source: PaymentSource; note: string | null };

function PaymentForm({
  label,
  action,
  initial,
  today,
  earliest,
  onCancel,
  submit,
}: {
  label: string;
  action: (prev: RestockFormState, fd: FormData) => Promise<RestockFormState>;
  initial: { amount: number | null; source: PaymentSource; paid_on: string; note: string | null };
  today: string;
  earliest: string;
  onCancel: () => void;
  submit: string;
}) {
  const [state, onSubmit, pending] = useFormAction<RestockFormState>(action, null);
  const [source, setSource] = useState<PaymentSource>(initial.source);
  const k = label.replace(/\W+/g, "-").toLowerCase();
  return (
    <form onSubmit={onSubmit} className="stack edit-form" aria-label={label}>
      <div className="form-grid form-grid--2">
        <div className="field">
          <label className="field__label" htmlFor={`${k}-amount`}>
            Amount paid
          </label>
          <div className="input-affix">
            <span className="input-affix__prefix" aria-hidden="true">
              ₱
            </span>
            <input
              id={`${k}-amount`}
              name="amount"
              className="input input--num"
              inputMode="decimal"
              defaultValue={initial.amount !== null && initial.amount > 0 ? centsToInput(initial.amount) : ""}
              required
              aria-invalid={state?.field === "amount" || undefined}
            />
          </div>
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${k}-date`}>
            Paid on
          </label>
          <input id={`${k}-date`} name="paid_on" type="date" className="input" defaultValue={initial.paid_on} min={earliest} max={today} required />
        </div>
        <fieldset className="fieldset span-all">
          <legend className="field__label">Whose money paid</legend>
          <input type="hidden" name="source" value={source} />
          <div className="choice-group" role="radiogroup" aria-label="Whose money paid">
            {PAYMENT_SOURCES.map((s) => (
              <button key={s.id} type="button" className="choice" role="radio" aria-checked={source === s.id} onClick={() => setSource(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
          <p className="field__hint">
            {source === "company" ? "Comes out of the company fund." : "Counts as owner capital, not taken from the company fund."}
          </p>
        </fieldset>
        <div className="field span-all">
          <label className="field__label" htmlFor={`${k}-note`}>
            Note <span className="optional">(optional)</span>
          </label>
          <input id={`${k}-note`} name="note" className="input" maxLength={200} defaultValue={initial.note ?? ""} placeholder="GCash ref., receipt no.…" />
        </div>
      </div>
      <ErrorLine state={state} />
      <div className="btn-row">
        <button type="submit" className="btn btn--primary btn--sm" disabled={pending} aria-busy={pending || undefined}>
          {submit}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function PaymentItem({ p, batchId, today, earliest }: { p: PaymentRow; batchId: string; today: string; earliest: string }) {
  const [editing, setEditing] = useState(false);
  const what = `${sourceLabel(p.source)} payment of ${centsToInput(p.amount_cents)} on ${formatManilaDate(p.paid_on)}`;
  return (
    <li className="list-row list-row--compact list-row--wrap">
      <span className="list-row__main">
        <span className="list-row__title">
          <span>{sourceLabel(p.source)}</span>
        </span>
        <span className="list-row__meta">
          {formatManilaDate(p.paid_on)}
          {p.note && ` · ${p.note}`}
        </span>
      </span>
      <span className="list-row__trail">
        <span className="num">
          <Money cents={p.amount_cents} />
        </span>
      </span>
      {!editing && (
        <button type="button" className="text-btn edit-open" onClick={() => setEditing(true)} aria-label={`Edit ${what}`}>
          Edit
        </button>
      )}
      {!editing && (
        <form action={deleteBatchPayment}>
          <input type="hidden" name="id" value={p.id} />
          <input type="hidden" name="batch_id" value={batchId} />
          <button type="submit" className="icon-btn" aria-label={`Remove ${what}`}>
            <Icon name="trash" />
          </button>
        </form>
      )}
      {editing && (
        <PaymentForm
          label="Edit payment"
          action={updateBatchPayment.bind(null, p.id, batchId)}
          initial={{ amount: p.amount_cents, source: p.source, paid_on: p.paid_on, note: p.note }}
          today={today}
          earliest={earliest}
          onCancel={() => setEditing(false)}
          submit="Save changes"
        />
      )}
    </li>
  );
}

/** What the batch cost in full, each payment to the supplier, and what is still to pay. */
export function BatchPayments({
  batchId,
  title,
  cost,
  goods,
  fees,
  paid,
  payments,
  onTheWay,
  today,
  earliest,
  flash,
}: {
  batchId: string;
  title: string;
  cost: number;
  goods: number;
  fees: number;
  paid: number;
  payments: PaymentRow[];
  onTheWay: boolean;
  today: string;
  earliest: string;
  flash?: string;
}) {
  const [adding, setAdding] = useState(false);
  const owed = cost - paid;
  return (
    <section className="card stack" id="payments" aria-labelledby="payments-t">
      <div className="card__head">
        <h2 className="card__title" id="payments-t">
          Paid to the supplier
        </h2>
        <span className="t-caption muted">
          <Money cents={paid} /> of <Money cents={cost} />
        </span>
      </div>
      {flash === "added" && <p className="t-sm notice-inline">Payment saved.</p>}
      {flash === "edited" && <p className="t-sm notice-inline">Payment updated.</p>}
      {flash === "removed" && <p className="t-sm notice-inline">Payment removed.</p>}
      {flash === "error" && (
        <p className="field__error" role="alert">
          <Icon name="alert" />
          Couldn&apos;t change that payment. Try again.
        </p>
      )}
      <p className="t-sm muted">
        {title} costs <Money cents={cost} /> in full: <Money cents={goods} /> of goods
        {fees > 0 && (
          <>
            {" "}
            + <Money cents={fees} /> restocking costs
          </>
        )}
        {onTheWay ? ", as ordered." : ", as it came."}
      </p>
      {payments.length === 0 ? (
        <p className="t-sm">Nothing paid yet.</p>
      ) : (
        <ul className="list list--plain" role="list">
          {payments.map((p) => (
            <PaymentItem key={p.id} p={p} batchId={batchId} today={today} earliest={earliest} />
          ))}
        </ul>
      )}
      <p className={owed > 0 ? "t-sm text-alert" : "t-sm"}>
        {owed > 0 ? (
          <>
            <strong>
              <Money cents={owed} />
            </strong>{" "}
            still to pay{onTheWay ? " (on pick-up, or before)" : ""}.
          </>
        ) : owed === 0 ? (
          "Paid in full."
        ) : (
          <>
            Paid <Money cents={-owed} /> more than it costs. Check the payments, or the pieces and costs.
          </>
        )}
      </p>
      {adding ? (
        <PaymentForm
          label="Record a payment"
          action={addBatchPayment.bind(null, batchId)}
          initial={{ amount: owed > 0 ? owed : null, source: "company", paid_on: today, note: null }}
          today={today}
          earliest={earliest}
          onCancel={() => setAdding(false)}
          submit="Save payment"
        />
      ) : (
        owed > 0 && (
          <div>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setAdding(true)}>
              <Icon name="plus" />
              Record a payment
            </button>
          </div>
        )
      )}
      <p className="t-sm muted">
        Owner&apos;s money and investment count as owner capital. Company fund payments come out of the business&apos;s cash on
        the day paid.
      </p>
    </section>
  );
}

/** Tapped Arrived by mistake: its pieces come off the shelf and it waits as an order again. */
export function UndoArrival({ batchId, title, pieces }: { batchId: string; title: string; pieces: number }) {
  const [open, setOpen] = useState(false);
  const [state, onSubmit, pending] = useFormAction<RestockFormState>(undoArrival.bind(null, batchId), null);
  if (!open) {
    return (
      <button type="button" className="text-btn" onClick={() => setOpen(true)}>
        Not here yet? Put it back on the way
      </button>
    );
  }
  return (
    <form onSubmit={onSubmit} className="stack stack-2 edit-form" aria-label={`Put ${title} back on the way`}>
      <p className="t-sm">
        {title}&apos;s {pieces} pcs come off the shelf and it waits as an order until you tap Arrived again. Its payments stay.
      </p>
      <ErrorLine state={state} />
      <div className="btn-row">
        <button type="submit" className="btn btn--danger btn--sm" disabled={pending} aria-busy={pending || undefined}>
          Put back on the way
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** An order that was cancelled: removed with its lines, once nothing is paid on it. */
export function DeleteOrder({ batchId, title, paid }: { batchId: string; title: string; paid: number }) {
  const [open, setOpen] = useState(false);
  const [state, onSubmit, pending] = useFormAction<RestockFormState>(deleteOrder.bind(null, batchId), null);
  if (!open) {
    return (
      <button type="button" className="text-btn" onClick={() => setOpen(true)}>
        Order cancelled? Remove it
      </button>
    );
  }
  return (
    <form onSubmit={onSubmit} className="stack stack-2 edit-form" aria-label={`Remove ${title}`}>
      <p className="t-sm">
        {paid > 0 ? (
          <>
            <Money cents={paid} /> is paid on {title}. If the supplier gave it back, remove the payments above first.
          </>
        ) : (
          <>{title} and what was ordered are removed. This can&apos;t be undone.</>
        )}
      </p>
      <ErrorLine state={state} />
      <div className="btn-row">
        <button type="submit" className="btn btn--danger btn--sm" disabled={pending || paid > 0} aria-busy={pending || undefined}>
          Remove {title}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}
