// One line of a Finance statement (inside <dl className="cost-list">). Costs and money out show in
// brackets; a total line is bold with a rule above it.
import type { ReactNode } from "react";
import { Money } from "@/components/Money";

export function Line({
  label,
  hint,
  cents,
  out,
  total,
  sub,
  extra,
}: {
  label: ReactNode;
  hint?: ReactNode;
  cents: number;
  /** Money out: a positive amount shows in brackets. */
  out?: boolean;
  total?: boolean;
  sub?: boolean;
  /** After the amount, e.g. a margin. */
  extra?: ReactNode;
}) {
  const cls = total ? "cost-list__total" : sub ? "fin-sub" : undefined;
  const neg = out ? cents > 0 : cents < 0;
  return (
    <>
      <dt className={cls}>
        {label}
        {hint && <span className="fin-hint">{hint}</span>}
      </dt>
      <dd className={cls}>
        {neg ? (
          <span className={total ? "text-alert" : undefined}>
            (<Money cents={Math.abs(cents)} />)
          </span>
        ) : (
          <Money cents={Math.abs(cents)} />
        )}
        {extra && <span className="fin-pct"> {extra}</span>}
      </dd>
    </>
  );
}
