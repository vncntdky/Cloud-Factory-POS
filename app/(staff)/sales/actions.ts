"use server";

// Void a sale (owners and managers). public.void_sale checks the role, records who and why, and
// puts the stock back.
import { revalidatePath } from "next/cache";
import { requireActiveStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/db-errors";
import { isUuid } from "@/lib/ids";

export type VoidState = { error: string | null; done?: boolean };

export async function voidSale(id: string, _prev: VoidState, formData: FormData): Promise<VoidState> {
  if (!isUuid(id)) return { error: "Sale not found." };
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Add a reason for the void." };
  if (reason.length > 200) return { error: "Keep the reason under 200 characters." };

  let staff;
  try {
    staff = await requireActiveStaff();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sign in again." };
  }
  const { error } = await staff.supabase.rpc("void_sale", { p_sale: id, p_reason: reason });
  if (error) return { error: friendlyError(error) };

  revalidatePath("/", "layout");
  return { error: null, done: true };
}
