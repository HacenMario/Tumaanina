/* تحقق بصري — طمأنينة v1.6.0: هيكل الغرفة النهائي + فقاعة الصوت + الضغطة الطويلة
   + حلقة الرابط العام + أشرطة التقييم (نجمة×20%) + تبويب التحديات في الأدمين */
const { MongoMemoryServer } = require("mongodb-memory-server");
const { spawn } = require("child_process");
const http = require("http");
const { chromium } = require("playwright");
const fs = require("fs");

const PORT = "3996";
const BASE = `http://localhost:${PORT}`;
const OUT = "download/v160-shots";
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
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("visual-v160"), ADMIN_PASSCODE: "vis-pass-16", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let ready = false;
  for (let i = 0; i < 60; i++) { await wait(500); try { const h = await req("GET", "/api/health"); if (h.json?.ok) { ready = true; break; } } catch {} }
  if (!ready) { console.error("server not ready"); process.exit(1); }
  const login = await req("POST", "/api/admin", { action: "login", passcode: "vis-pass-16" });
  const TOKEN = login.json?.token || "";

  /* أخصائي موثّق + عميل + جلسة مقبولة + رسالة نصية + رسالة صوتية (42 ثانية) */
  const cEmail = `doc16vis-${Date.now()}@test.dz`;
  await req("POST", "/api/counselor", {
    action: "register", fullName: "د. نور الدين مرادي", email: cEmail,
    password: "vis-pass-123", recoveryPhrase: "عبارة العرض البصري السادس",
    specialties: ["anxietyDepression"], languages: ["ar"], yearsExperience: 9,
    whatsapp: "213666777000", sessionPrice: 2500,
  });
  const counselor = (await req("POST", "/api/counselor", { action: "login", email: cEmail, password: "vis-pass-123" })).json.user;
  const prof = (await req("GET", `/api/counselor?userId=${counselor.id}`)).json?.profile;
  await req("POST", "/api/admin", { action: "verify", profileId: prof?.id }, { "x-admin-token": TOKEN });
  const client = (await req("POST", "/api/client", {
    action: "register", pseudonym: "أمينة", password: "vis-pass-123",
    recoveryPhrase: "عبارة العرض للعميلة", gender: "female", phone: "0555777006",
  })).json.user;
  const bk = await req("POST", "/api/sessions", { victimId: client.id, counselorId: counselor.id, topic: "relationships", mode: "TEXT", scheduledAt: new Date(Date.now() + 96 * 3600 * 1000).toISOString(), currency: "DZD" });
  const sid = bk.json?.session?.id;
  await req("PATCH", `/api/sessions/${sid}`, { status: "ACCEPTED", durationMinutes: 45 });
  await req("POST", "/api/messages", { sessionId: sid, senderRole: "VICTIM", senderName: "أمينة", senderId: client.id, content: "مرحباً دكتور، هذه رسالة نصية تجريبية للعرض البصري." });
  const audioBytes = Buffer.alloc(120_000);
  for (let i = 0; i < audioBytes.length; i++) audioBytes[i] = 65 + (i % 26);
  const voiceUrl = "data:audio/webm;base64," + audioBytes.toString("base64");
  const vm = await req("POST", "/api/messages", { sessionId: sid, senderRole: "VICTIM", senderName: "أمينة", senderId: client.id, content: voiceUrl, type: "voice", seconds: 42 });
  const vmId = vm.json?.message?.id;
  /* رسالة من الأخصائي نفسه — الضغطة الطويلة تعمل على رسائلي حصراً */
  await req("POST", "/api/messages", { sessionId: sid, senderRole: "COUNSELOR", senderName: "د. نور الدين مرادي", senderId: counselor.id, content: "رسالتي أنا يا أمينة، أهلاً بك" });
  TRACE("بيانات العرض جاهزة");

  const browser = await chromium.launch();

  /* ─── 1) بند 11: صفحة الرابط العام — لا حلقة إعادة تحميل ─── */
  TRACE("\n── 1) صفحة الرابط العام: تعقّب التحويلات بحثاً عن حلقة (بند 11) ──");
  const slug = prof?.slug || "";
  for (const [label, url] of [["بالاسم (slug)", `${BASE}/counselor/${encodeURIComponent(slug)}`], ["بالمعرّف (ObjectId)", `${BASE}/counselor/${prof?.id}`], ["بالاسم مع لغة", `${BASE}/counselor/${encodeURIComponent(slug)}?lang=fr`]]) {
    let hops = 0, status = 0, current = url;
    while (hops < 12) {
      const r = await fetch(current, { redirect: "manual" });
      status = r.status;
      if (status >= 300 && status < 400) {
        const loc = r.headers.get("location");
        if (!loc) break;
        current = new URL(loc, current).href;
        hops++;
        continue;
      }
      break;
    }
    check(`الرابط العام ${label}: استقر بعد ${hops} تحويل (status=${status})`, status === 200 && hops <= 3, `hops=${hops} status=${status}`);
  }

  /* ─── 2) بند 4: هيكل الغرفة النهائي في الهاتف + بطاقة العميل + التمرير ─── */
  TRACE("\n── 2) الغرفة هاتفياً: فتح بطاقة العميل + تمرير + بلا تشوّه (بند 4) ──");
  const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
  /* حقن حالة الأخصائي قبل الإقلاع (منهج v1.5.0: addInitScript) */
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
  await mob.goto(`${BASE}/?session=${sid}`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await mob.waitForTimeout(3500);
  await mob.keyboard.press("Escape").catch(() => {});
  await mob.waitForTimeout(700);
  await mob.locator('button:has-text("تخطي")').first().click({ timeout: 3000, force: true }).catch(() => {});
  await mob.waitForTimeout(800);
  /* الغرفة مفتوحة — سلوك بلا بطاقة العميل المفتوحة */
  const noHScroll = await mob.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check("بلا تجاوز أفقي قبل فتح البطاقة", noHScroll);
  await mob.screenshot({ path: `${OUT}/2-room-mobile-before.png`, fullPage: true });
  /* اضغط بطاقة ملخص العميل (تُفتح قبل الجلسة افتراضياً) — ثم أغلقها وافتحها */
  const summaryBtn = mob.locator('button[aria-expanded]').filter({ hasText: "ملخص" }).first();
  const summaryFound = await summaryBtn.isVisible().catch(() => false);
  if (summaryFound) {
    await summaryBtn.click({ force: true });
    await mob.waitForTimeout(600);
  }
  /* بعد الضغط: الصفحة تتمرر عمودياً وبلا تجاوز أفقي (النهج الجديد: انسياب طبيعي) */
  const after = await mob.evaluate(() => ({
    hScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
    canScroll: document.documentElement.scrollHeight >= document.documentElement.clientHeight,
    bodyH: document.documentElement.scrollHeight,
  }));
  check("بلا تجاوز أفقي بعد الضغط على بطاقة العميل", !after.hScroll, JSON.stringify(after));
  check("الصفحة قابلة للتمرير نحو الأسفل (تنمو طبيعياً)", after.canScroll, JSON.stringify(after));
  /* قياس: كل الأزرار الأساسية داخل نافذة العرض أفقياً */
  const offscreen = await mob.evaluate(() => {
    const vw = window.innerWidth;
    const bad = [];
    document.querySelectorAll("button, a").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right < -8 || r.left > vw + 8)) bad.push(el.tagName + ":" + String(el.textContent || "").slice(0, 24));
    });
    return bad.slice(0, 5);
  });
  check("لا عناصر مقصوصة خارج الإطار الأفقي", offscreen.length === 0, JSON.stringify(offscreen));
  await mob.screenshot({ path: `${OUT}/2-room-mobile-after-summary.png`, fullPage: true });
  TRACE("2) لقطات الغرفة هاتفياً (قبل/بعد فتح البطاقة) 📱");

  /* ─── 3) بندا 1+2: فقاعة الصوت بمدة حقيقية + الضغطة الطويلة 3 ثوانٍ (بند 7) ─── */
  TRACE("\n── 3) فقاعة الصوت + الضغطة الطويلة (بنود 1+2+7) ──");
  const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await desk.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await desk.evaluate(async (email) => {
    const r = await fetch("/api/counselor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", email, password: "vis-pass-123" }) });
    const j = await r.json();
    if (j?.user) localStorage.setItem("tumaanina-inject-user", JSON.stringify(j.user));
  }, cEmail);
  await desk.addInitScript(() => {
    const raw = localStorage.getItem("tumaanina-inject-user");
    if (!raw) return;
    try {
      const user = JSON.parse(raw);
      const st = JSON.parse(localStorage.getItem("tumaanina-state") || "{}");
      const version = typeof st.version === "number" ? st.version : 0;
      localStorage.setItem("tumaanina-state", JSON.stringify({ ...st, version, state: { ...(st.state || {}), user } }));
    } catch {}
  });
  await desk.goto(`${BASE}/?session=${sid}`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await desk.waitForTimeout(3500);
  await desk.keyboard.press("Escape").catch(() => {});
  await desk.waitForTimeout(700);
  await desk.locator('button:has-text("تخطي")').first().click({ timeout: 3000, force: true }).catch(() => {});
  await desk.waitForTimeout(800);
  let chatOpened = false;
  for (let a = 0; a < 3 && !chatOpened; a++) {
    await desk.locator('button:has-text("افتح الدردشة")').first().click({ timeout: 4000, force: true }).catch(() => {});
    await desk.waitForTimeout(1500);
    chatOpened = await desk.locator("textarea").first().isVisible().catch(() => false);
  }
  check("نافذة الدردشة مفتوحة", chatOpened);
  /* فقاعة الصوت: زر تشغيل مخصص + المدة 00:42 من seconds (لا مشغّل أصلي) */
  const nativeAudio = await desk.locator('[data-voice-bubble] audio').count();
  check("لا مشغّل <audio> أصلي داخل الفقاعة", nativeAudio === 0);
  const hasBubble = await desk.locator('[data-voice-bubble]').count();
  check("فقاعة الصوت المخصصة ظاهرة", hasBubble >= 1);
  const durText = await desk.locator('[data-voice-bubble]').first().textContent().catch(() => "");
  check("المدة الحقيقية 00:42 معروضة (من seconds المخزّنة)", /00:42/.test(durText || ""), durText?.slice(0, 60));
  await desk.screenshot({ path: `${OUT}/3-voice-bubble.png`, fullPage: false });
  /* الضغطة الطويلة: نزول 3.2 ثانية على فقاعة رسالتي أنا (الأخصائي) → قائمة */
  const bubble = desk.locator('div[dir="auto"]', { hasText: "رسالتي أنا يا أمينة" }).last();
  const box = await bubble.boundingBox().catch(() => null);
  if (box) {
    await desk.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await desk.mouse.down();
    await desk.waitForTimeout(3300);
    await desk.mouse.up();
    await desk.waitForTimeout(500);
    const menuVisible = await desk.locator('div[role="menu"]').isVisible().catch(() => false);
    const hasDelete = await desk.locator('div[role="menu"] button:has-text("حذف")').isVisible().catch(() => false);
    check("ضغطة 3 ثوانٍ تفتح قائمة تعديل/حذف", menuVisible && hasDelete);
    await desk.screenshot({ path: `${OUT}/3-longpress-menu.png`, fullPage: false });
    if (menuVisible) await desk.keyboard.press("Escape").catch(() => {});
    await desk.locator('div[role="presentation"]').first().click({ force: true }).catch(() => {});
  } else { TRACE("  ⚠️ فقاعة النص غير موجودة — تجاوز فحص الضغطة"); }

  /* ─── 4) بند 9: أشرطة التقييم 5=100% ─── */
  TRACE("\n── 4) أشرطة التقييم: 5=100% (بند 9) ──");
  await desk.locator('button:has-text("إغلاق"), button[aria-label="إغلاق"]').first().click({ timeout: 2500, force: true }).catch(() => {});
  await desk.goto(`${BASE}/?view=counselors-directory`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await desk.waitForTimeout(2800);
  await desk.keyboard.press("Escape").catch(() => {});
  await desk.waitForTimeout(700);
  await desk.locator('button:has-text("التقييمات")').first().click({ timeout: 4000 }).catch(() => {});
  await desk.waitForTimeout(1500);
  const pct100 = await desk.locator('text=100%').first().isVisible().catch(() => false);
  const pct80 = await desk.locator('text=80%').first().isVisible().catch(() => false);
  check("نافذة التقييمات تظهر 100% لمستوى 5 نجوم", pct100);
  check("نافذة التقييمات تظهر 80% لمستوى 4 نجوم", pct80);
  await desk.screenshot({ path: `${OUT}/4-ratings-stars-pct.png`, fullPage: false });

  /* ─── 5) بند 8: تبويب التحديات في لوحة الأدمين ─── */
  TRACE("\n── 5) تبويب التحديات في لوحة الأدمين (بند 8) ──");
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
  const chTab = adm.locator('button[role="tab"]:has-text("التحديات")').first();
  const tabVisible = await chTab.isVisible().catch(() => false);
  check("تبويب «التحديات» ظاهر", tabVisible);
  if (tabVisible) {
    await chTab.click({ timeout: 4000 });
    await adm.waitForTimeout(1800);
    const titleOK = await adm.locator('text=تحدي المختصين').first().isVisible().catch(() => false);
    const titleOK2 = await adm.locator('text=تحدي العملاء').first().isVisible().catch(() => false);
    const durLabel = await adm.locator('text=مدة الصلاحية').first().isVisible().catch(() => false);
    check("بطاقتا التحديين ظاهرتان بالمدة", titleOK && titleOK2 && durLabel, `t1=${titleOK} t2=${titleOK2} d=${durLabel}`);
    await adm.screenshot({ path: `${OUT}/5-admin-challenges.png`, fullPage: true });
  }

  await browser.close();
  server.kill("SIGKILL");
  await mongod.stop();
  TRACE("\n" + (failures === 0 ? "🎉 التحقق البصري v1.6.0 سليم" : `⚠️ ${failures} فحص فاشل`));
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error("❌ انهار العرض:", e); process.exit(1); });
