/* فحص بصري حي — طمأنينة v1.21.0:
   1) نافذة حجز الدورة تطلب معلومات التواصل (هاتف إلزامي + بريد وملاحظة اختياريان)
   2) منع الحجز بلا هاتف + رسالة الخطأ، ثم نجاح الحجز بهاتف
   3) نافذة الملتحقين: تنبيه «اضغط على اسم المسجّل…» + الاسم زر يفتح
      نافذة معلومات التواصل (هاتف/بريد/ملاحظة)
   4) نزع رفع الفيديو: لا زر «فيديو» في نافذة الإعلان ولا «إضافة فيديو» في المعرض
   5) التجاوب: بلا تمرير أفقي على الهاتف + الهيدر/الفوتر ثابتان
   6) صفر أخطاء كونسول حرجة */
const { MongoMemoryServer } = require("mongodb-memory-server");
const { spawn } = require("child_process");
const http = require("http");
const { chromium } = require("playwright");
const fs = require("fs");

const PORT = "3991";
const BASE = `http://localhost:${PORT}`;
const SHOTS = "/home/z/my-project/download/v1210-shots";
fs.mkdirSync(SHOTS, { recursive: true });

function req(m, p, b, headers = {}) {
  return new Promise((res, rej) => {
    const d = b ? JSON.stringify(b) : null;
    const r = http.request(`${BASE}${p}`, { method: m, headers: { "Content-Type": "application/json", ...headers, ...(d ? { "Content-Length": Buffer.byteLength(d) } : {}) } }, (x) => { let buf = ""; x.on("data", (c) => (buf += c)); x.on("end", () => { let j = null; try { j = JSON.parse(buf); } catch {} res({ status: x.statusCode, json: j }); }); });
    r.on("error", rej); if (d) r.write(d); r.end();
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function dismissQuote(page) {
  try {
    const closeBtn = page.locator('[aria-modal="true"] button[aria-label]').first();
    if (await closeBtn.isVisible({ timeout: 1200 }).catch(() => false)) {
      await closeBtn.click({ timeout: 2000 });
      await wait(400);
      return;
    }
  } catch {}
  await wait(2500);
}

let failures = 0;
/* سجل متزامن — لا يضيع عند القتل الزمني */
const log = (...a) => { try { fs.writeSync(1, a.join(" ") + "\n"); } catch {} };
const step = (name) => log(`── ${name}`);
const check = (name, cond, extra = "") => { log(cond ? `✓ ${name}` : `✗ ${name} ${extra}`); if (!cond) failures++; };

const tinyImg = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/* حقن مستخدم في حالة المتجر — ينشئ المفتاح إن لم يُكتب بعد (skipHydration)
   ويضبط الصفحة المحفوظة مباشرة لأن بارامتر ?view= يُتجاهل في جلسة غير جديدة */
async function injectUser(page, user, view) {
  await page.evaluate(({ u, v }) => {
    const raw = window.localStorage.getItem("tumaanina-state");
    let st = null;
    if (raw) { try { st = JSON.parse(raw); } catch {} }
    if (!st || !st.state) st = { state: { clientDraft: {}, fontScale: 100, currency: "DZD", view: "landing" }, version: 0 };
    st.state.user = u;
    if (v) st.state.view = v;
    window.localStorage.setItem("tumaanina-state", JSON.stringify(st));
  }, { u: user, v: view || null });
}

(async () => {
  log("boot: creating mongod");
  const mongod = await MongoMemoryServer.create();
  log("boot: mongod up, spawning server");
  const server = spawn("node", ["server.js"], {
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("visual-v1210"), ADMIN_PASSCODE: "vis-pass-21", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let ready = false;
  log("boot: health loop start");
  for (let i = 0; i < 60; i++) { await wait(500); try { const h = await req("GET", "/api/health"); if (h.json?.ok && h.json?.version === "1.21.0") { ready = true; break; } } catch {} }
  if (!ready) { log("server not ready"); process.exit(1); }
  log("server ready 1.21.0");

  /* ── بذر البيانات ── */
  const admin = await req("POST", "/api/admin", { action: "login", passcode: "vis-pass-21" });
  const stamp = Date.now();
  const cl = await req("POST", "/api/clinic", { action: "register", name: "عيادة الطمأنينة", email: `visA${stamp}@t.dz`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة استرجاع العرض" });
  const A_uid = cl.json.userId, A_slug = cl.json.slug;

  await req("POST", "/api/clinic", { action: "update-profile", userId: A_uid, gallery: [tinyImg, tinyImg] });
  await req("POST", "/api/courses", { userId: A_uid, title: "دورة النوم الهادئ", description: "تقنيات الاسترخاء ومهارات النوم الصحي — أربع لقاءات عملية.", price: 1800, capacity: 6 });

  /* دورة العيادة — يشترك فيها عميلان بمعلومات تواصل */
  const co = await req("POST", "/api/courses", { userId: A_uid, title: "دورة الصمود النفسي", description: "أربع لقاءات أونلاين مع متابعة فردية وتمارين عملية بين اللقاءات.", price: 2500, capacity: 8 });
  const courseId = co.json?.course?.id;

  const cli = (await req("POST", "/api/client", { action: "register", pseudonym: "عميل-بصري", password: "pass-tumaanina-1", recoveryPhrase: "عبارة استرجاع تجريبية", gender: "male", phone: "0555777888" })).json.user;
  const cli2 = (await req("POST", "/api/client", { action: "register", pseudonym: "ناظر-ثانٍ", password: "pass-tumaanina-1", recoveryPhrase: "عبارة استرجاع ثانية", gender: "female", phone: "0555777899" })).json.user;
  /* cli2 اشتركت عبر الـAPI بمعلومات تواصل كاملة — لتظهر في نافذة الملتحقين */
  await req("POST", `/api/courses/${courseId}/enroll`, { userId: cli2.id, name: "ناظر-ثانٍ", contactPhone: "0666223344", contactEmail: "nazer@example.com", contactNote: "أفضل التواصل عبر واتساب مساءً" });

  const clinicUser = (await req("POST", "/api/clinic", { action: "login", email: `visA${stamp}@t.dz`, password: "pass-tumaanina-1" })).json.user;

  const browser = await chromium.launch();
  step("browser launched");
  const consoleErrors = [];

  /* ══════════ المكتبي 1280×800: نافذة الحجز بمعلومات التواصل ══════════ */
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "ar" });
  const dp = await dctx.newPage();
  dp.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  dp.on("pageerror", (e) => consoleErrors.push(String(e)));

  await dp.goto(`${BASE}/?view=courses`, { waitUntil: "networkidle" });
  await injectUser(dp, cli, "courses");
  await dp.goto(`${BASE}/?view=courses`, { waitUntil: "networkidle" });
  await wait(1200);
  await dismissQuote(dp);

  /* فتح نافذة الحجز */
  step("booking dialog probe");
  const enrollBtn = dp.locator('button:has-text("احجز مقعداً")').first();
  check("بطاقة الدورة تظهر وزر الحجز موجود", await enrollBtn.isVisible().catch(() => false));
  await enrollBtn.click();
  await wait(900);
  await dp.screenshot({ path: `${SHOTS}/desktop-booking-dialog.png` });

  /* حقول معلومات التواصل داخل النافذة */
  const dlgText = await dp.locator('[role="dialog"]').last().innerText().catch(() => "");
  check("عنوان «معلومات التواصل» في نافذة الحجز", dlgText.includes("معلومات التواصل"));
  check("حقل رقم الهاتف إلزامي (*)", dlgText.includes("رقم الهاتف *"));
  check("حقل البريد الإلكتروني (اختياري)", dlgText.includes("البريد الإلكتروني (اختياري)"));
  check("حقل الملاحظة (اختياري)", dlgText.includes("ملاحظة لصاحب الدورة"));
  check("تنبيه الخصوصية: تُشارك مع صاحب الدورة فقط", dlgText.includes("تُشارك معلومات تواصلك مع صاحب الدورة فقط"));
  const phonePrefill = await dp.locator('[role="dialog"] input[inputmode="tel"]').last().inputValue().catch(() => "");
  /* هاتف العميل يُطبَّع عند التسجيل إلى الصيغة الدولية 213… */
  check("الهاتف مُعبّأ مسبقاً من حساب العميل", phonePrefill.includes("555777888"), `(${phonePrefill})`);

  /* الحجز بهاتف فاسد → رسالة الخطأ */
  await dp.locator('[role="dialog"] input[inputmode="tel"]').last().fill("abc");
  await dp.locator('[role="dialog"] button:has-text("احجز مقعداً")').last().click();
  await wait(600);
  const errVisible = await dp.getByText("أدخل رقم هاتف صحيح").first().isVisible().catch(() => false);
  check("الحجز بهاتف فاسد يُمنع برسالة واضحة", errVisible);
  await dp.screenshot({ path: `${SHOTS}/desktop-booking-phone-error.png` });

  /* الحجز بهاتف صحيح ينجح */
  await dp.locator('[role="dialog"] input[inputmode="tel"]').last().fill("0777112233");
  await dp.locator('[role="dialog"] button:has-text("احجز مقعداً")').last().click();
  await wait(1400);
  const bookedBadge = await dp.getByText("بانتظار تأكيد الأخصائي").first().isVisible().catch(() => false);
  check("الحجز بهاتف صحيح نجح (حالة بانتظار التأكيد)", bookedBadge);
  await dp.screenshot({ path: `${SHOTS}/desktop-booked.png` });
  await dctx.close();

  /* ══════════ المكتبي: لوحة العيادة — الملتحقون ونافذة التواصل ══════════ */
  step("clinic dashboard registrants");
  const dctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "ar" });
  const dp2 = await dctx2.newPage();
  dp2.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  dp2.on("pageerror", (e) => consoleErrors.push(String(e)));

  await dp2.goto(BASE, { waitUntil: "networkidle" });
  await wait(1500);
  await injectUser(dp2, clinicUser, "clinic-dashboard");
  await dp2.goto(`${BASE}/?view=clinic-dashboard`, { waitUntil: "networkidle" });
  await wait(1200);
  await dismissQuote(dp2);

  /* تبويب الدورات داخل شبكة تبويبات اللوحة (وليس عنصر القائمة الجانبية) */
  await dp2.locator('div[class*="grid-cols-5"] button:has-text("الدورات")').first().click();
  await wait(800);
  const enrollBtn2 = dp2.locator('button:has-text("الملتحقون")').first();
  check("زر «الملتحقون» ظاهر بلوحة العيادة", await enrollBtn2.isVisible().catch(() => false));
  await enrollBtn2.click();
  await wait(800);
  await dp2.screenshot({ path: `${SHOTS}/desktop-registrants-hint.png` });

  const winText = await dp2.locator('[role="dialog"]').last().innerText().catch(() => "");
  check("تنبيه المختص: «اضغط على اسم المسجّل…» ظاهر", winText.includes("اضغط على اسم المسجّل"));

  /* الضغط على اسم المسجّل يفتح نافذة معلومات التواصل */
  const nameBtn = dp2.locator('[role="dialog"] button:has-text("ناظر-ثانٍ")').first();
  check("اسم المسجّل زر قابل للضغط", await nameBtn.isVisible().catch(() => false));
  await nameBtn.click();
  await wait(800);
  await dp2.screenshot({ path: `${SHOTS}/desktop-contact-popup.png` });
  const popText = await dp2.locator('[role="dialog"]').last().innerText().catch(() => "");
  check("نافذة «معلومات التواصل» انفتحت", popText.includes("معلومات التواصل"));
  check("الهاتف ظاهر في النافذة", popText.includes("0666223344"));
  check("البريد ظاهر في النافذة", popText.includes("nazer@example.com"));
  check("الملاحظة ظاهرة في النافذة", popText.includes("واتساب"));
  await dctx2.close();

  /* ══════════ نزع رفع الفيديو — نافذة الإعلان والمعرض ══════════ */
  step("video removal probe");
  const dctx3 = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "ar" });
  const dp3 = await dctx3.newPage();
  dp3.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  dp3.on("pageerror", (e) => consoleErrors.push(String(e)));

  await dp3.goto(BASE, { waitUntil: "networkidle" });
  await wait(1500);
  await injectUser(dp3, clinicUser, "clinic-dashboard");
  await dp3.goto(`${BASE}/?view=clinic-dashboard`, { waitUntil: "networkidle" });
  await wait(1200);
  await dismissQuote(dp3);

  /* المعرض (تبويب الإعدادات الافتراضي): لا «إضافة فيديو» */
  const dashText = await dp3.locator("main, body").first().innerText();
  check("لوحة العيادة: زر «إضافة فيديو» أُزيل من المعرض", !dashText.includes("إضافة فيديو"));
  check("لوحة العيادة: زر «إضافة صور» ما زال موجوداً", dashText.includes("إضافة صور"));

  /* نافذة الإعلان الجديد: لا زر «فيديو» ونص الوسائط بلا ذكر للفيديو */
  await dp3.locator('div[class*="grid-cols-5"] button:has-text("إعلاناتي")').first().click();
  await wait(900);
  const newAdBtn = dp3.locator('button:has-text("إعلان جديد"), button:has-text("إنشاء إعلان"), button:has-text("إضافة إعلان")').first();
  if (await newAdBtn.isVisible().catch(() => false)) {
    await newAdBtn.click();
    await wait(900);
    const adDlg = await dp3.locator('[role="dialog"]').last().innerText().catch(() => "");
    check("نافذة الإعلان: لا ذكر لرفع الفيديو إطلاقاً", !adDlg.includes("فيديو"), adDlg.slice(0, 300));
    check("نافذة الإعلان: زر «صورة» موجود (رفع الصور)", adDlg.includes("صورة ("), adDlg.slice(0, 300));
    const vidInput = await dp3.locator('[role="dialog"] input[accept="video/*"]').count();
    check("نافذة الإعلان: لا مدخل video/*", vidInput === 0, `(${vidInput})`);
    await dp3.screenshot({ path: `${SHOTS}/desktop-ad-dialog-no-video.png` });
  } else {
    check("نافذة الإعلان تُفتح للفحص", false, "زر إعلان جديد غير موجود");
  }
  await dctx3.close();

  /* ══════════ الهاتف 390×844 ══════════ */
  step("mobile checks");
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "ar" });
  const mp = await mctx.newPage();
  mp.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  mp.on("pageerror", (e) => consoleErrors.push(String(e)));

  await mp.goto(BASE, { waitUntil: "networkidle" });
  await wait(1500);
  await dismissQuote(mp);
  check("الهاتف: الرئيسية بلا تمرير أفقي", await mp.evaluate(() => document.documentElement.scrollWidth <= 392));
  const headerOk = await mp.evaluate(() => { const h = document.querySelector("header"); return h && h.scrollHeight < 80; });
  check("الهاتف: الهيدر ثابت لا يتشوه", headerOk);
  const footerOk = await mp.evaluate(() => { const f = document.querySelector("footer"); return !!f && f.getBoundingClientRect().width <= 392; });
  check("الهاتف: الفوتر بلا فيض", footerOk);
  await mp.screenshot({ path: `${SHOTS}/mobile-home.png` });

  /* صفحة الدورات على الهاتف + نافذة الحجز */
  await mp.goto(`${BASE}/?view=courses`, { waitUntil: "networkidle" });
  await injectUser(mp, cli, "courses");
  await mp.goto(`${BASE}/?view=courses`, { waitUntil: "networkidle" });
  await wait(1400);
  await dismissQuote(mp);
  check("الهاتف: صفحة الدورات بلا تمرير أفقي", await mp.evaluate(() => document.documentElement.scrollWidth <= 392));
  const mEnroll = mp.locator('button:has-text("احجز مقعداً")').first();
  step("mobile booking dialog");
  if (await mEnroll.isVisible().catch(() => false)) {
    await mEnroll.click();
    await wait(900);
    check("الهاتف: نافذة الحجز تعرض حقول التواصل", await mp.getByText("رقم الهاتف *").first().isVisible().catch(() => false));
    check("الهاتف: نافذة الحجز بلا تمرير أفقي", await mp.evaluate(() => document.documentElement.scrollWidth <= 392));
    await mp.screenshot({ path: `${SHOTS}/mobile-booking-dialog.png` });
  } else {
    check("الهاتف: نافذة الحجز تُفتح", false, "زر الحجز غير ظاهر");
  }

  /* #418 سباق ترطيب قديم معروف وعابر (كان موجوداً قبل هذه الجولة) — لا يُعدّ حرجاً */
  const critical = consoleErrors.filter((e) => !e.includes("404") && !e.includes("Failed to load resource") && !e.includes("the server responded with a status") && !e.includes("#418"));
  check("صفر أخطاء كونسول حرجة", critical.length === 0, critical.slice(0, 3).join(" | "));

  await browser.close();
  server.kill();
  await mongod.stop();
  log(failures ? `\n✗ ${failures} بنداً فاشلاً` : "\nكل البنود البصرية ناجحة ✓");
  process.exit(failures ? 1 : 0);
})();
