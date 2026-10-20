// Add a product (owners and managers).
import { Icon } from "@/components/Icon";
import { Main } from "@/components/Main";
import { NotAllowed } from "@/components/NotAllowed";
import { Topbar } from "@/components/Topbar";
import { ProductForm } from "@/components/inventory/ProductForms";
import { requireActiveStaff } from "@/lib/auth";
import { centsToInput, productLabel } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ added?: string }> }) {
  const { supabase, profile } = await requireActiveStaff();
  if (!can(profile, "editProducts")) return <NotAllowed title="Add product" what="Adding products" />;
  const { added } = await searchParams;

  const [categories, last, lastCost] = await Promise.all([
    supabase.from("categories").select("id, name").eq("active", true).order("sort_order").order("name"),
    isUuid(added)
      ? supabase.from("products").select("brand, name, variant, category_id, price_cents, reorder_at").eq("id", added).maybeSingle()
      : Promise.resolve({ data: null }),
    isUuid(added)
      ? supabase.from("product_costs").select("cost_cents").eq("product_id", added).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const prev = last.data as {
    brand: string | null;
    name: string;
    variant: string | null;
    category_id: string | null;
    price_cents: number;
    reorder_at: number;
  } | null;

  return (
    <>
      <Topbar title="Add product" backHref="/inventory" backLabel="Back to inventory" />
      <Main>
        <div className="stack stack-6 narrow">
          {prev && (
            <div className="notice notice--success" role="status">
              <Icon name="check" />
              <div>
                <p className="notice__title">Added {productLabel(prev)}.</p>
                <p>The next one starts with the same brand, product, category, price and cost. Change the flavour and barcode.</p>
              </div>
            </div>
          )}
          <ProductForm
            // A fresh form after each "Add and enter another".
            key={added ?? "new"}
            id={null}
            categories={(categories.data ?? []) as { id: string; name: string }[]}
            initial={{
              brand: prev?.brand ?? "",
              name: prev?.name ?? "",
              variant: "",
              barcode: "",
              category_id: prev?.category_id ?? "",
              price: prev ? centsToInput(prev.price_cents) : "",
              cost: lastCost.data ? centsToInput((lastCost.data as { cost_cents: number }).cost_cents) : "",
              reorder_at: String(prev?.reorder_at ?? 5),
              active: true,
            }}
          />
        </div>
      </Main>
    </>
  );
}
