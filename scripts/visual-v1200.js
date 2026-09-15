/* فحص بصري حي — طمأنينة v1.20.0:
   1) صفحة الدورات: بطاقات بتصميم جديد (رhaupt aurora + شريط مقاعد + شارة سعر)
   2) ترقيم الدورات: 5 بطاقات في الصفحة، والبقية في الصفحة الثانية
   3) تبويب الدورات في لوحة العيادة + أيقونة الدورات في القائمة الجانبية
   4) نافذة «من شاهد الإعلان؟» بأسماء الحسابات
   5) الفيديو بمشغّل sanedni: <source type="video/mp4"> + ملصق poster
   6) العارض (Lightbox): الأسهم تغيّر الصورة فعلاً على الهاتف
   7) التجاوب: بلا تمرير أفقي في كل الصفحات المفحوصة + الهيدر/الفوتر ثابتان
   8) صفر أخطاء كونسول حرجة */
const { MongoMemoryServer } = require("mongodb-memory-server");
const { spawn } = require("child_process");
const http = require("http");
const { chromium } = require("playwright");
const fs = require("fs");

const PORT = "3990";
const BASE = `http://localhost:${PORT}`;
const SHOTS = "/home/z/my-project/download/v1200-shots";
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
    const r = http.request(`${BASE}${p}`, { method: "POST", headers: { "Content-Type": "application/octet-stream", "Content-Length": buf.length } }, (x) => { let b = ""; x.on("data", (c) => (buf2 += c)); x.on("end", () => res({ status: x.statusCode, json: JSON.parse(b || "{}") })); });
    let buf2 = "";
    r.on("error", rej); r.write(buf); r.end();
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
  /* تُخفى تلقائياً بعد 10 ثوانٍ */
  await wait(2500);
}

let failures = 0;
const check = (name, cond, extra = "") => { console.log(cond ? `✓ ${name}` : `✗ ${name} ${extra}`); if (!cond) failures++; };

function tinyMp4(fill = 7, size = 6000) {
  const ftyp = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom", "ascii"), Buffer.from([0, 0, 2, 0]), Buffer.from("isomiso2", "ascii")]);
  const payload = Buffer.alloc(size, fill);
  const mh = Buffer.alloc(4); mh.writeUInt32BE(payload.length + 8, 0);
  return Buffer.concat([ftyp, mh, Buffer.from("mdat", "ascii"), payload]);
}
const tinyImg = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const tinyImg2 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

(async () => {
  const mongod = await MongoMemoryServer.create();
  const server = spawn("node", ["server.js"], {
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("visual-v1200"), ADMIN_PASSCODE: "vis-pass-20", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let ready = false;
  for (let i = 0; i < 60; i++) { await wait(500); try { const h = await req("GET", "/api/health"); if (h.json?.ok && h.json?.version === "1.20.0") { ready = true; break; } } catch {} }
  if (!ready) { console.error("server not ready"); process.exit(1); }

  /* ── بذر البيانات ── */
  const admin = await req("POST", "/api/admin", { action: "login", passcode: "vis-pass-20" });
  const ADMIN_UID = admin.json?.user?.id;
  const AH = { "x-admin-token": admin.json?.token || "" };
  const stamp = Date.now();
  const cl = await req("POST", "/api/clinic", { action: "register", name: "عيادة الطمأنينة", email: `visA${stamp}@t.dz`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة استرجاع العرض" });
  const A_uid = cl.json.userId, A_slug = cl.json.slug;

  /* فيديو عبر الرفع الدفعي */
  const st = await req("POST", "/api/media", { userId: A_uid, op: "start", mime: "video/mp4", name: "vis.mp4", size: 12000 });
  const c1 = tinyMp4(7, 6000), c2 = tinyMp4(9, 6000);
  await new Promise((res, rej) => { const r = http.request(`${BASE}/api/media?op=chunk&uid=${st.json.uploadId}&idx=0`, { method: "POST", headers: { "Content-Type": "application/octet-stream", "Content-Length": c1.length } }, () => res()); r.on("error", rej); r.write(c1); r.end(); });
  await new Promise((res, rej) => { const r = http.request(`${BASE}/api/media?op=chunk&uid=${st.json.uploadId}&idx=1`, { method: "POST", headers: { "Content-Type": "application/octet-stream", "Content-Length": c2.length } }, () => res()); r.on("error", rej); r.write(c2); r.end(); });
  const cm = await req("POST", "/api/media", { userId: A_uid, op: "commit", uploadId: st.json.uploadId });
  const videoUrl = cm.json.url;

  /* إعلان معتمد بصورة وفيديو */
  await req("POST", "/api/ads", { action: "create", userId: A_uid, title: "جلسات دعم أسري", body: "إعلان الفيديو التجريبي", media: [tinyImg, videoUrl] });
  const ads = (await req("GET", `/api/ads?userId=${A_uid}`)).json.ads;
  const adId = ads[0]?.id;
  await req("POST", "/api/ads/admin", { action: "ads-set-dues", id: adId, amount: 300 }, AH);
  await req("POST", "/api/ads/admin", { action: "ads-set-paid", id: adId, paid: true }, AH);
  await req("POST", "/api/ads/admin", { action: "ads-approve", id: adId }, AH);

  /* عميلان يشاهدان الإعلان (قائمة المشاهدين) */
  const cli = (await req("POST", "/api/client", { action: "register", pseudonym: "عميل-بصري", password: "pass-tumaanina-1", recoveryPhrase: "عبارة استرجاع تجريبية", gender: "male", phone: "0555777888" })).json.user;
  const cli2 = (await req("POST", "/api/client", { action: "register", pseudonym: "ناظر-ثانٍ", password: "pass-tumaanina-1", recoveryPhrase: "عبارة استرجاع ثانية", gender: "female", phone: "0555777899" })).json.user;
  await req("POST", "/api/ads", { action: "view", userId: cli.id, id: adId });
  await req("POST", "/api/ads", { action: "view", userId: cli2.id, id: adId });

  /* معرض العيادة: 3 صور */
  await req("POST", "/api/clinic", { action: "update-profile", userId: A_uid, gallery: [tinyImg, tinyImg2, tinyImg] });

  /* 7 دورات (5 + 2 للترقيم) — دورتان من العيادة والباقي من أخصائي */
  const co = await req("POST", "/api/counselor", { action: "register", fullName: "د. نور التجريبي", email: `visC${stamp}@t.dz`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة استرجاع الأخصائي", specialties: ["anxiety"], languages: ["ar"], yearsExperience: 6, whatsapp: "213666000111" });
  const C_uid = co.json.userId;
  const pend = (await req("POST", "/api/admin", { action: "pending-counselors" }, AH)).json;
  const profId = (pend?.counselors || pend?.profiles || pend?.pending || [])[0]?.id;
  await req("POST", "/api/admin", { action: "verify", profileId: profId }, AH);
  for (let i = 1; i <= 5; i++) {
    await req("POST", "/api/courses", { userId: C_uid, title: `دورة إدارة القلق ${i}`, description: "أربع لقاءات أسبوعية أونلاين مع متابعة فردية وتمارين عملية بين اللقاءات.", price: 1500 + i * 100, capacity: 12 });
  }
  await req("POST", "/api/courses", { userId: A_uid, title: "دورة الصمود النفسي (العيادة)", description: "دورة تقدمها العيادة", price: 2500, capacity: 8 });
  await req("POST", "/api/courses", { userId: A_uid, title: "دورة النوم الهادئ (العيادة)", description: "تقنيات الاسترخاء", price: 1800, capacity: 6 });

  const clinicUser = (await req("POST", "/api/clinic", { action: "login", email: `visA${stamp}@t.dz`, password: "pass-tumaanina-1" })).json.user;

  const browser = await chromium.launch();
  const consoleErrors = [];

  /* ══════════ الجهاز المكتبي 1280×800 ══════════ */
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "ar" });
  const dp = await dctx.newPage();
  dp.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  dp.on("pageerror", (e) => consoleErrors.push(String(e)));

  await dp.goto(`${BASE}/?view=courses`, { waitUntil: "networkidle" });
  /* دخول العميل لتصفح الدورات */
  await dp.evaluate((u) => { const s = window.localStorage.getItem("tumaanina-state"); if (s) { const st = JSON.parse(s); st.state.user = u; window.localStorage.setItem("tumaanina-state", JSON.stringify(st)); } }, cli);
  await dp.goto(`${BASE}/?view=courses`, { waitUntil: "networkidle" });
  await wait(1200);
  await dismissQuote(dp);
  await dp.screenshot({ path: `${SHOTS}/desktop-courses-page1.png`, fullPage: false });

  const auroraCount = await dp.locator(".card-aurora").count();
  check("بطاقات الدورات بخلفية aurora تفاعلية", auroraCount >= 5, `(${auroraCount})`);
  const cardCountP1 = await dp.locator(".card-aurora").count();
  check("الصفحة الأولى 5 بطاقات بالضبط", cardCountP1 === 5, `(${cardCountP1})`);
  const dzdCount = await dp.locator("text=/DZD/").count();
  const dzdProbe = await dp.evaluate(() => ({ any: document.body.textContent.includes("DZD"), url: location.href, view: location.search }));
  console.log("   DZD PROBE:", dzdCount, JSON.stringify(dzdProbe));
  const priceBadgeOk = dzdCount > 0;
  check("شارة السعر DZD ظاهرة", priceBadgeOk);
  const pageInfo = await dp.getByText("صفحة 1 من 2").first().isVisible().catch(() => false);
  check("مؤشر الترقيم «صفحة 1 من 2» ظاهر (7 دورات)", pageInfo);

  { const btns = dp.locator("button", { hasText: "التالي" }); if (await btns.count()) await btns.first().click(); }
  await wait(700);
  const cardCountP2 = await dp.locator(".card-aurora").count();
  check("الصفحة الثانية بطاقتان (7=5+2)", cardCountP2 === 2, `(${cardCountP2})`);
  await dp.screenshot({ path: `${SHOTS}/desktop-courses-page2.png` });

  /* مشاهدات الإعلان — دخول عيادة ونافذة المشاهدين */
  await dp.evaluate((u) => { const s = window.localStorage.getItem("tumaanina-state"); if (s) { const st = JSON.parse(s); st.state.user = u; window.localStorage.setItem("tumaanina-state", JSON.stringify(st)); } }, clinicUser);
  await dp.goto(`${BASE}/?view=clinic-dashboard`, { waitUntil: "networkidle" });
  await wait(1000);
  await dismissQuote(dp);
  const coursesTab = await dp.locator('button:has-text("الدورات")').first().isVisible().catch(() => false);
  check("تبويب الدورات ظاهر في لوحة العيادة", coursesTab);
  await dp.locator('button:has-text("الدورات")').first().click();
  await wait(700);
  await dp.screenshot({ path: `${SHOTS}/desktop-clinic-courses-tab.png` });
  const clinicCourseCard = await dp.getByText("دورة الصمود النفسي (العيادة)").first().isVisible().catch(() => false);
  check("دورة العيادة تُدار من لوحتها", clinicCourseCard);

  await dp.locator('button:has-text("إعلاناتي")').first().click();
  await wait(900);
  const viewsBtn = dp.locator('button[title*="شاهد"]').first();
  if (await viewsBtn.count()) {
    await viewsBtn.click();
    await wait(700);
    const dialogName1 = await dp.getByText("عميل-بصري").first().isVisible().catch(() => false);
    const dialogName2 = await dp.getByText("ناظر-ثانٍ").first().isVisible().catch(() => false);
    check("نافذة «من شاهد الإعلان؟» تعرض أسماء الحسابات", dialogName1 && dialogName2);
    await dp.screenshot({ path: `${SHOTS}/desktop-ad-viewers-dialog.png` });
  } else {
    check("نافذة «من شاهد الإعلان؟» تعرض أسماء الحسابات", false, "زر المشاهدات غير موجود");
  }
  await dctx.close();

  /* ══════════ الهاتف 390×844 ══════════ */
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "ar" });
  const mp = await mctx.newPage();
  mp.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); if (m.text().includes("[LB]")) console.log("   BROWSER:", m.text()); });
  mp.on("pageerror", (e) => consoleErrors.push(String(e)));

  await mp.goto(BASE, { waitUntil: "networkidle" });
  await wait(1500);
  await dismissQuote(mp);
  const noHScrollHome = await mp.evaluate(() => document.documentElement.scrollWidth <= 392);
  check("الهاتف: الرئيسية بلا تمرير أفقي", noHScrollHome);
  const headerOk = await mp.evaluate(() => { const h = document.querySelector("header"); return h && h.scrollHeight < 80; });
  check("الهاتف: الهيدر ثابت لا يتشوه", headerOk);
  const footerOk = await mp.evaluate(() => { const f = document.querySelector("footer"); return !!f && f.getBoundingClientRect().width <= 392; });
  check("الهاتف: الفوتر بلا فيض", footerOk);
  await mp.screenshot({ path: `${SHOTS}/mobile-home.png` });

  /* أيقونة الدورات في القائمة الجانبية */
  await mp.locator('button[aria-label*="القائمة"], button[aria-label*="menu" i]').first().click().catch(async () => { await mp.locator("header button:last-of-type").click(); });
  await wait(700);
  const coursesItem = mp.locator('button:has-text("الدورات")').first();
  const coursesItemVisible = await coursesItem.isVisible().catch(() => false);
  const coursesIconOk = coursesItemVisible ? await coursesItem.locator("svg").count() > 0 : false;
  check("أيقونة الدورات ظاهرة في القائمة الجانبية", coursesIconOk);
  await mp.screenshot({ path: `${SHOTS}/mobile-sidebar-courses-icon.png` });

  /* صفحة الدورات على الهاتف */
  if (coursesItemVisible) { await coursesItem.click(); await wait(1200); }
  else await mp.goto(`${BASE}/?view=courses`, { waitUntil: "networkidle" });
  const noHScrollCourses = await mp.evaluate(() => document.documentElement.scrollWidth <= 392);
  check("الهاتف: صفحة الدورات بلا تمرير أفقي", noHScrollCourses);
  await mp.screenshot({ path: `${SHOTS}/mobile-courses.png` });

  /* الفيديو بنمط sanedni في صفحة الإعلانات */
  await mp.evaluate((u) => { const s = window.localStorage.getItem("tumaanina-state"); if (s) { const st = JSON.parse(s); st.state.user = u; window.localStorage.setItem("tumaanina-state", JSON.stringify(st)); } }, cli);
  await mp.goto(`${BASE}/?view=ads`, { waitUntil: "networkidle" });
  await wait(1500);
  await dismissQuote(mp);
  const videoInfo = await mp.evaluate(() => {
    const v = document.querySelector("section video, main video, video");
    if (!v) return null;
    const src = v.querySelector("source");
    return { hasSource: !!src, type: src?.getAttribute("type") || null, poster: v.getAttribute("poster"), controls: v.hasAttribute("controls"), playsinline: v.hasAttribute("playsinline") };
  });
  check("مشغّل الفيديو: <source type=video/mp4>", !!videoInfo && videoInfo.hasSource && videoInfo.type === "video/mp4", JSON.stringify(videoInfo));
  check("مشغّل الفيديو: ملصق poster قبل التحميل", !!videoInfo && !!videoInfo.poster);
  check("مشغّل الفيديو: controls + playsinline", !!videoInfo && videoInfo.controls && videoInfo.playsinline);
  await mp.screenshot({ path: `${SHOTS}/mobile-ads-video.png` });

  /* العارض Lightbox: الأسهم تغيّر الصورة فعلاً */
  await mp.goto(`${BASE}/?clinic=${encodeURIComponent(A_slug)}`, { waitUntil: "networkidle" });
  await wait(1200);
  await dismissQuote(mp);
  const galleryBtn = mp.locator('button:has-text("معرض"), [class*="gallery"] button').first();
  const galleryClicked = await galleryBtn.isVisible().catch(() => false);
  if (galleryClicked) {
    await galleryBtn.click();
    await wait(900);
    const thumb = mp.locator('button img[alt*="عيادة"]').first();
    if (await thumb.count()) {
      await thumb.click();
      await wait(800);
      const lbDiag = await mp.evaluate(() => {
        const box = document.querySelector('[class*="z-["]');
        const t = box ? box.querySelector(".snap-x.snap-mandatory") : null;
        const btns = box ? box.querySelectorAll('button[aria-label="next"]').length : 0;
        return { hasBox: !!box, boxClass: box ? box.className.slice(0, 40) : null, hasTrack: !!t, w: t ? t.clientWidth : 0, sl: t ? t.scrollLeft : 0, nextBtns: btns };
      });
      console.log("   LB DIAG:", JSON.stringify(lbDiag));
      const idxBefore = await mp.evaluate(() => { const t = document.querySelector('[class*="z-["] .snap-x.snap-mandatory'); return t ? Math.round(t.scrollLeft / Math.max(1, t.clientWidth)) : -1; });
      const nextBtn = mp.locator('button[aria-label="next"]');
      if (await nextBtn.count()) {
        await nextBtn.first().click();
        for (const delay of [200, 400, 800, 1500]) {
          await wait(delay);
          const diag = await mp.evaluate(() => {
            const box = document.querySelector('[class*="z-["]');
            const t = box ? box.querySelector(".snap-x.snap-mandatory") : null;
            const dots = box ? Array.from(box.querySelectorAll(".pointer-events-none span")).map((x) => x.className) : [];
            return { sl: t ? t.scrollLeft : -1, w: t ? t.clientWidth : 0, activeDot: dots.findIndex((c) => c.includes("w-4")), dots: dots.length };
          });
          console.log(`   LB after +${delay}ms:`, JSON.stringify(diag));
        }
        const idxAfter = await mp.evaluate(() => { const t = document.querySelector('[class*="z-["] .snap-x.snap-mandatory'); return t ? Math.round(t.scrollLeft / Math.max(1, t.clientWidth)) : -1; });
        check("العارض: زر التالي يغيّر الصورة فعلاً", idxAfter === idxBefore + 1, `(${idxBefore}→${idxAfter})`);
        await mp.screenshot({ path: `${SHOTS}/mobile-lightbox-next.png` });
        const prevBtn = mp.locator('button[aria-label="prev"]');
        await prevBtn.first().click();
        await wait(700);
        const idxBack = await mp.evaluate(() => { const t = document.querySelector('[class*="z-["] .snap-x.snap-mandatory'); return t ? Math.round(t.scrollLeft / Math.max(1, t.clientWidth)) : -1; });
        check("العارض: زر السابق يعود للصورة الأولى", idxBack === idxBefore, `(${idxBack})`);
      } else {
        check("العارض: زر التالي يغيّر الصورة فعلاً", false, "لا زر next");
      }
    } else {
      check("العارض: زر التالي يغيّر الصورة فعلاً", false, "لا صور مصغّرة");
    }
  } else {
    check("العارض: زر التالي يغيّر الصورة فعلاً", false, "زر المعرض غير ظاهر");
  }

  await mctx.close();
  await browser.close();

  const critical = consoleErrors.filter((e) => !e.includes("favicon") && !e.includes("net::") && !e.includes("404"));
  check("صفر أخطاء كونسول حرجة", critical.length === 0, JSON.stringify(critical.slice(0, 3)));

  console.log(failures === 0 ? "\n═══ كل الفحوص البصرية ناجحة ═══" : `\n═══ ${failures} بند فاشل ═══`);
  server.kill();
  await mongod.stop();
  process.exit(failures ? 1 : 0);
})();
