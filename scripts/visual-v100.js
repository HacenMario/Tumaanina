/* تحقق بصري — طمأنينة v1.0.0 */
const { MongoMemoryServer } = require("mongodb-memory-server");
const { spawn } = require("child_process");
const http = require("http");
const { chromium } = require("playwright");
const fs = require("fs");

const PORT = "3990";
const BASE = `http://localhost:${PORT}`;
const OUT = "download/v100-shots";
fs.mkdirSync(OUT, { recursive: true });

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
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("visual-v100"), ADMIN_PASSCODE: "vis-pass", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let ready = false;
  for (let i = 0; i < 60; i++) { await wait(500); try { const h = await req("GET", "/api/health"); if (h.json?.ok) { ready = true; break; } } catch {} }
  if (!ready) { console.error("server not ready"); process.exit(1); }
  await req("POST", "/api/admin", { action: "login", passcode: "vis-pass" });

  const browser = await chromium.launch();

  /* 1) الهبوط العربية — سطح المكتب */
  let ctx = await browser.newContext({ locale: "ar", viewport: { width: 1360, height: 900 } });
  let page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await wait(2500);
  await page.screenshot({ path: `${OUT}/v100-01-landing-ar.png` });
  await page.close(); await ctx.close();

  /* 2) الهبوط — هاتف */
  ctx = await browser.newContext({ locale: "ar", viewport: { width: 390, height: 844 }, isMobile: true });
  page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await wait(2200);
  await page.screenshot({ path: `${OUT}/v100-02-landing-mobile.png` });
  await page.close(); await ctx.close();

  /* 3) التسجيل كعميل — الحساب الجديد بلا توثيق */
  ctx = await browser.newContext({ locale: "ar", viewport: { width: 1360, height: 900 } });
  page = await ctx.newPage();
  await page.goto(`${BASE}/?view=victim-start`, { waitUntil: "networkidle" });
  await wait(2200);
  await page.screenshot({ path: `${OUT}/v100-03-register-no-verification.png` });
  await page.close(); await ctx.close();

  /* 4) المحفظة — نموذج الشحن (تسجيل عميل سريع عبر API ثم دخول محلي) */
  const client = (await req("POST", "/api/victim", {
    action: "register", pseudonym: "عميل-بصري", password: "pass-visual-123",
    recoveryPhrase: "عبارة استرجاع تجريبية", gender: "female", phone: "0555999000",
  })).json.user;
  ctx = await browser.newContext({ locale: "ar", viewport: { width: 1360, height: 900 } });
  page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate((u) => {
    const st = JSON.parse(localStorage.getItem("tumaanina-state") || "{}");
    localStorage.setItem("tumaanina-state", JSON.stringify({ ...st, state: { ...(st.state || {}), user: u } }));
  }, client);
  await page.goto(`${BASE}/?view=wallet`, { waitUntil: "networkidle" });
  await wait(2200);
  await page.screenshot({ path: `${OUT}/v100-04-wallet.png` });
  await page.close(); await ctx.close();

  /* 5) دليل الأخصائيين */
  ctx = await browser.newContext({ locale: "ar", viewport: { width: 1360, height: 900 } });
  page = await ctx.newPage();
  await page.goto(`${BASE}/?view=counselors-directory`, { waitUntil: "networkidle" });
  await wait(2200);
  await page.screenshot({ path: `${OUT}/v100-05-directory.png` });
  await page.close(); await ctx.close();

  /* 6) كيف تعمل المنصة */
  ctx = await browser.newContext({ locale: "fr", viewport: { width: 1360, height: 900 } });
  page = await ctx.newPage();
  await page.goto(`${BASE}/?view=how`, { waitUntil: "networkidle" });
  await wait(2200);
  await page.screenshot({ path: `${OUT}/v100-06-how-fr.png` });
  await page.close(); await ctx.close();

  await browser.close();
  server.kill();
  await mongod.stop();
  console.log("✅ لقطات جاهزة في", OUT);
  process.exit(0);
})();
