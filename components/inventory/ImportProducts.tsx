"use client";

// Inventory → Import CSV: choose a CSV file, see what each row would do (new / already in the app / example /
// fix), then add every new product in one go. The file is read in the browser; the database checks every row
// (import_products) for the preview and again when adding, and adds nothing if any row has an error.
import { unstable_rethrow } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { importProducts, previewImport } from "@/app/(staff)/inventory/actions";
import { Icon } from "@/components/Icon";
import { productRowsFromCsv, type ImportResult, type ImportRow, type ImportStatus } from "@/lib/csv";
import { pesos } from "@/lib/format";

const CHIP: Record<ImportStatus, { label: string; cls: string }> = {
  new: { label: "New", cls: "chip--ok" },
  exists: { label: "Already in the app", cls: "chip--neutral" },
  example: { label: "Example", cls: "chip--neutral" },
  error: { label: "Fix this", cls: "chip--danger" },
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const OFFLINE = "Couldn't reach the server. Check your connection and try again.";

/** The price the way the database reads it (₱, PHP or P, spaces, commas between thousands); as typed otherwise. */
function money(text: string) {
  const t = text.replace(/php|[₱\s]/gi, "").replace(/^p(?=\d)/i, "");
  if (!/^(\d{1,3}(,\d{3})+|\d{1,7})(\.\d{1,2})?$/.test(t)) return text;
  return pesos(Math.round(Number(t.replace(/,/g, "")) * 100), "auto");
}

/**
 * The file as text. Excel's plain "CSV (Comma delimited)" on Windows saves in Windows-1252, not UTF-8, so a file
 * that isn't valid UTF-8 is read that way: "Piña" stays "Piña" instead of turning into "Pi�a".
 */
async function readText(f: File) {
  const buf = await f.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

export function ImportProducts() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<string | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [checking, startCheck] = useTransition();
  const [adding, startAdd] = useTransition();

  async function onFile(f: File | undefined) {
    if (!f) return;
    setFile(f.name);
    setResults(null);
    setProblem(null);
    setIgnored([]);
    setRows([]);
    if (f.size > 1024 * 1024) {
      setProblem("That file is bigger than 1 MB. Split it into smaller files.");
      return;
    }
    const parsed = productRowsFromCsv(await readText(f));
    setIgnored(parsed.ignored);
    if (parsed.error) {
      setProblem(parsed.error);
      return;
    }
    setRows(parsed.rows);
    startCheck(async () => {
      const res = await previewImport(parsed.rows).catch(() => ({ error: OFFLINE, results: undefined }));
      if (res.error) setProblem(res.error);
      else setResults(res.results ?? []);
    });
  }

  function add() {
    setProblem(null);
    startAdd(async () => {
      const res = await importProducts(rows).catch((e: unknown) => {
        unstable_rethrow(e); // success: the action's redirect to Inventory
        return { error: OFFLINE };
      });
      if (res?.error) {
        setProblem(res.error);
        // Something may have changed since the check (a product or barcode added on another phone): check the
        // file again so the rows that now need fixing are marked, and Add stays off until they are fixed.
        const again = await previewImport(rows).catch(() => null);
        if (again?.results) setResults(again.results);
      }
    });
  }

  const byRow = new Map((results ?? []).map((r) => [r.row_no, r]));
  const count = (s: ImportStatus) => (results ?? []).filter((r) => r.status === s).length;
  const toAdd = count("new");
  const toFix = count("error");
  const summary = results
    ? [
        plural(toAdd, "new product"),
        count("exists") > 0 && `${count("exists")} already in the app (skipped)`,
        count("example") > 0 && `${plural(count("example"), "example row")} (skipped)`,
        toFix > 0 && `${plural(toFix, "row")} to fix`,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <section className="card stack" aria-labelledby="imp-up-t">
      <h2 className="card__title" id="imp-up-t">
        2. Upload your file
      </h2>
      <p className="t-sm muted">Save your sheet as CSV (comma separated), then choose it here. Nothing is added until you tap Add.</p>
      <div className="btn-row">
        <button
          type="button"
          className="btn btn--secondary"
          disabled={checking || adding}
          aria-busy={checking || undefined}
          onClick={() => {
            if (input.current) input.current.value = "";
            input.current?.click();
          }}
        >
          <Icon name="upload" />
          {checking ? "Checking…" : file ? "Choose another file" : "Choose CSV file"}
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        hidden
        aria-label="CSV file"
        data-testid="csv-input"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      {file && <p className="t-sm">File: {file}</p>}
      {problem && (
        <p className="field__error" role="alert">
          <Icon name="alert" />
          {problem}
        </p>
      )}
      {ignored.length > 0 && !problem && (
        <p className="t-sm muted">Not used: {ignored.join(", ")}. The template has the columns the app reads.</p>
      )}

      {/* Always on the page, so screen readers announce the check starting and its result. */}
      <p className="sr-only" role="status">
        {checking ? "Checking your file…" : summary}
      </p>

      {results && rows.length > 0 && (
        <div className="stack stack-3">
          <h3 className="eyebrow">3. Check and add</h3>
          <p className="t-sm" data-testid="imp-summary">
            {summary}
          </p>
          {toFix > 0 && (
            <div className="notice notice--danger" role="alert">
              <Icon name="alert" />
              <div>
                <p className="notice__title">Fix the rows marked Fix this, then choose the file again.</p>
                <p>Nothing is added until every row is right.</p>
              </div>
            </div>
          )}
          <ul className="list list--plain imp-rows" role="list">
            {rows.map((r) => {
              const res = byRow.get(r.row_no);
              const chip = res ? CHIP[res.status] : null;
              const title = [r.brand, r.name].filter(Boolean).join(" ") || "(no product name)";
              return (
                <li key={r.row_no} className="list-row list-row--compact list-row--wrap" data-status={res?.status}>
                  <span className="list-row__main">
                    <span className="list-row__title">
                      <span>
                        {title}
                        {r.variant && ` · ${r.variant}`}
                      </span>
                    </span>
                    <span className="list-row__meta list-row__meta--wrap">
                      Row {r.row_no}
                      {r.price && ` · ${money(r.price)}`}
                      {r.category && ` · ${r.category}`}
                    </span>
                    {res?.status === "error" && res.message && <span className="t-sm text-alert">{res.message}</span>}
                    {res?.status === "exists" && res.message?.includes("Not for sale") && (
                      <span className="t-sm muted">It&apos;s in the app but not for sale. Turn on For sale on its product page.</span>
                    )}
                  </span>
                  {chip && (
                    <span className="list-row__trail">
                      <span className={`chip ${chip.cls}`}>{chip.label}</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--money"
              disabled={toAdd === 0 || toFix > 0 || adding}
              aria-busy={adding || undefined}
              onClick={add}
            >
              <Icon name="plus" />
              {adding ? "Adding…" : toAdd === 0 ? "Nothing new to add" : `Add ${plural(toAdd, "product")}`}
            </button>
          </div>
          <p className="t-sm muted">They start with 0 pieces. Receive their stock with Restock → Receive batch.</p>
        </div>
      )}
    </section>
  );
}
