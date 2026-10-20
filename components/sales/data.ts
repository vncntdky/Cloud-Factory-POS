// Server-side helpers shared by /sales and /sales/export: date-range parsing and paged reads
// (PostgREST returns at most 1000 rows per request).
import { isIsoDate, manilaToday } from "@/lib/time";

export type SalesRange = { from: string; to: string; single: boolean };

type Param = string | string[] | undefined;
const first = (v: Param) => (Array.isArray(v) ? v[0] : v);

/** ?date= (one Manila day, default today) or ?from=&to= (inclusive, swapped if reversed). */
export function parseSalesRange(sp: { date?: Param; from?: Param; to?: Param }): SalesRange {
  const from = first(sp.from);
  const to = first(sp.to);
  if (isIsoDate(from) && isIsoDate(to)) {
    const [a, b] = from <= to ? [from, to] : [to, from];
    return { from: a, to: b, single: a === b };
  }
  if (isIsoDate(from) && !to) return { from, to: from, single: true };
  const date = first(sp.date);
  const d = isIsoDate(date) ? date : manilaToday();
  return { from: d, to: d, single: true };
}

/** Number of Manila days in an inclusive range. */
export function rangeDays(from: string, to: string) {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000) + 1;
}

type PageResult = { data: unknown[] | null; error: { message: string; code?: string } | null };

/**
 * Reads every row of a query in pages of `size`. `page(from, to)` must build a fresh,
 * consistently ordered query with .range(from, to). Stops at `max` rows.
 */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<PageResult>,
  { size = 1000, max = 50000 }: { size?: number; max?: number } = {},
): Promise<{ rows: T[]; error: PageResult["error"] }> {
  const rows: T[] = [];
  for (let start = 0; start < max; start += size) {
    const { data, error } = await page(start, start + size - 1);
    if (error) return { rows, error };
    const chunk = (data ?? []) as T[];
    rows.push(...chunk);
    if (chunk.length < size) break;
  }
  return { rows, error: null };
}

/** sales_log.mode_of_payment ("gcash + cash", "gcash (unpaid)") with readable method names. */
