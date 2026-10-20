// Sell: the register. Loads the active products, categories and the checkout rules.
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Main } from "@/components/Main";
import { Topbar } from "@/components/Topbar";
import { Register, type RegisterProduct } from "@/components/register/Register";
import { requireActiveStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { eyebrowDate } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function SellPage() {
  const { supabase, profile } = await requireActiveStaff();
  const [products, categories, settings] = await Promise.all([
    supabase
      .from("products")
      .select("id, brand, name, variant, barcode, price_cents, on_hand, category_id")
      .eq("active", true)
      .order("brand", { nullsFirst: true })
      .order("name")
      .order("variant", { nullsFirst: true }),
    supabase.from("categories").select("id, name").eq("active", true).order("sort_order").order("name"),
    supabase.from("settings").select("min_age, staff_discount_limit_cents, allow_negative_stock").maybeSingle(),
  ]);
  const s = settings.data as { min_age: number; staff_discount_limit_cents: number; allow_negative_stock: boolean } | null;
  const canEditProducts = can(profile, "editProducts");

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
          />
        )}
      </Main>
    </>
  );
}
