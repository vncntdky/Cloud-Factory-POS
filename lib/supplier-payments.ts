// Payments to suppliers for a batch: whose money paid. Owner's money and investment both count as owner capital;
// the company fund is what sales brought in.
export type PaymentSource = "company" | "owner" | "investment";

export const PAYMENT_SOURCES: { id: PaymentSource; label: string }[] = [
  { id: "company", label: "Company fund" },
  { id: "owner", label: "Owner's money" },
  { id: "investment", label: "Investment" },
];

export function sourceLabel(s: PaymentSource) {
  return PAYMENT_SOURCES.find((x) => x.id === s)?.label ?? s;
}
