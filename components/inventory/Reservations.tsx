"use client";

// Reservations on a product's page (all staff): pieces held for a customer. Held pieces can't be
// sold to anyone else; "Sell" opens the register with the customer's pieces and name, and the
// reservation closes when that sale goes through.
import Link from "next/link";
import { useState } from "react";
import { cancelReservation, reserveProduct, type ProductFormState } from "@/app/(staff)/inventory/actions";
import { Icon } from "@/components/Icon";
import { useFormAction } from "@/lib/use-form-action";

export type Reservation = {
  id: string;
  customer_name: string;
  qty: number;
  note: string | null;
  hold_until: string | null;
  created_at: string;
};

export function Reservations({
  productId,
  free,
  reservations,
  today,
  dateLabel,
}: {
  productId: string;
  /** Pieces on the shelf not already held. */
  free: number;
  reservations: Reservation[];
  today: string;
  /** Formatted dates, by reservation id ("Hold until Fri 13 Nov"). */
  dateLabel: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [state, onSubmit, pending] = useFormAction<ProductFormState>(reserveProduct.bind(null, productId), null);
  const bad = (f: string) => (state?.field === f ? true : undefined);
  const held = reservations.reduce((n, r) => n + r.qty, 0);

  return (
    <section className="card stack" id="reservations" aria-labelledby="res-t">
      <div className="card__head">
        <h2 className="card__title" id="res-t">
          Reserved
        </h2>
        <span className="t-caption muted">
          {held > 0 ? `${held} held · ` : ""}
          {free} free to sell
        </span>
      </div>
      {reservations.length === 0 ? (
        <p className="t-sm muted">Nothing reserved. Hold pieces for a customer so they aren&apos;t sold to someone else.</p>
      ) : (
        <ul className="list list--plain" role="list">
          {reservations.map((r) => {
            const late = r.hold_until !== null && r.hold_until < today;
            return (
              <li key={r.id} className="list-row list-row--compact">
                <span className="list-row__main">
                  <span className="list-row__title">
                    <span>{r.customer_name}</span>
                    {late && <span className="chip chip--low">Past hold date</span>}
                  </span>
                  <span className="list-row__meta">
                    {r.qty} pc{r.qty === 1 ? "" : "s"}
                    {dateLabel[r.id] && ` · ${dateLabel[r.id]}`}
                    {r.note && ` · ${r.note}`}
                  </span>
                </span>
                <Link className="btn btn--money btn--sm" href={`/?reservation=${r.id}`}>
                  Sell
                </Link>
                <form
                  action={cancelReservation}
                  onSubmit={(e) => {
                    if (!confirm(`Cancel ${r.customer_name}'s reservation? The pieces are free to sell again.`))
                      e.preventDefault();
                  }}
                >
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="product_id" value={productId} />
                  <button type="submit" className="icon-btn" aria-label={`Cancel ${r.customer_name}'s reservation`}>
                    <Icon name="x" />
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
      {!open ? (
        <div>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => setOpen(true)} disabled={free <= 0}>
            <Icon name="plus" />
            Reserve
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="stack" aria-label="Reserve">
          <div className="form-grid form-grid--2">
            <div className="field">
              <label className="field__label" htmlFor="res-name">
                Customer
              </label>
              <input
                id="res-name"
                name="customer_name"
                className="input"
                maxLength={60}
                required
                autoComplete="off"
                aria-invalid={bad("customer_name")}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="res-qty">
                Pieces
              </label>
              <div className="input-affix input-affix--suffix">
                <input
                  id="res-qty"
                  name="qty"
                  className="input input--num"
                  inputMode="numeric"
                  defaultValue="1"
                  required
                  aria-invalid={bad("qty")}
                />
                <span className="input-affix__suffix">pcs</span>
              </div>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="res-until">
                Hold until <span className="optional">(optional)</span>
              </label>
              <input
                id="res-until"
                name="hold_until"
                type="date"
                className="input"
                min={today}
                aria-invalid={bad("hold_until")}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="res-note">
                Note <span className="optional">(optional)</span>
              </label>
              <input
                id="res-note"
                name="note"
                className="input"
                maxLength={200}
                placeholder="Paid deposit, will pick up after work…"
              />
            </div>
          </div>
          {state?.error && (
            <p className="field__error" role="alert">
              <Icon name="alert" />
              {state.error}
            </p>
          )}
          <div className="btn-row">
            <button type="submit" className="btn btn--primary btn--sm" disabled={pending} aria-busy={pending || undefined}>
              Reserve
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
