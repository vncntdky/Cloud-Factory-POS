// Stand-in for the dashboard RPC: a pod shop with 10 flavours, ~30 days of sales.
const http = require("http");
const USER_ID = "aaaaaaaa-1111-4111-8111-000000000001";
const role = process.env.ROLE || "owner";
const log = [];
const expenses = [];
const split = { split_owner_parts: 2, split_manager_parts: 1 };
const CATS = [{ id: "c0000000-0000-4000-8000-000000000001", name: "TRANSPARENT V2 PODS", sort_order: 0, active: true }, { id: "c0000000-0000-4000-8000-000000000002", name: "Black TEO", sort_order: 1, active: true }];
const invProducts = ["Mint", "Mango", "Grape"].map((f, i) => ({ id: `00000000-0000-4000-8000-0000000000${20 + i}`, brand: "XBLACK MAX", name: f, variant: null, barcode: null, price_cents: 32000, on_hand: [0, 3, 12][i], reorder_at: 5, active: true, category_id: CATS[0].id, photo_path: null }))
  .concat(["Ice Monkey", "Blue Freeze"].map((f, i) => ({ id: `00000000-0000-4000-8000-0000000000${30 + i}`, brand: "Black TEO", name: f, variant: null, barcode: null, price_cents: 34000, on_hand: 0, reorder_at: 5, active: true, category_id: CATS[1].id, photo_path: null })));
const DAY = 86400000;
const flavours = ["Mint", "Mango", "Grape", "Lychee", "Watermelon", "Blueberry", "Strawberry", "Cola", "Peach", "Banana"];
const weights = [9, 7, 5, 4, 2, 0, 6, 1, 1, 0];
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function dashboard(from, to, grain) {
  seed = 7; // same data on every load
  const days = Math.round((new Date(to) - new Date(from)) / DAY) + 1;
  const daily = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(new Date(from).getTime() + i * DAY).toISOString().slice(0, 10);
    const dow = new Date(date).getUTCDay();
    const sales = i < days - 40 ? 0 : Math.round(2 + rnd() * 6 + (dow === 5 || dow === 6 ? 4 : 0));
    const pieces = Math.round(sales * 1.4);
    daily.push({ date, sales, pieces, sales_cents: pieces * 34500, cost_cents: pieces * 21000, discount_cents: sales > 5 ? 2000 : 0 });
  }
  const buckets = [];
  for (const d of daily) {
    let start = d.date;
    if (grain === "week") {
      const dt = new Date(d.date);
      const back = (dt.getUTCDay() + 6) % 7;
      start = new Date(dt.getTime() - back * DAY).toISOString().slice(0, 10);
    } else if (grain === "month") start = d.date.slice(0, 7) + "-01";
    let b = buckets.find((x) => x.start === start);
    if (!b) buckets.push((b = { start, sales_cents: 0, discount_cents: 0, cost_cents: 0, uncosted: 0, pieces: 0, sales: 0 }));
    b.sales_cents += d.sales_cents; b.cost_cents += d.cost_cents; b.discount_cents += d.discount_cents; b.pieces += d.pieces; b.sales += d.sales;
  }
  const sum = (k) => daily.reduce((n, d) => n + d[k], 0);
  const pieces = sum("pieces");
  const totalW = weights.reduce((a, b) => a + b, 0);
  const allOut = process.env.ALLOUT === "1";
  const products = flavours.map((f, i) => {
    const pcs = allOut ? 3 : Math.round((pieces * weights[i]) / totalW);
    if (allOut) {
      // Like the live shop: every flavour sold its 3 pieces, flavour i took 2 + i days.
      const firstIn = Date.now() - 20 * DAY;
      return { product_id: `00000000-0000-4000-8000-0000000000${10 + i}`, name: `XBLACK MAX Pods · ${f}`, active: true, on_hand: 0, pieces: 3, sales_cents: 96000, cost_cents: 48000, uncosted: 0, first_in: new Date(firstIn).toISOString(), last_sold_at: new Date(firstIn + (2 + i) * DAY).toISOString() };
    }
    return { product_id: `00000000-0000-4000-8000-0000000000${10 + i}`, name: `XBLACK MAX Pods · ${f}`, active: true, on_hand: [4, 0, 12, 2, 20, 6, 0, 25, 18, 3][i], pieces: pcs, sales_cents: pcs * 34500, cost_cents: pcs * 21000, uncosted: 0, first_in: new Date(Date.now() - (i === 1 ? 10 : 40) * DAY).toISOString(), last_sold_at: i === 1 ? new Date(Date.now() - 4 * DAY).toISOString() : pcs ? new Date(Date.now() - DAY).toISOString() : new Date(Date.now() - 20 * DAY).toISOString() };
  });
  const hours = [];
  for (let dow = 0; dow < 7; dow++) for (let h = 10; h <= 22; h++) {
    const s = Math.max(0, Math.round((h >= 17 && h <= 21 ? 6 : 2) * (dow >= 5 ? 1.6 : 1) * rnd() - 0.5));
    if (s) hours.push({ dow, hour: h, sales: s, pieces: Math.round(s * 1.4) });
  }
  return {
    buckets,
    current: { sales_cents: sum("sales_cents"), discount_cents: sum("discount_cents"), cost_cents: sum("cost_cents"), uncosted: 0, pieces, sales: sum("sales"), owed_cents: 384000, restock_cents: 70000 },
    previous: { sales_cents: Math.round(sum("sales_cents") * 0.82), discount_cents: 0, cost_cents: Math.round(sum("cost_cents") * 0.8), uncosted: 0, pieces: Math.round(pieces * 0.85), sales: Math.round(sum("sales") * 0.9), owed_cents: 0, restock_cents: 0 },
    products,
    hours,
  };
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
      const send = (s, b) => { res.writeHead(s, { "content-type": "application/json" }); res.end(b === undefined ? "" : JSON.stringify(b)); };
      const rows = (l) => send(200, one ? l[0] ?? null : l);
      if (p === "/__log") return send(200, { log });
      if (p === "/auth/v1/user") return send(200, { id: USER_ID, aud: "authenticated", role: "authenticated", email: "o@t" });
      if (p.startsWith("/rest/v1/rpc/")) {
        const fn = p.slice(13);
        const body = raw.length ? JSON.parse(raw) : {};
        log.push({ rpc: fn, body });
        if (fn === "dashboard") return send(200, dashboard(body.p_from, body.p_to, body.p_grain));
        if (fn === "collectibles") return send(200, []);
        if (fn === "stock_value") return send(200, { cost_cents: 0, retail_cents: 0, pieces: 15, uncosted: 0 });
        if (fn === "add_expense") {
          expenses.unshift({ id: require("crypto").randomUUID(), spent_on: body.p.spent_on, category: body.p.category, amount_cents: body.p.amount_cents, note: body.p.note || null });
          return send(200, expenses[0].id);
        }
        if (fn === "delete_expense") {
          const k = expenses.findIndex((e) => e.id === body.p_id);
          if (k >= 0) expenses.splice(k, 1);
          return send(204);
        }
        if (fn === "set_profit_split") {
          split.split_owner_parts = body.p_owner_parts;
          split.split_manager_parts = body.p_manager_parts;
          return send(204);
        }
        if (fn === "sales_summary") return send(200, { sales: 0, voided: 0, gross_cents: 0, discount_cents: 0, net_cents: 0, pieces: 0, by_method: {}, collected: {}, cogs_cents: 0, uncosted_lines: 0, top: [] });
        return send(200, null);
      }
      if (p.startsWith("/rest/v1/")) {
        const t = p.slice(9);
        if (t === "profiles") return rows([{ id: USER_ID, full_name: "Test Owner", role, active: true }]);
        if (t === "settings") return rows([{ business_name: "Cloud Factory", ...split }]);
        if (t === "expenses") return rows(expenses);
        if (t === "categories") return rows(CATS);
        if (t === "products") return rows(invProducts);
        if (t === "product_costs") return rows(invProducts.map((x) => ({ product_id: x.id, cost_cents: 16000 })));
        return rows([]);
      }
      log.push({ unhandled: `${req.method} ${req.url}` });
      send(404, {});
    });
  })
  .listen(54321, "127.0.0.1");
