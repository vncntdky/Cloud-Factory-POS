const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const amount0 = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const amount2 = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Num = number | string | null | undefined;

// Amounts are stored in centavos (₱175.00 = 17500).
export function money(cents: Num) {
  if (cents === null || cents === undefined) return "–";
  return peso.format(Number(cents) / 100);
}

export function percent(fraction: Num) {
  if (fraction === null || fraction === undefined) return "–";
  return `${(Number(fraction) * 100).toFixed(1)}%`;
}

export function qty(n: Num) {
  if (n === null || n === undefined) return "–";
  return Number(n).toLocaleString("en-PH", { maximumFractionDigits: 2 });
}

// ───────── Pesos display ─────────

/** "auto" drops .00 on whole pesos (lists: ₱175, ₱175.50); 2 always shows centavos (totals: ₱175.00). */
export type PesoDecimals = "auto" | 0 | 2;

/** The amount without the ₱ sign or minus: 1,640 · 175.50. Uses the absolute value. */
export function pesoAmount(cents: number | string, decimals: PesoDecimals = "auto") {
  const c = Math.abs(Math.round(Number(cents)));
  const d = decimals === "auto" ? (c % 100 === 0 ? 0 : 2) : decimals;
  return (d === 0 ? amount0 : amount2).format(c / 100);
}

/** Plain-text pesos: ₱1,640 · ₱175.50 · −₱50. "–" for null. For copy text, aria-labels, CSV. */
export function pesos(cents: Num, decimals: PesoDecimals = "auto") {
  if (cents === null || cents === undefined || cents === "" || Number.isNaN(Number(cents))) return "–";
  const n = Number(cents);
  return `${n < 0 ? "−" : ""}₱${pesoAmount(n, decimals)}`;
}

/** Totals and costing: always 2 decimals (₱360.00). */
export function pesos2(cents: Num) {
  return pesos(cents, 2);
}

/** "185.50" / "185" / "₱1,185.5" → centavos (18550). null when empty or not a valid amount. */
export function toCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? Math.round(input * 100) : null;
  const s = input.replace(/[₱,\s]/g, "").replace(/^php/i, "");
  if (s === "") return null;
  if (!/^-?\d*(\.\d{0,2})?$/.test(s) || s === "." || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Centavos → a value for a peso <input>: 18550 → "185.50", 5000 → "50". */
export function centsToInput(cents: Num) {
  if (cents === null || cents === undefined || cents === "") return "";
  const c = Math.round(Number(cents));
  return c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2);
}

/** Sale number as shown on receipts and lists: 7 → "#7". */
export function saleNo(n: number | string | null | undefined) {
  if (n === null || n === undefined) return "#–";
  return `#${n}`;
}

/** Avatar initials: first letters of the first and last words. */
export function initials(name: string | null | undefined) {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0] ?? "";
  const last = words.length > 1 ? words[words.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

// ───────── Label maps ─────────

export type PaymentMethod = "cash" | "gcash" | "maya" | "card" | "bank_transfer";

export const PAYMENT_METHODS: PaymentMethod[] = ["cash", "gcash", "maya", "card", "bank_transfer"];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  gcash: "GCash",
  maya: "Maya",
  card: "Card",
  bank_transfer: "Bank transfer",
};

export function paymentMethodLabel(m: string | null | undefined) {
  return m ? PAYMENT_METHOD_LABELS[m as PaymentMethod] ?? m : "";
}

/** "Relx Infinity Pod · Mint": how a product reads on the register, receipts and lists. */
export function productLabel(p: { brand?: string | null; name: string; variant?: string | null }) {
  const base = [p.brand?.trim(), p.name.trim()].filter(Boolean).join(" ");
  return p.variant?.trim() ? `${base} · ${p.variant.trim()}` : base;
}
