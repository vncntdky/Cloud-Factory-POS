// One product: what's on the shelf, its photo, change stock, edit details, stock history.
// Staff see the stock level and can change the photo; owners and managers edit and see the history and cost.
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Kpi, KpiGrid } from "@/components/Kpi";
import { Main } from "@/components/Main";
import { Money } from "@/components/Money";
import { Topbar } from "@/components/Topbar";
import { DeleteProduct, type ProductUsage } from "@/components/inventory/DeleteProduct";
import { ProductForm, StockForm } from "@/components/inventory/ProductForms";
import { StockFix } from "@/components/inventory/StockFix";
import { ProductPhoto } from "@/components/inventory/ProductPhoto";
import { requireActiveStaff, type ServerSupabase } from "@/lib/auth";
import { lastBatchOf, loadBatchOptions } from "@/lib/batches";
import { centsToInput, productLabel, saleNo } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { can } from "@/lib/permissions";
import { formatManila, formatManilaDate, manilaToday } from "@/lib/time";
import { Reservations, type Reservation } from "@/components/inventory/Reservations";

export const dynamic = "force-dynamic";

type Product = {
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
};

type Movement = {
  id: string;
  kind: "opening" | "sale" | "void" | "restock" | "count" | "waste";
  delta: number;
  on_hand_after: number;
  note: string | null;
  unit_cost_cents: number | null;
  created_at: string;
  batch_id: string | null;
  sale: { id: string; sale_number: number } | null;
  who: { full_name: string } | null;
};

const KIND_LABELS: Record<Movement["kind"], string> = {
  opening: "Opening stock",
  sale: "Sold",
  void: "Sale voided",
  restock: "Restock",
  count: "Count",
  waste: "Damaged / lost",
};

const SAVED: Record<string, string> = {
  restock: "Restock saved.",
  count: "Count saved.",
  waste: "Loss saved.",
};

/** What deleting this product would take with it (owner's Delete product dialog). */
async function loadUsage(supabase: ServerSupabase, id: string): Promise<ProductUsage> {
  const [moves, items] = await Promise.all([
    supabase.from("stock_movements").select("id", { count: "exact", head: true }).eq("product_id", id),
    supabase.from("sale_items").select("sale_id").eq("product_id", id),
  ]);
  const saleIds = [...new Set(((items.data ?? []) as { sale_id: string }[]).map((r) => r.sale_id))];
  if (saleIds.length === 0) return { moves: moves.count ?? 0, sales: 0, mixed: 0, salesCents: 0 };
  const [others, sales] = await Promise.all([
    supabase.from("sale_items").select("sale_id").in("sale_id", saleIds).or(`product_id.neq.${id},product_id.is.null`),
    supabase.from("sales").select("total_cents, status").in("id", saleIds),
  ]);
  return {
    moves: moves.count ?? 0,
    sales: saleIds.length,
    mixed: new Set(((others.data ?? []) as { sale_id: string }[]).map((r) => r.sale_id)).size,
    salesCents: ((sales.data ?? []) as { total_cents: number; status: string }[])
      .filter((s) => s.status === "completed")
      .reduce((n, s) => n + s.total_cents, 0),
  };
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; stock?: string; photo?: string; fixed?: string; reserved?: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase, profile } = await requireActiveStaff();
  const editor = can(profile, "editProducts");
  const sp = await searchParams;

  const owner = can(profile, "deleteRecords");

  const [productRes, categoriesRes, costRes, movesRes, usage, resRes, batches, lastBatch] = await Promise.all([
    supabase
      .from("products")
      .select("id, brand, name, variant, barcode, price_cents, on_hand, reorder_at, active, category_id, photo_path")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("categories").select("id, name").order("sort_order").order("name"),
    editor ? supabase.from("product_costs").select("cost_cents").eq("product_id", id).maybeSingle() : Promise.resolve({ data: null }),
    editor
      ? supabase
          .from("stock_movements")
          .select("id, kind, delta, on_hand_after, note, unit_cost_cents, created_at, batch_id, sale:sales(id, sale_number), who:profiles!stock_movements_created_by_fkey(full_name)")
          .eq("product_id", id)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] }),
    owner ? loadUsage(supabase, id) : Promise.resolve(null),
    supabase
      .from("reservations")
      .select("id, customer_name, qty, note, hold_until, created_at")
      .eq("product_id", id)
      .eq("status", "active")
      .order("created_at"),
    editor ? loadBatchOptions(supabase) : Promise.resolve([]),
    editor ? lastBatchOf(supabase, id) : Promise.resolve(null),
  ]);
  const batchName = new Map(batches.map((b) => [b.id, b.label.split(" · ")[0]]));
  if (!productRes.data) notFound();
  const p = productRes.data as Product;
  const categories = (categoriesRes.data ?? []) as { id: string; name: string }[];
  const cost = (costRes.data as { cost_cents: number } | null)?.cost_cents ?? null;
  const moves = (movesRes.data ?? []) as unknown as Movement[];
  const category = categories.find((c) => c.id === p.category_id)?.name;
  const low = p.on_hand <= p.reorder_at;
  const reservations = (resRes.data ?? []) as Reservation[];
  const notice = sp.stock
    ? SAVED[sp.stock]
    : sp.fixed === "edited"
      ? "Stock change fixed."
      : sp.fixed === "removed"
        ? "Stock change removed."
        : sp.reserved === "1"
          ? "Reserved."
          : sp.reserved === "cancelled"
            ? "Reservation cancelled."
        : sp.saved
          ? "Product saved."
          : null;

  return (
    <>
      <Topbar title={productLabel(p)} backHref="/inventory" backLabel="Back to inventory" />
      <Main>
        <div className="stack stack-6 narrow">
          {notice && (
            <div className="notice notice--success" role="status">
              <Icon name="check" />
              <div>
                <p className="notice__title">{notice}</p>
              </div>
            </div>
          )}
          {sp.photo === "failed" && !p.photo_path && (
            <div className="notice notice--danger" role="alert">
              <Icon name="alert" />
              <div>
                <p className="notice__title">The photo didn&apos;t upload.</p>
                <p>Tap Upload photo below to try again.</p>
              </div>
            </div>
          )}
          {!p.active && (
            <div className="notice" role="status">
              <Icon name="info" />
              <div>
                <p className="notice__title">Not for sale.</p>
                <p>It&apos;s hidden from the register. Tick “For sale” below to sell it again.</p>
              </div>
            </div>
          )}

          <KpiGrid aria-label="Stock">
            <Kpi
              variant={p.on_hand <= 0 ? "alert" : low ? "alert" : "hero"}
              wide
              label="On the shelf"
              value={<span className="num">{p.on_hand} pcs</span>}
              meta={p.on_hand <= 0 ? "Out of stock" : low ? `Low · alert at ${p.reorder_at}` : `Alert at ${p.reorder_at}`}
            />
            <Kpi label="Price" value={<Money cents={p.price_cents} />} meta={category} />
            {editor && (
              <Kpi
                label="Cost"
                value={cost === null ? "–" : <Money cents={cost} />}
                meta={
                  cost !== null && p.price_cents > 0
                    ? `${Math.round(((p.price_cents - cost) / p.price_cents) * 100)}% margin`
                    : cost === null
                      ? "Not set"
                      : undefined
                }
              />
            )}
          </KpiGrid>

          <ProductPhoto id={p.id} path={p.photo_path} label={productLabel(p)} />

          {p.barcode && (
            <p className="t-sm muted">
              <Icon name="scan" size={16} /> Barcode {p.barcode}
            </p>
          )}

          <Reservations
            productId={p.id}
            free={Math.max(0, p.on_hand - reservations.reduce((n, r) => n + r.qty, 0))}
            reservations={reservations}
            today={manilaToday()}
            dateLabel={Object.fromEntries(
              reservations.map((r) => [r.id, r.hold_until ? `hold until ${formatManilaDate(r.hold_until)}` : `since ${formatManilaDate(r.created_at)}`]),
            )}
          />

          {editor ? (
            <>
              <StockForm id={p.id} batches={batches} defaultBatch={lastBatch} />
              <ProductForm
                id={p.id}
                categories={categories}
                initial={{
                  brand: p.brand ?? "",
                  name: p.name,
                  variant: p.variant ?? "",
                  barcode: p.barcode ?? "",
                  category_id: p.category_id ?? "",
                  price: centsToInput(p.price_cents),
                  cost: cost === null ? "" : centsToInput(cost),
                  reorder_at: String(p.reorder_at),
                  active: p.active,
                }}
              />
              <section className="card card--flush" aria-labelledby="history-t">
                <div className="card__head">
                  <h2 className="card__title" id="history-t">
                    Stock history
                  </h2>
                  <span className="t-caption muted">Last 50</span>
                </div>
                {moves.length === 0 ? (
                  <p className="card__body t-sm muted">No stock changes yet.</p>
                ) : (
                  <ul className="list list--plain" role="list">
                    {moves.map((m) => (
                      <li key={m.id} className="list-row list-row--compact list-row--wrap">
                        <span className="list-row__main">
                          <span className="list-row__title">
                            <span>
                              {KIND_LABELS[m.kind]}
                              {m.sale && (
                                <>
                                  {" · "}
                                  <a href={`/sales/${m.sale.id}`}>{saleNo(m.sale.sale_number)}</a>
                                </>
                              )}
                            </span>
                          </span>
                          <span className="list-row__meta">
                            {formatManila(m.created_at)}
                            {m.batch_id && batchName.has(m.batch_id) && ` · ${batchName.get(m.batch_id)}`}
                            {m.who?.full_name && ` · ${m.who.full_name}`}
                            {m.unit_cost_cents !== null && (
                              <>
                                {" · "}
                                <Money cents={m.unit_cost_cents} /> each
                              </>
                            )}
                            {m.note && ` · ${m.note}`}
                          </span>
                        </span>
                        <span className="list-row__trail stock-count">
                          <span className={`num delta${m.delta > 0 ? " delta--in" : m.delta < 0 ? " delta--out" : ""}`}>
                            {m.delta > 0 ? `+${m.delta}` : m.delta === 0 ? "±0" : `−${Math.abs(m.delta)}`}
                          </span>
                          <span className="t-caption muted">→ {m.on_hand_after}</span>
                        </span>
                        {m.kind !== "sale" && m.kind !== "void" && (
                          <StockFix change={{ ...m, kind: m.kind }} productId={p.id} />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              {usage && <DeleteProduct id={p.id} label={productLabel(p)} usage={usage} />}
            </>
          ) : (
            <p className="t-sm muted">Owners and managers record restocks and counts.</p>
          )}
        </div>
      </Main>
    </>
  );
}
