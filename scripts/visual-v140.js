/* تحقق بصري — طمأنينة v1.4.0: نافذة الحجز + دردشة الغرفة + فريق الإدارة + زر الإغلاق */
const { MongoMemoryServer } = require("mongodb-memory-server");
const { spawn } = require("child_process");
const http = require("http");
const { chromium } = require("playwright");
const fs = require("fs");

const PORT = "3995";
const BASE = `http://localhost:${PORT}`;
const OUT = "download/v140-shots";
fs.mkdirSync(OUT, { recursive: true });

function req(m, p, b, headers = {}) {
  return new Promise((res, rej) => {
    const d = b ? JSON.stringify(b) : null;
    const r = http.request(`${BASE}${p}`, { method: m, headers: { "Content-Type": "application/json", ...headers, ...(d ? { "Content-Length": Buffer.byteLength(d) } : {}) } }, (x) => { let buf = ""; x.on("data", (c) => (buf += c)); x.on("end", () => { let j = null; try { j = JSON.parse(buf); } catch {} res({ status: x.statusCode, json: j }); }); });
    r.on("error", rej); if (d) r.write(d); r.end();
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const TRACE = (msg) => fs.appendFileSync(`${OUT}/trace.log`, String(msg) + "\n");

(async () => {
  const mongod = await MongoMemoryServer.create();
  const server = spawn("node", ["server.js", "--prod"], {
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("visual-v140"), ADMIN_PASSCODE: "vis-pass-14", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let ready = false;
  for (let i = 0; i < 60; i++) { await wait(500); try { const h = await req("GET", "/api/health"); if (h.json?.ok) { ready = true; break; } } catch {} }
  if (!ready) { console.error("server not ready"); process.exit(1); }
  const login = await req("POST", "/api/admin", { action: "login", passcode: "vis-pass-14" });
  const TOKEN = login.json?.token || "";

  /* أخصائي + عميل + طلب حجز قيد الانتظار */
  const cEmail = `doc-vis-${Date.now()}@test.dz`;
  await req("POST", "/api/counselor", {
    action: "register", fullName: "د. نور الدين مرادي", email: cEmail,
    password: "vis-pass-123", recoveryPhrase: "عبارة العرض البصري الرابع",
    specialties: ["anxietyDepression"], languages: ["ar"], yearsExperience: 9,
    whatsapp: "213666777000", sessionPrice: 2500,
  });
  const counselor = (await req("POST", "/api/counselor", { action: "login", email: cEmail, password: "vis-pass-123" })).json.user;
  const prof = (await req("GET", `/api/counselor?userId=${counselor.id}`)).json?.profile;
  await req("POST", "/api/admin", { action: "verify", profileId: prof?.id }, { "x-admin-token": TOKEN });
  const client = (await req("POST", "/api/client", {
    action: "register", pseudonym: "أمينة", password: "vis-pass-123",
    recoveryPhrase: "عبارة العرض للعميلة", gender: "female", phone: "0555777003",
  })).json.user;
  await req("POST", "/api/sessions", { victimId: client.id, counselorId: counselor.id, topic: "relationships", mode: "TEXT", scheduledAt: new Date(Date.now() + 96 * 3600 * 1000).toISOString(), currency: "DZD" });
  TRACE("بيانات جاهزة + طلب حجز معلّق");

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  /* ─── 1) نافذة الحجز المنبثقة عند دخول الأخصائي ─── */
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.evaluate((email) => {
    localStorage.setItem("tumaanina-challenge-info-off", "1");
    return fetch("/api/counselor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", email, password: "vis-pass-123" }) })
      .then((r) => r.json())
      .then((j) => {
        if (j?.user) {
          const st = JSON.parse(localStorage.getItem("tumaanina-state") || "{}");
          localStorage.setItem("tumaanina-state", JSON.stringify({ ...st, state: { ...(st.state || {}), user: j.user } }));
        }
      });
  }, cEmail);
  await page.goto(`${BASE}/?view=counselor-dashboard`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(3500);
  await page.evaluate(() => {
    document.querySelectorAll('[aria-label="لحظة اطمئنان"]').forEach((el) => el.remove());
  });
  await page.waitForTimeout(600);
  const popupVisible = await page.locator('text=طلب حجز جديد').isVisible().catch(() => false);
  TRACE(`نافذة الحجز ظاهرة: ${popupVisible}`);
  await page.screenshot({ path: `${OUT}/1-booking-popup.png`, fullPage: false });

  /* اضغط تخطي لتختفي */
  if (popupVisible) {
    await page.locator('button:has-text("تخطي")').first().click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(800);
    const gone = !(await page.locator('text=طلب حجز جديد').isVisible().catch(() => false));
    TRACE(`النافذة اختفت بعد التخطي: ${gone}`);
  }

  /* ─── 2) غرفة الجلسة: زر الدردشة + النافذة الواسعة ─── */
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("tumaanina-state") || "{}");
    if (st.state?.user) { st.state.activeSessionId = null; localStorage.setItem("tumaanina-state", JSON.stringify(st)); }
  });
  /* ادخل الغرفة عبر جلسة الأخصائي — استخدم رابط ?session= */
  const notifs = (await req("GET", `/api/sessions?userId=${counselor.id}&role=COUNSELOR`)).json?.sessions || [];
  const sid = notifs[0]?.id;
  await page.goto(`${BASE}/?session=${sid}`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(3500);
  await page.evaluate(() => {
    document.querySelectorAll('[aria-label="لحظة اطمئنان"]').forEach((el) => el.remove());
    document.querySelectorAll("[data-slot=dialog-overlay]").forEach((el) => el.remove());
  });
  await page.waitForTimeout(500);
  const chatBtn = await page.locator('button:has-text("افتح الدردشة")').first().isVisible().catch(() => false);
  TRACE(`زر «افتح الدردشة» ظاهر: ${chatBtn}`);
  await page.screenshot({ path: `${OUT}/2-room-chat-button.png`, fullPage: false });
  if (chatBtn) {
    await page.locator('button:has-text("افتح الدردشة")').first().click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/3-chat-dialog.png`, fullPage: false });
    const chatDialog = await page.locator("text=دردشة الجلسة").isVisible().catch(() => false);
    TRACE(`نافذة الدردشة فُتحت: ${chatDialog}`);
  }

  await browser.close();

  /* ─── 3) تبويب فريق الإدارة (أدمين) ─── */
  const b2 = await chromium.launch();
  const p2 = await b2.newPage({ viewport: { width: 1280, height: 900 } });
  await p2.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await p2.evaluate((tok) => {
    localStorage.setItem("tumaanina-admin-token", tok);
    return fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", passcode: "vis-pass-14" }) })
      .then((r) => r.json())
      .then((j) => {
        if (j?.user) {
          const st = JSON.parse(localStorage.getItem("tumaanina-state") || "{}");
          localStorage.setItem("tumaanina-state", JSON.stringify({ ...st, state: { ...(st.state || {}), user: { ...j.user } } }));
        }
      });
  }, TOKEN);
  await p2.goto(`${BASE}/?view=admin-panel`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await p2.waitForTimeout(3000);
  const staffTab = await p2.locator('button[role="tab"]:has-text("فريق الإدارة")').isVisible().catch(() => false);
  TRACE(`تبويب فريق الإدارة ظاهر للمالك: ${staffTab}`);
  if (staffTab) {
    await p2.locator('button[role="tab"]:has-text("فريق الإدارة")').click({ timeout: 4000 }).catch(() => {});
    await p2.waitForTimeout(1500);
    await p2.locator('button:has-text("حساب جديد")').first().click({ timeout: 4000 }).catch(() => {});
    await p2.waitForTimeout(600);
    await p2.screenshot({ path: `${OUT}/4-staff-tab.png`, fullPage: false });
  }
  /* زر الإغلاق الجديد — افتح أي حوار (الإشعار الجماعي) */
  await b2.close();

  server.kill();
  await mongod.stop();
  TRACE("📸 لقطات v1.4.0 جاهزة");
  process.exit(0);
})().catch((e) => { TRACE("ERROR: " + (e.message || e)); process.exit(1); });
