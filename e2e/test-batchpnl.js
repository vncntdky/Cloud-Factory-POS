
const { chromium } = require("playwright");
const b64url = (s) => Buffer.from(s).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = [b64url('{"alg":"HS256"}'), b64url(JSON.stringify({ sub: "aaaaaaaa-1111-4111-8111-000000000001", exp })), b64url("signature")].join(".");
const session = { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user: { id: "aaaaaaaa-1111-4111-8111-000000000001" } };
const ROLE = process.env.ROLE || "owner";
const B1 = "bbbbbbbb-0000-4000-8000-000000000001";
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const r = [];
  const check = (n, ok, x = "") => r.push(`${ok ? "ok  " : "FAIL"} ${ROLE}: ${n}${x ? ` (${x})` : ""}`);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + b64url(JSON.stringify(session)), domain: "127.0.0.1", path: "/" }]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const pnl = async () => (await page.locator(".pnl").innerText()).replace(/\s+/g, " ");

  await page.goto(`http://127.0.0.1:3100/restock/batches/${B1}`);
  let t = await pnl();
  check("batch P&L: sales − goods − restock costs = net so far", /Sales so far ₱13,600/.test(t) && /Goods \(120 pcs\) − ₱25,200/.test(t) && /Shipping − ₱500/.test(t) && /Tax − ₱120/.test(t) && /MOOE − ₱80/.test(t) && /Net so far -?−?₱-?12,300/.test(t), t);
  check("projected when sold out", /78 pcs left, at today's prices \+ ₱27,300/.test(t) && /When sold out ₱15,000/.test(t), t);
  check("net so far KPI is red while the batch is paying for itself", (await page.locator(".kpi--alert", { hasText: "Net so far" }).count()) === 1);
  if (ROLE === "owner") {
    await page.getByRole("button", { name: "Add expense" }).click();
    await page.fill("#exp-amount", "5000");
    await page.fill("#exp-note", "Cara, batch 1");
    await page.getByRole("button", { name: "Save expense" }).click();
    await page.waitForURL(/expense=added/, { waitUntil: "commit" });
    await page.getByText("Expense saved.").waitFor();
    t = await pnl();
    check("salary charged to the batch", /Salaries − ₱5,000/.test(t) && /When sold out ₱10,000/.test(t), t);
    const shares = (await page.locator('[aria-label="Profit split"] .kpi').allInnerTexts()).map((x) => x.replace(/\s+/g, " "));
    check("split 2/3 : 1/3 of net so far and when sold out", /OWNER -?₱?−?-?₱?11,533\.33/i.test(shares[0]) && /when sold out: ₱6,666\.67/.test(shares[0]) && /when sold out: ₱3,333\.33/.test(shares[1]), shares.join(" | "));
    await page.locator("#pnl").screenshot({ path: __dirname + "/shots/batch-pnl.png" });
    const log = (await (await fetch("http://127.0.0.1:54321/__log")).json()).log;
    check("expense saved to this batch", log.some((l) => l.rpc === "add_expense" && l.body.p.batch_id === B1 && l.body.p.amount_cents === 500000));
  } else {
    check("manager can't change the split", (await page.getByRole("button", { name: "Change split" }).count()) === 0);
  }

  await page.goto("http://127.0.0.1:3100/sales/pnl?view=batches");
  const rows = await page.locator(".table--dash tbody tr").allInnerTexts();
  check("P&L view lists every batch", rows.length === 2 && /Batch 1/.test(rows[0]) && /Stock before batches/.test(rows[1]), rows.map((x) => x.split("\n")[0]).join(" / "));
  check("P&L view shows Sales switch with P&L current", (await page.locator('.segmented a[href="/sales/pnl"][aria-current="page"]').count()) === 1);
  const kpis = (await page.locator('[aria-label="All batches"] .kpi').allInnerTexts()).map((x) => x.replace(/\s+/g, " "));
  check("totals across batches with the split", /NET SO FAR/i.test(kpis[0]) && /OWNER/i.test(kpis[1]) && /MANAGER/i.test(kpis[2]), kpis.join(" | "));
  await page.screenshot({ path: __dirname + `/shots/pnl-view-${ROLE}.png`, fullPage: true });
  await page.locator(".table--dash tbody tr").first().getByRole("link").click();
  await page.waitForURL(/\/restock\/batches\/bbbbbbbb.*#pnl/, { waitUntil: "commit" });
  check("tapping a batch opens its P&L", true);
  check("no page errors", errors.length === 0, errors.join("; "));
  console.log(r.join("\n"));
  await browser.close();
})();
