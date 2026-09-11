#!/usr/bin/env node
/**
 * اختبار دخان شامل — النسخة v2.1 (حسابات + كلمات مرور + متابعة العلاج):
 * 1) MongoDB مؤقت في الذاكرة
 * 2) زرع أخصائي موثّق (اختبار فقط — لا يُحفظ)
 * 3) تشغيل الخادم الموحّد بوضع الإنتاج
 * 4) REST: صحة/إدارة/حسابات/متابعة + صلاحيات الأدمين (حذف/كلمة مرور/إنشاء) + الملاحظات + الإشعارات الداخلية
 * 5) E2E محادثة فورية عبر test-socket.js
 */
const { spawn } = require("child_process");
const mongoose = require("mongoose");

const PORT = 3199;
const BASE = `http://127.0.0.1:${PORT}`;
let fails = 0;
const ok = (name, cond) => {
  console.log((cond ? "✅" : "❌") + " " + name);
  if (!cond) fails++;
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (path, body) => {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { _raw: text.slice(0, 300) };
  }
  return { status: r.status, data };
};

const patch = async (path, body) => {
  const r = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { _raw: text.slice(0, 300) };
  }
  return { status: r.status, data };
};

/* صورة PNG صغيرة 1x1 base64 (بديل حقيقي لملف شهادة) */
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function main() {
  /* 1) MongoDB مؤقت */
  const { MongoMemoryServer } = require("mongodb-memory-server");
  console.log("⏳ تشغيل MongoDB مؤقت في الذاكرة...");
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri("rafiqi-nafsi");

  /* 2) زرع أخصائي موثّق بكلمة مرور (في الذاكرة فقط) */
  const conn = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 10000 }).asPromise();
  const { randomBytes, scryptSync } = require("crypto");
  const hash = (s) => {
    const salt = randomBytes(16).toString("hex");
    return { hash: scryptSync(s, salt, 64).toString("hex"), salt };
  };
  const UserSchema = new mongoose.Schema(
    {
      pseudonym: String,
      role: String,
      language: { type: String, default: "ar" },
      email: { type: String, sparse: true, unique: true },
      passwordHash: String,
      passwordSalt: String,
      recoveryHash: String,
      recoverySalt: String,
    },
    { timestamps: true, collection: "users" }
  );
  const ProfileSchema = new mongoose.Schema(
    {
      userId: mongoose.Schema.Types.ObjectId,
      fullName: String,
      specialties: [String],
      languages: [String],
      whatsapp: String,
      yearsExperience: { type: Number, default: 0 },
      diplomaImage: String,
      verificationStatus: { type: String, default: "PENDING" },
      available: { type: Boolean, default: true },
      rating: { type: Number, default: 5 },
      sessionsCount: { type: Number, default: 0 },
    },
    { timestamps: true, collection: "counselors" }
  );
  const U = conn.model("User", UserSchema);
  const P = conn.model("CounselorProfile", ProfileSchema);
  const pw = hash("counselor-pass-1");
  const rec = hash("عبارة الأخصائي الاسترجاعية");
  const u = await U.create({
    role: "COUNSELOR",
    pseudonym: "د. تجربة",
    email: "test@local",
    passwordHash: pw.hash,
    passwordSalt: pw.salt,
    recoveryHash: rec.hash,
    recoverySalt: rec.salt,
  });
  await P.create({
    userId: u._id,
    fullName: "د. تجربة",
    specialties: ["trauma", "grief"],
    languages: ["ar", "fr"],
    whatsapp: "213555000111",
    diplomaImage: TINY_PNG,
    verificationStatus: "VERIFIED",
  });
  await conn.close();
  console.log("🌱 أخصائي اختبار مزروع (موثّق)");

  /* 3) الخادم */
  const server = spawn("node", ["server.js", "--prod"], {
    cwd: process.cwd(),
    env: { ...process.env, MONGODB_URI: uri, ADMIN_PASSCODE: "test-pass-123", PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  server.stdout.on("data", (d) => (serverLog += d.toString()));
  server.stderr.on("data", (d) => (serverLog += d.toString()));

  try {
    let up = false;
    for (let i = 0; i < 60; i++) {
      await wait(1000);
      try {
        const r = await fetch(`${BASE}/api`);
        if (r.ok) { up = true; break; }
      } catch {}
    }
    if (!up) {
      console.error("❌ الخادم لم يقلع. السجل:\n" + serverLog.slice(-3000));
      process.exit(1);
    }
    console.log("🟢 الخادم يعمل على " + BASE);

    /* 4) فحوصات REST */
    const health = await (await fetch(`${BASE}/api`)).json();
    ok("فحص الصحة /api", health.ok === true && health.db === "connected");

    const badAdmin = await post("/api/admin", { action: "login", passcode: "wrong" });
    ok("إدارة: كلمة مرور خاطئة → 401", badAdmin.status === 401);
    const goodAdmin = await post("/api/admin", { action: "login", passcode: "test-pass-123" });
    ok("إدارة: دخول ناجح", goodAdmin.data.ok === true);

    /* ── حسابات المتضررين ── */
    const stamp = Date.now();
    const vName = "متضرر-اختبار-" + stamp;
    const vReg = await post("/api/victim", { action: "register", pseudonym: vName, password: "victim-pass-1", recoveryPhrase: "مدينتي وطفولتي" });
    await post("/api/admin", { action: "verify-victim", victimId: vReg.data.user?.id, approve: true }); /* v2.11.0: التوثيق الفوري لاختبارات الحجز */
    ok("متضرر: تسجيل حساب جديد", vReg.data.ok === true && !!vReg.data.user?.id);

    const vDup = await post("/api/victim", { action: "register", pseudonym: vName, password: "victim-pass-1", recoveryPhrase: "مدينتي وطفولتي" });
    ok("متضرر: تكرار الاسم المستعار → 409", vDup.status === 409);

    const vLogin = await post("/api/victim", { action: "login", pseudonym: vName.toLowerCase(), password: "victim-pass-1" });
    ok("متضرر: دخول (بدون حساسية لحالة الأحرف)", vLogin.data.ok === true);

    const vBad = await post("/api/victim", { action: "login", pseudonym: vName, password: "wrong-pass" });
    ok("متضرر: كلمة مرور خاطئة → 401", vBad.status === 401);

    const vForgotBad = await post("/api/victim", { action: "forgot", pseudonym: vName, recoveryPhrase: "عبارة خاطئة تماماً", newPassword: "new-pass-1234" });
    ok("متضرر: نسيان بعبارة خاطئة → 401", vForgotBad.status === 401);

    const vForgot = await post("/api/victim", { action: "forgot", pseudonym: vName, recoveryPhrase: "مدينتي وطفولتي", newPassword: "new-pass-1234" });
    ok("متضرر: نسيان بعبارة صحيحة → تغيير", vForgot.data.ok === true);

    const vRelogin = await post("/api/victim", { action: "login", pseudonym: vName, password: "new-pass-1234" });
    ok("متضرر: دخول بالكلمة الجديدة", vRelogin.data.ok === true);

    /* ── حسابات الأخصائيين ── */
    const cEmail = `reg${stamp}@t.tt`;
    const cReg = await post("/api/counselor", {
      action: "register", fullName: "د. تسجيل", email: cEmail, password: "counselor-pass-1",
      recoveryPhrase: "جملتي السرية الخاصة", whatsapp: "+213 555 99 88 77",
      specialties: ["children"], languages: ["ar"], yearsExperience: 3, diplomaImage: TINY_PNG,
    });
    ok("أخصائي: تسجيل بكلمة مرور + صورة شهادة", cReg.data.ok === true);

    const cBadWa = await post("/api/counselor", {
      action: "register", fullName: "X", email: `x${stamp}@t.tt`, password: "counselor-pass-1",
      recoveryPhrase: "جملة صحيحة طويلة", whatsapp: "123", specialties: ["trauma"], languages: ["ar"], diplomaImage: TINY_PNG,
    });
    ok("أخصائي: واتساب غير صالح → 400", cBadWa.status === 400);

    const cLogin = await post("/api/counselor", { action: "login", email: cEmail, password: "counselor-pass-1" });
    ok("أخصائي: دخول بكلمة المرور", cLogin.data.ok === true);

    const cOld = await post("/api/counselor", { action: "login", email: "test@local", password: "counselor-pass-1" });
    ok("أخصائي مزروع: دخول", cOld.data.ok === true);
    const cUid = cOld.data.user?.id;

    const cChange = await post("/api/counselor", { action: "change-password", userId: cUid, oldPassword: "counselor-pass-1", newPassword: "brand-new-pass-9" });
    ok("أخصائي: تغيير كلمة المرور", cChange.data.ok === true);

    const cRelogin = await post("/api/counselor", { action: "login", email: "test@local", password: "brand-new-pass-9" });
    ok("أخصائي: دخول بالكلمة الجديدة", cRelogin.data.ok === true);

    const cForgot = await post("/api/counselor", { action: "forgot", email: "test@local", recoveryPhrase: "عبارة الأخصائي الاسترجاعية", newPassword: "recovered-pass-7" });
    ok("أخصائي: نسيان + استرجاع", cForgot.data.ok === true);

    /* ── الجلسة التالية / إنهاء العلاج ── */
    const list = await (await fetch(`${BASE}/api/counselors`)).json();
    const seeded = (list.counselors || []).find((c) => c.fullName === "د. تجربة");
    ok("الأخصائيون: الموثّق يظهر مع واتساب", !!seeded && seeded.whatsapp === "213555000111");

    const victimId = vReg.data.user.id;
    const sRes = await post("/api/sessions", { victimId, counselorId: seeded.userId, topic: "anxiety", mode: "TEXT" });
    ok("حجز جلسة", sRes.data.ok === true && !!sRes.data.session?.id);
    const sid = sRes.data.session.id;

    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString();
    const fu = await patch(`/api/sessions/${sid}`, { followUpAt: nextWeek });
    const fuData = fu.data;
    if (!fuData.session?.followUpAt) console.log("   DEBUG followUp:", fu.status, JSON.stringify(fuData).slice(0, 400));
    ok("الأخصائي: جدولة الجلسة التالية", fuData.ok === true && !!fuData.session?.followUpAt && fuData.session?.status === "COMPLETED");

    /* v2.9.0+: جلسة-واحدة-يومياً صارمة — الجلسة الثانية في يوم آخر */
    const d3 = new Date(Date.now() + 3 * 86400000);
    const ymd3 = `${d3.getFullYear()}-${String(d3.getMonth() + 1).padStart(2, "0")}-${String(d3.getDate()).padStart(2, "0")}`;
    const s2 = await post("/api/sessions", { victimId, counselorId: seeded.userId, topic: "grief", mode: "VOICE", scheduledAt: new Date(`${ymd3}T10:00:00.000Z`).toISOString(), date: ymd3, slot: "10:00" });
    const te = await patch(`/api/sessions/${s2.data.session.id}`, { treatmentEnded: true });
    const teData = te.data;
    if (!teData.session?.treatmentEnded) console.log("   DEBUG treatmentEnded:", te.status, JSON.stringify(teData).slice(0, 400));
    ok("الأخصائي: إنهاء العلاج نهائياً", teData.ok === true && teData.session?.treatmentEnded === true);

    const vSessions = await (await fetch(`${BASE}/api/sessions?userId=${victimId}&role=VICTIM`)).json();
    /* 3 جلسات: الأصلية + جلسة المتابعة المنشأة تلقائياً (v2.5.1) + جلسة إنهاء العلاج */
    const autoFollowUp = (vSessions.sessions || []).some((s) => s.source === "FOLLOW_UP" && s.status === "ACCEPTED");
    ok("المتضرر: سجل جلساته (3) مع متابعة تلقائية", (vSessions.sessions || []).length === 3 && autoFollowUp);

    const stats = await (await fetch(`${BASE}/api/stats`)).json();
    ok("إحصائيات /api/stats", typeof stats.counselors === "number" && stats.counselors >= 1);

    /* ── تصحيح صيغة الهاتف المحلي ── */
    const cLocal = await post("/api/counselor", {
      action: "register", fullName: "د. محلي", email: `local${stamp}@t.tt`, password: "counselor-pass-1",
      recoveryPhrase: "جملة محلية طويلة", whatsapp: "0551234567",
      specialties: ["trauma"], languages: ["ar"], yearsExperience: 1, diplomaImage: TINY_PNG,
    });
    ok("أخصائي: رقم محلي 0551234567 مقبول", cLocal.data.ok === true);
    const luLocal = await post("/api/admin", { action: "list-users", role: "COUNSELOR", q: `local${stamp}@t.tt` });
    ok("أخصائي: الرقم المحلي خُزّن دولياً 213551234567", luLocal.data.users?.[0]?.whatsapp === "213551234567");

    /* ── تعديل معلومات المتضرر + تغيير كلمة المرور من الإعدادات ── */
    const vProf = await post("/api/victim", { action: "update-profile", userId: victimId, wilaya: "alger", ageGroup: "age18_30", language: "fr" });
    ok("متضرر: تحديث المعلومات (الولاية/اللغة)", vProf.data.ok === true && vProf.data.user?.wilaya === "alger" && vProf.data.user?.language === "fr");

    const vPw = await post("/api/victim", { action: "change-password", userId: victimId, oldPassword: "new-pass-1234", newPassword: "changed-pass-9" });
    ok("متضرر: تغيير كلمة المرور من الإعدادات", vPw.data.ok === true);
    const vPwLogin = await post("/api/victim", { action: "login", pseudonym: vName, password: "changed-pass-9" });
    ok("متضرر: دخول بالكلمة المتغيرة", vPwLogin.data.ok === true);

    const vPwWrong = await post("/api/victim", { action: "change-password", userId: victimId, oldPassword: "خطأ تماماً", newPassword: "another-pass-9" });
    ok("متضرر: كلمة حالية خاطئة → 401", vPwWrong.status === 401);

    /* ── الملاحظات والبلاغات ── */
    const fbEmpty = await post("/api/feedback", { type: "suggestion", subject: "س", message: "" });
    ok("ملاحظات: رسالة فارغة → 400", fbEmpty.status === 400);

    const fb1 = await post("/api/feedback", { type: "suggestion", subject: "اقتراح", message: "أضيفوا اللغة الأمازيغية" });
    const fb2 = await post("/api/feedback", { type: "bug", subject: "خطأ", message: "الزر لا يعمل على سفاري" });
    ok("ملاحظات: إرسال اقتراح + بلاغ", fb1.data.ok === true && fb2.data.ok === true);

    const fbList = await post("/api/admin", { action: "feedback-list" });
    ok("ملاحظات: الإدارة تراها (2)", (fbList.data.feedbacks || []).length === 2);

    const fbDel = await post("/api/admin", { action: "feedback-delete", feedbackId: fbList.data.feedbacks[0].id });
    const fbList2 = await post("/api/admin", { action: "feedback-list" });
    ok("ملاحظات: حذف بالأسفل يبقى واحد", fbDel.data.ok === true && fbList2.data.feedbacks.length === 1);

    /* ── الإشعارات الداخلية (جرس الموقع) ── */
    /* قبول الجلسة → إشعار accepted للمتضرر */
    await patch(`/api/sessions/${sid}`, { status: "ACCEPTED" });
    await wait(300);

    const notif1 = await (await fetch(`${BASE}/api/notifications?userId=${victimId}`)).json();
    ok("إشعارات: قُبلت الجلسة → إشعار داخلي", (notif1.notifications || []).length >= 1 && notif1.unread >= 1);

    const notifMark = await post("/api/notifications", { action: "read", userId: victimId });
    const notif2 = await (await fetch(`${BASE}/api/notifications?userId=${victimId}`)).json();
    ok("إشعارات: تعيين الكل كمقروء", notifMark.data.ok === true && notif2.unread === 0);

    const notifClear = await post("/api/notifications", { action: "clear", userId: victimId });
    const notif3 = await (await fetch(`${BASE}/api/notifications?userId=${victimId}`)).json();
    ok("إشعارات: مسح الكل", notifClear.data.ok === true && notif3.notifications.length === 0);

    /* بدء الجلسة → إشعار "started" للمتضرر فقط (احترام role — لا تسريب للأخصائي) */
    await patch(`/api/sessions/${sid}`, { status: "ACTIVE" });
    await wait(300);
    const startedVictim = await (await fetch(`${BASE}/api/notifications?userId=${victimId}`)).json();
    const startedCounselor = await (await fetch(`${BASE}/api/notifications?userId=${seeded.userId}`)).json();
    const vStarted = (startedVictim.notifications || []).some((n) => n.key === "started");
    const cLeak = (startedCounselor.notifications || []).some((n) => n.key === "started" || n.key === "accepted");
    ok("إشعارات: بدء الجلسة يصل للمتضرر فقط", vStarted && !cLeak);
    await post("/api/notifications", { action: "clear", userId: victimId });

    /* ── صلاحيات الإدارة الكاملة ── */
    const luAll = await post("/api/admin", { action: "list-users" });
    ok("أدمين: قائمة الحسابات", (luAll.data.users || []).length >= 3);

    const luVictims = await post("/api/admin", { action: "list-users", role: "VICTIM", q: vName.slice(0, 6) });
    ok("أدمين: فلترة المتضررين + بحث", (luVictims.data.users || []).length >= 1 && luVictims.data.users.every((u) => u.role === "VICTIM"));

    const avCreate = await post("/api/admin", { action: "create-account", role: "VICTIM", pseudonym: "أدمين-أنشأ-هذا", password: "admin-made-123", wilaya: "oran" });
    ok("أدمين: إنشاء حساب متضرر", avCreate.data.ok === true);

    const avLogin = await post("/api/victim", { action: "login", pseudonym: "أدمين-أنشأ-هذا", password: "admin-made-123" });
    ok("أدمين: الحساب المُنشأ يسجّل دخولاً", avLogin.data.ok === true);

    const acCreate = await post("/api/admin", { action: "create-account", role: "COUNSELOR", fullName: "د. مباشر", email: `admin${stamp}@t.tt`, password: "admin-made-123", whatsapp: "0661223344", verified: true });
    ok("أدمين: إنشاء أخصائي موثّق مباشرة", acCreate.data.ok === true);

    const luC = await post("/api/admin", { action: "list-users", role: "COUNSELOR", q: `admin${stamp}@t.tt` });
    ok("أدمين: الأخصائي المباشر موثّق", luC.data.users?.[0]?.verificationStatus === "VERIFIED");

    const spTarget = luVictims.data.users[0];
    const sp = await post("/api/admin", { action: "set-password", userId: spTarget.id, newPassword: "admin-reset-99" });
    ok("أدمين: تعيين كلمة مرور جديدة", sp.data.ok === true);
    const spLogin = await post("/api/victim", { action: "login", pseudonym: vName, password: "admin-reset-99" });
    ok("أدمين: دخول بالكلمة المعيّنة", spLogin.data.ok === true);

    const del = await post("/api/admin", { action: "delete-user", userId: victimId });
    ok("أدمين: حذف حساب متضرر", del.data.ok === true);
    const delLogin = await post("/api/victim", { action: "login", pseudonym: vName, password: "admin-reset-99" });
    ok("أدمين: الحساب المحذوف لا يدخل", delLogin.status === 401);
    const vSessionsAfterDel = await (await fetch(`${BASE}/api/sessions?userId=${victimId}&role=VICTIM`)).json();
    ok("أدمين: جلسات المحذوف أُزيلت", (vSessionsAfterDel.sessions || []).length === 0);

    const delC = await post("/api/admin", { action: "delete-user", userId: acCreate.data.userId });
    const luAfter = await post("/api/admin", { action: "list-users" });
    ok("أدمين: حذف أخصائي + ملفه المهني", delC.data.ok === true && !(luAfter.data.users || []).some((u) => u.email === `admin${stamp}@t.tt`));

    /* 5) E2E المحادثة */
    console.log("💬 تشغيل test-socket.js ...");
    const ts = spawn("node", ["scripts/test-socket.js"], {
      cwd: process.cwd(),
      env: { ...process.env, TEST_URL: BASE },
      stdio: "inherit",
    });
    await new Promise((resolve) => ts.on("close", resolve));
    if (ts.exitCode !== 0) {
      fails++;
      console.error("───── آخر سجل الخادم ─────\n" + serverLog.slice(-2000));
    }
  } finally {
    server.kill("SIGTERM");
    await wait(500);
    await mongod.stop();
  }

  console.log("\n══════════════════════════════════");
  if (fails === 0) console.log("🎉 كل اختبارات الدخان نجحت");
  else console.log(`⚠️  ${fails} اختبار فاشل`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("❌ فشل سكربت الاختبار:", e.message);
  process.exit(1);
});
