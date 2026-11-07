// Ranked horizontal bars, largest first, one hue: best sellers and similar. Each row says its
// value in text, so the bar is a quick visual and nothing depends on color.
import Link from "next/link";

export type RankRow = { key: string; label: string; value: number; valueText: string; meta?: string; href?: string };

export function RankBars({ rows, label }: { rows: RankRow[]; label: string }) {
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  return (
    <ol className="rank" aria-label={label}>
      {rows.map((r) => {
        const body = (
          <>
            <span className="rank__head">
              <span className="rank__label">{r.label}</span>
              <span className="rank__value num">{r.valueText}</span>
            </span>
            <span className="rank__track" aria-hidden="true">
              <span className="rank__bar" style={{ width: `${Math.max(r.value > 0 ? 2 : 0, (r.value / max) * 100)}%` }} />
            </span>
            {r.meta && <span className="rank__meta">{r.meta}</span>}
          </>
        );
        return (
          <li key={r.key}>
            {r.href ? (
              <Link className="rank__row" href={r.href}>
                {body}
              </Link>
            ) : (
              <span className="rank__row">{body}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
