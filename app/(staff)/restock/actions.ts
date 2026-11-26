"use server";

// Restock tab: the reorder plan settings, applying suggested reorder points as low-stock alerts, ordering stock,
// receiving a batch, Arrived, and payments to suppliers. Owners and managers; the database functions check the
// role too.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveStaff } from "@/lib/auth";
import { friendlyError, type DbError } from "@/lib/db-errors";
import { toCents } from "@/lib/format";
import { UUID_RE } from "@/lib/ids";
import { can } from "@/lib/permissions";
import { EXPENSE_CATEGORIES } from "@/lib/pnl";
import { COST_FIELDS } from "@/lib/restock";
import { isIsoDate } from "@/lib/time";
import { loadReorderPlan } from "./data";

export type RestockFormState = { error: string; field?: string } | null;

async function manager() {
  try {
    const staff = await requireActiveStaff();
    if (!can(staff.profile, "editStock")) return { error: "Only owners and managers can restock." };
    return staff;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sign in again." };
  }
}

function days(fd: FormData, key: string) {
  const raw = String(fd.get(key) ?? "").trim();
  return /^\d{1,3}$/.test(raw) ? Number(raw) : null;
}

/** Delivery time, buffer and how long each order should last. */
export async function saveRestockPlan(_prev: RestockFormState, fd: FormData): Promise<RestockFormState> {
  const staff = await manager();
  if ("error" in staff) return { error: staff.error };
  const lead = days(fd, "lead");
  const buffer = days(fd, "buffer");
  const cover = days(fd, "cover");
  if (lead === null || lead > 90) return { error: "Delivery time is 0 to 90 days.", field: "lead" };
  if (buffer === null || buffer > 90) return { error: "Buffer is 0 to 90 days.", field: "buffer" };
  if (cover === null || cover < 1 || cover > 180) return { error: "Each order lasts 1 to 180 days.", field: "cover" };
  const { error } = await staff.supabase.rpc("set_restock_plan", {
    p_lead_days: lead,
    p_buffer_days: buffer,
    p_cover_days: cover,
  });
  if (error) return { error: friendlyError(error as DbError) };
  revalidatePath("/restock");
  redirect("/restock?plan=saved");
}

/** Use how long recent orders took to arrive as the delivery time (buffer and cover stay as they are). */
export async function applyLeadDays(fd: FormData): Promise<void> {
  const lead = days(fd, "lead");
  const staff = await manager();
  if ("error" in staff || lead === null || lead > 90) redirect("/restock?plan=error");
  const { data } = await staff.supabase.from("settings").select("restock_buffer_days, restock_cover_days").maybeSingle();
  const cur = data as { restock_buffer_days: number; restock_cover_days: number } | null;
  if (!cur) redirect("/restock?plan=error");
  const { error } = await staff.supabase.rpc("set_restock_plan", {
    p_lead_days: lead,
    p_buffer_days: cur.restock_buffer_days,
    p_cover_days: cur.restock_cover_days,
  });
  revalidatePath("/restock");
  redirect(error ? "/restock?plan=error" : "/restock?plan=saved");
}

/**
 * Set each selling product's low-stock alert (Inventory, the nav badge) to its suggested reorder
 * point. Worked out again here from the database, not taken from the page.
 */
export async function applyReorderPoints(): Promise<void> {
  const staff = await manager();
  if ("error" in staff) redirect("/restock?alerts=error");
  const { products } = await loadReorderPlan(staff.supabase);
  const levels = products
    .filter((p) => p.plan.reorderPoint !== null && p.plan.reorderPoint !== p.reorder_at)
    .map((p) => ({ product_id: p.id, reorder_at: Math.min(10_000, p.plan.reorderPoint!) }));
  if (levels.length === 0) redirect("/restock?alerts=0");
  const { data, error } = await staff.supabase.rpc("set_reorder_levels", { p: levels });
  if (error) redirect("/restock?alerts=error");
  revalidatePath("/inventory");
  revalidatePath("/", "layout");
  redirect(`/restock?alerts=${Number(data) || 0}`);
}

/** A batch's restock costs from the form (pesos; blank = 0), as receive_batch / set_batch_costs take them. */
function batchCosts(
  fd: FormData,
): { ok: true; costs: Record<string, number | string> } | { ok: false; error: string; field: string } {
  const costs: Record<string, number | string> = {};
  for (const f of COST_FIELDS) {
    const raw = String(fd.get(f.name) ?? "").trim();
    const cents = raw === "" ? 0 : toCents(raw);
    if (cents === null || cents < 0 || cents > 100_000_000)
      return { ok: false, error: `Check the ${f.label} amount.`, field: f.name };
    costs[`${f.name}_cents`] = cents;
  }
  costs.other_label = String(fd.get("other_label") ?? "")
    .trim()
    .slice(0, 40);
  return { ok: true, costs };
}

/** Shipping, tax, MOOE and other costs of a batch, changed after it was received. */
export async function saveBatchCosts(id: string, _prev: RestockFormState, fd: FormData): Promise<RestockFormState> {
  if (!UUID_RE.test(id)) return { error: "Batch not found." };
  const staff = await manager();
  if ("error" in staff) return { error: staff.error };
  const parsed = batchCosts(fd);
  if (!parsed.ok) return { error: parsed.error, field: parsed.field };
  const { error } = await staff.supabase.rpc("set_batch_costs", { p_batch: id, p: parsed.costs });
  if (error) return { error: friendlyError(error as DbError) };
  revalidatePath("/restock");
  redirect(`/restock/batches/${id}?costs=saved`);
}

type Item = { product_id: string; qty: number; unit_cost_cents: number | null };

/** Pieces (and optionally cost per piece) for each product, as qty_<id> / cost_<id>. */
function batchItems(fd: FormData): { ok: true; items: Item[] } | { ok: false; error: string; field?: string } {
  const items: Item[] = [];
  for (const [key, value] of fd.entries()) {
    if (!key.startsWith("qty_") || typeof value !== "string") continue;
    const id = key.slice(4);
    const raw = value.trim().replace(/,/g, "");
    if (!UUID_RE.test(id) || raw === "" || raw === "0") continue;
    if (!/^\d{1,6}$/.test(raw) || Number(raw) > 100_000) {
      return { ok: false, error: "Pieces must be whole numbers up to 100,000.", field: key };
    }
    const costRaw = String(fd.get(`cost_${id}`) ?? "").trim();
    const cost = costRaw === "" ? null : toCents(costRaw);
    if (costRaw !== "" && (cost === null || cost < 0)) return { ok: false, error: "Check the cost per piece.", field: `cost_${id}` };
    items.push({ product_id: id, qty: Number(raw), unit_cost_cents: cost });
  }
  if (items.length === 0) return { ok: false, error: "Enter the pieces for at least one product." };
  return { ok: true, items };
}

const SOURCES = ["company", "owner", "investment"];

/**
 * What was paid with the order, the delivery or on pick-up: pay = full | part | none, pay_amount (pesos) for part,
 * pay_source = company | owner | investment. "full" sends "rest": the database pays whatever is still owed.
 */
function payment(fd: FormData): { ok: true; payment: { amount_cents: number | "rest"; source: string } } | { ok: false; error: string; field: string } {
  const pay = String(fd.get("pay") ?? "none");
  const source = String(fd.get("pay_source") ?? "company");
  if (pay === "none") return { ok: true, payment: { amount_cents: 0, source: "company" } };
  if (!SOURCES.includes(source)) return { ok: false, error: "Pick whose money paid.", field: "pay_source" };
  if (pay === "full") return { ok: true, payment: { amount_cents: "rest", source } };
  const amount = toCents(String(fd.get("pay_amount") ?? "").trim());
  if (amount === null || amount <= 0 || amount > 100_000_000) return { ok: false, error: "Enter the amount paid, e.g. 2000.", field: "pay_amount" };
  return { ok: true, payment: { amount_cents: amount, source } };
}

function batchBasics(fd: FormData) {
  return {
    supplier: String(fd.get("supplier") ?? "")
      .trim()
      .slice(0, 60),
    note: String(fd.get("note") ?? "")
      .trim()
      .slice(0, 200),
  };
}

function afterStockChange() {
  revalidatePath("/restock", "layout");
  revalidatePath("/sales/pnl");
  revalidatePath("/sales/report");
  revalidatePath("/inventory");
  revalidatePath("/", "layout");
}

/** One supplier delivery that is already here: its pieces go on the shelf now. */
export async function receiveBatch(_prev: RestockFormState, fd: FormData): Promise<RestockFormState> {
  const staff = await manager();
  if ("error" in staff) return { error: staff.error };
  const parsed = batchItems(fd);
  if (!parsed.ok) return { error: parsed.error, field: parsed.field };
  const receivedOn = String(fd.get("received_on") ?? "").trim();
  if (receivedOn && !isIsoDate(receivedOn)) return { error: "Pick the day the batch arrived.", field: "received_on" };
  const costs = batchCosts(fd);
  if (!costs.ok) return { error: costs.error, field: costs.field };
  const paid = payment(fd);
  if (!paid.ok) return { error: paid.error, field: paid.field };

  const { data, error } = await staff.supabase.rpc("receive_batch", {
    p: { ...costs.costs, ...batchBasics(fd), received_on: receivedOn, items: parsed.items, payment: paid.payment },
  });
  if (error) return { error: friendlyError(error as DbError) };
  afterStockChange();
  redirect(`/restock/batches/${data as string}?received=1`);
}

/** Stock ordered from a supplier: it waits as an order on the way until someone taps Arrived. */
export async function orderBatch(_prev: RestockFormState, fd: FormData): Promise<RestockFormState> {
  const staff = await manager();
  if ("error" in staff) return { error: staff.error };
  const parsed = batchItems(fd);
  if (!parsed.ok) return { error: parsed.error, field: parsed.field };
  const orderedOn = String(fd.get("ordered_on") ?? "").trim();
  if (orderedOn && !isIsoDate(orderedOn)) return { error: "Pick the day it was ordered.", field: "ordered_on" };
  const costs = batchCosts(fd);
  if (!costs.ok) return { error: costs.error, field: costs.field };
  const paid = payment(fd);
  if (!paid.ok) return { error: paid.error, field: paid.field };

  const { data, error } = await staff.supabase.rpc("order_batch", {
    p: { ...costs.costs, ...batchBasics(fd), ordered_on: orderedOn, items: parsed.items, payment: paid.payment },
  });
  if (error) return { error: friendlyError(error as DbError) };
  revalidatePath("/restock", "layout");
  revalidatePath("/sales/pnl");
  redirect(`/restock/batches/${data as string}?ordered=1`);
}

/**
 * An order arrived: the day, the pieces that came for each ordered line (arrived_<line id>; as ordered when
 * left out) and what was paid on pick-up.
 */
export async function arriveBatch(batchId: string, _prev: RestockFormState, fd: FormData): Promise<RestockFormState> {
  if (!UUID_RE.test(batchId)) return { error: "That batch no longer exists." };
  const staff = await manager();
  if ("error" in staff) return { error: staff.error };
  const date = text(fd, "received_on", 10);
  if (!isIsoDate(date)) return { error: "Pick the day it arrived.", field: "received_on" };
  const items: { line_id: string; qty: number }[] = [];
  for (const [key, value] of fd.entries()) {
    if (!key.startsWith("arrived_") || typeof value !== "string") continue;
    const id = key.slice(8);
    const raw = value.trim().replace(/,/g, "");
    if (!UUID_RE.test(id)) continue;
    if (!/^\d{1,6}$/.test(raw) || Number(raw) > 100_000) return { error: "Pieces must be whole numbers from 0 to 100,000.", field: key };
    items.push({ line_id: id, qty: Number(raw) });
  }
  const paid = payment(fd);
  if (!paid.ok) return { error: paid.error, field: paid.field };
  const { error } = await staff.supabase.rpc("arrive_batch", {
    p_batch: batchId,
    p: { received_on: date, items, payment: paid.payment },
  });
  if (error) return { error: friendlyError(error as DbError) };
  afterStockChange();
  redirect(`/restock/batches/${batchId}?arrived=1`);
}

/** Tapped Arrived by mistake: the pieces come off the shelf and the batch is an order on the way again. */
export async function undoArrival(batchId: string, _prev: RestockFormState, _fd: FormData): Promise<RestockFormState> {
  if (!UUID_RE.test(batchId)) return { error: "That batch no longer exists." };
  const staff = await manager();
  if ("error" in staff) return { error: staff.error };
  const { error } = await staff.supabase.rpc("undo_batch_arrival", { p_batch: batchId });
  if (error) return { error: friendlyError(error as DbError) };
  afterStockChange();
  redirect(`/restock/batches/${batchId}?back=1`);
}

/** An order that was cancelled: removed with its lines (only when nothing is paid on it). */
export async function deleteOrder(batchId: string, _prev: RestockFormState, _fd: FormData): Promise<RestockFormState> {
  if (!UUID_RE.test(batchId)) return { error: "That batch no longer exists." };
  const staff = await manager();
  if ("error" in staff) return { error: staff.error };
  const { error } = await staff.supabase.rpc("delete_batch_order", { p_batch: batchId });
  if (error) return { error: friendlyError(error as DbError) };
  revalidatePath("/restock", "layout");
  revalidatePath("/sales/pnl");
  redirect("/restock?view=batches&order=removed");
}

function paymentFields(fd: FormData): { ok: true; p: Record<string, string | number> } | { ok: false; error: string; field: string } {
  const amount = cents(fd);
  if (amount === null || amount <= 0 || amount > 100_000_000) return { ok: false, error: "Enter the amount paid, e.g. 2000.", field: "amount" };
  const source = text(fd, "source", 20);
  if (!SOURCES.includes(source)) return { ok: false, error: "Pick whose money paid.", field: "source" };
  const paidOn = text(fd, "paid_on", 10);
  if (!isIsoDate(paidOn)) return { ok: false, error: "Pick the day it was paid.", field: "paid_on" };
  return { ok: true, p: { amount_cents: amount, source, paid_on: paidOn, note: text(fd, "note") } };
}

/** Money paid to the supplier for a batch: a downpayment, the rest on pick-up, or anything paid later. */
export async function addBatchPayment(batchId: string, _prev: RestockFormState, fd: FormData): Promise<RestockFormState> {
  if (!UUID_RE.test(batchId)) return { error: "That batch no longer exists." };
  const staff = await manager();
  if ("error" in staff) return { error: staff.error };
  const parsed = paymentFields(fd);
  if (!parsed.ok) return { error: parsed.error, field: parsed.field };
  const { error } = await staff.supabase.rpc("add_batch_payment", { p_batch: batchId, p: parsed.p });
  if (error) return { error: friendlyError(error as DbError), field: "amount" };
  revalidatePath("/restock", "layout");
  revalidatePath("/sales/pnl");
  redirect(`/restock/batches/${batchId}?paid=added#payments`);
}

export async function updateBatchPayment(id: string, batchId: string, _prev: RestockFormState, fd: FormData): Promise<RestockFormState> {
  if (!UUID_RE.test(id) || !UUID_RE.test(batchId)) return { error: "That payment no longer exists." };
  const staff = await manager();
  if ("error" in staff) return { error: staff.error };
  const parsed = paymentFields(fd);
  if (!parsed.ok) return { error: parsed.error, field: parsed.field };
  const { error } = await staff.supabase.rpc("update_batch_payment", { p_id: id, p: parsed.p });
  if (error) return { error: friendlyError(error as DbError), field: "amount" };
  revalidatePath("/restock", "layout");
  revalidatePath("/sales/pnl");
  redirect(`/restock/batches/${batchId}?paid=edited#payments`);
}

export async function deleteBatchPayment(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "");
  const batchId = String(fd.get("batch_id") ?? "");
  if (!UUID_RE.test(batchId)) redirect("/restock?view=batches");
  const staff = await manager();
  if ("error" in staff || !UUID_RE.test(id)) redirect(`/restock/batches/${batchId}?paid=error#payments`);
  const { error } = await staff.supabase.rpc("delete_batch_payment", { p_id: id });
  revalidatePath("/restock", "layout");
  revalidatePath("/sales/pnl");
  redirect(`/restock/batches/${batchId}?paid=${error ? "error" : "removed"}#payments`);
}

/** Where the P&L and expense forms send you back to. */
function pnlBack(fd: FormData, extra: string) {
  const to = String(fd.get("return_to") ?? "");
  const ok =
    /^\/restock\/batches\/[0-9a-f-]{36}$/.test(to) ||
    ["/sales/pnl", "/sales/pnl?view=batches", "/restock/expenses", "/restock?view=batches"].includes(to) ||
    /^\/restock\/expenses\?batch=([0-9a-f-]{36}|general)$/.test(to);
  const base = ok ? to : "/restock/expenses";
  return `${base}${base.includes("?") ? "&" : "?"}${extra}${base.startsWith("/restock/batches/") ? "#pnl" : ""}`;
}

/**
 * An expense (salary, rent, utilities, supplies, other), charged to a batch (batch_id) or general
 * (batch_id empty). Owners and managers.
 */
export async function addExpense(_prev: RestockFormState, fd: FormData): Promise<RestockFormState> {
  const staff = await manager();
  if ("error" in staff) return { error: staff.error };
  const batchId = String(fd.get("batch_id") ?? "");
  if (batchId && !UUID_RE.test(batchId)) return { error: "Pick the batch, or General.", field: "batch_id" };
  const category = String(fd.get("category") ?? "");
  if (!EXPENSE_CATEGORIES.some((c) => c.id === category)) return { error: "Pick what the expense was for.", field: "category" };
  const amount = toCents(String(fd.get("amount") ?? "").trim());
  if (amount === null || amount <= 0 || amount > 100_000_000)
    return { error: "Enter the amount in pesos, e.g. 7500.", field: "amount" };
  const spentOn = String(fd.get("spent_on") ?? "").trim();
  if (spentOn && !isIsoDate(spentOn)) return { error: "Pick the date it was paid.", field: "spent_on" };
  const { error } = await staff.supabase.rpc("add_expense", {
    p: {
      batch_id: batchId,
      category,
      amount_cents: amount,
      spent_on: spentOn,
      note: String(fd.get("note") ?? "")
        .trim()
        .slice(0, 200),
    },
  });
  if (error) return { error: friendlyError(error as DbError) };
  revalidatePath("/restock");
  revalidatePath("/sales/pnl");
  redirect(pnlBack(fd, "expense=added"));
}

export async function deleteBatchExpense(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "");
  const staff = await manager();
  if ("error" in staff || !UUID_RE.test(id)) redirect(pnlBack(fd, "expense=error"));
  const { error } = await staff.supabase.rpc("delete_expense", { p_id: id });
  revalidatePath("/restock");
  revalidatePath("/sales/pnl");
  redirect(pnlBack(fd, error ? "expense=error" : "expense=removed"));
}

/** Owner : manager parts of net profit (2 : 1 = two thirds and one third). Owner only. */
export async function saveSplit(_prev: RestockFormState, fd: FormData): Promise<RestockFormState> {
  const staff = await manager();
  if ("error" in staff) return { error: staff.error };
  const owner = String(fd.get("owner_parts") ?? "").trim();
  const mgr = String(fd.get("manager_parts") ?? "").trim();
  if (!/^\d{1,3}$/.test(owner) || !/^\d{1,3}$/.test(mgr) || Number(owner) + Number(mgr) === 0) {
    return { error: "Use whole parts, e.g. 2 and 1 for two thirds and one third." };
  }
  const { error } = await staff.supabase.rpc("set_profit_split", { p_owner_parts: Number(owner), p_manager_parts: Number(mgr) });
  if (error) return { error: friendlyError(error as DbError) };
  revalidatePath("/restock");
  revalidatePath("/sales/pnl");
  redirect(pnlBack(fd, "split=saved"));
}

/** Turn "Stock before batches" into a real batch, so it gets restock costs, expenses and a P&L. */
export async function batchExistingStock(_prev: RestockFormState, fd: FormData): Promise<RestockFormState> {
  const staff = await manager();
  if ("error" in staff) return { error: staff.error };
  const { data, error } = await staff.supabase.rpc("batch_existing_stock", {
    p: {
      supplier: String(fd.get("supplier") ?? "")
        .trim()
        .slice(0, 60),
    },
  });
  if (error) return { error: friendlyError(error as DbError) };
  revalidatePath("/restock");
  revalidatePath("/sales/pnl");
  redirect(`/restock/batches/${data as string}?made=1`);
}

/** Release profit from the company funds, split owner : manager. Owner only (checked again in the database). */
export async function releaseProfits(_prev: RestockFormState, fd: FormData): Promise<RestockFormState> {
  const staff = await manager();
  if ("error" in staff) return { error: staff.error };
  const amount = toCents(String(fd.get("amount") ?? "").trim());
  if (amount === null || amount <= 0) return { error: "Enter the amount to release, e.g. 5000.", field: "amount" };
  const { error } = await staff.supabase.rpc("release_profits", {
    p_amount_cents: amount,
    p_note: String(fd.get("note") ?? "")
      .trim()
      .slice(0, 200),
  });
  if (error) return { error: friendlyError(error as DbError), field: "amount" };
  revalidatePath("/sales/pnl");
  redirect("/sales/pnl?released=1#distributions");
}

export async function undoRelease(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "");
  const staff = await manager();
  if ("error" in staff || !UUID_RE.test(id)) redirect("/sales/pnl?released=error#distributions");
  const { error } = await staff.supabase.rpc("delete_fund_release", { p_id: id });
  revalidatePath("/sales/pnl");
  redirect(`/sales/pnl?released=${error ? "error" : "undone"}#distributions`);
}

/** Add pieces of a product to a batch already received (a product left off it, or more of one). */
export async function addToBatch(batchId: string, _prev: RestockFormState, fd: FormData): Promise<RestockFormState> {
  if (!UUID_RE.test(batchId)) return { error: "That batch no longer exists." };
  const staff = await manager();
  if ("error" in staff) return { error: staff.error };
  const product = String(fd.get("product_id") ?? "");
  if (!UUID_RE.test(product)) return { error: "Pick the product.", field: "product_id" };
  const rawQty = String(fd.get("qty") ?? "").trim();
  const qty = /^\d{1,6}$/.test(rawQty) ? Number(rawQty) : 0;
  if (qty < 1 || qty > 100_000) return { error: "Enter at least 1 piece.", field: "qty" };
  const costRaw = String(fd.get("unit_cost") ?? "").trim();
  const cost = costRaw === "" ? null : toCents(costRaw);
  if (costRaw !== "" && (cost === null || cost < 0)) return { error: "Check the cost per piece.", field: "unit_cost" };
  const { error } = await staff.supabase.rpc("adjust_stock", {
    p_product: product,
    p_kind: "restock",
    p_qty: qty,
    p_unit_cost_cents: cost,
    p_note: null,
    p_batch: batchId,
  });
  if (error) return { error: friendlyError(error as DbError) };
  revalidatePath("/", "layout");
  redirect(`/restock/batches/${batchId}?added=1#lines-t`);
}

/** Decide how much the company funds keep for the next restock. Owners and managers. */
export async function setRestockSetAside(_prev: RestockFormState, fd: FormData): Promise<RestockFormState> {
  const staff = await manager();
  if ("error" in staff) return { error: staff.error };
  const amount = toCents(String(fd.get("amount") ?? "").trim());
  if (amount === null || amount < 0) return { error: "Enter the amount to keep, e.g. 5000, or 0 for nothing.", field: "amount" };
  const { error } = await staff.supabase.rpc("set_restock_set_aside", {
    p_amount_cents: amount,
    p_note: String(fd.get("note") ?? "")
      .trim()
      .slice(0, 200),
  });
  if (error) return { error: friendlyError(error as DbError) };
  revalidatePath("/sales/pnl");
  redirect("/sales/pnl?kept=1#next-restock");
}

/** Owner: record money put into the business. */
export async function addCapital(_prev: RestockFormState, fd: FormData): Promise<RestockFormState> {
  const staff = await manager();
  if ("error" in staff) return { error: staff.error };
  const amount = toCents(String(fd.get("amount") ?? "").trim());
  if (amount === null || amount <= 0) return { error: "Enter the amount put in, e.g. 5000.", field: "amount" };
  const date = String(fd.get("put_in_on") ?? "");
  const { error } = await staff.supabase.rpc("add_capital", {
    p_amount_cents: amount,
    p_note: String(fd.get("note") ?? "").trim().slice(0, 200),
    p_put_in_on: isIsoDate(date) ? date : null,
  });
  if (error) return { error: friendlyError(error as DbError) };
  revalidatePath("/sales/pnl");
  redirect("/sales/pnl?view=balance&capital=added#capital");
}

/** Owner: remove a capital entry recorded by mistake. */
export async function deleteCapital(fd: FormData): Promise<void> {
  const staff = await manager();
  const id = String(fd.get("id") ?? "");
  if ("error" in staff || !UUID_RE.test(id)) redirect("/sales/pnl?view=balance&capital=error#capital");
  const { error } = await staff.supabase.rpc("delete_capital", { p_id: id });
  revalidatePath("/sales/pnl");
  redirect(`/sales/pnl?view=balance&capital=${error ? "error" : "removed"}#capital`);
}

/** Owner: the percentage tax rate used for the estimate. */
export async function setTaxRate(_prev: RestockFormState, fd: FormData): Promise<RestockFormState> {
  const staff = await manager();
  if ("error" in staff) return { error: staff.error };
  const raw = String(fd.get("rate") ?? "").trim().replace("%", "");
  const pct = /^\d{1,2}(\.\d{1,2})?$/.test(raw) ? Number(raw) : NaN;
  if (!(pct >= 0 && pct <= 30)) return { error: "Enter a rate from 0 to 30, e.g. 3.", field: "rate" };
  const { error } = await staff.supabase.rpc("set_tax_rate", { p_bp: Math.round(pct * 100) });
  if (error) return { error: friendlyError(error as DbError) };
  revalidatePath("/sales/pnl");
  redirect(fd.get("return_to") === "/sales/pnl" ? "/sales/pnl?tax=saved#settings" : "/sales/pnl?view=pl&tax=saved#pl");
}

function cents(fd: FormData, key = "amount") {
  return toCents(String(fd.get(key) ?? "").trim());
}
function text(fd: FormData, key: string, max = 200) {
  return String(fd.get(key) ?? "").trim().slice(0, max);
}

/** Edit an expense: what it was for, the amount, the date, the note, and what it's charged to. */
export async function updateExpense(id: string, _prev: RestockFormState, fd: FormData): Promise<RestockFormState> {
  if (!UUID_RE.test(id)) return { error: "That expense no longer exists." };
  const staff = await manager();
  if ("error" in staff) return { error: staff.error };
  const batchId = text(fd, "batch_id", 40);
  if (batchId && !UUID_RE.test(batchId)) return { error: "Pick the batch, or General.", field: "batch_id" };
  const category = text(fd, "category", 20);
  if (!EXPENSE_CATEGORIES.some((c) => c.id === category)) return { error: "Pick what the expense was for.", field: "category" };
  const amount = cents(fd);
  if (amount === null || amount <= 0 || amount > 100_000_000) return { error: "Enter the amount in pesos, e.g. 7500.", field: "amount" };
  const spentOn = text(fd, "spent_on", 10);
  if (!isIsoDate(spentOn)) return { error: "Pick the date it was paid.", field: "spent_on" };
  const { error } = await staff.supabase.rpc("update_expense", {
    p_id: id,
    p: { batch_id: batchId, category, amount_cents: amount, spent_on: spentOn, note: text(fd, "note") },
  });
  if (error) return { error: friendlyError(error as DbError) };
  revalidatePath("/restock", "layout");
  revalidatePath("/sales/pnl");
  redirect(pnlBack(fd, "expense=edited"));
}

/** Owner: edit money put in. */
export async function updateCapital(id: string, _prev: RestockFormState, fd: FormData): Promise<RestockFormState> {
  if (!UUID_RE.test(id)) return { error: "That entry no longer exists." };
  const staff = await manager();
  if ("error" in staff) return { error: staff.error };
  const amount = cents(fd);
  if (amount === null || amount <= 0) return { error: "Enter the amount put in, e.g. 5000.", field: "amount" };
  const date = text(fd, "put_in_on", 10);
  if (!isIsoDate(date)) return { error: "Pick the date.", field: "put_in_on" };
  const { error } = await staff.supabase.rpc("update_capital", { p_id: id, p_amount_cents: amount, p_note: text(fd, "note"), p_put_in_on: date });
  if (error) return { error: friendlyError(error as DbError) };
  revalidatePath("/sales/pnl");
  redirect("/sales/pnl?view=balance&capital=edited#capital");
}

/** Owner: edit a distribution's amount, date or note. */
export async function updateRelease(id: string, _prev: RestockFormState, fd: FormData): Promise<RestockFormState> {
  if (!UUID_RE.test(id)) return { error: "That distribution no longer exists." };
  const staff = await manager();
  if ("error" in staff) return { error: staff.error };
  const amount = cents(fd);
  if (amount === null || amount <= 0) return { error: "Enter the amount, e.g. 5000.", field: "amount" };
  const date = text(fd, "released_on", 10);
  if (!isIsoDate(date)) return { error: "Pick the date.", field: "released_on" };
  const { error } = await staff.supabase.rpc("update_fund_release", {
    p_id: id,
    p_amount_cents: amount,
    p_note: text(fd, "note"),
    p_released_on: date,
  });
  if (error) return { error: friendlyError(error as DbError), field: /safe/.test(error.message) ? "amount" : undefined };
  revalidatePath("/sales/pnl");
  redirect("/sales/pnl?released=edited#distributions");
}

/**
 * The date a batch arrived, changed from its report (Sales → Finance → Report). Only the date changes; it can't be
 * before the day it was ordered. Back to the same report and comparison.
 */
export async function setBatchReceivedOn(batchId: string, compare: string, _prev: RestockFormState, fd: FormData): Promise<RestockFormState> {
  if (!UUID_RE.test(batchId)) return { error: "That batch no longer exists." };
  const staff = await manager();
  if ("error" in staff) return { error: staff.error };
  const date = text(fd, "received_on", 10);
  if (!isIsoDate(date)) return { error: "Pick the date it arrived.", field: "received_on" };
  const { error } = await staff.supabase.rpc("set_batch_received_on", { p_batch: batchId, p_date: date });
  if (error) return { error: friendlyError(error as DbError), field: "received_on" };
  revalidatePath("/restock", "layout");
  revalidatePath("/sales/pnl");
  revalidatePath("/sales/report");
  const q = new URLSearchParams({ batch: batchId });
  if (compare === "all" || compare === "none" || UUID_RE.test(compare)) q.set("vs", compare);
  q.set("date", "saved");
  redirect(`/sales/report?${q.toString()}`);
}

/**
 * A batch's supplier, the day it was ordered, the day it arrived (once it has) and note. An order still on the way
 * has no arrival date here: Arrived sets it.
 */
export async function updateBatchDetails(batchId: string, _prev: RestockFormState, fd: FormData): Promise<RestockFormState> {
  if (!UUID_RE.test(batchId)) return { error: "That batch no longer exists." };
  const staff = await manager();
  if ("error" in staff) return { error: staff.error };
  const arrived = fd.has("received_on");
  const date = text(fd, "received_on", 10);
  if (arrived && !isIsoDate(date)) return { error: "Pick the date it arrived.", field: "received_on" };
  const ordered = text(fd, "ordered_on", 10);
  if (ordered && !isIsoDate(ordered)) return { error: "Pick the date it was ordered.", field: "ordered_on" };
  if (!arrived && !ordered) return { error: "Pick the date it was ordered.", field: "ordered_on" };
  const { error } = await staff.supabase.rpc("update_batch_details", {
    p_batch: batchId,
    p: { supplier: text(fd, "supplier", 60), ...(arrived ? { received_on: date } : {}), ordered_on: ordered, note: text(fd, "note") },
  });
  if (error) return { error: friendlyError(error as DbError), field: /order/i.test(error.message) ? "ordered_on" : undefined };
  revalidatePath("/restock", "layout");
  revalidatePath("/sales/pnl");
  redirect(`/restock/batches/${batchId}?details=saved`);
}
