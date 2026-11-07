// Busiest times: weekday × hour grid, one hue light → dark by number of sales (4 steps, empty
// cells are the sunken track). Each cell has a tooltip and the busiest slot is named in text.
export type HeatCell = { dow: number; hour: number; sales: number; pieces: number };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first

export function hourLabel(h: number) {
  const ap = h < 12 ? "AM" : "PM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh} ${ap}`;
}

export function Heatmap({ cells }: { cells: HeatCell[] }) {
  if (cells.length === 0) return null;
  const minH = Math.min(...cells.map((c) => c.hour));
  const maxH = Math.max(...cells.map((c) => c.hour));
  const hours = Array.from({ length: maxH - minH + 1 }, (_, i) => minH + i);
  const max = Math.max(...cells.map((c) => c.sales));
  const at = new Map(cells.map((c) => [`${c.dow}-${c.hour}`, c]));
  const step = (v: number) => (v <= 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4)));
  return (
    <div className="heat-wrap">
      <table className="heat">
        <caption className="sr-only">Sales by weekday and hour</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Day</span>
            </th>
            {hours.map((h) => (
              <th key={h} scope="col">
                {h % 3 === minH % 3 ? hourLabel(h).replace(" ", "") : ""}
                <span className="sr-only">{hourLabel(h)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ORDER.map((d) => (
            <tr key={d}>
              <th scope="row">{DAYS[d]}</th>
              {hours.map((h) => {
                const c = at.get(`${d}-${h}`);
                const text = `${DAYS[d]} ${hourLabel(h)}: ${c ? `${c.sales} sale${c.sales === 1 ? "" : "s"}, ${c.pieces} pcs` : "no sales"}`;
                return (
                  <td key={h} title={text}>
                    <span className={`heat__cell heat__cell--${step(c?.sales ?? 0)}`} />
                    <span className="sr-only">{text}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="heat__legend t-caption muted" aria-hidden="true">
        Fewer
        {[1, 2, 3, 4].map((k) => (
          <span key={k} className={`heat__cell heat__cell--${k}`} />
        ))}
        More sales
      </p>
    </div>
  );
}
