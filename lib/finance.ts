// Finance: the statements behind Sales → Finance, from finance_report (supabase/migrations/…_finance.sql).
// The database returns running totals at the end of the day before the period and at its last day;
// a period's figures are the difference, the balance is the end. Amounts in centavos.
import { addDays } from "@/lib/time";

export type FinTotals = {
  gross: number;
  discounts: number;
  net: number;
  sales: number;
  collected: number;
  collected_by_method: Record<string, number>;
  cogs: number;
  cogs_uncosted: number;
  count_diffs: number;
  opex: number;
  opex_by_category: Record<string, number>;
  tax_paid: number;
  tax_rate_bp: number;
  fund_goods: number;
  owner_goods: number;
  fund_fees: number;
  owner_fees: number;
  capital_cash: number;
  distributions: number;
  // derived
  tax: number;
  net_profit: number;
  cash: number;
  receivables: number;
  inventory: number;
  capital: number;
  tax_payable: number;
  retained: number;
};

/**
 * What the register should hold today: cash received and capital put in, less everything paid out
 * (taken as paid in cash, except payment fees, which come off the e-wallet or bank). Money that came
 * in by GCash, Maya, card or bank is elsewhere.
 */
export type RegisterNow = {
  cash_received: number;
  capital_cash: number;
  stock: number;
  fees: number;
  /** Operating expenses without payment fees. */
  expenses: number;
  payment_fees?: number;
  tax_paid: number;
  distributions: number;
  elsewhere: number;
  elsewhere_by_method: Record<string, number>;
  expected: number;
};

export type FinanceNow = {
  cash: number;
  retained: number;
  tax_reserve: number;
  inventory_reserve: number;
  spare_cash: number;
  safe_to_distribute: number;
  register?: RegisterNow;
};

export type FinanceReport = {
  from: string;
  to: string;
  start: FinTotals;
  end: FinTotals;
  now: FinanceNow;
  first_day: string | null;
  receivables: { sale_id: string; customer_name: string | null; cents: number; days: number }[];
};

const n = (v: unknown) => Number(v ?? 0);

function diffMap(a: Record<string, number>, b: Record<string, number>) {
  const out: Record<string, number> = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const v = n(b[k]) - n(a[k]);
    if (v !== 0) out[k] = v;
  }
  return out;
}

/** The period's profit and loss (accrual: counted when sold). */
export function profitAndLoss(r: FinanceReport) {
  const d = (k: keyof FinTotals) => n(r.end[k]) - n(r.start[k]);
  const net = d("net");
  const cogs = d("cogs");
  const grossProfit = net - cogs;
  const opexBy = diffMap(r.start.opex_by_category ?? {}, r.end.opex_by_category ?? {});
  const opex = d("opex");
  const countDiffs = d("count_diffs");
  const operating = grossProfit + countDiffs - opex;
  const tax = d("tax");
  const netProfit = d("net_profit");
  const pct = (x: number) => (net > 0 ? x / net : null);
  return {
    gross: d("gross"),
    discounts: d("discounts"),
    net,
    sales: d("sales"),
    cogs,
    cogsUncosted: d("cogs_uncosted"),
    grossProfit,
    grossMargin: pct(grossProfit),
    opexBy,
    opex,
    countDiffs,
    operating,
    operatingMargin: pct(operating),
    tax,
    taxRate: n(r.end.tax_rate_bp) / 10000,
    netProfit,
    netMargin: pct(netProfit),
  };
}

/** The period's cash flow (cash: counted when money moves). Opening + each line = closing. */
export function cashFlow(r: FinanceReport) {
  const d = (k: keyof FinTotals) => n(r.end[k]) - n(r.start[k]);
  const ownerStock = d("owner_goods") + d("owner_fees");
  return {
    opening: n(r.start.cash),
    capitalCash: d("capital_cash"),
    capitalStock: ownerStock,
    receipts: d("collected"),
    receiptsBy: diffMap(r.start.collected_by_method ?? {}, r.end.collected_by_method ?? {}),
    goods: d("fund_goods") + d("owner_goods"),
    fees: d("fund_fees") + d("owner_fees"),
    opex: d("opex"),
    taxPaid: d("tax_paid"),
    distributions: d("distributions"),
    closing: n(r.end.cash),
  };
}

/** What the business holds at the end of the period. Assets = owed + owners' share. */
export function balance(r: FinanceReport) {
  const e = r.end;
  const assets = n(e.cash) + n(e.receivables) + n(e.inventory);
  return {
    cash: n(e.cash),
    receivables: n(e.receivables),
    inventory: n(e.inventory),
    assets,
    taxPayable: n(e.tax_payable),
    capital: n(e.capital),
    capitalCash: n(e.capital_cash),
    capitalStock: n(e.owner_goods) + n(e.owner_fees),
    profitEarned: n(e.net_profit),
    distributions: n(e.distributions),
    retained: n(e.retained),
    ownersShare: n(e.capital) + n(e.retained),
  };
}

export function receivablesAging(r: FinanceReport) {
  const buckets = [
    { label: "0–7 days", min: 0, max: 7 },
    { label: "8–30 days", min: 8, max: 30 },
    { label: "Over 30 days", min: 31, max: Infinity },
  ];
  return buckets.map((b) => {
    const items = r.receivables.filter((x) => x.days >= b.min && x.days <= b.max);
    return { ...b, items, cents: items.reduce((s, x) => s + n(x.cents), 0) };
  });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/** Periods to pick from: since opening, then each month (newest first). */
export function periodOptions(firstDay: string | null, today: string) {
  const opts = [{ value: "all", label: "Since opening" }];
  if (!firstDay) return opts;
  let y = Number(today.slice(0, 4));
  let m = Number(today.slice(5, 7));
  const fy = Number(firstDay.slice(0, 4));
  const fm = Number(firstDay.slice(5, 7));
  while (y > fy || (y === fy && m >= fm)) {
    opts.push({ value: `${y}-${String(m).padStart(2, "0")}`, label: `${MONTHS[m - 1]} ${y}` });
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return opts;
}

/** The dates a period covers. A month that isn't over yet ends today. */
export function periodRange(value: string | undefined, firstDay: string | null, today: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (m) {
    const from = `${m[1]}-${m[2]}-01`;
    const next = Number(m[2]) === 12 ? `${Number(m[1]) + 1}-01-01` : `${m[1]}-${String(Number(m[2]) + 1).padStart(2, "0")}-01`;
    const last = addDays(next, -1);
    const to = last > today ? today : last;
    if (from <= today) return { value: value as string, from, to, label: `${MONTHS[Number(m[2]) - 1]} ${m[1]}` };
  }
  const from = firstDay && firstDay <= today ? firstDay : today;
  return { value: "all", from, to: today, label: "Since opening" };
}

export { day as formatDay };
