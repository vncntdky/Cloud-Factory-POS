// The owner's batch report (Sales → Finance → Report): one batch, compared with another, worked out from
// the batch's statement (batch_statements + its expenses, the same as Finance → Batches) and batch_report
// (each day's sales, flavours, who owes, how it was paid). Pure: the page loads, this only calculates.
import type { Batch, BatchStatement } from "@/app/(staff)/restock/data";
import { addDays } from "@/lib/time";

/** What batch_report returns (supabase/migrations/20261125000000_batch_report.sql). */
export type BatchReportRpc = {
  batch_id: string;
  batch_no: number;
  received_on: string;
  supplier: string | null;
  paid_from_funds: boolean;
  /** Manila date when the report was made. */
  today: string;
  /** Days with sales: pieces that day, and the running pieces and net sales (paid or not). */
  days: { date: string; pcs: number; cum_pcs: number; cum_net_cents: number }[];
  flavours: {
    product_id: string;
    brand: string | null;
    name: string;
    variant: string | null;
    received: number;
    sold: number;
    left: number;
    last_sale_on: string | null;
  }[];
  owed: { buyer: string | null; cents: number; sales: number }[];
  paid: { method: string; cents: number }[];
};

export type DayPoint = { day: number; date: string; pcs: number; cumPcs: number; cumNet: number };

export type Flavour = {
  id: string;
  name: string;
  received: number;
  sold: number;
  left: number;
  /** Days from arrival to its last sale when it sold out; null while pieces are left. */
  soldOutDay: number | null;
  soldOutOn: string | null;
};

export type BatchFigures = {
  id: string;
  no: number;
  title: string;
  receivedOn: string;
  supplier: string | null;
  paidFromFunds: boolean;
  st: BatchStatement;
  share: { owner: number; manager: number };
  /** Net profit and its shares if the pieces left sell at today's prices (the statement's "when sold out"). */
  shareWhenSoldOut: { owner: number; manager: number };
  /** One point per day from arrival (day 0) to its sell-out day, or to today while pieces are left. */
  series: DayPoint[];
  firstSaleDay: number | null;
  lastSaleDay: number | null;
  /** The day the last piece sold; null while pieces are left. */
  soldOutDay: number | null;
  /** Days from arrival to the last sale, both counted; pace = pieces sold ÷ these days. */
  sellDays: number | null;
  pace: number | null;
  /** First day the running net sales reached the batch's cost in full; null if not yet. */
  paybackDay: number | null;
  /** Days with no sales between its first and last sale. */
  quietDays: number[];
  /** Days since arrival, today included. */
  age: number;
  /** Manila date the figures were taken. */
  today: string;
  /** Net sales ÷ pieces sold. */
  avgPrice: number | null;
  /** What one piece cost with its share of the restocking fees. */
  landedEach: number | null;
  netMargin: number | null;
  grossMargin: number | null;
  flavours: Flavour[];
  owed: { buyer: string; cents: number; sales: number }[];
  owedBuyers: number;
  paid: { method: string; cents: number }[];
  paidTotal: number;
};

/** Whole days from one ISO date to another. */
export function daysBetween(from: string, to: string) {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/**
 * Product names without what every product of the batch shares: the brand ("Black TEO Red Pulp" → "Red Pulp"),
 * and the product name too when only the flavours differ ("XBLACK MAX Pods Mint" → "Mint").
 */
function flavourNames(fl: BatchReportRpc["flavours"]) {
  const same = (k: "brand" | "name") => fl.length > 1 && new Set(fl.map((f) => (f[k] ?? "").trim().toLowerCase())).size === 1;
  const sharedBrand = same("brand");
  const sharedName = same("name") && fl.every((f) => (f.variant ?? "").trim() !== "");
  return fl.map((f) => [sharedBrand ? "" : f.brand, sharedName ? "" : f.name, f.variant].filter((x) => x && x.trim()).join(" "));
}

export function batchFigures(
  batch: Batch & { id: string; batch_no: number; received_on: string },
  st: BatchStatement,
  rpc: BatchReportRpc,
  split: { owner: number; manager: number },
): BatchFigures {
  const received = batch.received_on;
  const byDate = new Map(rpc.days.map((d) => [d.date, d]));
  const saleDays = rpc.days.map((d) => daysBetween(received, d.date));
  const firstSaleDay = saleDays.length ? Math.min(...saleDays) : null;
  const lastSaleDay = saleDays.length ? Math.max(...saleDays) : null;
  const soldOut = st.left === 0 && st.sold > 0;
  const soldOutDay = soldOut ? lastSaleDay : null;
  const age = Math.max(0, daysBetween(received, rpc.today));
  const end = soldOutDay ?? age;

  const series: DayPoint[] = [];
  let cumPcs = 0;
  let cumNet = 0;
  for (let day = 0; day <= end; day++) {
    const date = addDays(received, day);
    const d = byDate.get(date);
    if (d) {
      cumPcs = d.cum_pcs;
      cumNet = d.cum_net_cents;
    }
    series.push({ day, date, pcs: d?.pcs ?? 0, cumPcs, cumNet });
  }

  const sellDays = lastSaleDay === null ? null : lastSaleDay + 1;
  const quietDays =
    firstSaleDay === null || lastSaleDay === null
      ? []
      : series.filter((p) => p.day > firstSaleDay && p.day < lastSaleDay && p.pcs === 0).map((p) => p.day);
  const payback = series.find((p) => st.costInFull > 0 && p.cumNet >= st.costInFull);

  const names = flavourNames(rpc.flavours);
  const flavours = rpc.flavours.map((f, i) => {
    const out = f.left === 0 && f.sold > 0 && f.last_sale_on ? f.last_sale_on : null;
    return {
      id: f.product_id,
      name: names[i],
      received: f.received,
      sold: f.sold,
      left: f.left,
      soldOutOn: out,
      soldOutDay: out ? daysBetween(received, out) : null,
    };
  });
  flavours.sort((a, b) => (a.soldOutDay ?? 1e9) - (b.soldOutDay ?? 1e9) || a.name.localeCompare(b.name));

  const paidTotal = st.net - st.owed;
  const split2 = (cents: number) => {
    const parts = split.owner + split.manager;
    const manager = parts > 0 ? Math.round((cents * split.manager) / parts) : 0;
    return { owner: cents - manager, manager };
  };
  return {
    id: batch.id,
    no: batch.batch_no,
    title: `Batch ${batch.batch_no}`,
    receivedOn: received,
    supplier: batch.supplier,
    paidFromFunds: batch.paid_from_funds,
    st,
    share: split2(st.netProfit),
    shareWhenSoldOut: split2(st.whenSoldOut),
    series,
    firstSaleDay,
    lastSaleDay,
    soldOutDay,
    sellDays,
    pace: sellDays ? st.sold / sellDays : null,
    paybackDay: payback ? payback.day : null,
    quietDays,
    age,
    today: rpc.today,
    avgPrice: st.sold > 0 ? st.net / st.sold : null,
    landedEach: st.received > 0 ? (st.goods + st.fees) / st.received : null,
    netMargin: st.net > 0 ? st.netProfit / st.net : null,
    grossMargin: st.net > 0 ? st.grossProfit / st.net : null,
    flavours,
    owed: fit(
      rpc.owed.map((o) => ({ buyer: o.buyer?.trim() || "No name", cents: Number(o.cents), sales: o.sales })),
      st.owed,
    ),
    owedBuyers: rpc.owed.length,
    paid: fit(
      rpc.paid.map((p) => ({ method: p.method, cents: Number(p.cents) })),
      paidTotal,
    ),
    paidTotal,
  };
}

/**
 * Puts the rounding difference (a centavo or two: each part is rounded on its own) on the biggest part, so the
 * parts add up to the total shown next to them. Rows come biggest first.
 */
function fit<T extends { cents: number }>(rows: T[], total: number) {
  const gap = total - rows.reduce((n, r) => n + r.cents, 0);
  if (rows.length && gap !== 0 && Math.abs(gap) <= rows.length) rows[0] = { ...rows[0], cents: rows[0].cents + gap };
  return rows;
}

/** "2.1" pieces a day; whole numbers drop the ".0". */
export function fmtPace(p: number | null) {
  if (p === null) return "–";
  const s = p.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

/** "40.8%"; null → "–". */
export function fmtPct(x: number | null, digits = 1) {
  return x === null ? "–" : `${(x * 100).toFixed(digits)}%`;
}

/** "3, 6 and 9". */
export function listing(items: (string | number)[]) {
  const s = items.map(String);
  return s.length <= 1 ? (s[0] ?? "") : `${s.slice(0, -1).join(", ")} and ${s[s.length - 1]}`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Which batches to compare with, newest first: "none" → none; "all" → every other batch; a batch's id → that
 * batch; nothing asked → the batch just before it (the next lower number), if there is one.
 */
export function pickCompare<T extends { id: string; batch_no: number }>(batches: T[], current: T, asked: string | undefined): T[] {
  const others = batches.filter((b) => b.id !== current.id).sort((a, b) => b.batch_no - a.batch_no);
  if (asked === "none") return [];
  if (asked === "all") return others;
  if (asked) {
    const one = others.find((b) => b.id === asked);
    return one ? [one] : [];
  }
  const before = others.find((b) => b.batch_no < current.batch_no);
  return before ? [before] : [];
}

/**
 * The one batch the summary and tiles read against when several are compared: the batch just before the one
 * reported, else the newest of the others.
 */
export function mainCompare<T extends { no: number }>(current: T, others: T[]): T | null {
  return others.filter((b) => b.no < current.no).sort((x, y) => y.no - x.no)[0] ?? others[0] ?? null;
}
