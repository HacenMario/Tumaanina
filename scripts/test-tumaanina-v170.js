/**
 * اختبار طمأنينة v1.7.0 — بندي الجولة
 * ─────────────────────────────────────────────────────────────────
 *  1. الخادم v1.7.0 جاهز
 *  2. بطاقة المحادثات (بند 1): /api/messages/threads لا يُعيد أي محتوى
 *     لآخر رسالة (نصاً أو صوتاً) — يعيد الاسم والوقت والاتجاه فقط
 *     + الإسقاط الخفيف (لا بيانات ثقيلة في الاستقصاء)
 *  3. مستحقات المختصين (بند 2): فعل counselors-earnings خلف بوابة الرمز
 *     + أرقام دقيقة (عدد الجلسات + إجمالي بعملته + عمولة 15% + الصافي
 *     + مستحق هذا الشهر + آخر 8 جلسات بتفاصيلها) + الملخّص العام
 *  4. فحوص ملفات: بطاقة بلا lastMessage + التبويب مركّب + i18n ×6
 */
const { MongoMemoryServer } = require("mongodb-memory-server");
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = String(3900 + (process.pid % 200) + Math.floor(Math.random() * 80));
const BASE = `http://localhost:${PORT}`;
const ROOT = path.join(__dirname, "..");
let ADMIN_TOKEN = "";
let failures = 0;

function req(method, pathQ, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(`${BASE}${pathQ}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(ADMIN_TOKEN ? { "x-admin-token": ADMIN_TOKEN } : {}),
        ...extraHeaders,
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
      },
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
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

(async () => {
  console.log("═".repeat(56));
  console.log("🧪 اختبار طمأنينة v1.7.0 — بندي الجولة");
  console.log("═".repeat(56));

  const mongod = await MongoMemoryServer.create();
  const server = spawn("node", ["server.js"], {
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("tumaanina-v17"), ADMIN_PASSCODE: "tum-pass-17", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  server.stderr.on("data", () => {});
  let ready = false;
  for (let i = 0; i < 60; i++) {
    await wait(500);
    try {
      const h = await req("GET", "/api/health");
      if (h.json?.version === "1.7.0" && h.json?.ok) { ready = true; break; }
    } catch {}
  }
  check("الخادم v1.7.0 جاهز", ready);
  if (!ready) { server.kill(); process.exit(1); }

  const login = await req("POST", "/api/admin", { action: "login", passcode: "tum-pass-17" });
  ADMIN_TOKEN = login.json?.token || "";
  check("رمز الإدارة صادر", !!ADMIN_TOKEN);

  /* الحسابات */
  const client = (await req("POST", "/api/client", {
    action: "register", pseudonym: "عميل-المستحقات", password: "pass-tumaanina-1",
    recoveryPhrase: "عبارة استرجاع تجريبية", gender: "male", phone: "0555999017",
  })).json.user;
  const cEmail = `doc17-${Date.now()}@test.dz`;
  await req("POST", "/api/counselor", {
    action: "register", fullName: "د. المستحقات", email: cEmail,
    password: "pass-tumaanina-1", recoveryPhrase: "عبارة اختبار الأخصائي",
    specialties: ["anxietyDepression"], languages: ["ar"], yearsExperience: 6,
    whatsapp: "213666999017", sessionPrice: 2000,
  });
  const counselor = (await req("POST", "/api/counselor", { action: "login", email: cEmail, password: "pass-tumaanina-1" })).json.user;
  const meProf = (await req("GET", `/api/counselor?userId=${counselor.id}`)).json?.profile;
  await req("POST", "/api/admin", { action: "verify", profileId: meProf?.id });

  /* جلسة مستقبلية (لبناء خيط DM مشروع) */
  const when = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
  const b = await req("POST", "/api/sessions", { victimId: client.id, counselorId: counselor.id, topic: "anxiety", mode: "TEXT", scheduledAt: when, currency: "DZD" });
  const sid = b.json?.session?.id;
  check("الحجز نجح", b.status === 200 && !!sid);

  /* ═══ 2) بطاقة المحادثات — بلا أي معاينة (بند 1) ═══ */
  console.log("\n── 1) بطاقة المحادثات: لا محتوى لآخر رسالة (بند 1) ──");
  const dmKey = `dm:${client.id}:${counselor.id}`;
  /* رسالة نصية من العميل */
  const t1 = await req("POST", "/api/messages", { threadKey: dmKey, senderRole: "VICTIM", senderName: client.pseudonym, senderId: client.id, content: "مرحباً دكتور، أريد مساعدة" });
  check("رسالة DM نصية من العميل → مقبولة", t1.status === 200);
  /* رسالة صوتية كبيرة من العميل (500KB — السيناريو الذي كان يشوّه الهاتف) */
  const audioBytes = Buffer.alloc(380_000);
  for (let i = 0; i < audioBytes.length; i++) audioBytes[i] = 65 + (i % 26);
  const audioOk = "data:audio/webm;base64," + audioBytes.toString("base64");
  const v1 = await req("POST", "/api/messages", { threadKey: dmKey, senderRole: "VICTIM", senderName: client.pseudonym, senderId: client.id, content: audioOk, type: "voice", seconds: 37 });
  check("رسالة DM صوتية كبيرة → مقبولة", v1.status === 200);
  /* رد الأخصائي (حتى يصبح آخر رسالة من طرفه) */
  const t2 = await req("POST", "/api/messages", { threadKey: dmKey, senderRole: "COUNSELOR", senderName: "د. المستحقات", senderId: counselor.id, content: "أهلاً بك، كيف أشعرتك اليوم؟" });
  check("رد الأخصائي → مقبول", t2.status === 200);

  const thC = (await req("GET", `/api/messages/threads?userId=${counselor.id}`)).json?.threads || [];
  const thRow = thC.find((x) => x.peerId === client.id);
  check("خيط العميل ظاهر في قائمة الأخصائي", !!thRow, JSON.stringify(thC).slice(0, 150));
  check("لا حقل lastMessage إطلاقاً (حتى للصوتية)", thRow && !("lastMessage" in thRow), JSON.stringify(thRow).slice(0, 200));
  check("لا أي تسريب لمحتوى في الرد كله", !JSON.stringify(thC).includes("data:audio") && !JSON.stringify(thC).includes("أهلاً بك"));
  check("وقت آخر نشاط موجود (للعرض)", !!thRow?.lastAt);
  check("اتجاه آخر رسالة (mine=true للأخصائي — آخر رسالة رده)", thRow?.mine === true, JSON.stringify(thRow).slice(0, 200));

  const thV = (await req("GET", `/api/messages/threads?userId=${client.id}`)).json?.threads || [];
  const vRow = thV.find((x) => x.peerId === counselor.id);
  check("من جهة العميل: البطاقة بلا محتوى أيضاً", !!vRow && !("lastMessage" in vRow) && !!vRow?.lastAt, JSON.stringify(vRow).slice(0, 150));

  /* فحص مصدر الخدمة: الإسقاط الخفيف بلا content */
  const threadsSrc = read("src/app/api/messages/threads/route.ts");
  check("الخادم: إسقاط خفيف $project (لا سحب للوثيقة الكاملة)", threadsSrc.includes("$project") && threadsSrc.includes("threadKey: 1"));
  check("الخادم: لا lastMessage ولا content في الرد", !threadsSrc.includes("lastMessage") && !threadsSrc.includes("content:"));
  const dashSrc = read("src/components/views/counselor-dashboard.tsx");
  check("الواجهة: بطاقة المحادثات بلا lastMessage", !dashSrc.includes("lastMessage"));
  check("الواجهة: بطاقة المحادثات تعرض الحالة القصيرة", dashSrc.includes("convoOpenMine") && dashSrc.includes("convoOpenPeer"));

  /* ═══ 3) مستحقات المختصين (بند 2) ═══ */
  console.log("\n── 2) مستحقات المختصين: أرقام دقيقة + صلاحيات (بند 2) ──");
  const noTok = await req("POST", "/api/admin", { action: "counselors-earnings" }, { "x-admin-token": "" });
  check("بلا رمز إدارة → 401", noTok.status === 401, `status=${noTok.status}`);

  /* جلسة مكتملة هذا الشهر بسعر معروف: 2000 دج → عمولة 300 دج + صافي 1700 دج */
  const { MongoClient } = require("mongodb");
  const mClient = new MongoClient(mongod.getUri("tumaanina-v17"));
  await mClient.connect();
  const OID = require("mongodb").ObjectId;
  const sessionsCol = mClient.db().collection("sessions");
  const now = new Date();
  await sessionsCol.insertMany([
    {
      victimId: new OID(client.id), counselorId: new OID(counselor.id),
      topic: "stress", mode: "TEXT", currency: "DZD", price: 2000, status: "COMPLETED",
      scheduledAt: new Date(now.getTime() - 3 * 3600e3), endedAt: new Date(now.getTime() - 2 * 3600e3),
      createdAt: new Date(now.getTime() - 4 * 3600e3),
    },
    {
      victimId: new OID(client.id), counselorId: new OID(counselor.id),
      topic: "anxiety", mode: "VOICE", currency: "EUR", price: 20, status: "COMPLETED",
      scheduledAt: new Date(now.getTime() - 26 * 3600e3), endedAt: new Date(now.getTime() - 25 * 3600e3),
      createdAt: new Date(now.getTime() - 27 * 3600e3),
    },
    /* جلسة مكتملة الشهر الماضي — تدخل الإجمالي ولا تدخل مستحق هذا الشهر */
    {
      victimId: new OID(client.id), counselorId: new OID(counselor.id),
      topic: "sleep", mode: "TEXT", currency: "DZD", price: 1500, status: "COMPLETED",
      scheduledAt: new Date(now.getFullYear(), now.getMonth() - 1, 5), endedAt: new Date(now.getFullYear(), now.getMonth() - 1, 5, 12),
      createdAt: new Date(now.getFullYear(), now.getMonth() - 1, 5, 10),
    },
    /* جلسة غير مكتملة — لا تُحتسب أبداً */
    {
      victimId: new OID(client.id), counselorId: new OID(counselor.id),
      topic: "anger", mode: "TEXT", currency: "DZD", price: 9000, status: "PENDING",
      scheduledAt: when, createdAt: new Date(),
    },
  ]);

  const earn = (await req("POST", "/api/admin", { action: "counselors-earnings" })).json;
  check("counselors-earnings → ok مع رمز الإدارة", earn?.ok === true);
  const row = (earn?.counselors || []).find((c) => c.id === counselor.id);
  check("صف المختص موجود باسمه", !!row && row.name === "د. المستحقات", JSON.stringify(earn?.counselors?.[0]).slice(0, 150));
  check("عدد المكتملة = 3 (والمعلّقة مستثناة)", row?.completedCount === 3, `got=${row?.completedCount}`);
  check("إجمالي DZD = 3500 (2000+1500)", row?.gross?.DZD === 3500, `got=${row?.gross?.DZD}`);
  check("إجمالي EUR = 20 (بلا أي تحويل)", row?.gross?.EUR === 20, `got=${row?.gross?.EUR}`);
  check("عمولة 15% DZD = 525", row?.commission?.DZD === 525, `got=${row?.commission?.DZD}`);
  check("عمولة 15% EUR = 3", row?.commission?.EUR === 3, `got=${row?.commission?.EUR}`);
  check("صافي المختص DZD = 2975", row?.net?.DZD === 2975, `got=${row?.net?.DZD}`);
  check("مستحق هذا الشهر DZD = 300 (خارج الشهر مستثنى)", row?.dueThisMonth?.DZD === 300, `got=${row?.dueThisMonth?.DZD}`);
  check("مستحق هذا الشهر EUR = 3", row?.dueThisMonth?.EUR === 3, `got=${row?.dueThisMonth?.EUR}`);
  check("آخر جلسة مكتملة مسجلة", !!row?.lastCompletedAt);
  check("آخر 8 جلسات: العميل والموضوع والسعر والعمولة", row?.recent?.length === 3 && row.recent[0].clientAlias === "عميل-المستحقات" && row.recent[0].price === 2000 && row.recent[0].commission === 300, JSON.stringify(row?.recent?.[0]).slice(0, 200));

  /* الملخّص العام = مجموع الصفوف */
  check("الملخّص: count=3", earn?.grand?.count === 3, `got=${earn?.grand?.count}`);
  check("الملخّص: عمولة DZD = 525 (15% من 3500)", earn?.grand?.commission?.DZD === 525, `got=${earn?.grand?.commission?.DZD}`);
  check("الملخّص: المبيعات EUR = 20", earn?.grand?.gross?.EUR === 20, `got=${earn?.grand?.gross?.EUR}`);

  /* مختص بلا جلسات: صف بعدد 0 وبلا مبالغ */
  const c2Email = `doc17b-${Date.now()}@test.dz`;
  const reg2 = await req("POST", "/api/counselor", {
    action: "register", fullName: "د. بلا جلسات", email: c2Email,
    password: "pass-tumaanina-1", recoveryPhrase: "عبارة اختبار", specialties: ["anxietyDepression"], languages: ["ar"], yearsExperience: 2,
    whatsapp: "213666999018", sessionPrice: 1500,
  });
  const earn2 = (await req("POST", "/api/admin", { action: "counselors-earnings" })).json;
  const emptyRow = (earn2?.counselors || []).find((c) => c.name === "د. بلا جلسات");
  check("مختص بلا جلسات: صف بعدد 0", reg2.status === 200 && !!emptyRow && emptyRow.completedCount === 0 && emptyRow.gross.DZD === 0, `reg=${reg2.status}/${JSON.stringify(reg2.json).slice(0, 80)} row=${emptyRow ? JSON.stringify(emptyRow).slice(0, 120) : "غير موجود"}`);
  check("الترتيب: الأكثر جلسات أولاً", earn2?.counselors?.[0]?.id === counselor.id);

  /* ═══ 4) فحوص ملفات + الترجمة ×6 ═══ */
  console.log("\n── 3) فحوص ملفات + الترجمة ×6 ──");
  check("مكوّن admin-earnings.tsx موجود ويصدّر AdminEarningsTab", fs.existsSync(path.join(ROOT, "src/components/views/admin-earnings.tsx")) && read("src/components/views/admin-earnings.tsx").includes("export function AdminEarningsTab"));
  const adminSrc = read("src/components/views/admin.tsx");
  check("التبويب مركّب في لوحة الأدمين (trigger + content)", adminSrc.includes('value="earnings"') && adminSrc.includes("<AdminEarningsTab />"));
  const authSrc = read("src/lib/server/admin-auth.ts");
  check("الصلاحية: counselors-earnings = مستوى قراءة (1)", authSrc.includes('"counselors-earnings": 1'));
  const apiSrc = read("src/app/api/admin/route.ts");
  check("الخادم: فعل counselors-earnings بعمولة 15%", apiSrc.includes('"counselors-earnings"') && apiSrc.includes("PLATFORM_COMMISSION_RATE"));

  let i18nOk = true;
  for (const lang of ["ar", "en", "fr", "tr", "ru", "zh"]) {
    const s = read(`src/lib/i18n/${lang}.ts`);
    if (!(s.includes("earningsTab") && s.includes("earningsClientLabel") && s.includes("convoOpenMine") && s.includes("convoOpenPeer"))) { i18nOk = false; console.log(`     ↳ ${lang} ناقص`); }
  }
  check("i18n ×6: مفاتيح البندين كاملة في كل اللغات", i18nOk);

  console.log("═".repeat(56));
  if (failures === 0) console.log("🏆 كل فحوص v1.7.0 خضراء");
  else { console.log(`⚠️ فشل ${failures} فحص`); }
  console.log("═".repeat(56));

  server.kill("SIGKILL");
  await mClient.close().catch(() => {});
  await mongod.stop().catch(() => {});
  process.exit(failures === 0 ? 0 : 1);
})();
