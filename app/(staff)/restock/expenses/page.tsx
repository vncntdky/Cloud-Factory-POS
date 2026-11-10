// Restock → Expenses (owners and managers): every expense, general shop costs and those charged to
// a batch, newest first by month, with totals. ?batch = a batch id or "general" filters the list.
// Add and remove expenses here; they also show in each batch's P&L and in Sales → Finance.
import Link from "next/link";
import { deleteBatchExpense } from "@/app/(staff)/restock/actions";
import { CategoryFilter } from "@/components/dashboard/CategoryFilter";
import { Icon } from "@/components/Icon";
import { Kpi, KpiGrid } from "@/components/Kpi";
import { Main } from "@/components/Main";
import { Money } from "@/components/Money";
import { NotAllowed } from "@/components/NotAllowed";
import { Topbar } from "@/components/Topbar";
import { ExpenseForm } from "@/components/restock/PnlForms";
import { EditExpense } from "@/components/finance/EditForms";
import { requireActiveStaff } from "@/lib/auth";
import { friendlyError } from "@/lib/db-errors";
import { isUuid } from "@/lib/ids";
import { can } from "@/lib/permissions";
import { EXPENSE_CATEGORIES } from "@/lib/pnl";
import { addDays, formatManilaDate, manilaToday } from "@/lib/time";
import { batchTitle, type Batch, type Expense } from "../data";

export const dynamic = "force-dynamic";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ batch?: string; expense?: string }> }) {
  const { supabase, profile } = await requireActiveStaff();
  if (!can(profile, "editStock")) return <NotAllowed title="Expenses" what="Expenses" />;
  const sp = await searchParams;
  const [expRes, batchRes] = await Promise.all([
    supabase
      .from("expenses")
      .select("id, batch_id, spent_on, category, amount_cents, note")
      .order("spent_on", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("stock_batches").select("id, batch_no, supplier").order("batch_no", { ascending: false }),
  ]);
  const all = (expRes.data ?? []) as Expense[];
  const batches = (batchRes.data ?? []) as Pick<Batch, "id" | "batch_no" | "supplier">[];
  const label = (b: Pick<Batch, "batch_no" | "supplier">) => `${batchTitle(b as Batch)}${b.supplier ? ` · ${b.supplier}` : ""}`;
  const batchName = new Map(batches.map((b) => [b.id as string, label(b)]));
  const filter = sp.batch === "general" ? "general" : isUuid(sp.batch) && batchName.has(sp.batch) ? sp.batch : "";
  const shown = all.filter((e) => (filter === "general" ? !e.batch_id : filter ? e.batch_id === filter : true));
  const today = manilaToday();
  const month = today.slice(0, 7);
  const total = shown.reduce((n, e) => n + e.amount_cents, 0);
  const thisMonth = shown.filter((e) => e.spent_on.startsWith(month)).reduce((n, e) => n + e.amount_cents, 0);
  const general = shown.filter((e) => !e.batch_id).reduce((n, e) => n + e.amount_cents, 0);
  const returnTo = `/restock/expenses${filter ? `?batch=${filter}` : ""}`;

  // Group by month, newest first.
  const months = new Map<string, Expense[]>();
  for (const e of shown) months.set(e.spent_on.slice(0, 7), [...(months.get(e.spent_on.slice(0, 7)) ?? []), e]);

  return (
    <>
      <Topbar title="Expenses" />
      <Main>
        <div className="stack stack-6">
          <nav className="segmented" aria-label="Restock">
            <Link className="segmented__option" href="/restock">
              Reorder
            </Link>
            <Link className="segmented__option" href="/restock?view=batches">
              Batches
            </Link>
            <Link className="segmented__option" href="/restock/expenses" aria-current="page">
              Expenses
            </Link>
          </nav>

          {sp.expense === "added" && (
            <div className="notice notice--success" role="status">
              <Icon name="check" />
              <div>
                <p className="notice__title">Expense saved.</p>
              </div>
            </div>
          )}
          {sp.expense === "edited" && (
            <div className="notice notice--success" role="status">
              <Icon name="check" />
              <div>
                <p className="notice__title">Expense updated.</p>
              </div>
            </div>
          )}
          {sp.expense === "removed" && (
            <div className="notice notice--success" role="status">
              <Icon name="check" />
              <div>
                <p className="notice__title">Expense removed.</p>
              </div>
            </div>
          )}
          {(sp.expense === "error" || expRes.error) && (
            <div className="notice notice--danger" role="alert">
              <Icon name="alert" />
              <div>
                <p className="notice__title">
                  {expRes.error ? "Couldn't load expenses." : "Couldn't change that expense. Try again."}
                </p>
                {expRes.error && <p>{friendlyError(expRes.error)}</p>}
              </div>
            </div>
          )}

          <CategoryFilter
            id="exp-filter"
            label="Show"
            allLabel="All expenses"
            value={filter}
            options={[
              { value: "general", label: "General (not a batch)" },
              ...batches.map((b) => ({ value: b.id as string, label: label(b) })),
            ]}
            hrefs={Object.fromEntries([
              ["", "/restock/expenses"],
              ["general", "/restock/expenses?batch=general"],
              ...batches.map((b) => [b.id as string, `/restock/expenses?batch=${b.id}`]),
            ])}
          />

          <KpiGrid aria-label="Expenses">
            <Kpi
              variant="hero"
              wide
              label="Total"
              value={<Money cents={total} />}
              meta={`${shown.length} expense${shown.length === 1 ? "" : "s"}`}
            />
            <Kpi label={`${MONTHS[Number(month.slice(5, 7)) - 1]}`} value={<Money cents={thisMonth} />} meta="this month" />
            <Kpi label="General" value={<Money cents={general} />} meta="not in a batch" />
          </KpiGrid>

          <section className="card stack" aria-labelledby="add-exp-t">
            <div className="card__head">
              <h2 className="card__title" id="add-exp-t">
                Add an expense
              </h2>
            </div>
            <p className="t-sm muted">
              Charge it to a batch (shipping fees, courier, salary for that batch) or to the whole shop (rent, utilities). Batch
              expenses show in that batch&apos;s P&amp;L; general ones come off the shop&apos;s total in Sales → Finance.
            </p>
            <ExpenseForm
              batches={batches.map((b) => ({ id: b.id as string, label: label(b) }))}
              defaultBatch={filter === "general" ? "" : filter}
              returnTo={returnTo}
              today={today}
              earliest={addDays(today, -400)}
            />
          </section>

          {shown.length === 0 ? (
            <p className="t-sm muted">No expenses {filter ? "here " : ""}yet.</p>
          ) : (
            [...months.entries()].map(([m, list]) => (
              <section key={m} className="stack stack-2" aria-labelledby={`m-${m}`}>
                <div className="section-head">
                  <h2 className="eyebrow" id={`m-${m}`}>
                    {MONTHS[Number(m.slice(5, 7)) - 1]} {m.slice(0, 4)}
                  </h2>
                  <span className="section-head__amount">
                    <Money cents={list.reduce((n, e) => n + e.amount_cents, 0)} />
                  </span>
                </div>
                <ul className="list" role="list">
                  {list.map((e) => (
                    <li key={e.id} className="list-row list-row--compact list-row--wrap">
                      <span className="list-row__main">
                        <span className="list-row__title">
                          <span>{EXPENSE_CATEGORIES.find((x) => x.id === e.category)?.label ?? e.category}</span>
                          <span className="chip chip--neutral">
                            {e.batch_id ? (batchName.get(e.batch_id) ?? "Batch") : "General"}
                          </span>
                        </span>
                        <span className="list-row__meta">
                          {formatManilaDate(e.spent_on)}
                          {e.note && ` · ${e.note}`}
                        </span>
                      </span>
                      <span className="list-row__trail">
                        <span className="num">
                          <Money cents={e.amount_cents} />
                        </span>
                      </span>
                      <EditExpense
                        expense={e}
                        batches={[...batchName].map(([id, l]) => ({ id, label: l }))}
                        returnTo={returnTo}
                        today={today}
                        earliest={addDays(today, -400)}
                      />
                      <form action={deleteBatchExpense}>
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="return_to" value={returnTo} />
                        <button type="submit" className="icon-btn" aria-label={`Remove ${e.note ?? e.category} expense`}>
                          <Icon name="trash" />
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </Main>
    </>
  );
}
