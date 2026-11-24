// End-to-end: the owner's batch report (Sales → Finance → Report) against mock-restock.js with REPORT=1 (two
// batches), or REPORT=3 (three, the newest with nothing sold: All batches). Owner: the way in from Finance and from a batch's page, the picker (another batch, nothing to compare),
// tiles, both day-by-day charts with their readout (pointer and keys), bars drawn to scale, flavours, statement,
// next steps, a 360px phone and dark mode with no sideways scroll, the database asked for both batches.
// Managers and staff: no way in, and the page says it is for the owner. ROLE=owner|manager|cashier.
const { chromium } = require("playwright");
const b64url = (s) => Buffer.from(s).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = [b64url('{"alg":"HS256"}'), b64url(JSON.stringify({ sub: "aaaaaaaa-1111-4111-8111-000000000001", exp })), b64url("signature")].join(".");
const session = { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user: { id: "aaaaaaaa-1111-4111-8111-000000000001" } };
const B = "http://127.0.0.1:3100";
const ROLE = process.env.ROLE || "owner";
const B1 = "bbbbbbbb-0000-4000-8000-000000000001";
const B2 = "bbbbbbbb-0000-4000-8000-000000000002";
const B3 = "bbbbbbbb-0000-4000-8000-000000000003";

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const r = [];
  const check = (n, ok, x = "") => r.push(`${ok ? "ok  " : "FAIL"} ${ROLE}: ${n}${x ? ` (${x})` : ""}`);
  const errors = [];
  const cookie = { name: "sb-127-auth-token", value: "base64-" + b64url(JSON.stringify(session)), domain: "127.0.0.1", path: "/" };
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addCookies([cookie]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  const text = async () => (await page.locator("main").innerText()).replace(/\s+/g, " ");

  if (ROLE !== "owner") {
    await page.goto(`${B}/sales/pnl`);
    check("no Report chip on Finance", (await page.getByRole("link", { name: "Report", exact: true }).count()) === 0);
    await page.goto(`${B}/restock/batches/${B1}`);
    check("no Report button on a batch's page", (await page.getByRole("link", { name: /Batch 1 report/ }).count()) === 0);
    await page.goto(`${B}/sales/report`);
    check("the report page says it is for the owner", (await page.getByText("The batch report is for the owner.").count()) === 1);
    const log = (await (await fetch("http://127.0.0.1:54321/__log")).json()).log.filter((l) => l.rpc === "batch_report");
    check("the report data was never asked for", log.length === 0, JSON.stringify(log));
    check("no page errors", errors.length === 0, errors.join("; "));
    console.log(r.join("\n"));
    await browser.close();
    return;
  }

  if (process.env.REPORT === "3") {
    // Three batches, the newest just received with nothing sold: compare it with All batches.
    await page.goto(`${B}/sales/report`);
    await page.getByRole("heading", { name: "How fast it sold" }).waitFor();
    const batchSel = page.getByLabel("Batch", { exact: true });
    const vsSel = page.getByLabel("Compare with");
    check("it starts on the newest batch, compared with the one before", (await batchSel.inputValue()) === B3 && (await vsSel.inputValue()) === B2);
    check("a batch with nothing sold says so", /Batch 3 hasn't sold anything yet/.test(await text()));
    const options = await vsSel.locator("option").allInnerTexts();
    check("Compare with offers All batches", options.includes("All batches"), options.join(" / "));
    await vsSel.selectOption("all");
    await page.waitForURL(/vs=all/, { waitUntil: "commit" });
    await page.getByRole("heading", { name: "How fast it sold" }).waitFor();
    check("All batches stays picked", (await vsSel.inputValue()) === "all");
    const pace = page.locator(".rpt-lines").first();
    check("the charts draw a line for every batch", (await pace.locator("polyline.rpt-line").count()) === 3);
    const ends = await pace.locator(".rpt-endlabel").allTextContents();
    check("each line is named at its end", ["Batch 1", "Batch 2", "Batch 3"].every((t) => ends.includes(t)), ends.join(" / "));
    check("cost lines only for the batch reported and the one before", (await page.locator(".rpt-lines").nth(1).locator("line.rpt-level").count()) === 2);
    const head = await page.locator(".rpt-st thead th").allInnerTexts();
    check("the statement has a column per batch, oldest first", head.slice(1).join(",").toLowerCase() === "batch 1,batch 2,batch 3", head.join(" / "));
    const tile = await page.locator(".kpi").first().innerText();
    check("the tiles compare with the batch before", /Batch 2: /.test(tile) && !/Batch 1: /.test(tile), tile.replace(/\n/g, " | "));
    check("the header names every batch compared", /Compared with every other batch: Batch 2 and Batch 1/.test(await text()));
    const svg = pace.locator("svg");
    await svg.scrollIntoViewIfNeeded();
    const box = await svg.boundingBox();
    await page.mouse.move(box.x + box.width * 0.35, box.y + box.height / 2);
    const tip = await pace.locator(".chart__tip").innerText().catch(() => "");
    check("the readout lists every batch on that day", ["Batch 3", "Batch 2", "Batch 1"].every((t) => tip.includes(t)), tip.replace(/\n/g, " | "));
    check("no sideways scroll", !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    await page.screenshot({ path: `${__dirname}/shots/report-owner-all.png`, fullPage: true });
    // Another batch goes back to comparing with the one before it.
    await batchSel.selectOption(B2);
    await page.waitForURL(new RegExp(`batch=${B2}$`), { waitUntil: "commit" });
    await page.getByRole("heading", { name: "How fast it sold" }).waitFor();
    check("another batch starts compared with the one before it", (await vsSel.inputValue()) === B1);
    check("no page errors", errors.length === 0, errors.join("; "));
    console.log(r.join("\n"));
    await browser.close();
    return;
  }

  // The way in: Finance → Report.
  await page.goto(`${B}/sales/pnl`);
  await page.getByRole("link", { name: "Report", exact: true }).click();
  await page.waitForURL(/\/sales\/report$/, { waitUntil: "commit" });
  await page.getByRole("heading", { name: "How fast it sold" }).waitFor();
  check("Finance → Report opens the batch report", true);
  const batchSel = page.getByLabel("Batch", { exact: true });
  const vsSel = page.getByLabel("Compare with");
  check("it starts on the newest batch, compared with the one before", (await batchSel.inputValue()) === B2 && (await vsSel.inputValue()) === B1);
  const t1 = await text();
  check("the lead says what the batch made against the other", /Batch 2 has made ₱[\d,.]+ net profit so far, ₱[\d,.]+ (more|less) than Batch 1/.test(t1), t1.slice(0, 260));
  const tiles = await page.locator(".kpi").allInnerTexts();
  const labels = tiles.map((x) => x.split("\n")[0].trim().toLowerCase());
  check("tiles: net profit, margin, sales, pieces, pace, payback, owed, owner's and manager's shares",
    ["net profit so far", "net margin", "net sales", "pieces sold", "selling pace", "earned back its cost", "still owed"].every((l) => labels.includes(l))
      && labels.some((l) => l.startsWith("owner's share")) && labels.some((l) => l.startsWith("manager's share")), labels.join(" / "));
  check("each tile shows Batch 1 to compare", tiles.filter((x) => /Batch 1: /.test(x)).length >= 8);

  // Charts: both lines, the cost lines and the readout.
  const pace = page.locator(".rpt-lines").first();
  check("the pace chart draws a line per batch", (await pace.locator("polyline.rpt-line").count()) === 2);
  check("the payback chart draws each batch's cost in full", (await page.locator(".rpt-lines").nth(1).locator("line.rpt-level").count()) === 2);
  const svg = pace.locator("svg");
  await svg.scrollIntoViewIfNeeded();
  const box = await svg.boundingBox();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
  const tip = await pace.locator(".chart__tip").innerText().catch(() => "");
  check("pointing at the chart reads that day for both batches", /^Day \d+/.test(tip) && /Batch 2/.test(tip) && /Batch 1/.test(tip), tip.replace(/\n/g, " | "));
  await page.mouse.move(1, 1);
  await pace.locator(".rpt-lines__plot").focus();
  await page.keyboard.press("ArrowLeft");
  const keyTip = await pace.locator(".chart__tip").innerText().catch(() => "");
  check("the arrow keys read the days too", /^Day \d+/.test(keyTip), keyTip.replace(/\n/g, " | "));
  await page.keyboard.press("Escape");

  // Bars drawn to scale; a share shows inside only where it fits.
  const scale = await page.evaluate(() =>
    [...document.querySelectorAll(".rpt-bar")].map((bar) => {
      const parts = [...bar.querySelectorAll(".rpt-part")];
      const total = parts.reduce((n, p) => n + p.getBoundingClientRect().width, 0);
      const grow = parts.reduce((n, p) => n + Number(p.style.flexGrow), 0);
      return parts.every((p) => Math.abs(p.getBoundingClientRect().width / total - Number(p.style.flexGrow) / grow) < 0.02 || p.getBoundingClientRect().width <= 3)
        && parts.every((p) => { const l = p.querySelector(".rpt-part__label"); return !l || l.hidden || l.offsetWidth <= p.clientWidth; });
    }),
  );
  check("bar parts are drawn to scale and no share spills out of its part", scale.length === 4 && scale.every(Boolean), JSON.stringify(scale));
  await page.locator(".rpt-bar").first().click();
  const barTip = await page.locator(".rpt-bars__tip").first().innerText().catch(() => "");
  check("tapping a bar lists every part of it", /Cost of the pieces sold/.test(barTip) && /Net profit so far/.test(barTip), barTip.replace(/\n/g, " | "));

  const t2 = await text();
  check("flavours, statement and next steps are there",
    /Flavours: days until each sold out/.test(t2) && /Statement, side by side/.test(t2) && /What to do next/.test(t2) && /Collect the ₱[\d,.]+ still owed on Batch 2/.test(t2));
  const owed = await page.locator(".rpt-owed").first().innerText();
  check("who still owes is listed", /Ana Cruz/.test(owed), owed);
  check("flavour names drop what every product shares", (await page.locator(".rpt-fl__name").allInnerTexts()).every((n) => !/MAX Pods/.test(n)));
  check("no sideways scroll on a 390px phone", !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  const log = (await (await fetch("http://127.0.0.1:54321/__log")).json()).log.filter((l) => l.rpc === "batch_report");
  check("the database was asked for both batches", [B1, B2].every((id) => log.some((l) => l.body.p_batch === id)), JSON.stringify(log.map((l) => l.body)));
  await page.screenshot({ path: `${__dirname}/shots/report-owner.png`, fullPage: true });

  // Nothing to compare with.
  await vsSel.selectOption("none");
  await page.waitForURL(/vs=none/, { waitUntil: "commit" });
  await page.getByRole("heading", { name: "How fast it sold" }).waitFor();
  const t3 = await text();
  check("compare with Nothing: one batch, no comparison lines", !/Batch 1: /.test(t3) && (await page.locator(".rpt-lines").first().locator("polyline.rpt-line").count()) === 1);
  // The oldest batch has none before it.
  await batchSel.selectOption(B1);
  await page.waitForURL(new RegExp(`batch=${B1}`), { waitUntil: "commit" });
  await page.getByRole("heading", { name: "How fast it sold" }).waitFor();
  check("Batch 1 has nothing before it to compare with", (await vsSel.inputValue()) === "none" && /Batch 1 has made/.test(await text()));

  // From a batch's page.
  await page.goto(`${B}/restock/batches/${B2}`);
  await page.getByRole("link", { name: "Batch 2 report" }).click();
  await page.waitForURL(new RegExp(`/sales/report\\?batch=${B2}`), { waitUntil: "commit" });
  await page.getByRole("heading", { name: "How fast it sold" }).waitFor();
  check("a batch's page opens its report", (await batchSel.inputValue()) === B2);

  // A small phone, and dark mode.
  for (const [w, scheme] of [[360, "light"], [390, "dark"]]) {
    const c2 = await browser.newContext({ viewport: { width: w, height: 740 }, colorScheme: scheme });
    await c2.addCookies([cookie]);
    const p2 = await c2.newPage();
    p2.on("pageerror", (e) => errors.push(e.message));
    await p2.goto(`${B}/sales/report`);
    await p2.getByRole("heading", { name: "How fast it sold" }).waitFor();
    const extra = await p2.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(`no sideways scroll at ${w}px (${scheme})`, extra <= 1, String(extra));
    await p2.screenshot({ path: `${__dirname}/shots/report-owner-${w}-${scheme}.png`, fullPage: true });
    await c2.close();
  }

  check("no page errors", errors.length === 0, errors.join("; "));
  console.log(r.join("\n"));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
