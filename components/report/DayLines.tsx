"use client";

// Batches side by side, day by day since each arrived: pieces sold so far, or net sales so far against the
// batch's cost in full (dashed) with a ring on the day it was covered. A crosshair follows the pointer or a
// tap, and the arrow keys; the readout lists every batch on that day. Values and readout text come
// formatted from the server, so this only draws. Marks: 2px lines, end dots with a surface ring, hairline
// grid; colours are the chart tokens (--chart-accent for the batch reported, --chart-muted to compare).
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export type DayLine = {
  key: string;
  label: string;
  tone: "accent" | "muted" | "faint";
  /** One value per day from day 0; the line ends where its values end. */
  values: number[];
  /** Short text at the end of the line ("29 of 30", "₱9,520"). */
  end?: string;
  /** What the line is measured against (the batch's cost in full), drawn dashed in its colour. */
  level?: number;
  /** The day the line first reached its level: a ring there. */
  ring?: number | null;
};

const H = 232;
const PAD = { top: 28, right: 72, bottom: 42, left: 46 };

/** 0 and 4–5 round steps covering max; whole steps for pieces. */
function ticks(max: number, unit: "pesos" | "count") {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(unit === "count" ? 1 : 0, [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw);
  const out: number[] = [];
  for (let v = 0; v < max + step * 0.999; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

function compact(v: number, unit: "pesos" | "count") {
  const n = unit === "pesos" ? v / 100 : v;
  const s =
    Math.abs(n) >= 10_000
      ? `${Math.round(n / 1000)}K`
      : Math.abs(n) >= 1000
        ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`
        : `${Math.round(n * 10) / 10}`;
  return unit === "pesos" ? `₱${s}` : s;
}

export function DayLines({
  title,
  unit,
  lines,
  tips,
  focusDay,
  table,
}: {
  title: string;
  unit: "pesos" | "count";
  lines: DayLine[];
  /** Readout per day: its heading, then one line per batch. */
  tips: string[][];
  /** The day the keyboard starts on. */
  focusDay?: number;
  table: { head: string[]; rows: string[][] };
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [day, setDay] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const xMax = Math.max(1, ...lines.map((l) => l.values.length - 1));
  const vMax = Math.max(0, ...lines.flatMap((l) => [...l.values, l.level ?? 0]));
  const yTicks = ticks(vMax, unit);
  const yMax = yTicks[yTicks.length - 1] || 1;
  const innerW = width - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (d: number) => PAD.left + (innerW * d) / xMax;
  const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH;
  // Day labels at least ~40px apart.
  const step = [1, 2, 5, 7, 10, 14, 15, 20, 30, 50, 100].find((s) => (innerW * s) / xMax >= 40) ?? 100;
  const xTicks: number[] = [];
  for (let d = 0; d <= xMax; d += step) xTicks.push(d);

  // End labels: right of a line that runs to the last day, above one that ends earlier; nudged apart.
  const ends = lines
    .filter((l) => l.end && l.values.length > 0)
    .map((l) => {
      const d = l.values.length - 1;
      const atEdge = d === xMax;
      return {
        key: l.key,
        text: l.end as string,
        x: atEdge ? x(d) + 9 : x(d),
        y: atEdge ? y(l.values[d]) + 4 : y(l.values[d]) - 11,
        anchor: atEdge ? ("start" as const) : ("middle" as const),
      };
    });
  for (let i = 0; i < ends.length; i++)
    for (let j = i + 1; j < ends.length; j++) {
      const [a, b] = [ends[i], ends[j]];
      if (a.anchor === b.anchor && Math.abs(a.y - b.y) < 14 && Math.abs(a.x - b.x) < 70) {
        const lower = a.y > b.y ? a : b;
        lower.y = Math.min(H - PAD.bottom + 12, lower.y + (14 - Math.abs(a.y - b.y)));
      }
    }

  function pick(e: PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const d = Math.round(((e.clientX - r.left - PAD.left) / innerW) * xMax);
    setDay(Math.max(0, Math.min(xMax, d)));
  }
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const from = day ?? focusDay ?? xMax;
      setDay(Math.max(0, Math.min(xMax, from + (e.key === "ArrowRight" ? 1 : -1))));
    } else if (e.key === "Escape") setDay(null);
  }

  const tip = day !== null ? tips[day] : null;
  const tipLeft = day !== null ? (x(day) + 200 > width ? Math.max(0, x(day) - 200 - 10) : x(day) + 10) : 0;

  return (
    <div className="chart rpt-lines" ref={wrap}>
      <ul className="chart__legend" role="list">
        {lines.map((l) => (
          <li key={l.key}>
            <span className={`rpt-key rpt-key--${l.tone}`} aria-hidden="true" />
            {l.label}
          </li>
        ))}
        {lines.some((l) => l.level !== undefined) &&
          lines.map((l) =>
            l.level !== undefined ? (
              <li key={`${l.key}-level`}>
                <span className={`rpt-key rpt-key--dash rpt-key--${l.tone}`} aria-hidden="true" />
                {l.label} cost in full
              </li>
            ) : null,
          )}
        {lines.some((l) => l.ring !== undefined && l.ring !== null) && (
          <li>
            <span className="rpt-ringkey" aria-hidden="true" />
            Day it earned back its cost
          </li>
        )}
      </ul>
      <div
        className="chart__plot rpt-lines__plot"
        tabIndex={0}
        role="group"
        aria-label={`${title}. Use the left and right arrow keys to read each day, or open the table below.`}
        onKeyDown={onKey}
        onFocus={() => setDay((d) => d ?? focusDay ?? xMax)}
        onBlur={() => setDay(null)}
      >
        <svg
          width={width}
          height={H}
          role="img"
          aria-label={`${title}. Table view below.`}
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") setDay(null);
          }}
        >
          {yTicks.map((t) => (
            <g key={t}>
              <line className="chart__grid" x1={PAD.left} x2={PAD.left + innerW} y1={y(t)} y2={y(t)} />
              <text className="chart__tick" x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end">
                {compact(t, unit)}
              </text>
            </g>
          ))}
          <line className="chart__axis" x1={PAD.left} x2={PAD.left + innerW} y1={y(0)} y2={y(0)} />
          {xTicks.map((d) => (
            <text key={d} className="chart__tick" x={x(d)} y={H - PAD.bottom + 16} textAnchor="middle">
              {d}
            </text>
          ))}
          <text className="chart__tick" x={PAD.left + innerW / 2} y={H - 6} textAnchor="middle">
            days since the batch arrived
          </text>
          {lines.map((l) =>
            l.level !== undefined ? (
              <line
                key={`${l.key}-level`}
                className={`rpt-level rpt-level--${l.tone}`}
                x1={PAD.left}
                x2={PAD.left + innerW}
                y1={y(l.level)}
                y2={y(l.level)}
              />
            ) : null,
          )}
          {day !== null && <line className="rpt-cross" x1={x(day)} x2={x(day)} y1={PAD.top} y2={y(0)} />}
          {/* The muted batch first, so the reported batch draws on top. */}
          {[...lines].reverse().map((l) => (
            <polyline
              key={l.key}
              className={`rpt-line rpt-line--${l.tone}`}
              points={l.values.map((v, d) => `${x(d)},${y(v)}`).join(" ")}
            />
          ))}
          {lines.map((l) =>
            l.ring !== undefined && l.ring !== null && l.values[l.ring] !== undefined ? (
              <circle key={`${l.key}-ring`} className={`rpt-ring rpt-ring--${l.tone}`} cx={x(l.ring)} cy={y(l.values[l.ring])} r={5.5} />
            ) : null,
          )}
          {lines.map((l) =>
            l.values.length ? (
              <circle
                key={`${l.key}-end`}
                className={`rpt-dot rpt-dot--${l.tone}`}
                cx={x(l.values.length - 1)}
                cy={y(l.values[l.values.length - 1])}
                r={4.5}
              />
            ) : null,
          )}
          {day !== null &&
            lines.map((l) =>
              l.values[day] !== undefined ? (
                <circle key={`${l.key}-at`} className={`rpt-dot rpt-dot--${l.tone}`} cx={x(day)} cy={y(l.values[day])} r={4.5} />
              ) : null,
            )}
          {ends.map((e) => (
            <text key={`${e.key}-label`} className="rpt-endlabel" x={e.x} y={e.y} textAnchor={e.anchor}>
              {e.text}
            </text>
          ))}
        </svg>
        {tip && (
          <div className="chart__tip rpt-tip" role="status" style={{ left: tipLeft, top: 4 }}>
            <strong>{tip[0]}</strong>
            {tip.slice(1).map((t, k) => (
              <span key={k} className="rpt-tip__row">
                <span className={`rpt-key rpt-key--${lines[k]?.tone ?? "muted"}`} aria-hidden="true" />
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
      <details className="chart__table">
        <summary>Show as table</summary>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                {table.head.map((h, k) => (
                  <th key={k} className={k > 0 ? "num" : undefined}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, k) => (
                    <td key={k} className={k > 0 ? "num" : undefined}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
