// End-to-end: the owner edits money records — distribution, capital, expense, batch details, tax rate, split.
const { chromium } = require("playwright");
const b64url = (s) => Buffer.from(s).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = [b64url('{"alg":"HS256"}'), b64url(JSON.stringify({ sub: "aaaaaaaa-1111-4111-8111-000000000001", exp })), b64url("signature")].join(".");
const session = { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user: { id: "aaaaaaaa-1111-4111-8111-000000000001" } };
const B = "http://127.0.0.1:3100";
const DIR = __dirname;
const ROLE = process.env.ROLE || "owner";
const B1 = "bbbbbbbb-0000-4000-8000-000000000001";
const log = async () => (await (await fetch("http://127.0.0.1:54321/__log")).json()).log;
const last = async (rpc) => (await log()).filter((l) => l.rpc === rpc).at(-1)?.body;
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const r = [];
  const check = (n, ok, x = "") => r.push(`${ok ? "ok  " : "FAIL"} ${ROLE}: ${n}${x ? ` (${x})` : ""}`);
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + b64url(JSON.stringify(session)), domain: "127.0.0.1", path: "/" }]);
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  page.on("pageerror", (e) => errors.push(e.message));

  if (ROLE === "owner") {
    // Distribution: record, then edit
    await page.goto(`${B}/sales/pnl`);
    await page.getByRole("button", { name: "Record distribution" }).click();
    await page.fill("#rel-amount", "500");
    await page.locator("form[aria-label='Record distribution'] button[type=submit]").click();
    await page.waitForURL(/released=1/, { waitUntil: "commit" });
    await page.getByRole("button", { name: "Edit this distribution" }).click();
    const f = page.locator("form[aria-label='Edit distribution']");
    await f.locator("input[name=amount]").fill("800");
    check("edit shows the new split", /Owner gets ₱533\.33, manager ₱266\.67/.test(await f.locator(".field__hint").innerText()));
    await f.locator("input[name=released_on]").fill("2026-11-08");
    await f.locator("input[name=note]").fill("Week 1");
    await page.screenshot({ path: `${DIR}/shots/edit-release.png` });
    await f.getByRole("button", { name: "Save changes" }).click();
    await page.waitForURL(/released=edited/, { waitUntil: "commit" });
    await page.getByText("Distribution updated.").waitFor();
    const b = await last("update_fund_release");
    check("distribution edited: amount, date, note", b?.p_amount_cents === 80000 && b?.p_released_on === "2026-11-08" && b?.p_note === "Week 1", JSON.stringify(b));

    // Finance settings: tax rate and split
    await page.locator("#settings").scrollIntoViewIfNeeded();
    check("finance settings card shows tax rate and split", /3%/.test(await page.locator("#settings").innerText()) && /owner 2\/3, manager 1\/3/.test(await page.locator("#settings").innerText()));
    await page.locator("#settings").getByRole("button", { name: "Change tax rate" }).click();
    await page.fill("#tax-rate", "1.5");
    await page.screenshot({ path: `${DIR}/shots/edit-settings.png` });
    await page.getByRole("button", { name: "Save rate" }).click();
    await page.waitForURL(/tax=saved/, { waitUntil: "commit" });
    check("tax rate saved from the overview, back on the overview", (await last("set_tax_rate"))?.p_bp === 150 && !/view=pl/.test(page.url()), page.url());
    await page.locator("#settings").getByRole("button", { name: "Change split" }).click();
    await page.locator("#settings input[name=owner_parts]").fill("1");
    await page.locator("#settings input[name=manager_parts]").fill("1");
    await page.locator("#settings").getByRole("button", { name: /Save split/ }).click();
    await page.waitForURL(/split=saved/, { waitUntil: "commit" });
    check("split saved from the overview", (await last("set_profit_split"))?.p_owner_parts === 1);

    // Capital: add, then edit
    await page.goto(`${B}/sales/pnl?view=balance`);
    await page.getByRole("button", { name: "Record capital put in" }).click();
    await page.fill("#cap-amount", "5000");
    await page.getByRole("button", { name: "Save capital" }).click();
    await page.waitForURL(/capital=added/, { waitUntil: "commit" });
    await page.getByRole("button", { name: "Edit this capital entry" }).click();
    const c = page.locator("form[aria-label='Edit capital']");
    await c.locator("input[name=amount]").fill("6000");
    await c.locator("input[name=note]").fill("Corrected");
    await c.getByRole("button", { name: "Save changes" }).click();
    await page.waitForURL(/capital=edited/, { waitUntil: "commit" });
    await page.getByText("Capital entry updated.").waitFor();
    check("capital edited", (await last("update_capital"))?.p_amount_cents === 600000 && /₱6,000 put in/.test(await page.locator("#capital").innerText()));
  }

  // Expense: add then edit (owner and manager)
  await page.goto(`${B}/restock/expenses`);
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.selectOption("#exp-category", "rent");
  await page.fill("#exp-amount", "8000");
  await page.fill("#exp-note", "Nov rent");
  await page.getByRole("button", { name: "Save expense" }).click();
  await page.waitForURL(/expense=added/, { waitUntil: "commit" });
  await page.getByRole("button", { name: /Edit Nov rent expense/ }).click();
  const ef = page.locator("form[aria-label='Edit expense']");
  await ef.locator("select[name=category]").selectOption("fees");
  await ef.locator("input[name=amount]").fill("750");
  await ef.locator("select[name=batch_id]").selectOption(B1);
  await page.screenshot({ path: `${DIR}/shots/edit-expense.png` });
  await ef.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(/expense=edited/, { waitUntil: "commit" });
  await page.getByText("Expense updated.").waitFor();
  const eb = await last("update_expense");
  check("expense edited: type, amount, batch", eb?.p?.category === "fees" && eb?.p?.amount_cents === 75000 && eb?.p?.batch_id === B1, JSON.stringify(eb));

  // Batch details
  await page.goto(`${B}/restock/batches/${B1}`);
  await page.getByRole("button", { name: "Edit supplier, dates or note" }).click();
  await page.fill("#bd-supplier", "Vape Hub");
  await page.fill("#bd-note", "Receipt 1123");
  // The order day can't be after the arrival day.
  const arrived = await page.locator("#bd-date").inputValue();
  const after = new Date(Date.parse(arrived + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
  await page.fill("#bd-ordered", after);
  await page.locator("form[aria-label='Edit batch details']").getByRole("button", { name: "Save changes" }).click();
  await page.getByText(/can't arrive before it was ordered/).waitFor();
  check("an order day after the arrival day is refused, saying why", true);
  const before = new Date(Date.parse(arrived + "T00:00:00Z") - 3 * 86400000).toISOString().slice(0, 10);
  await page.fill("#bd-ordered", before);
  await page.locator("form[aria-label='Edit batch details']").getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(/details=saved/, { waitUntil: "commit" });
  await page.getByText("Batch details saved.").waitFor();
  check("batch details edited, with the day it was ordered", (await last("update_batch_details"))?.p?.supplier === "Vape Hub" && (await last("update_batch_details"))?.p?.ordered_on === before
    && /Vape Hub/.test(await page.locator("main").innerText()) && /ordered .*, 3 days to arrive/.test(await page.locator("main").innerText()));
  check("no sideways scroll", !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));

  if (ROLE === "manager") {
    await page.goto(`${B}/sales/pnl`);
    check("manager sees no finance settings or distribution edits", (await page.locator("#settings").count()) === 0 && (await page.getByRole("button", { name: "Edit this distribution" }).count()) === 0);
  }
  check("no page errors", errors.length === 0, errors.join("; "));
  check("no unhandled calls", !(await log()).some((l) => l.unhandled), JSON.stringify((await log()).filter((l) => l.unhandled)));
  await browser.close();
  console.log(r.join("\n"));
})().catch((e) => { console.error(e); process.exit(1); });
