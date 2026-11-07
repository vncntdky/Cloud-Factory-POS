"use client";

// Receive a batch: one supplier delivery, with the pieces (and cost per piece) for each product.
// Products left at 0 aren't in the batch. Owners and managers.
import { useMemo, useState } from "react";
import { receiveBatch, type RestockFormState } from "@/app/(staff)/restock/actions";
import { Icon } from "@/components/Icon";
import { Money } from "@/components/Money";
import { centsToInput, productLabel, toCents } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";

export type ReceiveProduct = {
  id: string;
  brand: string | null;
  name: string;
  variant: string | null;
  on_hand: number;
  cost_cents: number | null;
  suggest: number;
};

export function ReceiveForm({
  products,
  prefill,
  today,
  earliest,
}: {
  products: ReceiveProduct[];
  /** Start each product at its suggested order. */
  prefill: boolean;
  today: string;
  earliest: string;
}) {
  const [state, onSubmit, pending] = useFormAction<RestockFormState>(receiveBatch, null);
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(products.map((p) => [p.id, prefill && p.suggest > 0 ? String(p.suggest) : ""])),
  );
  const [cost, setCost] = useState<Record<string, string>>(() =>
    Object.fromEntries(products.map((p) => [p.id, p.cost_cents === null ? "" : centsToInput(p.cost_cents)])),
  );
  const [filter, setFilter] = useState("");

  const summary = useMemo(() => {
    let pieces = 0;
    let lines = 0;
    let value = 0;
    let costed = true;
    for (const p of products) {
      const n = Number(qty[p.id]);
      if (!Number.isInteger(n) || n <= 0) continue;
      pieces += n;
      lines += 1;
      const c = toCents(cost[p.id] ?? "");
      if (c === null) costed = false;
      else value += n * c;
    }
    return { pieces, lines, value, costed };
  }, [products, qty, cost]);

  const needle = filter.trim().toLowerCase();
  const bad = (f: string) => (state?.field === f ? true : undefined);

  return (
    <form onSubmit={onSubmit} className="stack stack-6" aria-label="Receive batch">
      <section className="card stack" aria-labelledby="batch-t">
        <div className="card__head">
          <h2 className="card__title" id="batch-t">
            Batch details
          </h2>
        </div>
        <div className="form-grid form-grid--2">
          <div className="field">
            <label className="field__label" htmlFor="b-supplier">
              Supplier <span className="optional">(optional)</span>
            </label>
            <input id="b-supplier" name="supplier" className="input" maxLength={60} autoComplete="off" />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="b-date">
              Arrived on
            </label>
            <input
              id="b-date"
              name="received_on"
              type="date"
              className="input"
              defaultValue={today}
              min={earliest}
              max={today}
              required
              aria-invalid={bad("received_on")}
            />
          </div>
          <div className="field span-all">
            <label className="field__label" htmlFor="b-note">
              Note <span className="optional">(optional)</span>
            </label>
            <input
              id="b-note"
              name="note"
              className="input"
              maxLength={200}
              placeholder="Order no., receipt no., anything missing…"
            />
          </div>
        </div>
      </section>

      <section className="stack stack-2" aria-labelledby="items-t">
        <div className="section-head">
          <h2 className="eyebrow" id="items-t">
            Pieces received
          </h2>
          <span className="section-head__count num">
            {summary.lines} of {products.length}
          </span>
        </div>
        {products.length > 8 && (
          <div className="search">
            <Icon name="search" className="search__icon" />
            <input
              className="input"
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Find a product"
              aria-label="Find a product"
              autoComplete="off"
            />
          </div>
        )}
        <ul className="list" role="list">
          {products.map((p) => {
            const label = productLabel(p);
            const hidden = needle !== "" && !label.toLowerCase().includes(needle) && !qty[p.id];
            return (
              <li key={p.id} className="receive-row" hidden={hidden}>
                <span className="receive-row__name">
                  <span className="list-row__title">
                    <span>{label}</span>
                  </span>
                  <span className="list-row__meta">
                    {p.on_hand} on the shelf{p.suggest > 0 && ` · suggested ${p.suggest}`}
                  </span>
                </span>
                <span className="input-affix input-affix--suffix receive-row__qty">
                  <input
                    name={`qty_${p.id}`}
                    className="input input--num"
                    inputMode="numeric"
                    placeholder="0"
                    value={qty[p.id] ?? ""}
                    onChange={(e) => setQty((q) => ({ ...q, [p.id]: e.target.value }))}
                    aria-label={`Pieces of ${label}`}
                    aria-invalid={bad(`qty_${p.id}`)}
                  />
                  <span className="input-affix__suffix">pcs</span>
                </span>
                <span className="input-affix receive-row__cost">
                  <span className="input-affix__prefix" aria-hidden="true">
                    ₱
                  </span>
                  <input
                    name={`cost_${p.id}`}
                    className="input input--num"
                    inputMode="decimal"
                    placeholder="cost"
                    value={cost[p.id] ?? ""}
                    onChange={(e) => setCost((c) => ({ ...c, [p.id]: e.target.value }))}
                    aria-label={`Cost per piece of ${label}`}
                    aria-invalid={bad(`cost_${p.id}`)}
                  />
                </span>
              </li>
            );
          })}
        </ul>
        <p className="t-sm muted">Cost is per piece. A new cost replaces the product&apos;s cost from now on.</p>
      </section>

      {state?.error && (
        <p className="field__error" role="alert">
          <Icon name="alert" />
          {state.error}
        </p>
      )}

      <div className="actionbar">
        <div className="actionbar__inner">
          <div className="actionbar__total">
            <span className="num-hero num">{summary.pieces} pcs</span>
            <span className="actionbar__meta">
              {summary.lines} product{summary.lines === 1 ? "" : "s"}
              {summary.pieces > 0 && summary.costed && (
                <>
                  {" · "}
                  <Money cents={summary.value} /> at cost
                </>
              )}
            </span>
          </div>
          <div className="actionbar__actions">
            <button
              type="submit"
              className="btn btn--money btn--lg"
              disabled={pending || summary.pieces === 0}
              aria-busy={pending || undefined}
            >
              Receive batch
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
