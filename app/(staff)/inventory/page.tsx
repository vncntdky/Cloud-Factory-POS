// Inventory: every product with what's on the shelf. ?f= all | low | out | hidden, ?q= search.
// Everyone sees stock levels; owners and managers also see costs and can add and change stock.
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { Kpi, KpiGrid } from "@/components/Kpi";
import { Main } from "@/components/Main";
import { Money } from "@/components/Money";
import { Topbar } from "@/components/Topbar";
import { requireActiveStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/db-errors";
import { productLabel } from "@/lib/format";
import { can } from "@/lib/permissions";
import { photoThumb } from "@/lib/photos";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  brand: string | null;
  name: string;
  variant: string | null;
  barcode: string | null;
  price_cents: number;
  on_hand: number;
  reorder_at: number;
  active: boolean;
  category_id: string | null;
  photo_path: string | null;
  /** Pieces held for customers, and who for. */
  reserved?: number;
  reservedFor?: string;
};

const FILTERS = [
  { id: "all", label: "For sale" },
  { id: "low", label: "Low stock" },
  { id: "out", label: "Out" },
  { id: "hidden", label: "Not for sale" },
  { id: "reserved", label: "Reserved" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

function matches(p: Row, f: Filter) {
  if (f === "reserved") return (p.reserved ?? 0) > 0;
  if (f === "hidden") return !p.active;
  if (!p.active) return false;
  if (f === "low") return p.on_hand <= p.reorder_at;
  if (f === "out") return p.on_hand <= 0;
  return true;
}

function StockChip({ p }: { p: Row }) {
  if (!p.active) return <span className="chip chip--hidden">Not for sale</span>;
  if (p.on_hand <= 0)
    return (
      <span className="chip chip--reorder">
        <Icon name="alert" />
        Out
      </span>
    );
  if (p.on_hand <= p.reorder_at) return <span className="chip chip--low">Low</span>;
  return null;
}

type SP = { f?: string; q?: string; deleted?: string };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { supabase, profile } = await requireActiveStaff();
  const sp = await searchParams;
  const filter: Filter = FILTERS.some((f) => f.id === sp.f) ? (sp.f as Filter) : "all";
  const q = (sp.q ?? "").trim().slice(0, 60);
  const manager = can(profile, "seeCosts");
  const editor = can(profile, "editProducts");

  const [productsRes, categoriesRes, costsRes, valueRes, heldRes] = await Promise.all([
    supabase
      .from("products")
      .select("id, brand, name, variant, barcode, price_cents, on_hand, reorder_at, active, category_id, photo_path")
      .order("brand", { nullsFirst: true })
      .order("name")
      .order("variant", { nullsFirst: true }),
    supabase.from("categories").select("id, name, sort_order").order("sort_order").order("name"),
    manager ? supabase.from("product_costs").select("product_id, cost_cents") : Promise.resolve({ data: [], error: null }),
    manager ? supabase.rpc("stock_value") : Promise.resolve({ data: null, error: null }),
    supabase.from("reservations").select("product_id, qty, customer_name").eq("status", "active").order("created_at"),
  ]);

  const all = (productsRes.data ?? []) as Row[];
  for (const r of (heldRes.data ?? []) as { product_id: string; qty: number; customer_name: string }[]) {
    const p = all.find((x) => x.id === r.product_id);
    if (!p) continue;
    p.reserved = (p.reserved ?? 0) + r.qty;
    p.reservedFor = p.reservedFor ? `${p.reservedFor}, ${r.customer_name}` : r.customer_name;
  }
  const categories = (categoriesRes.data ?? []) as { id: string; name: string }[];
  const costs = new Map(
    ((costsRes.data ?? []) as { product_id: string; cost_cents: number }[]).map((c) => [c.product_id, c.cost_cents]),
  );
  const value = valueRes.data as { cost_cents: number; retail_cents: number; pieces: number; uncosted: number } | null;

  const needle = q.toLowerCase();
  const shown = all.filter(
    (p) =>
      matches(p, filter) &&
      (!needle || productLabel(p).toLowerCase().includes(needle) || (p.barcode ?? "").toLowerCase().includes(needle)),
  );
  const count = (f: Filter) => all.filter((p) => matches(p, f)).length;
  const lowCount = count("low");
  // Thumbnails once any product has a photo; until then the list stays text-only.
  const thumbs = all.some((p) => p.photo_path);

  // Group by category, in the categories' order; products without one go last.
  const groups = [...categories, { id: "", name: "No category" }]
    .map((c) => ({ ...c, items: shown.filter((p) => (p.category_id ?? "") === c.id) }))
    .filter((g) => g.items.length > 0);

  const href = (f: Filter) => {
    const u = new URLSearchParams();
    if (f !== "all") u.set("f", f);
    if (q) u.set("q", q);
    const s = u.toString();
    return s ? `/inventory?${s}` : "/inventory";
  };

  return (
    <>
      <Topbar
        title="Inventory"
        actions={
          editor ? (
            <Link className="btn btn--money btn--sm" href="/inventory/new">
              <Icon name="plus" />
              Add product
            </Link>
          ) : undefined
        }
      />
      <Main>
        <div className="stack stack-6">
          {sp.deleted !== undefined && (
            <div className="notice notice--success" role="status">
              <Icon name="check" />
              <div>
                <p className="notice__title">
                  Product deleted
                  {Number(sp.deleted) > 0 ? ` with its ${sp.deleted} sale${sp.deleted === "1" ? "" : "s"}` : ""}.
                </p>
              </div>
            </div>
          )}
          {productsRes.error ? (
            <div className="notice notice--danger" role="alert">
              <Icon name="alert" />
              <div>
                <p className="notice__title">Couldn&apos;t load products.</p>
                <p>{friendlyError(productsRes.error)}</p>
              </div>
            </div>
          ) : (
            <>
              {manager && value && (
                <KpiGrid aria-label="Stock">
                  <Kpi
                    variant="hero"
                    wide
                    label="Stock at cost"
                    value={<Money cents={value.cost_cents} />}
                    meta={`${value.pieces} pcs · sells for ${new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(value.retail_cents / 100)}${value.uncosted ? ` · ${value.uncosted} without cost` : ""}`}
                  />
                  <Kpi
                    label="Low stock"
                    value={<span className="num">{lowCount}</span>}
                    href={lowCount > 0 ? "/inventory?f=low" : undefined}
                    variant={lowCount > 0 ? "alert" : undefined}
                  />
                  <Kpi label="Products" value={<span className="num">{count("all")}</span>} meta="for sale" />
                </KpiGrid>
              )}

              <form className="search search--lg" role="search" method="get" action="/inventory">
                <Icon name="search" className="search__icon" />
                {filter !== "all" && <input type="hidden" name="f" value={filter} />}
                <input
                  className="input"
                  type="search"
                  name="q"
                  defaultValue={q}
                  placeholder="Search name, flavour or barcode"
                  aria-label="Search products"
                  autoComplete="off"
                  enterKeyHint="search"
                />
                <kbd>/</kbd>
              </form>

              <div className="filter-row" role="toolbar" aria-label="Filter products">
                {FILTERS.map((f) => (
                  <Link key={f.id} className="filter-chip" href={href(f.id)} aria-current={filter === f.id ? "true" : undefined}>
                    {f.label} <span className="count">{count(f.id)}</span>
                  </Link>
                ))}
              </div>

              {all.length === 0 ? (
                <EmptyState
                  title="No products yet."
                  text={
                    editor
                      ? "Add each product you sell, with its price and how many are on the shelf."
                      : "Ask the owner or a manager to add products."
                  }
                  action={
                    editor ? (
                      <Link className="btn btn--money" href="/inventory/new">
                        <Icon name="plus" />
                        Add product
                      </Link>
                    ) : undefined
                  }
                />
              ) : groups.length === 0 ? (
                <EmptyState
                  compact
                  title={filter === "low" ? "Nothing is low. Shelves are stocked." : "No matches."}
                  action={
                    <Link className="text-btn" href="/inventory">
                      Show all products
                    </Link>
                  }
                />
              ) : (
                groups.map((g) => {
                  const low = g.items.filter((p) => p.active && p.on_hand > 0 && p.on_hand <= p.reorder_at).length;
                  const out = g.items.filter((p) => p.active && p.on_hand <= 0).length;
                  const pieces = g.items.reduce((n, p) => n + Math.max(0, p.on_hand), 0);
                  return (
                    // Categories start folded so the list stays short; a search or a single category opens them.
                    <details key={g.id || "none"} className="cat" open={q !== "" || groups.length === 1}>
                      <summary className="cat__head">
                        <span className="cat__main">
                          <span className="cat__name">{g.name}</span>
                          <span className="cat__meta">
                            {g.items.length} product{g.items.length === 1 ? "" : "s"} · {pieces} pcs on the shelf
                          </span>
                        </span>
                        {out > 0 && <span className="chip chip--reorder">{out} out</span>}
                        {low > 0 && <span className="chip chip--low">{low} low</span>}
                        <Icon name="chevron-down" className="cat__chevron" />
                      </summary>
                      <ul className="list list--plain cat__list" role="list">
                        {g.items.map((p) => {
                          const cost = costs.get(p.id);
                          const src = photoThumb(p.photo_path, 128);
                          return (
                            <li key={p.id}>
                              <Link className="list-row" href={`/inventory/${p.id}`}>
                                {thumbs && (
                                  <span className="list-row__lead thumb" aria-hidden="true">
                                    {src ? <img src={src} alt="" loading="lazy" decoding="async" /> : <Icon name="image" />}
                                  </span>
                                )}
                                <span className="list-row__main">
                                  <span className="list-row__title">
                                    <span>{productLabel(p)}</span>
                                    <StockChip p={p} />
                                  </span>
                                  <span className="list-row__meta">
                                    <Money cents={p.price_cents} />
                                    {manager && cost !== undefined && (
                                      <>
                                        {" "}
                                        · cost <Money cents={cost} />
                                      </>
                                    )}
                                    {p.barcode && ` · ${p.barcode}`}
                                    {(p.reserved ?? 0) > 0 && ` · ${p.reserved} reserved (${p.reservedFor})`}
                                  </span>
                                </span>
                                <span className="list-row__trail stock-count">
                                  <span className={`num-lg${p.on_hand <= 0 ? " num--danger" : ""}`}>{p.on_hand}</span>
                                  <span className="t-caption muted">pcs</span>
                                </span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  );
                })
              )}
            </>
          )}
        </div>
      </Main>
    </>
  );
}
