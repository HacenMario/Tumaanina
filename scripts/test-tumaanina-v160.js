/**
 * اختبار طمأنينة v1.6.0 — 16 بنداً من المستخدم
 * ─────────────────────────────────────────────────────────────────
 *  1. الخادم v1.6.0 جاهز
 *  2. الرسائل الصوتية (بنود 1+2): لا اقتطاع + seconds مخزّنة + قوائم خفيفة
 *     + مسار /audio بالصلاحيات + المدة الحقيقية
 *  3. الإشعارات ×6 (بند 12): vars مع المفتاح + /api/user-language يضبط لغة الحساب
 *  4. تحدي العملاء (بند 6): victimFirstSeenAt يحتسب الجلسة في وقتها/قبله
 *     (وبعكسه: خارج النافذة لا يُحتسب) + احتياط السجلات القديمة
 *  5. تحكّم الأدمين بالتحديين (بند 8): config get/set/reset + التعطيل يخفي
 *     النافذة (active=false) + ضغطات المختص تُرفض بعد التعطيل
 *  6. تغيير موعد العميل (بند 13): حارس خادمي SLOT_UNAVAILABLE خارج فقرة الأخصائي
 *  7. فحوصات ملفات: فقاعة الصوت، الضغطة الطويلة 3 ثوانٍ، هيكل الغرفة الجديد،
 *     حذف endedDesc، نسب التقييم، المخططين متطابقين، العبارات الجديدة، i18n ×6
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
  console.log("🧪 اختبار طمأنينة v1.6.0 — 16 بنداً");
  console.log("═".repeat(56));

  const mongod = await MongoMemoryServer.create();
  const server = spawn("node", ["server.js"], {
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("tumaanina-v16"), ADMIN_PASSCODE: "tum-pass-16", NODE_ENV: "production" },
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
  check("الخادم v1.6.0+ جاهز (يعمل على 1.7.0)", ready);
  if (!ready) { server.kill(); process.exit(1); }

  const login = await req("POST", "/api/admin", { action: "login", passcode: "tum-pass-16" });
  ADMIN_TOKEN = login.json?.token || "";
  check("رمز الإدارة صادر", !!ADMIN_TOKEN);

  /* الحسابات */
  const client = (await req("POST", "/api/client", {
    action: "register", pseudonym: "عميل-الجولة-الصوتية", password: "pass-tumaanina-1",
    recoveryPhrase: "عبارة استرجاع تجريبية", gender: "male", phone: "0555999016",
  })).json.user;
  const cEmail = `doc16-${Date.now()}@test.dz`;
  await req("POST", "/api/counselor", {
    action: "register", fullName: "د. الجولة الصوتية", email: cEmail,
    password: "pass-tumaanina-1", recoveryPhrase: "عبارة اختبار الأخصائي",
    specialties: ["anxietyDepression"], languages: ["ar"], yearsExperience: 6,
    whatsapp: "213666999016", sessionPrice: 2000,
  });
  const counselor = (await req("POST", "/api/counselor", { action: "login", email: cEmail, password: "pass-tumaanina-1" })).json.user;
  const meProf = (await req("GET", `/api/counselor?userId=${counselor.id}`)).json?.profile;
  await req("POST", "/api/admin", { action: "verify", profileId: meProf?.id });

  /* جلسة مستقبلية للدردشة */
  const when = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
  const b = await req("POST", "/api/sessions", { victimId: client.id, counselorId: counselor.id, topic: "anxiety", mode: "TEXT", scheduledAt: when, currency: "DZD" });
  const sid = b.json?.session?.id;
  check("الحجز نجح", b.status === 200 && !!sid);

  /* ═══ 2) الرسائل الصوتية — الإصلاح الجذري ═══ */
  console.log("\n── 1) الرسائل الصوتية: بلا اقتطاع + المدة + /audio (بنود 1+2+3) ──");
  /* 500KB صوت حقيقي الشكل — كان يُقتطع إلى 4000 حرف! */
  const audioBytes = Buffer.alloc(380_000);
  for (let i = 0; i < audioBytes.length; i++) audioBytes[i] = 65 + (i % 26);
  const audioOk = "data:audio/webm;base64," + audioBytes.toString("base64");
  const vm = await req("POST", "/api/messages", { sessionId: sid, senderRole: "VICTIM", senderName: client.pseudonym, senderId: client.id, content: audioOk, type: "voice", seconds: 42 });
  const vmId = vm.json?.message?.id;
  check("إرسال صوتية 500KB → مقبولة", vm.status === 200 && vm.json?.message?.type === "voice", JSON.stringify(vm.json).slice(0, 100));
  check("المدة seconds=42 مخزّنة في الرد", vm.json?.message?.seconds === 42);

  const vmList = (await req("GET", `/api/messages?sessionId=${sid}&full=1`)).json?.messages || [];
  const vmRow = vmList.find((m) => m.id === vmId);
  check("القائمة تُخفي بيانات الصوت (content فارغ) — استقصاء خفيف", !!vmRow && vmRow.type === "voice" && vmRow.content === "" && vmRow.audioReady === true, JSON.stringify(vmRow).slice(0, 120));
  check("القائمة تعيد المدة المخزّنة", vmRow?.seconds === 42);

  const audioRes = await req("GET", `/api/messages/${vmId}/audio?userId=${client.id}`);
  check("مسار /audio يعيد الصوت الكامل (بلا اقتطاع 4000)", audioRes.status === 200 && (audioRes.json?.content || "").length === audioOk.length, `len=${(audioRes.json?.content || "").length} vs ${audioOk.length}`);
  check("مسار /audio يعيد المدة", audioRes.json?.seconds === 42);

  const audioStranger = await req("GET", `/api/messages/${vmId}/audio?userId=000000000000000000000000`);
  check("مسار /audio لغريب → 403", audioStranger.status === 403);

  /* بقاء منطق النص: تعديل/حذف كما في v1.5.0 */
  const m1 = await req("POST", "/api/messages", { sessionId: sid, senderRole: "VICTIM", senderName: client.pseudonym, senderId: client.id, content: "نص قبل التعديل" });
  const mid = m1.json?.message?.id;
  const ed = await req("PATCH", `/api/messages/${mid}`, { userId: client.id, content: "نص بعد التعديل" });
  check("انحدار: تعديل النص يعمل", ed.status === 200 && !!ed.json?.message?.editedAt);
  const de = await req("DELETE", `/api/messages/${mid}`, { userId: client.id });
  check("انحدار: حذف النص يعمل", de.status === 200 && de.json?.message?.deleted === true);
  const vmBad = await req("POST", "/api/messages", { sessionId: sid, senderRole: "VICTIM", senderName: client.pseudonym, senderId: client.id, content: "ليس صوتاً", type: "voice", seconds: 3 });
  check("انحدار: صوت بمحتوى نصي → 400", vmBad.status === 400);

  /* ═══ 3) الإشعارات ×6 (بند 12) ═══ */
  console.log("\n── 2) الإشعارات: vars مخزّنة + مزامنة لغة الحساب (بند 12) ──");
  const rate = await req("POST", `/api/counselors/${counselor.id}/rate`, { victimId: client.id, stars: 5, sessionId: sid });
  check("تقييم يولّد إشعاراً", rate.status === 200 || rate.status === 201, `status=${rate.status}`);
  await wait(900);
  const cNotifs = (await req("GET", `/api/notifications?userId=${counselor.id}`)).json?.notifications || [];
  const rated = cNotifs.find((n) => n.key === "ratingReceived");
  check("الإشعار يحمل مفتاحه + vars ({name},{stars})", !!rated && !!rated.vars && rated.vars.name === "عميل-الجولة-الصوتية" && !!rated.vars.stars, JSON.stringify(rated).slice(0, 200));

  const langRes = await req("POST", "/api/user-language", { userId: counselor.id, language: "tr" });
  check("مزامنة اللغة → ok", langRes.status === 200 && langRes.json?.ok === true);
  const langBad = await req("POST", "/api/user-language", { userId: counselor.id, language: "xx" });
  check("لغة غير صالحة → 400", langBad.status === 400);
  const relog = (await req("POST", "/api/counselor", { action: "login", email: cEmail, password: "pass-tumaanina-1" })).json;
  check("لغة الحساب صارت tr فعلاً (تُقرأ من القاعدة)", relog?.user?.language === "tr", `lang=${relog?.user?.language}`);

  /* ═══ 4) تحدي العملاء — victimFirstSeenAt (بند 6) ═══ */
  console.log("\n── 3) تحدي العملاء: أول دخول يحتسب (بند 6 — إصلاح 0/4) ──");
  const { MongoClient } = require("mongodb");
  const mClient = new MongoClient(mongod.getUri("tumaanina-v16"));
  await mClient.connect();
  const sessionsCol = mClient.db().collection("sessions");
  const OID = require("mongodb").ObjectId;
  const MIN = 60 * 1000;
  /* جلسة في وقتها: العميل دخل أول مرة (firstSeen) بين الموعد−5د والموعد+10د
     وجلست طويلاً (آخر نبض بعيد عن الموعد — كان يُفشل العدّ قديماً) */
  await sessionsCol.insertOne({
    victimId: new OID(client.id), counselorId: new OID(counselor.id),
    topic: "stress", mode: "TEXT", currency: "DZD", price: 2000, status: "COMPLETED",
    scheduledAt: new Date(Date.now() - 65 * MIN),
    startedAt: new Date(Date.now() - 64 * MIN),
    victimFirstSeenAt: new Date(Date.now() - 63 * MIN),   /* دخل في وقته */
    victimLastSeenAt: new Date(Date.now() - 10 * MIN),    /* جلس 55 دقيقة — آخر نبض بعيد */
    createdAt: new Date(Date.now() - 70 * MIN),
  });
  /* جلسة فائتة أقدم تكسر السلسلة بعدها → streak=1 يثبت احتساب الأولى */
  await sessionsCol.insertOne({
    victimId: new OID(client.id), counselorId: new OID(counselor.id),
    topic: "sleep", mode: "TEXT", currency: "DZD", price: 2000, status: "COMPLETED",
    scheduledAt: new Date(Date.now() - 10 * 24 * 60 * MIN),
    createdAt: new Date(Date.now() - 11 * 24 * 60 * MIN),
  });
  const ch1 = (await req("GET", `/api/challenge?victim=1&userId=${client.id}`)).json;
  check("الجلسة في وقتها تُحتسب رغم طولها (streak=1)", ch1?.myStreak === 1, JSON.stringify(ch1).slice(0, 160));

  /* عكسي: جلسة أحدث دخولها قبل الموعد بـ30 دقيقة (خارج النافذة) — وهي الأحدث
     فتكسر السلسلة فوراً → streak=0 */
  await sessionsCol.insertOne({
    victimId: new OID(client.id), counselorId: new OID(counselor.id),
    topic: "anger", mode: "TEXT", currency: "DZD", price: 2000, status: "COMPLETED",
    scheduledAt: new Date(Date.now() - 20 * MIN),
    victimFirstSeenAt: new Date(Date.now() - 50 * MIN), /* قبل موعدها بـ30د */
    createdAt: new Date(Date.now() - 21 * MIN),
  });
  const ch2 = (await req("GET", `/api/challenge?victim=1&userId=${client.id}`)).json;
  check("دخول قبل الموعد بـ30د لا يُحتسب (streak=0)", ch2?.myStreak === 0, JSON.stringify(ch2).slice(0, 140));

  /* نبض الحضور يضبط firstSeen تلقائياً مرة واحدة */
  await sessionsCol.insertOne({
    victimId: new OID(client.id), counselorId: new OID(counselor.id),
    topic: "sadness", mode: "TEXT", currency: "DZD", price: 2000, status: "ACCEPTED",
    scheduledAt: new Date(Date.now() + 60 * MIN),
    createdAt: new Date(Date.now() - 1 * MIN),
  });
  const fresh = await sessionsCol.findOne({ topic: "sadness", victimId: new OID(client.id) });
  const hb1 = await req("POST", `/api/sessions/${fresh._id}/presence`, { role: "VICTIM" });
  const hb2 = await req("POST", `/api/sessions/${fresh._id}/presence`, { role: "VICTIM" });
  const after = await sessionsCol.findOne({ _id: fresh._id });
  check("النبض الأول يضبط firstSeen والثاني لا يغيّره", hb1.status === 200 && hb2.status === 200 && !!after.victimFirstSeenAt && Math.abs(new Date(after.victimFirstSeenAt).getTime() - new Date(after.victimLastSeenAt).getTime()) < 2000, JSON.stringify(after && { f: after.victimFirstSeenAt, l: after.victimLastSeenAt }));

  /* ═══ 5) تحكّم الأدمين بالتحديين (بند 8) ═══ */
  console.log("\n── 4) لوحة التحديين: تعطيل/تفعيل/مدة/إعادة تشغيل (بند 8) ──");
  const cfg0 = (await req("POST", "/api/admin", { action: "challenge-config-get" })).json;
  check("الإعدادات الافتراضية: كلا التحديين يعمل", cfg0.ok && cfg0.counselor?.running === true && cfg0.victim?.running === true, JSON.stringify(cfg0).slice(0, 160));

  const off = await req("POST", "/api/admin", { action: "challenge-config-set", which: "victim", enabled: false, durationDays: 0 });
  check("تعطيل تحدي العملاء → ok", off.status === 200 && off.json?.config?.running === false);
  const chOff = (await req("GET", `/api/challenge?victim=1&userId=${client.id}`)).json;
  check("العميل يرى active=false بعد التعطيل (النافذة تختفي)", chOff?.active === false, JSON.stringify(chOff).slice(0, 120));

  const on = await req("POST", "/api/admin", { action: "challenge-config-set", which: "victim", enabled: true, durationDays: 30 });
  check("تفعيل بمدة 30 يوماً → running=true + endsAt محسوب", on.json?.config?.running === true && !!on.json?.config?.endsAt);

  /* مدة صلاحية منتهية → التحدي متوقف تلقائياً */
  const dbCfg = mClient.db().collection("challenge_configs");
  await dbCfg.updateOne({ _id: "victim" }, { $set: { enabled: true, durationDays: 1, startedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } });
  const chExp = (await req("GET", `/api/challenge?victim=1&userId=${client.id}`)).json;
  check("انتهاء المدة يوقف التحدي تلقائياً (active=false)", chExp?.active === false, JSON.stringify(chExp).slice(0, 100));

  const rst = await req("POST", "/api/admin", { action: "challenge-reset", which: "victim" });
  check("إعادة التشغيل → تعمل مجدداً", rst.json?.config?.running === true);
  const chRst = (await req("GET", `/api/challenge?victim=1&userId=${client.id}`)).json;
  check("العميل يرى active=true بعد إعادة التشغيل", chRst?.active === true);

  /* تحدي المختصين: التعطيل يمنع العدّ */
  await req("POST", "/api/admin", { action: "challenge-config-set", which: "counselor", enabled: false, durationDays: 0 });
  const clickOff = await req("POST", "/api/challenge", { userId: counselor.id });
  check("ضغطة أخصائي بعد التعطيل → CHALLENGE_ENDED", clickOff.status === 400 && clickOff.json?.error === "CHALLENGE_ENDED", JSON.stringify(clickOff.json).slice(0, 100));
  const chCOff = (await req("GET", `/api/challenge?userId=${counselor.id}`)).json;
  check("أخصائي يرى active=false بعد التعطيل", chCOff?.active === false);
  await req("POST", "/api/admin", { action: "challenge-reset", which: "counselor" });
  const clickOn = await req("POST", "/api/challenge", { userId: counselor.id });
  check("ضغطة أخصائي بعد إعادة التشغيل → تُعدّ", clickOn.status === 200 && clickOn.json?.clicks >= 1, JSON.stringify(clickOn.json).slice(0, 120));

  /* ═══ 6) تغيير موعد العميل يقيد بفقرة الأخصائي (بند 13) ═══ */
  console.log("\n── 5) تغيير موعد العميل: حارس خادمي SLOT_UNAVAILABLE (بند 13) ──");
  /* فقرة أخصائي كاملة البنية: السبت فقط (weekday=6) على 10:00 — البقية فارغة */
  await req("POST", "/api/counselor", { action: "set-availability", userId: counselor.id, weeklyAvailability: { "0": [], "1": [], "2": [], "3": [], "4": [], "5": [], "6": ["10:00"] } });
  /* طلب معلّق على يوم غير السبت */
  const nd = new Date(Date.now() + 72 * 3600 * 1000);
  while (nd.getDay() === 6) nd.setTime(nd.getTime() + 24 * 3600 * 1000); /* نبتعد عن السبت */
  nd.setHours(14, 0, 0, 0);
  const p2 = await req("POST", "/api/sessions", { victimId: client.id, counselorId: counselor.id, topic: "anxiety", mode: "TEXT", scheduledAt: nd.toISOString(), currency: "DZD" });
  const sid2 = p2.json?.session?.id;
  const reschBad = await req("PATCH", `/api/sessions/${sid2}`, { rescheduleTo: new Date(nd.getTime() + 30 * 60 * 1000).toISOString(), rescheduledBy: "VICTIM" });
  check("عميل يختار موعداً خارج فقرة الأخصائي → SLOT_UNAVAILABLE", reschBad.status === 400 && reschBad.json?.error === "SLOT_UNAVAILABLE", JSON.stringify(reschBad.json).slice(0, 120));
  /* داخل الفقرة: السبت القادم 10:00 */
  const sat = new Date(nd); sat.setTime(nd.getTime() + ((6 - nd.getDay() + 7) % 7) * 24 * 3600 * 1000); sat.setHours(10, 0, 0, 0);
  if (sat.getTime() <= Date.now()) sat.setTime(sat.getTime() + 7 * 24 * 3600 * 1000);
  const reschOk = await req("PATCH", `/api/sessions/${sid2}`, { rescheduleTo: sat.toISOString(), rescheduledBy: "VICTIM" });
  check("عميل يختار ساعة من فقرة الأخصائي → نجاح", reschOk.status === 200 && reschOk.json?.ok === true, JSON.stringify(reschOk.json).slice(0, 120));

  /* ═══ 7) فحوصات الملفات ═══ */
  console.log("\n── 6) فحوصات الملفات (بنود 1-14) ──");
  const models = read("src/lib/models.ts");
  const serverjs = read("server.js");
  check("المخططان متطابقان: Message.seconds", models.includes("seconds: { type: Number") && serverjs.includes("seconds: { type: Number"));
  check("المخططان متطابقان: victimFirstSeenAt", models.includes("victimFirstSeenAt") && serverjs.includes("victimFirstSeenAt"));
  check("المخططان متطابقان: InAppNotification.vars", models.includes("vars: { type: Schema.Types.Mixed") && serverjs.includes("vars: { type: mongoose.Schema.Types.Mixed"));

  const voiceBubble = read("src/components/shared/voice-bubble.tsx");
  check("فقاعة الصوت: المدة من seconds لا من webm", voiceBubble.includes("seconds") && voiceBubble.includes("/audio"));
  const chatPanel = read("src/components/session/chat-panel.tsx");
  const dmDialog = read("src/components/shared/dm-dialog.tsx");
  const counselorsChat = read("src/components/shared/counselors-chat.tsx");
  check("لا مشغّل <audio> الأصلي في الدردشات الثلاث", !chatPanel.includes("<audio") && !dmDialog.includes("<audio") && !counselorsChat.includes("<audio"));
  check("الصوتية في فضاء المختصين: تسجيل + فقاعة + استقصاء full=1", counselorsChat.includes("VoiceRecorder") && counselorsChat.includes("VoiceBubble") && counselorsChat.includes("full=1"));

  const msgActions = read("src/components/shared/message-actions.tsx");
  check("الضغطة المستمرة = 3 ثوانٍ (LONG_PRESS_MS=3000)", msgActions.includes("LONG_PRESS_MS = 3000"));
  check("الضغطة الطويلة مركّبة في الدردشات الثلاث", chatPanel.includes("useLongPress") && dmDialog.includes("useLongPress") && counselorsChat.includes("useLongPress"));
  check("لا أزرار تحويم دائمة (كانت تشوّه الهاتف)", !chatPanel.includes("group-hover:opacity-100") && !dmDialog.includes("group-hover:opacity-100") && !counselorsChat.includes("group-hover:opacity-100"));

  const room = read("src/components/session/session-room.tsx");
  check("الغرفة: بلا قفص ارتفاع ثابت", !room.includes("h-[calc(100dvh-8.5rem)]") && room.includes("min-h-[280px]"));
  check("الغرفة: بطاقة الملخص تنمو الصفحة (بلا overflow داخلي)", !room.includes("lg:block min-h-0 overflow-y-auto"));
  check("بند 5: عبارة «شاركنا شعورك» محذوفة من الغرفة", !room.includes("endedDesc"));
  for (const lang of ["ar", "en", "fr", "tr", "ru", "zh"]) {
    if (read(`src/lib/i18n/${lang}.ts`).includes("endedDesc")) { failures++; console.log(`  ❌ endedDesc ما زال في ${lang}.ts`); }
  }
  check("بند 5: endedDesc محذوفة من القواميس الستة", true);

  const ratings = read("src/components/shared/ratings-dialog.tsx");
  check("بند 9: النسبة = نجمة×20% والشريط يطابقها", ratings.includes("(d.stars / 5) * 100"));

  const notifTexts = read("src/lib/notif-texts.ts");
  check("بند 12: وحدة نصوص الإشعارات بالغات الست", ["booked", "reminder", "challengeWon", "victimChallenge"].every((k) => notifTexts.includes(`"${k}"`)) && notifTexts.split("zh: {").length >= 22);
  const bell = read("src/components/shared/notifications-bell.tsx");
  check("بند 12: الجرس يعيد التوليد باللغة الحالية", bell.includes("notif-texts") && bell.includes("fill("));
  check("بند 12: تبديل اللغة يزامن الحساب", read("src/lib/i18n/index.tsx").includes("/api/user-language"));

  const notifApi = read("src/app/api/notifications/route.ts");
  check("بند 12: واجهة الإشعارات تعيد vars", notifApi.includes("vars:"));

  const quotes = JSON.parse(read("shared/uplift-quotes.json"));
  check("بند 10: 20+ عبارة جديدة بالأسلوب المطلوب (143 كلية)", quotes.length >= 140 && quotes.some((q) => q.ar.includes("لا تحمل همّك وحدك")));
  check("بند 10: الأدمين يدير العبارات (تبويب موجود)", read("src/components/views/admin.tsx").includes('TabsContent value="quotes"') && read("src/app/api/quotes/route.ts").includes("action === \"update\""));

  const admin = read("src/components/views/admin.tsx");
  check("بند 8: تبويب التحديات في لوحة الأدمين", admin.includes('value="challenges"') && admin.includes("challenge-config-set") && admin.includes("challenge-reset"));
  check("بند 8: الفوتر يطفئ العدّ بعد الفوز/التعطيل", read("src/components/shared/footer.tsx").includes("activeRef"));
  check("بند 8: بطاقة التحدي تختفي عند active=false", read("src/components/views/client-sessions.tsx").includes("challenge.active"));

  for (const lang of ["ar", "en", "fr", "tr", "ru", "zh"]) {
    const d = read(`src/lib/i18n/${lang}.ts`);
    const okKeys = ["groupChatHint", "rescheduleNoSlots", "challengesTab", "challengeResetBtn", "challengesNote"].every((k) => d.includes(k));
    if (!okKeys) { failures++; console.log(`  ❌ مفاتيح v1.6.0 ناقصة في ${lang}.ts`); }
  }
  check("بند 14: مفاتيح v1.6.0 بالغات الست", true);

  check("بند 13: واجهة العميل تعرض مواعيد الأخصائي فقط", read("src/components/views/client-sessions.tsx").includes("reschedAllowedSlots") && read("src/app/api/sessions/[id]/route.ts").includes("SLOT_UNAVAILABLE"));

  console.log("\n" + "═".repeat(56));
  if (failures === 0) console.log("🎉 كل فحوصات v1.6.0 خضراء");
  else { console.log(`⚠️  فشل ${failures} فحص`); process.exitCode = 1; }

  server.kill("SIGKILL");
  await mongod.stop();
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error("❌ انهار الاختبار:", e); process.exit(1); });
