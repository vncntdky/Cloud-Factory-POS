// Cash bridge (waterfall): opening cash, each kind of money in and out, closing cash. Drawn to one
// scale; green = in, red = out, purple = the opening and closing totals.
import { pesos } from "@/lib/format";

export type BridgeStep = { label: string; cents: number; kind: "total" | "in" | "out" };

function niceStep(range: number) {
  const raw = range / 3;
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
}

function shortPesos(cents: number) {
  const p = cents / 100;
  if (Math.abs(p) >= 1_000_000) return `₱${(p / 1_000_000).toFixed(p % 1_000_000 === 0 ? 0 : 1)}M`;
  if (Math.abs(p) >= 1000) return `₱${(p / 1000).toFixed(p % 1000 === 0 ? 0 : 1)}k`;
  return `₱${p}`;
}

export function CashBridge({ steps, label }: { steps: BridgeStep[]; label: string }) {
  let run = 0;
  const bars = steps.map((s) => {
    const from = s.kind === "total" ? 0 : run;
    const to = s.kind === "total" ? s.cents : run + (s.kind === "in" ? s.cents : -s.cents);
    run = to;
    return { ...s, from, to };
  });
  const lo = Math.min(0, ...bars.map((b) => Math.min(b.from, b.to)));
  const hi = Math.max(1, ...bars.map((b) => Math.max(b.from, b.to)));
  const step = niceStep(hi - lo);
  const top = Math.ceil(hi / step) * step;
  const bottom = Math.floor(lo / step) * step;
  const W = 760, H = 270, T = 26, B = 214;
  const y = (v: number) => B - ((v - bottom) / (top - bottom || 1)) * (B - T);
  const bw = 62;
  const gap = (W - 40 - bars.length * bw) / Math.max(1, bars.length - 1);
  const ticks: number[] = [];
  for (let v = bottom; v <= top + 1; v += step) ticks.push(v);

  return (
    <div className="fin-wf-wrap">
      <svg className="fin-wf" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={14} x2={W - 6} y1={y(t)} y2={y(t)} className={t === 0 ? "fin-wf__zero" : "fin-wf__grid"} />
            {t !== 0 && (
              <text x={18} y={y(t) - 4} className="fin-wf__axis">
                {shortPesos(t)}
              </text>
            )}
          </g>
        ))}
        {bars.map((b, i) => {
          const x = 20 + i * (bw + gap);
          const y1 = y(Math.max(b.from, b.to));
          const h = Math.max(2, y(Math.min(b.from, b.to)) - y1);
          const words = b.label.split(" ").reduce<string[]>((lines, w) => {
            const last = lines[lines.length - 1];
            if (last && `${last} ${w}`.length <= 11) lines[lines.length - 1] = `${last} ${w}`;
            else lines.push(w);
            return lines;
          }, []);
          const value =
            b.kind === "total" ? pesos(b.cents) : b.cents === 0 ? "–" : `${b.kind === "in" ? "+" : "−"}${pesos(b.cents)}`;
          return (
            <g key={b.label}>
              {i < bars.length - 1 && (
                <line x1={x + bw} x2={x + bw + gap} y1={y(b.to)} y2={y(b.to)} className="fin-wf__link" />
              )}
              <rect x={x} y={y1} width={bw} height={h} rx={3} className={`fin-wf__${b.kind}`} />
              <text x={x + bw / 2} y={y1 - 6} textAnchor="middle" className="fin-wf__val">
                {value}
              </text>
              {words.map((ln, k) => (
                <text key={k} x={x + bw / 2} y={B + 18 + k * 14} textAnchor="middle" className="fin-wf__label">
                  {ln}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
