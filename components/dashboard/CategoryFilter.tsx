"use client";

// A dropdown filter (dashboard category, expenses batch): keeps a long list uncluttered.
// Choosing an option goes to its link (which keeps the other filters).
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function CategoryFilter({
  value,
  options,
  hrefs,
  label = "Category",
  allLabel = "All categories",
  id = "dash-category",
}: {
  id?: string;
  label?: string;
  allLabel?: string;
  value: string;
  options: { value: string; label: string }[];
  /** Link per option value; "" = all categories. */
  hrefs: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="field dash-filter">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="select-wrap">
        <select
          id={id}
          className="select"
          value={value}
          aria-busy={pending || undefined}
          onChange={(e) => startTransition(() => router.push(hrefs[e.target.value] ?? hrefs[""]))}
        >
          <option value="">{allLabel}</option>
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
