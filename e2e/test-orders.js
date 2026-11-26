// End-to-end: an order from ordering to Arrived. Mock: mock-restock.js with ORDER=1 (Batch 2 ordered 3 days ago from
// Vape Hub: 10 Mint + 6 Strawberry at ₱210, ₱200 shipping = ₱3,560; ₱1,000 down with the owner's money).
// Owner or manager (ROLE): Restock, the order's page (payments, Arrived, back on the way, remove), Reorder (pieces on
// the way, days to arrive), Finance (stock on the way, owed to suppliers), and a delivery received with nothing paid.
const { chromium } = require("playwright");
const b64url = (s) => Buffer.from(s).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = [b64url('{"alg":"HS256"}'), b64url(JSON.stringify({ sub: "aaaaaaaa-1111-4111-8111-000000000001", exp })), b64url("signature")].join(".");
const session = { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user: { id: "aaaaaaaa-1111-4111-8111-000000000001" } };
const B = "http://127.0.0.1:3100";
const DIR = __dirname;
const ROLE = process.env.ROLE || "owner";
const ORDER = "bbbbbbbb-0000-4000-8000-0000000000f2";
const MINT_LINE = "0c0c0c0c-0000-4000-8000-000000000001";
const state = async () => await (await fetch("http://127.0.0.1:54321/__log")).json();
const last = async (rpc) => (await state()).log.filter((l) => l.rpc === rpc).at(-1)?.body;
const txt = (s) => s.replace(/\s+/g, " ").trim();
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const r = [];
  const check = (n, ok, x = "") => r.push(`${ok ? "ok  " : "FAIL"} ${ROLE}: ${n}${x ? ` (${x})` : ""}`);
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + b64url(JSON.stringify(session)), domain: "127.0.0.1", path: "/" }]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  const noScroll = async () => !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1));

  // Restock → Batches: the order on the way and what is still to pay.
  await page.goto(`${B}/restock?view=batches`);
  const row = txt(await page.locator(`a[href="/restock/batches/${ORDER}"]`).innerText());
  check("batches: the order is on the way, with its pieces, cost and what is still to pay",
    /Batch 2 · Vape Hub/.test(row) && /On the way/.test(row) && /16 pcs · ₱3,560 · ₱2,560 to pay/.test(row), row);
  const kpis = txt((await page.locator(".kpi").allInnerTexts()).join(" | "));
  check("batches: what is owed to suppliers", /To pay suppliers ₱2,560/i.test(kpis), kpis);

  // Finance: stock on the way and owed to suppliers on Balance; held back on Overview.
  await page.goto(`${B}/sales/pnl?view=balance`);
  await page.locator("#bs-t").waitFor();
  const bs = txt(await page.locator("#bs-t").locator("xpath=../..").innerText());
  const assets = /Total assets ₱([\d,]+)/.exec(bs)?.[1];
  const owedSide = /Owed \+ owners' share ₱([\d,]+)/.exec(bs)?.[1];
  check("balance: stock on the way and owed to suppliers, and it still adds up",
    /Stock on the way ordered, not arrived yet, at cost ₱3,560/.test(bs) && /Owed to suppliers ordered or received, not paid yet ₱2,560/.test(bs) && !!assets && assets === owedSide,
    bs.slice(0, 400));
  const sup = txt(await page.locator("#suppliers").innerText());
  check("balance: orders and suppliers list the order", /Batch 2 On the way/.test(sup) && /costs ₱3,560 · paid ₱1,000/.test(sup) && /₱2,560 owed/.test(sup), sup.slice(0, 200));
  const cap = txt(await page.locator("#capital").innerText());
  check("balance: the owner's downpayment is owner capital", /₱1,000 owner's money for Batch 2/.test(cap), cap.slice(0, 200));
  check("balance: no sideways scroll", await noScroll());
  await page.goto(`${B}/sales/pnl`);
  const dist = txt(await page.locator("#distributions").innerText());
  check("overview: what is owed to suppliers is held back from spare cash", /Owed to suppliers orders and deliveries not paid yet \(₱2,560\)/.test(dist), dist.slice(0, 300));

  // Reorder: the pieces on the way count as in stock.
  await page.goto(`${B}/restock`);
  const k2 = txt((await page.locator(".kpi").allInnerTexts()).join(" | "));
  check("reorder: pieces on the way", /On the way 16 pcs 1 order · counted as in stock/i.test(k2), k2);
  const mint = txt(await page.locator('a[href$="0000000010"]').innerText());
  check("reorder: Mint has 10 on the way", /10 on the way/.test(mint), mint);
  check("reorder: the order is listed, with when it was ordered", /Batch 2 · Vape Hub On the way Ordered .* · 3 days ago/.test(txt(await page.locator('section[aria-labelledby="coming-t"]').innerText())));
  check("reorder: no order has arrived yet, so it says how the days to arrive get measured", (await page.getByText(/the days in between show here/).count()) === 1);

  // The order's page: payments.
  await page.goto(`${B}/restock/batches/${ORDER}`);
  const main = txt(await page.locator("main").innerText());
  check("order page: on the way, ordered 3 days ago, what was ordered", /On the way Ordered .* \(3 days ago\) · Vape Hub/.test(main) && /Ordered 16 pcs/.test(main) && /XBLACK MAX Pods · Mint ₱210(\.00)? each 10 pcs/.test(main), main.slice(0, 300));
  check("order page: no sales figures yet", (await page.locator(".kpi").count()) === 0);
  let pay = txt(await page.locator("#payments").innerText());
  check("order page: the downpayment, whose money, and what is still to pay", /Owner's money/.test(pay) && /₱1,000/.test(pay) && /₱2,560 still to pay \(on pick-up, or before\)/.test(pay), pay.slice(0, 260));
  await page.screenshot({ path: `${DIR}/shots/order-page.png`, fullPage: true });
  check("order page: no sideways scroll", await noScroll());
  await page.getByRole("button", { name: "Record a payment" }).click();
  const f = page.locator("form[aria-label='Record a payment']");
  check("a new payment starts at what is still owed", (await f.locator("input[name=amount]").inputValue()) === "2560.00" || (await f.locator("input[name=amount]").inputValue()) === "2560");
  await f.locator("input[name=amount]").fill("3000");
  await f.getByRole("button", { name: "Save payment" }).click();
  await page.getByText("Only ₱2,560.00 is still to pay for Batch 2").waitFor();
  check("a payment can't be more than is owed", true);
  await f.locator("input[name=amount]").fill("1000");
  await f.locator("input[name=note]").fill("GCash 0917");
  await f.getByRole("button", { name: "Save payment" }).click();
  await page.waitForURL(/paid=added/, { waitUntil: "commit" });
  await page.getByText("Payment saved.").waitFor();
  const ap = await last("add_batch_payment");
  check("payment sent: amount, company fund, today, note", ap?.p_batch === ORDER && ap?.p?.amount_cents === 100000 && ap?.p?.source === "company" && /^\d{4}-\d{2}-\d{2}$/.test(ap?.p?.paid_on) && ap?.p?.note === "GCash 0917", JSON.stringify(ap));
  pay = txt(await page.locator("#payments").innerText());
  check("₱1,560 left to pay", /₱1,560 still to pay/.test(pay), pay.slice(0, 260));
  await page.getByRole("button", { name: /^Edit Company fund payment/ }).click();
  const e = page.locator("form[aria-label='Edit payment']");
  await e.locator("input[name=amount]").fill("500");
  await e.getByRole("radio", { name: "Investment" }).click();
  await e.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(/paid=edited/, { waitUntil: "commit" });
  await page.getByText("Payment updated.").waitFor();
  const up = await last("update_batch_payment");
  check("payment edited: amount and whose money", up?.p?.amount_cents === 50000 && up?.p?.source === "investment", JSON.stringify(up));
  await page.getByRole("button", { name: /^Remove Investment payment/ }).click();
  await page.waitForURL(/paid=removed/, { waitUntil: "commit" });
  await page.getByText("Payment removed.").waitFor();
  check("payment removed", /₱2,560 still to pay/.test(txt(await page.locator("#payments").innerText())));

  // Arrived: 2 Mint short, ₱500 paid on pick-up with an investment.
  await page.getByRole("button", { name: "Arrived" }).click();
  const a = page.locator("form[aria-label='Batch 2 arrived']");
  await a.getByLabel("Pieces of XBLACK MAX Pods · Mint that came").fill("8");
  check("Arrived: what is still owed drops by the pieces that didn't come (2 × ₱210)", /₱2,140/.test(txt(await a.innerText())), txt(await a.innerText()).slice(0, 400));
  await a.getByRole("radio", { name: "Paid part" }).click();
  await a.locator("#arr-pay-amount").fill("500");
  await a.getByRole("radio", { name: "Investment" }).click();
  check("Arrived: what stays owed after paying part", /₱1,640 stays owed to the supplier/.test(txt(await a.innerText())), txt(await a.innerText()).slice(0, 500));
  await page.screenshot({ path: `${DIR}/shots/order-arrived-form.png`, fullPage: true });
  await a.getByRole("button", { name: "Put 14 pcs on the shelf" }).click();
  await page.waitForURL(/arrived=1/, { waitUntil: "commit" });
  const ab = await last("arrive_batch");
  check("Arrived sent: today, the pieces that came per line, the pick-up payment",
    ab?.p_batch === ORDER && /^\d{4}-\d{2}-\d{2}$/.test(ab?.p?.received_on) && ab?.p?.items?.find((i) => i.line_id === MINT_LINE)?.qty === 8
      && ab?.p?.payment?.amount_cents === 50000 && ab?.p?.payment?.source === "investment", JSON.stringify(ab));
  await page.getByText("Batch 2 arrived: 14 pcs on the shelf.").waitFor();
  check("arrived notice says what is still owed", /₱1,640 is still owed to the supplier/.test(txt(await page.locator(".notice").first().innerText())));
  check("arrived page: ordered 3 days before it arrived", /ordered .*, 3 days to arrive/.test(txt(await page.locator("main").innerText())));
  const st = await state();
  check("the pieces that came are on the shelf", st.products[0].on_hand === 4 + 8 && st.products[6].on_hand === 0 + 6, `${st.products[0].on_hand} / ${st.products[6].on_hand}`);

  // Reorder now knows how long that order took.
  await page.goto(`${B}/restock`);
  check("reorder: the days the order took to arrive", (await page.getByText(/Batch 2 took 3 days/).count()) === 1);
  await page.getByRole("button", { name: "Use 3 days for delivery" }).click();
  await page.waitForURL(/plan=saved/, { waitUntil: "commit" });
  const sp = await last("set_restock_plan");
  check("one tap uses it as the delivery time (buffer and cover kept)", sp?.p_lead_days === 3 && sp?.p_buffer_days === 3 && sp?.p_cover_days === 14, JSON.stringify(sp));

  // Back on the way (tapped Arrived by mistake), then removed as cancelled once its payments are gone.
  await page.goto(`${B}/restock/batches/${ORDER}`);
  await page.getByRole("button", { name: "Not here yet? Put it back on the way" }).click();
  await page.getByRole("button", { name: "Put back on the way" }).click();
  await page.waitForURL(/back=1/, { waitUntil: "commit" });
  await page.getByText("Batch 2 is back on the way.").waitFor();
  check("back on the way: its pieces are off the shelf", (await state()).products[0].on_hand === 4 && (await page.getByRole("button", { name: "Arrived" }).count()) === 1);
  await page.getByRole("button", { name: "Order cancelled? Remove it" }).click();
  check("an order with money paid on it can't be removed yet", await page.getByRole("button", { name: "Remove Batch 2" }).isDisabled()
    && /is paid on Batch 2. If the supplier gave it back, remove the payments above first./.test(txt(await page.locator("form[aria-label='Remove Batch 2']").innerText())));
  for (let k = 0; k < 2; k++) {
    await page.locator("#payments").getByRole("button", { name: /^Remove / }).first().click();
    await page.waitForURL(/paid=removed/, { waitUntil: "commit" });
    await page.getByText("Payment removed.").waitFor();
    await page.goto(`${B}/restock/batches/${ORDER}`);
  }
  await page.getByRole("button", { name: "Order cancelled? Remove it" }).click();
  await page.getByRole("button", { name: "Remove Batch 2" }).click();
  await page.waitForURL(/order=removed/, { waitUntil: "commit" });
  await page.getByText("Order removed.").waitFor();
  check("a cancelled order is removed", !(await state()).batches.some((b) => b.id === ORDER));

  // A delivery already here, not paid yet.
  await page.goto(`${B}/restock/receive`);
  await page.getByLabel("Pieces of XBLACK MAX Pods · Mint").fill("2");
  await page.getByRole("radio", { name: "Not paid yet" }).click();
  check("receive: nothing paid means all of it is owed", /₱420 stays owed to the supplier/.test(txt(await page.locator('section[aria-labelledby="pay-t"]').innerText())));
  await page.getByRole("button", { name: "Receive batch" }).last().click();
  await page.waitForURL(/received=1/, { waitUntil: "commit" });
  const rb = await last("receive_batch");
  check("receive sent with nothing paid", rb?.p?.payment?.amount_cents === 0, JSON.stringify(rb?.p?.payment));
  check("the delivery's page says what is still to pay", /₱420 still to pay/.test(txt(await page.locator("#payments").innerText())));

  // An order with a piece that has no cost: what is owed isn't known, so Arrived asks for the amount paid.
  await page.goto(`${B}/restock/order`);
  await page.getByLabel("Pieces of XBLACK MAX Pods · Mango").fill("3");
  await page.getByLabel("Cost per piece of XBLACK MAX Pods · Mango").fill("");
  await page.getByRole("radio", { name: "Cash on pick-up" }).click();
  await page.getByRole("button", { name: "Save order" }).click();
  await page.waitForURL(/ordered=1/, { waitUntil: "commit" });
  check("an order with no cost says what is still to pay isn't known",
    /A line has no cost per piece, so what is still to pay isn't known/.test(txt(await page.locator("#payments").innerText()))
      && (await page.getByRole("button", { name: "Record a payment" }).count()) === 1);
  await page.getByRole("button", { name: "Arrived" }).click();
  const a2 = page.locator("form[aria-label$=' arrived']");
  check("Arrived doesn't offer Paid the rest when a piece has no cost, and asks for the amount",
    (await a2.getByRole("radio", { name: "Paid the rest" }).count()) === 0 && (await a2.getByRole("radio", { name: "Paid part" }).getAttribute("aria-checked")) === "true"
      && (await a2.locator("#arr-pay-amount").count()) === 1);
  await page.screenshot({ path: `${DIR}/shots/order-arrived-nocost.png`, fullPage: true });

  check("no page errors", errors.length === 0, errors.join("; "));
  check("no unhandled calls", !(await state()).log.some((l) => l.unhandled), JSON.stringify((await state()).log.filter((l) => l.unhandled)));
  await browser.close();
  console.log(r.join("\n"));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
