// Company funds on Sales → P&L (owners and managers): gross and net sales, where the money went,
// what you decided to keep for the next restock, and how much profit can be released (split
// owner : manager). Owners and managers decide the restock amount; only the owner releases profit.
import { undoRelease } from "@/app/(staff)/restock/actions";
import { Icon } from "@/components/Icon";
import { Kpi, KpiGrid } from "@/components/Kpi";
import { Money } from "@/components/Money";
import { ReleaseForm } from "@/components/restock/ReleaseForm";
import { SetAsideForm } from "@/components/restock/SetAsideForm";
import { PAYMENT_METHOD_LABELS, type SaleMethod } from "@/lib/format";
import { shareLabel, splitProfit } from "@/lib/pnl";
import { formatManilaDate } from "@/lib/time";

export type Funds = {
  gross_cents: number;
  discount_cents: number;
  net_cents: number;
  owed_cents: number;
  collected_cents: number;
  collected_by_method: Record<string, number>;
  goods_cents: number;
  goods_uncosted: number;
  restock_fees_cents: number;
  expenses_cents: number;
  released_cents: number;
  owner_released_cents: number;
  manager_released_cents: number;
  balance_cents: number;
  /** The latest decision on what to keep for the next restock, and what batches since used of it. */
  set_aside_cents: number;
  set_aside_used_cents: number;
  kept_cents: number;
  set_aside_at: string | null;
  set_aside_note: string | null;
  /** A batch came in since the last decision (or none was made yet). */
  needs_decision: boolean;
  last_batch_no: number | null;
  last_batch_cents: number | null;
  available_cents: number;
};

export type Release = {
  id: string;
  amount_cents: number;
  owner_cents: number;
  manager_cents: number;
  note: string | null;
  released_on: string;
};

const ORDER = ["cash", "gcash", "maya", "card", "bank_transfer"];

export function FundsCard({
  funds: f,
  releases,
  split,
  isOwner,
  kept,
}: {
  funds: Funds;
  releases: Release[];
  split: { owner: number; manager: number };
  isOwner: boolean;
  /** Just saved the restock amount. */
  kept?: boolean;
}) {
  const parts = split.owner + split.manager;
  const shares = splitProfit(f.available_cents, split.owner, split.manager);
  const methods = Object.entries(f.collected_by_method)
    .filter(([, c]) => Number(c) > 0)
    .sort(([a], [b]) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const nonCash = methods.filter(([m]) => m !== "cash").reduce((n, [, c]) => n + Number(c), 0);

  return (
    <section className="card stack" id="funds" aria-labelledby="funds-t">
      <div className="card__head">
        <h2 className="card__title" id="funds-t">
          Company funds
        </h2>
      </div>
      <KpiGrid aria-label="Company funds">
        <Kpi
          variant="hero"
          wide
          label="Available to release"
          value={<Money cents={f.available_cents} />}
          meta={
            <>
              owner <Money cents={shares.owner} /> · manager <Money cents={shares.manager} /> ({shareLabel(split.owner, parts)} :{" "}
              {shareLabel(split.manager, parts)})
            </>
          }
        />
        <Kpi label="Gross sales" value={<Money cents={f.gross_cents} />} meta="before discounts" />
        <Kpi label="Net sales" value={<Money cents={f.net_cents} />} meta="after discounts" />
        <Kpi
          label="In the fund"
          variant={f.balance_cents < 0 ? "alert" : undefined}
          value={<Money cents={f.balance_cents} />}
          meta="after stock, expenses, releases"
        />
        <Kpi
          label="Kept for next restock"
          variant={f.needs_decision ? "alert" : undefined}
          value={<Money cents={f.kept_cents} />}
          meta={f.needs_decision ? "Decide below" : "your decision"}
          href="#next-restock"
        />
      </KpiGrid>
      {kept && <p className="t-sm notice-inline">Saved: the fund keeps that for the next restock.</p>}

      <dl className="cost-list pnl">
        <dt>Gross sales</dt>
        <dd>
          <Money cents={f.gross_cents} />
        </dd>
        <dt>Discounts</dt>
        <dd>
          − <Money cents={f.discount_cents} />
        </dd>
        <dt className="cost-list__total">Net sales</dt>
        <dd className="cost-list__total">
          <Money cents={f.net_cents} />
        </dd>
        <dt>
          Floating: not paid yet <span className="muted">(Collectibles)</span>
        </dt>
        <dd>
          − <Money cents={f.owed_cents} />
        </dd>
        <dt className="cost-list__total">Cash collected</dt>
        <dd className="cost-list__total">
          <Money cents={f.collected_cents} />
        </dd>
        <dt>Stock bought (goods)</dt>
        <dd>
          − <Money cents={f.goods_cents} />
        </dd>
        <dt>Restocking fees (shipping, tax, MOOE, other)</dt>
        <dd>
          − <Money cents={f.restock_fees_cents} />
        </dd>
        <dt>Expenses</dt>
        <dd>
          − <Money cents={f.expenses_cents} />
        </dd>
        <dt>Profit released so far</dt>
        <dd>
          − <Money cents={f.released_cents} />
        </dd>
        <dt className="cost-list__total">In the fund</dt>
        <dd className={`cost-list__total${f.balance_cents < 0 ? " text-alert" : ""}`}>
          <Money cents={f.balance_cents} />
        </dd>
        <dt>Kept for the next restock</dt>
        <dd>
          − <Money cents={f.kept_cents} />
        </dd>
        <dt className="cost-list__total">Available to release</dt>
        <dd className="cost-list__total">
          <Money cents={f.available_cents} />
        </dd>
      </dl>

      {methods.length > 0 && (
        <div className="stack stack-2">
          <h3 className="eyebrow">Where the collected money came in</h3>
          <dl className="cost-list">
            {methods.map(([m, c]) => (
              <div key={m} className="contents">
                <dt>{PAYMENT_METHOD_LABELS[m as SaleMethod] ?? m}</dt>
                <dd>
                  <Money cents={Number(c)} />
                </dd>
              </div>
            ))}
          </dl>
          {nonCash > 0 && (
            <p className="t-sm muted">
              Floating: <Money cents={nonCash} /> came in by GCash, Maya, card or bank, so it may not be in the cash drawer.
            </p>
          )}
        </div>
      )}
      {f.goods_uncosted > 0 && (
        <p className="t-sm muted">Some restocked pieces have no cost per piece, so &ldquo;Stock bought&rdquo; is a little low.</p>
      )}
      <p className="t-sm muted">
        Each new batch is paid from the fund when it&apos;s received: its goods plus shipping, tax, MOOE and other restocking
        fees, taken first from what you kept for it. Stock you had already paid for yourselves (like Batch 1) isn&apos;t
        charged, so its sales count in full. Switch a batch on or off on its page.
      </p>

      <SetAsideForm
        s={{
          needsDecision: f.needs_decision,
          kept: f.kept_cents,
          setAside: f.set_aside_cents,
          used: f.set_aside_used_cents,
          setAt: f.set_aside_at,
          note: f.set_aside_note,
          lastBatchNo: f.last_batch_no,
          lastBatchCents: f.last_batch_cents === null ? null : Number(f.last_batch_cents),
          balance: f.balance_cents,
        }}
      />

      {isOwner && <ReleaseForm available={f.available_cents} split={split} />}

      <div className="stack stack-2">
        <h3 className="eyebrow">Released</h3>
        {releases.length === 0 ? (
          <p className="t-sm muted">No profit released yet.</p>
        ) : (
          <ul className="list list--plain" role="list">
            {releases.map((r) => (
              <li key={r.id} className="list-row list-row--compact">
                <span className="list-row__main">
                  <span className="list-row__title">
                    <span>
                      <Money cents={r.amount_cents} />
                    </span>
                  </span>
                  <span className="list-row__meta">
                    {formatManilaDate(r.released_on)} · owner <Money cents={r.owner_cents} /> · manager{" "}
                    <Money cents={r.manager_cents} />
                    {r.note && ` · ${r.note}`}
                  </span>
                </span>
                {isOwner && (
                  <form action={undoRelease}>
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className="icon-btn" aria-label="Undo this release">
                      <Icon name="undo" />
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="t-sm muted">
          Released so far: owner <Money cents={f.owner_released_cents} />, manager <Money cents={f.manager_released_cents} />.
        </p>
      </div>
    </section>
  );
}
