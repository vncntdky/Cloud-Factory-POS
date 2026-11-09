// Pick the batch a stock change belongs to. With no batches yet, says where to make one.
import Link from "next/link";
import type { BatchOption } from "@/lib/batches";

export function BatchSelect({
  id,
  batches,
  defaultValue,
  invalid,
  hint,
}: {
  id: string;
  batches: BatchOption[];
  defaultValue?: string | null;
  invalid?: boolean;
  hint: string;
}) {
  if (batches.length === 0) {
    return (
      <div className="field">
        <span className="field__label">Batch</span>
        <p className="t-sm muted">
          Stock changes go into a batch. <Link href="/restock?view=batches">Receive a batch</Link> first, or turn your
          earlier stock into one.
        </p>
      </div>
    );
  }
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        Batch
      </label>
      <div className="select-wrap">
        <select
          id={id}
          name="batch_id"
          className="select"
          defaultValue={defaultValue ?? batches[0].id}
          required
          aria-invalid={invalid || undefined}
          aria-describedby={`${id}-h`}
        >
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </div>
      <p className="field__hint" id={`${id}-h`}>
        {hint}
      </p>
    </div>
  );
}
