"use client";

// One bar per batch split into parts drawn to scale (where each peso of net sales went; paid and still owed).
// A part's share is printed inside when it fits; pointing at or tapping a bar lists all its parts, so the thin
// ones can be read too, and each part takes keyboard focus. A legend names the parts and a table view lists
// the amounts. Amounts come formatted from the server.
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";

export type BarPart = { key: string; name: string; cents: number; share: string; text: string };
export type PartsRow = { label: string; parts: BarPart[] };

export function PartsBars({
  title,
  rows,
  legend,
  table,
}: {
  title: string;
  rows: PartsRow[];
  /** Part keys in bar order with their names; alert marks a part that needs attention (still owed). */
  legend: { key: string; name: string; alert?: boolean }[];
  table: { head: string[]; rows: string[][] };
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<{ row: number; part?: number } | null>(null);
  const [fits, setFits] = useState<Record<string, boolean>>({});

  // A share printed inside a part only when it fits with room on both sides.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const next: Record<string, boolean> = {};
      el.querySelectorAll<HTMLElement>("[data-part]").forEach((seg) => {
        const label = seg.querySelector<HTMLElement>(".rpt-part__label");
        if (!label) return;
        // Measure the label as it would show (a hidden one measures 0), then put it back.
        const was = label.hidden;
        label.hidden = false;
        next[seg.dataset.part as string] = label.offsetWidth + 4 <= seg.clientWidth;
        label.hidden = was;
      });
      setFits((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const shown = open ? rows[open.row] : null;

  return (
    <div className="chart rpt-bars" ref={wrap}>
      <div className="rpt-bars__rows" role="group" aria-label={`${title}. Table view below.`}>
        {rows.map((r, i) => (
          <div key={r.label} className="rpt-bars__row">
            <span className="rpt-bars__name">{r.label}</span>
            <div
              className="rpt-bar"
              onPointerEnter={(e) => e.pointerType === "mouse" && setOpen({ row: i })}
              onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(null)}
              onPointerDown={() => setOpen({ row: i })}
            >
              {r.parts
                .filter((p) => p.cents > 0)
                .map((p, k) => {
                  const id = `${i}-${p.key}`;
                  return (
                    <div
                      key={p.key}
                      data-part={id}
                      className={`rpt-part rpt-part--${p.key}`}
                      style={{ flexGrow: p.cents }}
                      tabIndex={0}
                      role="img"
                      aria-label={`${r.label}, ${p.name}: ${p.text}`}
                      onFocus={(e) => {
                        // Keyboard focus reads one part; a tap (which also focuses) keeps the whole bar's list.
                        if (e.currentTarget.matches(":focus-visible")) setOpen({ row: i, part: k });
                      }}
                      onBlur={() => setOpen(null)}
                    >
                      <span className="rpt-part__label" hidden={fits[id] === false}>
                        {p.share}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
        {shown && open && (
          <div className="chart__tip rpt-tip rpt-bars__tip" role="status">
            <strong>{shown.label}</strong>
            {shown.parts
              .filter((p, k) => p.cents > 0 && (open.part === undefined || shown.parts.filter((q) => q.cents > 0)[open.part] === p))
              .map((p) => (
                <span key={p.key} className="rpt-tip__row">
                  <span className={`rpt-swatch rpt-part--${p.key}`} aria-hidden="true" />
                  {p.name}: {p.text}
                </span>
              ))}
          </div>
        )}
      </div>
      <ul className="chart__legend rpt-bars__legend" role="list">
        {legend.map((l) => (
          <li key={l.key}>
            <span className={`rpt-swatch rpt-part--${l.key}`} aria-hidden="true" />
            {l.alert && <Icon name="alert" size={14} className="rpt-alert-ic" />}
            {l.name}
          </li>
        ))}
      </ul>
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
