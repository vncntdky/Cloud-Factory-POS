// A batch's running profit and loss, line by line: sales before and after discounts, what the
// pieces sold cost (goods + their share of the restocking fees), each expense charged to the batch,
// count differences and the tax estimate, down to net profit so far, and what the pieces left would
// add. Then everything the batch cost in full (goods, shipping, tax, MOOE, other, expenses) against
// its sales so far. Counted as Finance counts it, so all batches, less general expenses, give the
// net profit in Profit & loss. Used on Sales → Finance → Batches and on the batch's own page.
import type { Batch, BatchStatement } from "@/app/(staff)/restock/data";
import { Line } from "@/components/finance/Line";
import { Money } from "@/components/Money";
import { EXPENSE_CATEGORIES } from "@/lib/pnl";
import { formatManilaDate } from "@/lib/time";

const CATEGORY = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.id, c.label])) as Record<string, string>;
const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : undefined);
const pcs = (n: number) => `${n} pc${n === 1 ? "" : "s"}`;

export function BatchStatementLines({
  batch,
  st,
  taxRateBp,
  ordered,
}: {
  batch: Batch;
  st: BatchStatement;
  taxRateBp: number;
  /** Pieces ordered, for an order still on the way. */
  ordered?: number;
}) {
  const toEarnBack = st.costInFull - st.net;
  return (
    <>
      <dl className="cost-list pnl">
        <Line label="Gross sales" hint={`${pcs(st.sold)} sold`} cents={st.gross} />
        <Line label="Discounts" cents={st.discounts} out />
        <Line label="Net sales" cents={st.net} total />
        <Line label="Cost of the pieces sold" hint={`what you paid for the ${pcs(st.sold)}`} cents={st.cogsGoods} out sub />
        <Line label="Restocking fees" hint={`the ${pcs(st.sold)}' share of shipping, tax, MOOE, other`} cents={st.cogsFees} out sub />
        <Line label="Gross profit" cents={st.grossProfit} total extra={pct(st.grossProfit, st.net)} />
        {st.expenses.length === 0 ? (
          <Line label="Expenses" hint="none charged to this batch" cents={0} out sub />
        ) : (
          st.expenses.map((e) => (
            <Line
              key={e.id}
              label={CATEGORY[e.category] ?? e.category}
              hint={`${formatManilaDate(e.spent_on)}${e.note ? ` · ${e.note}` : ""}`}
              cents={e.amount_cents}
              out
              sub
            />
          ))
        )}
        {st.countDiffs !== 0 && (
          <Line label="Stock count differences" hint="counts and losses, at what the pieces cost" cents={st.countDiffs} sub />
        )}
        {taxRateBp > 0 && <Line label={`Percentage tax (${(taxRateBp / 100).toString()}%, est.)`} cents={st.tax} out sub />}
        <Line label="Net profit so far" cents={st.netProfit} total extra={pct(st.netProfit, st.net)} />
        {st.left > 0 && (
          <>
            <Line label={`${pcs(st.left)} left, at today's prices`} cents={st.leftValue} sub />
            <Line label="What they cost" hint="goods + restocking fees" cents={st.leftCost} out sub />
            <Line label="Net profit when sold out" cents={st.whenSoldOut} total />
          </>
        )}
      </dl>
      {(st.owed > 0 || st.uncosted > 0) && (
        <p className="t-sm muted">
          {st.owed > 0 && (
            <>
              <Money cents={st.owed} /> of its sales isn&apos;t paid yet.{" "}
            </>
          )}
          {st.uncosted > 0 && `${pcs(st.uncosted)} sold had no cost, so the profit shown is too high.`}
        </p>
      )}
      {st.taxesPaid.length > 0 && (
        <p className="t-sm muted">
          Taxes paid from this batch, not counted in its profit:{" "}
          {st.taxesPaid.map((e, i) => (
            <span key={e.id}>
              {i > 0 && "; "}
              {formatManilaDate(e.spent_on)}
              {e.note ? ` · ${e.note}` : ""} <Money cents={e.amount_cents} />
            </span>
          ))}
          . {taxRateBp > 0 ? "They lower the tax still owed." : "The tax rate is 0%, so they lower cash but not profit."}
        </p>
      )}

      <h3 className="eyebrow">What the batch cost in full</h3>
      <p className="t-sm muted">The whole batch, sold or not. Net profit above counts only the pieces sold.</p>
      <dl className="cost-list pnl">
        <Line label={ordered !== undefined ? `Goods (${pcs(ordered)} ordered)` : `Goods (${pcs(st.received)})`} cents={st.goods} />
        {batch.id !== null && (
          <>
            <Line label="Shipping" cents={batch.shipping_cents} />
            <Line label="Tax" cents={batch.tax_cents} />
            <Line label="MOOE" cents={batch.mooe_cents} />
            {batch.other_cents > 0 && <Line label={batch.other_label || "Other restock cost"} cents={batch.other_cents} />}
            <Line label={`Expenses (${st.expenses.length})`} cents={st.expenseTotal} />
          </>
        )}
        <Line label="Batch cost" cents={st.costInFull} total />
        <Line label="Its sales so far" hint="paid or not" cents={st.net} sub />
        {toEarnBack > 0 ? (
          <Line label="Still to earn back" cents={toEarnBack} total />
        ) : (
          <Line label="Earned beyond its cost" cents={-toEarnBack} total />
        )}
      </dl>
    </>
  );
}
