const { MongoMemoryServer } = require("mongodb-memory-server");
const { spawn } = require("child_process");
const http = require("http");
const { chromium } = require("playwright");
const fs = require("fs");
const PORT = "3996";
function req(m, p, b, headers = {}) {
  return new Promise((res, rej) => {
    const d = b ? JSON.stringify(b) : null;
    const r = http.request(`http://localhost:${PORT}${p}`, { method: m, headers: { "Content-Type": "application/json", ...headers, ...(d ? { "Content-Length": Buffer.byteLength(d) } : {}) } }, (x) => { let buf = ""; x.on("data", (c) => (buf += c)); x.on("end", () => { let j = null; try { j = JSON.parse(buf); } catch {} res({ status: x.statusCode, json: j }); }); });
    r.on("error", rej); if (d) r.write(d); r.end();
  });
}
(async () => {
  const mongod = await MongoMemoryServer.create();
  const server = spawn("node", ["server.js", "--prod"], { env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("chat-check"), ADMIN_PASSCODE: "p1", NODE_ENV: "production" }, stdio: ["ignore", "ignore", "ignore"] });
  for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 500)); try { if ((await req("GET", "/api/health")).json?.ok) break; } catch {} }
  const login = await req("POST", "/api/admin", { action: "login", passcode: "p1" });
  const TOKEN = login.json?.token || "";
  const cEmail = `cc-${Date.now()}@t.dz`;
  await req("POST", "/api/counselor", { action: "register", fullName: "د. تجربة", email: cEmail, password: "pass-pass-1", recoveryPhrase: "عبارة تجربة", specialties: ["anxietyDepression"], languages: ["ar"], yearsExperience: 3, whatsapp: "213666777009", sessionPrice: 2000 });
  const counselor = (await req("POST", "/api/counselor", { action: "login", email: cEmail, password: "pass-pass-1" })).json.user;
  const prof = (await req("GET", `/api/counselor?userId=${counselor.id}`)).json?.profile;
  await req("POST", "/api/admin", { action: "verify", profileId: prof?.id }, { "x-admin-token": TOKEN });
  const client = (await req("POST", "/api/client", { action: "register", pseudonym: "سارة", password: "pass-pass-1", recoveryPhrase: "عبارة تجربة عميلة", gender: "female", phone: "0555777009" })).json.user;
  const b = await req("POST", "/api/sessions", { victimId: client.id, counselorId: counselor.id, topic: "anxiety", mode: "TEXT", scheduledAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(), currency: "DZD" });
  const sid = b.json?.session?.id;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message.slice(0, 150)));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate((email) => {
    localStorage.setItem("tumaanina-challenge-info-off", "1");
    return fetch("/api/counselor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", email, password: "pass-pass-1" }) }).then((r) => r.json()).then((j) => {
      const st = JSON.parse(localStorage.getItem("tumaanina-state") || "{}");
      st.state = { ...(st.state || {}), user: j.user };
      st.state.activeSessionId = null;
      localStorage.setItem("tumaanina-state", JSON.stringify(st));
    });
  }, cEmail);
  await page.goto(`http://localhost:${PORT}/?session=${sid}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await page.evaluate(() => { document.querySelectorAll('[aria-label="لحظة اطمئنان"]').forEach((el) => el.remove()); });
  /* اضغط زر المنصة الوسطية (داخل المحتوى) تحديداً */
  const btn = page.locator('div.flex-1 button:has-text("افتح الدردشة")').last();
  console.log("btn count:", await page.locator('button:has-text("افتح الدردشة")').count());
  await btn.click({ timeout: 5000 }).catch((e) => console.log("click fail:", e.message.slice(0, 100)));
  await page.waitForTimeout(2000);
  const dlg = await page.locator('[data-slot="dialog-content"]').count();
  console.log("dialog open:", dlg > 0);
  console.log("chat title visible:", await page.locator("text=دردشة الجلسة").isVisible().catch(() => false));
  await page.screenshot({ path: "download/v140-shots/3-chat-dialog.png" });
  await browser.close(); server.kill(); await mongod.stop(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
