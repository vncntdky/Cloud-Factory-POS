"use client";

// The period the Finance statements cover: since opening, or one month.
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function PeriodSelect({ value, options }: { value: string; options: { value: string; label: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <div className="select-wrap fin-period__select">
      <select
        className="select"
        aria-label="Period"
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          if (e.target.value === "all") next.delete("period");
          else next.set("period", e.target.value);
          router.push(`${pathname}?${next.toString()}`);
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
