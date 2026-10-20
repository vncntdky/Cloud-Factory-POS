// Settings & staff: your profile, theme, shop settings (owner edits) and staff accounts (owner).
import { cookies } from "next/headers";
import { Icon } from "@/components/Icon";
import { Main } from "@/components/Main";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Topbar } from "@/components/Topbar";
import { displayName, requireActiveStaff } from "@/lib/auth";
import { centsToInput, initials, pesos } from "@/lib/format";
import { ASSIGNABLE_ROLES, can, roleLabel } from "@/lib/permissions";
import { formatManila, formatManilaDate } from "@/lib/time";
import { updateSettings, updateStaff, type SettingsError, type StaffError } from "./actions";

export const dynamic = "force-dynamic";

type Settings = {
  business_name: string;
  address: string | null;
  receipt_footer: string | null;
  min_age: number;
  staff_discount_limit_cents: number;
  allow_negative_stock: boolean;
};

type StaffRow = {
  id: string;
  full_name: string;
  role: string;
  active: boolean;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
};

const ERRORS: Record<SettingsError, string> = {
  forbidden: "Only the owner can change shop settings.",
  name: "Add the shop name (up to 60 characters).",
  age: "The minimum age must be between 18 and 30.",
  discount: "Enter the staff discount limit in pesos, e.g. 50 (0 means staff can't discount).",
  text: "Keep the address and receipt message under 200 characters each.",
  save: "Couldn't save. Check your connection and try again.",
};

const STAFF_ERRORS: Record<StaffError, string> = {
  forbidden: "Only the owner can change staff accounts.",
  role: "Pick a role.",
  name: "Add their name.",
  last_owner: "There must always be at least one active owner. Make someone else owner first.",
  save: "Couldn't save. Check your connection and try again.",
};

type SP = { saved?: string; error?: string; staff_saved?: string; staff_error?: string };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { supabase, user, profile } = await requireActiveStaff();
  const sp = await searchParams;
  const owner = can(profile, "editSettings");
  const name = displayName(profile, user);
  const error = sp.error && sp.error in ERRORS ? ERRORS[sp.error as SettingsError] : null;
  const staffError = sp.staff_error && sp.staff_error in STAFF_ERRORS ? STAFF_ERRORS[sp.staff_error as StaffError] : null;

  const [settingsRes, staffRes, cookieStore] = await Promise.all([
    supabase
      .from("settings")
      .select("business_name, address, receipt_footer, min_age, staff_discount_limit_cents, allow_negative_stock")
      .maybeSingle(),
    can(profile, "manageStaff") ? supabase.rpc("staff_accounts") : Promise.resolve({ data: null, error: null }),
    cookies(),
  ]);
  const s = settingsRes.data as Settings | null;
  const theme = cookieStore.get("vp-theme")?.value ?? null;
  const staff = (staffRes.data ?? []) as StaffRow[];
  const waiting = staff.filter((p) => !p.active);
  const team = staff.filter((p) => p.active);

  return (
    <>
      <Topbar title={owner ? "Settings & staff" : "Settings"} />
      <Main>
        <div className="stack stack-6 settings narrow">
          <section className="inset-group" aria-labelledby="me-t">
            <h2 className="eyebrow inset-group__label" id="me-t">
              Your profile
            </h2>
            <ul className="inset-list" role="list">
              <li>
                <div className="inset-row">
                  <span className="avatar avatar--sm" aria-hidden="true">
                    {initials(name)}
                  </span>
                  <span className="inset-row__label">{name}</span>
                  <span className="chip chip--role">{roleLabel(profile.role)}</span>
                </div>
              </li>
              {user.email && (
                <li>
                  <div className="inset-row">
                    <span className="inset-row__label">Email</span>
                    <span className="inset-row__value">{user.email}</span>
                  </div>
                </li>
              )}
              <li>
                <div className="inset-row settings__theme">
                  <span className="inset-row__label">Theme</span>
                  <ThemeToggle initial={theme} />
                </div>
              </li>
              <li>
                <form action="/auth/signout" method="post">
                  <button type="submit" className="inset-row inset-row--danger">
                    <Icon name="signout" size={20} />
                    Sign out
                  </button>
                </form>
              </li>
            </ul>
          </section>

          <section className="inset-group" id="shop" aria-labelledby="shop-t">
            <h2 className="eyebrow inset-group__label" id="shop-t">
              Shop
            </h2>
            {sp.saved && !error && (
              <div className="notice notice--success" role="status">
                <Icon name="check" />
                <p className="notice__title">Settings saved.</p>
              </div>
            )}
            {error && (
              <div className="notice notice--danger" role="alert">
                <Icon name="alert" />
                <p className="notice__title">{error}</p>
              </div>
            )}

            {owner && s ? (
              <form action={updateSettings} className="card form">
                <div className="form-grid form-grid--2">
                  <div className="field span-all">
                    <label className="field__label" htmlFor="s-name">
                      Shop name
                    </label>
                    <input className="input" id="s-name" name="business_name" defaultValue={s.business_name} maxLength={60} required />
                  </div>
                  <div className="field span-all">
                    <label className="field__label" htmlFor="s-address">
                      Address on receipts <span className="optional">(optional)</span>
                    </label>
                    <input className="input" id="s-address" name="address" defaultValue={s.address ?? ""} maxLength={200} />
                  </div>
                  <div className="field span-all">
                    <label className="field__label" htmlFor="s-footer">
                      Receipt message <span className="optional">(optional)</span>
                    </label>
                    <input className="input" id="s-footer" name="receipt_footer" defaultValue={s.receipt_footer ?? ""} maxLength={200} />
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="s-age">
                      Minimum age
                    </label>
                    <input
                      className="input input--num"
                      id="s-age"
                      name="min_age"
                      inputMode="numeric"
                      defaultValue={s.min_age}
                      required
                      aria-describedby="s-age-h"
                    />
                    <p className="field__hint" id="s-age-h">
                      Every sale needs the cashier to confirm the customer is this age or older. The Philippines&apos;
                      Vape Law sets 18.
                    </p>
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="s-discount">
                      Staff discount limit
                    </label>
                    <div className="input-affix">
                      <span className="input-affix__prefix input-affix__prefix--lg">₱</span>
                      <input
                        className="input input--num"
                        id="s-discount"
                        name="staff_discount_limit"
                        inputMode="decimal"
                        defaultValue={centsToInput(s.staff_discount_limit_cents)}
                        aria-describedby="s-discount-h"
                      />
                    </div>
                    <p className="field__hint" id="s-discount-h">
                      The most Staff can take off one sale. Bigger discounts need you or a manager. 0 = no discounts.
                    </p>
                  </div>
                  <label className="check-row span-all" htmlFor="s-negative">
                    <input
                      id="s-negative"
                      type="checkbox"
                      className="check"
                      name="allow_negative_stock"
                      value="true"
                      defaultChecked={s.allow_negative_stock}
                    />
                    <span className="grow">
                      <span className="check-row__title">Let the register sell more than the stock count</span>
                      <span className="t-sm muted">
                        Leave this off so mistakes in the count show up. Turn it on only while you&apos;re still entering
                        stock.
                      </span>
                    </span>
                  </label>
                </div>
                <div className="btn-row">
                  <button type="submit" className="btn btn--primary">
                    Save settings
                  </button>
                </div>
              </form>
            ) : (
              s && (
                <ul className="inset-list" role="list">
                  <li>
                    <div className="inset-row">
                      <span className="inset-row__label">Shop name</span>
                      <span className="inset-row__value">{s.business_name}</span>
                    </div>
                  </li>
                  <li>
                    <div className="inset-row">
                      <span className="inset-row__label">Minimum age</span>
                      <span className="inset-row__value">{s.min_age}+</span>
                    </div>
                  </li>
                  <li>
                    <div className="inset-row">
                      <span className="inset-row__label">Staff discount limit</span>
                      <span className="inset-row__value">{pesos(s.staff_discount_limit_cents)}</span>
                    </div>
                  </li>
                </ul>
              )
            )}
          </section>

          {can(profile, "manageStaff") && (
            <section className="inset-group" id="staff" aria-labelledby="staff-t">
              <h2 className="eyebrow inset-group__label" id="staff-t">
                Staff <span className="num">· {team.length}</span>
              </h2>
              {staffError && (
                <div className="notice notice--danger" role="alert">
                  <Icon name="alert" />
                  <p className="notice__title">{staffError}</p>
                </div>
              )}
              {sp.staff_saved && !staffError && (
                <div className="notice notice--success" role="status">
                  <Icon name="check" />
                  <p className="notice__title">Saved. The change applies the next time they open a page.</p>
                </div>
              )}
              {staffRes.error ? (
                <div className="notice notice--danger" role="alert">
                  <Icon name="alert" />
                  <p className="notice__title">The staff list didn&apos;t load.</p>
                </div>
              ) : (
                <>
                  <ul className="t-sm muted staff-roles" id="staff-roles-h">
                    {ASSIGNABLE_ROLES.map((r) => (
                      <li key={r.value}>
                        <strong>{r.label}</strong>: {r.hint}.
                      </li>
                    ))}
                  </ul>
                  {waiting.length > 0 && (
                    <div className="stack stack-3">
                      <h3 className="t-sm" style={{ fontWeight: 600 }}>
                        Waiting for you <span className="num muted">· {waiting.length}</span>
                      </h3>
                      <p className="t-sm muted">
                        These people signed up but can&apos;t see anything yet. Only turn on accounts you recognise by
                        email.
                      </p>
                      {waiting.map((p) => (
                        <StaffCard key={p.id} p={p} me={profile.id} />
                      ))}
                    </div>
                  )}
                  <div className="stack stack-3">
                    {team.map((p) => (
                      <StaffCard key={p.id} p={p} me={profile.id} />
                    ))}
                  </div>
                </>
              )}
              <div className="notice notice--info">
                <Icon name="info" />
                <div>
                  <p className="notice__title">Adding someone new</p>
                  <p>
                    Ask them to open this app, tap &ldquo;Create a staff account&rdquo; on the sign-in screen and sign
                    up with their email. They&apos;ll appear above under &ldquo;Waiting for you&rdquo;. Pick their role
                    and tick &ldquo;Can sign in&rdquo;. To remove someone, untick &ldquo;Can sign in&rdquo;.
                  </p>
                </div>
              </div>
            </section>
          )}
        </div>
      </Main>
    </>
  );
}

function StaffCard({ p, me }: { p: StaffRow; me: string }) {
  const pName = p.full_name?.trim() || "";
  const role = ASSIGNABLE_ROLES.some((r) => r.value === p.role) ? p.role : "cashier";
  return (
    <form action={updateStaff.bind(null, p.id)} className="card stack" aria-label={`Staff account ${pName || p.email || ""}`}>
      <div className="row" style={{ gap: "var(--space-3)", alignItems: "center" }}>
        <span className={`avatar avatar--sm${p.active ? "" : " avatar--walkin"}`} aria-hidden="true">
          {initials(pName || p.email || "?")}
        </span>
        <span className="grow staff-card__who">
          <span className="list-row__title">
            <span>{pName || "No name yet"}</span>
            {p.id === me && <span className="muted"> (you)</span>}
          </span>
          <span className="staff-card__meta">{p.email ?? "No email"}</span>
          <span className="staff-card__meta">
            Joined {formatManilaDate(p.created_at, { weekday: false })}
            {p.last_sign_in_at ? ` · last signed in ${formatManila(p.last_sign_in_at)}` : ""}
          </span>
        </span>
        {p.active ? (
          <span className="chip chip--ok">
            <Icon name="check" />
            {roleLabel(p.role)}
          </span>
        ) : (
          <span className="chip chip--uncounted">
            <Icon name="clock" />
            Waiting
          </span>
        )}
      </div>
      <div className="form-grid form-grid--2">
        <div className="field">
          <label className="field__label" htmlFor={`sf-name-${p.id}`}>
            Name
          </label>
          <input id={`sf-name-${p.id}`} name="full_name" className="input" defaultValue={pName} maxLength={80} required />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`sf-role-${p.id}`}>
            Role
          </label>
          <div className="select-wrap">
            <select id={`sf-role-${p.id}`} name="role" className="select" defaultValue={role} aria-describedby="staff-roles-h">
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="check-row span-all" htmlFor={`sf-active-${p.id}`}>
          <input id={`sf-active-${p.id}`} type="checkbox" className="check" name="active" value="true" defaultChecked={p.active} />
          <span className="grow">
            <span className="check-row__title">Can sign in</span>
            <span className="t-sm muted">
              {p.id === me
                ? "Unticking this locks you out."
                : p.active
                  ? "Untick to remove their access. Their past sales stay."
                  : "Tick to let them in with the role above."}
            </span>
          </span>
        </label>
      </div>
      <div className="btn-row">
        <button type="submit" className="btn btn--secondary">
          Save
        </button>
      </div>
    </form>
  );
}
