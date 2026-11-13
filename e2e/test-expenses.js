const { chromium } = require("playwright");
const b64url = (s) => Buffer.from(s).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = [b64url('{"alg":"HS256"}'), b64url(JSON.stringify({ sub: "aaaaaaaa-1111-4111-8111-000000000001", exp })), b64url("signature")].join(".");
const session = { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user: { id: "aaaaaaaa-1111-4111-8111-000000000001" } };
const B = "http://127.0.0.1:3100";
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const r = [];
  const check = (n, ok, x = "") => r.push(`${ok ? "ok  " : "FAIL"} ${n}${x ? ` (${x})` : ""}`);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + b64url(JSON.stringify(session)), domain: "127.0.0.1", path: "/" }]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const add = async (charge, category, amount, note) => {
    await page.getByRole("button", { name: "Add expense" }).click();
    await page.selectOption("#exp-batch", charge === "General" ? "" : { label: charge });
    await page.selectOption("#exp-category", category);
    await page.fill("#exp-amount", amount);
    await page.fill("#exp-note", note);
    await page.getByRole("button", { name: "Save expense" }).click();
  };

  // 1. From the Batches view
  await page.goto(`${B}/restock?view=batches`);
  check("Batches view has Reorder | Batches | Expenses", (await page.locator('.segmented a[href="/restock/expenses"]').count()) === 1);
  await add("Batch 1 · Cloud Supply", "other", "300", "Courier, Batch 1");
  await page.waitForURL(/view=batches&expense=added/, { waitUntil: "commit" });
  check("expense added from the Batches view", await page.getByText("Expense saved.").waitFor({ timeout: 10000 }).then(() => true, () => false));
  let log = (await (await fetch("http://127.0.0.1:54321/__log")).json()).log;
  check("it's charged to Batch 1", log.some((l) => l.rpc === "add_expense" && l.body.p.batch_id === "bbbbbbbb-0000-4000-8000-000000000001" && l.body.p.amount_cents === 30000));
  await page.screenshot({ path: __dirname + "/shots/exp-batches.png", fullPage: true });

  // 2. Expenses page: general expense, filter, list
  await page.goto(`${B}/restock/expenses`);
  await add("General", "rent", "8000", "November rent");
  await page.waitForURL(/\/restock\/expenses\?expense=added/, { waitUntil: "commit" });
  await page.getByText("Expense saved.").waitFor();
  let rows = await page.locator("ul.list > li").allInnerTexts();
  check("expenses page lists both, with where they're charged", rows.some((x) => /Rent/.test(x) && /General/.test(x) && /₱8,000/.test(x)) && rows.some((x) => /Other expenses/.test(x) && /Batch 1 · Cloud Supply/.test(x) && /₱300/.test(x)), rows.map((x) => x.replace(/\s+/g, " ")).join(" | "));
  check("total ₱8,300, general ₱8,000", /₱8,300/.test(await page.locator(".kpi").nth(0).innerText()) && /₱8,000/.test(await page.locator(".kpi").nth(2).innerText()));
  await page.selectOption("#exp-filter", "general");
  await page.waitForURL(/batch=general/, { waitUntil: "commit" });
  rows = await page.locator("ul.list > li").allInnerTexts();
  check("filter: General only", rows.length === 1 && /Rent/.test(rows[0]));
  await page.screenshot({ path: __dirname + "/shots/exp-page.png", fullPage: true });

  // 3. P&L view: general expenses come off the shop total; add from there
  await page.goto(`${B}/sales/pnl?view=batches`);
  let t = (await page.locator('section[aria-labelledby="pnl-exp-t"] .pnl').innerText()).replace(/\s+/g, " ");
  check("P&L view: each general expense is listed, then their total", /Rent [^(]*November rent ₱8,000 General expenses \(not in a batch\) \(₱8,000\)/.test(t), t);
  const foot = (await page.locator(".table--stack tfoot").innerText()).replace(/\s+/g, " ");
  const m = foot.match(/General expenses \(not in a batch\) −₱8,000 Not in any batch .* (−?₱[\d,.]+) Shop net profit so far (−?₱[\d,.]+)/);
  const num = (x) => Number(x.replace(/[₱,]/g, "").replace("−", "-"));
  check("running total: general expenses come off, down to the shop's net profit", !!m, foot);
  check("shop net profit is the Profit & loss figure", !!m && Math.abs(num(m[2]) - (3572 - 8000 - 300)) < 0.01, m ? m[2] : foot);
  check("totals show the shop's net profit so far", (await page.locator('[aria-label="Whole shop"] .kpi', { hasText: /Shop net profit so far/i }).count()) === 1);
  await add("General", "utilities", "1500", "Electricity");
  await page.waitForURL(/\/sales\/pnl\?view=batches&expense=added/, { waitUntil: "commit" });
  await page.getByText("Expense saved.").waitFor();
  t = (await page.locator('section[aria-labelledby="pnl-exp-t"] .pnl').innerText()).replace(/\s+/g, " ");
  check("expense added from the P&L view", /Utilities [^(]*Electricity ₱1,500/.test(t) && /General expenses \(not in a batch\) \(₱9,500\)/.test(t), t);
  await page.screenshot({ path: __dirname + "/shots/exp-pnl.png", fullPage: true });

  // 4. Remove from the Expenses page
  await page.goto(`${B}/restock/expenses`);
  await page.getByRole("button", { name: "Remove Electricity expense" }).click();
  await page.waitForURL(/expense=removed/, { waitUntil: "commit" });
  check("remove an expense", (await page.getByText("Electricity").count()) === 0);
  check("no page errors", errors.length === 0, errors.join("; "));
  console.log(r.join("\n"));
  await browser.close();
})();
