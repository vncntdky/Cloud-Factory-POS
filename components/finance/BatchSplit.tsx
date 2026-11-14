// A batch's owner / manager split: each share of its net profit so far, and of its net profit when
// the pieces left sell at today's prices. These are the batch's own shares, before the shop's
// general expenses; what can be paid out is "Safe to distribute" on Finance → Overview.
// Used under each batch's statement on Sales → Finance → Batches and on the batch's own page.
import type { BatchStatement } from "@/app/(staff)/restock/data";
import { Kpi, KpiGrid } from "@/components/Kpi";
import { Money } from "@/components/Money";
import { splitProfit } from "@/lib/pnl";

export function BatchSplit({ st, split }: { st: BatchStatement; split: { owner: number; manager: number } }) {
  const now = splitProfit(st.netProfit, split.owner, split.manager);
  const later = splitProfit(st.whenSoldOut, split.owner, split.manager);
  const meta = (cents: number) =>
    st.left > 0 ? (
      <>
        when sold out: <Money cents={cents} />
      </>
    ) : (
      "of net profit so far"
    );
  return (
    <>
      <KpiGrid aria-label="Profit split">
        <Kpi label="Owner" value={<Money cents={now.owner} />} meta={meta(later.owner)} />
        <Kpi label="Manager" value={<Money cents={now.manager} />} meta={meta(later.manager)} />
      </KpiGrid>
      <p className="t-sm muted">
        This batch&apos;s share before general expenses{st.netProfit < 0 ? "; negative while the batch is at a loss" : ""}. What can be
        paid out is on Finance → Overview → Safe to distribute.
      </p>
    </>
  );
}
