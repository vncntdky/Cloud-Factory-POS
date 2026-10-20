// Asia/Manila is a fixed UTC+08:00 with no daylight saving, so all maths here is plain
// offset arithmetic. Dates are "YYYY-MM-DD" strings (Manila calendar days).

const OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type TsInput = string | number | Date;

function toDate(ts: TsInput): Date {
  if (ts instanceof Date) return ts;
  // A bare "YYYY-MM-DD" means midnight of that Manila day.
  if (typeof ts === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ts)) return new Date(`${ts}T00:00:00+08:00`);
  return new Date(ts);
}

/** Wall-clock parts in Manila. */
export function manilaParts(ts: TsInput = new Date()) {
  const d = new Date(toDate(ts).getTime() + OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const hh = d.getUTCHours();
  const mm = d.getUTCMinutes();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    year: y,
    month: m, // 0-based
    day,
    weekday: d.getUTCDay(),
    hour: hh,
    minute: mm,
    /** "YYYY-MM-DD" */
    date: `${y}-${pad(m + 1)}-${pad(day)}`,
    /** "HH:MM" (24h) — for <input type="time"> */
    time: `${pad(hh)}:${pad(mm)}`,
  };
}

/** Today's Manila date, "YYYY-MM-DD". */
export function manilaToday(now: TsInput = new Date()) {
  return manilaParts(now).date;
}

/** "YYYY-MM-DD" ± n days. */
export function addDays(date: string, n: number) {
  const t = new Date(`${date}T00:00:00Z`).getTime() + n * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/** [startISO, endISO) in UTC for one Manila day. */
export function manilaDayRange(date: string): [string, string] {
  const start = new Date(`${date}T00:00:00+08:00`);
  return [start.toISOString(), new Date(start.getTime() + DAY_MS).toISOString()];
}

/** [startISO, endISO) covering Manila days from..to inclusive. */
export function manilaRange(from: string, to: string): [string, string] {
  return [manilaDayRange(from)[0], manilaDayRange(to)[1]];
}

/** First day of the current Manila month, "YYYY-MM-01". */
export function manilaMonthStart(now: TsInput = new Date()) {
  return manilaToday(now).slice(0, 8) + "01";
}

/** Valid "YYYY-MM-DD"? */
export function isIsoDate(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());
}

/** "1:24 PM" in Manila. */
export function formatManilaTime(ts: TsInput | null | undefined) {
  if (ts === null || ts === undefined || ts === "") return "";
  const p = manilaParts(ts);
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${h12}:${String(p.minute).padStart(2, "0")} ${p.hour < 12 ? "AM" : "PM"}`;
}

/** "Sat 17 Oct" (add the year when it isn't this year). Accepts a timestamp or "YYYY-MM-DD". */
export function formatManilaDate(ts: TsInput | null | undefined, opts: { weekday?: boolean; year?: boolean } = {}) {
  if (ts === null || ts === undefined || ts === "") return "";
  const p = manilaParts(ts);
  const showYear = opts.year ?? p.year !== manilaParts().year;
  const wd = opts.weekday === false ? "" : `${WEEKDAYS[p.weekday]} `;
  return `${wd}${p.day} ${MONTHS[p.month]}${showYear ? ` ${p.year}` : ""}`;
}

/**
 * General formatter. Default: "17 Oct, 1:24 PM". Pass Intl options for anything else
 * (timeZone is forced to Asia/Manila).
 */
export function formatManila(ts: TsInput | null | undefined, opts?: Intl.DateTimeFormatOptions) {
  if (ts === null || ts === undefined || ts === "") return "";
  if (!opts) return `${formatManilaDate(ts, { weekday: false })}, ${formatManilaTime(ts)}`;
  return new Intl.DateTimeFormat("en-PH", { ...opts, timeZone: "Asia/Manila" }).format(toDate(ts));
}

/** Top-bar eyebrow: "SAT · 17 OCT". */
export function eyebrowDate(ts: TsInput = new Date()) {
  const p = manilaParts(ts);
  return `${WEEKDAYS[p.weekday]} · ${p.day} ${MONTHS[p.month]}`.toUpperCase();
}

/** "Good morning" / "Good afternoon" / "Good evening" by Manila time. */
export function greeting(now: TsInput = new Date()) {
  const h = manilaParts(now).hour;
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** "just now", "12 min ago", "3 hours ago", "yesterday", "12 days ago", "3 months ago". */
export function relativeTime(ts: TsInput | null | undefined, now: TsInput = new Date()) {
  if (ts === null || ts === undefined || ts === "") return "";
  const then = toDate(ts).getTime();
  const diff = toDate(now).getTime() - then;
  const future = diff < 0;
  const s = Math.abs(diff) / 1000;
  const wrap = (x: string) => (future ? `in ${x}` : `${x} ago`);
  if (s < 60) return "just now";
  const min = Math.floor(s / 60);
  if (min < 60) return wrap(`${min} min`);
  const h = Math.floor(min / 60);
  if (h < 24) return wrap(`${h} ${h === 1 ? "hour" : "hours"}`);
  // Calendar days in Manila, so "yesterday" means yesterday.
  const days = Math.round(
    (new Date(`${manilaToday(future ? then : now)}T00:00:00Z`).getTime() -
      new Date(`${manilaToday(future ? now : then)}T00:00:00Z`).getTime()) /
      DAY_MS,
  );
  if (days <= 1) return future ? "tomorrow" : "yesterday";
  if (days < 60) return wrap(`${days} days`);
  const months = Math.floor(days / 30);
  if (months < 24) return wrap(`${months} months`);
  return wrap(`${Math.floor(days / 365)} years`);
}

/** Compact age for chips: "12m", "3h", "2d". */
export function shortAgo(ts: TsInput | null | undefined, now: TsInput = new Date()) {
  if (ts === null || ts === undefined || ts === "") return "";
  const s = Math.max(0, (toDate(now).getTime() - toDate(ts).getTime()) / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
