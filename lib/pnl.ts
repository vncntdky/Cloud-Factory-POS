// P&L on the dashboard: expense categories and the owner : manager profit split.
export const EXPENSE_CATEGORIES = [
  { id: "salary", label: "Salaries" },
  { id: "rent", label: "Rent" },
  { id: "utilities", label: "Utilities" },
  { id: "supplies", label: "Supplies" },
  { id: "fees", label: "Payment fees" },
  { id: "tax", label: "Taxes paid" },
  { id: "other", label: "Other expenses" },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["id"];

/** "2/3", "1/3", "3/4"; whole parts reduced. */
export function shareLabel(part: number, total: number) {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(part, total) || 1;
  return part === 0 ? "0" : part === total ? "all" : `${part / g}/${total / g}`;
}

/** Split net profit in whole centavos; the owner's share takes the rounding so they add up. */
export function splitProfit(netCents: number, ownerParts: number, managerParts: number) {
  const total = ownerParts + managerParts;
  const manager = total > 0 ? Math.round((netCents * managerParts) / total) : 0;
  return { owner: netCents - manager, manager };
}
