// <span class="money"><span class="money__sign">₱</span>1,640</span>
// Lists drop .00 (decimals "auto", the default); totals and costing pass decimals={2}.
import { pesoAmount, type PesoDecimals } from "@/lib/format";

export type MoneyProps = {
  cents: number | string | null | undefined;
  /** "auto" (default) drops .00 on whole pesos; 2 always shows centavos; 0 rounds to pesos. */
  decimals?: PesoDecimals;
  /** Voided totals: line-through, muted. */
  strike?: boolean;
  /** Money to collect: mint-ink text. */
  owed?: boolean;
  /** Show "+" for positive amounts. */
  signed?: boolean;
  className?: string;
};

export function Money({ cents, decimals = "auto", strike, owed, signed, className }: MoneyProps) {
  const cls = ["money", owed && "money--owed", strike && "money--strike", className].filter(Boolean).join(" ");
  if (cents === null || cents === undefined || cents === "" || Number.isNaN(Number(cents))) {
    return <span className={cls}>–</span>;
  }
  const n = Number(cents);
  const prefix = n < 0 ? "−" : signed && n > 0 ? "+" : "";
  return (
    <span className={cls}>
      {prefix}
      <span className="money__sign">₱</span>
      {pesoAmount(n, decimals)}
    </span>
  );
}

export default Money;
