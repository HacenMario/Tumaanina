/**
 * تشخيص v1.17.0: 1) هل تعيد الواجهة البرمجية (API) الباقات فعلاً؟ 2) هل يظهر النص في الـ DOM؟
 */
const { spawn } = require("child_process");
const { chromium } = require("/home/z/.npm-global/lib/node_modules/playwright");
const { MongoMemoryServer } = require("/home/z/my-project/tumaanina/Tumaanina-main/node_modules/mongodb-memory-server");
const PORT = "3995";
const BASE = `http://127.0.0.1:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const mongod = await MongoMemoryServer.create({ instance: { port: 27079 } });
  const server = spawn("node", ["server.js"], {
    cwd: "/home/z/my-project/tumaanina/Tumaanina-main",
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("dbg"), ADMIN_PASSCODE: "x", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "ignore"],
  });
  for (let i = 0; i < 60; i++) { await wait(400); try { const h = await fetch(`${BASE}/api/health`).then(r => r.json()); if (h?.ok) break; } catch {} }
  const reg = await fetch(`${BASE}/api/clinic`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "register", name: "عيادة التشخيص", email: `dbg${Date.now()}@t.dz`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة استرجاع تجريبية" }) }).then(r => r.json());
  const up = await fetch(`${BASE}/api/clinic`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update-profile", userId: reg.userId, sessionPrice: 2500, packs: [{ name: "باقة 4 جلسات", sessions: 4, price: 8000, note: "الأكثر طلباً" }] }) }).then(r => r.json());
  console.log("update-profile:", JSON.stringify(up).slice(0, 120));
  const prof = await fetch(`${BASE}/api/clinics/${reg.slug}`).then(r => r.json());
  console.log("API packs:", JSON.stringify(prof?.clinic?.packs));
  console.log("API sessionPrice:", prof?.clinic?.sessionPrice);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
  await page.goto(`${BASE}/?clinic=${reg.slug}`, { waitUntil: "networkidle" });
  await wait(2000);
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  console.log("--- DOM يحتوي «باقة 4 جلسات»؟", bodyText.includes("باقة 4 جلسات"));
  console.log("--- DOM يحتوي «باقات الجلسات»؟", bodyText.includes("باقات الجلسات"));
  console.log("--- DOM يحتوي السعر؟", /2,500|2500/.test(bodyText));
  console.log("--- أخطاء الكونسول:", errs.length); errs.slice(0, 4).forEach(e => console.log("  •", e));
  await browser.close();
  server.kill(); await mongod.stop();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
