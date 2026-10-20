"use server";

// The register's one write: complete a sale through public.complete_sale, which prices the cart
// from the database, checks stock, the age check and the staff discount limit, takes the stock
// off and returns the sale number. The register only sends product ids and quantities.
import { revalidatePath } from "next/cache";
import { requireActiveStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/db-errors";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/format";
import { isUuid } from "@/lib/ids";

export type SaleInput = {
  clientRef: string;
  items: { productId: string; quantity: number }[];
  discountCents: number;
  method: PaymentMethod;
  tenderedCents: number | null;
  reference: string;
  ageVerified: boolean;
};

export type SaleResult =
  | { ok: true; id: string; saleNumber: number; totalCents: number; changeCents: number | null }
  | { ok: false; error: string };

export async function completeSale(input: SaleInput): Promise<SaleResult> {
  if (!isUuid(input.clientRef)) return { ok: false, error: "Something went wrong. Please try again." };
  if (!Array.isArray(input.items) || input.items.length === 0) return { ok: false, error: "Add at least one item." };
  if (input.items.length > 200) return { ok: false, error: "That's too many lines for one sale." };
  for (const it of input.items) {
    if (!isUuid(it.productId) || !Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > 1000) {
      return { ok: false, error: "Each quantity must be between 1 and 1,000." };
    }
  }
  if (!PAYMENT_METHODS.includes(input.method)) return { ok: false, error: "Pick how the customer paid." };
  if (!Number.isInteger(input.discountCents) || input.discountCents < 0) {
    return { ok: false, error: "The discount can't be negative." };
  }
  if (input.tenderedCents !== null && (!Number.isInteger(input.tenderedCents) || input.tenderedCents < 0)) {
    return { ok: false, error: "Enter the cash received." };
  }
  if (!input.ageVerified) return { ok: false, error: "Check the customer's ID first." };

  let staff;
  try {
    staff = await requireActiveStaff();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sign in again." };
  }

  const { data, error } = await staff.supabase.rpc("complete_sale", {
    p: {
      client_ref: input.clientRef,
      items: input.items.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
      discount_cents: input.discountCents,
      payment_method: input.method,
      tendered_cents: input.method === "cash" ? input.tenderedCents : null,
      reference: input.method === "cash" ? "" : input.reference.trim().slice(0, 60),
      age_verified: input.ageVerified,
    },
  });
  if (error) return { ok: false, error: friendlyError(error) };

  const r = data as { id: string; sale_number: number; total_cents: number; change_cents: number | null };
  // Stock counts on the register, the low-stock badge and today's sales all change.
  revalidatePath("/", "layout");
  return { ok: true, id: r.id, saleNumber: r.sale_number, totalCents: r.total_cents, changeCents: r.change_cents };
}
