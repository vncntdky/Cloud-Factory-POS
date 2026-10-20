"use client";

// The register: tap or scan products into the cart, then Charge opens the checkout sheet
// (discount, payment, age check). Prices shown here are for the cashier; the database prices
// the sale again when it's completed.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { completeSale } from "@/app/(staff)/sell-actions";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { Money } from "@/components/Money";
import { toast } from "@/components/Toaster";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  centsToInput,
  pesos,
  pesos2,
  productLabel,
  toCents,
  type PaymentMethod,
} from "@/lib/format";

export type RegisterProduct = {
  id: string;
  brand: string | null;
  name: string;
  variant: string | null;
  barcode: string | null;
  price_cents: number;
  on_hand: number;
  category_id: string | null;
};

export type RegisterProps = {
  products: RegisterProduct[];
  categories: { id: string; name: string }[];
  minAge: number;
  /** null: no limit (owners and managers). */
  discountLimitCents: number | null;
  allowNegative: boolean;
  canEditProducts: boolean;
};

type Line = { id: string; qty: number };
type Done = { id: string; saleNumber: number; totalCents: number; changeCents: number | null; method: PaymentMethod };

const CART_KEY = "vp-cart";

function newRef() {
  return crypto.randomUUID();
}

/** Next round amounts a customer is likely to hand over for this total. */
function cashSuggestions(total: number) {
  const out = new Set<number>([total]);
  for (const step of [10000, 50000, 100000]) {
    const up = Math.ceil(total / step) * step;
    if (up > total) out.add(up);
  }
  return [...out].sort((a, b) => a - b).slice(0, 4);
}

export function Register({ products, categories, minAge, discountLimitCents, allowNegative, canEditProducts }: RegisterProps) {
  const router = useRouter();
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const byBarcode = useMemo(
    () => new Map(products.filter((p) => p.barcode).map((p) => [p.barcode!.toLowerCase(), p])),
    [products],
  );

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [category, setCategory] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [clientRef, setClientRef] = useState<string>("");

  const [discount, setDiscount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [tendered, setTendered] = useState("");
  const [reference, setReference] = useState("");
  const [ageOk, setAgeOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDialogElement>(null);
  const doneRef = useRef<HTMLDialogElement>(null);

  // The cart survives a reload (per device). Lines for products that are gone are dropped.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CART_KEY) ?? "null") as { ref?: string; lines?: Line[] } | null;
      if (saved?.lines?.length) setLines(saved.lines.filter((l) => byId.has(l.id) && l.qty > 0));
      setClientRef(saved?.ref || newRef());
    } catch {
      setClientRef(newRef());
    }
    // Only on first load: later product changes are reconciled at checkout by the database.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!clientRef) return;
    try {
      localStorage.setItem(CART_KEY, JSON.stringify({ ref: clientRef, lines }));
    } catch {
      /* storage blocked: the cart still works for this page */
    }
  }, [clientRef, lines]);

  const qtyOf = (id: string) => lines.find((l) => l.id === id)?.qty ?? 0;

  function add(p: RegisterProduct, n = 1) {
    const next = qtyOf(p.id) + n;
    if (!allowNegative && next > p.on_hand) {
      toast({ text: p.on_hand <= 0 ? `${productLabel(p)} is out of stock` : `Only ${p.on_hand} of ${productLabel(p)} in stock`, icon: "alert" });
      return false;
    }
    setLines((ls) => (ls.some((l) => l.id === p.id) ? ls.map((l) => (l.id === p.id ? { ...l, qty: next } : l)) : [...ls, { id: p.id, qty: next }]));
    setError(null);
    return true;
  }

  function setQty(id: string, qty: number) {
    if (qty <= 0) {
      setLines((ls) => ls.filter((l) => l.id !== id));
      return;
    }
    const p = byId.get(id);
    if (p && !allowNegative && qty > p.on_hand) {
      toast({ text: `Only ${p.on_hand} of ${productLabel(p)} in stock`, icon: "alert" });
      return;
    }
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, qty } : l)));
  }

  function clearCart() {
    setLines([]);
    setDiscount("");
    setTendered("");
    setReference("");
    setAgeOk(false);
    setMethod("cash");
    setError(null);
    setClientRef(newRef());
  }

  /** Enter in the search box: an exact barcode, or the only match, goes into the cart. */
  function onSearchSubmit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim().toLowerCase();
    if (!q) return;
    const hit = byBarcode.get(q) ?? (filtered.length === 1 ? filtered[0] : undefined);
    if (hit) {
      if (add(hit)) toast({ text: `Added ${productLabel(hit)}`, icon: "plus", duration: 1800 });
      setQuery("");
    } else if (filtered.length === 0) {
      toast({ text: `No product matches "${query.trim()}"`, icon: "alert" });
    }
  }

  // A barcode scanner types fast and ends with Enter. When focus isn't in a field, catch that
  // burst anywhere on the page so scanning works without tapping the search box first.
  useEffect(() => {
    let buf = "";
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector("dialog[open]")) return;
      const now = Date.now();
      if (now - last > 60) buf = "";
      last = now;
      if (e.key === "Enter") {
        if (buf.length >= 4) {
          const hit = byBarcode.get(buf.toLowerCase());
          if (hit) {
            if (add(hit)) toast({ text: `Added ${productLabel(hit)}`, icon: "plus", duration: 1800 });
          } else {
            toast({ text: `No product has barcode ${buf}`, icon: "alert" });
          }
          e.preventDefault();
        }
        buf = "";
      } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        buf += e.key;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (category && p.category_id !== category) return false;
      if (!q) return true;
      return (
        productLabel(p).toLowerCase().includes(q) || (p.barcode ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, deferredQuery, category]);

  const cart = lines
    .map((l) => ({ ...l, product: byId.get(l.id) }))
    .filter((l): l is Line & { product: RegisterProduct } => !!l.product);
  const pieces = cart.reduce((n, l) => n + l.qty, 0);
  const subtotal = cart.reduce((n, l) => n + l.qty * l.product.price_cents, 0);
  const discountCents = toCents(discount) ?? 0;
  const discountBad = discount.trim() !== "" && (toCents(discount) === null || discountCents < 0);
  const discountTooBig = discountCents > subtotal;
  const overLimit = discountLimitCents !== null && discountCents > discountLimitCents;
  const total = Math.max(0, subtotal - discountCents);
  const tenderedCents = method === "cash" ? (tendered.trim() === "" ? total : toCents(tendered)) : null;
  const cashShort = method === "cash" && (tenderedCents === null || tenderedCents < total);
  const change = method === "cash" && tenderedCents !== null ? tenderedCents - total : null;

  const blockedReason =
    cart.length === 0
      ? "Add an item first"
      : discountBad || discountTooBig
        ? "Fix the discount"
        : overLimit
          ? `Discounts over ${pesos(discountLimitCents)} need an owner or manager`
          : cashShort
            ? "Cash received is less than the total"
            : !ageOk
              ? `Confirm the customer is ${minAge}+`
              : null;

  function openCheckout() {
    if (cart.length === 0) return;
    setError(null);
    sheetRef.current?.showModal();
  }

  async function charge() {
    if (blockedReason || busy) return;
    setBusy(true);
    setError(null);
    const res = await completeSale({
      clientRef,
      items: cart.map((l) => ({ productId: l.id, quantity: l.qty })),
      discountCents,
      method,
      tenderedCents: method === "cash" ? tenderedCents : null,
      reference,
      ageVerified: ageOk,
    }).catch(() => ({ ok: false as const, error: "Couldn't reach the server. Check your connection and try again." }));
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    sheetRef.current?.close();
    setDone({ id: res.id, saleNumber: res.saleNumber, totalCents: res.totalCents, changeCents: res.changeCents, method });
    clearCart();
    router.refresh();
  }

  useEffect(() => {
    if (done) doneRef.current?.showModal();
  }, [done]);

  const cartList = (
    <ul className="cart-lines" role="list">
      {cart.map((l) => (
        <li key={l.id} className="cart-line">
          <div className="cart-line__main">
            <span className="cart-line__name">{productLabel(l.product)}</span>
            <span className="t-sm muted">
              <Money cents={l.product.price_cents} /> each
              {!allowNegative && l.qty >= l.product.on_hand && " · last in stock"}
            </span>
          </div>
          <div className="qty" role="group" aria-label={`Quantity of ${productLabel(l.product)}`}>
            <button type="button" className="qty__btn" aria-label={l.qty === 1 ? "Remove" : "One less"} onClick={() => setQty(l.id, l.qty - 1)}>
              <Icon name={l.qty === 1 ? "trash" : "minus"} />
            </button>
            <span className="qty__value" aria-live="polite">
              {l.qty}
            </span>
            <button type="button" className="qty__btn" aria-label="One more" onClick={() => setQty(l.id, l.qty + 1)}>
              <Icon name="plus" />
            </button>
          </div>
          <span className="cart-line__total">
            <Money cents={l.qty * l.product.price_cents} />
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="register">
      <div className="register__shop stack">
        <form className="search search--lg" role="search" onSubmit={onSearchSubmit}>
          <Icon name="search" className="search__icon" />
          <input
            ref={searchRef}
            className="input"
            type="search"
            placeholder="Scan a barcode or search products"
            aria-label="Scan or search products"
            autoComplete="off"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="search__clear" type="button" aria-label="Clear search" onClick={() => setQuery("")}>
              <Icon name="x" />
            </button>
          )}
          <kbd>/</kbd>
        </form>

        {categories.length > 0 && (
          <div className="filter-row" role="toolbar" aria-label="Category">
            <button type="button" className="filter-chip" aria-pressed={category === null} onClick={() => setCategory(null)}>
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className="filter-chip"
                aria-pressed={category === c.id}
                onClick={() => setCategory(category === c.id ? null : c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {products.length === 0 ? (
          <EmptyState
            title="No products yet."
            text={canEditProducts ? "Add what you sell, with prices and opening stock." : "Ask the owner or a manager to add products."}
            action={
              canEditProducts ? (
                <Link className="btn btn--money" href="/inventory/new">
                  <Icon name="plus" />
                  Add product
                </Link>
              ) : undefined
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            compact
            title="No matches."
            action={
              <button type="button" className="text-btn" onClick={() => { setQuery(""); setCategory(null); }}>
                Show all products
              </button>
            }
          />
        ) : (
          <div className="product-grid">
            {filtered.map((p) => {
              const q = qtyOf(p.id);
              const out = p.on_hand <= 0;
              const low = !out && p.on_hand <= 3;
              const soldOut = !allowNegative && q >= p.on_hand;
              return (
                <button
                  key={p.id}
                  type="button"
                  className="product-tile"
                  data-qty={q || undefined}
                  aria-disabled={soldOut || undefined}
                  aria-label={`${productLabel(p)}, ${pesos(p.price_cents)}, ${out ? "out of stock" : `${p.on_hand} in stock`}${q ? `, ${q} in cart` : ""}`}
                  onClick={() => add(p)}
                >
                  <span className="product-tile__text">
                    {p.brand && <span className="product-tile__brand">{p.brand}</span>}
                    <span className="item-name">{p.name}</span>
                    {p.variant && <span className="product-tile__variant">{p.variant}</span>}
                  </span>
                  <span className="product-tile__foot">
                    <span className="product-tile__price">
                      <Money cents={p.price_cents} />
                    </span>
                    <span className={`product-tile__stock${out ? " is-out" : low ? " is-low" : ""}`}>
                      {out ? "Out" : `${p.on_hand} left`}
                    </span>
                  </span>
                  <span className="product-tile__qty" aria-hidden="true">
                    {q}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Desktop: the cart sits beside the products. */}
      <aside className="register__cart card" aria-label="Cart">
        <div className="card__head">
          <h2 className="card__title">Cart</h2>
          {cart.length > 0 && (
            <button type="button" className="text-btn text-btn--danger" onClick={clearCart}>
              Clear
            </button>
          )}
        </div>
        <div className="card__body">
          {cart.length === 0 ? (
            <p className="t-sm muted">Tap or scan a product to start a sale.</p>
          ) : (
            cartList
          )}
        </div>
        <div className="card__foot stack stack-3">
          <dl className="dl">
            <dt>
              {pieces} {pieces === 1 ? "piece" : "pieces"}
            </dt>
            <dd>
              <Money cents={subtotal} decimals={2} />
            </dd>
          </dl>
          <button type="button" className="btn btn--money btn--lg btn--block" disabled={cart.length === 0} onClick={openCheckout}>
            Charge {pesos2(subtotal)}
          </button>
        </div>
      </aside>

      {/* Phone and tablet: total + Charge in the thumb zone. */}
      {cart.length > 0 && (
        <div className="actionbar register__bar">
          <div className="actionbar__inner">
            <div className="actionbar__total">
              <span className="eyebrow">
                {pieces} {pieces === 1 ? "piece" : "pieces"}
              </span>
              <span className="num-hero">
                <Money cents={subtotal} decimals={2} />
              </span>
            </div>
            <div className="actionbar__actions">
              <button type="button" className="btn btn--money btn--lg" onClick={openCheckout}>
                Charge
              </button>
            </div>
          </div>
        </div>
      )}

      <dialog
        ref={sheetRef}
        className="sheet sheet--wide"
        aria-labelledby="checkout-title"
        onClick={(e) => {
          if (e.target === e.currentTarget && !busy) e.currentTarget.close();
        }}
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <div className="sheet__handle" aria-hidden="true" />
        <header className="sheet__head">
          <h2 className="sheet__title" id="checkout-title">
            Checkout
          </h2>
          <button type="button" className="icon-btn" aria-label="Back to products" disabled={busy} onClick={() => sheetRef.current?.close()}>
            <Icon name="x" />
          </button>
        </header>
        <div className="sheet__body stack stack-6">
          {cart.length === 0 ? <p className="muted">The cart is empty.</p> : cartList}

          <div className="field">
            <label className="field__label" htmlFor="co-discount">
              Discount <span className="optional">(optional)</span>
            </label>
            <div className="input-affix">
              <span className="input-affix__prefix">₱</span>
              <input
                id="co-discount"
                className="input input--num"
                inputMode="decimal"
                enterKeyHint="done"
                placeholder="0"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                aria-invalid={discountBad || discountTooBig || overLimit || undefined}
                aria-describedby="co-discount-hint"
              />
            </div>
            {discountBad || discountTooBig || overLimit ? (
              <p className="field__error" id="co-discount-hint">
                <Icon name="alert" />
                {discountBad
                  ? "Enter an amount like 50 or 49.50"
                  : discountTooBig
                    ? "The discount can't be more than the subtotal"
                    : `Up to ${pesos(discountLimitCents)} without an owner or manager`}
              </p>
            ) : (
              <p className="field__hint" id="co-discount-hint">
                {discountLimitCents !== null ? `Up to ${pesos(discountLimitCents)}.` : "Pesos off the whole sale."}
              </p>
            )}
          </div>

          <fieldset className="fieldset">
            <legend className="eyebrow">Payment</legend>
            <div className="choice-group" role="radiogroup" aria-label="Payment method">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className="choice"
                  role="radio"
                  aria-checked={method === m}
                  onClick={() => setMethod(m)}
                >
                  {PAYMENT_METHOD_LABELS[m]}
                </button>
              ))}
            </div>
          </fieldset>

          {method === "cash" ? (
            <div className="field">
              <label className="field__label" htmlFor="co-cash">
                Cash received
              </label>
              <div className="input-affix">
                <span className="input-affix__prefix input-affix__prefix--lg">₱</span>
                <input
                  id="co-cash"
                  className="input input--num"
                  inputMode="decimal"
                  enterKeyHint="done"
                  placeholder={centsToInput(total)}
                  value={tendered}
                  onChange={(e) => setTendered(e.target.value)}
                  aria-invalid={cashShort || undefined}
                  aria-describedby="co-cash-hint"
                />
              </div>
              <div className="choice-group quick-cash" role="group" aria-label="Quick amounts">
                {cashSuggestions(total).map((c) => (
                  <button key={c} type="button" className="choice" aria-pressed={tenderedCents === c && tendered !== ""} onClick={() => setTendered(centsToInput(c))}>
                    {c === total ? "Exact" : pesos(c)}
                  </button>
                ))}
              </div>
              <p className={cashShort ? "field__error" : "change-due"} id="co-cash-hint" aria-live="polite">
                {cashShort ? (
                  <>
                    <Icon name="alert" />
                    Less than the total ({pesos2(total)})
                  </>
                ) : (
                  <>
                    Change <Money cents={change ?? 0} decimals={2} />
                  </>
                )}
              </p>
            </div>
          ) : (
            <div className="field">
              <label className="field__label" htmlFor="co-ref">
                Reference no. <span className="optional">(optional)</span>
              </label>
              <input
                id="co-ref"
                className="input"
                autoComplete="off"
                maxLength={60}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                aria-describedby="co-ref-hint"
              />
              <p className="field__hint" id="co-ref-hint">
                From the {PAYMENT_METHOD_LABELS[method]} receipt, to match it later.
              </p>
            </div>
          )}

          <label className={`age-check${ageOk ? " is-checked" : ""}`}>
            <input type="checkbox" className="check" checked={ageOk} onChange={(e) => setAgeOk(e.target.checked)} />
            <Icon name="id" />
            <span className="grow">
              <span className="age-check__title">Customer is {minAge} or older</span>
              <span className="t-sm muted">I checked a valid ID, or they look well over {minAge + 7}.</span>
            </span>
          </label>

          {error && (
            <div className="notice notice--danger" role="alert">
              <Icon name="alert" />
              <div>
                <p className="notice__title">Not charged.</p>
                <p>{error}</p>
              </div>
            </div>
          )}
        </div>
        <footer className="sheet__foot checkout-foot">
          <dl className="dl checkout-foot__totals">
            {discountCents > 0 && !discountBad && (
              <>
                <dt>Subtotal</dt>
                <dd>{pesos2(subtotal)}</dd>
                <dt>Discount</dt>
                <dd>−{pesos2(discountCents)}</dd>
              </>
            )}
            <dt className="dl__total">Total</dt>
            <dd className="dl__total">{pesos2(total)}</dd>
          </dl>
          <button
            type="button"
            className="btn btn--money btn--lg btn--block"
            aria-disabled={!!blockedReason || busy || undefined}
            aria-busy={busy || undefined}
            aria-describedby={blockedReason ? "co-blocked" : undefined}
            onClick={charge}
          >
            {busy ? "Charging…" : `Charge ${pesos2(total)}`}
          </button>
          {blockedReason && (
            <p className="field__hint checkout-foot__why" id="co-blocked">
              {blockedReason}
            </p>
          )}
        </footer>
      </dialog>

      <dialog
        ref={doneRef}
        className="dialog"
        aria-labelledby="done-title"
        onClose={() => {
          setDone(null);
          searchRef.current?.focus();
        }}
      >
        {done && (
          <>
            <header className="sheet__head">
              <h2 className="sheet__title" id="done-title">
                Sale #{done.saleNumber} done
              </h2>
            </header>
            <div className="sheet__body stack stack-3 sale-done">
              <Icon name="check" className="sale-done__icon" />
              {done.method === "cash" && done.changeCents !== null ? (
                <>
                  <span className="eyebrow">Change</span>
                  <span className="num-hero">
                    <Money cents={done.changeCents} decimals={2} />
                  </span>
                  <span className="t-sm muted">Total {pesos2(done.totalCents)} · Cash</span>
                </>
              ) : (
                <>
                  <span className="eyebrow">{PAYMENT_METHOD_LABELS[done.method]}</span>
                  <span className="num-hero">
                    <Money cents={done.totalCents} decimals={2} />
                  </span>
                </>
              )}
            </div>
            <footer className="sheet__foot">
              <Link className="btn btn--secondary" href={`/sales/${done.id}?print=1`}>
                <Icon name="printer" />
                Receipt
              </Link>
              <button type="button" className="btn btn--primary" autoFocus onClick={() => doneRef.current?.close()}>
                Next sale
              </button>
            </footer>
          </>
        )}
      </dialog>
    </div>
  );
}
