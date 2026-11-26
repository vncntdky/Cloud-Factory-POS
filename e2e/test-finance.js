// End-to-end: Sales → Finance (overview, P&L, cash flow, balance, batches). ROLE=owner|manager.
const { chromium } = require("playwright");
const b64url = (s) => Buffer.from(s).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = [b64url('{"alg":"HS256"}'), b64url(JSON.stringify({ sub: "aaaaaaaa-1111-4111-8111-000000000001", exp })), b64url("signature")].join(".");
const session = { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user: { id: "aaaaaaaa-1111-4111-8111-000000000001" } };
const B = "http://127.0.0.1:3100";
const DIR = __dirname;
const ROLE = process.env.ROLE || "owner";
const log = async () => (await (await fetch("http://127.0.0.1:54321/__log")).json()).log;
const txt = (s) => s.replace(/\s+/g, " ");
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const r = [];
  const check = (n, ok, x = "") => r.push(`${ok ? "ok  " : "FAIL"} ${ROLE}: ${n}${x ? ` (${x})` : ""}`);
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "light" });
  await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + b64url(JSON.stringify(session)), domain: "127.0.0.1", path: "/" }]);
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  page.on("pageerror", (e) => errors.push(e.message));
  const noScroll = async () => !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1));

  await page.goto(`${B}/sales`);
  await page.getByRole("link", { name: "Finance", exact: true }).click();
  await page.waitForURL(/\/sales\/pnl$/, { waitUntil: "commit" });
  await page.locator(".fin-wf").first().waitFor();
  const kpis = (await page.locator(".kpi").allInnerTexts()).map(txt);
  check("overview: safe to distribute = lower of profit kept and spare cash", /SAFE TO DISTRIBUTE ₱1,898/i.test(kpis[0]), kpis[0]);
  check("overview: what the register should hold today", /SHOULD BE IN THE REGISTER ₱1,586/i.test(kpis[1]), kpis[1]);
  check("overview: net sales, gross margin, net profit, closing cash",
    /₱9,600/.test(kpis[2]) && /50\.0%/.test(kpis[3]) && /₱3,572/.test(kpis[4]) && /37\.2%/.test(kpis[4]) && /₱2,186/.test(kpis[5]), kpis.slice(2).join(" | "));
  const reg = txt(await page.locator("#register").innerText());
  check("register card: cash in, less everything paid out; e-wallet money is not in it",
    /Cash sales and collections.*₱7,720/.test(reg) && /Paid for stock to suppliers from the company fund: goods and restocking costs \(₱5,194\)/.test(reg) && /Expenses \(₱940\)/.test(reg)
      && /Should be in the register ₱1,586/.test(reg) && /Received by GCash since opening · it went there, not into the drawer ₱600/.test(reg) && /All money drawer, e-wallets and bank · same as Closing cash ₱2,186/.test(reg)
      && /when you count the drawer, your count is/.test(reg) && /Higher by anything you paid by GCash or bank: stock, restock costs, an expense, a tax or a distribution/.test(reg)
      && /Higher by a starting float/.test(reg) && /Lower by cash taken out of the drawer/.test(reg) && /Lower by cash from the drawer paid to a supplier but not recorded yet/.test(reg)
      && /Lower by owner capital put in by GCash or bank/.test(reg), reg.slice(0, 520));
  check("overview: cash bridge has 8 bars", (await page.locator(".fin-wf rect").count()) === 8);
  check("overview: receivables by age name who owes", /RODS ₱960/.test(await page.locator("#ar-t").locator("xpath=../..").innerText()));
  check("overview: no sideways scroll", await noScroll());
  await page.screenshot({ path: `${DIR}/shots/fin-${ROLE}-overview.png`, fullPage: false });
  const dist = txt(await page.locator("#distributions").innerText());
  check("distributions card shows the reserves", /Tax reserve.*\(₱288\)/.test(dist) && /Spare cash ₱1,898/.test(dist), dist.slice(0, 220));
  if (ROLE === "owner") {
    await page.locator("#next-restock").scrollIntoViewIfNeeded();
    check("inventory reserve asks for a decision", (await page.getByText("How much should the business keep for the next restock?").count()) === 1);
    await page.fill("#sa-amount", "1000");
    check("reserve hint shows spare cash left", /Leaves ₱898 of spare cash/.test(await page.locator("#sa-amount-h").innerText()));
    await page.getByRole("button", { name: "Keep this amount" }).click();
    await page.waitForURL(/kept=1/, { waitUntil: "commit" });
    await page.getByText("Saved: the business keeps that for the next restock.").waitFor();
    const hero = txt(await page.locator(".kpi").first().innerText());
    check("keeping ₱1,000 lowers safe to distribute to ₱898", /₱898/.test(hero), hero);
    await page.getByRole("button", { name: "Record distribution" }).click();
    await page.fill("#rel-amount", "500");
    await page.locator("form[aria-label='Record distribution'] button[type=submit]").click();
    await page.waitForURL(/released=1/, { waitUntil: "commit" });
    await page.getByText("Distribution recorded.").waitFor();
    check("owner records a distribution", (await log()).some((l) => l.rpc === "release_profits" && l.body.p_amount_cents === 50000));
  } else {
    check("manager can't record distributions", (await page.getByRole("button", { name: "Record distribution" }).count()) === 0);
  }

  // Cash flow
  await page.locator(".fin-views").getByRole("link", { name: "Cash flow" }).click();
  await page.waitForURL(/view=cash/, { waitUntil: "commit" });
  await page.locator("#cf-t").waitFor();
  const cf = txt(await page.locator("#cf-t").locator("xpath=../..").innerText());
  check("cash flow: opening + money in − money out = closing", /Opening cash ₱0/.test(cf) && /Customer receipts ₱8,320/.test(cf) && /Paid for stock .*\(₱5,194\)/.test(cf) && /Stock paid with the owners' money or an investment \(₱4,800\) isn't cash/.test(cf) && /Closing cash ₱/.test(cf), cf.slice(0, 300));
  check("cash flow: no sideways scroll", await noScroll());
  await page.screenshot({ path: `${DIR}/shots/fin-${ROLE}-cash.png` });

  // Balance
  await page.locator(".fin-views").getByRole("link", { name: "Balance" }).click();
  await page.waitForURL(/view=balance/, { waitUntil: "commit" });
  await page.locator("#bs-t").waitFor();
  const bs = txt(await page.locator("#bs-t").locator("xpath=../..").innerText());
  const assets = /Total assets ₱([\d,]+)/.exec(bs)?.[1];
  const owed = /Owed \+ owners' share ₱([\d,]+)/.exec(bs)?.[1];
  check("balance: assets = owed + owners' share", !!assets && assets === owed, `${assets} vs ${owed}`);
  check("balance: inventory at landed cost", /Inventory at cost.*₱5,194/.test(bs), bs.slice(0, 200));
  await page.screenshot({ path: `${DIR}/shots/fin-${ROLE}-balance.png` });
  if (ROLE === "owner") {
    await page.getByRole("button", { name: "Record capital put in" }).click();
    await page.fill("#cap-amount", "5000");
    await page.fill("#cap-note", "Cash for December");
    await page.getByRole("button", { name: "Save capital" }).click();
    await page.waitForURL(/capital=added/, { waitUntil: "commit" });
    await page.getByText("Capital recorded.").waitFor();
    check("owner records capital put in", /₱5,000 put in/.test(await page.locator("#capital").innerText()));
  } else {
    check("manager can't record capital", (await page.getByRole("button", { name: "Record capital put in" }).count()) === 0);
  }

  // P&L
  await page.locator(".fin-views").getByRole("link", { name: "Profit & loss" }).click();
  await page.waitForURL(/view=pl/, { waitUntil: "commit" });
  await page.locator("#pl-t").waitFor();
  const pl = txt(await page.locator("#pl").innerText());
  check("P&L: net sales → COGS → gross profit → expenses → tax → net profit",
    /Net sales ₱9,600/.test(pl) && /Cost of goods sold.*\(₱4,800\)/.test(pl) && /Gross profit ₱4,800 50\.0%/.test(pl) && /Supplies \(₱300\)/.test(pl) && /Percentage tax \(3%, est\.\) \(₱288\)/.test(pl) && /Net profit ₱3,572 37\.2%/.test(pl), pl.slice(0, 400));
  await page.screenshot({ path: `${DIR}/shots/fin-${ROLE}-pl.png` });
  if (ROLE === "owner") {
    await page.getByRole("button", { name: "Change tax rate" }).click();
    await page.fill("#tax-rate", "0");
    await page.getByRole("button", { name: "Save rate" }).click();
    await page.waitForURL(/tax=saved/, { waitUntil: "commit" });
    check("owner changes the tax rate", (await log()).some((l) => l.rpc === "set_tax_rate" && l.body.p_bp === 0));
  }

  // Period
  await page.selectOption("select[aria-label=Period]", { label: "Nov 2026" });
  await page.waitForURL(/period=2026-11/, { waitUntil: "commit" });
  await page.locator("#pl-t").waitFor();
  await page.waitForTimeout(300);
  check("picking a month asks for that month", (await log()).filter((l) => l.rpc === "finance_report").at(-1)?.body.p_from === "2026-11-01");

  // Batches
  await page.locator(".fin-views").getByRole("link", { name: "Batches" }).click();
  await page.waitForURL(/view=batches/, { waitUntil: "commit" });
  await page.locator(".table--stack").waitFor();
  check("batches view: running net profit, and a full statement for every batch",
    (await page.locator(".table--stack tbody tr").count()) >= 1 && (await page.locator(".fin-batch").count()) === (await page.locator(".table--stack tbody tr").count()));
  const stmt = txt(await page.locator(".fin-batch").first().innerText());
  check(ROLE === "owner" ? "batches view: no tax line once the rate is 0%" : "batches view: tax estimate line at 3%",
    ROLE === "owner" ? !/Percentage tax/.test(stmt) && /Net profit so far ₱4,535/.test(stmt) : /Percentage tax \(3%, est\.\) \(₱408\)/.test(stmt), stmt.slice(0, 500));
  check("batches view: no sideways scroll", await noScroll());
  check("no page errors", errors.length === 0, errors.join("; "));
  check("no unhandled calls", !(await log()).some((l) => l.unhandled), JSON.stringify((await log()).filter((l) => l.unhandled)));

  // Desktop, dark
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 1500 }, deviceScaleFactor: 1, colorScheme: "dark" });
  await ctx2.addCookies([{ name: "sb-127-auth-token", value: "base64-" + b64url(JSON.stringify(session)), domain: "127.0.0.1", path: "/" }]);
  const p2 = await ctx2.newPage();
  await p2.goto(`${B}/sales/pnl`);
  await p2.locator(".fin-wf").first().waitFor();
  await p2.screenshot({ path: `${DIR}/shots/fin-${ROLE}-desk-dark.png` });
  await browser.close();
  console.log(r.join("\n"));
})().catch((e) => { console.error(e); process.exit(1); });
