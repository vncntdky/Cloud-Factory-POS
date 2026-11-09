"use server";

// Restock tab: the reorder plan settings, applying suggested reorder points as low-stock alerts,
// and receiving a batch. Owners and managers; the database functions check the role too.
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

/** One supplier delivery: pieces (and optionally cost per piece) for each product, as qty_<id> / cost_<id>. */
export async function receiveBatch(_prev: RestockFormState, fd: FormData): Promise<RestockFormState> {
  const staff = await manager();
  if ("error" in staff) return { error: staff.error };

  const items: { product_id: string; qty: number; unit_cost_cents: number | null }[] = [];
  for (const [key, value] of fd.entries()) {
    if (!key.startsWith("qty_") || typeof value !== "string") continue;
    const id = key.slice(4);
    const raw = value.trim().replace(/,/g, "");
    if (!UUID_RE.test(id) || raw === "" || raw === "0") continue;
    if (!/^\d{1,6}$/.test(raw) || Number(raw) > 100_000) {
      return { error: "Pieces received must be whole numbers up to 100,000.", field: key };
    }
    const costRaw = String(fd.get(`cost_${id}`) ?? "").trim();
    const cost = costRaw === "" ? null : toCents(costRaw);
    if (costRaw !== "" && (cost === null || cost < 0)) return { error: "Check the cost per piece.", field: `cost_${id}` };
    items.push({ product_id: id, qty: Number(raw), unit_cost_cents: cost });
  }
  if (items.length === 0) return { error: "Enter the pieces received for at least one product." };

  const receivedOn = String(fd.get("received_on") ?? "").trim();
  if (receivedOn && !isIsoDate(receivedOn)) return { error: "Pick the day the batch arrived.", field: "received_on" };

  const parsed = batchCosts(fd);
  if (!parsed.ok) return { error: parsed.error, field: parsed.field };

  const { data, error } = await staff.supabase.rpc("receive_batch", {
    p: {
      ...parsed.costs,
      supplier: String(fd.get("supplier") ?? "")
        .trim()
        .slice(0, 60),
      received_on: receivedOn,
      note: String(fd.get("note") ?? "")
        .trim()
        .slice(0, 200),
      items,
    },
  });
  if (error) return { error: friendlyError(error as DbError) };
  // New batches are paid from the company funds unless this was unticked.
  if (fd.get("paid_from_funds") !== "1") {
    await staff.supabase.rpc("set_batch_paid_from_funds", { p_batch: data as string, p_paid: false });
  }
  revalidatePath("/restock");
  revalidatePath("/sales/pnl");
  revalidatePath("/inventory");
  revalidatePath("/", "layout");
  redirect(`/restock/batches/${data as string}?received=1`);
}

/** Where the P&L and expense forms send you back to. */
function pnlBack(fd: FormData, extra: string) {
  const to = String(fd.get("return_to") ?? "");
  const ok =
    /^\/restock\/batches\/[0-9a-f-]{36}$/.test(to) ||
    ["/sales/pnl", "/restock/expenses", "/restock?view=batches"].includes(to) ||
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
  redirect("/sales/pnl?released=1#funds");
}

export async function undoRelease(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "");
  const staff = await manager();
  if ("error" in staff || !UUID_RE.test(id)) redirect("/sales/pnl?released=error#funds");
  const { error } = await staff.supabase.rpc("delete_fund_release", { p_id: id });
  revalidatePath("/sales/pnl");
  redirect(`/sales/pnl?released=${error ? "error" : "undone"}#funds`);
}

/** Whether a batch was paid from the company funds (a new batch is, unless switched off). */
export async function setPaidFromFunds(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "");
  const paid = fd.get("paid") === "1";
  if (!UUID_RE.test(id)) redirect("/restock?view=batches");
  const staff = await manager();
  if (!("error" in staff)) await staff.supabase.rpc("set_batch_paid_from_funds", { p_batch: id, p_paid: paid });
  revalidatePath("/restock");
  revalidatePath("/sales/pnl");
  redirect(`/restock/batches/${id}#pnl`);
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
