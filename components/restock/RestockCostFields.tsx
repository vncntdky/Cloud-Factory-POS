"use client";

// Shipping, tax, MOOE and other (with its own label): a batch's costs on top of the goods.
// Used by Receive batch and Edit restock costs. onChange reports the total in centavos.
import { centsToInput, toCents } from "@/lib/format";
import { COST_FIELDS } from "@/lib/restock";

type Initial = { shipping_cents: number; tax_cents: number; mooe_cents: number; other_cents: number; other_label: string | null };

export function restockTotal(form: HTMLFormElement) {
  return COST_FIELDS.reduce((n, f) => n + (toCents(String(new FormData(form).get(f.name) ?? "")) ?? 0), 0);
}

export function RestockCostFields({
  initial,
  invalid,
  onChange,
}: {
  initial?: Initial;
  invalid?: string;
  onChange?: (totalCents: number) => void;
}) {
  return (
    <div
      className="form-grid form-grid--2"
      onChange={onChange ? (e) => onChange(restockTotal((e.target as HTMLInputElement).form!)) : undefined}
    >
      {COST_FIELDS.map((f) => {
        const cents = initial ? initial[`${f.name}_cents`] : 0;
        return (
          <div className="field" key={f.name}>
            <label className="field__label" htmlFor={`cost-${f.name}`}>
              {f.label} <span className="optional">(optional)</span>
            </label>
            <div className="input-affix">
              <span className="input-affix__prefix" aria-hidden="true">
                ₱
              </span>
              <input
                id={`cost-${f.name}`}
                name={f.name}
                className="input input--num"
                inputMode="decimal"
                defaultValue={cents ? centsToInput(cents) : ""}
                placeholder="0"
                aria-invalid={invalid === f.name || undefined}
              />
            </div>
          </div>
        );
      })}
      <div className="field span-all">
        <label className="field__label" htmlFor="cost-other-label">
          What &ldquo;Other&rdquo; is for <span className="optional">(optional)</span>
        </label>
        <input
          id="cost-other-label"
          name="other_label"
          className="input"
          maxLength={40}
          defaultValue={initial?.other_label ?? ""}
          placeholder="Permit, packaging, courier…"
        />
      </div>
    </div>
  );
}
