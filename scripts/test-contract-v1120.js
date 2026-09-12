#!/usr/bin/env node
/**
 * اختبار E2E شامل — v1.12.0: عقد المنصة الواحد
 * ───────────────────────────────────────────────
 * يتحقق من كل متطلبات بلاغ المستخدم:
 *  ① عقد واحد للمنصة يديره الأدمين حصراً (قراءة عامة محمية من التعديل)
 *  ② نزع خاصية العقد الخاص (save-template مُزال — الأخصائي يمضي فقط)
 *  ③ تكرار النافذة: كل حجز جديد (لأي عميل) يُنشئ عقداً مستقلاً برقم فريد
 *  ④ أرقام العقود تسلسلية فريدة لا تتكرر
 *  ⑤ توقيع العميل يحفظ النسخة النهائية الممضاة من الطرفين
 */
const { spawn } = require("child_process");
const mongoose = require("mongoose");

const PORT = 3198;
const BASE = `http://127.0.0.1:${PORT}`;
let fails = 0;
const ok = (name, cond) => {
  console.log((cond ? "✅" : "❌") + " " + name);
  if (!cond) fails++;
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(method, path, body, headers = {}) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = {};
  try { data = JSON.parse(text); } catch { data = { _raw: text.slice(0, 200) }; }
  return { status: r.status, data };
}

/* صورة PNG صغيرة 1x1 بديل إمضاء حقيقي */
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function main() {
  /* 1) MongoDB مؤقت في الذاكرة */
  const { MongoMemoryServer } = require("mongodb-memory-server");
  console.log("⏳ تشغيل MongoDB مؤقت في الذاكرة...");
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri("tumaanina-v1120");

  /* 2) زرع أخصائي موثّق + ثلاثة عملاء */
  const conn = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 10000 }).asPromise();
  const { randomBytes, scryptSync } = require("crypto");
  const hash = (s) => {
    const salt = randomBytes(16).toString("hex");
    return { hash: scryptSync(s, salt, 64).toString("hex"), salt };
  };
  const UserSchema = new mongoose.Schema(
    {
      pseudonym: String,
      fullName: String,
      role: String,
      language: { type: String, default: "ar" },
      email: { type: String, sparse: true, unique: true },
      passwordHash: String,
      passwordSalt: String,
      gender: String,
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
      verificationStatus: { type: String, default: "PENDING" },
      available: { type: Boolean, default: true },
      rating: { type: Number, default: 5 },
      sessionsCount: { type: Number, default: 0 },
      contractSignature: String,
      contractSignedAt: Date,
    },
    { timestamps: true, collection: "counselors" }
  );
  const U = conn.model("User", UserSchema);
  const P = conn.model("CounselorProfile", ProfileSchema);

  const counselor = await U.create({ role: "COUNSELOR", pseudonym: "د. أخصائي", fullName: "د. أخصائي تجربة", email: "c@local", gender: "male" });
  await P.create({
    userId: counselor._id,
    fullName: "د. أخصائي تجربة",
    specialties: ["trauma"],
    languages: ["ar", "fr"],
    whatsapp: "213555000111",
    verificationStatus: "VERIFIED",
  });
  const clients = [];
  for (let i = 1; i <= 3; i++) {
    const c = await U.create({ role: "VICTIM", pseudonym: `عميل-${i}`, fullName: `العميل الكامل ${i}`, gender: i % 2 ? "female" : "male" });
    clients.push(c);
  }
  await conn.close();
  console.log("🌱 أخصائي موثّق + 3 عملاء مزروعون");

  /* 3) إقلاع الخادم الموحّد بوضع الإنتاج */
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
        const h = await fetch(`${BASE}/api/health`);
        if (h.ok) { up = true; break; }
      } catch {}
    }
    if (!up) {
      console.error("❌ الخادم لم يقبل!\n" + serverLog.slice(-3000));
      process.exit(1);
    }
    console.log("🚀 الخادم يعمل على", BASE);

    /* ══════════ ① عقد المنصة — بوابة الأدمين ══════════ */
    const adminLogin = await req("POST", "/api/admin", { action: "login", passcode: "test-pass-123" });
    ok("أدمين: تسجيل الدخول يعطي رمز إدارة", adminLogin.data.ok && !!adminLogin.data.token);
    const adminH = { "x-admin-token": adminLogin.data.token };

    const noToken = await req("POST", "/api/admin", { action: "platform-contract-get" });
    ok("حماية: قراءة عقد المنصة بلا رمز إدارة تُرفض 401", noToken.status === 401);

    const noTokenSave = await req("POST", "/api/admin", { action: "platform-contract-save", text: "x".repeat(200) });
    ok("حماية: تعديل عقد المنصة بلا رمز إدارة يُرفض 401", noTokenSave.status === 401);

    const pcGet = await req("POST", "/api/admin", { action: "platform-contract-get" }, adminH);
    ok("الأدمين: قراءة عقد المنصة ناجحة", pcGet.data.ok && typeof pcGet.data.platform.text === "string");
    ok("الزرع الأولي: النص الافتراضي المعتمد مزروع تلقائياً (>500 حرف)", (pcGet.data.platform.text || "").length > 500);
    ok("البنود الاحترافية: نص الوثيقة المرجعية موجود (بند السرية)", (pcGet.data.platform.text || "").includes("السرية والخصوصية"));

    const shortSave = await req("POST", "/api/admin", { action: "platform-contract-save", text: "قصير جداً" }, adminH);
    ok("التحقق: نص أقل من 100 حرف يُرفض", shortSave.status === 400 && shortSave.data.error === "INVALID_TEXT");

    const editedText = pcGet.data.platform.text + "\n\nبند 7: تعديل من الإدارة — النص الجديد يُطبّق على الحجوزات الجديدة فقط.";
    const pcSave = await req("POST", "/api/admin", { action: "platform-contract-save", text: editedText }, adminH);
    ok("الأدمين: حفظ تعديل النص ناجح", pcSave.data.ok && !!pcSave.data.updatedAt);

    /* قراءة عامة محمية (view=platform بلا userId — قراءة فقط) */
    const pub = await req("GET", `/api/contract?view=platform`);
    ok("قراءة عامة: نص عقد المنصة متاح قراءةً للجميع", pub.data.platform && pub.data.platform.text.includes("بند 7"));
    const pubEdit = await req("POST", "/api/contract", { action: "platform-contract-save", text: editedText, userId: clients[0]._id.toString() });
    ok("حماية: العميل لا يستطيع التعديل عبر مسار العقد (UNKNOWN_ACTION)", pubEdit.status === 400);

    /* ══════════ ② نزع العقد الخاص — الأخصائي يمضي فقط ══════════ */
    const oldSaveTemplate = await req("POST", "/api/contract", { action: "save-template", userId: counselor._id.toString(), text: "ن".repeat(200), signature: TINY_PNG });
    ok("نزع العقد الخاص: action=save-template أُزيل نهائياً (UNKNOWN_ACTION)", oldSaveTemplate.status === 400 && oldSaveTemplate.data.error === "UNKNOWN_ACTION");

    const tpl = await req("GET", `/api/contract?view=template&userId=${counselor._id.toString()}`);
    ok("إعدادات الأخصائي: نص العقد من المنصة (مطابق للنص المعتمد)", tpl.data.template && tpl.data.template.text.includes("بند 7"));
    ok("إعدادات الأخصائي: النص معلَّم locked=true (قراءة فقط)", tpl.data.template.locked === true);

    const signNoSig = await req("POST", "/api/contract", { action: "counselor-sign", userId: counselor._id.toString() });
    ok("إمضاء الأخصائي: بلا إمضاء يُرفض (SIGNATURE_REQUIRED)", signNoSig.status === 400 && signNoSig.data.error === "SIGNATURE_REQUIRED");

    const clientTriesSign = await req("POST", "/api/contract", { action: "counselor-sign", userId: clients[0]._id.toString(), signature: TINY_PNG });
    ok("حماية: العميل لا يستطيع إمضاء عقد الأخصائي (FORBIDDEN)", clientTriesSign.status === 403);

    const cSign = await req("POST", "/api/contract", { action: "counselor-sign", userId: counselor._id.toString(), signature: TINY_PNG });
    ok("إمضاء الأخصائي على عقد المنصة ناجح", cSign.data.ok && !!cSign.data.signedAt);

    /* ══════════ ③④ الحجوزات المتكررة — عقد مستقل برقم فريد لكل حجز ══════════ */
    const day = new Date(Date.now() + 24 * 3600 * 1000);
    const mk = (h) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, 0, 0).toISOString();
    const topics = ["anxiety", "depression", "trauma"];

    const bookings = [];
    for (let i = 0; i < 3; i++) {
      const b = await req("POST", "/api/sessions", {
        victimId: clients[i]._id.toString(),
        counselorId: counselor._id.toString(),
        topic: topics[i],
        mode: "TEXT",
        scheduledAt: mk(10 + i * 3),
        date: new Date(day.getFullYear(), day.getMonth(), day.getDate()).toISOString().slice(0, 10),
      });
      bookings.push(b);
    }
    ok("الحجز 1 (عميل-1): عقد مستقل أُنشئ فوراً", !!(bookings[0].data.contract && bookings[0].data.contract.number));
    ok("الحجز 2 (عميل-2): النافذة تتكرر — عقد جديد لأي عميل", !!(bookings[1].data.contract && bookings[1].data.contract.number));
    ok("الحجز 3 (عميل-3): عقد جديد أيضاً", !!(bookings[2].data.contract && bookings[2].data.contract.number));

    const nums = bookings.filter((b) => b.data.contract).map((b) => b.data.contract.number);
    ok("أرقام العقود الثلاثة كلها فريدة", new Set(nums).size === 3);
    ok("شكل الرقم التسلسلي TC-YYYY-NNNNN", nums.every((n) => /^TC-\d{4}-\d{5}$/.test(n)));
    const sorted = [...nums].sort();
    ok("التسلسل تصاعدي متقارب", nums.every((n) => Math.abs(parseInt(n.slice(-5), 10) - parseInt(sorted[0].slice(-5), 10)) <= 2));

    /* بيانات العقد المعلّق تكتمل للنافذة المنبثقة (نص المنصة + إمضاء الأخصائي) */
    const pend = await req("GET", `/api/contract?view=pending&userId=${clients[0]._id.toString()}`);
    ok("النافذة المنبثقة: عقد بانتظار إمضاء العميل-1 موجود", !!pend.data.contract);
    ok("لقطة النص محمية: نص العقد = نص عقد المنصة المعتمد", (pend.data.contract.text || "").includes("بند 7"));
    ok("إمضاء الأخصائي مرفوع في المستند", !!pend.data.contract.counselorSignature);
    ok("اسم الأخصائي في المستند", pend.data.contract.counselorName === "د. أخصائي تجربة");

    /* ══════════ ⑤ توقيع العميل — النسخة النهائية ══════════ */
    const badSign = await req("POST", "/api/contract", { action: "client-sign", userId: clients[0]._id.toString(), contractId: pend.data.contract.id, signature: TINY_PNG, fullName: "ا" });
    ok("توقيع العميل: اسم قصير يُرفض (NAME_REQUIRED)", badSign.status === 400 && badSign.data.error === "NAME_REQUIRED");

    const doSign = await req("POST", "/api/contract", { action: "client-sign", userId: clients[0]._id.toString(), contractId: pend.data.contract.id, signature: TINY_PNG, fullName: "العميل الكامل 1", lang: "fr" });
    ok("توقيع العميل-1 ناجح", doSign.data.ok);

    const pend2 = await req("GET", `/api/contract?view=pending&userId=${clients[0]._id.toString()}`);
    ok("بعد الإمضاء: لا عقد معلّق جديد — النافذة لا تعود لنفس العقد", !pend2.data.contract);

    const one = await req("GET", `/api/contract?view=one&id=${pend.data.contract.id}&userId=${clients[0]._id.toString()}`);
    ok("النسخة النهائية: موقّعة من الطرفين", one.data.contract.status === "SIGNED");
    ok("النسخة النهائية: اسم العميل المدوّن محفوظ", one.data.contract.clientSignedName === "العميل الكامل 1");
    ok("النسخة النهائية: لغة المستند المعتمدة محفوظة (fr)", one.data.contract.lang === "fr");

    /* العميل الآخر لا يرى عقد غيره */
    const intruder = await req("GET", `/api/contract?view=one&id=${pend.data.contract.id}&userId=${clients[1]._id.toString()}`);
    ok("الخصوصية: عقد العميل-1 لا يراه العميل-2", intruder.status === 403);

    /* قائمة عقود الأخصائي = 3 عقود بأرقام فريدة */
    const list = await req("GET", `/api/contract?view=list&userId=${counselor._id.toString()}`);
    ok("قائمة الأخصائي: 3 عقود محفوظة", (list.data.contracts || []).length === 3);
    const listNums = (list.data.contracts || []).map((c) => c.number);
    ok("قائمة الأخصائي: أرقام فريدة بلا تكرار", new Set(listNums).size === 3);

    /* ملخص */
    console.log("\n══════════════════════════");
    if (fails === 0) console.log("🏆 كل اختبارات عقد المنصة v1.12.0 ناجحة");
    else console.log(`⚠️ فشل ${fails} اختبار`);
    console.log("══════════════════════════");
    process.exitCode = fails === 0 ? 0 : 1;
  } finally {
    server.kill("SIGTERM");
    await wait(500);
    await mongod.stop().catch(() => {});
  }
}

main().catch((e) => {
  console.error("💥 فشل الاختبار:", e);
  process.exit(1);
});
