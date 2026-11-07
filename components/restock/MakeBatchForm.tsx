"use client";

// On "Stock before batches": turn that stock into a real batch, so it can carry shipping, tax, MOOE
// and expenses and gets its own P&L. Owners and managers.
import { batchExistingStock, type RestockFormState } from "@/app/(staff)/restock/actions";
import { Icon } from "@/components/Icon";
import { useFormAction } from "@/lib/use-form-action";

export function MakeBatchForm() {
  const [state, onSubmit, pending] = useFormAction<RestockFormState>(batchExistingStock, null);
  return (
    <form onSubmit={onSubmit} className="card stack" aria-labelledby="make-batch-t">
      <div className="card__head">
        <h2 className="card__title" id="make-batch-t">
          Turn this into a batch
        </h2>
      </div>
      <p className="t-sm muted">
        This stock came in before batches were recorded, so it can&apos;t take shipping, tax, MOOE or expenses. Make it a batch
        and it gets its own P&amp;L, and shows under &ldquo;Charge to&rdquo; when you add an expense. Its sales stay the same.
      </p>
      <div className="field">
        <label className="field__label" htmlFor="mb-supplier">
          Supplier <span className="optional">(optional)</span>
        </label>
        <input id="mb-supplier" name="supplier" className="input" maxLength={60} autoComplete="off" />
      </div>
      {state?.error && (
        <p className="field__error" role="alert">
          <Icon name="alert" />
          {state.error}
        </p>
      )}
      <div className="btn-row">
        <button type="submit" className="btn btn--primary" aria-busy={pending || undefined} disabled={pending}>
          <Icon name="box" />
          Turn into a batch
        </button>
      </div>
    </form>
  );
}
