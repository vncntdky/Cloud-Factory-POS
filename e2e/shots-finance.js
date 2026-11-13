// Annotated phone screenshots for the App handbook: numbered red arrows + highlight boxes.
const { chromium } = require("playwright");
const b64url = (s) => Buffer.from(s).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = [b64url('{"alg":"HS256"}'), b64url(JSON.stringify({ sub: "aaaaaaaa-1111-4111-8111-000000000001", exp })), b64url("signature")].join(".");
const session = { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user: { id: "aaaaaaaa-1111-4111-8111-000000000001" } };
const B = "http://127.0.0.1:3100";
const OUT = process.argv[2];
const MINT = "00000000-0000-4000-8000-000000000010";
const B1 = "bbbbbbbb-0000-4000-8000-000000000001";

// callouts: [{ loc, side }] numbered in order. side = where the badge sits: left|right|top|bottom.
async function annotate(page, callouts) {
  const boxes = [];
  for (const c of callouts) {
    const b = await c.loc.boundingBox();
    if (!b) throw new Error("no box for callout " + (boxes.length + 1));
    boxes.push({ ...b, side: c.side || "left", dx: c.dx || 0, dy: c.dy || 0 });
  }
  await page.evaluate((boxes) => {
    const W = innerWidth, H = innerHeight, RED = "#E5341B", P = 4, R = 14, GAP = 44;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", W); svg.setAttribute("height", H);
    Object.assign(svg.style, { position: "fixed", inset: "0", zIndex: 2147483647, pointerEvents: "none" });
    svg.innerHTML = `<defs><marker id="hb-a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="${RED}"/></marker></defs>`;
    boxes.forEach((b, i) => {
      const x = b.x - P, y = b.y - P, w = b.width + 2 * P, h = b.height + 2 * P;
      const rect = document.createElementNS(ns, "rect");
      Object.entries({ x, y, width: w, height: h, rx: 10, fill: "none", stroke: RED, "stroke-width": 3 }).forEach(([k, v]) => rect.setAttribute(k, v));
      svg.appendChild(rect);
      // badge position and the point on the box it points to
      let bx, by, tx, ty;
      const cx = x + w / 2, cy = y + h / 2;
      if (b.side === "left") { bx = x - GAP; by = cy; tx = x; ty = cy; }
      else if (b.side === "right") { bx = x + w + GAP; by = cy; tx = x + w; ty = cy; }
      else if (b.side === "top") { bx = cx; by = y - GAP; tx = cx; ty = y; }
      else if (b.side === "corner") { bx = x + w - 6; by = y + 6; tx = bx; ty = by; }
      else { bx = cx; by = y + h + GAP; tx = cx; ty = y + h; }
      bx += b.dx; by += b.dy;
      bx = Math.min(W - R - 4, Math.max(R + 4, bx)); by = Math.min(H - R - 4, Math.max(R + 4, by));
      const len = Math.hypot(tx - bx, ty - by);
      if (len > R + 8) {
        const sx = bx + ((tx - bx) / len) * (R + 2), sy = by + ((ty - by) / len) * (R + 2);
        const ex = tx - ((tx - bx) / len) * 3, ey = ty - ((ty - by) / len) * 3;
        const line = document.createElementNS(ns, "line");
        Object.entries({ x1: sx, y1: sy, x2: ex, y2: ey, stroke: RED, "stroke-width": 3, "marker-end": "url(#hb-a)" }).forEach(([k, v]) => line.setAttribute(k, v));
        svg.appendChild(line);
      }
      const c = document.createElementNS(ns, "circle");
      Object.entries({ cx: bx, cy: by, r: R, fill: RED, stroke: "#fff", "stroke-width": 2.5 }).forEach(([k, v]) => c.setAttribute(k, v));
      svg.appendChild(c);
      const t = document.createElementNS(ns, "text");
      Object.entries({ x: bx, y: by + 5.5, "text-anchor": "middle", fill: "#fff", "font-size": 15, "font-weight": 700, "font-family": "system-ui, sans-serif" }).forEach(([k, v]) => t.setAttribute(k, v));
      t.textContent = String(i + 1);
      svg.appendChild(t);
    });
    (document.querySelector("dialog[open]") || document.body).appendChild(svg);
  }, boxes);
}
const clear = (page) => page.evaluate(() => document.querySelectorAll("body > svg, dialog > svg").forEach((s) => s.remove()));
async function scrollTo(page, loc, offset = 90) {
  await loc.evaluate((el, off) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - off), offset);
  await page.waitForTimeout(300);
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "light" });
  await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + b64url(JSON.stringify(session)), domain: "127.0.0.1", path: "/" }]);
  const page = await ctx.newPage();
  const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); await clear(page); console.log("shot", name); };
  await page.goto(`${B}/sales/pnl`);
  await page.locator(".fin-wf").first().waitFor();
  await scrollTo(page, page.locator(".kpi").first(), 150);
  await annotate(page, [0, 1, 2, 3, 4, 5].map((i) => ({ loc: page.locator(".kpi").nth(i), side: "corner" })));
  await shot("finance");
  const dist = page.locator("#distributions");
  await scrollTo(page, dist, 70);
  await annotate(page, [
    { loc: dist.locator("dl"), side: "top", dx: 110, dy: 6 },
    { loc: dist.getByRole("button", { name: "Record distribution" }), side: "right" },
  ]);
  await shot("distribute");
  await scrollTo(page, page.locator("#restock-t"), 80);
  await annotate(page, [
    { loc: page.locator(".pick-chips"), side: "corner" },
    { loc: page.locator("#sa-amount"), side: "top", dx: 120 },
    { loc: page.getByRole("button", { name: "Keep this amount" }), side: "right" },
  ]);
  await shot("reserve-fund");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
