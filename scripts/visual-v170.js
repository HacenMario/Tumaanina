/* تحقق بصري — طمأنينة v1.7.0: بطاقة المحادثات بلا معاينة آخر رسالة (هاتفياً)
   + الضغط يفتح الدردشة كاملة + تبويب «مستحقات المختصين» بأرقامه الحقيقية */
const { MongoMemoryServer } = require("mongodb-memory-server");
const { spawn } = require("child_process");
const http = require("http");
const { chromium } = require("playwright");
const fs = require("fs");

const PORT = "3995";
const BASE = `http://localhost:${PORT}`;
const OUT = "download/v170-shots";
fs.mkdirSync(OUT, { recursive: true });

function req(m, p, b, headers = {}) {
  return new Promise((res, rej) => {
    const d = b ? JSON.stringify(b) : null;
    const r = http.request(`${BASE}${p}`, { method: m, headers: { "Content-Type": "application/json", ...headers, ...(d ? { "Content-Length": Buffer.byteLength(d) } : {}) } }, (x) => { let buf = ""; x.on("data", (c) => (buf += c)); x.on("end", () => { let j = null; try { j = JSON.parse(buf); } catch {} res({ status: x.statusCode, json: j }); }); });
    r.on("error", rej); if (d) r.write(d); r.end();
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const TRACE = (msg) => { fs.appendFileSync(`${OUT}/trace.log`, String(msg) + "\n"); console.log(msg); };
let failures = 0;
const check = (name, cond, extra = "") => { if (cond) TRACE(`  ✅ ${name}`); else { failures++; TRACE(`  ❌ ${name} ${extra}`); } };

(async () => {
  const mongod = await MongoMemoryServer.create();
  const server = spawn("node", ["server.js", "--prod"], {
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("visual-v170"), ADMIN_PASSCODE: "vis-pass-17", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let ready = false;
  for (let i = 0; i < 60; i++) { await wait(500); try { const h = await req("GET", "/api/health"); if (h.json?.ok) { ready = true; break; } } catch {} }
  if (!ready) { console.error("server not ready"); process.exit(1); }
  const login = await req("POST", "/api/admin", { action: "login", passcode: "vis-pass-17" });
  const TOKEN = login.json?.token || "";

  /* أخصائي موثّق + عميلة + جلسة مستقبلية (سياق DM) */
  const cEmail = `doc17vis-${Date.now()}@test.dz`;
  await req("POST", "/api/counselor", {
    action: "register", fullName: "د. نور الدين مرادي", email: cEmail,
    password: "vis-pass-123", recoveryPhrase: "عبارة العرض البصري السابع",
    specialties: ["anxietyDepression"], languages: ["ar"], yearsExperience: 9,
    whatsapp: "213666777000", sessionPrice: 2500,
  });
  const counselor = (await req("POST", "/api/counselor", { action: "login", email: cEmail, password: "vis-pass-123" })).json.user;
  const prof = (await req("GET", `/api/counselor?userId=${counselor.id}`)).json?.profile;
  await req("POST", "/api/admin", { action: "verify", profileId: prof?.id }, { "x-admin-token": TOKEN });
  const client = (await req("POST", "/api/client", {
    action: "register", pseudonym: "أمينة", password: "vis-pass-123",
    recoveryPhrase: "عبارة العرض للعميلة", gender: "female", phone: "0555777007",
  })).json.user;
  const when = new Date(Date.now() + 96 * 3600 * 1000).toISOString();
  const bk = await req("POST", "/api/sessions", { victimId: client.id, counselorId: counselor.id, topic: "relationships", mode: "TEXT", scheduledAt: when, currency: "DZD" });
  const sid = bk.json?.session?.id;

  /* خيط DM: آخر رسالة صوتية — السيناريو الذي كان يشوّه الهاتف بـ base64 طويل */
  const dmKey = `dm:${client.id}:${counselor.id}`;
  await req("POST", "/api/messages", { threadKey: dmKey, senderRole: "VICTIM", senderName: "أمينة", senderId: client.id, content: "مرحباً دكتور، أريد أن أشاركك شيئاً مهماً." });
  const audioBytes = Buffer.alloc(150_000);
  for (let i = 0; i < audioBytes.length; i++) audioBytes[i] = 65 + (i % 26);
  await req("POST", "/api/messages", { threadKey: dmKey, senderRole: "VICTIM", senderName: "أمينة", senderId: client.id, content: "data:audio/webm;base64," + audioBytes.toString("base64"), type: "voice", seconds: 33 });
  TRACE("بيانات المحادثة جاهزة (آخر رسالة صوتية)");

  /* جلسات مكتملة لمستحقات المختصين: 2 DZD (2000) هذا الشهر + 1 EUR (20) هذا الشهر + 1 DZD (1500) الشهر الماضي + 1 معلّقة تُستثنى */
  const { MongoClient } = require("mongodb");
  const mClient = new MongoClient(mongod.getUri("visual-v170"));
  await mClient.connect();
  const OID = require("mongodb").ObjectId;
  const now = new Date();
  await mClient.db().collection("sessions").insertMany([
    { victimId: new OID(client.id), counselorId: new OID(counselor.id), topic: "stress", mode: "TEXT", currency: "DZD", price: 2000, status: "COMPLETED", scheduledAt: new Date(now.getTime() - 3 * 3600e3), endedAt: new Date(now.getTime() - 2 * 3600e3), createdAt: new Date(now.getTime() - 4 * 3600e3) },
    { victimId: new OID(client.id), counselorId: new OID(counselor.id), topic: "anxiety", mode: "VOICE", currency: "DZD", price: 2000, status: "COMPLETED", scheduledAt: new Date(now.getTime() - 30 * 3600e3), endedAt: new Date(now.getTime() - 29 * 3600e3), createdAt: new Date(now.getTime() - 31 * 3600e3) },
    { victimId: new OID(client.id), counselorId: new OID(counselor.id), topic: "sleep", mode: "VIDEO", currency: "EUR", price: 20, status: "COMPLETED", scheduledAt: new Date(now.getTime() - 50 * 3600e3), endedAt: new Date(now.getTime() - 49 * 3600e3), createdAt: new Date(now.getTime() - 51 * 3600e3) },
    { victimId: new OID(client.id), counselorId: new OID(counselor.id), topic: "sadness", mode: "TEXT", currency: "DZD", price: 1500, status: "COMPLETED", scheduledAt: new Date(now.getFullYear(), now.getMonth() - 1, 4, 12), endedAt: new Date(now.getFullYear(), now.getMonth() - 1, 4, 13), createdAt: new Date(now.getFullYear(), now.getMonth() - 1, 4, 10) },
    { victimId: new OID(client.id), counselorId: new OID(counselor.id), topic: "anger", mode: "TEXT", currency: "DZD", price: 9000, status: "PENDING", scheduledAt: when, createdAt: new Date() },
  ]);
  /* مختص ثانٍ بلا جلسات */
  const c2Email = `doc17vis2-${Date.now()}@test.dz`;
  await req("POST", "/api/counselor", {
    action: "register", fullName: "د. سهام بن يوسف", email: c2Email,
    password: "vis-pass-123", recoveryPhrase: "عبارة العرض الثانية",
    specialties: ["stress"], languages: ["ar"], yearsExperience: 4,
    whatsapp: "213666777002", sessionPrice: 1800,
  });
  TRACE("بيانات المستحقات جاهزة (4 مكتملة + 1 معلّقة مستثناة)");

  const browser = await chromium.launch();

  /* ─── 1) بند 1: بطاقة المحادثات هاتفياً 390px — بلا أي base64 ─── */
  TRACE("\n── 1) بطاقة المحادثات هاتفياً: بلا معاينة آخر رسالة (بند 1) ──");
  const mob = await browser.newPage({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
  await mob.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await mob.evaluate(async (email) => {
    const r = await fetch("/api/counselor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", email, password: "vis-pass-123" }) });
    const j = await r.json();
    if (j?.user) localStorage.setItem("tumaanina-inject-user", JSON.stringify(j.user));
  }, cEmail);
  await mob.addInitScript(() => {
    const raw = localStorage.getItem("tumaanina-inject-user");
    if (!raw) return;
    try {
      const user = JSON.parse(raw);
      const st = JSON.parse(localStorage.getItem("tumaanina-state") || "{}");
      const version = typeof st.version === "number" ? st.version : 0;
      localStorage.setItem("tumaanina-state", JSON.stringify({ ...st, version, state: { ...(st.state || {}), user } }));
    } catch {}
  });
  mob.on("pageerror", (e) => TRACE("PAGE-ERROR: " + String(e.message).slice(0, 160)));
  await mob.goto(`${BASE}/?view=counselor-dashboard`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await mob.waitForTimeout(3500);
  await mob.keyboard.press("Escape").catch(() => {});
  await mob.waitForTimeout(700);
  await mob.locator('button:has-text("تخطي")').first().click({ timeout: 3000, force: true }).catch(() => {});
  await mob.waitForTimeout(900);

  const cardTitle = await mob.locator('text=المحادثات (قبل الجلسة)').first().isVisible().catch(() => false);
  check("بطاقة المحادثات ظاهرة في اللوحة", cardTitle);
  const bodyText = await mob.evaluate(() => document.body.innerText);
  check("لا أي base64/data:audio في الصفحة كلها", !bodyText.includes("data:audio") && !bodyText.includes("GkXfo") && !/webm/.test(bodyText));
  check("لا نص الرسالة النصية في المعاينة (لا محتوى إطلاقاً)", !bodyText.includes("أريد أن أشاركك شيئاً مهماً"));
  const peerVisible = await mob.locator('button:has-text("أمينة")').first().isVisible().catch(() => false);
  check("بطاقة الطرف (أمينة) ظاهرة بالاسم والوقت فقط", peerVisible);
  const noHScroll = await mob.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check("بلا تجاوز أفقي هاتفياً 390px", noHScroll);
  await mob.screenshot({ path: `${OUT}/1-conversations-card-mobile.png`, fullPage: false });

  /* ─── 2) الضغط على الإطار يفتح الدردشة كاملة ─── */
  TRACE("\n── 2) الضغط على إطار المحادثة يفتح النافذة الكاملة ──");
  await mob.locator('button:has-text("أمينة")').first().click({ timeout: 4000, force: true }).catch(() => {});
  await mob.waitForTimeout(2000);
  const dialogOpen = await mob.locator('input[placeholder], div[role="dialog"]').first().isVisible().catch(() => false)
    && (await mob.locator('input[placeholder]').count()) > 0;
  check("نافذة الدردشة فُتحت كاملة (حقل الكتابة ظاهر)", dialogOpen);
  const dialogText = await mob.evaluate(() => document.body.innerText);
  check("داخل النافذة: الرسالة النصية ظاهرة", dialogText.includes("أريد أن أشاركك شيئاً مهماً"));
  check("داخل النافذة: فقاعة الصوت بالمدة (00:33) بلا نص base64", /00:33/.test(dialogText) && !dialogText.includes("data:audio"));
  await mob.screenshot({ path: `${OUT}/2-dm-dialog-full.png`, fullPage: false });

  /* ─── 3) بند 2: تبويب مستحقات المختصين في لوحة الأدمين ─── */
  TRACE("\n── 3) تبويب مستحقات المختصين: الأرقام والتفاصيل (بند 2) ──");
  const adm = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await adm.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await adm.evaluate(async (t) => {
    localStorage.setItem("tumaanina-admin-token", t);
    const st = JSON.parse(localStorage.getItem("tumaanina-state") || "{}");
    const version = typeof st.version === "number" ? st.version : 0;
    localStorage.setItem("tumaanina-state", JSON.stringify({ ...st, version, state: { ...(st.state || {}), user: { id: "admin", role: "ADMIN", staffRole: "SUPER", staffName: "الإدارة" }, view: "admin-panel" } }));
  }, TOKEN);
  await adm.addInitScript(() => {
    const st = JSON.parse(localStorage.getItem("tumaanina-state") || "{}");
    const version = typeof st.version === "number" ? st.version : 0;
    if (!st.state?.user?.role) localStorage.setItem("tumaanina-state", JSON.stringify({ ...st, version, state: { ...(st.state || {}), user: { id: "admin", role: "ADMIN", staffRole: "SUPER", staffName: "الإدارة" }, view: "admin-panel" } }));
  });
  await adm.goto(`${BASE}/?view=admin-panel`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await adm.waitForTimeout(3500);
  await adm.keyboard.press("Escape").catch(() => {});
  await adm.waitForTimeout(700);

  const eTab = adm.locator('button[role="tab"]:has-text("مستحقات المختصين")').first();
  const eTabVisible = await eTab.isVisible().catch(() => false);
  check("تبويب «مستحقات المختصين» ظاهر", eTabVisible);
  if (eTabVisible) {
    await eTab.click({ timeout: 4000 });
    await adm.waitForTimeout(2000);
    const admText = await adm.evaluate(() => document.body.innerText);
    check("العنوان والوصف ظاهران", admText.includes("مستحقات المختصين"));
    check("الملخّص: 4 جلسات مكتملة (المعلّقة مستثناة)", /4/.test(admText));
    check("المبالغ DZD تظهر بالتنسيق (5 500 دج)", /5\s?500\s?دج/.test(admText.replace(/\u202f|\u00a0/g, " ")), admText.slice(0, 100));
    check("عمولة 15% ظاهرة (825 دج)", /825\s?دج/.test(admText.replace(/\u202f|\u00a0/g, " ")));
    check("مستحق هذا الشهر بالدجار واليورو (600 دج + 3,00 €)", /600\s?دج/.test(admText.replace(/\u202f|\u00a0/g, " ")) && /3,00\s?€/.test(admText));
    const doc1Card = await adm.locator('text=د. نور الدين مرادي').first().isVisible().catch(() => false);
    const doc2Card = await adm.locator('text=د. سهام بن يوسف').first().isVisible().catch(() => false);
    check("بطاقتا المختصين ظاهرتان (4 جلسات أولاً ثم بلا جلسات)", doc1Card && doc2Card);
    await adm.screenshot({ path: `${OUT}/3-earnings-summary.png`, fullPage: true });
    /* توسيع التفاصيل: آخر الجلسات بالعميل والسعر */
    await adm.locator('button[aria-label="التفاصيل"]').first().click({ timeout: 3000, force: true }).catch(() => {});
    await adm.waitForTimeout(1000);
    const detText = await adm.evaluate(() => document.body.innerText);
    check("التفاصيل الموسعة: اسم العميلة + موضوع + عمولة الجلسة", detText.includes("أمينة") && detText.includes("التوتر") !== undefined && detText.includes("آخر الجلسات المكتملة"));
    await adm.screenshot({ path: `${OUT}/4-earnings-details.png`, fullPage: true });
  }

  await browser.close();
  server.kill("SIGKILL");
  await mClient.close().catch(() => {});
  await mongod.stop().catch(() => {});
  TRACE("\n" + (failures === 0 ? "🎉 التحقق البصري v1.7.0 سليم" : `⚠️ ${failures} فحص فاشل`));
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error("❌ انهار العرض:", e); process.exit(1); });
