// End-to-end: Inventory → Import CSV (owners and managers): the template, a file with rows to fix, a good file
// (semicolons, Excel's byte-order mark, a quoted comma), adding, files as people make them (Windows Excel's
// encoding, P340, comma decimals in semicolon files, extra spaces, Excel barcodes, a product not for sale), a
// change between the check and Add, no connection, and staff kept out. ROLE=owner|manager|cashier.
const { chromium } = require("playwright");
const b64url = (s) => Buffer.from(s).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = [b64url('{"alg":"HS256"}'), b64url(JSON.stringify({ sub: "aaaaaaaa-1111-4111-8111-000000000001", exp })), b64url("signature")].join(".");
const session = { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user: { id: "aaaaaaaa-1111-4111-8111-000000000001" } };
const B = "http://127.0.0.1:3100";
const ROLE = process.env.ROLE || "owner";
const HEADER = "Category,Brand,Product,Flavour / variant,Barcode,Selling price,Cost per piece,Low-stock alert at,For sale";

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
  const upload = (name, text) =>
    page.locator('[data-testid="csv-input"]').setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(text, "utf8") });

  if (ROLE === "cashier") {
    await page.goto(`${B}/inventory`);
    check("staff see no Import button", (await page.getByRole("link", { name: /Import products from a CSV file/ }).count()) === 0);
    await page.goto(`${B}/inventory/import`);
    check("staff can't open the import page", (await page.getByText("Importing products is for owners and managers.").count()) === 1);
    check("no page errors", errors.length === 0, errors.join("; "));
    console.log(r.join("\n"));
    await browser.close();
    return;
  }

  // The way in: Inventory's top bar, on a narrow phone too.
  await page.goto(`${B}/inventory`);
  await page.getByRole("link", { name: /Import products from a CSV file/ }).click();
  await page.waitForURL(/\/inventory\/import$/, { waitUntil: "commit" });
  await page.getByRole("heading", { name: "1. Get the template" }).waitFor();
  check("Inventory → Import opens the import page", true);

  // The template: downloadable, with the columns the importer reads and two example rows.
  const tplHref = await page.getByRole("link", { name: "Download template" }).getAttribute("href");
  const tpl = await page.evaluate(async (u) => (await fetch(u)).text(), tplHref);
  const lines = tpl.trim().split(/\r?\n/);
  check("template: the import columns, then two Example rows", lines[0] === HEADER && lines.length === 3 && lines.slice(1).every((l) => l.startsWith("Example,")) && lines[1].startsWith("Example,BLXCK Signature,Mango,"), lines.join(" / "));

  // A file with something to fix: nothing can be added.
  await upload("first.csv", [HEADER, "Example,Example,Signature 88000,Mango,,340,165,5,yes", "Pods,XBLACK,MAX Pods,Mint,,350,210,5,yes",
    "BLXCK Signature 88000,BLXCK Signature,Signature 88000,Melon,,340,165,5,yes", "BLXCK Signature 88000,BLXCK Signature,Signature 88000,Yakult,,,165,5,yes"].join("\n"));
  await page.getByTestId("imp-summary").waitFor();
  const sum1 = (await page.getByTestId("imp-summary").innerText()).trim();
  check("preview: new, already in the app, example and a row to fix", sum1 === "1 new product · 1 already in the app (skipped) · 1 example row (skipped) · 1 row to fix", sum1);
  const fix = (await page.locator('li[data-status="error"]').innerText()).replace(/\s+/g, " ");
  check("the row to fix says what to fix, with its row number", /Row 5/.test(fix) && /Enter the selling price in pesos/.test(fix) && /Fix this/.test(fix), fix);
  check("Add is off while a row needs fixing", await page.getByRole("button", { name: /Add 1 product/ }).isDisabled());
  check("no sideways scroll on the import page", !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  await page.screenshot({ path: `${__dirname}/shots/import-${ROLE}-fix.png`, fullPage: true });

  // A file without the columns the importer needs.
  await upload("wrong.csv", "Name of thing,Cost\nPod,100\n");
  await page.getByText("The file needs a Product column and a Selling price column.").waitFor();
  check("a file without Product and Selling price columns is explained", true);

  // A good file: semicolons, a byte-order mark, a quoted comma, a product already in the app.
  const good = "﻿" + [HEADER.replace(/,/g, ";"), 'BLXCK Signature 88000;BLXCK Signature;Signature 88000;Melon;;₱340;165;5;yes',
    'BLXCK Signature 88000;"Cloud, Co";Signature 88000;"Mix Berries";BX-88;1,250.50;600;3;no', "TRANSPARENT V2 PODS;XBLACK;MAX Pods;Mint;;350;210;5;yes"].join("\r\n");
  await upload("good.csv", good);
  await page.getByRole("button", { name: "Add 2 products" }).waitFor();
  const sum2 = (await page.getByTestId("imp-summary").innerText()).trim();
  const rows2 = (await page.locator(".imp-rows li").allInnerTexts()).map((x) => x.replace(/\s+/g, " "));
  check("semicolons, quotes and Excel's byte-order mark are read", sum2 === "2 new products · 1 already in the app (skipped)" && /Cloud, Co Signature 88000 · Mix Berries/.test(rows2[1]) && /₱1,250\.50/.test(rows2[1]), `${sum2} | ${rows2.join(" / ")}`);
  await page.getByRole("button", { name: "Add 2 products" }).click();
  await page.waitForURL(/\/inventory\?imported=2$/, { waitUntil: "commit" });
  await page.getByText("2 products added from your file.").waitFor();
  check("adding opens Inventory with a notice", true);
  const log = (await (await fetch("http://127.0.0.1:54321/__log")).json()).log.filter((l) => l.rpc === "import_products");
  const last = log.at(-1)?.body;
  check("the database was asked to check first, then to add", log.length >= 3 && log.some((l) => l.body.p_commit === false) && last?.p_commit === true && last.p_rows.length === 3
    && last.p_rows[1].brand === "Cloud, Co" && last.p_rows[1].price === "1,250.50" && last.p_rows[1].for_sale === "no" && last.p_rows[0].row_no === 2,
    JSON.stringify(last?.p_rows?.[1]));
  const cats = (await page.locator("details.cat summary").allInnerTexts()).map((x) => x.replace(/\s+/g, " "));
  check("the new category shows in Inventory", cats.some((c) => /^BLXCK Signature 88000 1 product/i.test(c)), cats.join(" / "));
  await page.goto(`${B}/inventory?q=Melon`);
  const forSale = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  // "For sale: no" in the file: the product is in, under Not for sale.
  await page.goto(`${B}/inventory?f=hidden&q=Mix%20Berries`);
  const hidden = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  check("the new products are in Inventory; For sale: no puts one under Not for sale",
    /BLXCK Signature Signature 88000/.test(forSale) && /Melon/.test(forSale) && /Cloud, Co Signature 88000/.test(hidden) && /Mix Berries/.test(hidden),
    `${forSale.slice(0, 160)} | ${hidden.slice(0, 160)}`);

  // Files as people make them.
  await page.goto(`${B}/inventory/import`);
  await page.getByRole("heading", { name: "1. Get the template" }).waitFor();
  check("the Barcode hint says to set the column to Text in Excel", (await page.getByText("In Excel, set this column to Text first").count()) === 1);
  const summaryIs = (text) => page.waitForFunction((t) => document.querySelector('[data-testid="imp-summary"]')?.textContent.trim() === t, text, { timeout: 10000 });
  // Excel's plain "CSV (Comma delimited)" on Windows saves in Windows-1252: ñ must survive. P340 is ₱340.
  const ansi = Buffer.from([HEADER, "Pods,XBLACK,MAX Pods,Piña Colada,,P340,165,5,yes"].join("\r\n"), "latin1");
  await page.locator('[data-testid="csv-input"]').setInputFiles({ name: "ansi.csv", mimeType: "text/csv", buffer: ansi });
  await summaryIs("1 new product");
  const ansiRow = (await page.locator(".imp-rows li").first().innerText()).replace(/\s+/g, " ");
  check("a Windows Excel (ANSI) file keeps ñ, and P340 reads as ₱340", /Piña Colada/.test(ansiRow) && /₱340/.test(ansiRow) && !/�/.test(ansiRow), ansiRow);
  check("screen readers are told the result", (await page.locator('p.sr-only[role="status"]').textContent()).trim() === "1 new product");
  // Semicolons with a comma decimal, a product that's in the app but not for sale, extra spaces, an Excel barcode.
  await upload("semi.csv", [HEADER.replace(/,/g, ";"), "BLXCK Signature 88000;BLXCK Signature;Signature 88000;Grapes;;340,50;165;5;yes",
    'BLXCK Signature 88000;"Cloud, Co";Signature 88000;Mix Berries;;340;165;5;yes', "Pods;XBLACK;MAX  Pods;Mint;;350;210;5;yes",
    "BLXCK Signature 88000;BLXCK Signature;Signature 88000;Banana;4.8E+12;340;165;5;yes"].join("\n"));
  await summaryIs("1 new product · 2 already in the app (skipped) · 1 row to fix");
  const semiRows = (await page.locator(".imp-rows li").allInnerTexts()).map((x) => x.replace(/\s+/g, " "));
  check("a comma decimal in a semicolon file is pesos and centavos", /Grapes/.test(semiRows[0]) && /₱340\.50/.test(semiRows[0]), semiRows[0]);
  check("a product in the app but not for sale says so", /not for sale\. Turn on For sale on its product page/.test(semiRows[1]) && /Already in the app/.test(semiRows[1]), semiRows[1]);
  check("extra spaces still match the product in the app", /Already in the app/.test(semiRows[2]), semiRows[2]);
  check("a barcode Excel changed says how to keep it", /Excel changed this barcode to 4\.8E\+12\. Set the Barcode column to Text/.test(semiRows[3]) && /Fix this/.test(semiRows[3]), semiRows[3]);
  // Another phone takes a barcode between the check and Add: the error comes back and the row is marked.
  await upload("race.csv", [HEADER, "BLXCK Signature 88000,BLXCK Signature,Signature 88000,Yakult,RACE-1,340,165,5,yes"].join("\n"));
  await page.getByRole("button", { name: "Add 1 product" }).click();
  await page.getByText("Nothing was added: 1 row needs fixing (marked Fix this).").waitFor();
  await summaryIs("0 new products · 1 row to fix");
  const raceRow = (await page.locator(".imp-rows li").first().innerText()).replace(/\s+/g, " ");
  check("a change between the check and Add marks the row and keeps Add off",
    /Another product already has barcode RACE-1/.test(raceRow) && /Fix this/.test(raceRow) && (await page.getByRole("button", { name: "Nothing new to add" }).isDisabled()), raceRow);
  // No connection when tapping Add: a message, not a crash, and the file stays.
  await upload("offline.csv", [HEADER, "BLXCK Signature 88000,BLXCK Signature,Signature 88000,Watermelon,,340,165,5,yes"].join("\n"));
  await page.getByRole("button", { name: "Add 1 product" }).waitFor();
  await page.route("**/inventory/import", (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));
  await page.getByRole("button", { name: "Add 1 product" }).click();
  await page.getByText("Couldn't reach the server. Check your connection and try again.").waitFor();
  check("no connection when adding shows a message and keeps the file", /\/inventory\/import$/.test(page.url()) && (await page.getByRole("button", { name: "Add 1 product" }).count()) === 1);
  await page.unroute("**/inventory/import");

  // The top bar's two buttons fit on a small phone.
  const small = await browser.newContext({ viewport: { width: 360, height: 740 } });
  await small.addCookies([cookie]);
  const sp = await small.newPage();
  await sp.goto(`${B}/inventory`);
  const fit = await sp.evaluate(() => {
    const bar = document.querySelector(".topbar");
    const acts = [...bar.querySelectorAll(".topbar__actions a")].map((a) => a.getBoundingClientRect());
    const title = bar.querySelector(".topbar__title");
    return { page: document.documentElement.scrollWidth - innerWidth, right: Math.max(...acts.map((a) => a.right)), width: innerWidth, n: acts.length,
      titleCut: title.scrollWidth > title.clientWidth + 1 };
  });
  check("on a 360px phone the Import and Add buttons fit and the title isn't cut off", fit.n === 2 && fit.page <= 1 && fit.right <= fit.width && !fit.titleCut, JSON.stringify(fit));
  check("the shortened Add button still reads as Add product", (await sp.getByRole("link", { name: "Add product", exact: true }).count()) === 1);
  await sp.screenshot({ path: `${__dirname}/shots/import-${ROLE}-topbar-360.png` });
  await small.close();

  check("no page errors", errors.length === 0, errors.join("; "));
  console.log(r.join("\n"));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
