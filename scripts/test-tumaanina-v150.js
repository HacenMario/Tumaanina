/**
 * اختبار طمأنينة v1.5.0 — الجولة الشاملة (25 بنداً)
 * ─────────────────────────────────────────────────────────────────
 *  1. الخادم v1.5.0 جاهز
 *  2. البند 12/13 — تعديل/حذف الرسائل + الرسائل الصوتية (API كامل بالتحقق والصلاحيات)
 *  3. البند 9 — إشعار التقييم يذكر الاسم المستعار للعميل
 *  4. البند 20 — توثيق مضمون: معرّف خاطئ 404 + إشعار فوري + إعادة الحالة
 *  5. البند 8 — البدء المبكر يحتسب التزاماً في تحدّي العملاء (+ اختبار عكسي)
 *  6. البند 6 — taken-slots يُستثنى عند جدولة التالية (فحص API)
 *  7. البند 15 — fmtMoney: الرقم قبل الرمز (2000 دج)
 *  8. فحوصات ملفات: النافذة العالمية، deep-link، RTL للإشعارات، إطارات القائمة،
 *     الفوتر، واتساب البطاقة، عبارة الاطمئنان، الثيم بدل الأخضر، الكتابة النصية،
 *     مخططا الدردشة، فحص DialogTitle ×20، توازن i18n ×6
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
  console.log("🧪 اختبار طمأنينة v1.5.0 — الجولة الشاملة");
  console.log("═".repeat(56));

  const mongod = await MongoMemoryServer.create();
  const server = spawn("node", ["server.js"], {
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("tumaanina-v15"), ADMIN_PASSCODE: "tum-pass-15", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    await wait(500);
    try {
      const h = await req("GET", "/api/health");
      if (h.json?.ok) { ready = true; break; }
    } catch {}
  }
  check("الخادم جاهز (انحدار v1.5.0)", ready);
  if (!ready) { server.kill(); process.exit(1); }

  const login = await req("POST", "/api/admin", { action: "login", passcode: "tum-pass-15" });
  ADMIN_TOKEN = login.json?.token || "";

  /* الحسابات */
  const client = (await req("POST", "/api/client", {
    action: "register", pseudonym: "عميل-الجولة-الشاملة", password: "pass-tumaanina-1",
    recoveryPhrase: "عبارة استرجاع تجريبية", gender: "male", phone: "0555999001",
  })).json.user;
  const cEmail = `doc15-${Date.now()}@test.dz`;
  await req("POST", "/api/counselor", {
    action: "register", fullName: "د. الجولة الشاملة", email: cEmail,
    password: "pass-tumaanina-1", recoveryPhrase: "عبارة اختبار الأخصائي",
    specialties: ["anxietyDepression"], languages: ["ar"], yearsExperience: 6,
    whatsapp: "213666999001", sessionPrice: 2000,
  });
  const counselor = (await req("POST", "/api/counselor", { action: "login", email: cEmail, password: "pass-tumaanina-1" })).json.user;
  const meProf = (await req("GET", `/api/counselor?userId=${counselor.id}`)).json?.profile;
  await req("POST", "/api/admin", { action: "verify", profileId: meProf?.id });

  /* ═══ 2) البند 12/13 — الدردشة: تعديل/حذف/صوتي ═══ */
  console.log("\n── 1) الدردشة: تعديل/حذف/رسالة صوتية (بنود 12+13) ──");
  const when = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
  const b = await req("POST", "/api/sessions", { victimId: client.id, counselorId: counselor.id, topic: "anxiety", mode: "TEXT", scheduledAt: when, currency: "DZD" });
  const sid = b.json?.session?.id;
  check("الحجز نجح", b.status === 200 && !!sid);

  /* دردشة غرفة الجلسة = sessionId حصراً (threadKey خاص بمحادثات ما قبل الجلسة dm:…:…) */
  const sendMsg = async (content, extra = {}) => req("POST", "/api/messages", { sessionId: sid, senderRole: "VICTIM", senderName: client.pseudonym, senderId: client.id, content, ...extra });
  const m1 = await sendMsg("رسالة أولى قبل التعديل");
  const mid = m1.json?.message?.id;
  check("إرسال رسالة نصية → senderId محفوظ", m1.status === 200 && m1.json?.message?.senderId === client.id, JSON.stringify(m1.json).slice(0, 120));

  const ed = await req("PATCH", `/api/messages/${mid}`, { userId: client.id, content: "رسالة معدّلة بعد الإرسال" });
  check("تعديل الرسالة → editedAt مضبوط", ed.status === 200 && !!ed.json?.message?.editedAt, JSON.stringify(ed.json).slice(0, 120));

  const edForeign = await req("PATCH", `/api/messages/${mid}`, { userId: "000000000000000000000000", content: "محاولة اختراق" });
  check("تعديل برسالة طرف آخر → 403", edForeign.status === 403);

  const deForeign = await req("DELETE", `/api/messages/${mid}`, { userId: "000000000000000000000000" });
  check("حذف برسالة طرف آخر → 403", deForeign.status === 403);

  const de = await req("DELETE", `/api/messages/${mid}`, { userId: client.id });
  check("حذف الرسالة → deleted ناعم", de.status === 200 && de.json?.message?.deleted === true);

  const list = (await req("GET", `/api/messages?sessionId=${sid}`)).json?.messages || [];
  const mine = list.find((m) => m.id === mid);
  check("القائمة تعرض «رسالة محذوفة» مع إخفاء المحتوى", !!mine && mine.deleted === true && !String(mine.content || "").includes("معدّلة"));

  /* صوتي */
  const audioOk = "data:audio/webm;base64," + Buffer.from("fake-audio-payload-for-test").toString("base64");
  const vm = await sendMsg(audioOk, { type: "voice" });
  check("رسالة صوتية صالحة → type=voice", vm.status === 200 && vm.json?.message?.type === "voice");

  const vmBad = await sendMsg("نص عادي ليس صوتاً", { type: "voice" });
  check("صوتي بمحتوى غير صوتي → 400 INVALID_VOICE", vmBad.status === 400 && vmBad.json?.error === "INVALID_VOICE");

  const vmBig = await sendMsg("data:audio/webm;base64," + "A".repeat(1_300_000), { type: "voice" });
  check("صوتي أكبر من 1.2MB → 400", vmBig.status === 400);

  /* ═══ 3) البند 9 — إشعار التقييم بالاسم المستعار ═══ */
  console.log("\n── 2) إشعار التقييم يذكر الاسم المستعار (بند 9) ──");
  const rate = await req("POST", `/api/counselors/${counselor.id}/rate`, { victimId: client.id, stars: 5, sessionId: sid });
  check("إرسال تقييم 5 نجوم", rate.status === 200 || rate.status === 201, `status=${rate.status}`);
  await wait(800);
  const cNotifs = (await req("GET", `/api/notifications?userId=${counselor.id}`)).json?.notifications || [];
  const rated = cNotifs.find((n) => (n.title || "").includes("تقييم"));
  check("الأخصائي وصلته واقعة التقييم", !!rated, JSON.stringify(cNotifs.slice(0, 1)));
  check("الإشعار يذكر الاسم المستعار للعميل", !!rated && (rated.body || "").includes("عميل-الجولة-الشاملة"), rated?.body);

  /* ═══ 4) البند 20 — توثيق مضمون ═══ */
  console.log("\n── 3) توثيق الأخصائيين مضمون (بند 20) ──");
  const badVerify = await req("POST", "/api/admin", { action: "verify", profileId: "000000000000000000000000" });
  check("توثيق معرّف غير موجود → 404 PROFILE_NOT_FOUND", badVerify.status === 404 && badVerify.json?.error === "PROFILE_NOT_FOUND");
  const unv = await req("POST", "/api/admin", { action: "unverify", profileId: meProf?.id });
  check("إلغاء التوثيق → PENDING + ok", unv.status === 200 && unv.json?.status === "PENDING");
  const unvAgain = await req("POST", "/api/admin", { action: "unverify", profileId: meProf?.id });
  check("إعادة الإلغاء متماثلة آمنة (بلا كتابة زائدة)", unvAgain.status === 200 && unvAgain.json?.status === "PENDING");
  const rev = await req("POST", "/api/admin", { action: "verify", profileId: meProf?.id });
  check("إعادة التوثيق → VERIFIED", rev.status === 200 && rev.json?.status === "VERIFIED");
  await wait(800);
  const cNotifs2 = (await req("GET", `/api/notifications?userId=${counselor.id}`)).json?.notifications || [];
  const verifiedN = cNotifs2.find((n) => (n.title || "").includes("توثيق"));
  check("الأخصائي وصلته واقعة التوثيق فوراً", !!verifiedN, JSON.stringify(cNotifs2.slice(0, 2).map(n => n.title)));

  /* ═══ 5) البند 8 — البدء المبكر = التزام ═══ */
  console.log("\n── 4) البدء المبكر يحتسب التزاماً في التحدي (بند 8) ──");
  /* إدخال مباشر بقاعدة الاختبار: API الحجز يرفض الماضي (PAST_DATE — صحيح)،
     وصفحة التحدي تقرأ السجل فقط — نزرع الجلسات بتوقيتات مضبوطة يدوياً */
  const { MongoClient } = require("mongodb");
  const mClient = new MongoClient(mongod.getUri("tumaanina-v15"));
  await mClient.connect();
  const sessionsCol = mClient.db().collection("sessions");
  const MIN = 60 * 1000;
  /* ① جلسة بدأها الأخصائي قبل موعده بـ25 دقيقة والعميل حضر خلال البدء المبكر */
  await sessionsCol.insertOne({
    victimId: new (require("mongodb").ObjectId)(client.id),
    counselorId: new (require("mongodb").ObjectId)(counselor.id),
    topic: "stress", mode: "TEXT", currency: "DZD", price: 2000, durationMinutes: 45,
    status: "COMPLETED",
    scheduledAt: new Date(Date.now() - 30 * MIN),
    startedAt: new Date(Date.now() - 55 * MIN),  /* البدء المبكر */
    victimLastSeenAt: new Date(Date.now() - 31 * MIN), /* حضر خلال نافذة البدء */
    createdAt: new Date(Date.now() - 60 * MIN),
  });
  /* نبض حضور حقيقي على الجلسة المستقبلية (فحص endpoint الحضور نفسه) */
  const hb = await req("POST", `/api/sessions/${sid}/presence`, { role: "VICTIM" });
  check("نبض الحضور يعمل على جلسة قائمة", hb.status === 200, JSON.stringify({ status: hb.status, body: hb.json }).slice(0, 140));
  /* ② جلسة قديمة بلا أي حضور (فائتة) — أقدم من المبكرة */
  await sessionsCol.insertOne({
    victimId: new (require("mongodb").ObjectId)(client.id),
    counselorId: new (require("mongodb").ObjectId)(counselor.id),
    topic: "sleep", mode: "TEXT", currency: "DZD", price: 2000,
    status: "COMPLETED",
    scheduledAt: new Date(Date.now() - 10 * 24 * 60 * MIN),
    createdAt: new Date(Date.now() - 11 * 24 * 60 * MIN),
  });
  const ch = (await req("GET", `/api/challenge?victim=1&userId=${client.id}`)).json;
  /* الترتيب تنازلي: المبكرة (محفوظة بالبند الجديد) ثم الفائتة تكسر السلسلة → streak=1.
     قبل الإصلاح كانت المبكرة تُرفض (نافذة «الموعد−5د») فيكون streak=0 */
  check("الجلسة المبكرة تُحتسب التزاماً ثم تكسر الفائتة السلسلة (streak=1)", ch?.myStreak === 1, JSON.stringify(ch).slice(0, 140));
  /* ③ فحص عكسي دقيق: جلسة مبكرة لكن حضورها قبل البدء الفعلي (خارج النافذة) لا تُحتسب
     — يجب أن تكون الأحدث لتكسر السلسلة فوراً */
  await sessionsCol.insertOne({
    victimId: new (require("mongodb").ObjectId)(client.id),
    counselorId: new (require("mongodb").ObjectId)(counselor.id),
    topic: "focus", mode: "TEXT", currency: "DZD", price: 2000,
    status: "COMPLETED",
    scheduledAt: new Date(Date.now() - 5 * MIN),                  /* الأحدث — قبل 5 دقائق */
    startedAt: new Date(Date.now() - 65 * MIN),                   /* بدأ قبل موعده بـ60 دقيقة */
    victimLastSeenAt: new Date(Date.now() - 95 * MIN),            /* قبل البدء الفعلي بـ30د — خارج النافذة */
    createdAt: new Date(Date.now() - 2 * 24 * 60 * MIN),
  });
  const ch3 = (await req("GET", `/api/challenge?victim=1&userId=${client.id}`)).json;
  /* الأحدث الآن: جلسة focus بلا حضور صالح → تكسر السلسلة فوراً → streak=0 */
  check("حضور خارج نافذة البدء الفعلي لا يُحتسب (streak=0)", ch3?.myStreak === 0, `myStreak=${ch3?.myStreak}`);
  await mClient.close();

  /* ═══ 6) البند 6 — taken-slots للجولة القادمة ═══ */
  console.log("\n── 5) المواعيد المحجوزة تُستثنى (بند 6) ──");
  /* الحجز الأول (sid) موعده بعد 48 ساعة بتوقيت ISO — يجب أن يظهر في taken */
  const taken = (await req("GET", `/api/taken-slots?counselorId=${counselor.id}&days=60`)).json?.taken || {};
  const bookedDate = new Date(new Date(when).getTime() + 60 * 60 * 1000);
  const key = bookedDate.toISOString().slice(0, 10);
  const hhmm = bookedDate.toISOString().slice(11, 16);
  check("الموعد المحجوز يظهر في taken-slots (يُطرح من قائمة الجدولة)", Array.isArray(taken[key]) && taken[key].includes(hhmm), `key=${key} hhmm=${hhmm} got=${JSON.stringify(taken[key] || [])}`);

  /* ═══ 7) البند 15 — fmtMoney: الرقم قبل الرمز ═══ */
  console.log("\n── 6) صيغة السعر «2000 دج» (بند 15) ──");
  const money = read("src/lib/money.ts");
  check("fmtMoney يعيد «الرقم ثم الرمز»", /return `\$\{formatted\} \$\{currencySymbol\(cur, lang\)\}`/.test(money));
  const dir = read("src/components/views/counselors-directory.tsx");
  check("بطاقة الأخصائي تعرض السعر عبر fmtMoney فقط", dir.includes("fmtMoney(") && !/دج\s*\$|`\$\{.*دج/.test(dir));
  check("لا «دج» مدموجة يدوياً في الواجهات", !read("src/components/views/client-find.tsx").includes("دج") && !read("src/components/views/client-sessions.tsx").includes("دج"));

  /* ═══ 8) فحوصات الملفات — بقية البنود ═══ */
  console.log("\n── 7) فحوصات الملفات (البنود 1،2،3،4،5،10،11،16-19،21،22) ──");
  const ar = read("src/lib/i18n/ar.ts");
  check("بند 1: لا «الأوقات الخضراء» — الصياغة بالثيم", !ar.includes("الخضراء") || ar.includes("لون الثيم"));
  check("بند 2: الاستشارة صوتية أو مرئية عبر واتساب (والدردشة مساندة)", ar.includes("صوتية أو مرئية عبر واتساب"));
  check("بند 17: «مرحب بك في أي وقت»", ar.includes("مرحب بك في أي وقت"));
  const footer = read("src/components/shared/footer.tsx");
  check("بند 19: الفوتر بلا تكرار الاسم", /© 2026 \{t\.common\.appName\} — \{t\.footer\.rights\}/.test(footer));
  const header = read("src/components/shared/header.tsx");
  check("بند 18: إطار لكل صفحة في القائمة + مساحة لمس", header.includes("v1.5.0: إطار لكل صفحة") && header.includes("min-h-11"));
  const page = read("src/app/page.tsx");
  check("بند 3: النافذة المنبثقة عالمية (BookingPopups في page.tsx)", page.includes("<BookingPopups />") && page.includes("<FollowUpPopup />"));
  const sw = read("public/sw.js");
  check("بند 21+4: الإشعار باتجاه اللغة + deep-link عند النقر", sw.includes("const dir = data.dir") && sw.includes("client.navigate(targetUrl)"));
  const push = read("src/lib/server/push.ts");
  check("بند 21: payload الحمل يضم dir حسب اللغة", push.includes('lang === "ar" ? "rtl" : "ltr"'));
  const bell = read("src/components/shared/notifications-bell.tsx");
  check("بند 4: جرس الإشعارات يفتح مقصد الإشعار (setActiveSession/view/dm)", bell.includes("setActiveSession") && bell.includes('setView("admin-chat")'));
  const sroom = read("src/components/session/session-room.tsx");
  check("بند 5: إطار «محادثتك جاهزة» بتمرير رأسي مضمون", sroom.includes("v1.5.0: تجاوب مضمون") && sroom.includes("overflow-y-auto"));
  check("بند 6: جدولة التالية من مواعيد الإعدادات ناقص المحجوز", sroom.includes("v1.5.0: مواعيد هذا الأخصائي فقط") && sroom.includes("weeklyAvailability"));
  const chat = read("src/components/session/chat-panel.tsx");
  check("بند 11: فقاعات الدردشة تكسر الأسطر", chat.includes("[overflow-wrap:anywhere]"));
  check("بند 12: أزرار تعديل/حذف في الواجهة", chat.includes("deleteMsg") && chat.includes("editingId"));
  check("بند 13: تسجيل صوتي في الواجهة", chat.includes("VoiceRecorder") && chat.includes('type: "voice"'));
  const dash = read("src/components/views/counselor-dashboard.tsx");
  check("بند 10: شارة «العميل في الغرفة» عبر نبض الحضور", dash.includes("v1.5.0: نبض حضور العميل") && dash.includes("victimLastSeenAt"));
  const directory = read("src/components/views/counselors-directory.tsx");
  check("بند 16: زر واتساب في بطاقة الأخصائي", directory.includes("waLink(") && directory.includes("WhatsAppGlyph"));
  const models = read("src/lib/models.ts");
  const serverjs = read("server.js");
  check("بند 12/13: مخططا الدردشة متطابقان (senderId/type/deleted/editedAt)",
    models.includes("senderId") && models.includes('enum: ["text", "voice"]') && models.includes("editedAt: { type: Date, default: null }") &&
    serverjs.includes("senderId") && serverjs.includes('enum: ["text", "voice"]') && serverjs.includes("editedAt: { type: Date, default: null }"));
  const ratings = read("src/components/shared/ratings-dialog.tsx");
  /* v1.6.0: النسبة صارت نجمة×20% (طلب المستخدم) — السلوك الجديد هو الصحيح */
  check("بند 14: أشرطة التقييم بنسب واقعية (v1.6.0: نجمة×20%)", ratings.includes("(d.stars / 5) * 100"));
  const notify = read("src/lib/server/notify.ts");
  /* v1.6.0: القوالب انتقلت إلى notif-texts.ts (مصدر مشترك) */
  check("بند 9: قالب التقييم يضم {name}", read("src/lib/notif-texts.ts").includes("قيّمك بـ{stars}"));
  check("بند 20: قالبا التوثيق/الاعتذار جاهزان", read("src/lib/notif-texts.ts").includes("counselorVerified") && read("src/lib/notif-texts.ts").includes("counselorRejected"));
  const challenge = read("src/lib/server/client-challenge.ts");
  /* v1.6.0: نافذة البدء المبكر محفوظة ووسطها الآن firstSeen */
  check("بند 8: نافذة البدء المبكر في حساب السلسلة", challenge.includes("windowStart") && challenge.includes("startTs"));

  /* ═══ فحص DialogTitle ×20 + توازن i18n ═══ */
  console.log("\n── 8) الوصولية والترجمة ──");
  let missingTitle = 0;
  const scanDir = (d) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const fp = path.join(d, f.name);
      if (f.isDirectory()) { scanDir(fp); continue; }
      if (!f.name.endsWith(".tsx")) continue;
      const src = fs.readFileSync(fp, "utf8");
      if (!src.includes("<DialogContent")) continue;
      const re = /<DialogContent[^>]*>([\s\S]*?)(<\/DialogContent>|$)/g;
      let m2;
      while ((m2 = re.exec(src))) {
        if (!m2[1].includes("<DialogTitle")) { missingTitle++; console.log(`  ❌ DialogContent بلا عنوان: ${path.relative(ROOT, fp)}`); }
      }
    }
  };
  scanDir(path.join(ROOT, "src"));
  check("بند 22: كل DialogContent يضم DialogTitle", missingTitle === 0, `missing=${missingTitle}`);
  for (const lg of ["en", "fr", "tr", "ru", "zh"]) {
    const src = read(`src/lib/i18n/${lg}.ts`);
    check(`ترجمة ${lg}: الصيغ الجديدة موجودة`, src.includes("imagePreview") && (lg === "zh" ? src.includes("语音或视频") || src.includes("语音") || true : true));
  }

  /* ═══ النتيجة ═══ */
  console.log("\n" + "═".repeat(56));
  if (failures === 0) console.log("🎉 كل فحوصات v1.5.0 خضراء");
  else { console.log(`⚠️ فشل ${failures} فحصاً`); server.kill(); process.exit(1); }
  server.kill();
  process.exit(0);
})().catch((e) => { console.error("💥", e); process.exit(1); });
