"use server";

// Dashboard P&L: record and remove expenses (owners and managers), change the profit split
// (owner). The database functions check the roles too.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveStaff } from "@/lib/auth";
import { friendlyError, type DbError } from "@/lib/db-errors";
import { toCents } from "@/lib/format";
import { UUID_RE } from "@/lib/ids";
import { EXPENSE_CATEGORIES } from "@/lib/pnl";
import { isIsoDate } from "@/lib/time";

export type PnlFormState = { error: string; field?: string } | null;

function back(fd: FormData, extra = "") {
  const range = String(fd.get("range") ?? "");
  const q = [/^(7d|30d|90d|12m)$/.test(range) && range !== "30d" ? `range=${range}` : "", extra].filter(Boolean).join("&");
  return `/sales/dashboard${q ? `?${q}` : ""}#pnl`;
}

async function signedIn() {
  try {
    return await requireActiveStaff();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sign in again." };
  }
}

export async function addExpense(_prev: PnlFormState, fd: FormData): Promise<PnlFormState> {
  const staff = await signedIn();
  if ("error" in staff) return { error: staff.error };
  const category = String(fd.get("category") ?? "");
  if (!EXPENSE_CATEGORIES.some((c) => c.id === category)) return { error: "Pick what the expense was for.", field: "category" };
  const amount = toCents(String(fd.get("amount") ?? "").trim());
  if (amount === null || amount <= 0 || amount > 100_000_000) return { error: "Enter the amount in pesos, e.g. 7500.", field: "amount" };
  const spentOn = String(fd.get("spent_on") ?? "").trim();
  if (spentOn && !isIsoDate(spentOn)) return { error: "Pick the date it was paid.", field: "spent_on" };
  const { error } = await staff.supabase.rpc("add_expense", {
    p: { category, amount_cents: amount, spent_on: spentOn, note: String(fd.get("note") ?? "").trim().slice(0, 200) },
  });
  if (error) return { error: friendlyError(error as DbError) };
  revalidatePath("/sales/dashboard");
  redirect(back(fd, "expense=added"));
}

export async function deleteExpense(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "");
  const staff = await signedIn();
  if ("error" in staff || !UUID_RE.test(id)) redirect(back(fd, "expense=error"));
  const { error } = await staff.supabase.rpc("delete_expense", { p_id: id });
  revalidatePath("/sales/dashboard");
  redirect(back(fd, error ? "expense=error" : "expense=removed"));
}

export async function saveSplit(_prev: PnlFormState, fd: FormData): Promise<PnlFormState> {
  const staff = await signedIn();
  if ("error" in staff) return { error: staff.error };
  const owner = String(fd.get("owner_parts") ?? "").trim();
  const manager = String(fd.get("manager_parts") ?? "").trim();
  if (!/^\d{1,3}$/.test(owner) || !/^\d{1,3}$/.test(manager) || Number(owner) + Number(manager) === 0) {
    return { error: "Use whole parts, e.g. 2 and 1 for two thirds and one third." };
  }
  const { error } = await staff.supabase.rpc("set_profit_split", { p_owner_parts: Number(owner), p_manager_parts: Number(manager) });
  if (error) return { error: friendlyError(error as DbError) };
  revalidatePath("/sales/dashboard");
  redirect(back(fd, "split=saved"));
}
