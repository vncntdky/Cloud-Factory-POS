"use server";

// The register's one write: complete a sale through public.complete_sale, which prices the cart
// from the database, checks stock, the age check and the staff discount limit, takes the stock
// off and returns the sale number. The register only sends product ids and quantities.
// "Not paid yet" (unpaid) needs the buyer's name; the total then shows in Collectibles.
import { revalidatePath } from "next/cache";
import { requireActiveStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/db-errors";
import { SALE_METHODS, type SaleMethod } from "@/lib/format";
import { isUuid } from "@/lib/ids";

export type SaleInput = {
  clientRef: string;
  items: { productId: string; quantity: number }[];
  discountCents: number;
  method: SaleMethod;
  tenderedCents: number | null;
  reference: string;
  ageVerified: boolean;
  /** Optional, except for unpaid sales. */
  customerName: string;
};

export type SaleResult =
  | { ok: true; id: string; saleNumber: number; totalCents: number; changeCents: number | null; balanceCents: number }
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
  if (!SALE_METHODS.includes(input.method)) return { ok: false, error: "Pick how the customer paid." };
  if (!Number.isInteger(input.discountCents) || input.discountCents < 0) {
    return { ok: false, error: "The discount can't be negative." };
  }
  if (input.tenderedCents !== null && (!Number.isInteger(input.tenderedCents) || input.tenderedCents < 0)) {
    return { ok: false, error: "Enter the cash received." };
  }
  const buyer = typeof input.customerName === "string" ? input.customerName.trim().replace(/\s+/g, " ") : "";
  if (buyer.length > 80) return { ok: false, error: "Keep the buyer's name to 80 characters." };
  if (input.method === "unpaid" && !buyer) return { ok: false, error: "Add the buyer's name so you know who to collect from." };
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
      reference: input.method === "cash" || input.method === "unpaid" ? "" : input.reference.trim().slice(0, 60),
      age_verified: input.ageVerified,
      customer_name: buyer,
    },
  });
  if (error) return { ok: false, error: friendlyError(error) };

  const r = data as { id: string; sale_number: number; total_cents: number; change_cents: number | null; balance_cents?: number };
  // Stock counts on the register, the low-stock badge, today's sales and Collectibles all change.
  revalidatePath("/", "layout");
  return {
    ok: true,
    id: r.id,
    saleNumber: r.sale_number,
    totalCents: r.total_cents,
    changeCents: r.change_cents,
    balanceCents: r.balance_cents ?? 0,
  };
}
