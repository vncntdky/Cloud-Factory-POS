// Reorder plan for the Restock tab. A product's pace is the pieces it sold in the last
// PACE_DAYS days (or since it was first stocked, if that's sooner) divided by those days.
//   Reorder point   = pace × (lead days + buffer days): order when the shelf is down to this.
//   Suggested order = pace × (lead + buffer + cover days) − on the shelf, rounded up.
export const PACE_DAYS = 28;

export type RestockPlan = { lead: number; buffer: number; cover: number };

export const DEFAULT_PLAN: RestockPlan = { lead: 7, buffer: 3, cover: 14 };

export type Pace = { sold: number; days: number; lastSoldAt: string | null };

export type PlanStatus = "order" | "soon" | "ok" | "idle";

export type ProductPlan = {
  /** Pieces per day. 0 when nothing sold in the window. */
  perDay: number;
  /** Days until the shelf is empty at this pace; null with no sales. */
  daysLeft: number | null;
  /** Suggested low-stock alert level; null with no sales (keep the current one). */
  reorderPoint: number | null;
  /** Pieces to order now; 0 when the shelf is above the reorder point. */
  suggest: number;
  status: PlanStatus;
  /** Days of sales behind the pace (under 7 = rough estimate). */
  basedOnDays: number;
};

export function planProduct(onHand: number, pace: Pace | undefined, plan: RestockPlan): ProductPlan {
  const days = pace?.days ?? 0;
  const sold = pace?.sold ?? 0;
  if (!pace || sold <= 0 || days <= 0) {
    return { perDay: 0, daysLeft: null, reorderPoint: null, suggest: 0, status: "idle", basedOnDays: days };
  }
  const perDay = sold / days;
  const reorderPoint = Math.ceil(perDay * (plan.lead + plan.buffer));
  const target = Math.ceil(perDay * (plan.lead + plan.buffer + plan.cover));
  const stock = Math.max(0, onHand);
  const daysLeft = stock / perDay;
  // "Soon": the shelf reaches the reorder point within a week.
  const status: PlanStatus = stock <= reorderPoint ? "order" : stock - 7 * perDay <= reorderPoint ? "soon" : "ok";
  const suggest = status === "ok" ? 0 : Math.max(0, target - stock);
  return { perDay, daysLeft, reorderPoint, suggest, status, basedOnDays: days };
}

/** "1.4 / day", "3 / week" for slow sellers. */
export function paceLabel(perDay: number) {
  if (perDay <= 0) return "No sales";
  if (perDay < 1) return `${Math.round(perDay * 7 * 10) / 10} / week`;
  return `${Math.round(perDay * 10) / 10} / day`;
}

/** "Out now", "Under a day", "6 days", "5 weeks". */
export function daysLeftLabel(days: number | null) {
  if (days === null) return "—";
  if (days <= 0) return "Out now";
  if (days < 1) return "Under a day";
  if (days < 21) return `${Math.floor(days)} day${Math.floor(days) === 1 ? "" : "s"}`;
  return `${Math.floor(days / 7)} weeks`;
}

/** A batch's restock costs, on top of what the goods cost. "other" has its own label. */
export const COST_FIELDS = [
  { name: "shipping", label: "Shipping" },
  { name: "tax", label: "Tax" },
  { name: "mooe", label: "MOOE" },
  { name: "other", label: "Other" },
] as const;
