/**
 * اختبار طمأنينة v1.3.0 — أسعار مستقلة لكل عملة + إصلاح الحفظ + الإشعارات + الإلغاء
 * ─────────────────────────────────────────────────────────────────
 *  1. الخادم v1.3.0 جاهز
 *  2. أسعار ثلاث عملات: تسجيل + قراءة + تحديث من الإعدادات (إصلاح فشل 1–500$)
 *  3. ترحيل تلقائي للحساب القديم (سعر دينار وحيد → أسعار ثلاث عملات)
 *  4. الحجز بعملة العميل: السعر بعملة الحجز مثبّت على الجلسة (بلا تحويل)
 *  5. جلسة المتابعة ترث سعر وعملة الجلسة الأصلية
 *  6. إحصائيات لكل عملة (DZD/EUR/USD) بلا أي تحويل
 *  7. إشعار الأدمين بالاسم المستعار أو البريد (بدل ID) + NOT_FOUND
 *  8. إلغاء العميل + تغيير موعد العميل (rescheduledBy=VICTIM)
 *  9. الصورة: photoUrl بمعامل ?v= + 404 بلا تخزين
 * 10. بقايا محذوفة: api/payments، api/victim، wallet.tsx، victim-*
 * 11. i18n ×6: المفاتيح الجديدة موجودة
 * 12. انحدار: تسجيل عميل بلغة tr (كان يفشل بتعداد 3 لغات)
 */
const { MongoMemoryServer } = require("mongodb-memory-server");
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");

const PORT = String(3700 + (process.pid % 300) + Math.floor(Math.random() * 100));
const BASE = `http://localhost:${PORT}`;
let failures = 0;

let ADMIN_TOKEN = "";
function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(`${BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(ADMIN_TOKEN ? { "x-admin-token": ADMIN_TOKEN } : {}), ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}) },
    }, (res) => {
      let buf = "";
      res.on("data", (c) => (buf += c));
      res.on("end", () => { let j = null; try { j = JSON.parse(buf); } catch {} resolve({ status: res.statusCode, json: j, headers: res.headers }); });
    });
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function check(name, cond, extra = "") {
  if (cond) console.log(`  ✅ ${name}`);
  else { failures++; console.log(`  ❌ ${name} ${extra}`); }
}

(async () => {
  console.log("═".repeat(56));
  console.log("🧪 اختبار طمأنينة v1.3.0 — أسعار لكل عملة + حفظ موثوق");
  console.log("═".repeat(56));

  const mongod = await MongoMemoryServer.create();
  const server = spawn("node", ["server.js"], {
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("tumaanina-v13"), ADMIN_PASSCODE: "tum-pass-13", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  server.stderr.on("data", (d) => process.env.TUM_DEBUG && console.error(String(d)));
  let ready = false;
  for (let i = 0; i < 60; i++) {
    await wait(500);
    try {
      const h = await req("GET", "/api/health");
      if (h.json?.ok && /^1\./.test(String(h.json?.version))) { ready = true; break; }
    } catch {}
  }
  check("الخادم (tumaanina) جاهز", ready);
  if (!ready) process.exit(1);

  const loginRes = await req("POST", "/api/admin", { action: "login", passcode: "tum-pass-13" });
  ADMIN_TOKEN = loginRes.json?.token || "";
  check("دخول المالك يعيد رمز إدارة (بوابة خادمية)", !!ADMIN_TOKEN);

  /* ─── الحسابات ─── */
  const client = (await req("POST", "/api/client", {
    action: "register", pseudonym: "عميل-ثلاث-عملات", password: "pass-tumaanina-1",
    recoveryPhrase: "عبارة استرجاع تجريبية", gender: "female", phone: "0555777001",
  })).json.user;

  /* انحدار v1.3.0: عميل بواجهة تركية — كان يُفشل بتعداد اللغات الثلاثي */
  const trClient = await req("POST", "/api/client", {
    action: "register", pseudonym: "TR-musteri", password: "pass-tumaanina-1",
    recoveryPhrase: "kurtarma cumlesi test", gender: "male", language: "tr", phone: "0555777002",
  });
  check("تسجيل عميل بلغة tr نجح (إصلاح تعداد اللغات)", trClient.status === 200 && !!trClient.json?.user?.id);

  /* أخصائي بأسعار ثلاث عملات صريحة: 3000 دج / 20€ / 22$ */
  const cEmail = `doc3-${Date.now()}@test.dz`;
  const reg = await req("POST", "/api/counselor", {
    action: "register", fullName: "د. ثلاث عملات", email: cEmail,
    password: "pass-tumaanina-1", recoveryPhrase: "عبارة اختبار الأخصائي",
    specialties: ["anxietyDepression"], languages: ["ar", "fr"], yearsExperience: 7,
    whatsapp: "213666777001", sessionPrice: 3000,
    sessionPrices: { DZD: 3000, EUR: 20, USD: 22 },
  });
  check("تسجيل أخصائي بأسعار ثلاث عملات نجح", reg.status === 200);
  const counselor = (await req("POST", "/api/counselor", { action: "login", email: cEmail, password: "pass-tumaanina-1" })).json.user;
  const meProf = await req("GET", `/api/counselor?userId=${counselor.id}`);
  await req("POST", "/api/admin", { action: "verify", profileId: meProf.json?.profile?.id });

  /* ─── 1) قراءة الأسعار الثلاثة ─── */
  console.log("\n── 1) الأسعار الثلاثة المستقلة ──");
  const me = meProf.json?.profile;
  check("DZD = 3000", Number(me?.sessionPrices?.DZD) === 3000, JSON.stringify(me?.sessionPrices));
  check("EUR = 20", Number(me?.sessionPrices?.EUR) === 20, JSON.stringify(me?.sessionPrices));
  check("USD = 22", Number(me?.sessionPrices?.USD) === 22, JSON.stringify(me?.sessionPrices));
  check("التوافق: sessionPrice (دينار) = 3000", Number(me?.sessionPrice) === 3000);

  /* ─── 2) إصلاح فشل الحفظ: تحديث من الإعدادات بأسعار دينارية > 500 ─── */
  console.log("\n── 2) إصلاح «لا يوجد زر يضمن الحفظ» (كان فشل 1–500$) ──");
  const upd = await req("POST", "/api/counselor", {
    action: "update-profile", userId: counselor.id,
    socials: { facebook: "fb.com/tumaanina", instagram: "", tiktok: "@tumaanina" },
    acceptedGenders: ["female"],
    sessionPrices: { DZD: 3500, EUR: 24, USD: 26 },
  });
  check("تحديث السعر 3500 دج + روابط + جنس نجح (كان يُرفض 400)", upd.status === 200 && upd.json?.ok === true, JSON.stringify(upd.json));
  const me2 = (await req("GET", `/api/counselor?userId=${counselor.id}`)).json?.profile;
  check("السعر الجديد محفوظ DZD=3500", Number(me2?.sessionPrices?.DZD) === 3500);
  check("روابط التواصل محفوظة", (me2?.socials?.facebook || "").includes("fb.com/tumaanina") && (me2?.socials?.tiktok || "").includes("@tumaanina"));
  check("تفضيل الجنس محفوظ (female فقط)", JSON.stringify(me2?.acceptedGenders) === JSON.stringify(["female"]));
  check("الدينار القديم متزامن (sessionPrice=3500)", Number(me2?.sessionPrice) === 3500);
  /* سعر خارج الحدود يُرفض بوضوح */
  const bad = await req("POST", "/api/counselor", { action: "update-profile", userId: counselor.id, sessionPrices: { DZD: 99999 } });
  check("سعر دينار خارج الحدود مرفوض (INVALID_PRICE)", bad.status === 400 && bad.json?.error === "INVALID_PRICE");

  /* ─── 3) الترحيل التلقائي للحساب القديم ─── */
  console.log("\n── 3) ترحيل الحساب القديم (سعر دينار وحيد) ───");
  const c2Email = `legacy-${Date.now()}@test.dz`;
  /* تسجيل عبر المسار الخلفي: بلا sessionPrices (محاكاة سجل قديم) — سيدخل الدينار */
  await req("POST", "/api/counselor", {
    action: "register", fullName: "د. ترحيل قديم", email: c2Email,
    password: "pass-tumaanina-1", recoveryPhrase: "عبارة اختبار الأخصائي",
    specialties: ["burnout"], languages: ["ar"], yearsExperience: 3,
    whatsapp: "213666777002", sessionPrice: 4500,
  });
  const legacy = (await req("POST", "/api/counselor", { action: "login", email: c2Email, password: "pass-tumaanina-1" })).json.user;
  const legacyProf = (await req("GET", `/api/counselor?userId=${legacy.id}`)).json?.profile;
  check("ترحيل: DZD = سعر الدينار القديم (4500)", Number(legacyProf?.sessionPrices?.DZD) === 4500, JSON.stringify(legacyProf?.sessionPrices));
  check("ترحيل: EUR مشتق (>0)", Number(legacyProf?.sessionPrices?.EUR) > 0);
  check("ترحيل: USD مشتق (>0)", Number(legacyProf?.sessionPrices?.USD) > 0);

  /* ─── 4) الحجز بعملة العميل ─── */
  console.log("\n── 4) الحجز بعملة العميل (بلا أي تحويل) ──");
  const when = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
  const bEur = await req("POST", "/api/sessions", { victimId: client.id, counselorId: counselor.id, topic: "anxiety", mode: "TEXT", scheduledAt: when, currency: "EUR" });
  check("حجز EUR: السعر = 24 (سعر اليورو المحدد، ليس تحويل دينار)", bEur.status === 200 && Number(bEur.json?.session?.price) === 24, `price=${bEur.json?.session?.price} currency=${bEur.json?.session?.currency}`);
  check("حجز EUR: عملة الجلسة EUR", bEur.json?.session?.currency === "EUR");
  const bUsd = await req("POST", "/api/sessions", { victimId: client.id, counselorId: counselor.id, topic: "sleep", mode: "TEXT", scheduledAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(), currency: "USD" });
  check("حجز USD: السعر = 26", bUsd.status === 200 && Number(bUsd.json?.session?.price) === 26);
  const bDzd = await req("POST", "/api/sessions", { victimId: client.id, counselorId: counselor.id, topic: "grief", mode: "TEXT", scheduledAt: new Date(Date.now() + 96 * 3600 * 1000).toISOString(), currency: "DZD" });
  check("حجز DZD: السعر = 3500", bDzd.status === 200 && Number(bDzd.json?.session?.price) === 3500);
  /* عملة غير معروفة → دينار */
  const bBad = await req("POST", "/api/sessions", { victimId: client.id, counselorId: counselor.id, topic: "other", mode: "TEXT", scheduledAt: new Date(Date.now() + 120 * 3600 * 1000).toISOString(), currency: "GBP" });
  check("عملة غير معروفة → DZD (3500)", bBad.status === 200 && Number(bBad.json?.session?.price) === 3500);

  /* ─── 5) إكمال + إحصائيات لكل عملة ─── */
  console.log("\n── 5) الإحصائيات: تجميع لكل عملة ──");
  const sidEur = bEur.json?.session?.id, sidUsd = bUsd.json?.session?.id, sidDzd = bDzd.json?.session?.id, sidBad = bBad.json?.session?.id;
  for (const sid of [sidEur, sidUsd, sidDzd, sidBad]) {
    await req("PATCH", `/api/sessions/${sid}`, { status: "ACCEPTED", durationMinutes: 45 });
    await req("PATCH", `/api/sessions/${sid}`, { status: "COMPLETED" });
  }
  const stats = (await req("GET", `/api/counselor/stats?userId=${counselor.id}&period=month`)).json?.stats;
  check("عدد المكتملة = 4", Number(stats?.totals?.count) === 4, `count=${stats?.totals?.count}`);
  check("المبالغ لكل عملة: DZD = 2×3500 = 7000", Number(stats?.totals?.gross?.DZD) === 7000, JSON.stringify(stats?.totals?.gross));
  check("المبالغ لكل عملة: EUR = 24", Number(stats?.totals?.gross?.EUR) === 24, JSON.stringify(stats?.totals?.gross));
  check("المبالغ لكل عملة: USD = 26", Number(stats?.totals?.gross?.USD) === 26, JSON.stringify(stats?.totals?.gross));
  check("عمولة لكل عملة: DZD = 1050", Number(stats?.totals?.commission?.DZD) === 1050);
  check("عمولة لكل عملة: EUR = 3.6", Number(stats?.totals?.commission?.EUR) === 3.6);
  check("مستحق الشهر لكل عملة (DZD=1050)", Number(stats?.dueThisMonth?.DZD) === 1050);
  check("recent تحمل عملة كل جلسة", stats?.recent?.some((r) => r.currency === "EUR") === true);

  /* ─── 6) جلسة متابعة ترث السعر والعملة ─── */
  console.log("\n── 6) جلسة المتابعة ترث السعر والعملة ──");
  const when2 = new Date(Date.now() + 200 * 3600 * 1000).toISOString();
  const b2 = await req("POST", "/api/sessions", { victimId: client.id, counselorId: counselor.id, topic: "relationships", mode: "TEXT", scheduledAt: when2, currency: "EUR" });
  const s2 = b2.json?.session?.id;
  await req("PATCH", `/api/sessions/${s2}`, { status: "ACCEPTED", durationMinutes: 30 });
  const done2 = await req("PATCH", `/api/sessions/${s2}`, { status: "COMPLETED", followUpAt: new Date(Date.now() + 240 * 3600 * 1000).toISOString() });
  const fuId = done2.json?.followUpCreated;
  check("جلسة المتابعة أُنشئت", !!fuId);
  const fu = (await req("GET", `/api/sessions/${fuId}`)).json?.session;
  check("المتابعة بعملة EUR", fu?.currency === "EUR", `currency=${fu?.currency}`);
  check("المتابعة بسعر الجلسة الأصلية (24)", Number(fu?.price) === 24, `price=${fu?.price}`);

  /* ─── 7) إشعار الأدمين بالاسم/البريد ─── */
  console.log("\n── 7) إشعار مستخدم بالاسم المستعار أو البريد ──");
  const byName = await req("POST", "/api/admin", { action: "bulk-notify", target: "USER", identifier: "عميل-ثلاث-عملات", textAr: "رسالة تجريبية" });
  check("الإرسال بالاسم المستعار نجح", byName.status === 200 && byName.json?.ok === true, JSON.stringify(byName.json));
  const byEmail = await req("POST", "/api/admin", { action: "bulk-notify", target: "USER", identifier: cEmail, textAr: "رسالة تجريبية" });
  check("الإرسال بالبريد الإلكتروني نجح", byEmail.status === 200 && byEmail.json?.ok === true);
  const notFound = await req("POST", "/api/admin", { action: "bulk-notify", target: "USER", identifier: "مستخدم-غير-موجود", textAr: "رسالة" });
  check("اسم غير موجود → NOT_FOUND", notFound.status === 404 && notFound.json?.error === "NOT_FOUND");
  const missing = await req("POST", "/api/admin", { action: "bulk-notify", target: "USER", textAr: "رسالة" });
  check("بدون معرّف → IDENTIFIER_REQUIRED", missing.status === 400 && missing.json?.error === "IDENTIFIER_REQUIRED");

  /* ─── 8) إلغاء العميل + تغيير موعد العميل ─── */
  console.log("\n── 8) عمليات الحجز من طرف العميل ──");
  /* عميلة أنثى — الأخصائي أعلاه يقبل الإناث فقط (تفضيل الجنس المُختبَر) */
  const c2 = (await req("POST", "/api/client", { action: "register", pseudonym: "عميلة-إلغاء", password: "pass-tumaanina-1", recoveryPhrase: "عبارة استرجاع تجريبية", gender: "female", phone: "0555777003" })).json.user;
  const when3 = new Date(Date.now() + 300 * 3600 * 1000).toISOString();
  const b3 = await req("POST", "/api/sessions", { victimId: c2.id, counselorId: counselor.id, topic: "workStress", mode: "TEXT", scheduledAt: when3, currency: "DZD" });
  const s3 = b3.json?.session?.id;
  const rs = await req("PATCH", `/api/sessions/${s3}`, { rescheduleTo: new Date(Date.now() + 320 * 3600 * 1000).toISOString(), rescheduledBy: "VICTIM" });
  check("تغيير الموعد من العميل نجح", rs.status === 200 && rs.json?.ok === true, JSON.stringify(rs.json?.error || ""));
  check("عداد تغيير الموعد = 1", Number(rs.json?.session?.rescheduleCount) === 1);
  const cc = await req("PATCH", `/api/sessions/${s3}`, { status: "CANCELLED", cancelledBy: "VICTIM" });
  check("إلغاء العميل نجح", cc.status === 200 && cc.json?.ok === true);
  const cc2 = await req("PATCH", `/api/sessions/${s3}`, { status: "CANCELLED", cancelledBy: "VICTIM" });
  /* إعادة الإلغاء عملية متماثلة آمنة: تبقى الجلسة CANCELLED ولا 500 */
  check("إعادة الإلغاء آمنة (تبقى CANCELLED بلا انهيار)", cc2.status < 500 && cc2.json?.session?.status === "CANCELLED");

  /* ─── 9) الصورة: ?v= + 404 بلا تخزين ─── */
  console.log("\n── 9) الصورة الشخصية ──");
  const dir = (await req("GET", "/api/counselors")).json?.counselors || [];
  check("الدليل يعيد sessionPrices", dir.length > 0 && dir.some((c) => Number(c.sessionPrices?.DZD) > 0));
  check("photoUrl يحمل ?v= (كسر الذاكرة)", dir.every((c) => !c.photoUrl || c.photoUrl.includes("?v=")), JSON.stringify(dir[0]?.photoUrl));
  const ph404 = await req("GET", `/api/counselors/000000000000000000000000/photo`);
  check("صورة غير موجودة → 404 بلا تخزين", ph404.status === 404 && /no-store/.test(ph404.headers["cache-control"] || ""));
  /* حفظ صورة حقيقية (data URL صغير 1×1 PNG) ثم قراءتها */
  const px = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  await req("POST", "/api/counselor", { action: "update-profile", userId: counselor.id, photo: px });
  const meId = (await req("GET", `/api/counselor?userId=${counselor.id}`)).json?.profile?.id;
  const ph = await req("GET", `/api/counselors/${meId}/photo`);
  check("الصورة المحفوظة تُقدَّم (200 image/png)", ph.status === 200 && (ph.headers["content-type"] || "").startsWith("image/png"));
  check("الصورة تُخبَّأ يوماً فقط بـ ETag", /max-age=86400/.test(ph.headers["cache-control"] || "") && !!ph.headers.etag);

  /* ─── 10) بقايا المحفظة/النسخة القديمة محذوفة ─── */
  console.log("\n── 10) بقايا محذوفة ──");
  check("api/payments حُذف", !fs.existsSync("src/app/api/payments"));
  check("api/victim حُذف", !fs.existsSync("src/app/api/victim"));
  check("wallet.tsx حُذف", !fs.existsSync("src/components/views/wallet.tsx"));
  check("victim-*.tsx حُذفت", !fs.existsSync("src/components/views/victim-find.tsx") && !fs.existsSync("src/components/views/victim-topics.tsx"));
  check("لا USD مثبت في الإعدادات (كان شكوى المستخدم)", !fs.readFileSync("src/components/views/settings.tsx", "utf-8").includes('dir="ltr">USD</span>'));

  /* ─── 11) i18n ×6 ─── */
  console.log("\n── 11) الترجمات الست ──");
  const langs = ["ar", "en", "fr", "tr", "ru", "zh"];
  let allKeys = true;
  for (const l of langs) {
    const s = fs.readFileSync(`src/lib/i18n/${l}.ts`, "utf-8");
    const ok = s.includes("priceInvalid") && s.includes("bulkUserPlaceholder") && s.includes("cancelConfirmTitle") && s.includes("priceNote") && s.includes("photoUnsupported");
    if (!ok) { allKeys = false; console.log(`    مفقود في ${l}`); }
  }
  check("كل المفاتيح الجديدة في اللغات الست", allKeys);
  check("ar: hint السعر يذكر «بلا أي تحويل»", fs.readFileSync("src/lib/i18n/ar.ts", "utf-8").includes("بلا أي تحويل"));

  /* ─── 12) زر الطباعة ─── */
  console.log("\n── 12) زر طباعة الشهادة ──");
  const pb = fs.readFileSync("src/app/certificate/[id]/print-button.tsx", "utf-8");
  check("الزر يفتح حوار الطباعة (print + iframe)", pb.includes("contentWindow?.print") && pb.includes("@page{size:A4 landscape;margin:0}"));
  check("بلا تنزيل PDF مباشر (html-to-image أُزيل)", !pb.includes("html-to-image"));
  const cert = fs.readFileSync("src/app/certificate/[id]/page.tsx", "utf-8");
  check("الرقم التسلسلي TMN (بدل RFQ)", cert.includes("TMN-") && !cert.includes("RFQ-"));

  server.kill();
  await mongod.stop();
  console.log("\n" + "═".repeat(56));
  if (failures === 0) console.log("🎉 كل اختبارات v1.3.0 خضراء");
  else { console.log(`💥 ${failures} فحوصات حمراء`); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
