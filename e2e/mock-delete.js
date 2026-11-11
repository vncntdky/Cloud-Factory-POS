// Stand-in for the Supabase APIs behind Delete product / Delete sale. ROLE=owner|manager.
const http = require("http");

const USER_ID = "aaaaaaaa-1111-4111-8111-000000000001";
const role = process.env.ROLE || "owner";
const TEST = "00000000-0000-4000-8000-0000000000aa";
const MINT = "00000000-0000-4000-8000-0000000000bb";
const SALE = "55555555-0000-4000-8000-000000000001";
const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
let products = [
  { id: TEST, brand: null, name: "test 1", variant: null, barcode: null, price_cents: 30000, on_hand: 0, reorder_at: 5, active: false, category_id: null, photo_path: null },
  { id: MINT, brand: "XBLACK", name: "MAX Pods", variant: "Mint", barcode: null, price_cents: 35000, on_hand: 4, reorder_at: 5, active: true, category_id: null, photo_path: null },
];
let sales = [
  { id: SALE, sale_number: 1, business_date: today, status: "completed", subtotal_cents: 30000, discount_cents: 0, total_cents: 30000, payment_method: "cash", tendered_cents: 30000, change_cents: 0, reference: null, created_at: new Date().toISOString(), voided_at: null, void_reason: null, customer_name: null, balance_cents: 0, cashier: { full_name: "Test Owner" }, voider: null, sale_items: [{ id: "i1", name: "test 1", unit_price_cents: 30000, quantity: 1, line_total_cents: 30000, sale_id: SALE, product_id: TEST }], sale_payments: [] },
];
const log = [];

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

http
  .createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks);
      const url = new URL(req.url, "http://x");
      const p = url.pathname;
      const q = url.searchParams;
      const one = (req.headers.accept || "").includes("vnd.pgrst.object");
      const rows = (list) => send(res, 200, one ? list[0] ?? null : list, { "content-range": `0-${Math.max(0, list.length - 1)}/${list.length}` });
      if (p === "/__log") return send(res, 200, { log, products, sales });
      if (p === "/auth/v1/user") return send(res, 200, { id: USER_ID, aud: "authenticated", role: "authenticated", email: "o@test.local" });

      if (p.startsWith("/rest/v1/rpc/")) {
        const fn = p.slice("/rest/v1/rpc/".length);
        const body = raw.length ? JSON.parse(raw) : {};
        log.push({ rpc: fn, body });
        if (fn === "collectibles") return send(res, 200, []);
        if (fn === "stock_value") return send(res, 200, { cost_cents: 0, retail_cents: 0, pieces: 0, uncosted: 0 });
        if (fn === "sales_summary")
          return send(res, 200, { sales: sales.length, voided: 0, gross_cents: 0, discount_cents: 0, net_cents: 0, pieces: 0, by_method: {}, collected: {}, cogs_cents: 0, uncosted_lines: 0, top: [] });
        if (fn === "delete_product") {
          const n = body.p_with_sales ? sales.filter((s) => s.sale_items.some((i) => i.product_id === body.p_product)).length : 0;
          if (body.p_with_sales) sales = sales.filter((s) => !s.sale_items.some((i) => i.product_id === body.p_product));
          products = products.filter((x) => x.id !== body.p_product);
          return send(res, 200, { sales_deleted: n, photo_path: null });
        }
        if (fn === "delete_sale") {
          sales = sales.filter((s) => s.id !== body.p_sale);
          return send(res, 204);
        }
        return send(res, 200, null);
      }
      if (p.startsWith("/rest/v1/")) {
        const t = p.slice("/rest/v1/".length);
        const idEq = (q.get("id") || "").replace(/^eq\./, "");
        if (t === "profiles") return rows([{ id: USER_ID, full_name: "Test Owner", role, active: true }]);
        if (t === "settings") return rows([{ business_name: "Cloud Factory", address: null, receipt_footer: null }]);
        if (t === "products") return rows(products.filter((x) => !idEq || x.id === idEq));
        if (t === "stock_movements") {
          const pid = (q.get("product_id") || "").replace(/^eq\./, "");
          const list = pid === TEST ? [{ id: "m1", kind: "opening", delta: 1, on_hand_after: 1, note: null, unit_cost_cents: null, created_at: new Date().toISOString(), sale: null, who: null }, { id: "m2", kind: "sale", delta: -1, on_hand_after: 0, note: null, unit_cost_cents: null, created_at: new Date().toISOString(), sale: { id: SALE, sale_number: 1 }, who: null }] : [];
          return rows(list);
        }
        if (t === "sale_items") {
          const pid = (q.get("product_id") || "").replace(/^eq\./, "");
          const items = sales.flatMap((s) => s.sale_items);
          if (pid) return rows(items.filter((i) => i.product_id === pid).map((i) => ({ sale_id: i.sale_id })));
          return rows([]); // "other products in those sales": none here
        }
        if (t === "sales") {
          const inIds = idEq.startsWith("in.(") ? idEq.slice(4, -1).split(",") : null;
          if (inIds) return rows(sales.filter((s) => inIds.includes(s.id)));
          if (idEq) return rows(sales.filter((s) => s.id === idEq));
          return rows(sales.map((s) => ({ ...s, sale_items: s.sale_items.map((i) => ({ quantity: i.quantity, name: i.name })) })));
        }
        return rows([]);
      }
      log.push({ unhandled: `${req.method} ${req.url}` });
      return send(res, 404, { message: "unhandled" });
    });
  })
  .listen(54321, "127.0.0.1", () => console.log("mock on 54321"));
