// Who can do what. The database enforces every one of these (see supabase/migrations/); the app
// uses this map only to decide what to show, so a hidden button is never the only thing standing
// in the way.
import type { Profile, StaffRole } from "@/lib/auth";

export type Capability =
  | "seeCosts" // product costs, cost of goods, profit, stock value
  | "seeInventory"
  | "editProducts" // add and edit products, prices, costs
  | "editStock" // count, restock, waste
  | "seeSalesHistory" // past days on Sales, CSV export
  | "unlimitedDiscount"
  | "voidSales"
  | "editSettings"
  | "manageStaff"; // roles, activate, deactivate

const MANAGER: Capability[] = [
  "seeCosts",
  "seeInventory",
  "editProducts",
  "editStock",
  "seeSalesHistory",
  "unlimitedDiscount",
  "voidSales",
];

export function can(profile: Pick<Profile, "role" | "active"> | null | undefined, cap: Capability): boolean {
  if (!profile?.active) return false;
  if (profile.role === "owner") return true;
  if (profile.role === "manager") return MANAGER.includes(cap);
  return false; // cashier = Staff
}

export function roleLabel(role: StaffRole | string | null | undefined) {
  if (role === "owner") return "Owner";
  if (role === "manager") return "Manager";
  return "Staff";
}

/** Roles the owner can assign in the app. */
export const ASSIGNABLE_ROLES: { value: StaffRole; label: string; hint: string }[] = [
  { value: "owner", label: "Owner", hint: "Everything, including settings and staff" },
  { value: "manager", label: "Manager", hint: "Runs the shop: products, prices, stock, all sales, voids. No settings or staff" },
  { value: "cashier", label: "Staff", hint: "Sells and sees today's sales. No costs or stock changes" },
];
