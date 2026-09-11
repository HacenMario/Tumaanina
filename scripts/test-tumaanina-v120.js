/**
 * اختبار طمأنينة v1.2.0 — ثلاث عملات + لوحة الأخصائي + عمولة 15%
 * ─────────────────────────────────────────────────────────────────
 *  1. الخادم v1.2.0 جاهز
 *  2. عمولة 15%: لوحة المختص تحسبها صح (gross/commission/net/dueThisMonth)
 *  3. الفلاتر الثلاث (يومي/أسبوعي/شهري) تعيد buckets
 *  4. الثيمات: atlasgreen موجود في الكود + CSS
 *  5. العملات: DZD/EUR/USD في constants + rate صحيح
 *  6. بلا إشعار socialPost في الكود
 *  7. بلا «تطوع» في الترجمات الظاهرة
 *  8. انحدار: الحجز والسعر بالدينار كما في v1.1.0
 */
const { MongoMemoryServer } = require("mongodb-memory-server");
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");

const PORT = String(3600 + (process.pid % 300) + Math.floor(Math.random() * 100));
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
  console.log("🧪 اختبار طمأنينة v1.2.0 — عملات + لوحة أخصائي + عمولة 15%");
  console.log("═".repeat(56));

  const mongod = await MongoMemoryServer.create();
  const server = spawn("node", ["server.js"], {
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("tumaanina-v12"), ADMIN_PASSCODE: "tum-pass-12", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    await wait(500);
    try {
      const h = await req("GET", "/api/health");
      if (h.json?.version === "1.2.0" && h.json?.service === "tumaanina") { ready = true; break; }
    } catch {}
  }
  check("الخادم v1.2.0 (tumaanina) جاهز", ready);
  if (!ready) process.exit(1);

  await req("POST", "/api/admin", { action: "login", passcode: "tum-pass-12" });

  /* بيانات: عميل + أخصائي موثّق بسعر 2000 دج */
  const client = (await req("POST", "/api/client", {
    action: "register", pseudonym: "عميل-لوحة", password: "pass-tumaanina-1",
    recoveryPhrase: "عبارة استرجاع تجريبية", gender: "male", phone: "0555777000",
  })).json.user;
  const cEmail = `doc2-${Date.now()}@test.dz`;
  await req("POST", "/api/counselor", {
    action: "register", fullName: "د. لوحة الإحصائيات", email: cEmail,
    password: "pass-tumaanina-1", recoveryPhrase: "عبارة اختبار الأخصائي",
    specialties: ["anxietyDepression"], languages: ["ar"], yearsExperience: 6,
    whatsapp: "213666777000", sessionPrice: 2000,
  });
  const counselor = (await req("POST", "/api/counselor", { action: "login", email: cEmail, password: "pass-tumaanina-1" })).json.user;
  const meProf = await req("GET", `/api/counselor?userId=${counselor.id}`);
  await req("POST", "/api/admin", { action: "verify", profileId: meProf.json?.profile?.id });

  /* 3 جلسات مكتملة × 2000 = 6000 → عمولة 900 (15%) وصافي 5100 */
  console.log("\n── 1) ثلاث جلسات مكتملة → عمولة 15% ──");
  for (let k = 1; k <= 3; k++) {
    const when = new Date(Date.now() + (24 + k * 30) * 3600 * 1000).toISOString();
    const b = await req("POST", "/api/sessions", { victimId: client.id, counselorId: counselor.id, topic: "anxiety", mode: "TEXT", scheduledAt: when });
    const sid = b.json?.session?.id;
    check(`حجز ${k} نجح بسعر 2000`, b.status === 200 && Number(b.json?.session?.price) === 2000);
    await req("PATCH", `/api/sessions/${sid}`, { status: "ACCEPTED", durationMinutes: 45 });
    const done = await req("PATCH", `/api/sessions/${sid}`, { status: "COMPLETED" });
    check(`اكتمال ${k} نجح`, done.status === 200);
  }

  /* ─── لوحة الأخصائي ─── */
  console.log("\n── 2) لوحة الأخصائي: الإحصائيات والعمولة ──");
  const stats = await req("GET", `/api/counselor/stats?userId=${counselor.id}&period=month`);
  const st = stats.json?.stats;
  check("اللوحة تعمل (period=month)", stats.status === 200 && !!st);
  check("عدد المكتملة = 3", Number(st?.totals?.count) === 3, `count=${st?.totals?.count}`);
  check("إجمالي المبيعات 6000 دج", Number(st?.totals?.gross) === 6000, `gross=${st?.totals?.gross}`);
  check("عمولة 15% = 900 دج", Number(st?.totals?.commission) === 900, `commission=${st?.totals?.commission}`);
  check("الصافي 5100 دج", Number(st?.totals?.net) === 5100, `net=${st?.totals?.net}`);
  check("مستحق الشهر الحالي 900 دج", Number(st?.dueThisMonth) === 900, `due=${st?.dueThisMonth}`);
  check("commissionRate = 0.15", Number(st?.commissionRate) === 0.15);
  check("buckets الشهرية = 12", (st?.buckets || []).length === 12);

  const statsDay = await req("GET", `/api/counselor/stats?userId=${counselor.id}&period=day`);
  check("فلتر يومي → 30 bucket", (statsDay.json?.stats?.buckets || []).length === 30);
  const statsWeek = await req("GET", `/api/counselor/stats?userId=${counselor.id}&period=week`);
  check("فلتر أسبوعي → 12 bucket", (statsWeek.json?.stats?.buckets || []).length === 12);
  check("recent فيها الأسعار والعمولة", (st?.recent || []).length === 3 && Number(st.recent[0]?.commission) === 300);

  /* حماية: عميل لا يرى لوحة المختص */
  const intruder = await req("GET", `/api/counselor/stats?userId=${client.id}`);
  check("العميل مرفوض من لوحة المختص (401)", intruder.status === 401);

  /* ─── العملات والثيمات في الكود ─── */
  console.log("\n── 3) العملات والثيمات ──");
  const constants = fs.readFileSync("src/lib/constants.ts", "utf-8");
  check("ثلاث عملات في constants (DZD/EUR/USD)", constants.includes('DZD: { code: "DZD", rate: 1 }') && constants.includes('EUR: { code: "EUR", rate: 150 }') && constants.includes('USD: { code: "USD", rate: 135 }'));
  check("عمولة 15% في constants", constants.includes("PLATFORM_COMMISSION_RATE = 0.15"));
  const themes = fs.readFileSync("src/lib/themes.ts", "utf-8");
  check("atlasgreen في نظام الثيمات", themes.includes('"atlasgreen"'));
  const css = fs.readFileSync("src/app/globals.css", "utf-8");
  check("CSS للأخضر الأطلسي (نهاري + ليلي)", css.includes('[data-palette="atlasgreen"]') && css.includes('.dark[data-palette="atlasgreen"]'));
  const arI = fs.readFileSync("src/lib/i18n/ar.ts", "utf-8");
  check("ar: الثيم البنفسجي صُحح + الأخضر الأطلسي موجود", arI.includes("بنفسجي طمأنينة") && arI.includes("الأخضر الأطلسي"));
  check("ar: لوحة الأخصائي مترجمة (cdash)", arI.includes("cdash") && arI.includes("المستحق للمنصة هذا الشهر"));
  check("ar: منتقي العملة مترجم", arI.includes("currencyLabel") && arI.includes("دينار جزائري"));
  check("ar: بلا «شهادة التطوع»", !arI.includes("شهادة التطوع"));
  const enI = fs.readFileSync("src/lib/i18n/en.ts", "utf-8");
  check("en: بلا Volunteer certificate", !enI.includes("Volunteer certificate"));
  check("en: cdash مترجمة", enI.includes("Platform dues this month"));

  /* ─── بلا إشعار منشورات للمتابعين ─── */
  console.log("\n── 4) إشعارات المنشورات أُزيلت ──");
  const social = fs.readFileSync("src/app/api/social/route.ts", "utf-8");
  const notify = fs.readFileSync("src/lib/server/notify.ts", "utf-8");
  check("بلا socialPost في API المجتمع", !social.includes('"socialPost"'));
  check("بلا socialPost في قوالب الإشعارات", !notify.includes("socialPost"));

  /* ─── الهاتف ─── */
  console.log("\n── 5) نصوص الهاتف المصححة ──");
  check("privacyP1 تذكر أن الهاتف إلزامي ويظهر للمختص فقط", arI.includes("إلزامي للتواصل حول جلساتك — يظهر لمختص جلستك أنت فقط"));
  check("en privacyP1 صُححت", enI.includes("visible only to the specialist of your session"));

  console.log("═".repeat(56));
  if (failures === 0) console.log("🎉 كل الفحوصات خضراء — طمأنينة v1.2.0 جاهزة");
  else { console.log(`⚠️ ${failures} فحص فاشل`); process.exitCode = 1; }

  server.kill();
  await mongod.stop();
  process.exit(process.exitCode || 0);
})();
