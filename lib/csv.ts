// CSV files for Inventory → Import CSV: read the file into rows, match its columns to the product fields,
// and the template's columns. Only reading happens here; every rule (prices, barcodes, duplicates, roles)
// is checked by the database in import_products.

/** One product row as typed in the file. row_no is the spreadsheet row (the header is row 1). */
export type ImportRow = {
  row_no: number;
  category: string;
  brand: string;
  name: string;
  variant: string;
  barcode: string;
  price: string;
  cost: string;
  reorder_at: string;
  for_sale: string;
};

export type ImportStatus = "new" | "exists" | "example" | "error";
export type ImportResult = { row_no: number; status: ImportStatus; message: string | null; product_id: string | null };

/** The template's header row, in order. */
export const TEMPLATE_COLUMNS = [
  "Category",
  "Brand",
  "Product",
  "Flavour / variant",
  "Barcode",
  "Selling price",
  "Cost per piece",
  "Low-stock alert at",
  "For sale",
] as const;

export const MAX_IMPORT_ROWS = 500;

type Field = Exclude<keyof ImportRow, "row_no">;

/** Header names each field accepts (lower case, spaces squeezed). */
const HEADERS: Record<Field, string[]> = {
  category: ["category"],
  brand: ["brand"],
  name: ["product", "product name", "name"],
  variant: ["flavour / variant", "flavor / variant", "flavour/variant", "flavor/variant", "flavour", "flavor", "variant"],
  barcode: ["barcode"],
  price: ["selling price", "price", "selling price (₱)", "price (₱)"],
  cost: ["cost per piece", "cost", "cost per piece (₱)", "cost (₱)"],
  reorder_at: ["low-stock alert at", "low stock alert at", "low-stock alert", "low stock alert", "reorder at"],
  for_sale: ["for sale", "active"],
};

/** A leading byte-order mark, which Excel puts at the start of "CSV UTF-8" files. */
const BOM = /^﻿/;

/** The file's separator: semicolons when its first non-blank line has more of them than commas, else commas. */
export function csvSeparator(text: string): "," | ";" {
  const first = text.replace(BOM, "").split(/\r\n|\n|\r/).find((l) => l.trim() !== "") ?? "";
  return (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
}

/**
 * Reads CSV text into rows of cells: quoted cells ("a, b", "say ""hi"""), line breaks inside quotes, CRLF or LF,
 * a leading byte-order mark (Excel), and semicolon-separated files (Excel in some regions). Blank lines stay as
 * empty rows so row numbers match the spreadsheet.
 */
export function parseCsv(text: string): string[][] {
  const s = text.replace(BOM, "");
  const sep = csvSeparator(s);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"' && cell.trim() === "") {
      cell = "";
      quoted = true;
    } else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const norm = (h: string) => h.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Turns the file's rows into product rows by their header names. `error` is set when the file can't be used
 * (no header, no Product or Selling price column, too many rows); `ignored` lists columns it didn't use.
 */
export function productRowsFromCsv(text: string): { rows: ImportRow[]; error: string | null; ignored: string[] } {
  const cells = parseCsv(text);
  const headerAt = cells.findIndex((r) => r.some((c) => c.trim() !== ""));
  if (headerAt < 0) return { rows: [], error: "The file is empty.", ignored: [] };
  const header = cells[headerAt].map(norm);
  const col = {} as Record<Field, number>;
  (Object.keys(HEADERS) as Field[]).forEach((f) => {
    col[f] = header.findIndex((h) => HEADERS[f].includes(h));
  });
  if (col.name < 0 || col.price < 0) {
    return {
      rows: [],
      error: "The file needs a Product column and a Selling price column. Download the template to see the columns.",
      ignored: [],
    };
  }
  const used = new Set(Object.values(col).filter((i) => i >= 0));
  const ignored = cells[headerAt].map((h, i) => (used.has(i) || h.trim() === "" ? "" : h.trim())).filter(Boolean);
  // Semicolon files come from regions that write decimals with a comma: "340,50" there means 340.50.
  const commaDecimals = csvSeparator(text) === ";";
  const rows: ImportRow[] = [];
  for (let i = headerAt + 1; i < cells.length; i++) {
    const r = cells[i];
    if (!r.some((c) => c.trim() !== "")) continue;
    // Line breaks typed inside a cell (Alt+Enter) and runs of spaces become one space.
    const get = (f: Field) => (col[f] >= 0 ? (r[col[f]] ?? "").replace(/\s+/g, " ").trim().slice(0, 200) : "");
    const money = (f: Field) => {
      const v = get(f);
      return commaDecimals && /^(php|₱|p)?\s*\d+,\d{1,2}$/i.test(v) ? v.replace(/,(\d{1,2})$/, ".$1") : v;
    };
    rows.push({
      row_no: i + 1,
      category: get("category"),
      brand: get("brand"),
      name: get("name"),
      variant: get("variant"),
      barcode: get("barcode"),
      price: money("price"),
      cost: money("cost"),
      reorder_at: get("reorder_at"),
      for_sale: get("for_sale"),
    });
  }
  if (rows.length === 0) return { rows, error: "The file has a header row but no products under it.", ignored };
  if (rows.length > MAX_IMPORT_ROWS) {
    return { rows: [], error: `The file has ${rows.length} products. Import up to ${MAX_IMPORT_ROWS} at a time.`, ignored };
  }
  return { rows, error: null, ignored };
}
