// End-to-end: owner deletes a test sale and a test product; a manager sees neither button.
const { chromium } = require("playwright");
const BASE = "http://127.0.0.1:3100";
const MOCK = "http://127.0.0.1:54321";
const DIR = __dirname;
const TEST = "00000000-0000-4000-8000-0000000000aa";
const SALE = "55555555-0000-4000-8000-000000000001";
const ROLE = process.env.ROLE || "owner";
const MODE = process.env.MODE || "product"; // product | sale

const b64url = (s) => Buffer.from(s).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = [b64url('{"alg":"HS256"}'), b64url(JSON.stringify({ sub: "aaaaaaaa-1111-4111-8111-000000000001", exp })), b64url("signature")].join(".");
const session = { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user: { id: "aaaaaaaa-1111-4111-8111-000000000001" } };
const results = [];
const check = (n, ok, x = "") => results.push(`${ok ? "ok  " : "FAIL"} ${ROLE}/${MODE}: ${n}${x ? ` (${x})` : ""}`);
const mock = async (p) => (await fetch(MOCK + p)).json();

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + b64url(JSON.stringify(session)), domain: "127.0.0.1", path: "/" }]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  if (ROLE === "manager") {
    await page.goto(`${BASE}/inventory/${TEST}`);
    check("no Delete product for managers", (await page.getByRole("button", { name: "Delete product" }).count()) === 0);
    await page.goto(`${BASE}/sales/${SALE}`);
    check("no Delete sale for managers", (await page.getByRole("button", { name: "Delete sale" }).count()) === 0);
    check("void still there for managers", (await page.getByRole("button", { name: "Void sale" }).count()) === 1);
  } else if (MODE === "product") {
    await page.goto(`${BASE}/inventory/${TEST}`);
    await page.getByRole("button", { name: "Delete product" }).click();
    const dlg = page.getByRole("alertdialog");
    await dlg.waitFor();
    const text = (await dlg.innerText()).replace(/\s+/g, " ");
    check("dialog says what goes", /Delete test 1\?/.test(text) && /2 stock history entries/.test(text) && /Also delete its 1 sale \(₱300\)/.test(text), text.slice(0, 160));
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${DIR}/shots/d-product-dialog.png` });
    await dlg.getByRole("button", { name: "Keep product" }).click();
    check("Keep product closes the dialog", !(await dlg.isVisible()));
    await page.getByRole("button", { name: "Delete product" }).click();
    await dlg.getByLabel(/Also delete its 1 sale/).check();
    await dlg.getByRole("button", { name: "Delete product" }).click();
    await page.waitForURL(/\/inventory\?deleted=1$/, { waitUntil: "commit" });
    await page.getByText("Product deleted with its 1 sale.").waitFor();
    const st = await mock("/__log");
    const call = st.log.find((l) => l.rpc === "delete_product");
    check("delete_product called with its sales", call?.body.p_product === TEST && call?.body.p_with_sales === true, JSON.stringify(call?.body));
    check("gone from the list", (await page.getByText("test 1").count()) === 0);
    await page.screenshot({ path: `${DIR}/shots/d-product-done.png` });
  } else {
    await page.goto(`${BASE}/sales/${SALE}`);
    await page.getByRole("button", { name: "Delete sale" }).click();
    const dlg = page.getByRole("alertdialog");
    await dlg.waitFor();
    check("dialog explains delete vs void", /void it instead/.test(await dlg.innerText()));
    await page.screenshot({ path: `${DIR}/shots/d-sale-dialog.png` });
    await dlg.getByRole("button", { name: "Delete sale" }).click();
    await page.waitForURL(/\/sales\?date=\d{4}-\d{2}-\d{2}&deleted=1$/, { waitUntil: "commit" });
    await page.getByText("Sale deleted. Its pieces are back on the shelf.").waitFor();
    const st = await mock("/__log");
    check("delete_sale called", st.log.some((l) => l.rpc === "delete_sale" && l.body.p_sale === SALE));
  }
  check("no page errors", errors.length === 0, errors.join("; "));
  const st = await mock("/__log");
  check("no unhandled calls", !st.log.some((l) => l.unhandled), JSON.stringify(st.log.filter((l) => l.unhandled)));
  await browser.close();
  console.log(results.join("\n"));
})().catch((e) => {
  console.log(results.join("\n"));
  console.error(e);
  process.exit(1);
});
