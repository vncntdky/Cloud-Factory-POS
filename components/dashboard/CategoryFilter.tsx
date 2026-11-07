"use client";

// Dashboard category filter: a dropdown, so a shop with many categories stays uncluttered.
// Choosing one goes to that link (which keeps the range and sort).
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function CategoryFilter({
  value,
  options,
  hrefs,
}: {
  value: string;
  options: { value: string; label: string }[];
  /** Link per option value; "" = all categories. */
  hrefs: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="field dash-filter">
      <label className="field__label" htmlFor="dash-category">
        Category
      </label>
      <div className="select-wrap">
        <select
          id="dash-category"
          className="select"
          value={value}
          aria-busy={pending || undefined}
          onChange={(e) => startTransition(() => router.push(hrefs[e.target.value] ?? hrefs[""]))}
        >
          <option value="">All categories</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
