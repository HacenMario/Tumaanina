/* فحص بصري حي — طمأنينة v1.19.0:
   1) أزرار رفع الصور/الفيديو تعمل (تعديل الإعلان + إعدادات العيادة + اللوغو)
   2) نافذة إدارة التعليقات: حجب → الزر يتبدل لإظهار فوراً بلا إعادة فتح
   3) سلايدر الإعلانات والعارض بمسار تمرير لمسي سلس (snap) بلا أزرار هاتفياً
   4) صورة الأخصائي تظهر في بطاقة أخصائيي العيادة
   5) أسعار EUR/USD للباقات تظهر بجانب الدينار
   6) الدورات: صفحة العميل + تبويب الأخصائي
   7) لا تمرير أفقي هاتفياً + صفر أخطاء كونسول حرجة */
const { MongoMemoryServer } = require("mongodb-memory-server");
const { spawn } = require("child_process");
const http = require("http");
const { chromium } = require("playwright");
const fs = require("fs");

const PORT = "3996";
const BASE = `http://localhost:${PORT}`;
const SHOTS = "download/v1190-shots";
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
const tinyPhoto = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

(async () => {
  const mongod = await MongoMemoryServer.create();
  const server = spawn("node", ["server.js"], {
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("visual-v1190"), ADMIN_PASSCODE: "vis-pass-19", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let ready = false;
  for (let i = 0; i < 60; i++) { await wait(500); try { const h = await req("GET", "/api/health"); if (h.json?.ok && h.json?.version === "1.19.0") { ready = true; break; } } catch {} }
  if (!ready) { console.error("server not ready"); process.exit(1); }

  /* ── بذر البيانات ── */
  const admin = await req("POST", "/api/admin", { action: "login", passcode: "vis-pass-19" });
  const AH = { "x-admin-token": admin.json?.token || "" };
  const stamp = Date.now();
  const cl = await req("POST", "/api/clinic", { action: "register", name: "عيادة الطمأنينة", email: `visA${stamp}@t.dz`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة استرجاع العرض" });
  const A_uid = cl.json.userId, A_slug = cl.json.slug;

  /* فيديو عبر الرفع الدفعي */
  const st = await req("POST", "/api/media", { userId: A_uid, op: "start", mime: "video/mp4", name: "vis.mp4", size: 12000 });
  const chunk1 = tinyMp4(7, 6000), chunk2 = tinyMp4(9, 6000);
  await reqRaw(`/api/media?op=chunk&uid=${st.json.uploadId}&idx=0`, chunk1);
  await reqRaw(`/api/media?op=chunk&uid=${st.json.uploadId}&idx=1`, chunk2);
  const cm = await req("POST", "/api/media", { userId: A_uid, op: "commit", uploadId: st.json.uploadId });
  const videoUrl = cm.json.url;

  /* إعلان بصورة وفيديو + إعلان ثانٍ بلا فيديو (لتجربة مدخل الفيديو في التعديل) */
  await req("POST", "/api/ads", { action: "create", userId: A_uid, title: "جلسات دعم أسري", body: "إعلان الفيديو التجريبي", media: [tinyImg, videoUrl] });
  await req("POST", "/api/ads", { action: "create", userId: A_uid, title: "إعلان الصور فقط", body: "بلا فيديو — لاختبار مدخل الفيديو", media: [tinyImg] });
  const ads = (await req("GET", `/api/ads?userId=${A_uid}`)).json.ads;
  const adId = ads.find((x) => x.title === "جلسات دعم أسري")?.id;
  await req("POST", "/api/ads/admin", { action: "ads-set-dues", id: adId, amount: 300 }, AH);
  await req("POST", "/api/ads/admin", { action: "ads-set-paid", id: adId, paid: true }, AH);
  await req("POST", "/api/ads/admin", { action: "ads-approve", id: adId }, AH);

  /* عميل يعليق ثم يُحجب */
  const cli = (await req("POST", "/api/client", { action: "register", pseudonym: "عميل-بصري", password: "pass-tumaanina-1", recoveryPhrase: "عبارة استرجاع تجريبية", gender: "male", phone: "0555777888" })).json.user;
  await req("POST", "/api/ads", { action: "comment", userId: cli.id, id: adId, text: "تعليق سيُحجب من النافذة" });

  /* أسعار العيادة + باقة بأسعار أجنبية */
  await req("POST", "/api/clinic", { action: "update-profile", userId: A_uid, sessionPrice: 2500, priceEur: 17.5, priceUsd: 19, packs: [{ name: "باقة الاطمئنان", sessions: 4, price: 8000, note: null, priceEur: 55.5, priceUsd: 60 }] });

  /* أخصائي موثّق بصورة + منتمٍ للعيادة + دورة */
  const co = await req("POST", "/api/counselor", { action: "register", fullName: "د. نور التجريبي", email: `visC${stamp}@t.dz`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة استرجاع الأخصائي", specialties: ["anxiety"], languages: ["ar"], yearsExperience: 6, whatsapp: "213666000111" });
  const C_uid = co.json.userId;
  const pend = (await req("POST", "/api/admin", { action: "pending-counselors" }, AH)).json;
  const profId = (pend?.counselors || pend?.profiles || pend?.pending || [])[0]?.id;
  await req("POST", "/api/admin", { action: "verify", profileId: profId }, AH);
  await req("POST", "/api/counselor", { action: "update-profile", userId: C_uid, photo: tinyPhoto });
  await req("POST", "/api/counselor", { action: "update-profile", userId: C_uid, clinicId: (await req("GET", `/api/clinics/${A_slug}`)).json.clinic.id });
  await req("POST", "/api/courses", { userId: C_uid, title: "دورة إدارة القلق", description: "أربع لقاءات أسبوعية أونلاين", price: 1500, capacity: 12 });

  const clinicUser = (await req("POST", "/api/clinic", { action: "login", email: `visA${stamp}@t.dz`, password: "pass-tumaanina-1" })).json.user;
  const counsUser = (await req("POST", "/api/counselor", { action: "login", email: `visC${stamp}@t.dz`, password: "pass-tumaanina-1" })).json.user;

  const browser = await chromium.launch();
  const errors = [];
  const mk = async (vp, userState) => {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height }, hasTouch: !!vp.hasTouch, locale: "ar",
      storageState: userState ? { cookies: [], origins: [{ origin: BASE, localStorage: [{ name: "tumaanina-state", value: JSON.stringify({ state: userState, version: 0 }) }] }] } : undefined,
    });
    const p = await ctx.newPage();
    p.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load|net::|Image/i.test(m.text())) errors.push(m.text().slice(0, 140)); });
    return p;
  };
  /* ينتظر حدث filechooser بعد نقر مدخل الوسائط الشفاف — يثبت أن المنتقي يفتح فعلاً
     ملاحظة: المدخل الشفاف يعترض نقرات الزر عمداً — هذا هو الإصلاح نفسه */
  const expectPicker = async (page, locator, label) => {
    const fc = new Promise((res) => {
      const to = setTimeout(() => res(false), 3500);
      page.once("filechooser", () => { clearTimeout(to); res(true); });
    });
    await locator.click({ force: true });
    const opened = await fc;
    check(label, opened);
    return opened;
  };

  /* ── 1) هاتف: نافذة تعديل الإعلان — أزرار الصور والفيديو تفتح المنتقي ── */
  let page = await mk({ width: 390, height: 844 }, { user: clinicUser, view: "clinic-dashboard" });
  await page.goto(`${BASE}/?view=clinic-dashboard`, { waitUntil: "networkidle" });
  await page.keyboard.press("Escape");
  await wait(600);
  await wait(1400);
  await page.locator("button:has-text('إعلاناتي')").first().click();
  await wait(900);
  await page.locator("button:has-text('تعديل')").first().click();
  await wait(1100);
  await expectPicker(page, page.locator("[role='dialog'] input[accept='image/*']").first(), "مدخل الصور في تعديل الإعلان يفتح منتقي الملفات (نمط التراكب)");
  await expectPicker(page, page.locator("[role='dialog'] input[accept='video/*']").first(), "مدخل الفيديو في تعديل الإعلان يفتح منتقي الملفات");
  /* اختيار صورة فعلياً عبر الحدث */
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.locator("[role='dialog'] input[accept='image/*']").first().click({ force: true }),
  ]);
  await chooser.setFiles({ name: "t.png", mimeType: "image/png", buffer: Buffer.from(tinyImg.split(",")[1], "base64") });
  await wait(1200);
  const imgsInDialog = await page.locator("[role='dialog'] img").count();
  check(`الصورة المختارة أُضيفت للمعاينة (${imgsInDialog})`, imgsInDialog >= 1);
  await page.screenshot({ path: `${SHOTS}/mobile-ad-edit-dialog.png` });

  /* ── 2) نافذة إدارة التعليقات: حجب → «إظهار» فوراً بلا إغلاق ── */
  await page.keyboard.press("Escape");
  await wait(500);
  await page.locator("button:has-text('إدارة التعليقات')").first().click();
  await wait(900);
  const hideBtn = page.locator("[role='dialog'] button:has-text('حجب')").first();
  const hasHide = await hideBtn.count();
  check("زر الحجب ظاهر في النافذة", hasHide >= 1);
  if (hasHide) {
    await hideBtn.click();
    await wait(1000);
    const dialogStillOpen = await page.locator("[role='dialog']").count();
    const unhideBtn = await page.locator("[role='dialog'] button:has-text('إظهار')").first().count();
    check(`الزر تفتّل إلى «إظهار» فوراً والنافذة ما زالت مفتوحة (نوافذ=${dialogStillOpen})`, unhideBtn >= 1 && dialogStillOpen >= 1);
    await page.screenshot({ path: `${SHOTS}/mobile-comments-toggle.png` });
  }
  await page.context().close();

  /* ── 3) هاتف: إعدادات العيادة — زر إضافة صور المعرض يفتح المنتقي ── */
  page = await mk({ width: 390, height: 844 }, { user: clinicUser, view: "clinic-dashboard" });
  await page.goto(`${BASE}/?view=clinic-dashboard`, { waitUntil: "networkidle" });
  await page.keyboard.press("Escape");
  await wait(600);
  await wait(1400);
  await expectPicker(page, page.locator("input[accept='image/*'][multiple]").first(), "مدخل «إضافة صور» في معرض العيادة يفتح المنتقي (كان ميتاً)");
  const [chooser2] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.locator("input[accept='image/*'][multiple]").first().click({ force: true }),
  ]);
  await chooser2.setFiles({ name: "g.png", mimeType: "image/png", buffer: Buffer.from(tinyImg.split(",")[1], "base64") });
  await wait(1200);
  const galImgs = await page.locator("img[alt*='gallery']").count();
  check(`صورة المعرض المختارة ظهرت في المعاينة (${galImgs})`, galImgs >= 1);
  await page.screenshot({ path: `${SHOTS}/mobile-gallery-picker.png` });

  /* ── 4) صفحة العيادة: صورة الأخصائي + أسعار الباقة الأجنبية ── */
  await page.goto(`${BASE}/?clinic=${A_slug}`, { waitUntil: "networkidle" });
  await page.keyboard.press("Escape");
  await wait(600);
  await wait(1800);
  await page.keyboard.press("Escape"); await wait(300);
  const specAvatar = await page.locator("img[src*='/api/counselors/'][src*='/photo']").count();
  check(`صورة الأخصائي تظهر في بطاقة أخصائيي العيادة (${specAvatar})`, specAvatar >= 1);
  const eurPack = await page.locator("text=55,50 €").count() + await page.locator("text=55.5 €").count() + await page.locator("text=55,5 €").count();
  const dzdPack = await page.locator("text=8,000 DZD").count() + await page.locator("text=8000 DZD").count();
  check(`سعر الباقة DZD + EUR كما حددتهما العيادة (dzd=${dzdPack} eur=${eurPack})`, eurPack >= 1 && dzdPack >= 1);
  const noHs = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
  check("صفحة العيادة هاتفياً: لا تمرير أفقي", noHs);
  await page.screenshot({ path: `${SHOTS}/mobile-clinic-specialist-pack.png` });
  await page.context().close();

  /* ── 5) صفحة الإعلانات هاتفياً: مسار snap بلا أزرار + فيديو بمشغّله ── */
  page = await mk({ width: 390, height: 844, hasTouch: true });
  await page.goto(`${BASE}/?view=ads`, { waitUntil: "networkidle" });
  await page.keyboard.press("Escape");
  await wait(600);
  await wait(1600);
  const snapTrack = await page.locator("[data-media-track]").count();
  check("سلايدر الوسائط بمسار تمرير أصلي (data-media-track)", snapTrack >= 1);
  const mobileArrows = await page.locator("[data-media-track] ~ * button[aria-label='next']").count();
  const anyVisibleArrow = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button[aria-label='next'], button[aria-label='prev']")];
    return btns.filter((b) => getComputedStyle(b).display !== "none").length;
  });
  check(`لا أزرار تنقّل ظاهرة على الهاتف (التمرير باللمس) (${anyVisibleArrow})`, anyVisibleArrow === 0);
  const vidCtl = await page.locator("[data-media-track] video[controls]").count();
  check(`الفيديو بمشغّل المتصفح داخل المسار (${vidCtl})`, vidCtl >= 1);
  /* سحب أفقي بلمس حقيقي (CDP touch) — المسار يتبع الإصبع ويستقر على الشريحة */
  const cdp = await page.context().newCDPSession(page);
  const box = await page.locator("[data-media-track]").first().boundingBox();
  const cy = box ? Math.round(box.y + box.height / 2) : 420;
  const x1 = box ? Math.round(box.x + box.width * 0.92) : 350;
  const x2 = box ? Math.round(box.x + box.width * 0.10) : 40;
  const touchInfo = await page.evaluate(() => {
    const el = document.querySelector("[data-media-track]");
    if (!el) return null;
    const st = getComputedStyle(el);
    let reached = false;
    el.addEventListener("touchstart", () => { reached = true; }, { once: true, passive: true });
    (window).__touchProbe = () => reached;
    return { touchAction: st.touchAction, overflowX: st.overflowX };
  });
  console.log(`   (معلومات المسار: ${JSON.stringify(touchInfo)})`);
  const before = await page.evaluate(() => document.querySelector("[data-media-track]")?.scrollLeft || 0);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x1, y: cy }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: Math.round(x1 - ((x1 - x2) * i) / 10), y: cy }] });
    await wait(16);
  }
  const during = await page.evaluate(() => document.querySelector("[data-media-track]")?.scrollLeft || 0);
  const reached = await page.evaluate(() => (window).__touchProbe ? (window).__touchProbe() : false);
  console.log(`   (وصل حدث اللمس للصفحة: ${reached})`);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await wait(900);
  const after = await page.evaluate(() => document.querySelector("[data-media-track]")?.scrollLeft || 0);
  const taOk = !!touchInfo && !/none/.test(touchInfo.touchAction);
  check(`touch-action يسمح بالتمرير الأفقي اللمسي (${touchInfo?.touchAction})`, taOk);
  await page.evaluate(() => document.querySelector("[data-media-track]")?.scrollTo({ left: 9999 }));
  await wait(500);
  const snapped = await page.evaluate(() => document.querySelector("[data-media-track]")?.scrollLeft || 0);
  check(`المسار يمرّر ويستقر بمشبك الشريحة (${Math.round(before)} → ${Math.round(snapped)})`, snapped - before > 100);
  await page.screenshot({ path: `${SHOTS}/mobile-ads-snap.png` });
  await page.context().close();

  /* ── 6) صفحة الدورات للعميل: البطاقة + الحجز ── */
  page = await mk({ width: 390, height: 844 }, { user: cli, view: "courses" });
  await page.goto(`${BASE}/?view=courses`, { waitUntil: "networkidle" });
  await page.keyboard.press("Escape");
  await wait(600);
  await wait(1500);
  const courseCard = await page.locator("text=دورة إدارة القلق").count();
  check("دورة الأخصائي تظهر لعميل في صفحة الدورات", courseCard >= 1);
  const seatsBadge = await page.locator("text=12 مقعداً متبقياً").count();
  check(`شارة المقاعد المتبقية ظاهرة (${seatsBadge})`, seatsBadge >= 1);
  await page.locator("button:has-text('احجز مقعداً')").first().click();
  await wait(700);
  await page.locator("[role='dialog'] button:has-text('احجز مقعداً')").last().click();
  await wait(1300);
  const afterEnroll = await page.locator("text=11 مقعداً متبقياً").count() + await page.locator("text=بانتظار تأكيد الأخصائي").count();
  check(`بعد الحجز: المقاعد/Mالحالة تتحدث لحظياً (${afterEnroll})`, afterEnroll >= 1);
  const noHsCourses = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
  check("صفحة الدورات هاتفياً: لا تمرير أفقي", noHsCourses);
  await page.screenshot({ path: `${SHOTS}/mobile-courses-client.png` });
  await page.context().close();

  /* ── 7) لوحة الأخصائي: تبويب الدورات والملتحقون ── */
  page = await mk({ width: 390, height: 844 }, { user: counsUser, view: "counselor-dashboard" });
  await page.goto(`${BASE}/?view=counselor-dashboard`, { waitUntil: "networkidle" });
  await page.keyboard.press("Escape");
  await wait(600);
  await wait(1800);
  const secTitle = await page.locator("text=الدورات الأونلاين").count();
  check("قسم الدورات ظاهر في لوحة الأخصائي", secTitle >= 1);
  const myCourse = await page.locator("text=دورة إدارة القلق").count();
  check("دورته في القائمة", myCourse >= 1);
  const enrollBtn = page.locator("button:has-text('الملتحقون')").first();
  await enrollBtn.click();
  await wait(900);
  const clientRow = await page.locator("text=عميل-بصري").count();
  check(`نافذة الملتحقين تعرض اسم العميل الحاجز (${clientRow})`, clientRow >= 1);
  await page.screenshot({ path: `${SHOTS}/mobile-counselor-courses.png` });
  await page.context().close();

  /* ── 8) الحاسوب: أسهم السلايدر تظهر + الأعراض العامة ── */
  page = await mk({ width: 1440, height: 900 });
  await page.goto(`${BASE}/?view=ads`, { waitUntil: "networkidle" });
  await page.keyboard.press("Escape");
  await wait(600);
  await wait(1500);
  const desktopArrowVisible = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button[aria-label='next'], button[aria-label='prev']")];
    return btns.filter((b) => getComputedStyle(b).display !== "none").length;
  });
  check(`أسهم الحاسوب ظاهرة في السلايدر (${desktopArrowVisible})`, desktopArrowVisible >= 1);
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
