// App shell for every staff page. requireStaff() protects the whole group; inactive accounts
// see the "waiting for activation" notice instead of the page.
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { Ring } from "@/components/EmptyState";
import { AppFrame, PhoneNav, ShellKeys, SideNav, type ShellCounts } from "@/components/Nav";
import { Toaster } from "@/components/Toaster";
import { displayName, requireStaff, type ServerSupabase } from "@/lib/auth";
import { can } from "@/lib/permissions";

async function loadShell(supabase: ServerSupabase): Promise<{ counts: ShellCounts; shopName: string }> {
  const [products, settings] = await Promise.all([
    supabase.from("products").select("on_hand, reorder_at").eq("active", true),
    supabase.from("settings").select("business_name").maybeSingle(),
  ]);
  const rows = (products.data ?? []) as { on_hand: number; reorder_at: number }[];
  return {
    counts: { reorder: products.error ? null : rows.filter((r) => r.on_hand <= r.reorder_at).length },
    shopName: (settings.data as { business_name?: string } | null)?.business_name ?? "Vape POS",
  };
}

export default async function StaffLayout({ children }: { children: ReactNode }) {
  const { supabase, user, profile } = await requireStaff();
  const name = displayName(profile, user);

  if (!profile.active) {
    return (
      <main className="login" id="main">
        <Ring className="login__ring" />
        <div className="login__card">
          <div className="login__brand">
            <span className="logo logo--lg" aria-hidden="true">
              V
            </span>
            <h1 className="t-display">Vape POS</h1>
            <p className="eyebrow">Staff</p>
          </div>
          <div className="notice" role="status">
            <Icon name="clock" />
            <div>
              <p className="notice__title">Waiting for the owner to activate your account.</p>
              <p>
                You&apos;re signed in as {user.email}. Once the owner turns your account on in Settings, the register
                and stock will show here.
              </p>
            </div>
          </div>
          <form action="/auth/signout" method="post">
            <button type="submit" className="btn btn--ghost btn--block">
              Sign out
            </button>
          </form>
        </div>
      </main>
    );
  }

  const [{ counts, shopName }, cookieStore] = await Promise.all([loadShell(supabase), cookies()]);
  const theme = cookieStore.get("vp-theme")?.value ?? null;
  const shellUser = { name, role: profile.role, owner: can(profile, "manageStaff") };

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <AppFrame>
        <SideNav user={shellUser} counts={counts} theme={theme} shopName={shopName} />
        <div className="app__body">{children}</div>
        <PhoneNav user={shellUser} counts={counts} />
        <Toaster />
        <ShellKeys />
      </AppFrame>
    </>
  );
}
