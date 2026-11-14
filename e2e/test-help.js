const { chromium } = require("playwright");
const b64url = (s) => Buffer.from(s).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = [b64url('{"alg":"HS256"}'), b64url(JSON.stringify({ sub: "aaaaaaaa-1111-4111-8111-000000000001", exp })), b64url("signature")].join(".");
const session = { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user: { id: "aaaaaaaa-1111-4111-8111-000000000001" } };
const B = "http://127.0.0.1:3100";
const ROLE = process.env.ROLE || "owner";
const DIR = __dirname;
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const r = [];
  const check = (n, ok, x = "") => r.push(`${ok ? "ok  " : "FAIL"} ${ROLE}: ${n}${x ? ` (${x})` : ""}`);
  const errors = [];
  for (const [label, vp, scheme] of [["phone", { width: 390, height: 844 }, "light"], ["desk", { width: 1280, height: 900 }, "dark"]]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, colorScheme: scheme });
    await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + b64url(JSON.stringify(session)), domain: "127.0.0.1", path: "/" }]);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    if (label === "phone") {
      await page.goto(`${B}/settings`);
      await page.getByRole("link", { name: "Help & SOPs" }).click();
      await page.waitForURL(/\/help$/, { waitUntil: "commit" });
    } else {
      await page.goto(`${B}/sales`);
      await page.locator(".sidenav").getByRole("link", { name: "Help & SOPs" }).click();
      await page.waitForURL(/\/help$/, { waitUntil: "commit" });
    }
    await page.locator("#pics-t").waitFor();
    const pics = await page.locator("#pics-t ~ details").count();
    check(`${label}: handbook pictures (${pics})`, ROLE === "cashier" ? pics === 4 : pics === 11);
    await page.locator("details#sell summary").click();
    await page.locator("details#sell img").waitFor();
    const loaded = await page.locator("details#sell img").evaluate((i) => i.complete && i.naturalWidth > 0);
    check(`${label}: screenshot loads`, loaded);
    check(`${label}: no sideways scroll`, !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    await page.locator("details#sell").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${DIR}/shots/help-${ROLE}-${label}-guide.png` });
    await page.locator("details#sell").getByRole("link", { name: /Full steps: SOP 8/ }).click();
    await page.waitForURL(/tab=sops&sop=8/, { waitUntil: "commit" });
    await page.locator("#sop-8[open]").waitFor();
    check(`${label}: picture links to its SOP, opened`, true);
    const sops = await page.locator("details[id^=sop-]").count();
    check(`${label}: SOPs listed (${sops})`, ROLE === "cashier" ? sops === 5 : sops === 17);
    if (ROLE !== "cashier") {
      // Owner-only procedures are listed for managers too, marked Owner (the distributions picture links to SOP 15).
      const chip = (await page.locator("#sop-15 .cat__meta").innerText()).trim();
      check(`${label}: owner-only SOPs listed and marked Owner`, chip === "Owner" && (await page.locator("#sop-16, #sop-17").count()) === 2, chip);
    }
    check(`${label}: who-does-what table only for managers`, (await page.locator("#who-t").count()) === (ROLE === "cashier" ? 0 : 1));
    check(`${label}: no sideways scroll on SOPs`, !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    await page.screenshot({ path: `${DIR}/shots/help-${ROLE}-${label}-sop.png` });
    await ctx.close();
  }
  check("no page errors", errors.length === 0, errors.join("; "));
  await browser.close();
  console.log(r.join("\n"));
})().catch((e) => { console.error(e); process.exit(1); });
