"use client";

// Owner distributions (owner): up to what's safe to distribute, split owner : manager.
import { useState } from "react";
import { releaseProfits, type RestockFormState } from "@/app/(staff)/restock/actions";
import { Icon } from "@/components/Icon";
import { Money } from "@/components/Money";
import { centsToInput, toCents } from "@/lib/format";
import { splitProfit } from "@/lib/pnl";
import { useFormAction } from "@/lib/use-form-action";

export function ReleaseForm({ available, split }: { available: number; split: { owner: number; manager: number } }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(available > 0 ? centsToInput(available) : "");
  const [state, onSubmit, pending] = useFormAction<RestockFormState>(releaseProfits, null);
  const cents = toCents(amount) ?? 0;
  const s = splitProfit(Math.max(0, cents), split.owner, split.manager);

  if (!open) {
    return (
      <div>
        <button
          type="button"
          className="btn btn--money"
          onClick={() => setOpen(true)}
          disabled={available <= 0}
          aria-expanded={false}
        >
          Record distribution
        </button>
        {available <= 0 && <p className="field__hint">Nothing is safe to distribute yet. See the lines above for what holds it back.</p>}
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} className="stack" aria-label="Record distribution">
      <div className="form-grid form-grid--2">
        <div className="field">
          <label className="field__label" htmlFor="rel-amount">
            Amount to distribute
          </label>
          <div className="input-affix">
            <span className="input-affix__prefix" aria-hidden="true">
              ₱
            </span>
            <input
              id="rel-amount"
              name="amount"
              className="input input--num"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              aria-invalid={state?.field === "amount" || undefined}
            />
          </div>
          <p className="field__hint">
            Up to <Money cents={available} />. Owner gets <Money cents={s.owner} />, manager <Money cents={s.manager} />.
          </p>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="rel-note">
            Note <span className="optional">(optional)</span>
          </label>
          <input id="rel-note" name="note" className="input" maxLength={200} placeholder="Profit for November…" />
        </div>
      </div>
      {state?.error && (
        <p className="field__error" role="alert">
          <Icon name="alert" />
          {state.error}
        </p>
      )}
      <div className="btn-row">
        <button type="submit" className="btn btn--money btn--sm" disabled={pending} aria-busy={pending || undefined}>
          Distribute <Money cents={Math.max(0, cents)} />
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}
