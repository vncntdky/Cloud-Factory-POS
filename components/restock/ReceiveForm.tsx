"use client";

// Order stock, or receive a delivery that is already here: one supplier order, with the pieces (and cost per piece)
// for each product, the restocking fees, and how it was paid. An order waits off the shelf until someone taps
// Arrived on its page; a delivery's pieces go on the shelf at once. Products left at 0 aren't in the batch.
// Owners and managers.
import { useMemo, useState } from "react";
import { orderBatch, receiveBatch, type RestockFormState } from "@/app/(staff)/restock/actions";
import { Icon } from "@/components/Icon";
import { Money } from "@/components/Money";
import { PaymentFields } from "@/components/restock/PaymentFields";
import { RestockCostFields } from "@/components/restock/RestockCostFields";
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
  /** Pieces already ordered and on the way. */
  on_order: number;
  category_id: string | null;
};

export function ReceiveForm({
  mode,
  products,
  prefill,
  today,
  earliest,
  categories,
}: {
  /** order: it waits on the way until Arrived; receive: it's here now. */
  mode: "order" | "receive";
  products: ReceiveProduct[];
  /** Start each product at its suggested order. */
  prefill: boolean;
  today: string;
  earliest: string;
  /** For the category chips: a long list is easier one category at a time. */
  categories: { id: string; name: string }[];
}) {
  const ordering = mode === "order";
  const [state, onSubmit, pending] = useFormAction<RestockFormState>(ordering ? orderBatch : receiveBatch, null);
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(products.map((p) => [p.id, prefill && p.suggest > 0 ? String(p.suggest) : ""])),
  );
  const [cost, setCost] = useState<Record<string, string>>(() =>
    Object.fromEntries(products.map((p) => [p.id, p.cost_cents === null ? "" : centsToInput(p.cost_cents)])),
  );
  const [filter, setFilter] = useState("");
  // "" = all; "none" = products without a category.
  const [category, setCategory] = useState("");
  const [extras, setExtras] = useState(0);
  const [showExtras, setShowExtras] = useState(false);

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
  // Only categories that have products here, in the shop's order; "No category" last if needed.
  const chips = [
    ...categories.filter((c) => products.some((p) => p.category_id === c.id)),
    ...(products.some((p) => !p.category_id) ? [{ id: "none", name: "No category" }] : []),
  ];
  const bad = (f: string) => (state?.field === f ? true : undefined);

  return (
    <form onSubmit={onSubmit} className="stack stack-6" aria-label={ordering ? "Order stock" : "Receive batch"}>
      <section className="card stack" aria-labelledby="batch-t">
        <div className="card__head">
          <h2 className="card__title" id="batch-t">
            {ordering ? "Order details" : "Batch details"}
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
              {ordering ? "Ordered on" : "Arrived on"}
            </label>
            <input
              id="b-date"
              name={ordering ? "ordered_on" : "received_on"}
              type="date"
              className="input"
              defaultValue={today}
              min={earliest}
              max={today}
              required
              aria-invalid={bad(ordering ? "ordered_on" : "received_on")}
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
            {ordering ? "Pieces ordered" : "Pieces received"}
          </h2>
          <span className="section-head__count num">
            {summary.lines} of {products.length}
          </span>
        </div>
        {chips.length > 1 && (
          <div className="filter-row" role="toolbar" aria-label="Category">
            {[{ id: "", name: "All" }, ...chips].map((c) => {
              const entered = products
                .filter((p) => c.id === "" || (p.category_id ?? "none") === c.id)
                .reduce((n, p) => n + (Number(qty[p.id]) > 0 ? Number(qty[p.id]) : 0), 0);
              return (
                <button
                  key={c.id || "all"}
                  type="button"
                  className="filter-chip"
                  aria-pressed={category === c.id}
                  onClick={() => setCategory(c.id)}
                >
                  {c.name}
                  {entered > 0 && <span className="count">{entered} pcs</span>}
                </button>
              );
            })}
          </div>
        )}
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
            const hidden =
              (category !== "" && (p.category_id ?? "none") !== category) ||
              (needle !== "" && !label.toLowerCase().includes(needle) && !qty[p.id]);
            return (
              <li key={p.id} className="receive-row" hidden={hidden}>
                <span className="receive-row__name">
                  <span className="list-row__title">
                    <span>{label}</span>
                  </span>
                  <span className="list-row__meta">
                    {p.on_hand} on the shelf{p.on_order > 0 && ` · ${p.on_order} on the way`}
                    {p.suggest > 0 && ` · suggested ${p.suggest}`}
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

      <section className="card stack" aria-labelledby="extras-t">
        <div className="row row--between">
          <h2 className="card__title" id="extras-t">
            Restock costs <span className="optional">(optional)</span>
          </h2>
          <button type="button" className="text-btn" aria-expanded={showExtras} onClick={() => setShowExtras((v) => !v)}>
            {showExtras ? "Hide" : extras > 0 ? "Edit" : "Add"}
          </button>
        </div>
        <p className="t-sm muted">
          Shipping, tax, MOOE and other costs on top of the goods. You can also add them later on the batch&apos;s page.
        </p>
        {/* Kept mounted while hidden so what was typed isn't lost. */}
        <div hidden={!showExtras && !["shipping", "tax", "mooe", "other"].includes(state?.field ?? "")}>
          <RestockCostFields invalid={state?.field} onChange={setExtras} />
        </div>
      </section>

      <section className="card stack" aria-labelledby="pay-t">
        <h2 className="card__title" id="pay-t">
          Payment
        </h2>
        <PaymentFields mode={mode} total={summary.pieces > 0 && summary.costed ? summary.value + extras : null} invalid={state?.field} />
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
                  <Money cents={summary.value + extras} /> with costs
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
              {ordering ? "Save order" : "Receive batch"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
