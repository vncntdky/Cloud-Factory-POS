// GET /sales/export?from=&to= → one row per item sold, as CSV for bookkeeping.
// Uses the signed-in server client, so RLS applies (owners and managers only).
import { NextResponse, type NextRequest } from "next/server";
import { fetchAll, parseSalesRange } from "@/components/sales/data";
import { requireStaff } from "@/lib/auth";
import { paymentMethodLabel } from "@/lib/format";
import { can } from "@/lib/permissions";
import { formatManilaTime } from "@/lib/time";

export const dynamic = "force-dynamic";

type Row = {
  sale_number: number;
  business_date: string;
  status: string;
  created_at: string;
  payment_method: string;
  reference: string | null;
  discount_cents: number;
  total_cents: number;
  sale_items: { name: string; quantity: number; unit_price_cents: number; line_total_cents: number }[];
};

const HEADER = [
  "date",
  "time",
  "sale #",
  "status",
  "item",
  "qty",
  "unit price (₱)",
  "line total (₱)",
  "sale discount (₱)",
  "sale total (₱)",
  "payment",
  "reference",
];

/** Quote when needed; neutralise text that a spreadsheet would run as a formula. */
function cell(v: string | number | null | undefined) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  let s = v.replace(/\r\n?/g, "\n");
  if (/^[=+\-@\t]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const pesoNumber = (cents: number) => (Number(cents) / 100).toFixed(2);

function text(body: string, status: number) {
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  // Signed out → /login (requireStaff redirects). Inactive accounts get a 403, not an empty file.
  const { supabase, profile } = await requireStaff();
  if (!profile.active) return text("Your account is waiting for the owner to activate it.", 403);
  if (!can(profile, "seeSalesHistory")) return text("Sales exports are for owners and managers.", 403);

  const sp = request.nextUrl.searchParams;
  const { from, to } = parseSalesRange({
    date: sp.get("date") ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
  });

  const { rows, error } = await fetchAll<Row>((a, b) =>
    supabase
      .from("sales")
      .select(
        "id, sale_number, business_date, status, created_at, payment_method, reference, discount_cents, total_cents, sale_items(name, quantity, unit_price_cents, line_total_cents)",
      )
      .gte("business_date", from)
      .lte("business_date", to)
      .order("business_date", { ascending: true })
      .order("sale_number", { ascending: true })
      .range(a, b),
  );
  if (error) return text(`Could not export sales: ${error.message}`, 500);

  const lines = [HEADER.map(cell).join(",")];
  for (const r of rows) {
    for (const i of r.sale_items) {
      lines.push(
        [
          cell(r.business_date),
          cell(formatManilaTime(r.created_at)),
          cell(r.sale_number),
          cell(r.status),
          cell(i.name),
          cell(i.quantity),
          pesoNumber(i.unit_price_cents),
          pesoNumber(i.line_total_cents),
          pesoNumber(r.discount_cents),
          pesoNumber(r.total_cents),
          cell(paymentMethodLabel(r.payment_method)),
          cell(r.reference ?? ""),
        ].join(","),
      );
    }
  }

  // BOM so Excel reads UTF-8 (₱, ñ); CRLF line ends per RFC 4180.
  const body = "﻿" + lines.join("\r\n") + "\r\n";
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sales-${from}-${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
