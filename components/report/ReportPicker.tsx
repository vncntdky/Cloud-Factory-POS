"use client";

// Which batch the report is on, and which batch it is compared with (the one before it unless picked).
import { usePathname, useRouter } from "next/navigation";

export function ReportPicker({
  batches,
  current,
  compare,
}: {
  batches: { id: string; label: string }[];
  current: string;
  /** The batch compared with, or "none". */
  compare: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const go = (batch: string, vs: string | null) => {
    const q = new URLSearchParams({ batch });
    if (vs) q.set("vs", vs);
    router.push(`${pathname}?${q.toString()}`);
  };
  return (
    <div className="rpt-pick">
      <div className="field rpt-pick__field">
        <label className="field__label" htmlFor="rpt-batch">
          Batch
        </label>
        <span className="select-wrap">
          <select id="rpt-batch" className="select" value={current} onChange={(e) => go(e.target.value, null)}>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </span>
      </div>
      <div className="field rpt-pick__field">
        <label className="field__label" htmlFor="rpt-vs">
          Compare with
        </label>
        <span className="select-wrap">
          <select id="rpt-vs" className="select" value={compare} onChange={(e) => go(current, e.target.value)}>
            <option value="none">Nothing</option>
            {batches
              .filter((b) => b.id !== current)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
          </select>
        </span>
      </div>
    </div>
  );
}
