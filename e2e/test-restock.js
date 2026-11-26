// End-to-end: Restock tab (reorder plan, copy order, alerts, receive batch, batches, plan change).
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:3100";
const MOCK = "http://127.0.0.1:54321";
const DIR = __dirname;
const ONLY = process.env.ONLY; // "cashier" for the staff check

const b64url = (s) => Buffer.from(s).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = [b64url('{"alg":"HS256","typ":"JWT"}'), b64url(JSON.stringify({ sub: "aaaaaaaa-1111-4111-8111-000000000001", role: "authenticated", aud: "authenticated", exp })), b64url("signature")].join(".");
const session = { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user: { id: "aaaaaaaa-1111-4111-8111-000000000001", aud: "authenticated", role: "authenticated", email: "owner@test.local" } };

const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` (${extra})` : ""}`);
const mock = async (p) => (await fetch(MOCK + p)).json();

async function context(browser, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + b64url(JSON.stringify(session)), domain: "127.0.0.1", path: "/" }]);
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  return ctx;
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const errors = [];

  if (ONLY === "cashier") {
    const ctx = await context(browser, { width: 390, height: 844 });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/inventory`);
    check("staff: no Restock tab", (await page.locator('.tabbar a[href="/restock"]').count()) === 0);
    await page.goto(`${BASE}/restock`);
    check("staff: Restock page explains it's for owners and managers", (await page.getByText("Restocking is for owners and managers.").count()) === 1);
    await browser.close();
    console.log(results.join("\n"));
    return;
  }

  // Phone first: look and nav
  {
    const ctx = await context(browser, { width: 390, height: 844 });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${BASE}/restock`);
    check("phone: Restock tab in the tab bar, current", (await page.locator('.tabbar a[href="/restock"][aria-current="page"]').count()) === 1);
    const tabs = await page.locator(".tabbar__item").count();
    check("phone: six tabs fit", tabs === 6, String(tabs));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check("phone: no sideways scroll", !overflow);
    await page.screenshot({ path: `${DIR}/shots/r-phone-reorder.png`, fullPage: true });
    await page.goto(`${BASE}/restock/receive?suggested=1`);
    await page.screenshot({ path: `${DIR}/shots/r-phone-receive.png`, fullPage: true });
    await page.goto(`${BASE}/restock?view=batches`);
    // Each batch's net profit so far and the owner / manager shares: a line of its own that wraps, never cut off.
    const lines = await page.locator(".list-row__meta--wrap").evaluateAll((els) =>
      els.map((el) => ({ text: el.innerText.replace(/\s+/g, " "), cut: el.scrollWidth > el.clientWidth + 1 })),
    );
    check("phone: each batch shows its sales, what's owed, its net profit so far and the owner / manager shares, in full",
      lines.length === 4 && /pcs sold · ₱13,600 · ₱680 owed$/.test(lines[0].text) && /^Net profit so far ₱4,127 · owner ₱2,751\.33 · manager ₱1,375\.67$/.test(lines[1].text)
        && /23 of 30 pcs sold · ₱8,050$/.test(lines[2].text) && /^Net profit so far ₱2,978\.50 · owner ₱1,985\.67 · manager ₱992\.83$/.test(lines[3].text) && lines.every((l) => !l.cut),
      JSON.stringify(lines));
    check("phone: batches list has no sideways scroll", !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
    await page.screenshot({ path: `${DIR}/shots/r-phone-batches.png`, fullPage: true });
    await ctx.close();
  }

  const ctx = await context(browser, { width: 1280, height: 900 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));

  // 1. Reorder plan
  await page.goto(`${BASE}/restock`);
  const kpis = await page.locator(".kpi").allInnerTexts();
  check("4 to order now", /Order now\s*4/i.test(kpis[0]), kpis[0].replace(/\s+/g, " "));
  check("1 within a week", /Within a week\s*1/i.test(kpis[1]), kpis[1].replace(/\s+/g, " "));
  check("112 pcs suggested, about ₱23,520 at cost", /112 pcs/.test(kpis[2]) && /23,520/.test(kpis[2]), kpis[2].replace(/\s+/g, " "));
  const orderNow = await page.locator("section:has(#sec-order) .list-row__title > span:first-child").allInnerTexts();
  check("Order now lists the fastest to run out first", orderNow.join(",") === "XBLACK MAX Pods · Strawberry,XBLACK MAX Pods · Mint,XBLACK MAX Pods · Lychee,XBLACK MAX Pods · Mango", orderNow.join(","));
  const mint = await page.locator('a[href$="0000000010"]').innerText();
  check("Mint: 2 / day, 2 days left, reorder at 20, order 44", /2 \/ day · 2 days left · reorder at 20/.test(mint) && /order 44/.test(mint), mint.replace(/\s+/g, " "));
  check("slow and idle products have their own sections", (await page.locator("#sec-ok").count()) === 1 && (await page.locator("#sec-idle").count()) === 1);
  await page.screenshot({ path: `${DIR}/shots/r-desk-reorder.png`, fullPage: true });

  // 2. Copy order list
  await page.getByRole("button", { name: "Copy order list" }).click();
  await page.getByText("Order list copied.").waitFor();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check("order list copied for the supplier", clip.startsWith("Order for Cloud Factory") && clip.includes("• XBLACK MAX Pods · Mint × 44") && clip.includes("Total: 112 pcs"), clip.split("\n").slice(0, 2).join(" | "));

  // 3. Low-stock alerts
  await page.getByRole("button", { name: /Update low-stock alerts \(7\)/ }).click();
  await page.waitForURL(/alerts=7/, { waitUntil: "commit" });
  await page.getByText("Low-stock alerts updated for 7 products.").waitFor();
  let st = await mock("/__log");
  check("alerts set to reorder points", st.products[0].reorder_at === 20 && st.products[7].reorder_at === 5);
  check("alerts button gone once they match", (await page.getByRole("button", { name: /Update low-stock alerts/ }).count()) === 0);

  // 4. Order the suggested pieces: they wait on the way, count as in stock, then Arrived puts them on the shelf.
  await page.getByRole("link", { name: "Order this" }).click();
  await page.waitForURL(/\/restock\/order\?suggested=1/, { waitUntil: "commit" });
  check("order form starts at the suggested order", (await page.getByLabel("Pieces of XBLACK MAX Pods · Mint").inputValue()) === "44");
  check("running total", /112 pcs/.test(await page.locator(".actionbar__total").innerText()));
  await page.fill("#b-supplier", "Cloud Supply");
  await page.getByLabel("Pieces of XBLACK MAX Pods · Grape").fill("");
  await page.getByLabel("Cost per piece of XBLACK MAX Pods · Mint").fill("200");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.fill("#cost-shipping", "450");
  await page.fill("#cost-other", "50");
  await page.fill("#cost-other-label", "Courier");
  check("total with restock costs", /₱21,\d{3}/.test(await page.locator(".actionbar__meta").innerText()), await page.locator(".actionbar__meta").innerText());
  check("total follows edits", /104 pcs/.test(await page.locator(".actionbar__total").innerText()));
  // A downpayment with the owner's money: the rest is shown as due on pick-up.
  await page.getByRole("radio", { name: "Downpayment" }).click();
  await page.fill("#pay-amount", "5000");
  await page.getByRole("radio", { name: "Owner's money" }).click();
  check("the order shows what is left to pay on pick-up", /₱1\d,\d{3}(\.\d\d)? to pay on pick-up/.test(await page.locator('section[aria-labelledby="pay-t"]').innerText()),
    (await page.locator('section[aria-labelledby="pay-t"]').innerText()).replace(/\s+/g, " "));
  await page.screenshot({ path: `${DIR}/shots/r-desk-order.png`, fullPage: true });
  await page.getByRole("button", { name: "Save order" }).click();
  await page.waitForURL(/\/restock\/batches\/[0-9a-f-]{36}\?ordered=1$/, { waitUntil: "commit" });
  const orderUrl = page.url().replace(/\?.*$/, "");
  st = await mock("/__log");
  const rb = st.log.filter((l) => l.rpc === "order_batch").at(-1)?.body.p;
  check("order sent with 4 products, today's date and the downpayment", rb && rb.items.length === 4 && rb.supplier === "Cloud Supply"
    && rb.payment.amount_cents === 500000 && rb.payment.source === "owner" && /^\d{4}-\d{2}-\d{2}$/.test(rb.ordered_on), JSON.stringify(rb?.payment));
  const mintItem = rb?.items.find((i) => i.product_id.endsWith("0000000010"));
  check("restock costs sent", rb?.shipping_cents === 45000 && rb?.other_cents === 5000 && rb?.tax_cents === 0 && rb?.other_label === "Courier", JSON.stringify({ s: rb?.shipping_cents, o: rb?.other_cents, l: rb?.other_label }));
  check("pieces and new cost per piece sent", mintItem?.qty === 44 && mintItem?.unit_cost_cents === 20000, JSON.stringify(mintItem));
  await page.getByText("Batch 2 ordered: 104 pcs on the way.").waitFor();
  const pay = (await page.locator("#payments").innerText()).replace(/\s+/g, " ");
  check("the order's page: on the way, the downpayment with whose money, what is still to pay", /On the way/.test(await page.locator("main").innerText())
    && /Owner's money/.test(pay) && /₱5,000/.test(pay) && /still to pay/.test(pay), pay.slice(0, 200));
  check("nothing on the shelf yet", st.products[0].on_hand === 4);
  // The reorder plan counts what is on the way: Mint isn't suggested again.
  await page.goto(`${BASE}/restock`);
  const coming = (await page.locator(".kpi").allInnerTexts()).map((t) => t.replace(/\s+/g, " ")).find((t) => /On the way/i.test(t)) ?? "";
  check("Reorder shows the pieces on the way", /104 pcs/.test(coming), coming);
  const mintRow = (await page.locator('a[href$="0000000010"]').innerText()).replace(/\s+/g, " ");
  check("a product with pieces on the way says so and isn't suggested again", /44 on the way/.test(mintRow) && !/order \d/.test(mintRow), mintRow);
  check("the order is listed under On the way", /Batch 2 · Cloud Supply/.test(await page.locator('section[aria-labelledby="coming-t"]').innerText()));
  // Arrived: one Mint short, the rest paid on pick-up from the company fund.
  await page.goto(orderUrl);
  await page.getByRole("button", { name: "Arrived" }).click();
  await page.getByLabel("Pieces of XBLACK MAX Pods · Mint that came").fill("43");
  check("Arrived shows what is still to pay after a short delivery", /₱1\d,\d{3}/.test(await page.locator('form[aria-label="Batch 2 arrived"]').innerText()));
  await page.getByRole("button", { name: "Put 103 pcs on the shelf" }).click();
  await page.waitForURL(/\?arrived=1$/, { waitUntil: "commit" });
  st = await mock("/__log");
  const ab = st.log.filter((l) => l.rpc === "arrive_batch").at(-1)?.body;
  check("Arrived sends the day, what came and the pick-up payment",
    ab && /^\d{4}-\d{2}-\d{2}$/.test(ab.p.received_on) && ab.p.items.length === 4 && ab.p.items.some((i) => i.qty === 43) && ab.p.payment.amount_cents === "rest" && ab.p.payment.source === "company",
    JSON.stringify(ab?.p));
  await page.getByText("Batch 2 arrived: 103 pcs on the shelf.").waitFor();
  check("paid in full on pick-up", /Paid in full/.test(await page.locator("#payments").innerText()));
  check("new batch page shows 0% sold", /0%/.test(await page.locator(".kpi--hero").innerText()));

  // 5. Batches
  await page.goto(`${BASE}/restock?view=batches`);
  const rows = await page.locator(".list-row").allInnerTexts();
  check("batches newest first, then stock before batches", /Batch 2/.test(rows[0]) && /Batch 1 · Cloud Supply/.test(rows[1]) && /Stock before batches/.test(rows[2]), rows.map((r) => r.split("\n")[0]).join(" / "));
  check("Batch 1: 40 of 120 sold, 33%, ₱680 owed", /40 of 120 pcs sold/.test(rows[1]) && /33%/.test(rows[1]) && /₱680 owed/.test(rows[1]), rows[1].replace(/\s+/g, " "));
  check("batches overview: still owed", /Still owed\s*₱680/i.test(await page.locator(".kpi").nth(1).innerText()));
  const profits = rows.map((r) => (/Net profit so far.*/.exec(r.replace(/\s+/g, " ")) ?? [""])[0]);
  check("each batch's net profit so far, owner and manager share (a new batch starts at ₱0)",
    /^Net profit so far ₱0 · owner ₱0 · manager ₱0/.test(profits[0]) && /^Net profit so far ₱4,127 · owner ₱2,751\.33 · manager ₱1,375\.67/.test(profits[1]) && /^Net profit so far ₱2,978\.50 · owner ₱1,985\.67 · manager ₱992\.83/.test(profits[2]),
    profits.join(" / "));
  await page.screenshot({ path: `${DIR}/shots/r-desk-batches.png`, fullPage: true });
  await page.getByRole("link", { name: /Batch 1 · Cloud Supply/ }).click();
  await page.waitForURL(/\/restock\/batches\/bbbbbbbb/, { waitUntil: "commit" });
  const k = (await page.locator(".kpi").allInnerTexts()).map((t) => t.replace(/\s+/g, " "));
  check("batch KPIs: sold, sales, profit, pace", /33%/.test(k[0]) && /40 of 120 pcs · 78 left/.test(k[0]) && /NET SALES/i.test(k[1]) && /13,600/.test(k[1]) && /4,966\.67/.test(k[3]) && /36\.5% margin · after restocking fees/.test(k[3]) && /\/ day/.test(k[5]), k.join(" | "));
  check("still owed: ₱680 from Ana", /Still owed\s*₱680/i.test(k.join(" ")) && (await page.getByRole("link", { name: /Ana.*Sale #?4/s }).count()) === 1, k.find((x) => /owed/i.test(x)));
  const costs = (await page.locator("#pnl").innerText()).replace(/\s+/g, " ");
  check("batch cost in full: goods ₱25,200, shipping ₱500, tax ₱120, MOOE ₱80, ₱215.83 per piece", /Goods \(120 pcs\) ₱25,200/.test(costs) && /Shipping ₱500/.test(costs) && /Tax ₱120/.test(costs) && /MOOE ₱80/.test(costs) && /Cost per piece, all in: ₱215\.83/.test(costs), costs);
  check("net profit so far on the pieces sold", /Net profit so far\s*₱4,127/i.test(k.join(" ")), k.join(" | "));
  check("6 products in the batch", (await page.locator('section[aria-labelledby="lines-t"] .list-row').count()) === 6);
  await page.getByRole("button", { name: "Edit restock costs" }).click();
  await page.fill("#cost-tax", "100");
  await page.getByRole("button", { name: "Save costs" }).click();
  await page.waitForURL(/costs=saved/, { waitUntil: "commit" });
  await page.getByText("Restock costs saved.").waitFor();
  check("edited restock costs saved", /Tax ₱100 .*Cost per piece, all in: ₱215\.67/.test((await page.locator("#pnl").innerText()).replace(/\s+/g, " ")));
  await page.screenshot({ path: `${DIR}/shots/r-desk-batch1.png`, fullPage: true });
  await page.goto(`${BASE}/restock/batches/before`);
  check("stock before batches has its own page", (await page.getByText("before batches were recorded").count()) >= 1);

  // 6. Change the plan
  await page.goto(`${BASE}/restock`);
  await page.getByRole("button", { name: "Change these days" }).click();
  await page.fill("#plan-lead", "5");
  await page.fill("#plan-buffer", "2");
  await page.fill("#plan-cover", "21");
  await page.getByRole("button", { name: "Save plan" }).click();
  await page.waitForURL(/plan=saved/, { waitUntil: "commit" });
  const mint2 = await page.locator('a[href$="0000000010"]').innerText();
  check("new plan changes the reorder point (2 / day × 7 days = 14)", /reorder at 14/.test(mint2), mint2.replace(/\s+/g, " "));
  await page.getByRole("button", { name: "Change these days" }).click();
  await page.fill("#plan-cover", "0");
  await page.getByRole("button", { name: "Save plan" }).click();
  await page.getByText("Each order lasts 1 to 180 days.").waitFor();
  check("plan checks its numbers", true);

  check("no page errors", errors.length === 0, errors.join("; "));
  st = await mock("/__log");
  check("no unhandled backend calls", !st.log.some((l) => l.unhandled), JSON.stringify(st.log.filter((l) => l.unhandled)));
  await browser.close();
  console.log(results.join("\n"));
})().catch((e) => {
  console.log(results.join("\n"));
  console.error(e);
  process.exit(1);
});
