// Data for the Restock tab, shared by its pages and actions. Owners and managers only (the
// database functions return nothing to anyone else).
import type { ServerSupabase } from "@/lib/auth";
import { DEFAULT_PLAN, PACE_DAYS, planProduct, type Pace, type ProductPlan, type RestockPlan } from "@/lib/restock";

export type RestockProduct = {
  id: string;
  brand: string | null;
  name: string;
  variant: string | null;
  on_hand: number;
  reorder_at: number;
  category_id: string | null;
  photo_path: string | null;
  cost_cents: number | null;
  plan: ProductPlan;
  lastSoldAt: string | null;
};

export async function loadReorderPlan(supabase: ServerSupabase) {
  const [products, pace, settings, costs] = await Promise.all([
    supabase
      .from("products")
      .select("id, brand, name, variant, on_hand, reorder_at, category_id, photo_path")
      .eq("active", true)
      .order("brand", { nullsFirst: true })
      .order("name")
      .order("variant", { nullsFirst: true }),
    supabase.rpc("sales_pace", { p_days: PACE_DAYS }),
    supabase.from("settings").select("restock_lead_days, restock_buffer_days, restock_cover_days").maybeSingle(),
    supabase.from("product_costs").select("product_id, cost_cents"),
  ]);
  const s = settings.data as { restock_lead_days: number; restock_buffer_days: number; restock_cover_days: number } | null;
  const plan: RestockPlan = s
    ? { lead: s.restock_lead_days, buffer: s.restock_buffer_days, cover: s.restock_cover_days }
    : DEFAULT_PLAN;
  const paceBy = new Map(
    ((pace.data ?? []) as { product_id: string; sold: number; days: number; last_sold_at: string | null }[]).map((r) => [
      r.product_id,
      { sold: r.sold, days: Number(r.days), lastSoldAt: r.last_sold_at } satisfies Pace,
    ]),
  );
  const costBy = new Map(
    ((costs.data ?? []) as { product_id: string; cost_cents: number }[]).map((c) => [c.product_id, c.cost_cents]),
  );
  type Row = Omit<RestockProduct, "plan" | "lastSoldAt" | "cost_cents">;
  const rows: RestockProduct[] = ((products.data ?? []) as Row[]).map((p) => ({
    ...p,
    cost_cents: costBy.get(p.id) ?? null,
    plan: planProduct(p.on_hand, paceBy.get(p.id), plan),
    lastSoldAt: paceBy.get(p.id)?.lastSoldAt ?? null,
  }));
  return { products: rows, plan, error: products.error ?? pace.error ?? null };
}

export type BatchRow = {
  batch_id: string | null;
  product_id: string;
  received: number;
  sold: number;
  sales_cents: number;
  cost_cents: number;
  uncosted: number;
  /** Still unpaid ("Not paid yet" balances), shared across each sale's pieces. */
  owed_cents: number;
  /** What the pieces received cost; received_uncosted pieces had no cost. */
  received_cost_cents: number;
  received_uncosted: number;
  first_in: string;
  first_sold_at: string | null;
  last_sold_at: string | null;
};

export type Batch = {
  id: string | null;
  batch_no: number | null;
  supplier: string | null;
  received_on: string | null;
  note: string | null;
  created_at: string | null;
  shipping_cents: number;
  tax_cents: number;
  mooe_cents: number;
  other_cents: number;
  other_label: string | null;
};

const NO_BATCH: Batch = {
  id: null,
  batch_no: null,
  supplier: null,
  received_on: null,
  note: null,
  created_at: null,
  shipping_cents: 0,
  tax_cents: 0,
  mooe_cents: 0,
  other_cents: 0,
  other_label: null,
};

/** Shipping + tax + MOOE + other. */
export function restockCosts(b: Batch) {
  return b.shipping_cents + b.tax_cents + b.mooe_cents + b.other_cents;
}

export type BatchTotals = {
  received: number;
  sold: number;
  sales: number;
  /** Gross profit, when every sold piece has a cost; null otherwise. */
  profit: number | null;
  /** Still owed on the pieces sold. */
  owed: number;
  /** What the pieces cost; null when some had no cost. */
  goodsCost: number | null;
  firstIn: string;
  lastSoldAt: string | null;
};

export function totals(rows: BatchRow[]): BatchTotals {
  const received = rows.reduce((n, r) => n + r.received, 0);
  const sold = rows.reduce((n, r) => n + r.sold, 0);
  const sales = rows.reduce((n, r) => n + Number(r.sales_cents), 0);
  const cost = rows.reduce((n, r) => n + Number(r.cost_cents), 0);
  const uncosted = rows.reduce((n, r) => n + r.uncosted, 0);
  const owed = rows.reduce((n, r) => n + Number(r.owed_cents), 0);
  const goods = rows.reduce((n, r) => n + Number(r.received_cost_cents), 0);
  const goodsUncosted = rows.reduce((n, r) => n + r.received_uncosted, 0);
  const firstIn = rows.map((r) => r.first_in).sort()[0] ?? "";
  const lastSoldAt =
    rows
      .map((r) => r.last_sold_at)
      .filter((d): d is string => !!d)
      .sort()
      .at(-1) ?? null;
  return {
    received,
    sold,
    sales,
    profit: uncosted > 0 ? null : sales - cost,
    owed,
    goodsCost: goodsUncosted > 0 ? null : goods,
    firstIn,
    lastSoldAt,
  };
}

/** Every batch (newest first) with its rows; stock received outside a batch is the last entry (id null). */
export type Expense = {
  id: string;
  batch_id: string | null;
  spent_on: string;
  category: string;
  amount_cents: number;
  note: string | null;
};

export type BatchPnl = {
  sales: number;
  /** What the pieces cost; null when some had no cost. */
  goods: number | null;
  restock: number;
  expenses: number;
  expensesBy: Map<string, number>;
  /** Goods + restock costs + expenses; null when goods cost is unknown. */
  totalCost: number | null;
  /** Sales so far minus every cost of the batch (negative while it's still paying for itself). */
  net: number | null;
  /** Pieces not sold yet, at today's prices. */
  remainingValue: number;
  /** Net if the rest sells at today's prices. */
  projected: number | null;
};

/**
 * A batch's P&L: everything it cost (goods, restock costs, expenses) charged in full against what
 * its pieces have sold for so far, plus what's left on the shelf at today's prices.
 */
export function batchPnl(batch: Batch, rows: BatchRow[], expenses: Expense[], prices: Map<string, number>): BatchPnl {
  const t = totals(rows);
  const mine = batch.id === null ? [] : expenses.filter((e) => e.batch_id === batch.id);
  const expensesBy = new Map<string, number>();
  for (const e of mine) expensesBy.set(e.category, (expensesBy.get(e.category) ?? 0) + e.amount_cents);
  const expenseTotal = mine.reduce((n, e) => n + e.amount_cents, 0);
  const restock = restockCosts(batch);
  const totalCost = t.goodsCost === null ? null : t.goodsCost + restock + expenseTotal;
  const remainingValue = rows.reduce((n, r) => n + Math.max(0, r.received - r.sold) * (prices.get(r.product_id) ?? 0), 0);
  const net = totalCost === null ? null : t.sales - totalCost;
  return {
    sales: t.sales,
    goods: t.goodsCost,
    restock,
    expenses: expenseTotal,
    expensesBy,
    totalCost,
    net,
    remainingValue,
    projected: net === null ? null : net + remainingValue,
  };
}

export async function loadBatches(supabase: ServerSupabase) {
  const [batches, rows, expenses, prices] = await Promise.all([
    supabase
      .from("stock_batches")
      .select(
        "id, batch_no, supplier, received_on, note, created_at, shipping_cents, tax_cents, mooe_cents, other_cents, other_label",
      )
      .order("batch_no", { ascending: false }),
    supabase.rpc("batch_sales"),
    supabase
      .from("expenses")
      .select("id, batch_id, spent_on, category, amount_cents, note")
      .order("spent_on", { ascending: false }),
    supabase.from("products").select("id, price_cents"),
  ]);
  const all = (rows.data ?? []) as BatchRow[];
  const list = ((batches.data ?? []) as Batch[]).map((b) => ({ batch: b, rows: all.filter((r) => r.batch_id === b.id) }));
  const loose = all.filter((r) => r.batch_id === null);
  if (loose.length > 0) {
    list.push({ batch: NO_BATCH, rows: loose });
  }
  return {
    list,
    expenses: (expenses.data ?? []) as Expense[],
    prices: new Map(((prices.data ?? []) as { id: string; price_cents: number }[]).map((p) => [p.id, p.price_cents])),
    error: batches.error ?? rows.error ?? null,
  };
}

export function batchTitle(b: Batch) {
  return b.batch_no === null ? "Stock before batches" : `Batch ${b.batch_no}`;
}
