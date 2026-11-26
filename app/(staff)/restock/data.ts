// Data for the Restock tab, shared by its pages and actions. Owners and managers only (the
// database functions return nothing to anyone else).
import type { ServerSupabase } from "@/lib/auth";
import type { PaymentSource } from "@/lib/supplier-payments";
import { DEFAULT_PLAN, PACE_DAYS, leadTimes, planProduct, type Pace, type ProductPlan, type RestockPlan } from "@/lib/restock";

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
  /** Pieces held for customers: spoken for, so the plan only counts the rest. */
  reserved: number;
  plan: ProductPlan;
  lastSoldAt: string | null;
};

export async function loadReorderPlan(supabase: ServerSupabase) {
  const [products, pace, settings, costs, held, batches, lines] = await Promise.all([
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
    supabase.from("reservations").select("product_id, qty").eq("status", "active"),
    supabase.from("stock_batches").select("id, batch_no, supplier, ordered_on, received_on").order("batch_no", { ascending: false }),
    supabase.from("batch_order_lines").select("batch_id, product_id, qty"),
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
  const heldBy = new Map<string, number>();
  for (const r of (held.data ?? []) as { product_id: string; qty: number }[])
    heldBy.set(r.product_id, (heldBy.get(r.product_id) ?? 0) + r.qty);
  // Orders still on the way, and the pieces each product has coming.
  const allBatches = (batches.data ?? []) as OrderBatch[];
  const coming = allBatches.filter((b) => b.received_on === null);
  const comingIds = new Set(coming.map((b) => b.id));
  const onOrderBy = new Map<string, number>();
  const piecesBy = new Map<string, number>();
  for (const l of (lines.data ?? []) as { batch_id: string; product_id: string; qty: number }[])
    if (comingIds.has(l.batch_id)) {
      onOrderBy.set(l.product_id, (onOrderBy.get(l.product_id) ?? 0) + l.qty);
      piecesBy.set(l.batch_id, (piecesBy.get(l.batch_id) ?? 0) + l.qty);
    }
  type Row = Omit<RestockProduct, "plan" | "lastSoldAt" | "cost_cents" | "reserved">;
  const rows: RestockProduct[] = ((products.data ?? []) as Row[]).map((p) => ({
    ...p,
    cost_cents: costBy.get(p.id) ?? null,
    reserved: heldBy.get(p.id) ?? 0,
    plan: planProduct(p.on_hand - (heldBy.get(p.id) ?? 0), paceBy.get(p.id), plan, onOrderBy.get(p.id) ?? 0),
    lastSoldAt: paceBy.get(p.id)?.lastSoldAt ?? null,
  }));
  return {
    products: rows,
    plan,
    /** Orders on the way, oldest first. */
    onTheWay: [...coming].reverse().map((b) => ({ ...b, pieces: piecesBy.get(b.id) ?? 0 })),
    /** How long recent orders took to arrive. */
    lead: leadTimes(allBatches),
    // Without the orders, pieces already on the way would be suggested again.
    error: products.error ?? pace.error ?? batches.error ?? lines.error ?? null,
  };
}

type OrderBatch = { id: string; batch_no: number; supplier: string | null; ordered_on: string | null; received_on: string | null };

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
  /** Count corrections and losses recorded in this batch for the product (negative = fewer). */
  adjusted: number;
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
  /** The day it was ordered; null when it was only recorded on arrival. */
  ordered_on: string | null;
};

/** A batch still on the way: ordered, not arrived (no received date yet). */
export function onTheWay(b: Batch) {
  return b.id !== null && b.received_on === null;
}

/** A piece of an order still on the way (its pieces aren't on the shelf yet). */
export type OrderLine = {
  id: string;
  batch_id: string;
  product_id: string;
  qty: number;
  unit_cost_cents: number | null;
};

/** Money paid to the supplier for a batch, and whose money it was. */
export type BatchPayment = {
  id: string;
  batch_id: string;
  amount_cents: number;
  paid_on: string;
  source: PaymentSource;
  note: string | null;
};

/** Days from ordered to arrived (0 = the same day); null without both dates. */
export function orderGap(b: Pick<Batch, "ordered_on" | "received_on">) {
  if (!b.ordered_on || !b.received_on) return null;
  return Math.round((Date.parse(`${b.received_on}T00:00:00Z`) - Date.parse(`${b.ordered_on}T00:00:00Z`)) / 86_400_000);
}

/**
 * A batch's cost in full (goods + restocking fees) and what is paid: the pieces that came in, or for an order
 * still on the way the pieces ordered. Matches the database's batch_money().
 */
export function batchMoney(batch: Batch, rows: BatchRow[], lines: OrderLine[], payments: BatchPayment[]) {
  const fees = batch.shipping_cents + batch.tax_cents + batch.mooe_cents + batch.other_cents;
  const goods = onTheWay(batch)
    ? lines.reduce((n, l) => n + l.qty * (l.unit_cost_cents ?? 0), 0)
    : rows.reduce((n, r) => n + Number(r.received_cost_cents), 0);
  const cost = goods + fees;
  const paid = payments.reduce((n, p) => n + Number(p.amount_cents), 0);
  return { goods, fees, cost, paid, owed: cost - paid };
}

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
  ordered_on: null,
};

/** Pieces of a batch line still on the shelf: received − sold, after its counts and losses. */
export function piecesLeft(r: BatchRow) {
  return Math.max(0, r.received - r.sold + (r.adjusted ?? 0));
}

export type BatchTotals = {
  received: number;
  sold: number;
  /** Still on the shelf, after counts and losses. */
  left: number;
  /** Counts and losses (negative = fewer). */
  adjusted: number;
  sales: number;
  /** Gross profit, when every sold piece has a cost; null otherwise. */
  profit: number | null;
  /** Still owed on the pieces sold. */
  owed: number;
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
    left: rows.reduce((n, r) => n + piecesLeft(r), 0),
    adjusted: rows.reduce((n, r) => n + (r.adjusted ?? 0), 0),
    sales,
    profit: uncosted > 0 ? null : sales - cost,
    owed,
    firstIn,
    lastSoldAt,
  };
}

export type Expense = {
  id: string;
  batch_id: string | null;
  spent_on: string;
  category: string;
  amount_cents: number;
  note: string | null;
};

/** Every batch (newest first) with its rows; stock received outside a batch is the last entry (id null). */
export async function loadBatches(supabase: ServerSupabase) {
  const [batches, rows, expenses, lines, payments] = await Promise.all([
    supabase
      .from("stock_batches")
      .select(
        "id, batch_no, supplier, received_on, ordered_on, note, created_at, shipping_cents, tax_cents, mooe_cents, other_cents, other_label",
      )
      .order("batch_no", { ascending: false }),
    supabase.rpc("batch_sales"),
    supabase
      .from("expenses")
      .select("id, batch_id, spent_on, category, amount_cents, note")
      .order("spent_on", { ascending: false }),
    supabase.from("batch_order_lines").select("id, batch_id, product_id, qty, unit_cost_cents").order("created_at").order("id"),
    supabase
      .from("batch_payments")
      .select("id, batch_id, amount_cents, paid_on, source, note")
      .order("paid_on")
      .order("created_at"),
  ]);
  const all = (rows.data ?? []) as BatchRow[];
  const allLines = (lines.data ?? []) as OrderLine[];
  const allPayments = (payments.data ?? []) as BatchPayment[];
  const list = ((batches.data ?? []) as Batch[]).map((b) => {
    const mine = all.filter((r) => r.batch_id === b.id);
    const myLines = allLines.filter((l) => l.batch_id === b.id);
    const myPayments = allPayments.filter((p) => p.batch_id === b.id);
    return { batch: b, rows: mine, lines: myLines, payments: myPayments, money: batchMoney(b, mine, myLines, myPayments) };
  });
  const loose = all.filter((r) => r.batch_id === null);
  if (loose.length > 0) {
    list.push({ batch: NO_BATCH, rows: loose, lines: [], payments: [], money: batchMoney(NO_BATCH, loose, [], []) });
  }
  return {
    list,
    expenses: (expenses.data ?? []) as Expense[],
    // Expenses too: without them every batch's net profit, and the split of it, would read too high. Payments too:
    // without them every batch would read as owed to its supplier.
    error: batches.error ?? rows.error ?? expenses.error ?? lines.error ?? payments.error ?? null,
  };
}

export function batchTitle(b: Batch) {
  return b.batch_no === null ? "Stock before batches" : `Batch ${b.batch_no}`;
}

/** One batch's figures from batch_statements (centavos); batch_id null = stock from before batches. */
export type BatchStatementRow = {
  batch_id: string | null;
  received: number;
  sold: number;
  adjusted: number;
  left_pcs: number;
  uncosted: number;
  gross_cents: number;
  discount_cents: number;
  net_cents: number;
  cogs_goods_cents: number;
  cogs_fees_cents: number;
  count_diffs_cents: number;
  owed_cents: number;
  goods_cents: number;
  fees_cents: number;
  /** Everything of the batch still in stock at landed cost: ties out to Finance's inventory. */
  stock_cents: number;
  /** The pieces left, at today's prices and at landed cost (the same pieces in both). */
  left_value_cents: number;
  left_cost_cents: number;
};

/**
 * A batch's running profit and loss, counted as Finance counts it (when sold, at landed cost), so
 * the batches add up to Profit & loss.
 */
export type BatchStatement = {
  received: number;
  sold: number;
  left: number;
  /** Pieces sold that had no cost: the cost of goods is too low by those. */
  uncosted: number;
  gross: number;
  discounts: number;
  net: number;
  cogsGoods: number;
  cogsFees: number;
  grossProfit: number;
  /** The batch's own expenses, one by one (taxes paid are listed apart: they aren't an expense). */
  expenses: Expense[];
  expenseTotal: number;
  taxesPaid: Expense[];
  /** Counts and losses at landed cost (negative = pieces missing). */
  countDiffs: number;
  /** Percentage tax estimate on this batch's net sales. */
  tax: number;
  /** Net sales − cost of the pieces sold − expenses ± count differences − tax estimate. */
  netProfit: number;
  owed: number;
  /** Pieces left at today's prices, and what they cost (landed). */
  leftValue: number;
  leftCost: number;
  /** Net profit if the rest sells at today's prices. */
  whenSoldOut: number;
  /** What every piece received cost, and the batch's restocking fees. */
  goods: number;
  fees: number;
  /** Everything the batch cost in full: goods + restocking fees + expenses. */
  costInFull: number;
};

const NO_STATEMENT: BatchStatementRow = {
  batch_id: null,
  received: 0,
  sold: 0,
  adjusted: 0,
  left_pcs: 0,
  uncosted: 0,
  gross_cents: 0,
  discount_cents: 0,
  net_cents: 0,
  cogs_goods_cents: 0,
  cogs_fees_cents: 0,
  count_diffs_cents: 0,
  owed_cents: 0,
  goods_cents: 0,
  fees_cents: 0,
  stock_cents: 0,
  left_value_cents: 0,
  left_cost_cents: 0,
};

export function batchStatement(
  row: BatchStatementRow | undefined,
  batch: Batch,
  expenses: Expense[],
  taxRateBp: number,
): BatchStatement {
  const r = row ?? NO_STATEMENT;
  const mine = batch.id === null ? [] : expenses.filter((e) => e.batch_id === batch.id);
  const operating = mine.filter((e) => e.category !== "tax");
  const expenseTotal = operating.reduce((n, e) => n + e.amount_cents, 0);
  const net = Number(r.net_cents);
  const cogsGoods = Number(r.cogs_goods_cents);
  const cogsFees = Number(r.cogs_fees_cents);
  const countDiffs = Number(r.count_diffs_cents);
  const grossProfit = net - cogsGoods - cogsFees;
  const tax = Math.round((net * taxRateBp) / 10000);
  const netProfit = grossProfit - expenseTotal + countDiffs - tax;
  const leftValue = Number(r.left_value_cents);
  const leftCost = Number(r.left_cost_cents);
  return {
    received: r.received,
    sold: r.sold,
    left: r.left_pcs,
    uncosted: r.uncosted,
    gross: Number(r.gross_cents),
    discounts: Number(r.discount_cents),
    net,
    cogsGoods,
    cogsFees,
    grossProfit,
    expenses: operating,
    expenseTotal,
    taxesPaid: mine.filter((e) => e.category === "tax"),
    countDiffs,
    tax,
    netProfit,
    owed: Number(r.owed_cents),
    leftValue,
    leftCost,
    // Nothing left: selling out adds nothing more.
    whenSoldOut: r.left_pcs > 0 ? netProfit + leftValue - leftCost - Math.round((leftValue * taxRateBp) / 10000) : netProfit,
    goods: Number(r.goods_cents),
    fees: Number(r.fees_cents),
    costInFull: Number(r.goods_cents) + Number(r.fees_cents) + expenseTotal,
  };
}

/** Every batch's statement row, keyed by batch id ("" = stock from before batches). */
export async function loadBatchStatements(supabase: ServerSupabase) {
  const { data, error } = await supabase.rpc("batch_statements");
  const map = new Map<string, BatchStatementRow>();
  for (const r of (data ?? []) as BatchStatementRow[]) map.set(r.batch_id ?? "", r);
  return { statements: map, error };
}
