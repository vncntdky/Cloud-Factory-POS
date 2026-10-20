"use server";

// Products and stock: add / edit products and change stock (count, restock, waste). Owners and
// managers only; the database enforces the same (save_product and adjust_stock check the role,
// and on_hand only changes through those functions or a sale, so every change is in the stock log).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveStaff } from "@/lib/auth";
import { friendlyError, type DbError } from "@/lib/db-errors";
import { toCents } from "@/lib/format";
import { UUID_RE } from "@/lib/ids";
import { can } from "@/lib/permissions";

export type ProductFormState = { error: string; field?: string } | null;

function str(fd: FormData, k: string, max: number) {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** Whole pieces: "" → null, "12" → 12, anything else → "invalid". */
function pieces(raw: string, max = 100_000): number | null | "invalid" {
  if (raw === "") return null;
  if (!/^\d+$/.test(raw.replace(/,/g, ""))) return "invalid";
  const n = Number(raw.replace(/,/g, ""));
  return n > max ? "invalid" : n;
}

async function manager() {
  try {
    const staff = await requireActiveStaff();
    if (!can(staff.profile, "editProducts")) return { error: "Only owners and managers can change products and stock." };
    return staff;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sign in again." };
  }
}

function refresh(id?: string) {
  revalidatePath("/inventory");
  if (id) revalidatePath(`/inventory/${id}`);
  revalidatePath("/", "layout"); // register, low-stock badge
}

/** Create (id = null) or edit a product. */
export async function saveProduct(id: string | null, _prev: ProductFormState, fd: FormData): Promise<ProductFormState> {
  if (id !== null && !UUID_RE.test(id)) return { error: "Product not found." };
  const staff = await manager();
  if ("error" in staff) return { error: staff.error };

  const name = str(fd, "name", 80);
  const barcode = str(fd, "barcode", 40);
  const price = toCents(str(fd, "price", 20));
  const costRaw = str(fd, "cost", 20);
  const cost = costRaw === "" ? null : toCents(costRaw);
  const reorder = pieces(str(fd, "reorder_at", 10), 10_000);
  const opening = id === null ? pieces(str(fd, "opening_qty", 10)) : null;
  const category = str(fd, "category_id", 40);
  const newCategory = str(fd, "new_category", 40);

  if (!name) return { error: "Add the product name, e.g. Infinity Pod.", field: "name" };
  if (price === null || price < 0) return { error: "Enter the selling price in pesos, e.g. 350.", field: "price" };
  if (cost !== null && cost < 0) return { error: "The cost can't be negative.", field: "cost" };
  if (costRaw !== "" && cost === null) return { error: "Enter the cost in pesos, e.g. 210.", field: "cost" };
  if (barcode && !/^[A-Za-z0-9._-]{1,40}$/.test(barcode)) {
    return { error: "Barcodes use letters, numbers, . - and _ only.", field: "barcode" };
  }
  if (reorder === "invalid") return { error: "Reorder level must be a whole number of pieces.", field: "reorder_at" };
  if (opening === "invalid") return { error: "Opening stock must be a whole number of pieces.", field: "opening_qty" };
  if (category === "__new" && !newCategory) return { error: "Name the new category.", field: "new_category" };
  if (category && category !== "__new" && !UUID_RE.test(category)) return { error: "Pick a category.", field: "category_id" };

  const p: Record<string, unknown> = {
    brand: str(fd, "brand", 60),
    name,
    variant: str(fd, "variant", 60),
    barcode,
    category_id: category && category !== "__new" ? category : "",
    new_category: category === "__new" ? newCategory : "",
    price_cents: price,
    reorder_at: reorder ?? 5,
    active: id === null ? true : fd.get("active") === "true",
  };
  // Only send cost when the form showed it (owners and managers always see it); empty clears it.
  if (fd.has("cost")) p.cost_cents = cost ?? "";
  if (id === null) p.opening_qty = opening ?? 0;

  const { data, error } = await staff.supabase.rpc("save_product", { p_id: id, p });
  if (error) {
    if (error.code === "23505" && /barcode/.test(error.message)) {
      return { error: `Another product already has barcode ${barcode}.`, field: "barcode" };
    }
    return { error: friendlyError(error as DbError) };
  }
  const newId = data as string;
  refresh(newId);
  redirect(id === null && fd.get("again") === "1" ? `/inventory/new?added=${newId}` : `/inventory/${newId}?saved=1`);
}

/** Count (what's on the shelf now), restock (pieces received) or waste (pieces lost or damaged). */
export async function adjustStock(id: string, _prev: ProductFormState, fd: FormData): Promise<ProductFormState> {
  if (!UUID_RE.test(id)) return { error: "Product not found." };
  const staff = await manager();
  if ("error" in staff) return { error: staff.error };

  const kind = str(fd, "kind", 10);
  if (!["count", "restock", "waste"].includes(kind)) return { error: "Pick what kind of change this is." };
  const q = pieces(str(fd, "qty", 10));
  if (q === null || q === "invalid") return { error: "Enter a whole number of pieces.", field: "qty" };
  if (kind !== "count" && q === 0) return { error: "Enter at least 1 piece.", field: "qty" };
  let unitCost: number | null = null;
  const costRaw = str(fd, "unit_cost", 20);
  if (kind === "restock" && costRaw !== "") {
    unitCost = toCents(costRaw);
    if (unitCost === null || unitCost < 0) return { error: "Check the cost per piece.", field: "unit_cost" };
  }

  const { error } = await staff.supabase.rpc("adjust_stock", {
    p_product: id,
    p_kind: kind,
    p_qty: q,
    p_unit_cost_cents: unitCost,
    p_note: str(fd, "note", 200) || null,
  });
  if (error) return { error: friendlyError(error as DbError) };
  refresh(id);
  redirect(`/inventory/${id}?stock=${kind}`);
}
