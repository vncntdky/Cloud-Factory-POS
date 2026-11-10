"use client";

// Owner: the percentage tax rate on net sales used for the tax estimate (0 = none).
import { useState } from "react";
import { setTaxRate, type RestockFormState } from "@/app/(staff)/restock/actions";
import { Icon } from "@/components/Icon";
import { useFormAction } from "@/lib/use-form-action";

export function TaxRateForm({ bp }: { bp: number }) {
  const [open, setOpen] = useState(false);
  const [state, onSubmit, pending] = useFormAction<RestockFormState>(setTaxRate, null);
  if (!open) {
    return (
      <button type="button" className="text-btn" onClick={() => setOpen(true)}>
        Change tax rate
      </button>
    );
  }
  return (
    <form onSubmit={onSubmit} className="stack" aria-label="Tax rate">
      <div className="field">
        <label className="field__label" htmlFor="tax-rate">
          Percentage tax on net sales
        </label>
        <div className="input-affix input-affix--suffix fin-rate">
          <input id="tax-rate" name="rate" className="input input--num" inputMode="decimal" defaultValue={String(bp / 100)} required aria-invalid={state?.field === "rate" || undefined} />
          <span className="input-affix__suffix">%</span>
        </div>
        <p className="field__hint">3% is the usual percentage tax for shops that aren&apos;t VAT-registered. Ask your accountant. 0 = no estimate.</p>
      </div>
      {state?.error && (
        <p className="field__error" role="alert">
          <Icon name="alert" />
          {state.error}
        </p>
      )}
      <div className="btn-row">
        <button type="submit" className="btn btn--primary btn--sm" disabled={pending} aria-busy={pending || undefined}>
          Save rate
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}
