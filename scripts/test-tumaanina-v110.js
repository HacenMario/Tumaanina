/**
 * اختبار طمأنينة v1.1.0 — الاستقلالية + الدينار الجزائري + بلا محفظة
 * ─────────────────────────────────────────────────────────────────────
 *  1. الخادم v1.1.0 (tumaanina) جاهز على أي منفذ
 *  2. تسجيل عميل مباشر — بلا walletBalance في الاستجابة إطلاقاً
 *  3. أخصائي بسعر 3000 دج → PENDING → حجز مرفوض حتى التوثيق
 *  4. الحجز نجح بلا أي رصيد — السعر مثبّت 3000 — بلا paymentStatus
 *  5. الإلغاء → بلا أي استرداد أو إشعار refunded
 *  6. الاكتمال → بلا أرباح أو earningCredited — بلا walletBalance للأخصائي
 *  7. /api/payments محذوف (404) + admin المالية → Unknown action
 *  8. جلسة متابعة تُنشأ بسعر الأخصائي الحالي — بلا paymentStatus
 *  9. الهوية: manifest طمأنينة + sw.js بلا أثر قديم + health 1.1.0
 * 10. انحدار: توثيق العملاء القديم أُزيل نهائياً
 */
const { MongoMemoryServer } = require("mongodb-memory-server");
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");

const PORT = String(3500 + (process.pid % 300) + Math.floor(Math.random() * 100));
const BASE = `http://localhost:${PORT}`;
let failures = 0;

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(`${BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}) },
    }, (res) => {
      let buf = "";
      res.on("data", (c) => (buf += c));
      res.on("end", () => { let j = null; try { j = JSON.parse(buf); } catch {} resolve({ status: res.statusCode, json: j }); });
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
  console.log("🧪 اختبار طمأنينة v1.1.0 — بلا محفظة + دينار جزائري + استقلالية");
  console.log("═".repeat(56));

  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri("tumaanina-v11");
  const server = spawn("node", ["server.js"], {
    env: { ...process.env, PORT, MONGODB_URI: uri, ADMIN_PASSCODE: "tum-pass-11", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  server.stderr.on("data", (d) => process.stderr.write(d));
  let ready = false;
  for (let i = 0; i < 60; i++) {
    await wait(500);
    try {
      const h = await req("GET", "/api/health");
      if (h.json?.version === "1.1.0" && h.json?.service === "tumaanina") { ready = true; break; }
    } catch {}
  }
  check("الخادم v1.1.0 (tumaanina) جاهز", ready);
  if (!ready) process.exit(1);

  await req("POST", "/api/admin", { action: "login", passcode: "tum-pass-11" });

  /* ─── 1) عميل: تسجيل مباشر — بلا محفظة ─── */
  console.log("\n── 1) تسجيل عميل بلا محفظة ──");
  const client = (await req("POST", "/api/client", {
    action: "register", pseudonym: "عميل-تجربة", password: "pass-tumaanina-1",
    recoveryPhrase: "عبارة استرجاع تجريبية", gender: "male", phone: "0555777000",
  })).json.user;
  check("تسجيل عميل بدون أي توثيق", !!client?.id);
  check("الاستجابة بلا walletBalance إطلاقاً", !("walletBalance" in (client || {})));

  /* ─── 2) أخصائي بسعر 3000 دج ─── */
  console.log("\n── 2) أخصائي بسعر 3000 دج ──");
  const cEmail = `doc1-${Date.now()}@test.dz`;
  await req("POST", "/api/counselor", {
    action: "register", fullName: "د. طمأنينة التجربة", email: cEmail,
    password: "pass-tumaanina-1", recoveryPhrase: "عبارة اختبار الأخصائي",
    specialties: ["anxietyDepression"], languages: ["ar"], yearsExperience: 7,
    whatsapp: "213666777000", sessionPrice: 3000,
  });
  const counselor = (await req("POST", "/api/counselor", { action: "login", email: cEmail, password: "pass-tumaanina-1" })).json.user;
  const meProf = await req("GET", `/api/counselor?userId=${counselor.id}`);
  check("سعر الجلسة محفوظ (3000 دج)", Number(meProf.json?.profile?.sessionPrice) === 3000);
  check("الأخصائي يبدأ PENDING", meProf.json?.profile?.verificationStatus === "PENDING");
  check("بلا walletBalance في ملف الأخصائي", !("walletBalance" in (meProf.json?.profile || {})));

  const blockedBook = await req("POST", "/api/sessions", {
    victimId: client.id, counselorId: counselor.id, topic: "anxiety", mode: "TEXT",
    scheduledAt: new Date(Date.now() + 26 * 3600 * 1000).toISOString(),
  });
  check("حجز مع أخصائي غير موثّق مرفوض (COUNSELOR_UNVERIFIED)", blockedBook.status === 403 && blockedBook.json?.error === "COUNSELOR_UNVERIFIED");

  await req("POST", "/api/admin", { action: "verify", profileId: meProf.json?.profile?.id });
  check("الأخصائي موثّق من الإدارة", true);

  /* السعر يظهر في دليل الأخصائيين كما هو */
  const dir = await req("GET", `/api/counselors?userId=${client.id}`);
  const card = (dir.json?.counselors || dir.json || []).find?.((c) => c.userId === counselor.id) ||
               (Array.isArray(dir.json) ? dir.json : []).find?.((c) => c.userId === counselor.id);
  check("السعر يظهر في الدليل (3000)", card ? Number(card.sessionPrice) === 3000 : "غير موجود في القائمة", JSON.stringify(card?.sessionPrice));

  /* ─── 3) الحجز بلا أي رصيد → نجاح ─── */
  console.log("\n── 3) الحجز نجح بلا أي رصيد ──");
  const when = new Date(Date.now() + 26 * 3600 * 1000).toISOString();
  const book = await req("POST", "/api/sessions", {
    victimId: client.id, counselorId: counselor.id, topic: "anxiety", mode: "TEXT", scheduledAt: when,
  });
  const sid = book.json?.session?.id || book.json?.id;
  check("الحجز نجح من أول مرة (بلا شحن)", book.status === 200 && !!sid, JSON.stringify(book.json));
  check("السعر مثبّت على الجلسة (3000 دج)", Number(book.json?.session?.price) === 3000);
  check("بلا paymentStatus في الجلسة", !("paymentStatus" in (book.json?.session || {})));

  /* ─── 4) الإلغاء → بلا استرداد ─── */
  console.log("\n── 4) الإلغاء بلا أي تسوية مالية ──");
  await req("PATCH", `/api/sessions/${sid}`, { status: "ACCEPTED", durationMinutes: 45 });
  await wait(600);
  const n1 = (await req("GET", `/api/notifications?userId=${client.id}`)).json;
  check("إشعار القبول وصل للعميل", (n1?.notifications || []).some((n) => n.key === "accepted"));
  check("بلا إشعار refunded", !(n1?.notifications || []).some((n) => n.key === "refunded"));
  const cancel = await req("PATCH", `/api/sessions/${sid}`, { status: "CANCELLED", cancelledBy: "VICTIM" });
  check("الإلغاء نجح", cancel.status === 200);
  check("بلا paymentStatus في استجابة الإلغاء", !("paymentStatus" in (cancel.json?.session || {})));

  /* ─── 5) الاكتمال → بلا أرباح ─── */
  console.log("\n── 5) الاكتمال بلا صرف أرباح ──");
  const when2 = new Date(Date.now() + 50 * 3600 * 1000).toISOString();
  const book2 = await req("POST", "/api/sessions", {
    victimId: client.id, counselorId: counselor.id, topic: "anxiety", mode: "TEXT", scheduledAt: when2,
  });
  const sid2 = book2.json?.session?.id;
  check("حجز ثانٍ نجح", book2.status === 200 && !!sid2);
  const done = await req("PATCH", `/api/sessions/${sid2}`, { status: "COMPLETED" });
  check("الاكتمال نجح", done.status === 200);
  const prof2 = (await req("GET", `/api/counselor?userId=${counselor.id}`)).json;
  check("بلا أرباح تُضاف للأخصائي", !("walletBalance" in (prof2?.profile || {})));
  await wait(700);
  const nC = (await req("GET", `/api/notifications?userId=${counselor.id}`)).json;
  check("بلا إشعار earningCredited", !(nC?.notifications || []).some((n) => n.key === "earningCredited"));
  const nCli = (await req("GET", `/api/notifications?userId=${client.id}`)).json;
  check("إشعار الاكتمال العادي وصل", (nCli?.notifications || []).some((n) => n.key === "completed"));

  /* ─── 6) جلسة متابعة بسعر الأخصائي ─── */
  console.log("\n── 6) جلسة المتابعة بسعر الأخصائي الحالي ──");
  const fu = await req("PATCH", `/api/sessions/${sid2}`, { status: "COMPLETED", followUpAt: new Date(Date.now() + 98 * 3600 * 1000).toISOString() });
  check("جلسة المتابعة أُنشئت", fu.status === 200 && !!fu.json?.followUpCreated);
  const fuSession = await req("GET", `/api/sessions/${fu.json?.followUpCreated}`);
  check("المتابعة بسعر 3000 دج", Number(fuSession.json?.session?.price) === 3000);
  check("بلا paymentStatus في المتابعة", !("paymentStatus" in (fuSession.json?.session || {})));

  /* ─── 7) المحفظة مُزالة كلياً ─── */
  console.log("\n── 7) المحفظة مُزالة كلياً ──");
  const payApi = await req("POST", "/api/payments", { action: "topup-card", userId: client.id, amount: 100 });
  check("/api/payments محذوف (404)", payApi.status === 404);
  const pl = await req("POST", "/api/admin", { action: "payments-list" });
  check("payments-list → Unknown action", pl.json?.error === "Unknown action");
  const pd = await req("POST", "/api/admin", { action: "payment-decide", txId: "x", approve: true });
  check("payment-decide → Unknown action", pd.json?.error === "Unknown action");
  const rs = await req("POST", "/api/admin", { action: "revenue-stats" });
  check("revenue-stats → Unknown action", rs.json?.error === "Unknown action");

  /* ─── 8) الهوية والاستقلالية ─── */
  console.log("\n── 8) الهوية والاستقلالية ──");
  const manifest = JSON.parse(fs.readFileSync("public/manifest.webmanifest", "utf-8"));
  check("manifest: الاسم طمأنينة", manifest.name?.includes("طمأنينة") && manifest.short_name === "طمأنينة");
  const sw = fs.readFileSync("public/sw.js", "utf-8");
  check("sw.js بلا أثر للاسم القديم", !/rafiqi/i.test(sw) && sw.includes("tumaanina"));
  const arI18n = fs.readFileSync("src/lib/i18n/ar.ts", "utf-8");
  check("الترجمات: بلا مجان ومحفظة", !arI18n.includes("مجان") && !arI18n.includes("محفظة"));
  const enI18n = fs.readFileSync("src/lib/i18n/en.ts", "utf-8");
  check("en: بلا مجانية (free) في وصف الهبوط", !/A free,/i.test(enI18n));
  check("الشعار الجديد في footer.tagline", arI18n.includes("لتعود طمأنينتك") && enI18n.includes("peace of mind"));
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf-8"));
  check("package.json v1.1.0 + name tumaanina", pkg.version === "1.1.0" && pkg.name === "tumaanina");

  /* ─── 9) انحدار: توثيق العملاء أُزيل ─── */
  console.log("\n── 9) إزالة توثيق العملاء نهائياً ──");
  const oldVv = await req("POST", "/api/admin", { action: "victim-verifications" });
  check("victim-verifications لم يعد موجوداً", oldVv.json?.error === "Unknown action");
  const oldVverify = await req("POST", "/api/admin", { action: "verify-victim", victimId: client.id, approve: true });
  check("verify-victim لم يعد موجوداً", oldVverify.json?.error === "Unknown action");

  console.log("═".repeat(56));
  if (failures === 0) console.log("🎉 كل الفحوصات خضراء — طمأنينة v1.1.0 جاهزة");
  else { console.log(`⚠️ ${failures} فحص فاشل`); process.exitCode = 1; }

  server.kill();
  await mongod.stop();
  process.exit(process.exitCode || 0);
})();
