"use server";

// Collect money owed on a "Not paid yet" sale, in full or in part. Any active staff member: they
// take the money at the counter. public.record_payment checks the amount against what's owed.
import { revalidatePath } from "next/cache";
import { requireActiveStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/db-errors";
import { PAYMENT_METHODS, toCents, type PaymentMethod } from "@/lib/format";
import { isUuid } from "@/lib/ids";

export type CollectState = { error: string | null; done?: boolean; amountCents?: number; balanceCents?: number };

export async function recordPayment(saleId: string, _prev: CollectState, fd: FormData): Promise<CollectState> {
  if (!isUuid(saleId)) return { error: "Sale not found." };
  const amount = toCents(String(fd.get("amount") ?? ""));
  if (amount === null || amount <= 0) return { error: "Enter the amount received, e.g. 320." };
  const method = String(fd.get("method") ?? "") as PaymentMethod;
  if (!PAYMENT_METHODS.includes(method)) return { error: "Pick how they paid." };
  const reference = String(fd.get("reference") ?? "").trim().slice(0, 60);

  let staff;
  try {
    staff = await requireActiveStaff();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sign in again." };
  }
  const { data, error } = await staff.supabase.rpc("record_payment", {
    p_sale: saleId,
    p_amount_cents: amount,
    p_method: method,
    p_reference: method === "cash" ? null : reference || null,
  });
  if (error) return { error: friendlyError(error) };

  // Collectibles, the nav badge, the sale and today's money in all change.
  revalidatePath("/", "layout");
  return { error: null, done: true, amountCents: amount, balanceCents: (data as { balance_cents: number }).balance_cents };
}
