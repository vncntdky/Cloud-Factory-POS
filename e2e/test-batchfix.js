// End-to-end: every stock change names its batch; fix and add to a batch from its page.
const { chromium } = require("playwright");
const b64url = (s) => Buffer.from(s).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = [b64url('{"alg":"HS256"}'), b64url(JSON.stringify({ sub: "aaaaaaaa-1111-4111-8111-000000000001", exp })), b64url("signature")].join(".");
const session = { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user: { id: "aaaaaaaa-1111-4111-8111-000000000001" } };
const B = "http://127.0.0.1:3100";
const DIR = __dirname;
const MINT = "00000000-0000-4000-8000-000000000010";
const COLA = "00000000-0000-4000-8000-000000000017";
const B1 = "bbbbbbbb-0000-4000-8000-000000000001";
const NOBATCH = process.env.NOBATCH === "1";
const log = async () => (await (await fetch("http://127.0.0.1:54321/__log")).json()).log;
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const r = [];
  const check = (n, ok, x = "") => r.push(`${ok ? "ok  " : "FAIL"} ${n}${x ? ` (${x})` : ""}`);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + b64url(JSON.stringify(session)), domain: "127.0.0.1", path: "/" }]);
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const noScroll = async () => !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1));

  if (NOBATCH) {
    await page.goto(`${B}/inventory/${MINT}`);
    await page.locator("#stock-form-t").waitFor();
    check("no batches: change stock says to receive one first", (await page.getByText("Stock changes go into a batch.").count()) === 1);
    check("and can't be saved", await page.getByRole("button", { name: "Save restock" }).isDisabled());
  } else {
    // ── Product page: the batch picker, defaulting to the batch it last came in with
    await page.goto(`${B}/inventory/${MINT}`);
    await page.locator("#stk-batch").waitFor();
    check("stock change has a batch picker, set to its last batch", (await page.locator("#stk-batch").inputValue()) === B1);
    check("history names the batch", /Batch 1/.test(await page.locator('section[aria-labelledby="history-t"]').innerText()));
    await page.getByRole("radio", { name: "Count" }).click();
    await page.fill("#stk-qty", "4");
    await page.screenshot({ path: `${DIR}/shots/bf-stockform.png`, fullPage: false, clip: { x: 0, y: 0, width: 390, height: 844 } });
    await page.getByRole("button", { name: "Save count" }).click();
    await page.waitForURL(/stock=count/, { waitUntil: "commit" });
    const adj = (await log()).filter((l) => l.rpc === "adjust_stock").at(-1)?.body;
    check("count is saved to its batch", adj?.p_kind === "count" && adj?.p_qty === 4 && adj?.p_batch === B1, JSON.stringify(adj));
    await page.locator("#stk-batch").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${DIR}/shots/bf-stockform.png` });

    // ── Add product: batch picker shows once there are pieces
    await page.goto(`${B}/inventory/new`);
    await page.locator("#p-open").waitFor();
    check("no batch picker with 0 pieces", (await page.locator("#p-batch").count()) === 0);
    await page.fill("#p-open", "6");
    check("batch picker shows with pieces, newest batch first", (await page.locator("#p-batch").inputValue()) === B1);
    await page.locator("#p-batch").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${DIR}/shots/bf-newproduct.png` });
    await page.fill("#p-name", "Test Pod");
    await page.fill("#p-price", "300");
    await page.getByRole("button", { name: "Add product", exact: true }).click();
    await page.waitForTimeout(1500);
    const sp = (await log()).filter((l) => l.rpc === "save_product").at(-1)?.body;
    check("new product's pieces go into the batch", sp?.p?.opening_qty === 6 && sp?.p?.batch_id === B1, JSON.stringify(sp?.p));

    // ── Batch page: each product's stock changes with Fix; add a product
    await page.goto(`${B}/restock/batches/${B1}`);
    await page.locator("#lines-t").waitFor();
    check("no sideways scroll on the batch page", await noScroll());
    const lines = await page.locator(".batch-move__text").allInnerTexts();
    check("rows list what came in and counts", lines.some((l) => l === "Received: 20 pcs at ₱210 each") && lines.some((l) => /^Counted 2 on the shelf \(2 fewer\)$/.test(l)), lines.join(" | "));
    const hero = await page.locator(".kpi").first().innerText();
    // Batch 1: 120 received, 40 sold, Lychee counted 2 fewer → 78 left
    check("pieces left count the batch's counts and losses", /· 78 left/.test(hero.replace(/\s+/g, " ")), hero.replace(/\s+/g, " "));
    await page.locator(".batch-moves").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${DIR}/shots/bf-batchrows.png` });
    const mintMove = page.locator(".batch-move", { hasText: "Received: 20 pcs" }).first();
    await mintMove.getByRole("button", { name: "Fix" }).click();
    await mintMove.locator("input[name=qty]").fill("18");
    await page.screenshot({ path: `${DIR}/shots/bf-fixopen.png` });
    await mintMove.getByRole("button", { name: "Save fix" }).click();
    await page.waitForURL(new RegExp(`/restock/batches/${B1}\\?fixed=edited`), { waitUntil: "commit" });
    await page.getByText("Stock change fixed.").waitFor();
    check("fix from the batch saves and comes back to the batch", (await log()).some((l) => l.rpc === "edit_stock_change" && l.body.p_qty === 18));

    await page.getByRole("button", { name: "Add a product to this batch" }).click();
    await page.selectOption("#atb-product", COLA);
    await page.fill("#atb-qty", "5");
    await page.fill("#atb-cost", "200");
    await page.screenshot({ path: `${DIR}/shots/bf-addform.png` });
    await page.getByRole("button", { name: "Add to batch" }).click();
    await page.waitForURL(/added=1/, { waitUntil: "commit" });
    await page.getByText("Added to the batch.").waitFor();
    const add = (await log()).filter((l) => l.rpc === "adjust_stock").at(-1)?.body;
    check("add to batch restocks into it", add?.p_kind === "restock" && add?.p_product === COLA && add?.p_qty === 5 && add?.p_unit_cost_cents === 20000 && add?.p_batch === B1, JSON.stringify(add));

    // Stock before batches: Fix is there too, no add form
    await page.goto(`${B}/restock/batches/before`);
    await page.locator("#lines-t").waitFor();
    check("earlier stock rows can be fixed too, no add form", (await page.getByRole("button", { name: "Fix" }).count()) >= 1 && (await page.getByRole("button", { name: "Add a product to this batch" }).count()) === 0);
  }
  check("no page errors", errors.length === 0, errors.join("; "));
  check("no unhandled calls", !(await log()).some((l) => l.unhandled), JSON.stringify((await log()).filter((l) => l.unhandled)));
  await browser.close();
  console.log(r.join("\n"));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
