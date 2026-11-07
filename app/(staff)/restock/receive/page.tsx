// Receive a batch (owners and managers). ?suggested=1 starts each product at the Restock tab's
// suggested order.
import { Icon } from "@/components/Icon";
import { Main } from "@/components/Main";
import { NotAllowed } from "@/components/NotAllowed";
import { Topbar } from "@/components/Topbar";
import { ReceiveForm } from "@/components/restock/ReceiveForm";
import { requireActiveStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/db-errors";
import { can } from "@/lib/permissions";
import { addDays, manilaToday } from "@/lib/time";
import { loadReorderPlan } from "../data";

export const dynamic = "force-dynamic";

export default async function ReceiveBatchPage({ searchParams }: { searchParams: Promise<{ suggested?: string }> }) {
  const { supabase, profile } = await requireActiveStaff();
  if (!can(profile, "editStock")) return <NotAllowed title="Receive batch" what="Receiving stock" />;
  const { suggested } = await searchParams;
  const { products, error } = await loadReorderPlan(supabase);
  const today = manilaToday();

  return (
    <>
      <Topbar title="Receive batch" backHref="/restock" backLabel="Back to Restock" />
      <Main hasActionbar>
        <div className="stack stack-6 narrow">
          {error ? (
            <div className="notice notice--danger" role="alert">
              <Icon name="alert" />
              <div>
                <p className="notice__title">Couldn&apos;t load products.</p>
                <p>{friendlyError(error)}</p>
              </div>
            </div>
          ) : (
            <>
              <p className="t-sm muted">
                Enter what arrived in this supplier order. Each product&apos;s pieces go on the shelf, and the batch&apos;s sales
                show under Restock → Batches.
              </p>
              <ReceiveForm
                products={products.map((p) => ({
                  id: p.id,
                  brand: p.brand,
                  name: p.name,
                  variant: p.variant,
                  on_hand: p.on_hand,
                  cost_cents: p.cost_cents,
                  suggest: p.plan.suggest,
                }))}
                prefill={suggested === "1"}
                today={today}
                earliest={addDays(today, -60)}
              />
            </>
          )}
        </div>
      </Main>
    </>
  );
}
