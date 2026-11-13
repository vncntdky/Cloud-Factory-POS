
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
  const pnl = async () => (await page.locator("#pnl").innerText()).replace(/\s+/g, " ");

  await page.goto(`http://127.0.0.1:3100/restock/batches/${B1}`);
  let t = await pnl();
  check("batch statement: gross sales − discounts = net sales", /Gross sales 40 pcs sold ₱14,000/.test(t) && /Discounts \(₱400\)/.test(t) && /Net sales ₱13,600/.test(t), t);
  check("batch statement: cost of the pieces sold, then gross profit", /Cost of the pieces sold what you paid for the 40 pcs \(₱8,400\)/.test(t) && /Restocking fees the 40 pcs' share of shipping, tax, MOOE, other \(₱233\.33\)/.test(t) && /Gross profit ₱4,966\.67 36\.5%/.test(t), t);
  check("batch statement: count differences and tax, down to net profit so far", /Expenses none charged to this batch/.test(t) && /Stock count differences.*\(₱431\.67\)/.test(t) && /Percentage tax \(3%, est\.\) \(₱408\)/.test(t) && /Net profit so far ₱4,127 30\.3%/.test(t), t);
  check("projected when sold out", /78 pcs left, at today's prices ₱27,300/.test(t) && /What they cost goods \+ restocking fees \(₱16,835\)/.test(t) && /Net profit when sold out ₱13,773/.test(t), t);
  check("what the batch cost in full, and how much its sales cover", /Goods \(120 pcs\) ₱25,200/.test(t) && /Shipping ₱500/.test(t) && /Tax ₱120/.test(t) && /MOOE ₱80/.test(t) && /The whole batch, sold or not/.test(t) && /Batch cost ₱25,900/.test(t) && /Its sales so far paid or not ₱13,600/.test(t) && /Still to earn back ₱12,300/.test(t) && /Cost per piece, all in: ₱215\.83/.test(t), t);
  check("net profit so far KPI", (await page.locator(".kpi", { hasText: "Net profit so far" }).count()) === 1 && (await page.locator(".kpi--alert", { hasText: "Net profit so far" }).count()) === 0);
  if (ROLE === "owner") {
    await page.getByRole("button", { name: "Add expense" }).click();
    await page.fill("#exp-amount", "5000");
    await page.fill("#exp-note", "Cara, batch 1");
    await page.getByRole("button", { name: "Save expense" }).click();
    await page.waitForURL(/expense=added/, { waitUntil: "commit" });
    await page.getByText("Expense saved.").waitFor();
    t = await pnl();
    check("salary charged to the batch shows as its own line", /Salaries [^(]*Cara, batch 1 \(₱5,000\)/.test(t) && /Net profit so far \(₱873\)/.test(t) && /Net profit when sold out ₱8,773/.test(t) && /Expenses \(1\) ₱5,000/.test(t) && /Batch cost ₱30,900/.test(t), t);
    check("net profit so far KPI turns red at a loss", (await page.locator(".kpi--alert", { hasText: "Net profit so far" }).count()) === 1);
    const shares = (await page.locator('[aria-label="Profit split"] .kpi').allInnerTexts()).map((x) => x.replace(/\s+/g, " "));
    check("split 2/3 : 1/3 of net profit so far and when sold out", /OWNER −₱582/i.test(shares[0]) && /when sold out: ₱5,848\.67/.test(shares[0]) && /MANAGER −₱291/i.test(shares[1]) && /when sold out: ₱2,924\.33/.test(shares[1]), shares.join(" | "));
    await page.locator("#pnl").screenshot({ path: __dirname + "/shots/batch-pnl.png" });
    const log = (await (await fetch("http://127.0.0.1:54321/__log")).json()).log;
    check("expense saved to this batch", log.some((l) => l.rpc === "add_expense" && l.body.p.batch_id === B1 && l.body.p.amount_cents === 500000));
  } else {
    check("manager can't change the split", (await page.getByRole("button", { name: "Change split" }).count()) === 0);
  }

  await page.goto("http://127.0.0.1:3100/sales/pnl?view=batches");
  const rows = await page.locator(".table--stack tbody tr").allInnerTexts();
  check("running net profit lists every batch, oldest first", rows.length === 2 && /Stock before batches/.test(rows[0]) && /Batch 1/.test(rows[1]), rows.map((x) => x.split("\n")[0]).join(" / "));
  const run = rows.map((x) => x.replace(/\s+/g, " "));
  check("running total adds each batch's net profit so far", /23 \/ 30/.test(run[0]) && /₱8,050/.test(run[0]) && /₱2,978\.50.*₱2,978\.50/.test(run[0]) && (ROLE === "owner" ? /−₱873.*₱2,105\.50/.test(run[1]) : /₱4,127.*₱7,105\.50/.test(run[1])), run.join(" / "));
  const cards = await page.locator(".fin-batch").count();
  const first = (await page.locator(".fin-batch").first().innerText()).replace(/\s+/g, " ");
  check("every batch has its full statement, newest first", cards === 2 && /^Batch 1 · Cloud Supply/.test(first) && /Gross sales/.test(first) && /Discounts \(₱400\)/.test(first) && /Net profit so far/.test(first) && /What the batch cost in full/i.test(first) && /This batch's share before general expenses: owner/.test(first), first.slice(0, 200));
  const foot = (await page.locator(".table--stack tfoot").innerText()).replace(/\s+/g, " ");
  const head = (await page.locator('[aria-label="Whole shop"] .kpi').first().innerText()).replace(/\s+/g, " ");
  const shop = /Shop net profit so far (−?₱[\d,.]+)/.exec(foot)?.[1];
  check("the running total ends at the shop's net profit, the same figure as the tile above", !!shop && head.includes(shop) && /General expenses \(not in a batch\)/.test(foot), `${foot} | ${head}`);
  if (process.env.FIN === "batches") {
    check("batches tie out to Profit & loss: no 'Not in any batch' row", !/Not in any batch/.test(foot) && run[1].endsWith(shop), `${foot} | ${run[1]}`);
  } else {
    check("what Profit & loss counts outside the batches gets its own row", /Not in any batch/.test(foot), foot);
  }
  check("P&L view shows Sales switch with P&L current", (await page.locator('.segmented a[href="/sales/pnl"][aria-current="page"]').count()) === 1);
  const kpis = (await page.locator('[aria-label="Whole shop"] .kpi').allInnerTexts()).map((x) => x.replace(/\s+/g, " "));
  check("shop totals with the split", /SHOP NET PROFIT SO FAR/i.test(kpis[0]) && /when everything sells/.test(kpis[0]) && /OWNER/i.test(kpis[1]) && /MANAGER/i.test(kpis[2]), kpis.join(" | "));
  await page.screenshot({ path: __dirname + `/shots/pnl-view-${ROLE}.png`, fullPage: true });
  await page.locator(".table--stack tbody tr").nth(1).getByRole("link").click();
  await page.waitForURL(/view=batches#b-bbbbbbbb/, { waitUntil: "commit" });
  check("tapping a batch in the running total jumps to its statement", await page.locator("#b-bbbbbbbb-0000-4000-8000-000000000001").isVisible());
  check("no sideways scroll on the batches view", !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  await page.locator(".fin-batch").first().getByRole("link", { name: "Open batch" }).click();
  await page.waitForURL(/\/restock\/batches\/bbbbbbbb.*#pnl/, { waitUntil: "commit" });
  check("Open batch goes to the batch's own page", true);
  check("no page errors", errors.length === 0, errors.join("; "));
  console.log(r.join("\n"));
  await browser.close();
})();
