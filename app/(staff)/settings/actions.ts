"use server";

// Shop settings (settings row id = 1) and staff accounts. Owner only; RLS enforces it too
// ("owner writes settings", "owner updates profiles", and a trigger that keeps one active owner).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveStaff } from "@/lib/auth";
import { toCents } from "@/lib/format";
import { UUID_RE } from "@/lib/ids";
import { ASSIGNABLE_ROLES, can } from "@/lib/permissions";

export type SettingsError = "forbidden" | "name" | "age" | "discount" | "text" | "save";
export type StaffError = "forbidden" | "role" | "name" | "last_owner" | "save";

function fail(code: SettingsError): never {
  redirect(`/settings?error=${code}#shop`);
}

/**
 * <form action={updateSettings}> with business_name, address, receipt_footer, min_age (18–30),
 * staff_discount_limit (pesos staff may take off a sale) and allow_negative_stock ("true" when ticked).
 */
export async function updateSettings(formData: FormData): Promise<void> {
  const { supabase, profile } = await requireActiveStaff();
  if (!can(profile, "editSettings")) fail("forbidden");

  const name = String(formData.get("business_name") ?? "").trim();
  if (!name || name.length > 60) fail("name");
  const address = String(formData.get("address") ?? "").trim();
  const footer = String(formData.get("receipt_footer") ?? "").replace(/\r\n?/g, "\n").trim();
  if (address.length > 200 || footer.length > 200) fail("text");
  const age = Number(String(formData.get("min_age") ?? "").trim());
  if (!Number.isInteger(age) || age < 18 || age > 30) fail("age");
  const discount = toCents(String(formData.get("staff_discount_limit") ?? "").trim() || "0");
  if (discount === null || discount < 0 || discount > 10_000_000) fail("discount");

  const { data, error } = await supabase
    .from("settings")
    .update({
      business_name: name,
      address: address || null,
      receipt_footer: footer || null,
      min_age: age,
      staff_discount_limit_cents: discount,
      allow_negative_stock: formData.get("allow_negative_stock") === "true",
    })
    .eq("id", 1)
    .select("id");
  if (error) fail("save");
  if (!data || data.length === 0) fail("forbidden");

  revalidatePath("/", "layout");
  redirect("/settings?saved=1#shop");
}

function staffFail(code: StaffError): never {
  redirect(`/settings?staff_error=${code}#staff`);
}

/** <form action={updateStaff.bind(null, id)}> with full_name, role and active ("true" when ticked). Owner only. */
export async function updateStaff(id: string, formData: FormData): Promise<void> {
  if (!UUID_RE.test(id)) staffFail("save");
  const { supabase, profile } = await requireActiveStaff();
  if (!can(profile, "manageStaff")) staffFail("forbidden");

  const role = String(formData.get("role") ?? "");
  if (!ASSIGNABLE_ROLES.some((r) => r.value === role)) staffFail("role");
  const name = String(formData.get("full_name") ?? "").trim().slice(0, 80);
  if (!name) staffFail("name");
  const active = formData.get("active") === "true";

  const { data, error } = await supabase.from("profiles").update({ full_name: name, role, active }).eq("id", id).select("id");
  if (error) staffFail(/at least one active owner/i.test(error.message) ? "last_owner" : "save");
  if (!data || data.length === 0) staffFail("forbidden");

  revalidatePath("/", "layout");
  redirect(`/settings?staff_saved=${id}#staff`);
}
