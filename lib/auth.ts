// Server-side auth helpers for staff pages, layouts and server actions.
import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type StaffRole = "owner" | "manager" | "cashier";

export type Profile = {
  id: string;
  full_name: string;
  role: StaffRole;
  active: boolean;
};

export type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

export type Staff = {
  supabase: ServerSupabase;
  user: User;
  profile: Profile;
};

// One getUser + profile read per request, shared by the layout and the page.
const loadStaff = cache(async (): Promise<Staff | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, role, active")
    .eq("id", user.id)
    .maybeSingle();
  const row = data as Partial<Profile> | null;
  const profile: Profile = {
    id: user.id,
    full_name: row?.full_name ?? "",
    role: (row?.role as StaffRole) ?? "cashier",
    active: row?.active === true,
  };
  return { supabase, user, profile };
});

/**
 * Signed-in staff member, or a redirect to /login. The profile may be inactive:
 * the (staff) layout shows the "waiting for activation" notice instead of the page,
 * and RLS returns nothing to inactive accounts anyway.
 */
export async function requireStaff(): Promise<Staff> {
  const staff = await loadStaff();
  if (!staff) redirect("/login");
  return staff;
}

/**
 * For server actions: like requireStaff, but throws when the account isn't active yet,
 * so an action never runs half-way for an inactive user.
 */
export async function requireActiveStaff(): Promise<Staff> {
  const staff = await requireStaff();
  if (!staff.profile.active) {
    throw new Error("Your account is waiting for the owner to activate it.");
  }
  return staff;
}

/** Owners and managers (active). For finer checks use can() from lib/permissions. */
export function isManager(profile: Pick<Profile, "role" | "active"> | null | undefined) {
  return !!profile && profile.active && (profile.role === "owner" || profile.role === "manager");
}

/** The owner (active). */
export function isOwner(profile: Pick<Profile, "role" | "active"> | null | undefined) {
  return !!profile && profile.active && profile.role === "owner";
}

/** Name to show for the signed-in person. */
export function displayName(profile: Pick<Profile, "full_name"> | null | undefined, user?: Pick<User, "email"> | null) {
  return profile?.full_name?.trim() || user?.email?.split("@")[0] || "Staff";
}
