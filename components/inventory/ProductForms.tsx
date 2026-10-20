"use client";

// Product editor and stock change form (owners and managers).
import { useState } from "react";
import { adjustStock, saveProduct, type ProductFormState } from "@/app/(staff)/inventory/actions";
import { Icon } from "@/components/Icon";
import { useFormAction } from "@/lib/use-form-action";

export type ProductValues = {
  brand: string;
  name: string;
  variant: string;
  barcode: string;
  category_id: string;
  price: string;
  cost: string;
  reorder_at: string;
  active: boolean;
};

function FormError({ state }: { state: ProductFormState }) {
  if (!state?.error) return null;
  return (
    <p className="field__error" role="alert">
      <Icon name="alert" />
      {state.error}
    </p>
  );
}

export function ProductForm({
  id,
  initial,
  categories,
}: {
  id: string | null;
  initial: ProductValues;
  categories: { id: string; name: string }[];
}) {
  const [state, onSubmit, pending] = useFormAction(saveProduct.bind(null, id), null);
  const [category, setCategory] = useState(initial.category_id || (categories.length === 0 ? "__new" : ""));
  const bad = (f: string) => (state?.field === f ? true : undefined);

  return (
    <form onSubmit={onSubmit} className="card stack" aria-labelledby="product-form-t">
      <div className="card__head">
        <h2 className="card__title" id="product-form-t">
          {id ? "Product details" : "New product"}
        </h2>
      </div>
      <div className="form-grid form-grid--2">
        <div className="field">
          <label className="field__label" htmlFor="p-brand">
            Brand <span className="optional">(optional)</span>
          </label>
          <input id="p-brand" name="brand" className="input" defaultValue={initial.brand} maxLength={60} placeholder="Relx" />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="p-name">
            Product
          </label>
          <input
            id="p-name"
            name="name"
            className="input"
            defaultValue={initial.name}
            maxLength={80}
            required
            placeholder="Infinity Pod"
            aria-invalid={bad("name")}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="p-variant">
            Flavour / variant <span className="optional">(optional)</span>
          </label>
          <input
            id="p-variant"
            name="variant"
            className="input"
            defaultValue={initial.variant}
            maxLength={60}
            placeholder="Mint · 3% · Black"
            aria-describedby="p-variant-h"
          />
          <p className="field__hint" id="p-variant-h">
            Each flavour or colour is its own product, so its stock is counted on its own.
          </p>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="p-barcode">
            Barcode <span className="optional">(optional)</span>
          </label>
          <input
            id="p-barcode"
            name="barcode"
            className="input"
            defaultValue={initial.barcode}
            maxLength={40}
            autoComplete="off"
            inputMode="text"
            aria-invalid={bad("barcode")}
            aria-describedby="p-barcode-h"
          />
          <p className="field__hint" id="p-barcode-h">
            Tap here and scan the box to fill it in.
          </p>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="p-category">
            Category
          </label>
          <div className="select-wrap">
            <select
              id="p-category"
              name="category_id"
              className="select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-invalid={bad("category_id")}
            >
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="__new">+ New category…</option>
            </select>
          </div>
        </div>
        {category === "__new" ? (
          <div className="field">
            <label className="field__label" htmlFor="p-newcat">
              New category
            </label>
            <input
              id="p-newcat"
              name="new_category"
              className="input"
              maxLength={40}
              required
              placeholder="Pods, Devices, Juice, Accessories…"
              aria-invalid={bad("new_category")}
            />
          </div>
        ) : (
          <div className="hide-phone" />
        )}
        <div className="field">
          <label className="field__label" htmlFor="p-price">
            Selling price
          </label>
          <div className="input-affix">
            <span className="input-affix__prefix" aria-hidden="true">
              ₱
            </span>
            <input
              id="p-price"
              name="price"
              className="input input--num"
              inputMode="decimal"
              defaultValue={initial.price}
              required
              aria-invalid={bad("price")}
            />
          </div>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="p-cost">
            Cost per piece <span className="optional">(optional)</span>
          </label>
          <div className="input-affix">
            <span className="input-affix__prefix" aria-hidden="true">
              ₱
            </span>
            <input
              id="p-cost"
              name="cost"
              className="input input--num"
              inputMode="decimal"
              defaultValue={initial.cost}
              aria-invalid={bad("cost")}
              aria-describedby="p-cost-h"
            />
          </div>
          <p className="field__hint" id="p-cost-h">
            What you pay the supplier. Used for profit; staff never see it.
          </p>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="p-reorder">
            Low-stock alert at
          </label>
          <div className="input-affix input-affix--suffix">
            <input
              id="p-reorder"
              name="reorder_at"
              className="input input--num"
              inputMode="numeric"
              defaultValue={initial.reorder_at}
              aria-invalid={bad("reorder_at")}
            />
            <span className="input-affix__suffix">pcs</span>
          </div>
        </div>
        {id === null ? (
          <div className="field">
            <label className="field__label" htmlFor="p-open">
              Pieces on the shelf now
            </label>
            <div className="input-affix input-affix--suffix">
              <input
                id="p-open"
                name="opening_qty"
                className="input input--num"
                inputMode="numeric"
                defaultValue="0"
                aria-invalid={bad("opening_qty")}
              />
              <span className="input-affix__suffix">pcs</span>
            </div>
          </div>
        ) : (
          <label className="check-row" htmlFor="p-active">
            <input id="p-active" type="checkbox" className="check" name="active" value="true" defaultChecked={initial.active} />
            <span className="grow">
              <span className="check-row__title">For sale</span>
              <span className="t-sm muted">Untick to hide it from the register. Its history stays.</span>
            </span>
          </label>
        )}
      </div>
      <FormError state={state} />
      <div className="btn-row">
        <button type="submit" className="btn btn--primary" aria-busy={pending || undefined} disabled={pending}>
          {id ? "Save changes" : "Add product"}
        </button>
        {id === null && (
          <button type="submit" name="again" value="1" className="btn btn--secondary" disabled={pending}>
            Add and enter another
          </button>
        )}
      </div>
    </form>
  );
}

const KINDS = [
  { value: "restock", label: "Restock", hint: "Pieces received from the supplier. Added to what's on the shelf." },
  { value: "count", label: "Count", hint: "What's on the shelf right now. Replaces the current number." },
  { value: "waste", label: "Damaged / lost", hint: "Pieces that leaked, broke, expired or went missing. Taken off the shelf." },
] as const;

export function StockForm({ id }: { id: string }) {
  const [state, onSubmit, pending] = useFormAction(adjustStock.bind(null, id), null);
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("restock");
  const current = KINDS.find((k) => k.value === kind)!;
  return (
    <form onSubmit={onSubmit} className="card stack" aria-labelledby="stock-form-t">
      <div className="card__head">
        <h2 className="card__title" id="stock-form-t">
          Change stock
        </h2>
      </div>
      <input type="hidden" name="kind" value={kind} />
      <div className="segmented" role="radiogroup" aria-label="Kind of change">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            role="radio"
            className="segmented__option"
            aria-checked={kind === k.value}
            onClick={() => setKind(k.value)}
          >
            {k.label}
          </button>
        ))}
      </div>
      <p className="t-sm muted">{current.hint}</p>
      <div className="form-grid form-grid--2">
        <div className="field">
          <label className="field__label" htmlFor="stk-qty">
            {kind === "count" ? "On the shelf now" : kind === "restock" ? "Pieces received" : "Pieces lost"}
          </label>
          <div className="input-affix input-affix--suffix">
            <input
              id="stk-qty"
              name="qty"
              className="input input--num"
              inputMode="numeric"
              required
              aria-invalid={state?.field === "qty" || undefined}
            />
            <span className="input-affix__suffix">pcs</span>
          </div>
        </div>
        {kind === "restock" && (
          <div className="field">
            <label className="field__label" htmlFor="stk-cost">
              Cost per piece <span className="optional">(if it changed)</span>
            </label>
            <div className="input-affix">
              <span className="input-affix__prefix" aria-hidden="true">
                ₱
              </span>
              <input id="stk-cost" name="unit_cost" className="input input--num" inputMode="decimal" />
            </div>
          </div>
        )}
        <div className="field span-all">
          <label className="field__label" htmlFor="stk-note">
            Note <span className="optional">(optional)</span>
          </label>
          <input id="stk-note" name="note" className="input" maxLength={200} placeholder="Supplier, receipt no., reason…" />
        </div>
      </div>
      <FormError state={state} />
      <div className="btn-row">
        <button type="submit" className={`btn ${kind === "restock" ? "btn--money" : "btn--primary"}`} aria-busy={pending || undefined} disabled={pending}>
          Save {kind === "waste" ? "loss" : current.label.toLowerCase()}
        </button>
      </div>
    </form>
  );
}
