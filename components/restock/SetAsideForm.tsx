"use client";

// Company funds → Next restock: decide how much the fund keeps for the next batch. Owners and managers.
// Batches paid from the fund that come in after the decision use it up; then this asks again.
import { useState } from "react";
import { setRestockSetAside, type RestockFormState } from "@/app/(staff)/restock/actions";
import { Icon } from "@/components/Icon";
import { Money } from "@/components/Money";
import { centsToInput, toCents } from "@/lib/format";
import { formatManilaDate } from "@/lib/time";
import { useFormAction } from "@/lib/use-form-action";

export type SetAside = {
  needsDecision: boolean;
  /** Still kept for the next restock (decided amount − what batches since used). */
  kept: number;
  setAside: number;
  used: number;
  setAt: string | null;
  note: string | null;
  lastBatchNo: number | null;
  lastBatchCents: number | null;
  /** What's in the fund now. */
  balance: number;
};

export function SetAsideForm({ s }: { s: SetAside }) {
  const [open, setOpen] = useState(s.needsDecision);
  const [amount, setAmount] = useState(s.lastBatchCents ? centsToInput(s.lastBatchCents) : "");
  const [state, onSubmit, pending] = useFormAction<RestockFormState>(setRestockSetAside, null);
  const cents = toCents(amount);
  const left = cents === null ? null : s.balance - cents;

  const picks = [
    s.lastBatchNo !== null && s.lastBatchCents ? { label: `Same as Batch ${s.lastBatchNo}`, cents: s.lastBatchCents } : null,
    s.balance > 0 ? { label: "Everything in the fund", cents: s.balance } : null,
    { label: "Nothing", cents: 0 },
  ].filter((p): p is { label: string; cents: number } => p !== null);

  return (
    <div className="stack stack-2" id="next-restock">
      <h3 className="eyebrow">Next restock</h3>
      {s.needsDecision && (
        <div className="notice notice--info" role="status">
          <Icon name="info" />
          <div>
            <p className="notice__title">
              {s.setAt === null
                ? "How much should the fund keep for the next restock?"
                : `Batch ${s.lastBatchNo} came in and was paid from the fund. How much should it keep for the next one?`}
            </p>
            <p>What you keep stays in the fund. The rest can be released as profit.</p>
          </div>
        </div>
      )}
      {s.setAt !== null && (
        <p className="t-sm">
          Keeping <strong>
            <Money cents={s.kept} />
          </strong>{" "}
          for the next restock
          {s.used > 0 && (
            <>
              {" "}
              (<Money cents={s.used} /> of <Money cents={s.setAside} /> used by batches since)
            </>
          )}
          <span className="muted">
            {" "}
            · decided {formatManilaDate(s.setAt)}
            {s.note && ` · ${s.note}`}
          </span>
        </p>
      )}
      {!open ? (
        <div>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => setOpen(true)}>
            Change the amount
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="stack" aria-label="Keep for the next restock">
          <div className="pick-chips" role="group" aria-label="Quick amounts">
            {picks.map((p) => (
              <button
                key={p.label}
                type="button"
                className="filter-chip"
                aria-pressed={cents === p.cents}
                onClick={() => setAmount(centsToInput(p.cents))}
              >
                {p.label} · <Money cents={p.cents} />
              </button>
            ))}
          </div>
          <div className="form-grid form-grid--2">
            <div className="field">
              <label className="field__label" htmlFor="sa-amount">
                Keep for the next restock
              </label>
              <div className="input-affix">
                <span className="input-affix__prefix" aria-hidden="true">
                  ₱
                </span>
                <input
                  id="sa-amount"
                  name="amount"
                  className="input input--num"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  aria-invalid={state?.field === "amount" || undefined}
                  aria-describedby="sa-amount-h"
                />
              </div>
              <p className="field__hint" id="sa-amount-h">
                {left === null ? (
                  "Goods plus shipping and other restocking fees."
                ) : left >= 0 ? (
                  <>
                    Leaves <Money cents={left} /> to release.
                  </>
                ) : (
                  <>
                    That&apos;s <Money cents={-left} /> more than the fund has now. Nothing can be released until sales
                    cover it.
                  </>
                )}
              </p>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="sa-note">
                Note <span className="optional">(optional)</span>
              </label>
              <input id="sa-note" name="note" className="input" maxLength={200} placeholder="e.g. Black TEO reorder" />
            </div>
          </div>
          {state?.error && (
            <p className="field__error" role="alert">
              <Icon name="alert" />
              {state.error}
            </p>
          )}
          <div className="btn-row">
            <button type="submit" className="btn btn--primary" aria-busy={pending || undefined} disabled={pending}>
              Keep this amount
            </button>
            {!s.needsDecision && (
              <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
