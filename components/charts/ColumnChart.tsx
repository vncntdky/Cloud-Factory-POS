"use client";

// Column chart (one series, or a stack of two) with a hover / tap tooltip per column and a table
// view. Values and tooltip text come formatted from the server, so this only draws.
// Marks: ≤24px columns, 4px rounded top, square at the baseline, 2px surface gap between stacked
// segments, hairline grid. Colors are CSS tokens (--chart-accent, --chart-muted).
import { useEffect, useRef, useState } from "react";

export type ColumnSeries = { key: string; label: string; color: "accent" | "muted"; values: number[] };

const H = 200;
const PAD = { top: 12, right: 8, bottom: 24, left: 44 };

/** 0 and 4–5 round steps covering max. */
function ticks(max: number) {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
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

/** Column top: 4px rounded data end, square at the baseline. */
function colPath(x: number, y: number, w: number, h: number, round: boolean) {
  if (h <= 0) return "";
  const r = round ? Math.min(4, w / 2, h) : 0;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function ColumnChart({
  title,
  labels,
  series,
  unit,
  tooltips,
  table,
}: {
  title: string;
  /** Short label per column ("3 Nov", "Wk 45", "Nov"). */
  labels: string[];
  /** Bottom to top when stacked. */
  series: ColumnSeries[];
  unit: "pesos" | "count";
  /** Tooltip lines per column; the first is its heading. */
  tooltips: string[][];
  /** Table view: header and rows of formatted cells. */
  table: { head: string[]; rows: string[][] };
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = labels.length;
  const totals = labels.map((_, i) => series.reduce((s, x) => s + Math.max(0, x.values[i] ?? 0), 0));
  const yTicks = ticks(Math.max(...totals, 0));
  const yMax = yTicks[yTicks.length - 1] || 1;
  const innerW = width - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const band = innerW / Math.max(1, n);
  const barW = Math.max(2, Math.min(24, band * 0.6));
  const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH;
  // About one x label per 56px.
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(innerW / 56))));

  return (
    <div className="chart" ref={wrap}>
      {series.length > 1 && (
        <ul className="chart__legend" role="list">
          {[...series].reverse().map((s) => (
            <li key={s.key}>
              <span className={`chart__swatch chart__swatch--${s.color}`} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div className="chart__plot" onMouseLeave={() => setHover(null)}>
        <svg width={width} height={H} role="img" aria-label={`${title}. Table view below.`}>
          {yTicks.map((t) => (
            <g key={t}>
              <line className="chart__grid" x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="chart__tick" x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end">
                {compact(t, unit)}
              </text>
            </g>
          ))}
          {labels.map((l, i) => {
            const x = PAD.left + band * i + (band - barW) / 2;
            let base = 0;
            const visible = series.filter((s) => (s.values[i] ?? 0) > 0);
            return (
              <g key={i} className={hover === i ? "is-hover" : undefined}>
                <rect
                  className="chart__hit"
                  x={PAD.left + band * i}
                  y={PAD.top}
                  width={band}
                  height={innerH}
                  onMouseEnter={() => setHover(i)}
                  onClick={() => setHover(hover === i ? null : i)}
                />
                {series.map((s) => {
                  const v = Math.max(0, s.values[i] ?? 0);
                  if (v <= 0) return null;
                  const top = visible[visible.length - 1] === s;
                  const y0 = y(base + v);
                  const h = y(base) - y0 - (base > 0 ? 2 : 0); // 2px surface gap above the segment below
                  base += v;
                  return <path key={s.key} className={`chart__bar chart__bar--${s.color}`} d={colPath(x, y0, barW, h, top)} />;
                })}
                {i % every === 0 && (
                  <text className="chart__tick" x={PAD.left + band * i + band / 2} y={H - 6} textAnchor="middle">
                    {l}
                  </text>
                )}
              </g>
            );
          })}
          <line className="chart__axis" x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} />
        </svg>
        {hover !== null && tooltips[hover] && (
          <div
            className="chart__tip"
            role="status"
            style={{
              left: Math.min(width - 180, Math.max(0, PAD.left + band * hover + band / 2 - 90)),
              top: Math.max(0, y(totals[hover]) - 8),
            }}
          >
            <strong>{tooltips[hover][0]}</strong>
            {tooltips[hover].slice(1).map((t, k) => (
              <span key={k}>{t}</span>
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
                  <th key={h} className={k > 0 ? "num" : undefined}>
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
