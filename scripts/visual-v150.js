/* تحقق بصري — طمأنينة v1.5.0: القائمة المؤطرة + السعر «2000 دج» + واتساب البطاقة
   + دردشة (تعديل/حذف/صوتي/كسر أسطر) + النافذة العالمية + التقييمات الواقعية + الفوتر */
const { MongoMemoryServer } = require("mongodb-memory-server");
const { spawn } = require("child_process");
const http = require("http");
const { chromium } = require("playwright");
const fs = require("fs");

const PORT = "3993";
const BASE = `http://localhost:${PORT}`;
const OUT = "download/v150-shots";
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

(async () => {
  const mongod = await MongoMemoryServer.create();
  const server = spawn("node", ["server.js", "--prod"], {
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("visual-v150"), ADMIN_PASSCODE: "vis-pass-15", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let ready = false;
  for (let i = 0; i < 60; i++) { await wait(500); try { const h = await req("GET", "/api/health"); if (h.json?.ok) { ready = true; break; } } catch {} }
  if (!ready) { console.error("server not ready"); process.exit(1); }
  const login = await req("POST", "/api/admin", { action: "login", passcode: "vis-pass-15" });
  const TOKEN = login.json?.token || "";

  /* أخصائي + عميل + جلسة مقبولة */
  const cEmail = `doc15vis-${Date.now()}@test.dz`;
  await req("POST", "/api/counselor", {
    action: "register", fullName: "د. نور الدين مرادي", email: cEmail,
    password: "vis-pass-123", recoveryPhrase: "عبارة العرض البصري الخامس",
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
  const bk = await req("POST", "/api/sessions", { victimId: client.id, counselorId: counselor.id, topic: "relationships", mode: "TEXT", scheduledAt: new Date(Date.now() + 96 * 3600 * 1000).toISOString(), currency: "DZD" });
  const sid = bk.json?.session?.id;
  await req("PATCH", `/api/sessions/${sid}`, { status: "ACCEPTED", durationMinutes: 45 });
  /* رسالة طويلة جداً لفحص كسر الأسطر + تقييمات لفحص الأشرطة */
  await req("POST", "/api/messages", { sessionId: sid, senderRole: "VICTIM", senderName: "أمينة", senderId: client.id, content: "هذه رسالة تجريبية طويلة جداً بدون أي مسافات_ملاصقة_للتحقق_من_كسر_الأسطر_InsideTheChatBubbleWithAVeryLongUnbrokenEnglishAndArabicMixedTokenThatMustWrapCorrectlyWithoutBreakingTheDialogWidth" });
  for (const stars of [5, 5, 4]) {
    await req("POST", `/api/counselors/${counselor.id}/rate`, { victimId: client.id, stars });
  }
  /* طلب حجز ثانٍ معلّق — للنافذة المنبثقة (المقبول الأول لا يظهر في النافذة) */
  await req("POST", "/api/sessions", { victimId: client.id, counselorId: counselor.id, topic: "stress", mode: "TEXT", scheduledAt: new Date(Date.now() + 144 * 3600 * 1000).toISOString(), currency: "DZD" });
  TRACE("بيانات العرض جاهزة");

  const browser = await chromium.launch();

  /* ─── 1) القائمة الجانبية المؤطرة على هاتف (بند 18) ─── */
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await mobile.waitForTimeout(2500);
  await mobile.evaluate(() => document.querySelectorAll('[aria-label="لحظة اطمئنان"]').forEach((el) => el.remove()));
  await mobile.locator('button[aria-label*="القائمة"], button:has-text("☰")').first().click({ timeout: 4000 }).catch(() => {});
  await mobile.waitForTimeout(900);
  await mobile.screenshot({ path: `${OUT}/1-mobile-nav-frames.png`, fullPage: false });
  TRACE("1) القائمة المؤطرة (هاتف) 📱");

  /* ─── 2) بطاقة الأخصائي: السعر + واتساب (بندا 15+16) ─── */
  const dcard = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await dcard.goto(`${BASE}/?view=counselors-directory`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await dcard.waitForTimeout(3000);
  await dcard.evaluate(() => document.querySelectorAll('[aria-label="لحظة اطمئنان"]').forEach((el) => el.remove()));
  await dcard.waitForTimeout(400);
  const priceText = await dcard.locator("text=/2\\s*500\\s*دج/").first().isVisible().catch(() => false);
  TRACE(`2) السعر «2 500 دج» (رقم ثم رمز): ${priceText}`);
  const waBtn = await dcard.locator('a[href*="wa.me/213666777000"]').first().isVisible().catch(() => false);
  TRACE(`2) زر واتساب في البطاقة: ${waBtn}`);
  await dcard.screenshot({ path: `${OUT}/2-card-price-whatsapp.png`, fullPage: false });

  /* ─── 3) أشرطة التقييم الواقعية (بند 14) ─── */
  const rateBtn = dcard.locator('button:has-text("التقييمات")').first();
  if (await rateBtn.isVisible().catch(() => false)) {
    await rateBtn.click({ timeout: 4000 });
    await dcard.waitForTimeout(1500);
    await dcard.screenshot({ path: `${OUT}/3-ratings-bars.png`, fullPage: false });
    TRACE("3) نافذة التقييمات بأشرطتها 📊");
  } else { TRACE("3) زر التقييمات غير ظاهر — تخطٍ"); }

  /* ─── 4) النافذة العالمية: الأخصائي على صفحة غير لوحته (بند 3) ─── */
  const cpage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await cpage.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await cpage.waitForTimeout(2500);
  /* v1.5.0-fix: دخول الأخصائي عبر API ثم حقن حالته قبل إقلاع التطبيق في كل تنقل
     (addInitScript) — الحقن بعد الإقلاع يخسره بسباق كتابة zustand */
  await cpage.evaluate(async (email) => {
    const r = await fetch("/api/counselor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", email, password: "vis-pass-123" }) });
    const j = await r.json();
    if (j?.user) {
      localStorage.setItem("tumaanina-challenge-info-off", "1");
      localStorage.setItem("tumaanina-inject-user", JSON.stringify(j.user));
    }
  }, cEmail);
  await cpage.addInitScript(() => {
    const raw = localStorage.getItem("tumaanina-inject-user");
    if (!raw) return;
    try {
      const user = JSON.parse(raw);
      const st = JSON.parse(localStorage.getItem("tumaanina-state") || "{}");
      const version = typeof st.version === "number" ? st.version : 0;
      localStorage.setItem("tumaanina-state", JSON.stringify({ ...st, version, state: { ...(st.state || {}), user } }));
    } catch {}
  });
  const injected = await cpage.evaluate(() => localStorage.getItem("tumaanina-inject-user") !== null);
  TRACE(`4) حقن حالة الأخصائي: ${injected ? "تم" : "فشل"}`);
  /* افتح صفحة المجتمع — ليست لوحة الأخصائي — يجب أن تظهر النافذة */
  await cpage.goto(`${BASE}/?view=community`, { waitUntil: "domcontentloaded", timeout: 20000 });
  /* النافذة تظهر عبر استطلاع 10 ثوانٍ — انتظر حتى 14 ثانية بفحص متكرر
     v1.5.0-fix: ‏.first() إلزامية — العنوان موجود مرتين (المرئي + sr-only)
     وانتهاك strict mode يُبتلع في .catch فيبدو كأن النافذة غائبة */
  let popupAny = false;
  for (let i = 0; i < 14 && !popupAny; i++) {
    await cpage.waitForTimeout(1000);
    popupAny = await cpage.locator('text=طلب حجز جديد').first().isVisible().catch(() => false);
  }
  TRACE(`4) النافذة المنبثقة على صفحة غير اللوحة: ${popupAny}`);
  await cpage.screenshot({ path: `${OUT}/4-global-popup-non-dashboard.png`, fullPage: false });

  /* ─── 5) الدردشة: كسر الأسطر + تعديل/حذف + صوتي (بنود 11+12+13) ─── */
  /* v1.5.0-fix: تخطيّ النافذة بقوة (force) — Radix يقفل pointer-events على body
     عند فتح أي نافذة، والنقرة العادية تُحجب بصمت */
  await cpage.locator('button:has-text("تخطي")').first().click({ timeout: 3000, force: true }).catch(() => {});
  await cpage.waitForTimeout(900);
  await cpage.goto(`${BASE}/?session=${sid}`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await cpage.waitForTimeout(3500);
  /* v1.5.0-fix: لا حذف لعقد DOM تديرها Radix — كان يُسقط React ("Application error").
     النقرات بـ force تتجاوز pointer-events:none التي يفرضها Radix وأي تراكب نوافذ */
  cpage.on("pageerror", (e) => TRACE("PAGE-ERROR: " + String(e.message).slice(0, 200)));
  /* افتح الدردشة بانتظار فتح النافذة فعلاً (مع إعادة محاولة + force) */
  let chatOpened = false;
  for (let attempt = 0; attempt < 3 && !chatOpened; attempt++) {
    await cpage.locator('button:has-text("افتح الدردشة")').first().click({ timeout: 4000, force: true }).catch(() => {});
    await cpage.waitForTimeout(1500);
    chatOpened = await cpage.locator("textarea").first().isVisible().catch(() => false);
  }
  TRACE("5) نافذة الدردشة فُتحت (textarea ظاهر): " + chatOpened);
  await cpage.screenshot({ path: `${OUT}/5-chat-long-message-wrap.png`, fullPage: false });
  const micBtn = await cpage.locator('button[title*="صوتي"], button[aria-label*="صوتي"], button:has(svg.lucide-mic)').first().isVisible().catch(() => false);
  TRACE(`5) زر التسجيل الصوتي في الدردشة: ${micBtn}`);
  /* مرّر على رسالة العميل لتظهر أزرار تعديل/حذف إن كانت للأخصائي — هنا رسالة العميل
     فلا أزرار للأخصائي؛ نكتب رسالة من الأخصائي لنجرب */
  await cpage.locator("textarea").last().fill("رسالة من الأخصائي للتجربة");
  await cpage.keyboard.press("Enter");
  await cpage.waitForTimeout(1200);
  await cpage.screenshot({ path: `${OUT}/6-chat-counselor-msg.png`, fullPage: false });
  const dialogBox = await cpage.evaluate(() => {
    const el = document.querySelector("[data-slot=dialog-content]");
    return el ? { w: el.getBoundingClientRect().width, overflow: getComputedStyle(el).overflow } : null;
  });
  TRACE(`5) عرض نافذة الدردشة سليم: ${JSON.stringify(dialogBox)}`);

  /* ─── 6) الفوتر بلا تكرار (بند 19) ─── */
  const fpage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await fpage.goto(`${BASE}/?view=gratitude`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await fpage.waitForTimeout(2500);
  await fpage.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); });
  await fpage.waitForTimeout(700);
  const dup = await fpage.evaluate(() => {
    const el = Array.from(document.querySelectorAll("footer *, footer")).find((x) => (x.textContent || "").includes("© 2026"));
    return el ? el.textContent.includes("طمأنينة — طمأنينة") || /طمأنينة\s*—\s*طمأنينة/.test(el.textContent) : null;
  });
  TRACE(`6) الفوتر بلا تكرار «طمأنينة — طمأنينة»: ${dup === false ? "صحيح" : dup}`);
  await fpage.screenshot({ path: `${OUT}/7-footer.png`, fullPage: false });

  await browser.close();
  server.kill();
  await mongod.stop();
  TRACE("📸 لقطات v1.5.0 جاهزة");
  process.exit(0);
})().catch((e) => { TRACE("ERROR: " + (e.message || e)); process.exit(1); });
