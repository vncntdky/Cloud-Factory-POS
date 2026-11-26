// Stand-in for the Supabase APIs the Restock tab uses, with a 10-flavour pod shop.
const http = require("http");
const crypto = require("crypto");

const USER_ID = "aaaaaaaa-1111-4111-8111-000000000001";
const role = process.env.ROLE || "owner";
const USER = { id: USER_ID, aud: "authenticated", role: "authenticated", email: "owner@test.local", app_metadata: {}, user_metadata: {} };
const day = 86400000;
const ago = (d) => new Date(Date.now() - d * day).toISOString();

const flavours = ["Mint", "Mango", "Grape", "Lychee", "Watermelon", "Blueberry", "Strawberry", "Cola", "Peach", "Banana"];
// sold in last 28 days (stocked 11 days ago), on hand
const stats = [[22, 4], [15, 9], [9, 12], [6, 2], [3, 20], [0, 6], [11, 0], [5, 25], [2, 18], [0, 3]];
const products = flavours.map((f, i) => ({
  id: `00000000-0000-4000-8000-0000000000${String(i + 10)}`,
  brand: "XBLACK",
  name: "MAX Pods",
  variant: f,
  on_hand: stats[i][1],
  reorder_at: 5,
  category_id: i < 6 ? "c0000000-0000-4000-8000-00000000000a" : "c0000000-0000-4000-8000-00000000000b",
  photo_path: null,
  active: true,
  price_cents: 35000,
  barcode: null,
}));
const settings = { business_name: "Cloud Factory", restock_lead_days: 7, restock_buffer_days: 3, restock_cover_days: 14 };
const baseCategories = [{ id: "c0000000-0000-4000-8000-00000000000a", name: "TRANSPARENT V2 PODS" }, { id: "c0000000-0000-4000-8000-00000000000b", name: "Black TEO" }];
const extraCategories = []; // made by import_products
const batches = [{ id: "bbbbbbbb-0000-4000-8000-000000000001", batch_no: 1, supplier: "Cloud Supply", received_on: new Date(Date.now() - 5 * day).toISOString().slice(0, 10), note: null, created_at: ago(5), shipping_cents: 50000, tax_cents: 12000, mooe_cents: 8000, other_cents: 0, other_label: null }];
const batchRows = [];
products.forEach((p, i) => {
  // Before batches: 3 opening pieces each, mostly sold (all sold with SOLDOUT=1).
  const soldOld = process.env.SOLDOUT ? 3 : Math.min(3, stats[i][0]);
  batchRows.push({ batch_id: null, product_id: p.id, received: 3, sold: soldOld, sales_cents: soldOld * 35000, cost_cents: soldOld * 21000, uncosted: 0, owed_cents: 0, received_cost_cents: 3 * 21000, received_uncosted: 0, adjusted: 0, first_in: ago(11), first_sold_at: soldOld ? ago(10) : null, last_sold_at: soldOld ? ago(6) : null });
  if (i < 6) {
    const rec = 20;
    const sold = Math.min(rec, Math.max(0, stats[i][0] - 3));
    batchRows.push({ batch_id: batches[0].id, product_id: p.id, received: rec, sold, sales_cents: sold * 34000, cost_cents: sold * 21000, uncosted: 0, owed_cents: i === 0 ? 68000 : 0, received_cost_cents: rec * 21000, received_uncosted: 0, adjusted: i === 3 ? -2 : 0, first_in: ago(5), first_sold_at: sold ? ago(5) : null, last_sold_at: sold ? ago(1) : null });
  }
});
const log = [];
// Orders (batch_order_lines) and payments to suppliers (batch_payments). ORDER=1 adds an order on the way.
const orderLines = [];
const payments = [];
const reservations = [];
const releases = [];
const setAsides = [];
const capital = [];
let taxBp = 300;
function finTotals(upto) {
  // FIN=batches: Profit & loss worked out from the same rows as the batch statements, as the
  // database does, so the batches tie out to it. Default: a live-like shop with its own totals
  // (Batch 1 paid by the owners 4,800, Batch 2 from the fund 4,950 + 244 fees).
  if (upto !== "before" && process.env.FIN === "batches") {
    const st = batchStatements();
    const sum = (f) => st.reduce((n, r) => n + f(r), 0);
    const opexRows = expenses.filter((e) => e.category !== "tax");
    const byCat = {};
    for (const e of opexRows) byCat[e.category] = (byCat[e.category] || 0) + e.amount_cents;
    const net = sum((r) => r.net_cents), owed = sum((r) => r.owed_cents);
    return { gross: sum((r) => r.gross_cents), discounts: sum((r) => r.discount_cents), net, sales: 63, collected: net - owed, collected_by_method: { cash: net - owed }, cogs: sum((r) => r.cogs_goods_cents + r.cogs_fees_cents), cogs_uncosted: 0, count_diffs: sum((r) => r.count_diffs_cents), opex: opexRows.reduce((s, e) => s + e.amount_cents, 0), opex_by_category: byCat, tax_paid: 0, tax_rate_bp: taxBp, loose_goods: 0, ordered: sum((r) => r.goods_cents + r.fees_cents), arrived: sum((r) => r.goods_cents + r.fees_cents), paid_company: sum((r) => r.goods_cents + r.fees_cents), paid_owner: 0, paid_investment: 0, capital_cash: 0, distributions: 0 };
  }
  if (upto === "before") return { gross: 0, discounts: 0, net: 0, sales: 0, collected: 0, collected_by_method: {}, cogs: 0, cogs_uncosted: 0, count_diffs: 0, opex: 0, opex_by_category: {}, tax_paid: 0, tax_rate_bp: taxBp, loose_goods: 0, ordered: 0, arrived: 0, paid_company: 0, paid_owner: 0, paid_investment: 0, capital_cash: 0, distributions: 0 };
  const capCash = capital.reduce((s, c) => s + c.amount_cents, 0);
  const dist = releases.reduce((s, r) => s + r.amount_cents, 0);
  const added = expenses.filter((e) => e.category !== "tax");
  const byCat = { supplies: 30000, other: 64000 };
  for (const e of added) byCat[e.category] = (byCat[e.category] || 0) + e.amount_cents;
  // Orders and deliveries recorded in the mock: their cost from the order day, their payments by whose money.
  const made = batches.filter((b) => b.mock);
  const cost = (b) => batchCost(b);
  const pay = (src) => payments.filter((x) => made.some((b) => b.id === x.batch_id) && x.source === src).reduce((n, x) => n + x.amount_cents, 0);
  const ordered = made.reduce((n, b) => n + cost(b), 0);
  const arrived = made.filter((b) => b.received_on).reduce((n, b) => n + cost(b), 0);
  return { gross: 960000, discounts: 0, net: 960000, sales: 24, collected: 832000, collected_by_method: { cash: 772000, gcash: 60000 }, cogs: 480000, cogs_uncosted: 0, count_diffs: 0, opex: 94000 + added.reduce((s, e) => s + e.amount_cents, 0), opex_by_category: byCat, tax_paid: 0, tax_rate_bp: taxBp,
    loose_goods: 0, ordered: 999400 + ordered, arrived: 999400 + arrived, paid_company: 519400 + pay("company"), paid_owner: 480000 + pay("owner"), paid_investment: pay("investment"), capital_cash: capCash, distributions: dist };
}
function finDerive(t) {
  const tax = Math.round((t.net * t.tax_rate_bp) / 10000);
  const owners = t.paid_owner + t.paid_investment;
  return { ...t, tax, net_profit: t.net - t.cogs + t.count_diffs - t.opex - tax, cash: t.capital_cash + t.collected - t.paid_company - t.loose_goods - t.opex - t.tax_paid - t.distributions, receivables: t.net - t.collected,
    inventory: t.arrived + t.loose_goods - t.cogs + t.count_diffs, on_the_way: t.ordered - t.arrived, owed_suppliers: t.ordered - t.paid_company - owners,
    capital: t.capital_cash + owners, tax_payable: tax - t.tax_paid, retained: t.net - t.cogs + t.count_diffs - t.opex - tax - t.distributions };
}
// A batch's cost in full: its pieces (ordered while on the way, received once here) + restocking fees.
function batchCost(b) {
  const fees = b.shipping_cents + b.tax_cents + b.mooe_cents + b.other_cents;
  const goods = b.received_on
    ? batchRows.filter((r) => r.batch_id === b.id).reduce((n, r) => n + r.received_cost_cents, 0)
    : orderLines.filter((l) => l.batch_id === b.id).reduce((n, l) => n + l.qty * (l.unit_cost_cents ?? 0), 0);
  return goods + fees;
}
function paidOn(id) {
  return payments.filter((x) => x.batch_id === id).reduce((n, x) => n + x.amount_cents, 0);
}
const today8 = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const dayMon = (iso) => `${Number(iso.slice(8, 10))} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(iso.slice(5, 7)) - 1]}`;
// Paid with an order, a delivery or on pick-up: {amount_cents: number | "rest", source}.
function payNow(b, pay, on) {
  if (!pay) return;
  const amount = pay.amount_cents === "rest" ? Math.max(0, batchCost(b) - paidOn(b.id)) : Number(pay.amount_cents || 0);
  if (amount > 0) payments.push({ id: crypto.randomUUID(), batch_id: b.id, amount_cents: amount, paid_on: on, source: pay.source || "company", note: null, created_at: new Date().toISOString() });
}
const MINT = "00000000-0000-4000-8000-000000000010";
const LYCHEE = "00000000-0000-4000-8000-000000000013";
const B1 = "bbbbbbbb-0000-4000-8000-000000000001";
const movements = [
  { id: "dddddddd-1111-4111-8111-000000000001", product_id: MINT, kind: "opening", delta: 3, on_hand_after: 3, note: null, unit_cost_cents: 21000, created_at: ago(11), batch_id: null, sale: null, who: null },
  { id: "dddddddd-1111-4111-8111-000000000003", product_id: MINT, kind: "sale", delta: -19, on_hand_after: 4, note: null, unit_cost_cents: null, created_at: ago(1), batch_id: null, sale: { id: "55555555-0000-4000-8000-000000000001", sale_number: 3 }, who: null },
  { id: "dddddddd-1111-4111-8111-000000000002", product_id: MINT, kind: "restock", delta: 20, on_hand_after: 23, note: null, unit_cost_cents: 21000, created_at: ago(5), batch_id: B1, sale: null, who: null },
  { id: "dddddddd-1111-4111-8111-000000000004", product_id: LYCHEE, kind: "restock", delta: 20, on_hand_after: 23, note: null, unit_cost_cents: 21000, created_at: ago(5), batch_id: B1, sale: null, who: null },
  { id: "dddddddd-1111-4111-8111-000000000005", product_id: LYCHEE, kind: "count", delta: -2, on_hand_after: 2, note: null, unit_cost_cents: null, created_at: ago(2), batch_id: B1, sale: null, who: null },
];
// REPORT=1: a second batch, 2 days old and still selling, so the owner's batch report has two batches to compare.
// REPORT=3: also a third batch, received today with nothing sold yet, to compare with All batches.
const B2 = "bbbbbbbb-0000-4000-8000-000000000002";
const B3 = "bbbbbbbb-0000-4000-8000-000000000003";
if (process.env.REPORT === "3") {
  batches.push({ id: B3, batch_no: 3, supplier: null, received_on: new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10), note: null, created_at: ago(0), shipping_cents: 26400, tax_cents: 0, mooe_cents: 0, other_cents: 0, other_label: null });
  [0, 1, 2, 3].forEach((k) => {
    batchRows.push({ batch_id: B3, product_id: products[k].id, received: 6, sold: 0, sales_cents: 0, cost_cents: 0, uncosted: 0, owed_cents: 0, received_cost_cents: 6 * 21000, received_uncosted: 0, adjusted: 0, first_in: ago(0), first_sold_at: null, last_sold_at: null });
  });
}
if (process.env.REPORT === "1" || process.env.REPORT === "3") {
  batches.push({ id: B2, batch_no: 2, supplier: null, ordered_on: new Date(Date.now() - 4 * day).toISOString().slice(0, 10), received_on: new Date(Date.now() - 2 * day).toISOString().slice(0, 10), note: null, created_at: ago(2), shipping_cents: 24400, tax_cents: 0, mooe_cents: 0, other_cents: 0, other_label: null });
  [5, 3, 2, 1].forEach((sold, k) => {
    batchRows.push({ batch_id: B2, product_id: products[6 + k].id, received: 12, sold, sales_cents: sold * 35000, cost_cents: sold * 21000, uncosted: 0, owed_cents: k === 0 ? 35000 : 0, received_cost_cents: 12 * 21000, received_uncosted: 0, adjusted: 0, first_in: ago(2), first_sold_at: ago(2), last_sold_at: ago(0) });
  });
}
if (process.env.NOBATCH === "1") {
  // Like the live shop: only stock from before batches.
  batches.length = 0;
  for (let k = batchRows.length - 1; k >= 0; k--) if (batchRows[k].batch_id !== null) batchRows.splice(k, 1);
}
const expenses = [];
const split = { split_owner_parts: 2, split_manager_parts: 1 };
// Every batch already here was paid in full from the company fund on the day it arrived.
for (const b of batches) payments.push({ id: crypto.randomUUID(), batch_id: b.id, amount_cents: batchCost(b), paid_on: b.received_on, source: "company", note: null, created_at: b.created_at });
// ORDER=1: Batch 2 ordered 3 days ago from Vape Hub, ₱1,000 down with the owner's money, not here yet.
const B_ORDER = "bbbbbbbb-0000-4000-8000-0000000000f2";
if (process.env.ORDER === "1") {
  batches.push({ id: B_ORDER, batch_no: batches.length + 1, supplier: "Vape Hub", ordered_on: new Date(Date.now() + 8 * 3600000 - 3 * day).toISOString().slice(0, 10), received_on: null, note: null, created_at: ago(3), shipping_cents: 20000, tax_cents: 0, mooe_cents: 0, other_cents: 0, other_label: null, mock: true });
  orderLines.push(
    { id: "0c0c0c0c-0000-4000-8000-000000000001", batch_id: B_ORDER, product_id: products[0].id, qty: 10, unit_cost_cents: 21000, created_at: ago(3) },
    { id: "0c0c0c0c-0000-4000-8000-000000000002", batch_id: B_ORDER, product_id: products[6].id, qty: 6, unit_cost_cents: 21000, created_at: ago(3) },
  );
  payments.push({ id: crypto.randomUUID(), batch_id: B_ORDER, amount_cents: 100000, paid_on: batches.at(-1).ordered_on, source: "owner", note: null, created_at: ago(3) });
}
// batch_statements: each batch's running figures, worked out from the rows above the way the
// database does (landed cost = unit cost + fees / pieces received). Batch 1 has one discounted sale.
function batchStatements() {
  const ids = [...batches.map((b) => b.id), ...(batchRows.some((r) => r.batch_id === null) ? [null] : [])];
  return ids.map((id) => {
    const rs = batchRows.filter((r) => r.batch_id === id);
    const b = batches.find((x) => x.id === id);
    const fees = b ? b.shipping_cents + b.tax_cents + b.mooe_cents + b.other_cents : 0;
    const sum = (f) => rs.reduce((n, r) => n + f(r), 0);
    const received = sum((r) => r.received), sold = sum((r) => r.sold), adjusted = sum((r) => r.adjusted || 0);
    const net = sum((r) => r.sales_cents), discount = id === B1 ? 40000 : 0;
    const pp = received ? fees / received : 0;
    const cogsGoods = sum((r) => r.cost_cents), cogsFees = Math.round(pp * sold);
    const goods = sum((r) => r.received_cost_cents);
    const diffs = Math.round(sum((r) => (r.adjusted || 0) * (21000 + pp)));
    const left = sum((r) => Math.max(0, r.received - r.sold + (r.adjusted || 0)));
    const waiting = b && !b.received_on;
    const orderedGoods = orderLines.filter((l) => l.batch_id === id).reduce((n, l) => n + l.qty * (l.unit_cost_cents ?? 0), 0);
    return { batch_id: id, received, sold, adjusted, left_pcs: left, uncosted: 0, gross_cents: net + discount, discount_cents: discount, net_cents: net,
      cogs_goods_cents: cogsGoods, cogs_fees_cents: cogsFees, count_diffs_cents: diffs, owed_cents: sum((r) => r.owed_cents),
      goods_cents: waiting ? orderedGoods : goods, fees_cents: fees, stock_cents: waiting ? 0 : goods + fees - cogsGoods - cogsFees + diffs, left_value_cents: left * 35000, left_cost_cents: Math.round(left * (21000 + pp)) };
  });
}

function send(res, status, body) {
  if (body === undefined) {
    res.writeHead(status);
    return res.end();
  }
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

http
  .createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks);
      const url = new URL(req.url, "http://x");
      const p = url.pathname;
      const one = (req.headers.accept || "").includes("vnd.pgrst.object");
      const rows = (list) => send(res, 200, one ? list[0] ?? null : list);
      if (p === "/__log") return send(res, 200, { log, products, settings, batches, orderLines, payments });
      if (p === "/auth/v1/user") return send(res, 200, USER);

      if (p.startsWith("/rest/v1/rpc/")) {
        const fn = p.slice("/rest/v1/rpc/".length);
        const body = raw.length ? JSON.parse(raw) : {};
        log.push({ rpc: fn, body });
        if (fn === "collectibles")
          return send(res, 200, process.env.SHOTS ? [{ id: "66666666-0000-4000-8000-000000000001", sale_number: 4, business_date: new Date(Date.now() - 2 * day).toISOString().slice(0, 10), created_at: ago(2), customer_name: "Ana Reyes", total_cents: 68000, balance_cents: 68000, items: [{ name: "XBLACK MAX Pods · Mint", quantity: 2 }] }] : []);
        if (fn === "sales_pace")
          return send(res, 200, products.map((x, i) => ({ product_id: x.id, sold: stats[i][0], days: 11, last_sold_at: stats[i][0] ? ago(1) : null })));
        if (fn === "batch_sales") return send(res, 200, batchRows);
        if (fn === "batch_statements") return send(res, 200, batchStatements());
        if (fn === "set_batch_received_on") {
          // Like the database: owners and managers; not in the future; not before the day it was ordered.
          if (role === "cashier") return send(res, 403, { code: "42501", message: "Only owners and managers can change batches" });
          const b = batches.find((x) => x.id === body.p_batch);
          if (!b) return send(res, 404, { code: "P0002", message: "That batch no longer exists" });
          if (!b.received_on) return send(res, 400, { code: "22023", message: `Batch ${b.batch_no} hasn't arrived yet. Tap Arrived on its page when it comes.` });
          if (!body.p_date || body.p_date > today8()) return send(res, 400, { code: "22023", message: "The date must be in the last 400 days" });
          if (b.ordered_on && body.p_date < b.ordered_on)
            return send(res, 400, { code: "22023", message: `Batch ${b.batch_no} was ordered on ${dayMon(b.ordered_on)}, so it can't arrive before that. Pick that day or later.` });
          b.received_on = body.p_date;
          return send(res, 204);
        }
        if (fn === "batch_report") {
          // Like the database: owner only; days, flavours, who owes and how it was paid, adding up to the statement.
          if (role !== "owner") return send(res, 403, { code: "42501", message: "Only the owner can see batch reports" });
          const b = batches.find((x) => x.id === body.p_batch);
          if (!b) return send(res, 404, { code: "P0002", message: "Batch not found" });
          const st = batchStatements().find((x) => x.batch_id === b.id);
          const rs = batchRows.filter((r) => r.batch_id === b.id);
          const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
          const addD = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * day).toISOString().slice(0, 10);
          const age = Math.round((Date.parse(today + "T00:00:00Z") - Date.parse(b.received_on + "T00:00:00Z")) / day);
          // The batch's pieces sold, spread over its days: most at first, none on the second-to-last day.
          const weights = Array.from({ length: age + 1 }, (_, d) => (d === age - 1 && age > 2 ? 0 : age + 1 - d));
          const wsum = weights.reduce((n, w) => n + w, 0);
          let cumPcs = 0;
          const days = [];
          weights.forEach((w, d) => {
            const target = d === age ? st.sold : Math.min(st.sold, Math.round((st.sold * weights.slice(0, d + 1).reduce((n, x) => n + x, 0)) / wsum));
            const pcs = target - cumPcs;
            if (pcs > 0) {
              cumPcs = target;
              days.push({ date: addD(b.received_on, d), pcs, cum_pcs: cumPcs, cum_net_cents: cumPcs === st.sold ? st.net_cents : Math.round((st.net_cents * cumPcs) / st.sold) });
            }
          });
          const flavours = rs.map((r) => {
            const pr = products.find((x) => x.id === r.product_id);
            const left = Math.max(0, r.received - r.sold + (r.adjusted || 0));
            return { product_id: r.product_id, brand: pr.brand, name: pr.name, variant: pr.variant, received: r.received, sold: r.sold, left,
              last_sale_on: r.sold > 0 ? (left === 0 ? days[Math.max(0, days.length - 2)]?.date ?? today : today) : null };
          });
          const owed = st.owed_cents > 0 ? [{ buyer: "Ana Cruz", cents: st.owed_cents, sales: 1 }] : [];
          const paidAll = st.net_cents - st.owed_cents;
          const paid = paidAll > 50000 ? [{ method: "cash", cents: paidAll - 50000 }, { method: "gcash", cents: 50000 }] : paidAll > 0 ? [{ method: "cash", cents: paidAll }] : [];
          const by = (src) => payments.filter((x) => x.batch_id === b.id && x.source === src).reduce((n, x) => n + x.amount_cents, 0);
          return send(res, 200, { batch_id: b.id, batch_no: b.batch_no, received_on: b.received_on, ordered_on: b.ordered_on ?? null, supplier: b.supplier, cost_cents: batchCost(b), paid_company_cents: by("company"), paid_owner_cents: by("owner"), paid_investment_cents: by("investment"), today, days, flavours, owed, paid });
        }
        if (fn === "batch_owed")
          return send(res, 200, batches[0] && body.p_batch === batches[0].id && !process.env.NOBATCH ? [{ sale_id: "66666666-0000-4000-8000-000000000001", sale_number: 4, business_date: batches[0].received_on, customer_name: "Ana", pcs: 2, owed_cents: 68000 }] : []);
        if (fn === "reserve_product") {
          const prod = products.find((q) => q.id === body.p.product_id);
          const held = reservations.filter((r) => r.product_id === prod.id && r.status === "active").reduce((n, r) => n + r.qty, 0);
          if (body.p.qty > prod.on_hand - held) return send(res, 400, { code: "22023", message: `Only ${Math.max(0, prod.on_hand - held)} left to reserve` });
          const r = { id: crypto.randomUUID(), product_id: prod.id, customer_name: body.p.customer_name, qty: body.p.qty, note: body.p.note || null, hold_until: body.p.hold_until || null, status: "active", created_at: new Date().toISOString() };
          reservations.push(r);
          return send(res, 200, r.id);
        }
        if (fn === "close_reservation") {
          const r = reservations.find((x) => x.id === body.p_id);
          r.status = body.p_sale ? "sold" : "cancelled";
          r.sale_id = body.p_sale;
          return send(res, 204);
        }
        if (fn === "complete_sale") return send(res, 200, { id: "55555555-0000-4000-8000-0000000000aa", sale_number: 9, total_cents: 105000, change_cents: null, balance_cents: 0 });
        if (fn === "company_funds")
          {
            const rel = releases.reduce((n, r) => n + r.amount_cents, 0);
            const balance = 1292000 - 495000 - rel;
            const d = setAsides.at(-1);
            const kept = d ? d.amount_cents : 0;
            return send(res, 200, { gross_cents: 1400000, discount_cents: 40000, net_cents: 1360000, owed_cents: 68000, collected_cents: 1292000, collected_by_method: { cash: 900000, gcash: 392000 }, goods_cents: 495000, goods_uncosted: 0, restock_fees_cents: 0, expenses_cents: 0, released_cents: rel, owner_released_cents: releases.reduce((n, r) => n + r.owner_cents, 0), manager_released_cents: releases.reduce((n, r) => n + r.manager_cents, 0), balance_cents: balance, set_aside_cents: kept, set_aside_used_cents: 0, kept_cents: kept, set_aside_at: d ? d.created_at : null, set_aside_note: d ? d.note : null, needs_decision: !d, last_batch_no: 2, last_batch_cents: 495000, available_cents: Math.max(0, balance - kept) });
          }
        if (fn === "release_profits") {
          const m = Math.round(body.p_amount_cents / 3);
          releases.unshift({ id: crypto.randomUUID(), amount_cents: body.p_amount_cents, owner_cents: body.p_amount_cents - m, manager_cents: m, note: body.p_note || null, released_on: new Date().toISOString().slice(0, 10) });
          return send(res, 200, releases[0].id);
        }
        if (fn === "delete_fund_release") {
          releases.splice(releases.findIndex((r) => r.id === body.p_id), 1);
          return send(res, 204);
        }
        if (fn === "edit_stock_change" || fn === "remove_stock_change") return send(res, 204);
        if (fn === "order_batch" || fn === "receive_batch") {
          const id = crypto.randomUUID();
          const here = fn === "receive_batch";
          const b = { id, batch_no: batches.length + 1, supplier: body.p.supplier || null, ordered_on: here ? null : body.p.ordered_on || today8(), received_on: here ? body.p.received_on || today8() : null, note: body.p.note || null, created_at: new Date().toISOString(), shipping_cents: body.p.shipping_cents, tax_cents: body.p.tax_cents, mooe_cents: body.p.mooe_cents, other_cents: body.p.other_cents, other_label: body.p.other_label || null, mock: true };
          batches.push(b);
          for (const it of body.p.items) {
            if (here) {
              products.find((q) => q.id === it.product_id).on_hand += it.qty;
              batchRows.push({ batch_id: id, product_id: it.product_id, received: it.qty, sold: 0, sales_cents: 0, cost_cents: 0, uncosted: 0, owed_cents: 0, received_cost_cents: it.qty * (it.unit_cost_cents ?? 21000), received_uncosted: 0, first_in: new Date().toISOString(), first_sold_at: null, last_sold_at: null });
            } else orderLines.push({ id: crypto.randomUUID(), batch_id: id, product_id: it.product_id, qty: it.qty, unit_cost_cents: it.unit_cost_cents, created_at: new Date().toISOString() });
          }
          payNow(b, body.p.payment ?? (here ? { amount_cents: "rest", source: "company" } : null), here ? b.received_on : b.ordered_on);
          return send(res, 200, id);
        }
        if (fn === "arrive_batch") {
          if (role === "cashier") return send(res, 403, { code: "42501", message: "Only owners and managers can receive stock" });
          const b = batches.find((x) => x.id === body.p_batch);
          if (!b) return send(res, 404, { code: "P0002", message: "That batch no longer exists" });
          if (b.received_on) return send(res, 400, { code: "22023", message: `Batch ${b.batch_no} already arrived on ${dayMon(b.received_on)}` });
          const on = body.p.received_on || today8();
          if (b.ordered_on && on < b.ordered_on) return send(res, 400, { code: "22023", message: `Batch ${b.batch_no} was ordered on ${dayMon(b.ordered_on)}, so it can't arrive before that. Pick that day or later.` });
          const came = orderLines.filter((l) => l.batch_id === b.id).map((l) => ({ l, qty: (body.p.items || []).find((i) => i.line_id === l.id)?.qty ?? l.qty }));
          if (!came.some((c) => c.qty > 0)) return send(res, 400, { code: "22023", message: "Enter the pieces that came for at least one product" });
          b.received_on = on;
          for (const { l, qty } of came.filter((c) => c.qty > 0)) {
            products.find((q) => q.id === l.product_id).on_hand += qty;
            batchRows.push({ batch_id: b.id, product_id: l.product_id, received: qty, sold: 0, sales_cents: 0, cost_cents: 0, uncosted: 0, owed_cents: 0, received_cost_cents: qty * (l.unit_cost_cents ?? 0), received_uncosted: 0, adjusted: 0, first_in: new Date().toISOString(), first_sold_at: null, last_sold_at: null });
          }
          payNow(b, body.p.payment, on);
          return send(res, 204);
        }
        if (fn === "undo_batch_arrival") {
          const b = batches.find((x) => x.id === body.p_batch);
          const rs = batchRows.filter((r) => r.batch_id === b.id);
          if (rs.some((r) => r.sold > 0)) return send(res, 400, { code: "22023", message: `Some of Batch ${b.batch_no}'s pieces were sold, so it can't go back on the way` });
          // What came becomes the order again (as the database does).
          for (let k = orderLines.length - 1; k >= 0; k--) if (orderLines[k].batch_id === b.id) orderLines.splice(k, 1);
          for (const r of rs) orderLines.push({ id: crypto.randomUUID(), batch_id: b.id, product_id: r.product_id, qty: r.received, unit_cost_cents: Math.round(r.received_cost_cents / r.received), created_at: new Date().toISOString() });
          for (const r of rs) {
            products.find((q) => q.id === r.product_id).on_hand -= r.received;
            batchRows.splice(batchRows.indexOf(r), 1);
          }
          b.ordered_on = b.ordered_on || b.received_on;
          b.received_on = null;
          return send(res, 204);
        }
        if (fn === "delete_batch_order") {
          const b = batches.find((x) => x.id === body.p_batch);
          if (paidOn(b.id) > 0) return send(res, 400, { code: "22023", message: `Batch ${b.batch_no} has ₱${(paidOn(b.id) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} paid on it. Remove its payments first (if the supplier gave the money back).` });
          batches.splice(batches.indexOf(b), 1);
          for (let k = orderLines.length - 1; k >= 0; k--) if (orderLines[k].batch_id === b.id) orderLines.splice(k, 1);
          return send(res, 204);
        }
        if (fn === "add_batch_payment" || fn === "update_batch_payment") {
          if (role === "cashier") return send(res, 403, { code: "42501", message: "Only owners and managers can record payments" });
          const existing = fn === "update_batch_payment" ? payments.find((x) => x.id === body.p_id) : null;
          const b = batches.find((x) => x.id === (existing ? existing.batch_id : body.p_batch));
          const left = batchCost(b) - paidOn(b.id) + (existing ? existing.amount_cents : 0);
          if (body.p.amount_cents > left)
            return send(res, 400, { code: "22023", message: left <= 0 ? `Batch ${b.batch_no} is already paid in full` : `Only ₱${(left / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} is still to pay for Batch ${b.batch_no}` });
          if (existing) Object.assign(existing, { amount_cents: body.p.amount_cents, paid_on: body.p.paid_on, source: body.p.source, note: body.p.note || null });
          else payments.push({ id: crypto.randomUUID(), batch_id: b.id, amount_cents: body.p.amount_cents, paid_on: body.p.paid_on, source: body.p.source, note: body.p.note || null, created_at: new Date().toISOString() });
          return send(res, existing ? 204 : 200, existing ? undefined : payments.at(-1).id);
        }
        if (fn === "delete_batch_payment") {
          const k = payments.findIndex((x) => x.id === body.p_id);
          if (k >= 0) payments.splice(k, 1);
          return send(res, 204);
        }
        if (fn === "batch_existing_stock") {
          const id = crypto.randomUUID();
          batches.push({ id, batch_no: batches.length + 1, supplier: body.p.supplier || null, received_on: new Date(Date.now() - 11 * day).toISOString().slice(0, 10), note: "Opening stock", created_at: new Date().toISOString(), shipping_cents: 0, tax_cents: 0, mooe_cents: 0, other_cents: 0, other_label: null });
          for (const r of batchRows) if (r.batch_id === null) r.batch_id = id;
          return send(res, 200, id);
        }
        if (fn === "add_expense") {
          expenses.unshift({ id: crypto.randomUUID(), batch_id: body.p.batch_id || null, spent_on: body.p.spent_on, category: body.p.category, amount_cents: body.p.amount_cents, note: body.p.note || null });
          return send(res, 200, expenses[0].id);
        }
        if (fn === "update_expense") {
          const e = expenses.find((x) => x.id === body.p_id);
          Object.assign(e, { batch_id: body.p.batch_id || null, spent_on: body.p.spent_on, category: body.p.category, amount_cents: body.p.amount_cents, note: body.p.note || null });
          return send(res, 204);
        }
        if (fn === "update_capital") {
          Object.assign(capital.find((x) => x.id === body.p_id), { amount_cents: body.p_amount_cents, note: body.p_note || null, put_in_on: body.p_put_in_on });
          return send(res, 204);
        }
        if (fn === "update_fund_release") {
          const m = Math.round(body.p_amount_cents / 3);
          Object.assign(releases.find((x) => x.id === body.p_id), { amount_cents: body.p_amount_cents, owner_cents: body.p_amount_cents - m, manager_cents: m, note: body.p_note || null, released_on: body.p_released_on });
          return send(res, 204);
        }
        if (fn === "update_batch_details") {
          const b = batches.find((x) => x.id === body.p_batch);
          const ordered = "ordered_on" in body.p ? body.p.ordered_on || null : b.ordered_on ?? null;
          if (ordered && body.p.received_on && ordered > body.p.received_on)
            return send(res, 400, { code: "22023", message: `It can't arrive before it was ordered (${dayMon(ordered)}). Pick that day or later.` });
          Object.assign(b, { supplier: body.p.supplier || null, ordered_on: ordered, note: body.p.note || null, ...(b.received_on ? { received_on: body.p.received_on } : {}) });
          return send(res, 204);
        }
        if (fn === "delete_expense") {
          const k = expenses.findIndex((e) => e.id === body.p_id);
          if (k >= 0) expenses.splice(k, 1);
          return send(res, 204);
        }
        if (fn === "import_products") {
          // Same answers as the database function for what the tests use: example rows, missing name or price,
          // pesos as typed (₱, PHP, P, commas only between thousands), names with extra spaces, products already in
          // the app (and whether they're for sale), the same product twice, a barcode Excel turned into 4.8E+12, a
          // barcode already taken; all or nothing. A row with barcode RACE-1 checks fine, but when it is added another
          // phone has just taken that barcode (as if added between the check and Add).
          const sq = (x) => (x || "").replace(/\s+/g, " ").trim();
          const keyOf = (b, n, v) => [b, n, v].map((x) => sq(x).toLowerCase()).join("|");
          const err = (r, message) => ({ row_no: r.row_no, status: "error", message, product_id: null });
          const peso = (x) => {
            const t = (x || "").replace(/php|[₱\s]/gi, "").replace(/^p(?=\d)/i, "");
            return /^(\d{1,3}(,\d{3})+|\d{1,7})(\.\d{1,2})?$/.test(t) ? Math.round(Number(t.replace(/,/g, "")) * 100) : null;
          };
          if (body.p_commit && (body.p_rows || []).some((r) => (r.barcode || "").trim() === "RACE-1") && !products.some((p) => p.barcode === "RACE-1")) {
            products.push({ id: crypto.randomUUID(), brand: "Other", name: "Phone", variant: null, on_hand: 0, reorder_at: 5, category_id: null, photo_path: null, active: true, price_cents: 100, barcode: "RACE-1" });
          }
          const seen = new Map();
          const out = (Array.isArray(body.p_rows) ? body.p_rows : []).map((r) => {
            const cat = sq(r.category), brand = sq(r.brand), name = sq(r.name);
            const variant = sq(r.variant), barcode = (r.barcode || "").trim();
            if (cat.toLowerCase() === "example" || brand.toLowerCase() === "example") return { row_no: r.row_no, status: "example", message: "Example row: skipped", product_id: null };
            const price = peso(r.price);
            if (!name) return err(r, "Add the product name.");
            if (price === null) return err(r, "Enter the selling price in pesos, e.g. 340.");
            const k = keyOf(brand, name, variant);
            const existing = products.find((p) => keyOf(p.brand, p.name, p.variant) === k);
            if (existing) return { row_no: r.row_no, status: "exists", message: existing.active ? "Already in the app: skipped" : "Already in the app (Not for sale): skipped", product_id: existing.id };
            if (seen.has(k)) return err(r, `Same product as row ${seen.get(k)}.`);
            if (/^\d+(\.\d+)?e\+\d+$/i.test(barcode)) return err(r, `Excel changed this barcode to ${barcode}. Set the Barcode column to Text, type the barcode again and save.`);
            if (barcode && products.some((p) => p.barcode === barcode)) return err(r, `Another product already has barcode ${barcode}.`);
            seen.set(k, r.row_no);
            return { row_no: r.row_no, status: "new", message: null, product_id: null,
              add: { cat, brand, name, variant, barcode, price_cents: price, active: !/^(no|n|false|0)$/i.test((r.for_sale || "").trim()) } };
          });
          if (body.p_commit) {
            const bad = out.filter((o) => o.status === "error").length;
            if (bad) return send(res, 400, { code: "22023", message: bad === 1 ? "Nothing was added: 1 row needs fixing (marked Fix this). Fix it, then choose the file again." : `Nothing was added: ${bad} rows need fixing (marked Fix this). Fix them, then choose the file again.` });
            for (const o of out.filter((x) => x.status === "new")) {
              const a = o.add;
              let catId = null;
              if (a.cat) {
                const found = [...baseCategories, ...extraCategories].find((c) => c.name.toLowerCase() === a.cat.toLowerCase());
                catId = found ? found.id : crypto.randomUUID();
                if (!found) extraCategories.push({ id: catId, name: a.cat });
              }
              o.product_id = crypto.randomUUID();
              products.push({ id: o.product_id, brand: a.brand || null, name: a.name, variant: a.variant || null, on_hand: 0, reorder_at: 5,
                category_id: catId, photo_path: null, active: a.active, price_cents: a.price_cents, barcode: a.barcode || null });
            }
          }
          return send(res, 200, out.map(({ add, ...o }) => o));
        }
        if (fn === "set_profit_split") {
          split.split_owner_parts = body.p_owner_parts;
          split.split_manager_parts = body.p_manager_parts;
          return send(res, 204);
        }
        if (fn === "set_batch_costs") {
          Object.assign(batches.find((b) => b.id === body.p_batch), body.p);
          return send(res, 204);
        }
        if (fn === "set_restock_plan") {
          settings.restock_lead_days = body.p_lead_days;
          settings.restock_buffer_days = body.p_buffer_days;
          settings.restock_cover_days = body.p_cover_days;
          return send(res, 204);
        }
        if (fn === "set_reorder_levels") {
          let n = 0;
          for (const l of body.p) {
            const x = products.find((q) => q.id === l.product_id);
            if (x && x.reorder_at !== l.reorder_at) {
              x.reorder_at = l.reorder_at;
              n++;
            }
          }
          return send(res, 200, n);
        }
        if (fn === "finance_report") {
          const start = finDerive(finTotals(body.p_from <= "2026-10-27" ? "before" : "before"));
          const end = finDerive(finTotals("end"));
          const kept = setAsides.length ? setAsides.at(-1).amount_cents : 0;
          const taxRes = Math.max(0, end.tax_payable);
          const owedSup = Math.max(0, end.owed_suppliers);
          const spare = end.cash - taxRes - owedSup - kept;
          const suppliers = batches
            .filter((b) => !b.received_on || batchCost(b) !== paidOn(b.id))
            .map((b) => ({ batch_id: b.id, batch_no: b.batch_no, cost_cents: batchCost(b), paid_cents: paidOn(b.id), owed_cents: batchCost(b) - paidOn(b.id), on_the_way: !b.received_on, ordered_on: b.ordered_on || b.received_on }));
          return send(res, 200, { from: body.p_from, to: body.p_to, start, end, first_day: "2026-10-27", suppliers,
            now: { cash: end.cash, retained: end.retained, tax_reserve: taxRes, supplier_reserve: owedSup, inventory_reserve: kept, spare_cash: spare, safe_to_distribute: Math.max(0, Math.min(end.retained, spare)),
              register: { cash_received: end.collected_by_method.cash, capital_cash: end.capital_cash, stock: end.paid_company + end.loose_goods, expenses: end.opex - (end.opex_by_category.fees || 0), payment_fees: end.opex_by_category.fees || 0, tax_paid: end.tax_paid, distributions: end.distributions,
                elsewhere: end.collected - end.collected_by_method.cash, elsewhere_by_method: end.collected - end.collected_by_method.cash ? { gcash: end.collected - end.collected_by_method.cash } : {}, expected: end.cash - (end.collected - end.collected_by_method.cash) + (end.opex_by_category.fees || 0) } },
            receivables: [{ sale_id: "66666666-0000-4000-8000-000000000001", customer_name: "RODS", cents: 96000, days: 7 }, { sale_id: "66666666-0000-4000-8000-000000000002", customer_name: "PAOLO", cents: 32000, days: 6 }] });
        }
        if (fn === "add_capital") {
          capital.push({ id: crypto.randomUUID(), amount_cents: body.p_amount_cents, note: body.p_note || null, put_in_on: body.p_put_in_on || new Date().toISOString().slice(0, 10) });
          return send(res, 200, capital.at(-1).id);
        }
        if (fn === "delete_capital") {
          const i = capital.findIndex((c) => c.id === body.p_id);
          if (i >= 0) capital.splice(i, 1);
          return send(res, 204);
        }
        if (fn === "set_tax_rate") {
          taxBp = body.p_bp;
          return send(res, 204);
        }
        if (fn === "set_restock_set_aside") {
          setAsides.push({ amount_cents: body.p_amount_cents, note: body.p_note || null, created_at: new Date().toISOString() });
          return send(res, 200, crypto.randomUUID());
        }
        return send(res, 200, null);
      }

      if (p.startsWith("/rest/v1/")) {
        const table = p.slice("/rest/v1/".length);
        if (table === "profiles") return rows([{ id: USER_ID, full_name: "Test Owner", role, active: true }]);
        if (table === "categories") return rows([...baseCategories, ...extraCategories]);
        if (table === "settings") return rows([{ ...settings, ...split, tax_rate_bp: taxBp }]);
        if (table === "expenses") return rows(expenses);
        if (table === "fund_releases") return rows(releases);
        if (table === "capital_contributions") return rows(capital);
        if (table === "reservations") {
          const q = url.searchParams;
          const eq = (k) => (q.get(k) || "").replace(/^eq\./, "");
          return rows(reservations.filter((r) => (!eq("status") || r.status === eq("status")) && (!eq("product_id") || r.product_id === eq("product_id")) && (!eq("id") || r.id === eq("id"))));
        }
        if (table === "stock_movements") {
          const q = url.searchParams;
          const pid = (q.get("product_id") || "").replace(/^eq\./, "");
          const bid = q.get("batch_id") || "";
          const kinds = (q.get("kind") || "").replace(/^in\.\(|\)$/g, "").split(",").filter(Boolean);
          let list = movements.filter(
            (m) =>
              (!pid || m.product_id === pid) &&
              (!kinds.length || kinds.includes(m.kind)) &&
              (!bid || (bid === "is.null" ? m.batch_id === null : bid === "not.is.null" ? m.batch_id !== null : `eq.${m.batch_id}` === bid)),
          );
          if ((q.get("order") || "").startsWith("created_at.desc")) list = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
          else if ((q.get("order") || "").startsWith("created_at")) list = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
          return rows(list);
        }
        if (table === "product_costs") return rows(products.map((x) => ({ product_id: x.id, cost_cents: 21000 })));
        if (table === "stock_batches") {
          const here = url.searchParams.get("received_on");
          const list = [...batches].sort((a, b) => b.batch_no - a.batch_no).map(({ mock, ...b }) => ({ ordered_on: null, ...b }));
          return rows(here === "not.is.null" ? list.filter((b) => b.received_on) : list);
        }
        if (table === "batch_order_lines") return rows(orderLines);
        if (table === "batch_payments") {
          const src = (url.searchParams.get("source") || "").replace(/^in\.\(|\)$/g, "").split(",").filter(Boolean);
          return rows(payments.filter((x) => !src.length || src.includes(x.source)).sort((a, b) => a.paid_on.localeCompare(b.paid_on)));
        }
        if (table === "products") {
          const idEq = url.searchParams.get("id");
          return rows(products.filter((x) => !idEq || `eq.${x.id}` === idEq));
        }
        return rows([]);
      }
      log.push({ unhandled: `${req.method} ${req.url}` });
      return send(res, 404, { message: "unhandled" });
    });
  })
  .listen(54321, "127.0.0.1", () => console.log("mock on 54321"));
