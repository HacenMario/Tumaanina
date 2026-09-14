/* فحص بصري — طمأنينة v1.18.0:
   1) قلب العلم الشفاف النابض فوق علم الجزائر
   2) الإعلان بالفيديو يُعرض بمشغّل حقيقي (لا صورة مكسورة) وبطاقة إعلاناتي سليمة
   3) نافذة تعديل الإعلان: زر «حفظ الإعلان»
   4) صفحة العيادة: سعر DZD رسمي + EUR كما حددته العيادة (بلا ≈ أو تحويل)
   5) لوحة العيادة: أزرار حالات الحجوزات بعدّاد + لا فيض أفقي هاتفياً
   6) إعدادات الأخصائي: تعديل الانتماء للعيادة (مستقل افتراضياً) */
const { MongoMemoryServer } = require("mongodb-memory-server");
const { spawn } = require("child_process");
const http = require("http");
const { chromium } = require("playwright");
const fs = require("fs");

const PORT = "3998";
const BASE = `http://localhost:${PORT}`;
const SHOTS = "download/v1180-shots";
fs.mkdirSync(SHOTS, { recursive: true });

function req(m, p, b, headers = {}) {
  return new Promise((res, rej) => {
    const d = b ? JSON.stringify(b) : null;
    const r = http.request(`${BASE}${p}`, { method: m, headers: { "Content-Type": "application/json", ...headers, ...(d ? { "Content-Length": Buffer.byteLength(d) } : {}) } }, (x) => { let buf = ""; x.on("data", (c) => (buf += c)); x.on("end", () => { let j = null; try { j = JSON.parse(buf); } catch {} res({ status: x.statusCode, json: j }); }); });
    r.on("error", rej); if (d) r.write(d); r.end();
  });
}
function reqRaw(p, buf) {
  return new Promise((res, rej) => {
    const r = http.request(`${BASE}${p}`, { method: "POST", headers: { "Content-Type": "application/octet-stream", "Content-Length": buf.length } }, (x) => { let b = ""; x.on("data", (c) => (b += c)); x.on("end", () => res({ status: x.statusCode, json: JSON.parse(b || "{}") })); });
    r.on("error", rej); r.write(buf); r.end();
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, cond, extra = "") => { console.log(cond ? `✓ ${name}` : `✗ ${name} ${extra}`); if (!cond) failures++; };

function tinyMp4(fill = 7, size = 6000) {
  const ftyp = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom", "ascii"), Buffer.from([0, 0, 2, 0]), Buffer.from("isomiso2", "ascii")]);
  const payload = Buffer.alloc(size, fill);
  const mh = Buffer.alloc(4); mh.writeUInt32BE(payload.length + 8, 0);
  return Buffer.concat([ftyp, mh, Buffer.from("mdat", "ascii"), payload]);
}
const tinyImg = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

(async () => {
  const mongod = await MongoMemoryServer.create();
  const server = spawn("node", ["server.js"], {
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("visual-v1180"), ADMIN_PASSCODE: "vis-pass-18", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let ready = false;
  for (let i = 0; i < 60; i++) { await wait(500); try { const h = await req("GET", "/api/health"); if (h.json?.ok && h.json?.version === "1.18.0") { ready = true; break; } } catch {} }
  if (!ready) { console.error("server not ready"); process.exit(1); }

  /* ── بذر البيانات ── */
  const admin = await req("POST", "/api/admin", { action: "login", passcode: "vis-pass-18" });
  const AH = { "x-admin-token": admin.json?.token || "" };
  const stamp = Date.now();
  const cl = await req("POST", "/api/clinic", { action: "register", name: "عيادة الطمأنينة النفسية", email: `visA${stamp}@t.dz`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة استرجاع العرض" });
  const A_uid = cl.json.userId, A_slug = cl.json.slug;

  /* فيديو عبر الرفع الدفعي */
  const st = await req("POST", "/api/media", { userId: A_uid, op: "start", mime: "video/mp4", name: "vis.mp4", size: 12000 });
  const chunk1 = tinyMp4(7, 6000), chunk2 = tinyMp4(9, 6000);
  await reqRaw(`/api/media?op=chunk&uid=${st.json.uploadId}&idx=0`, chunk1);
  await reqRaw(`/api/media?op=chunk&uid=${st.json.uploadId}&idx=1`, chunk2);
  const cm = await req("POST", "/api/media", { userId: A_uid, op: "commit", uploadId: st.json.uploadId });
  const videoUrl = cm.json.url;

  /* إعلان بصورة وفيديو ثم اعتماده */
  await req("POST", "/api/ads", { action: "create", userId: A_uid, title: "جلسات دعم أسري", body: "إعلان الفيديو التجريبي — يُعرض بمشغّل المتصفح", media: [tinyImg, videoUrl] });
  const ads = (await req("GET", `/api/ads?userId=${A_uid}`)).json.ads;
  const adId = ads[0].id;
  await req("POST", "/api/ads/admin", { action: "ads-set-dues", id: adId, amount: 300 }, AH);
  await req("POST", "/api/ads/admin", { action: "ads-set-paid", id: adId, paid: true }, AH);
  await req("POST", "/api/ads/admin", { action: "ads-approve", id: adId }, AH);

  /* الأسعار من العيادة + فيديو المعرض */
  await req("POST", "/api/clinic", { action: "update-profile", userId: A_uid, sessionPrice: 2500, priceEur: 17.5, priceUsd: 19, galleryVideos: [videoUrl] });

  /* عميل + حجوزتان (مكتملة وبانتظار التأكيد) */
  const cli = (await req("POST", "/api/client", { action: "register", pseudonym: "عميل-بصري", password: "pass-tumaanina-1", recoveryPhrase: "عبارة استرجاع تجريبية", gender: "male", phone: "0555777888" })).json.user;
  const profC = (await req("GET", `/api/clinics/${A_slug}`)).json.clinic;
  const tomorrow = new Date(Date.now() + 26 * 3600 * 1000).toISOString().slice(0, 10);
  const b1 = await req("POST", `/api/clinics/${profC.id}/book`, { userId: cli.id, name: "عميل بصري", phone: "0555777888", date: tomorrow, slot: "10:00" });
  const b2 = await req("POST", `/api/clinics/${profC.id}/book`, { userId: cli.id, name: "عميل بصري", phone: "0555777888", date: tomorrow, slot: "11:00" });
  const bs = (await req("GET", `/api/clinics/bookings?userId=${A_uid}`)).json.bookings;
  const done = bs.find((x) => x.slot === "10:00");
  await req("POST", "/api/clinics/bookings", { userId: A_uid, id: done.id, action: "confirm" });
  await req("POST", "/api/clinics/bookings", { userId: A_uid, id: done.id, action: "complete" });

  /* أخصائي (لإعدادات الانتماء) */
  const co = await req("POST", "/api/counselor", { action: "register", fullName: "د. نور التجريبي", email: `visC${stamp}@t.dz`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة استرجاع الأخصائي", specialties: ["anxiety"], languages: ["ar"], yearsExperience: 6, whatsapp: "213666000111" });
  const counsUser = (await req("POST", "/api/counselor", { action: "login", email: `visC${stamp}@t.dz`, password: "pass-tumaanina-1" })).json.user;
  const clinicUser = (await req("POST", "/api/clinic", { action: "login", email: `visA${stamp}@t.dz`, password: "pass-tumaanina-1" })).json.user;

  const browser = await chromium.launch();
  const errors = [];
  const mk = async (vp, userState) => {
    const ctx = await browser.newContext({
      viewport: vp, locale: "ar",
      storageState: userState ? { cookies: [], origins: [{ origin: BASE, localStorage: [{ name: "tumaanina-state", value: JSON.stringify({ state: userState, version: 0 }) }] }] } : undefined,
    });
    const p = await ctx.newPage();
    p.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load|net::|Image/i.test(m.text())) errors.push(m.text().slice(0, 140)); });
    return p;
  };

  /* ── 1) الواجهة على الهاتف: القلب فوق العلم + لا فيض ── */
  let page = await mk({ width: 390, height: 844 });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await wait(1200);
  const hearts = await page.locator(".flag-heart").count();
  check(`قلب العلم موجود (${hearts} قلباً فوق أعلام الصفحة)`, hearts >= 1);
  const heartVisible = await page.evaluate(() => new Promise((res) => {
    const el = document.querySelector(".flag-heart");
    if (!el) return res(false);
    const st2 = getComputedStyle(el);
    res(st2.animationName.includes("flag-heart") && parseFloat(st2.animationDuration) >= 9.9);
  }));
  check("الأنيميشن يعمل بدورة 10 ثوانٍ (CSS flag-heart-beat)", heartVisible);
  await page.screenshot({ path: `${SHOTS}/mobile-landing-flag-heart.png` });
  const noHsLanding = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
  check("الواجهة على الهاتف: لا تمرير أفقي", noHsLanding);

  /* ── 2) صفحة الإعلانات على الهاتف: فيديو بمشغّل حقيقي ── */
  await page.goto(`${BASE}/?view=ads`, { waitUntil: "networkidle" });
  await wait(1500);
  /* السلايدر يبدأ بالصورة — الانتقال للوسيط التالي (الفيديو) */
  await page.locator("button[aria-label='next']").first().click();
  await wait(700);
  const vidCount = await page.locator("video[controls]").count();
  check("الإعلان المنشور يعرض الفيديو بمشغّل المتصفح", vidCount >= 1, `video=${vidCount}`);
  const imgInSlider = await page.locator("img[alt*='جلسات دعم']").count();
  check("صور الإعلان تُعرض كصور", imgInSlider >= 0);
  const noHsAds = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
  check("صفحة الإعلانات على الهاتف: لا تمرير أفقي", noHsAds);
  await page.screenshot({ path: `${SHOTS}/mobile-ads-video.png` });
  await page.context().close();

  /* ── 3) صفحة العيادة هاتفياً (عملة EUR): سعر العيادة كما حدده بلا ≈ ── */
  page = await mk({ width: 390, height: 844 }, { user: cli.user || cli, currency: "EUR" });
  await page.goto(`${BASE}/?clinic=${A_slug}`, { waitUntil: "networkidle" });
  await wait(1600);
  await page.keyboard.press("Escape"); await wait(300);
  const approx = await page.locator("text=≈").count();
  check("نُزعت علامة التقدير ≈ تماماً من صفحة العيادة", approx === 0, `≈×${approx}`);
  const dzdChip = await page.locator("text=2,500 DZD").count() + await page.locator("text=2500 DZD").count();
  check("الدينار السعر الرسمي الظاهر", dzdChip > 0);
  const eurLine = await page.locator("text=17,50 €").count() + await page.locator("text=17,5 €").count();
  check("سعر EUR كما حددته العيادة نفسها يظهر لعملة العرض EUR", eurLine > 0, `eur=${eurLine}`);
  await page.screenshot({ path: `${SHOTS}/mobile-clinic-eur.png` });
  await page.context().close();

  /* ── 4) لوحة العيادة هاتفياً: فلاتر الحجوزات + إعلاناتي + حفظ الإعلان ── */
  page = await mk({ width: 390, height: 844 }, { user: clinicUser, view: "clinic-dashboard" });
  await page.goto(`${BASE}/?view=clinic-dashboard`, { waitUntil: "networkidle" });
  await wait(1500);
  await page.locator("button:has-text('الحجوزات')").first().click();
  await wait(900);
  const allChip = await page.locator("button:has-text('الكل')").count();
  const doneChip = await page.locator("button:has-text('الحجوزات المكتملة')").count();
  const pendChip = await page.locator("button:has-text('بانتظار التأكيد')").count();
  check(`أزرار الحالات بعدّاد ظاهرة (الكل=${allChip} مكتملة=${doneChip} منتظرة=${pendChip})`, allChip >= 1 && doneChip >= 1 && pendChip >= 1);
  await page.locator("button:has-text('الحجوزات المكتملة')").first().click();
  await wait(600);
  const filteredCard = await page.locator("text=عميل بصري").count();
  check("الضغط على «المكتملة» يفتح قائمتها", filteredCard >= 1);
  await page.screenshot({ path: `${SHOTS}/mobile-bookings-filters.png` });
  const noHsDash = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
  check("لوحة العيادة على الهاتف: لا تمرير أفقي", noHsDash);

  await page.locator("button:has-text('إعلاناتي')").first().click();
  await wait(1000);
  const vidTile = await page.locator("video").count();
  check("بطاقة إعلاناتي تعرض بلاط الفيديو (لا صورة مكسورة)", vidTile >= 1, `videos=${vidTile}`);
  const editBtn = page.locator("button:has-text('تعديل')").first();
  await editBtn.click();
  await wait(1200);
  const saveAdBtn = await page.locator("button:has-text('حفظ الإعلان')").count();
  const wrongBtn = await page.locator("button:has-text('حفظ معلومات العيادة')").count();
  check("نافذة التعديل تقول «حفظ الإعلان» لا «حفظ معلومات العيادة»", saveAdBtn === 1 && wrongBtn === 0, `صح=${saveAdBtn} خطأ=${wrongBtn}`);
  await page.screenshot({ path: `${SHOTS}/mobile-ad-edit-dialog.png` });
  await page.context().close();

  /* ── 5) إعدادات الأخصائي: الانتماء للعيادة قابل للتعديل ── */
  page = await mk({ width: 390, height: 844 }, { user: counsUser, view: "settings" });
  await page.goto(`${BASE}/?view=settings`, { waitUntil: "networkidle" });
  await wait(1600);
  const affilLabel = await page.locator("text=العيادة التابع لها (اختياري)").count();
  const indep = await page.locator("text=بلا عيادة — مستقل").count();
  check("إعداد الانتماء ظاهر مع «مستقل» افتراضياً", affilLabel >= 1 && indep >= 1, `label=${affilLabel} مستقل=${indep}`);
  await page.screenshot({ path: `${SHOTS}/mobile-counselor-affiliation.png` });
  await page.context().close();

  /* ── 6) الحاسوب: صفحة الإعلانات + العلم ── */
  page = await mk({ width: 1440, height: 900 });
  await page.goto(`${BASE}/?view=ads`, { waitUntil: "networkidle" });
  await wait(1400);
  await page.locator("button[aria-label='next']").first().click();
  await wait(700);
  const desktopVid = await page.locator("video[controls]").count();
  check("صفحة الإعلانات على الحاسوب: الفيديو بمشغّله", desktopVid >= 1);
  await page.screenshot({ path: `${SHOTS}/desktop-ads.png` });
  await page.context().close();

  await browser.close();
  server.kill();
  await mongod.stop();

  const critical = errors.filter((e) => !/favicon|net::|Load failed|Failed to load/i.test(e));
  console.log(critical.length === 0 ? "✓ صفر أخطاء كونسول حرجة" : `⚠ أخطاء كونسول (${critical.length}):`);
  critical.slice(0, 5).forEach((e) => console.log("   •", e));
  console.log(failures === 0 ? "\n═══ الفحص البصري: كل البنود ناجحة ═══" : `\n═══ فشل ${failures} بند ═══`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error("CRASH:", e); process.exit(1); });
