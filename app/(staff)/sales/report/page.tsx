// Sales → Finance → Report (owner only): one batch, compared with another (the one before it unless picked).
// What it made, how fast it sold, when it earned back its cost, where each peso of net sales went, who still
// owes, how each flavour sold, the statement side by side, and what to do next.
// Totals come from the batch's statement (batch_statements + its expenses, exactly as on Finance → Batches);
// each day's sales, the flavours, who owes and how it was paid come from batch_report
// (supabase/migrations/20261125000000_batch_report.sql). The calculations are in lib/batch-report.ts.
import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { Kpi, KpiGrid } from "@/components/Kpi";
import { Main } from "@/components/Main";
import { Money } from "@/components/Money";
import { NotAllowed } from "@/components/NotAllowed";
import { Topbar } from "@/components/Topbar";
import { DayLines } from "@/components/report/DayLines";
import { PartsBars, type PartsRow } from "@/components/report/PartsBars";
import { BatchDateForm } from "@/components/finance/EditForms";
import { ReportPicker } from "@/components/report/ReportPicker";
import { requireActiveStaff } from "@/lib/auth";
import {
  batchFigures,
  fmtPace,
  fmtPct,
  listing,
  mainCompare,
  pickCompare,
  plural,
  type BatchFigures,
  type BatchReportRpc,
} from "@/lib/batch-report";
import { friendlyError } from "@/lib/db-errors";
import { paymentMethodLabel, pesos } from "@/lib/format";
import { can } from "@/lib/permissions";
import { shareLabel } from "@/lib/pnl";
import { addDays, manilaToday } from "@/lib/time";
import { batchStatement, loadBatchStatements, loadBatches, type Batch } from "../../restock/data";

export const dynamic = "force-dynamic";

type SP = { batch?: string; vs?: string; date?: string };
type RealBatch = Batch & { id: string; batch_no: number; received_on: string };

const isReal = (b: Batch): b is RealBatch => b.id !== null && b.batch_no !== null && b.received_on !== null;

const FIN_VIEWS = [
  { href: "/sales/pnl", label: "Overview" },
  { href: "/sales/pnl?view=pl", label: "Profit & loss" },
  { href: "/sales/pnl?view=cash", label: "Cash flow" },
  { href: "/sales/pnl?view=balance", label: "Balance" },
  { href: "/sales/pnl?view=batches", label: "Batches" },
];

/** "9 Nov", kept on one line. */
function dayMonth(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).replace(" ", "\u00a0");
}

/** Spaces that keep a short phrase on one line ("day 2", "5 buyers"). */
const nb = (s: string) => s.replace(/ /g, "\u00a0");

const abs = Math.abs;
/** To one decimal, as shown: deltas are worked out from the numbers on screen. */
const round1 = (x: number) => Math.round(x * 10) / 10;

/** ▲ / ▼ with the colour of good or bad news; flat = no colour. */
function Delta({ diff, good, children }: { diff: number; good: "up" | "down" | "flat"; children: ReactNode }) {
  if (diff === 0) return null;
  const up = diff > 0;
  const tone = good === "flat" ? "flat" : up === (good === "up") ? "good" : "bad";
  return (
    <span className={`rpt-delta rpt-delta--${tone}`}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span> {children}
    </span>
  );
}

/** The comparison line under a tile: the other batch's value, then the change. */
function Vs({ b, value, children }: { b: BatchFigures | null; value: ReactNode; children?: ReactNode }) {
  if (!b) return children ? <>{children}</> : null;
  return (
    <>
      <span className="rpt-vs">
        <span className="rpt-dotkey" aria-hidden="true" />
        {b.title}: {value}
      </span>
      {children}
    </>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="card stack rpt-section" aria-labelledby={id}>
      <h2 className="card__title" id={id}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function BatchReportPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { supabase, profile } = await requireActiveStaff();
  if (!can(profile, "seeReports")) return <NotAllowed title="Batch report" what="The batch report" who="the owner" />;
  const sp = await searchParams;

  const [{ list, expenses, error }, { statements, error: statementsError }, settingsRes] = await Promise.all([
    loadBatches(supabase),
    loadBatchStatements(supabase),
    supabase.from("settings").select("split_owner_parts, split_manager_parts, tax_rate_bp").maybeSingle(),
  ]);
  const settings = settingsRes.data as { split_owner_parts: number; split_manager_parts: number; tax_rate_bp: number } | null;
  const split = { owner: settings?.split_owner_parts ?? 2, manager: settings?.split_manager_parts ?? 1 };
  const taxRateBp = Number(settings?.tax_rate_bp ?? 0);
  // Newest first, as loadBatches returns them.
  const batches = list.map((x) => x.batch).filter(isReal);
  const current = batches.find((b) => b.id === sp.batch) ?? batches[0];
  const vs = current ? pickCompare(batches, current, sp.vs) : [];
  // "All batches" is offered when there are at least two other batches; with one it is that batch.
  const canAll = batches.length >= 3;
  const compareValue = sp.vs === "all" && canAll ? "all" : (vs[0]?.id ?? "none");

  let body: ReactNode;
  const loadError = error ?? statementsError ?? settingsRes.error;
  if (loadError) {
    body = <Problem text={friendlyError(loadError)} />;
  } else if (!current) {
    body = (
      <EmptyState
        title="No batches yet."
        text="The report compares batches. Receive a delivery as a batch under Restock, and its report shows here."
        action={
          <Link className="btn btn--money" href="/restock/receive">
            <Icon name="plus" />
            Receive batch
          </Link>
        }
      />
    );
  } else {
    const wanted = [current, ...vs];
    const results = await Promise.all(wanted.map((x) => supabase.rpc("batch_report", { p_batch: x.id })));
    const failed = results.find((r) => r.error || !r.data);
    if (failed) {
      body = <Problem text={friendlyError(failed.error)} />;
    } else {
      const st = (b: RealBatch) => batchStatement(statements.get(b.id), b, expenses, taxRateBp);
      const [a, ...others] = wanted.map((x, i) => batchFigures(x, st(x), results[i].data as BatchReportRpc, split));
      body = (
        <Report
          a={a}
          others={others}
          split={split}
          taxRateBp={taxRateBp}
          newestId={batches[0].id}
          compare={compareValue}
          dateSaved={sp.date === "saved"}
        />
      );
    }
  }

  return (
    <>
      <Topbar title="Batch report" />
      <Main>
        <div className="stack stack-6 fin rpt">
          <nav className="segmented" aria-label="Sales">
            <Link className="segmented__option" href="/sales">
              Daily sales
            </Link>
            <Link className="segmented__option" href="/sales/dashboard">
              Dashboard
            </Link>
            <Link className="segmented__option" href="/sales/pnl" aria-current="page">
              Finance
            </Link>
          </nav>
          <nav className="filter-row fin-views" aria-label="Finance">
            {FIN_VIEWS.map((v) => (
              <Link key={v.href} className="filter-chip" href={v.href}>
                {v.label}
              </Link>
            ))}
            <Link className="filter-chip" href="/sales/report" aria-current="page">
              Report
            </Link>
          </nav>
          {current && (
            <ReportPicker
              batches={batches.map((b) => ({ id: b.id, label: `Batch ${b.batch_no}` }))}
              current={current.id}
              compare={compareValue}
              canAll={canAll}
            />
          )}
          {body}
        </div>
      </Main>
    </>
  );
}

function Problem({ text }: { text: string }) {
  return (
    <div className="notice notice--danger" role="alert">
      <Icon name="alert" />
      <div>
        <p className="notice__title">Couldn&apos;t load the report.</p>
        <p>{text}</p>
      </div>
    </div>
  );
}

function Report({
  a,
  others,
  split,
  taxRateBp,
  newestId,
  compare,
  dateSaved,
}: {
  a: BatchFigures;
  /** Every batch compared with, newest first (one, all, or none). */
  others: BatchFigures[];
  split: { owner: number; manager: number };
  taxRateBp: number;
  /** The newest batch: only it gets "receive the next delivery". */
  newestId: string;
  /** The comparison picked ("all", "none" or a batch), kept when the date is changed. */
  compare: string;
  /** The batch's date was just changed. */
  dateSaved: boolean;
}) {
  const parts = split.owner + split.manager;
  const ownerShare = shareLabel(split.owner, parts);
  const managerShare = shareLabel(split.manager, parts);
  // The summary and tiles read against one batch: the one picked, or with All batches the batch before.
  const b = mainCompare(a, others);
  const many = others.length > 1;
  const both = [a, ...others];
  const xMax = Math.max(...both.map((f) => f.series.length - 1), 1);
  const asOf = dayMonth(a.today);
  // The reported batch in the accent colour, the batch read against in grey, any others in a lighter grey.
  const tone = (f: BatchFigures, i: number) => (i === 0 ? "accent" : f === b ? "muted" : "faint") as "accent" | "muted" | "faint";

  return (
    <>
      <p className="t-sm muted">
        {a.title} arrived on {dayMonth(a.receivedOn)}
        {a.supplier ? ` from ${a.supplier}` : ""}
        {many
          ? `. Compared with every other batch: ${listing(others.map((f) => f.title))}. The summary and the tiles compare with ${b?.title}, the batch before it.`
          : b
            ? `. Compared with ${b.title}, which arrived on ${dayMonth(b.receivedOn)}.`
            : "."}{" "}
        Figures up to now: they change as you sell, collect and add expenses.
      </p>
      {dateSaved && (
        <div className="notice notice--success" role="status">
          <Icon name="check" />
          <div>
            <p className="notice__title">
              {a.title} now arrived on {dayMonth(a.receivedOn)}.
            </p>
            <p>Its days on the charts, its pace and the day it earned back its cost count from that date.</p>
          </div>
        </div>
      )}
      <BatchDateForm
        batch={{ id: a.id, title: a.title, received_on: a.receivedOn }}
        compare={compare}
        today={manilaToday()}
        earliest={addDays(manilaToday(), -400)}
      />

      <Lead a={a} b={b} />
      <Tiles a={a} b={b} ownerShare={ownerShare} managerShare={managerShare} />

      <Section id="rpt-pace" title="How fast it sold">
        <p className="t-sm muted">
          {paceCaption(a, b)}
          {many ? ` The lighter lines are ${listing(others.filter((f) => f !== b).map((f) => f.title))}.` : ""} Tap or point at
          the chart to read each day.
        </p>
        <DayLines
          title="Pieces sold so far, by day since each batch arrived"
          unit="count"
          lines={both.map((f, i) => ({
            key: f.id,
            label: f.title,
            tone: tone(f, i),
            values: f.series.map((p) => p.cumPcs),
            end: many ? f.title : f.soldOutDay !== null ? "sold out" : `${f.st.sold} of ${f.st.received}`,
          }))}
          tips={Array.from({ length: xMax + 1 }, (_, d) => [
            `Day ${d}`,
            ...both.map((f) => {
              const p = f.series[d];
              return p ? `${f.title} · ${dayMonth(p.date)}: ${p.cumPcs} sold` : `${f.title}: ${past(f)}`;
            }),
          ])}
          focusDay={a.series.length - 1}
          table={dayTable(both, xMax, (p) => String(p.cumPcs))}
        />
      </Section>

      <Section id="rpt-payback" title="When it earned back its cost">
        <p className="t-sm muted">{paybackCaption(a, b)}</p>
        <DayLines
          title="Net sales so far against each batch's cost in full, by day since each batch arrived"
          unit="pesos"
          lines={both.map((f, i) => ({
            key: f.id,
            label: f.title,
            tone: tone(f, i),
            values: f.series.map((p) => p.cumNet),
            end: many ? f.title : pesos(f.series.at(-1)?.cumNet ?? 0),
            level: i === 0 || f === b ? f.st.costInFull : undefined,
            ring: f.paybackDay,
          }))}
          tips={Array.from({ length: xMax + 1 }, (_, d) => [
            `Day ${d}`,
            ...both.map((f) => {
              const p = f.series[d];
              if (!p) return `${f.title}: ${past(f)}`;
              const left = f.st.costInFull - p.cumNet;
              return `${f.title} · ${dayMonth(p.date)}: ${pesos(p.cumNet)}, ${left <= 0 ? "cost covered" : `${pesos(left)} to go`}`;
            }),
          ])}
          focusDay={a.paybackDay ?? a.series.length - 1}
          table={dayTable(both, xMax, (p) => pesos(p.cumNet))}
        />
      </Section>

      <WhereEachPeso a={a} b={b} all={both} />
      <PaidAndOwed all={both} />
      <Flavours a={a} b={b} all={both} xMax={xMax} />
      <Statement all={both} ownerShare={ownerShare} managerShare={managerShare} taxRateBp={taxRateBp} />
      <NextSteps a={a} b={b} others={others} newestId={newestId} />

      <Section id="rpt-how" title="How these numbers are worked out">
        <ul className="rpt-notes">
          <li>
            From the app&apos;s own records, as of {asOf}. Each sale is matched to the batch its pieces came from, first in, first
            out. The totals are the batch&apos;s statement on Finance → Batches.
          </li>
          <li>
            Net profit so far = net sales − cost of the pieces sold − their share of shipping and restocking fees − the
            batch&apos;s expenses
            {taxRateBp > 0 ? " − the percentage tax estimate" : ""}
            {both.some((f) => f.st.countDiffs !== 0) ? " ± counts and losses" : ""}. Shares are owner {ownerShare} and manager {managerShare},
            before general expenses: a guide, not a payout (what can be paid out is Safe to distribute on Overview).
          </li>
          <li>
            Pace = pieces sold ÷ days from arrival to the last sale, both counted. Day 0 is the day the batch arrived.
          </li>
          <li>
            &quot;Earned back its cost&quot; counts each sale on the day it was made, paid or not. Cost in full = what the
            pieces cost + restocking fees + the batch&apos;s expenses.
          </li>
        </ul>
      </Section>
    </>
  );
}

/** A day the batch's line doesn't reach: it sold out before it, or the batch is younger than that. */
function past(f: BatchFigures) {
  return f.soldOutDay !== null ? `sold out on day ${f.soldOutDay}` : `not there yet (it is on day ${f.age})`;
}

/** What comes below gross profit: the batch's expenses, the tax estimate, and counts and losses (missing pieces add). */
function below(f: BatchFigures) {
  return f.st.expenseTotal + f.st.tax - f.st.countDiffs;
}

function belowWords(...fs: (BatchFigures | null)[]) {
  return fs.some((f) => f && (f.st.tax !== 0 || f.st.countDiffs !== 0)) ? "expenses, tax estimate and counts" : "expenses";
}

/** "1 piece" / "2.1 pieces". */
function perDay(p: number | null) {
  const s = fmtPace(p);
  return `${s} ${s === "1" ? "piece" : "pieces"} a day`;
}

function dayTable(both: BatchFigures[], xMax: number, cell: (p: BatchFigures["series"][number]) => string) {
  return {
    head: ["Day", ...both.flatMap((f) => [`${f.title} date`, f.title])],
    rows: Array.from({ length: xMax + 1 }, (_, d) => [
      String(d),
      ...both.flatMap((f) => {
        const p = f.series[d];
        return p ? [dayMonth(p.date), cell(p)] : f.soldOutDay !== null ? ["sold out", "–"] : ["–", "–"];
      }),
    ]),
  };
}

function paceCaption(a: BatchFigures, b: BatchFigures | null) {
  const one = (f: BatchFigures) => {
    if (f.st.sold === 0) return `${f.title} hasn't sold a piece yet.`;
    const first =
      f.firstSaleDay === 0
        ? `${f.title} sold ${plural(f.series[0]?.pcs ?? 0, "piece")} on the day it arrived`
        : `${f.title} sold nothing on the day it arrived, made its first sale on day ${f.firstSaleDay}`;
    const end = f.soldOutDay === 0 ? " and sold out that day" : f.soldOutDay !== null ? `, sold out on day ${f.soldOutDay}` : "";
    const quiet = f.quietDays.length ? `, and had no sales on ${f.quietDays.length === 1 ? "day" : "days"} ${listing(f.quietDays)}` : "";
    return `${first}${end}${quiet}.`;
  };
  return [one(a), b ? one(b) : ""].filter(Boolean).join(" ");
}

function paybackCaption(a: BatchFigures, b: BatchFigures | null) {
  const one = (f: BatchFigures) =>
    f.paybackDay !== null
      ? `${f.title} covered its ${pesos(f.st.costInFull)} on day ${f.paybackDay} (${dayMonth(f.series[f.paybackDay].date)}).`
      : `${f.title} hasn't covered its ${pesos(f.st.costInFull)} yet: ${pesos(f.st.costInFull - (f.series.at(-1)?.cumNet ?? 0))} to go.`;
  return `Net sales so far (paid or not) against each batch's cost in full: the goods, restocking fees and its expenses. ${one(a)}${b ? ` ${one(b)}` : ""}`;
}

function Lead({ a, b }: { a: BatchFigures; b: BatchFigures | null }) {
  if (a.st.sold === 0) {
    return (
      <p className="rpt-lead">
        {a.title} hasn&apos;t sold anything yet. It came in with {plural(a.st.received, "piece")} that cost{" "}
        {pesos(a.st.costInFull)} in full.
      </p>
    );
  }
  const diff = b ? a.st.netProfit - b.st.netProfit : 0;
  const s1 = (
    <>
      {a.st.netProfit < 0 ? (
        <>
          {a.title} is <strong>{pesos(-a.st.netProfit)}</strong> short so far (its costs are more than its net sales)
        </>
      ) : (
        <>
          {a.title} has made <strong>{pesos(a.st.netProfit)}</strong> net profit so far
        </>
      )}
      {b && diff !== 0 ? `, ${pesos(abs(diff))} ${diff > 0 ? "more" : "less"} than ${b.title}` : b ? `, the same as ${b.title}` : ""}
      {a.st.left > 0 ? `, with ${plural(a.st.left, "piece")} of its ${a.st.received} still to sell.` : ", and it is sold out."}
    </>
  );
  let s2 = "";
  if (b && b.st.sold > 0 && diff !== 0) {
    const gp = a.st.grossProfit - b.st.grossProfit;
    const ex = below(a) - below(b);
    const scale = Math.max(abs(a.st.grossProfit), abs(b.st.grossProfit), 1);
    const words = belowWords(a, b);
    if (abs(gp) <= 0.05 * scale && ex !== 0 && Math.sign(ex) === -Math.sign(diff) && abs(ex) >= 2 * abs(gp)) {
      s2 = ` The difference is ${words}: ${pesos(below(a))} for ${a.title} so far, against ${pesos(below(b))} for ${b.title}. Before ${words} the two made about the same.`;
    } else if (below(a) === 0 && below(b) === 0) {
      s2 = ` Before ${words} it made ${pesos(a.st.grossProfit)}, against ${pesos(b.st.grossProfit)} for ${b.title}; neither has ${words} charged to it yet.`;
    } else {
      s2 = ` Before ${words} it made ${pesos(a.st.grossProfit)} (${b.title}: ${pesos(b.st.grossProfit)}); its ${words} so far are ${pesos(below(a))} (${b.title}: ${pesos(below(b))}).`;
    }
  }
  const pace =
    a.pace !== null && b?.pace
      ? `It sold ${round1(a.pace) > round1(b.pace) ? "faster" : round1(a.pace) < round1(b.pace) ? "slower" : "as fast"} (${perDay(a.pace)} against ${fmtPace(b.pace)})`
      : a.pace !== null
        ? `It sold ${perDay(a.pace)}`
        : "";
  const owedPct = a.st.net > 0 ? a.st.owed / a.st.net : 0;
  const owed =
    a.st.owed > 0 ? (
      <>
        <strong>{pesos(a.st.owed)}</strong> of its sales ({fmtPct(owedPct)}) is still owed by {plural(a.owedBuyers, "buyer")}
        {b ? (b.st.owed > 0 ? `, against ${pesos(b.st.owed)} for ${b.title}` : `, while ${b.title} is fully paid`) : ""}
      </>
    ) : (
      <>everything sold has been paid{b && b.st.owed > 0 ? `, while ${pesos(b.st.owed)} is still owed on ${b.title}` : ""}</>
    );
  return (
    <p className="rpt-lead">
      {s1}
      {s2} {pace}
      {pace ? ", and " : ""}
      {pace ? owed : <>{owed}</>}.
    </p>
  );
}

function Tiles({ a, b, ownerShare, managerShare }: { a: BatchFigures; b: BatchFigures | null; ownerShare: string; managerShare: string }) {
  // Change arrows only once the batch is selling: before that every "so far" figure is 0 and the arrows only say
  // "less". The other batch's figure is still shown.
  const Change = a.st.sold > 0 ? Delta : () => null;
  const d = (x: number, y: number | undefined | null) => (y === null || y === undefined ? 0 : x - y);
  const payDiff = b && a.paybackDay !== null && b.paybackDay !== null ? a.paybackDay - b.paybackDay : 0;
  const lastNet = a.series.at(-1)?.cumNet ?? 0;
  return (
    <>
      {b && (
        <p className="t-sm muted rpt-keyline">
          The big number is {a.title}. The line marked <span className="rpt-dotkey" aria-hidden="true" /> is {b.title}, to compare.
        </p>
      )}
      <KpiGrid aria-label={b ? `${a.title} compared with ${b.title}` : a.title}>
        <Kpi
          wide
          label="Net profit so far"
          value={<Money cents={a.st.netProfit} />}
          meta={
            <Vs b={b} value={b ? pesos(b.st.netProfit) : ""}>
              {b && (
                <Change diff={d(a.st.netProfit, b.st.netProfit)} good="up">
                  {pesos(abs(d(a.st.netProfit, b.st.netProfit)))} {d(a.st.netProfit, b.st.netProfit) > 0 ? "more" : "less"}
                </Change>
              )}
            </Vs>
          }
        />
        <Kpi
          label="Net margin"
          value={fmtPct(a.netMargin)}
          meta={
            <Vs b={b} value={fmtPct(b?.netMargin ?? null)}>
              {b && a.netMargin !== null && b.netMargin !== null && round1(a.netMargin * 100) !== round1(b.netMargin * 100) && (
                <Change diff={round1(a.netMargin * 100) - round1(b.netMargin * 100)} good="up">
                  {abs(round1(a.netMargin * 100) - round1(b.netMargin * 100)).toFixed(1)} points{" "}
                  {a.netMargin > b.netMargin ? "higher" : "lower"}
                </Change>
              )}
            </Vs>
          }
        />
        <Kpi
          label="Net sales"
          value={<Money cents={a.st.net} />}
          meta={
            <Vs b={b} value={b ? pesos(b.st.net) : ""}>
              {a.st.left > 0 && <span className="rpt-delta rpt-delta--flat">{plural(a.st.left, "piece")} still to sell</span>}
            </Vs>
          }
        />
        <Kpi
          label="Pieces sold"
          value={`${a.st.sold} of ${a.st.received}`}
          meta={
            <Vs b={b} value={b ? `${b.st.sold} of ${b.st.received}` : ""}>
              {b && b.soldOutDay !== null && (
                <span className="rpt-delta rpt-delta--flat">
                  {b.title} sold out on day {b.soldOutDay}
                </span>
              )}
            </Vs>
          }
        />
        <Kpi
          label="Selling pace"
          value={a.pace === null ? "–" : `${fmtPace(a.pace)} a day`}
          meta={
            <Vs b={b} value={b?.pace ? `${fmtPace(b.pace)} a day` : "–"}>
              {b && a.pace !== null && b.pace !== null && round1(a.pace) !== round1(b.pace) && (
                <Change diff={round1(a.pace) - round1(b.pace)} good="up">
                  {fmtPace(abs(round1(a.pace) - round1(b.pace)))} a day {round1(a.pace) > round1(b.pace) ? "faster" : "slower"}
                </Change>
              )}
            </Vs>
          }
        />
        <Kpi
          label="Earned back its cost"
          value={a.paybackDay !== null ? `day ${a.paybackDay}` : "not yet"}
          meta={
            <Vs b={b} value={b ? (b.paybackDay !== null ? `day ${b.paybackDay}` : "not yet") : ""}>
              {a.paybackDay === null ? (
                <span className="rpt-delta rpt-delta--flat">{pesos(Math.max(0, a.st.costInFull - lastNet))} to go</span>
              ) : (
                b &&
                payDiff !== 0 && (
                  <Change diff={payDiff} good="down">
                    {plural(abs(payDiff), "day")} {payDiff > 0 ? "later" : "sooner"}
                  </Change>
                )
              )}
            </Vs>
          }
        />
        <Kpi
          label="Still owed"
          value={<Money cents={a.st.owed} />}
          meta={
            <Vs b={b} value={b ? pesos(b.st.owed) : ""}>
              {b && d(a.st.owed, b.st.owed) !== 0 ? (
                <Change diff={d(a.st.owed, b.st.owed)} good="down">
                  {pesos(abs(d(a.st.owed, b.st.owed)))} {d(a.st.owed, b.st.owed) > 0 ? "more" : "less"}
                  {a.owedBuyers > 0 ? `, ${plural(a.owedBuyers, "buyer")}` : ""}
                </Change>
              ) : (
                a.owedBuyers > 0 && <span className="rpt-delta rpt-delta--flat">{plural(a.owedBuyers, "buyer")}</span>
              )}
            </Vs>
          }
        />
        <Kpi
          label={`Owner's share (${ownerShare})`}
          value={<Money cents={a.share.owner} />}
          meta={
            <Vs b={b} value={b ? pesos(b.share.owner) : ""}>
              {b && (
                <Change diff={d(a.share.owner, b.share.owner)} good="up">
                  {pesos(abs(d(a.share.owner, b.share.owner)))} {d(a.share.owner, b.share.owner) > 0 ? "more" : "less"}
                </Change>
              )}
            </Vs>
          }
        />
        <Kpi
          label={`Manager's share (${managerShare})`}
          value={<Money cents={a.share.manager} />}
          meta={
            <Vs b={b} value={b ? pesos(b.share.manager) : ""}>
              {b && (
                <Change diff={d(a.share.manager, b.share.manager)} good="up">
                  {pesos(abs(d(a.share.manager, b.share.manager)))} {d(a.share.manager, b.share.manager) > 0 ? "more" : "less"}
                </Change>
              )}
            </Vs>
          }
        />
      </KpiGrid>
      <p className="t-sm muted">
        Shares are each batch&apos;s net profit so far split {ownerShare} : {managerShare}, before general expenses. They are a
        guide, not a payout: what can be paid out is Safe to distribute (Finance → Overview).
      </p>
    </>
  );
}

function pctOf(part: number, whole: number) {
  return whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "–";
}

function WhereEachPeso({ a, b, all }: { a: BatchFigures; b: BatchFigures | null; all: BatchFigures[] }) {
  const both = all;
  const extra = both.some((f) => f.st.tax !== 0 || f.st.countDiffs !== 0);
  const otherName = extra ? "Expenses, tax and missing pieces" : "Expenses";
  const row = (f: BatchFigures): PartsRow => {
    const other = Math.max(0, f.st.expenseTotal + f.st.tax - f.st.countDiffs);
    const net = f.st.net;
    const part = (key: string, name: string, cents: number) => ({
      key,
      name,
      cents,
      share: pctOf(cents, net),
      text: `${pesos(cents)} (${pctOf(cents, net)})`,
    });
    return {
      label: f.title,
      parts: [
        part("goods", "Cost of the pieces sold", f.st.cogsGoods),
        part("fees", "Shipping and restocking fees", f.st.cogsFees),
        part("other", otherName, other),
        part("profit", "Net profit so far", Math.max(0, f.st.netProfit)),
      ],
    };
  };
  const caption = (() => {
    if (!b || a.grossMargin === null || b.grossMargin === null) {
      if (a.grossMargin === null) {
        const sold = all.slice(1).filter((f) => f.st.net > 0);
        return sold.length ? `${a.title} hasn't sold anything yet; the bars show ${listing(sold.map((f) => f.title))}.` : "Nothing sold yet.";
      }
      return a.netMargin !== null && a.netMargin < 0
        ? `${a.title}'s costs so far are more than its net sales.`
        : `Of every ₱100 of net sales, ${a.title} keeps ₱${((a.netMargin ?? 0) * 100).toFixed(0)} as net profit so far.`;
    }
    const gm = abs(a.grossMargin - b.grossMargin) < 0.01;
    const words = belowWords(a, b);
    return `Gross margin ${gm ? "is almost the same" : "differs"}: ${fmtPct(a.grossMargin)} for ${a.title}, ${fmtPct(b.grossMargin)} for ${b.title}. Net margin: ${fmtPct(a.netMargin)} for ${a.title} against ${fmtPct(b.netMargin)} for ${b.title}; ${words} ${pesos(below(a))} and ${pesos(below(b))}.`;
  })();
  const anyLoss = both.some((f) => f.st.netProfit < 0);
  return (
    <Section id="rpt-peso" title="Where each peso of net sales went">
      <p className="t-sm muted">
        {caption}
        {anyLoss ? " A batch at a loss so far shows no profit part: its costs are more than its net sales." : ""}
      </p>
      <PartsBars
        title="Where each peso of net sales went"
        rows={both.filter((f) => f.st.net > 0).map(row)}
        legend={[
          { key: "goods", name: "Cost of the pieces sold" },
          { key: "fees", name: "Shipping and restocking fees" },
          { key: "other", name: otherName },
          { key: "profit", name: "Net profit so far" },
        ]}
        table={{
          head: ["Part", ...both.map((f) => f.title)],
          rows: [
            ...row(a).parts.map((p, i) => [p.name, ...both.map((f) => row(f).parts[i].text)]),
            ["Net sales", ...both.map((f) => pesos(f.st.net))],
          ],
        }}
      />
    </Section>
  );
}

function PaidAndOwed({ all }: { all: BatchFigures[] }) {
  const both = all;
  const a = all[0];
  const row = (f: BatchFigures): PartsRow => ({
    label: f.title,
    parts: [
      { key: "paid", name: "Paid", cents: f.paidTotal, share: pctOf(f.paidTotal, f.st.net), text: `${pesos(f.paidTotal)} (${pctOf(f.paidTotal, f.st.net)})` },
      { key: "owed", name: "Still owed", cents: f.st.owed, share: pctOf(f.st.owed, f.st.net), text: `${pesos(f.st.owed)} (${pctOf(f.st.owed, f.st.net)})` },
    ],
  });
  const methods = (f: BatchFigures) =>
    f.paid.length === 0
      ? "nothing yet"
      : f.paid.length === 1
        ? `all ${paymentMethodLabel(f.paid[0].method) === "Cash" ? "in cash" : `by ${paymentMethodLabel(f.paid[0].method)}`}`
        : listing(f.paid.map((p) => `${pesos(p.cents)} ${paymentMethodLabel(p.method)}`));
  return (
    <Section id="rpt-paid" title="Paid and still owed">
      <p className="t-sm muted">
        {both
          .map((f) => `${f.title}: ${pesos(f.paidTotal)} collected, ${methods(f)}; ${f.st.owed > 0 ? `${pesos(f.st.owed)} (${pctOf(f.st.owed, f.st.net)}) still owed` : "fully paid"}.`)
          .join(" ")}
      </p>
      <PartsBars
        title="Paid and still owed"
        rows={both.filter((f) => f.st.net > 0).map(row)}
        legend={[
          { key: "paid", name: "Paid" },
          { key: "owed", name: "Still owed", alert: true },
        ]}
        table={{
          head: ["", ...both.map((f) => f.title)],
          rows: [
            ["Paid", ...both.map((f) => row(f).parts[0].text)],
            ["Still owed", ...both.map((f) => row(f).parts[1].text)],
            ["Net sales", ...both.map((f) => pesos(f.st.net))],
          ],
        }}
      />
      <div className="rpt-two">
        {both.map((f) => (
          <div key={f.id} className="stack stack-2">
            <h3 className="eyebrow">
              Still owed on {f.title} · {pesos(f.st.owed)}
            </h3>
            {f.owed.length === 0 ? (
              <p className="t-sm muted">{f.st.sold === 0 ? "Nothing sold yet." : "Nothing: every piece sold has been paid."}</p>
            ) : (
              <ul className="rpt-owed" role="list">
                {f.owed.map((o) => (
                  <li key={o.buyer}>
                    <span>{o.buyer}</span>
                    <Money cents={o.cents} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      {a.st.owed > 0 && (
        <Link className="btn btn--secondary btn--sm rpt-action" href="/collectibles">
          Open Collectibles
        </Link>
      )}
    </Section>
  );
}

function Flavours({ a, b, all, xMax }: { a: BatchFigures; b: BatchFigures | null; all: BatchFigures[]; xMax: number }) {
  const both = all;
  const fastest = (f: BatchFigures) => f.flavours.find((x) => x.soldOutDay !== null);
  const open = a.flavours.filter((x) => x.left > 0);
  return (
    <Section id="rpt-flavours" title="Flavours: days until each sold out">
      <p className="t-sm muted">
        A shorter bar sold out sooner; a striped bar has pieces left.
        {fastest(a) ? ` ${a.title}'s fastest: ${fastest(a)!.name} (day ${fastest(a)!.soldOutDay}).` : ""}
        {b && fastest(b) ? ` ${b.title}'s: ${fastest(b)!.name} (day ${fastest(b)!.soldOutDay}).` : ""}
        {open.length > 5
          ? ` ${a.title} has ${open.length} flavours with pieces left.`
          : open.length > 0
            ? ` Still to sell on ${a.title}: ${listing(open.map((x) => `${x.name} (${x.left} left)`))}.`
            : ""}
      </p>
      <div className="rpt-two">
        {both.map((f, i) => (
          <div key={f.id} className="stack stack-2">
            <h3 className="eyebrow rpt-colhead">
              <span className={`rpt-swatch rpt-swatch--${i === 0 ? "accent" : "muted"}`} aria-hidden="true" />
              {f.title}
            </h3>
            <ul className="rpt-fl" role="list">
              {f.flavours.map((x) => (
                <li key={x.id} title={x.soldOutOn ? `${x.name}: sold out on ${dayMonth(x.soldOutOn)}` : `${x.name}: ${x.sold} of ${x.received} sold`}>
                  <span className="rpt-fl__name">{x.name}</span>
                  <span className="rpt-fl__track">
                    {x.soldOutDay !== null ? (
                      <span
                        className={`rpt-fl__fill rpt-fl__fill--${i === 0 ? "accent" : "muted"}`}
                        style={{ width: `${(100 * Math.max(x.soldOutDay, 0.4)) / Math.max(xMax, 1)}%` }}
                      />
                    ) : x.left > 0 ? (
                      <span className={`rpt-fl__fill rpt-fl__fill--open rpt-fl__fill--${i === 0 ? "accent" : "muted"}`} style={{ width: "100%" }} />
                    ) : null}
                  </span>
                  <span className="rpt-fl__val">
                    {x.soldOutDay !== null ? `day ${x.soldOutDay}` : x.left > 0 ? `${x.sold} of ${x.received} sold` : "none left"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Statement({
  all,
  ownerShare,
  managerShare,
  taxRateBp,
}: {
  all: BatchFigures[];
  ownerShare: string;
  managerShare: string;
  taxRateBp: number;
}) {
  // Oldest batch first, so the columns read like a ledger.
  const both = [...all].sort((x, y) => x.no - y.no);
  const cost = (c: number) => `(${pesos(c)})`;
  const anyDiffs = both.some((f) => f.st.countDiffs !== 0);
  type Row = [string, (f: BatchFigures) => string] | [string];
  const rows: Row[] = [
    ["What came in"],
    ["Pieces received", (f) => String(f.st.received)],
    ["Pieces sold", (f) => (f.st.left > 0 ? `${f.st.sold} (${nb(`${f.st.left} left`)})` : String(f.st.sold))],
    ["Average price per piece", (f) => (f.avgPrice === null ? "–" : pesos(Math.round(f.avgPrice)))],
    ["Cost per piece, with shipping", (f) => (f.landedEach === null ? "–" : pesos(Math.round(f.landedEach), 2))],
    ["Paid for with", (f) => (f.paidBy ?? "not paid yet") + (f.owedSupplier > 0 ? ` (${pesos(f.owedSupplier)} still owed)` : "")],
    ["Profit and loss"],
    ["Gross sales", (f) => pesos(f.st.gross)],
    ["Discounts", (f) => cost(f.st.discounts)],
    ["Net sales", (f) => pesos(f.st.net)],
    ["Cost of the pieces sold", (f) => cost(f.st.cogsGoods)],
    ["Shipping and restocking fees", (f) => cost(f.st.cogsFees)],
    ["Gross profit", (f) => pesos(f.st.grossProfit)],
    ["Gross margin", (f) => fmtPct(f.grossMargin)],
    ["Expenses charged to the batch", (f) => cost(f.st.expenseTotal)],
    ...(anyDiffs ? ([["Counts and losses", (f) => pesos(f.st.countDiffs)]] as Row[]) : []),
    ...(taxRateBp > 0 ? ([["Percentage tax estimate", (f) => cost(f.st.tax)]] as Row[]) : []),
    ["Net profit so far", (f) => pesos(f.st.netProfit)],
    ["Net margin", (f) => fmtPct(f.netMargin)],
    [`Owner (${ownerShare})`, (f) => pesos(f.share.owner)],
    [`Manager (${managerShare})`, (f) => pesos(f.share.manager)],
    ["Cost and payback"],
    ["Batch cost in full", (f) => pesos(f.st.costInFull)],
    ["Earned back its cost", (f) => (f.paybackDay !== null ? `${nb(`day ${f.paybackDay}`)} (${dayMonth(f.series[f.paybackDay].date)})` : "not yet")],
    ["Selling pace", (f) => (f.pace === null ? "–" : `${fmtPace(f.pace)} a day`)],
    ["Paid so far", (f) => pesos(f.paidTotal)],
    ["Still owed by buyers", (f) => (f.st.owed > 0 ? `${pesos(f.st.owed)} (${nb(plural(f.owedBuyers, "buyer"))})` : pesos(0))],
  ];
  const bold = new Set(["Net sales", "Gross profit", "Net profit so far"]);
  return (
    <Section id="rpt-statement" title="Statement, side by side">
      <div className="rpt-st-wrap">
        <table className="table rpt-st">
          <thead>
            <tr>
              <th scope="col">Line</th>
              {both.map((f) => (
                <th key={f.id} scope="col" className="num">
                  {f.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) =>
              r.length === 1 ? (
                <tr key={r[0]} className="rpt-st__sec">
                  <th colSpan={both.length + 1} scope="colgroup">
                    {r[0]}
                  </th>
                </tr>
              ) : (
                <tr key={r[0]} className={bold.has(r[0]) ? "rpt-st__total" : undefined}>
                  <th scope="row">{r[0]}</th>
                  {both.map((f) => (
                    <td key={f.id} className="num">
                      {r[1](f)}
                    </td>
                  ))}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <p className="t-sm muted">
        Costs in brackets.
        {both
          .map((f) =>
            f.st.expenses.length
              ? ` ${f.title}'s expenses: ${listing(f.st.expenses.map((e) => `${e.note?.trim() || "expense"} ${pesos(e.amount_cents)} (${dayMonth(e.spent_on)})`))}.`
              : ` ${f.title} has no expenses charged to it.`,
          )
          .join("")}
      </p>
    </Section>
  );
}

function NextSteps({ a, b, others, newestId }: { a: BatchFigures; b: BatchFigures | null; others: BatchFigures[]; newestId: string }) {
  const steps: ReactNode[] = [];
  if (a.st.owed > 0) {
    steps.push(
      <>
        <strong>Collect the {pesos(a.st.owed)} still owed on {a.title}</strong> from {plural(a.owedBuyers, "buyer")} (Collectibles):{" "}
        {listing([...a.owed.slice(0, 6).map((o) => `${o.buyer} ${pesos(o.cents)}`), ...(a.owed.length > 6 ? [`${a.owed.length - 6} more`] : [])])}.
      </>,
    );
  }
  const owing = others.filter((f) => f.st.owed > 0);
  if (owing.length > 0) {
    steps.push(
      <>
        <strong>Collect what is still owed on {owing.length === 1 ? owing[0].title : "the other batches"}:</strong>{" "}
        {listing(owing.map((f) => `${pesos(f.st.owed)} on ${f.title} from ${plural(f.owedBuyers, "buyer")}`))}.
      </>,
    );
  }
  steps.push(
    <>
      <strong>Check that all of {a.title}&apos;s costs are entered</strong> (Restock → Expenses, with {a.title} picked).
      {b && b.st.expenseTotal > a.st.expenseTotal
        ? ` ${b.title} carries ${pesos(b.st.expenseTotal)} of expenses and ${a.title} ${pesos(a.st.expenseTotal)} so far; a missing cost makes ${a.title} look better than it is.`
        : ""}
    </>,
  );
  if (a.st.left > 0 && a.st.sold > 0) {
    const more = b ? a.st.whenSoldOut - b.st.netProfit : 0;
    steps.push(
      <>
        <strong>Sell the {plural(a.st.left, "piece")} left.</strong> If {a.st.left === 1 ? "it sells" : "they sell"} at today&apos;s
        prices and no other costs are added, {a.title}&apos;s net profit would be {pesos(a.st.whenSoldOut)} (owner{" "}
        {pesos(a.shareWhenSoldOut.owner)}, manager{" "}
        {pesos(a.shareWhenSoldOut.manager)})
        {b && b.soldOutDay !== null && more !== 0 ? `, ${pesos(abs(more))} ${more > 0 ? "more" : "less"} than ${b.title}` : ""}.
      </>,
    );
  }
  if (a.pace !== null && a.sellDays !== null) {
    steps.push(
      <>
        <strong>Plan the next order on this pace.</strong> {a.title} sold {a.st.sold} of {a.st.received} pieces in{" "}
        {plural(a.sellDays, "day")} ({fmtPace(a.pace)} a day)
        {b && b.pace !== null && b.sellDays !== null
          ? `; ${b.title} sold ${b.st.sold} in ${plural(b.sellDays, "day")} (${fmtPace(b.pace)} a day)`
          : ""}
        . Restock → Reorder works out what to order from the last 28 days of sales.
      </>,
    );
  }
  if (a.id === newestId && a.st.sold > 0 && a.st.left > 0 && a.st.left <= Math.max(3, Math.round(a.st.received * 0.1))) {
    steps.push(
      <>
        <strong>Receive the next delivery as a batch as soon as it arrives</strong> (Restock → Receive batch): {a.title} is almost
        sold out.
      </>,
    );
  }
  return (
    <Section id="rpt-next" title="What to do next">
      <ol className="rpt-steps">
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </Section>
  );
}
