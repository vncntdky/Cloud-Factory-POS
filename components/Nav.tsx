"use client";

// App shell navigation: side rail/sidebar (≥768) and bottom tab bar (phone), the .app frame and
// desktop keyboard shortcuts.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { ThemeToggle } from "@/components/ThemeToggle";
import { initials } from "@/lib/format";
import { roleLabel } from "@/lib/permissions";

function isCurrent(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export type ShellUser = {
  name: string;
  role: string;
  /** Owner: settings and staff. */
  owner: boolean;
};

export type ShellCounts = {
  /** Active products at or under their reorder level. */
  reorder: number | null;
};

type NavItem = { href: string; label: string; icon: IconName; count?: number | null };

function navItems(counts: ShellCounts, user: ShellUser): NavItem[] {
  return [
    { href: "/", label: "Sell", icon: "cart" },
    { href: "/sales", label: "Sales", icon: "receipt" },
    { href: "/inventory", label: "Inventory", icon: "box", count: counts.reorder },
    { href: "/settings", label: user.owner ? "Settings & staff" : "Settings", icon: "settings" },
  ];
}

export function AppFrame({ children }: { children: ReactNode }) {
  return <div className="app">{children}</div>;
}

function Who({ user }: { user: ShellUser }) {
  return (
    <div className="sidenav__who">
      <span className="avatar avatar--sm" aria-hidden="true">
        {initials(user.name)}
      </span>
      <div className="stack stack-2">
        <span className="t-sm">{user.name}</span>
        <span className="chip chip--role">{roleLabel(user.role)}</span>
      </div>
    </div>
  );
}

export function SideNav({
  user,
  counts,
  theme,
  shopName,
}: {
  user: ShellUser;
  counts: ShellCounts;
  theme: string | null;
  shopName: string;
}) {
  const pathname = usePathname() ?? "/";
  return (
    <nav className="sidenav" aria-label="Main">
      <Link className="sidenav__brand" href="/" aria-label={`${shopName}, Sell`}>
        <span className="logo" aria-hidden="true">
          {initials(shopName).slice(0, 1)}
        </span>
        <span className="wordmark">{shopName}</span>
      </Link>
      <ul className="sidenav__list" role="list">
        {navItems(counts, user).map((item) => {
          const current = isCurrent(pathname, item.href);
          const count = item.count ?? 0;
          return (
            <li key={item.href}>
              <Link className="sidenav__link" href={item.href} aria-current={current ? "page" : undefined}>
                <Icon name={item.icon} />
                <span className="sidenav__label">{item.label}</span>
                {count > 0 && (
                  <>
                    <span className="count-badge sidenav__count count-badge--attention" aria-hidden="true">
                      {count}
                    </span>
                    <span className="sr-only">, {count} low on stock</span>
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="sidenav__footer">
        <Who user={user} />
        <ThemeToggle initial={theme} />
        <form action="/auth/signout" method="post">
          <button type="submit" className="btn btn--ghost btn--sm sidenav__signout">
            <Icon name="signout" />
            <span className="sidenav__label">Sign out</span>
          </button>
        </form>
      </div>
    </nav>
  );
}

/** Bottom tab bar (phone). Theme and sign out live on the Settings page. */
export function PhoneNav({ user, counts }: { user: ShellUser; counts: ShellCounts }) {
  const pathname = usePathname() ?? "/";
  return (
    <nav className="tabbar" aria-label="Main">
      {navItems(counts, user).map((item) => {
        const count = item.count ?? 0;
        return (
          <Link
            key={item.href}
            className="tabbar__item"
            href={item.href}
            aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
          >
            <span className="tabbar__icon">
              <Icon name={item.icon} />
              {count > 0 && <span className="attention-dot" aria-hidden="true" />}
            </span>
            {item.label === "Settings & staff" ? "Settings" : item.label}
            {count > 0 && <span className="sr-only">, {count} low on stock</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/** Desktop shortcut: "/" focuses the page search (on Sell, the scan / search box). Esc is native on <dialog>. */
export function ShellKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector("dialog[open]")) return;
      if (e.key === "/") {
        const input = document.querySelector<HTMLInputElement>("main .search input");
        if (input) {
          e.preventDefault();
          input.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
