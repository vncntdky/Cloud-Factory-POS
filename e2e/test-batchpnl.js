
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
  const cookie = { name: "sb-127-auth-token", value: "base64-" + b64url(JSON.stringify(session)), domain: "127.0.0.1", path: "/" };
  await ctx.addCookies([cookie]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const pnl = async () => (await page.locator("#pnl").innerText()).replace(/\s+/g, " ");

  // SOLDOUT=1 (mock and suite): the stock from before batches is all sold. Its card starts folded and
  // its shares are "of net profit so far": selling out adds nothing more.
  if (process.env.SOLDOUT) {
    await page.goto("http://127.0.0.1:3100/sales/pnl?view=batches");
    const row = (await page.locator(".table--stack tbody tr").first().innerText()).replace(/\s+/g, " ");
    check("a sold-out batch in the running net profit, with its shares", /^Stock before batches/.test(row) && /30 \/ 30 ₱10,500 ₱3,885 ₱2,590 ₱1,295 ₱3,885$/.test(row), row);
    const card = page.locator("#b-before");
    check("a sold-out batch starts folded; one still selling starts open", !(await card.evaluate((d) => d.open)) && (await page.locator(".fin-batch").first().evaluate((d) => d.open)));
    await card.locator("summary").click();
    const sold = (await card.locator('[aria-label="Profit split"] .kpi').allInnerTexts()).map((x) => x.replace(/\s+/g, " "));
    check("a sold-out batch's shares are of its net profit so far, with no 'when sold out'", sold.length === 2 && /OWNER ₱2,590 of net profit so far/i.test(sold[0]) && /MANAGER ₱1,295 of net profit so far/i.test(sold[1]) && !/when sold out/i.test(sold.join(" ")), sold.join(" | "));
    check("no page errors", errors.length === 0, errors.join("; "));
    console.log(r.join("\n"));
    await browser.close();
    return;
  }

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
  check("running net profit adds each batch's net profit so far", /23 \/ 30/.test(run[0]) && /₱8,050/.test(run[0]) && /₱2,978\.50.*₱2,978\.50/.test(run[0]) && (ROLE === "owner" ? /−₱873.*₱2,105\.50/.test(run[1]) : /₱4,127.*₱7,105\.50/.test(run[1])), run.join(" / "));
  const cards = await page.locator(".fin-batch").count();
  const first = (await page.locator(".fin-batch").first().innerText()).replace(/\s+/g, " ");
  check("every batch has its full statement, newest first", cards === 2 && /^Batch 1 · Cloud Supply/.test(first) && /Gross sales/.test(first) && /Discounts \(₱400\)/.test(first) && /Net profit so far/.test(first) && /What the batch cost in full/i.test(first) && /This batch's share before general expenses/.test(first), first.slice(0, 200));
  // The owner / manager split on each batch: in the running net profit and under its statement.
  check("running net profit shows each batch's owner and manager share", /₱2,978\.50 ₱1,985\.67 ₱992\.83 ₱2,978\.50/.test(run[0]) && (ROLE === "owner" ? /−₱873 −₱582 −₱291 ₱2,105\.50/.test(run[1]) : /₱4,127 ₱2,751\.33 ₱1,375\.67 ₱7,105\.50/.test(run[1])), run.join(" / "));
  const tiles = (await page.locator(".fin-batch").first().locator('[aria-label="Profit split"] .kpi').allInnerTexts()).map((x) => x.replace(/\s+/g, " "));
  check("each batch's statement ends with the owner / manager split, now and when sold out",
    (await page.locator('.fin-batch [aria-label="Profit split"]').count()) === cards && /Split · owner 2\/3, manager 1\/3/i.test(first) && tiles.length === 2
      && (ROLE === "owner"
        ? /OWNER −₱582 when sold out: ₱5,848\.67/i.test(tiles[0]) && /MANAGER −₱291 when sold out: ₱2,924\.33/i.test(tiles[1])
        : /OWNER ₱2,751\.33 when sold out: ₱9,182/i.test(tiles[0]) && /MANAGER ₱1,375\.67 when sold out: ₱4,591/i.test(tiles[1])), tiles.join(" | "));
  check("a batch at a loss says why its shares are negative; a batch in profit doesn't", ROLE === "owner" ? /negative while the batch is at a loss/.test(first) : !/negative while/.test(first), first.slice(-240));
  const second = (await page.locator(".fin-batch").nth(1).locator('[aria-label="Profit split"] .kpi').allInnerTexts()).map((x) => x.replace(/\s+/g, " "));
  check("the second batch's statement has its own split too", /OWNER ₱1,985\.67 when sold out: ₱2,590/i.test(second[0]) && /MANAGER ₱992\.83 when sold out: ₱1,295/i.test(second[1]), second.join(" | "));
  // On a phone each row is a card: the two shares are lines of it, named by their data-label.
  const line = async (label) => {
    const td = page.locator(`.table--stack tbody tr:first-child td[data-label="${label}"]`);
    return { text: (await td.innerText()).trim(), label: await td.evaluate((el) => getComputedStyle(el, "::before").content) };
  };
  const [own, man, tot] = [await line("Owner (2/3)"), await line("Manager (1/3)"), await line("Running net profit")];
  check("on a phone each share is a labelled line of the batch's card", own.text === "₱1,985.67" && own.label.includes("Owner (2/3)") && man.text === "₱992.83" && man.label.includes("Manager (1/3)") && tot.text === "₱2,978.50", JSON.stringify([own, man, tot]));
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
  // Other screen sizes. Seven columns don't fit beside the menu on a tablet or a small laptop, so until
  // 1280px each batch stays a card; from there it is a table. Nothing may scroll sideways at any size,
  // now or when the amounts reach six figures.
  const at = async (width, fn) => {
    const c = await browser.newContext({ viewport: { width, height: 1024 } });
    await c.addCookies([cookie]);
    const p = await c.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto("http://127.0.0.1:3100/sales/pnl?view=batches");
    // The checks below rewrite cells: wait until React has taken over the page, or it reports a mismatch.
    await p.waitForFunction(() => {
      const td = document.querySelector(".fin-run td");
      return !!td && Object.keys(td).some((k) => k.startsWith("__reactFiber"));
    });
    const out = await fn(p);
    await c.close();
    return out;
  };
  const measure = () => {
    const wrap = document.querySelector(".fin-run");
    const td = wrap.querySelector('tbody tr td[data-label^="Owner"]');
    return {
      table: wrap.scrollWidth - wrap.clientWidth,
      page: document.documentElement.scrollWidth - innerWidth,
      heads: [...wrap.querySelectorAll("thead th")].map((th) => th.textContent.trim()).join(" | "),
      cell: getComputedStyle(td).display,
      label: getComputedStyle(td, "::before").content,
    };
  };
  const grow = (amount) => {
    for (const tr of document.querySelectorAll(".fin-run tbody tr")) {
      const tds = tr.querySelectorAll("td");
      tds[1].textContent = "1,200 / 1,200";
      for (let i = 2; i < tds.length; i++) tds[i].textContent = amount;
    }
    for (const v of document.querySelectorAll(".fin-run tfoot td:last-child, .pnl-split .kpi__value")) v.textContent = amount;
  };
  // How far the widest share pokes out of its tile (0 or less = inside).
  const tileOverflow = () =>
    Math.max(
      ...[...document.querySelectorAll(".pnl-split .kpi")]
        .filter((k) => k.getBoundingClientRect().width > 0)
        .map((k) => {
          const text = document.createRange();
          text.selectNodeContents(k.querySelector(".kpi__value"));
          return Math.round(text.getBoundingClientRect().right - (k.getBoundingClientRect().right - parseFloat(getComputedStyle(k).paddingRight)));
        }),
    );
  const both = async (p, amount) => {
    const now = await p.evaluate(measure);
    await p.evaluate(grow, amount);
    return { now, big: await p.evaluate(measure), tiles: await p.evaluate(tileOverflow) };
  };
  const small = await at(360, (p) => both(p, "−₱12,345.67"));
  check("on a small phone nothing scrolls sideways and a five-figure share stays inside its tile", small.now.page <= 1 && small.big.page <= 1 && small.tiles <= 0, JSON.stringify(small));
  const tablet = await at(768, (p) => both(p, "−₱123,456.78"));
  check("on a tablet each batch stays a card with labelled owner and manager lines; nothing scrolls sideways, even with six-figure amounts",
    tablet.now.cell === "flex" && tablet.now.label.includes("Owner (2/3)") && [tablet.now, tablet.big].every((m) => m.page <= 1 && m.table <= 1) && tablet.tiles <= 0, JSON.stringify(tablet));
  const laptop = await at(1279, (p) => both(p, "−₱123,456.78"));
  check("the same just under 1280px", laptop.now.cell === "flex" && [laptop.now, laptop.big].every((m) => m.page <= 1 && m.table <= 1), JSON.stringify(laptop));
  const desk = await at(1280, (p) => both(p, "−₱123,456.78"));
  check("on a wide screen the running net profit is a seven-column table that fits, even with six-figure amounts",
    desk.now.cell === "table-cell" && /^Batch \| Sold \| Net sales \| Net profit so far \| Owner \(2\/3\) \| Manager \(1\/3\) \| Running net profit$/.test(desk.now.heads) && [desk.now, desk.big].every((m) => m.page <= 1 && m.table <= 1), JSON.stringify(desk));
  if (ROLE === "owner") {
    // Last, because it changes the setting: every batch's columns, labels and tiles follow the split.
    await page.goto("http://127.0.0.1:3100/sales/pnl?view=batches");
    await page.getByRole("button", { name: "Change split" }).click();
    await page.fill("#split-owner", "1");
    await page.fill("#split-manager", "1");
    await page.getByRole("button", { name: /Save split/ }).click();
    await page.waitForURL(/split=saved/, { waitUntil: "commit" });
    await page.getByText("Profit split saved.").waitFor();
    const even = (await page.locator(".table--stack tbody tr").allInnerTexts()).map((x) => x.replace(/\s+/g, " "));
    const card = (await page.locator(".fin-batch").first().innerText()).replace(/\s+/g, " ");
    check("after the owner changes the split to 1 : 1, each batch's shares and labels follow",
      /₱2,978\.50 ₱1,489\.25 ₱1,489\.25 ₱2,978\.50$/.test(even[0]) && /−₱873 −₱436\.50 −₱436\.50 ₱2,105\.50$/.test(even[1])
        && (await page.locator('.table--stack tbody tr:first-child td[data-label="Owner (1/2)"]').count()) === 1
        && (await page.locator('.table--stack tbody tr:first-child td[data-label="Manager (1/2)"]').count()) === 1
        && /Split · owner 1\/2, manager 1\/2/i.test(card) && /OWNER −₱436\.50 when sold out: ₱4,386\.50 MANAGER −₱436\.50 when sold out: ₱4,386\.50/i.test(card), `${even.join(" / ")} | ${card.slice(-330)}`);
  }
  check("no page errors", errors.length === 0, errors.join("; "));
  console.log(r.join("\n"));
  await browser.close();
})();
