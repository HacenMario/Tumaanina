/* تشخيص: ماذا يستقبل النقر فوق مدخل معرض الصور في تبويب معلومات العيادة؟ */
const { MongoMemoryServer } = require("mongodb-memory-server");
const { spawn } = require("child_process");
const http = require("http");
const { chromium } = require("playwright");

const PORT = "3995";
const BASE = `http://localhost:${PORT}`;
function req(m, p, b) {
  return new Promise((res, rej) => {
    const d = b ? JSON.stringify(b) : null;
    const r = http.request(`${BASE}${p}`, { method: m, headers: { "Content-Type": "application/json", ...(d ? { "Content-Length": Buffer.byteLength(d) } : {}) } }, (x) => { let buf = ""; x.on("data", (c) => (buf += c)); x.on("end", () => { let j = null; try { j = JSON.parse(buf); } catch {} res({ status: x.statusCode, json: j }); }); });
    r.on("error", rej); if (d) r.write(d); r.end();
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const mongod = await MongoMemoryServer.create();
  const server = spawn("node", ["server.js"], {
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("diag"), ADMIN_PASSCODE: "d", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "ignore"],
  });
  for (let i = 0; i < 60; i++) { await wait(500); try { const h = await req("GET", "/api/health"); if (h.json?.ok) break; } catch {} }
  const stamp = Date.now();
  const cl = await req("POST", "/api/clinic", { action: "register", name: "عيادة diag", email: `d${stamp}@t.dz`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة" });
  const clinicUser = (await req("POST", "/api/clinic", { action: "login", email: `d${stamp}@t.dz`, password: "pass-tumaanina-1" })).json.user;

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: "ar",
    storageState: { cookies: [], origins: [{ origin: BASE, localStorage: [{ name: "tumaanina-state", value: JSON.stringify({ state: { user: clinicUser, view: "clinic-dashboard" }, version: 0 }) }] }] },
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?view=clinic-dashboard`, { waitUntil: "networkidle" });
  await wait(1500);

  const info = await page.evaluate(() => {
    const all = [...document.querySelectorAll("input[type='file']")].map((x) => ({ accept: x.getAttribute("accept"), multiple: x.hasAttribute("multiple"), visible: x.offsetParent !== null }));
    const btns = [...document.querySelectorAll("button")].map((b) => b.textContent.trim().slice(0, 30)).filter((t) => t).slice(0, 25);
    const inp = document.querySelector("input[accept='image/*'][multiple]");
    if (!inp) return { found: false, all, btns, title: document.body.innerText.slice(0, 200) };
    const r = inp.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const top = document.elementFromPoint(cx, cy);
    const st = getComputedStyle(inp);
    return {
      found: true,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      center: { cx: Math.round(cx), cy: Math.round(cy) },
      topIsInput: top === inp,
      topTag: top ? `${top.tagName}.${(top.className || "").toString().slice(0, 60)}` : "null",
      pe: st.pointerEvents,
      opacity: st.opacity,
      disabled: inp.disabled,
    };
  });
  console.log("تشخيص مدخل المعرض:", JSON.stringify(info, null, 2));

  /* جرّب حدث filechooser مع نقرة حقيقية */
  try {
    const fc = page.waitForEvent("filechooser", { timeout: 3000 });
    await page.locator("input[accept='image/*'][multiple]").first().click({ force: true, timeout: 3000 });
    await fc;
    console.log("✓ filechooser فتح");
  } catch (e) {
    console.log("✗ لا filechooser:", e.message.split("\n")[0]);
  }
  await browser.close();
  server.kill();
  await mongod.stop();
  process.exit(0);
})().catch((e) => { console.error("CRASH:", e); process.exit(1); });
