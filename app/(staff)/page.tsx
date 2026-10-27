// Sell: the register. Loads the active products, categories, the checkout rules and the names of
// buyers who still owe (suggested in the buyer field, so the same person is spelled the same way).
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Main } from "@/components/Main";
import { Topbar } from "@/components/Topbar";
import { Register, type RegisterProduct } from "@/components/register/Register";
import { requireActiveStaff } from "@/lib/auth";
import { buyerKey } from "@/lib/format";
import { can } from "@/lib/permissions";
import { eyebrowDate } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function SellPage() {
  const { supabase, profile } = await requireActiveStaff();
  const [products, categories, settings, owed] = await Promise.all([
    supabase
      .from("products")
      .select("id, brand, name, variant, barcode, price_cents, on_hand, category_id, photo_path")
      .eq("active", true)
      .order("brand", { nullsFirst: true })
      .order("name")
      .order("variant", { nullsFirst: true }),
    supabase.from("categories").select("id, name").eq("active", true).order("sort_order").order("name"),
    supabase.from("settings").select("min_age, staff_discount_limit_cents, allow_negative_stock").maybeSingle(),
    supabase.rpc("collectibles"),
  ]);
  const s = settings.data as { min_age: number; staff_discount_limit_cents: number; allow_negative_stock: boolean } | null;
  const canEditProducts = can(profile, "editProducts");
  const buyerNames = new Map<string, string>();
  for (const o of (owed.data ?? []) as { customer_name: string | null }[]) {
    if (o.customer_name && !buyerNames.has(buyerKey(o.customer_name))) buyerNames.set(buyerKey(o.customer_name), o.customer_name.trim());
  }

  return (
    <>
      <Topbar
        title="Sell"
        eyebrow={eyebrowDate()}
        actions={
          canEditProducts ? (
            <Link className="btn btn--secondary btn--sm" href="/inventory/new">
              <Icon name="plus" />
              Product
            </Link>
          ) : undefined
        }
      />
      <Main className="page--register">
        {products.error ? (
          <div className="notice notice--danger" role="alert">
            <Icon name="alert" />
            <div>
              <p className="notice__title">Couldn&apos;t load products.</p>
              <p>Check your connection and reload the page.</p>
            </div>
          </div>
        ) : (
          <Register
            products={(products.data ?? []) as RegisterProduct[]}
            categories={(categories.data ?? []) as { id: string; name: string }[]}
            minAge={s?.min_age ?? 18}
            discountLimitCents={can(profile, "unlimitedDiscount") ? null : s?.staff_discount_limit_cents ?? 0}
            allowNegative={s?.allow_negative_stock ?? false}
            canEditProducts={canEditProducts}
            buyerNames={[...buyerNames.values()].sort((a, b) => a.localeCompare(b))}
          />
        )}
      </Main>
    </>
  );
}
