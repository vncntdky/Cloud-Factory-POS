const { chromium } = require("playwright");
const b64url = (s) => Buffer.from(s).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = [b64url('{"alg":"HS256"}'), b64url(JSON.stringify({ sub: "aaaaaaaa-1111-4111-8111-000000000001", exp })), b64url("signature")].join(".");
const session = { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user: { id: "aaaaaaaa-1111-4111-8111-000000000001" } };
const B = "http://127.0.0.1:3100";
const MINT = "00000000-0000-4000-8000-000000000010";
const log = async () => (await (await fetch("http://127.0.0.1:54321/__log")).json()).log;
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const r = [];
  const check = (n, ok, x = "") => { const line = `${ok ? "ok  " : "FAIL"} ${n}${x ? ` (${x})` : ""}`; r.push(line); console.log(line); };
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + b64url(JSON.stringify(session)), domain: "127.0.0.1", path: "/" }]);
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // ── Reservations
  await page.goto(`${B}/inventory/${MINT}`);
  await page.locator("#res-t").waitFor();
  check("product page has a Reserved card, 4 free", /4 free to sell/.test(await page.locator("#reservations .card__head").innerText()));
  await page.locator("#reservations").getByRole("button", { name: "Reserve" }).click();
  await page.fill("#res-name", "Juan");
  await page.fill("#res-qty", "3");
  await page.locator("#reservations form[aria-label='Reserve']").getByRole("button", { name: "Reserve" }).click();
  await page.waitForURL(/reserved=1/, { waitUntil: "commit" });
  await page.getByText("Reserved.", { exact: true }).waitFor();
  const card = await page.locator("#reservations").innerText();
  check("reservation listed, 1 free left", /Juan/.test(card) && /3 pcs/.test(card) && /3 held · 1 free to sell/.test(card), card.replace(/\s+/g, " ").slice(0, 120));
  await page.locator("#reservations").getByRole("button", { name: "Reserve" }).click();
  await page.fill("#res-name", "Ana");
  await page.fill("#res-qty", "2");
  await page.locator("#reservations form[aria-label='Reserve']").getByRole("button", { name: "Reserve" }).click();
  await page.getByText("Only 1 left to reserve").waitFor();
  check("can't reserve more than is free", true);
  await page.screenshot({ path: __dirname + "/shots/reserve.png", fullPage: true });

  await page.goto(`${B}/inventory?f=reserved`);
  const rows = await page.locator(".list-row").allInnerTexts();
  check("Inventory → Reserved shows it", rows.length === 1 && /3 reserved \(Juan\)/.test(rows[0]), rows.map((x) => x.replace(/\s+/g, " ")).join(" | "));

  await page.goto(`${B}/`);
  const tile = await page.locator("button.product-tile", { hasText: "Mint" }).innerText();
  check("register: Mint shows 1 left", /1 left/.test(tile), tile.replace(/\s+/g, " "));
  await page.locator("button.product-tile", { hasText: "Mint" }).click();
  check("register: adding the free piece works", /1/.test(await page.locator("button.product-tile", { hasText: "Mint" }).getAttribute("data-qty")));

  await page.goto(`${B}/inventory/${MINT}`);
  await page.locator("#reservations").getByRole("link", { name: "Sell" }).click();
  await page.waitForURL(/\/\?reservation=/, { waitUntil: "commit" });
  await page.getByText(/Selling Juan's reservation/).waitFor();
  check("Sell opens the register with the reservation in the cart", (await page.locator("button.product-tile", { hasText: "Mint" }).getAttribute("data-qty")) === "3");
  await page.screenshot({ path: __dirname + "/shots/reserve-sell.png" });
  await page.getByRole("button", { name: /^Charge/ }).first().click();
  check("buyer name filled in", (await page.locator("#co-buyer").inputValue()) === "Juan");
  await page.locator(".age-check input").check();
  await page.locator("dialog[open] button.btn--money.btn--block").click();
  await page.waitForTimeout(1500);
  const closed = (await log()).find((l) => l.rpc === "close_reservation" && l.body.p_sale);
  check("charging closes the reservation with the sale", closed && closed.body.p_sale === "55555555-0000-4000-8000-0000000000aa");

  // ── Owner distributions (Finance)
  await page.goto(`${B}/sales/pnl`);
  await page.locator("#distributions").waitFor();
  await page.getByRole("button", { name: "Record distribution" }).click();
  await page.fill("#rel-amount", "300");
  check("distribution preview splits 2 : 1", /Owner gets ₱200, manager ₱100/.test(await page.locator("form[aria-label='Record distribution'] .field__hint").first().innerText()));
  await page.fill("#rel-note", "Batch 1 profit");
  await page.locator("form[aria-label='Record distribution'] button[type=submit]").click();
  await page.waitForURL(/released=1/, { waitUntil: "commit" });
  await page.getByText("Distribution recorded.").waitFor();
  check("distribution recorded and listed", /₱300/.test(await page.locator("#distributions").innerText()) && /Batch 1 profit/.test(await page.locator("#distributions").innerText()));
  await page.getByRole("button", { name: "Undo this distribution" }).click();
  await page.waitForURL(/released=undone/, { waitUntil: "commit" });
  check("distribution can be undone", (await page.getByText("Nothing distributed yet.").count()) === 1);

  // ── Fixing stock changes
  await page.goto(`${B}/inventory/${MINT}`);
  await page.getByRole("button", { name: "Fix" }).first().click();
  await page.locator(".stock-fix input[name=qty]").fill("18");
  await page.getByRole("button", { name: "Save fix" }).click();
  await page.waitForTimeout(2500);
  console.log("AFTER SAVE", page.url(), (await page.locator(".stock-fix").innerText().catch(() => "none")).replace(/\s+/g, " "));
  await page.waitForURL(/fixed=edited/, { waitUntil: "commit" });
  let l = await log();
  check("edit a restock's pieces", l.some((x) => x.rpc === "edit_stock_change" && x.body.p_qty === 18));
  await page.getByRole("button", { name: "Fix" }).first().click();
  await page.getByRole("button", { name: "Remove it" }).click();
  await page.waitForURL(/fixed=removed/, { waitUntil: "commit" });
  l = await log();
  check("remove a stock change", l.some((x) => x.rpc === "remove_stock_change"));
  await page.goto(`${B}/inventory/${MINT}`);
  const histRows = await page.locator('section[aria-labelledby="history-t"] li').count();
  check("sales have no Fix button (3 entries, 2 fixable)", histRows === 3 && (await page.getByRole("button", { name: "Fix" }).count()) === 2, String(histRows));
  check("no page errors", errors.length === 0, errors.join("; "));
  await browser.close();
})();
