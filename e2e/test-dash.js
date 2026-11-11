// End-to-end: Sales → Dashboard.
const { chromium } = require("playwright");
const BASE = "http://127.0.0.1:3100";
const MOCK = "http://127.0.0.1:54321";
const DIR = __dirname;
const ROLE = process.env.ROLE || "owner";
const b64url = (s) => Buffer.from(s).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = [b64url('{"alg":"HS256"}'), b64url(JSON.stringify({ sub: "aaaaaaaa-1111-4111-8111-000000000001", exp })), b64url("signature")].join(".");
const session = { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user: { id: "aaaaaaaa-1111-4111-8111-000000000001" } };
const results = [];
const check = (n, ok, x = "") => results.push(`${ok ? "ok  " : "FAIL"} ${n}${x ? ` (${x})` : ""}`);
const mock = async (p) => (await fetch(MOCK + p)).json();

async function ctxFor(browser, viewport, scheme) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: scheme });
  await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + b64url(JSON.stringify(session)), domain: "127.0.0.1", path: "/" }]);
  return ctx;
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const errors = [];
  if (ROLE === "cashier") {
    const ctx = await ctxFor(browser, { width: 390, height: 844 }, "light");
    const page = await ctx.newPage();
    await page.goto(`${BASE}/sales`);
    check("staff: no Dashboard switch on Sales", (await page.getByRole("link", { name: "Dashboard" }).count()) === 0);
    await page.goto(`${BASE}/sales/dashboard`);
    check("staff: dashboard explains it's for owners and managers", (await page.getByText("The dashboard is for owners and managers.").count()) === 1);
    console.log(results.join("\n"));
    await browser.close();
    return;
  }
  for (const [label, viewport, scheme] of [
    ["desk-light", { width: 1280, height: 900 }, "light"],
    ["desk-dark", { width: 1280, height: 900 }, "dark"],
    ["phone-light", { width: 390, height: 844 }, "light"],
  ]) {
    const ctx = await ctxFor(browser, viewport, scheme);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
    await page.goto(`${BASE}/sales`);
    await page.getByRole("link", { name: "Dashboard" }).click();
    await page.waitForURL(/\/sales\/dashboard$/, { waitUntil: "commit" });
    await page.locator(".chart svg").first().waitFor();
    check(`${label}: Sales tab stays current`, (await page.locator('a[href="/sales"][aria-current="page"]').count()) >= 1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    check(`${label}: no sideways scroll`, !overflow);
    await page.screenshot({ path: `${DIR}/shots/dash-${label}.png`, fullPage: true });
    if (label === "desk-light") {
      const bars = await page.locator(".chart").first().locator(".chart__bar").count();
      check("sales chart draws stacked columns", bars >= 40, String(bars));
      await page.locator(".chart").first().locator(".chart__hit").nth(25).hover();
      const tip = await page.locator(".chart__tip").first().innerText();
      check("hover shows the column's sales, cost and profit", /Sales ₱/.test(tip) && /Cost ₱/.test(tip) && /Profit ₱/.test(tip), tip.replace(/\n/g, " | "));
      await page.screenshot({ path: `${DIR}/shots/dash-tooltip.png`, clip: { x: 300, y: 300, width: 980, height: 520 } });
      await page.locator(".chart__table summary").first().click();
      check("table view lists every day", (await page.locator(".chart__table table").first().locator("tbody tr").count()) === 30);
      const kpis = (await page.locator(".kpi").allInnerTexts()).map((t) => t.replace(/\s+/g, " "));
      check("unit KPIs: sales vs before, profit per piece, still owed", /NET SALES/i.test(kpis[0]) && /▲ \d+% vs previous 30 days/.test(kpis[0]) && /PROFIT PER PIECE/i.test(kpis[4]) && /₱135/.test(kpis[4]) && /₱3,840/.test(kpis[6]), kpis.join(" | "));
      const best = await page.locator('section[aria-labelledby="best-t"] .rank__label').allInnerTexts();
      check("best sellers ranked", best[0] === "XBLACK MAX Pods · Mint" && best.length === 5, best.join(", "));
      const metas = await page.locator('section[aria-labelledby="best-t"] .rank__meta').allInnerTexts();
      const mango = metas[best.indexOf("XBLACK MAX Pods · Mango")] ?? "";
      check("sold-out best seller shows how fast it sold", /^Sold out in 6 days · \d+(\.\d)? \/ day/.test(mango), mango);
      check("in-stock best seller shows stock left and pace", /^\d+ days? of stock left · [\d.]+ \/ day/.test(metas[0]), metas[0]);
      const slow = await page.locator('section[aria-labelledby="slow-t"] .list-row__title > span:first-child').allInnerTexts();
      check("slowest movers: unsold stock first", /Blueberry|Banana/.test(slow[0]), slow.join(", "));
      await page.getByRole("link", { name: "Days left" }).click();
      await page.waitForURL(/sort=days/, { waitUntil: "commit" });
      const first = await page.locator(".table--stack tbody tr").first().innerText();
      check("product table sorts by days left (out of stock first)", /Out now/.test(first), first.split("\n")[0]);
      check("busiest time named", (await page.getByText(/Busiest: .*s around/).count()) === 1);
      check("dashboard links to the P&L view", (await page.locator('a.pnl-link[href="/sales/pnl"]').count()) === 1 && (await page.locator(".pnl").count()) === 0);
      await page.getByRole("link", { name: "12 months" }).click();
      await page.waitForURL(/range=12m/, { waitUntil: "commit" });
      await page.locator(".chart svg").first().waitFor();
      const call = (await mock("/__log")).log.filter((l) => l.rpc === "dashboard").at(-1).body;
      check("12 months groups by month", call.p_grain === "month", JSON.stringify(call));
      await page.screenshot({ path: `${DIR}/shots/dash-12m.png`, clip: { x: 300, y: 0, width: 980, height: 900 } });
    }
    await ctx.close();
  }
  check("no page errors", errors.length === 0, errors.join("; "));
  check("no unhandled calls", !(await mock("/__log")).log.some((l) => l.unhandled));
  await browser.close();
  console.log(results.join("\n"));
})().catch((e) => {
  console.log(results.join("\n"));
  console.error(e);
  process.exit(1);
});
