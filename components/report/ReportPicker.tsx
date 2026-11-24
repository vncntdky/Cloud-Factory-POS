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
      <label className="field rpt-pick__field">
        <span className="field__label">Batch</span>
        <span className="select-wrap">
          <select className="select" value={current} onChange={(e) => go(e.target.value, null)}>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </span>
      </label>
      <label className="field rpt-pick__field">
        <span className="field__label">Compare with</span>
        <span className="select-wrap">
          <select className="select" value={compare} onChange={(e) => go(current, e.target.value)}>
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
      </label>
    </div>
  );
}
