/**
 * اختبار طمأنينة v1.11.0 — إصلاحات العقد العلاجي الثلاث بعد تجربة المستخدم
 * ─────────────────────────────────────────────────────────────────────────
 *  1. الخادم v1.11.0 جاهز
 *  2. حفظ عقد الأخصائي (نصه الخاص — بلا قالب من المنصة)
 *  3. العقد لحظة الحجز (الاستجابة تحمل العقد برقمه) → النافذة فوراً
 *  4. ✦ الإصلاح الجوهري: حجز ثانٍ وثالث لنفس الزوج → عقد مستقل جديد
 *     برقم جديد كل مرة (كانت «النافذة تظهر فقط في المرة الأولى»)
 *  5. توقيع العميل (إمضاء + اسم + لغة) + الحمايات
 *  6. السباق المتوازي — أرقام متتالية بلا تكرار
 *  7. ثغرة الترتيب (backfill لكل جلسة) + مسار القبول الاحتياطي بلا تكرار
 *  8. تحديث العقد: لقطة المفتوح تتجدد، الممضى لا يُمَس
 *  9. فحوص الملفات: نزع القالب + طباعة بلا صفحات فارغة + i18n ×6 + إصدارات
 */
const { MongoMemoryServer } = require("mongodb-memory-server");
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = String(4100 + (process.pid % 200) + Math.floor(Math.random() * 80));
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

/* إمضاء PNG صالح (>100 حرف) — لوحة 40x20 بيضاء بنقطة */
const SIG_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAUCAYAAAD/RnK7AAAAKklEQVR42u3NMQEAAAgDoJfafLDjDSSAgICAgICAgICAgICAgICAgICAgICAgB5bDgEFAASyPQAAAAASUVORK5CYII=";
const TEXT1 =
  "وثيقة عقد استشارة نفسية (اتفاقية العقد العلاجي).\n\nبند 1 — أهداف وضوابط العملية العلاجية:\nيلتزم الطرف الأول بتقديم الدعم النفسي وفق الأخلاقيات المهنية، ويقر الطرف الثاني برغبته الحرة ويلتزم بالتعاون.\n\nبند 2 — السرية والخصوصية:\nكافة معلومات العميل سرية تامة وتُرفع قانوناً في حالات الخطر على الحياة أو أمر قضائي فقط.\n\nبند 3 — المواعيد:\nيجب إخطار المختص بالإلغاء قبل 24 ساعة على الأقل وإلا احتُسبت الجلسة منعقدة.";
const EXTRA = "\n\nبند إضافي — يلتزم الطرفان بالتعامل باحترام تام عبر المنصة.";
const seqOf = (n) => parseInt(String(n).split("-")[2], 10);

(async () => {
  console.log("═".repeat(56));
  console.log("🧪 اختبار طمأنينة v1.11.0 — إصلاحات العقد الثلاث");
  console.log("═".repeat(56));

  const mongod = await MongoMemoryServer.create();
  const server = spawn("node", ["server.js"], {
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("tumaanina-v1110"), ADMIN_PASSCODE: "tum-pass-1110", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  server.stderr.on("data", () => {});
  let ready = false;
  for (let i = 0; i < 60; i++) {
    await wait(500);
    try {
      const h = await req("GET", "/api/health");
      if (h.json?.version === "1.11.0" && h.json?.ok) { ready = true; break; }
    } catch {}
  }
  check("الخادم v1.11.0 جاهز", ready);
  if (!ready) { server.kill(); process.exit(1); }

  const login = await req("POST", "/api/admin", { action: "login", passcode: "tum-pass-1110" });
  ADMIN_TOKEN = login.json?.token || "";
  check("رمز الإدارة صادر", !!ADMIN_TOKEN);

  /* ═══ الحسابات: أخصائيّان موثّقان + أربعة عملاء ═══ */
  const mkClient = async (name) =>
    (await req("POST", "/api/client", {
      action: "register", pseudonym: name, password: "pass-tumaanina-1",
      recoveryPhrase: "عبارة استرجاع تجريبية", gender: "male", phone: "05559990" + Math.floor(10 + Math.random() * 89),
    })).json.user;
  const client1 = await mkClient("عميل-العقد-أ");
  const client2 = await mkClient("عميل-العقد-ب");
  const client3 = await mkClient("عميل-العقد-ج");
  const client4 = await mkClient("عميل-العقد-د");
  check("الحسابات الأربعة جاهزة", !!client1?.id && !!client2?.id && !!client3?.id && !!client4?.id);

  const mkCounselor = async (name) => {
    const email = `doc-${name}-${Date.now()}@test.dz`;
    await req("POST", "/api/counselor", {
      action: "register", fullName: name, email, password: "pass-tumaanina-1",
      recoveryPhrase: "عبارة اختبار الأخصائي", specialties: ["anxietyDepression"],
      languages: ["ar"], yearsExperience: 8, whatsapp: "213666999017", sessionPrice: 2000,
    });
    const user = (await req("POST", "/api/counselor", { action: "login", email, password: "pass-tumaanina-1" })).json.user;
    const prof = (await req("GET", `/api/counselor?userId=${user.id}`)).json?.profile;
    await req("POST", "/api/admin", { action: "verify", profileId: prof?.id });
    return user;
  };
  const drA = await mkCounselor("د. عقد الاحتراف");
  const drB = await mkCounselor("د. ترتيب الثغرة");
  check("الأخصائيّان موثّقان من الإدارة", !!drA?.id && !!drB?.id);

  /* ═══ 2) حفظ عقد الأخصائي (نصه الخاص) ═══ */
  console.log("\n── 1) حفظ عقد الأخصائي من إعداداته ──");
  const saved = await req("POST", "/api/contract", { action: "save-template", userId: drA.id, text: TEXT1, signature: SIG_PNG });
  check("حفظ العقد نجح", saved.status === 200 && saved.json?.ok === true, JSON.stringify(saved.json));
  check("لا backfill بعد (لا جلسات)", saved.json?.backfilled === 0);
  const badSave = await req("POST", "/api/contract", { action: "save-template", userId: drA.id, text: "قصير", signature: SIG_PNG });
  check("نص قصير مرفوض", badSave.status === 400);
  const noSig = await req("POST", "/api/contract", { action: "save-template", userId: drA.id, text: TEXT1 });
  check("بلا إمضاء مرفوض", noSig.status === 400);

  /* ═══ 3) الحجز الأول → عقد برقم تسلسلي ═══ */
  console.log("\n── 2) الحجز الأول → العقد جاهز فوراً برقمه ──");
  const b1 = await req("POST", "/api/sessions", { victimId: client1.id, counselorId: drA.id, topic: "anxiety", mode: "TEXT", scheduledAt: new Date(Date.now() + 48 * 3600e3).toISOString(), currency: "DZD" });
  check("الحجز الأول نجح", b1.status === 200 && b1.json?.ok === true);
  const ctr1 = b1.json?.contract;
  check("الاستجابة تحمل عقداً (النافذة تفتح فوراً)", !!ctr1?.id, JSON.stringify(b1.json).slice(0, 160));
  check("رقم تسلسلي TC-YYYY-#####", /^TC-\d{4}-\d{5}$/.test(ctr1?.number || ""), ctr1?.number || "—");
  const pend1 = (await req("GET", `/api/contract?view=pending&userId=${client1.id}`)).json?.contract;
  check("pending بنفس العقد والرقم", pend1?.id === ctr1.id && pend1?.number === ctr1.number);
  check("لقطة نص الأخصائي + إمضاؤه", pend1?.text === TEXT1 && !!pend1?.counselorSignature);

  /* ═══ 4) ✦ الإصلاح الجوهري: حجز ثانٍ وثالث لنفس الزوج ═══ */
  console.log("\n── 3) ✦ حجز ثانٍ ثم ثالث لنفس العميل — عقد جديد كل مرة (البلاغ) ──");
  const sign1 = await req("POST", "/api/contract", { action: "client-sign", userId: client1.id, contractId: ctr1.id, signature: SIG_PNG, fullName: "محمد الأمين التجريبي", lang: "fr" });
  check("توقيع العقد الأول نجح", sign1.status === 200 && sign1.json?.ok === true);
  const one1 = (await req("GET", `/api/contract?view=one&id=${ctr1.id}&userId=${client1.id}`)).json?.contract;
  check("العقد الأول SIGNED بلغته المحفوظة", one1?.status === "SIGNED" && one1?.lang === "fr");

  const b2 = await req("POST", "/api/sessions", { victimId: client1.id, counselorId: drA.id, topic: "anxiety", mode: "TEXT", scheduledAt: new Date(Date.now() + 96 * 3600e3).toISOString(), currency: "DZD" });
  const ctr2 = b2.json?.contract;
  check("الحجز الثاني نجح", b2.status === 200 && b2.json?.ok === true);
  check("✦ حجز ثانٍ → عقد جديد بمُعرّف مختلف (لم يعد زوجاً واحداً)", !!ctr2?.id && ctr2.id !== ctr1.id, JSON.stringify(ctr2));
  check("✦ برقم تسلسلي جديد أكبر", /^TC-\d{4}-\d{5}$/.test(ctr2?.number || "") && seqOf(ctr2.number) > seqOf(ctr1.number), `${ctr1.number} → ${ctr2?.number}`);
  const sign2 = await req("POST", "/api/contract", { action: "client-sign", userId: client1.id, contractId: ctr2.id, signature: SIG_PNG, fullName: "محمد الأمين التجريبي", lang: "ar" });
  check("توقيع العقد الثاني نجح", sign2.status === 200 && sign2.json?.ok === true);

  const b3 = await req("POST", "/api/sessions", { victimId: client1.id, counselorId: drA.id, topic: "stress", mode: "VOICE", scheduledAt: new Date(Date.now() + 144 * 3600e3).toISOString(), currency: "DZD" });
  const ctr3 = b3.json?.contract;
  check("✦ حجز ثالث → عقد ثالث برقم ثالث (النافذة كل مرة)", !!ctr3?.id && ctr3.id !== ctr1.id && ctr3.id !== ctr2.id && seqOf(ctr3.number) > seqOf(ctr2.number), JSON.stringify(ctr3));
  const pend3 = (await req("GET", `/api/contract?view=pending&userId=${client1.id}`)).json?.contract;
  check("pending يعرض آخر عقد بانتظار الإمضاء", pend3?.id === ctr3.id);
  const badUser = await req("POST", "/api/contract", { action: "client-sign", userId: client2.id, contractId: ctr3.id, signature: SIG_PNG, fullName: "مزور الاختبار" });
  check("توقيع عميل آخر مرفوض", badUser.status === 403);

  /* ═══ 6) السباق المتوازي ═══ */
  console.log("\n── 4) السباق المتوازي — رقمان متتاليان بلا تكرار ──");
  const [rb2, rb3] = await Promise.all([
    req("POST", "/api/sessions", { victimId: client2.id, counselorId: drA.id, topic: "stress", mode: "VOICE", scheduledAt: new Date(Date.now() + 168 * 3600e3).toISOString(), currency: "DZD" }),
    req("POST", "/api/sessions", { victimId: client3.id, counselorId: drA.id, topic: "stress", mode: "VIDEO", scheduledAt: new Date(Date.now() + 168 * 3600e3 + 3 * 3600e3).toISOString(), currency: "DZD" }),
  ]);
  const n4 = rb2.json?.contract?.number || "";
  const n5 = rb3.json?.contract?.number || "";
  check("كلا الحجزين المتوازيين نجحا بعقد", !!rb2.json?.contract?.id && !!rb3.json?.contract?.id, `${rb2.status}/${rb3.status}`);
  check("الرقمان مختلفان", !!n4 && !!n5 && n4 !== n5, `${n4} / ${n5}`);
  const allNums = [ctr1.number, ctr2.number, ctr3.number, n4, n5].map(seqOf).sort((a, b) => a - b);
  check("التسلسل تصاعدي متصل 1→5 بلا قفز", allNums.every((v, i) => v === i + 1), JSON.stringify(allNums));

  /* ═══ 7) ثغرة الترتيب + مسار القبول ═══ */
  console.log("\n── 5) ثغرة الترتيب: حجز قبل إعداد العقد ثم الحفظ (backfill) ──");
  const b4 = await req("POST", "/api/sessions", { victimId: client4.id, counselorId: drB.id, topic: "sleep", mode: "TEXT", scheduledAt: new Date(Date.now() + 192 * 3600e3).toISOString(), currency: "DZD" });
  check("حجز مع أخصائي بلا عقد بعد — بلا عقد في الاستجابة", b4.status === 200 && !b4.json?.contract?.id, JSON.stringify(b4.json?.contract));
  const savedB = await req("POST", "/api/contract", { action: "save-template", userId: drB.id, text: TEXT1 + EXTRA, signature: SIG_PNG });
  check("حفظ عقد الأخصائي الثاني نجح", savedB.status === 200 && savedB.json?.ok === true);
  check("✦ backfill زوّد الجلسة الحيّة بعقد", (savedB.json?.backfilled || 0) >= 1, `backfilled=${savedB.json?.backfilled}`);
  const pend4 = (await req("GET", `/api/contract?view=pending&userId=${client4.id}`)).json?.contract;
  check("العميل يرى عقده المُنشأ تلقائياً برقمه", !!pend4?.id && /^TC-\d{4}-\d{5}$/.test(pend4?.number || ""));
  check("اسم الأخصائي الثاني على العقد", pend4?.counselorName === "د. ترتيب الثغرة");
  /* مسار القبول الاحتياطي — لا ينشئ عقداً ثانياً لنفس الجلسة */
  const sessList = (await req("GET", `/api/sessions?userId=${drB.id}&role=COUNSELOR`)).json?.sessions || [];
  const s4 = sessList.find((s) => s.victimId === client4.id);
  const acc = await req("PATCH", `/api/sessions/${s4?.id}`, { status: "ACCEPTED", durationMinutes: 60, viewerId: drB.id });
  check("قبول الأخصائي للجلسة نجح", acc.status === 200, JSON.stringify(acc.json).slice(0, 120));
  const listB = (await req("GET", `/api/contract?view=list&userId=${drB.id}`)).json?.contracts || [];
  check("✦ القبول لم يُكرّر عقد الجلسة (عقد واحد للجلسة)", listB.length === 1, `count=${listB.length}`);

  /* ═══ 8) تحديث العقد: المفتوح يتجدد والممضى لا يُمَس ═══ */
  console.log("\n── 6) تحديث العقد — اللقطة المفتوحة تتجدد والممضى محفوظ ──");
  const savedA2 = await req("POST", "/api/contract", { action: "save-template", userId: drA.id, text: TEXT1 + EXTRA, signature: SIG_PNG });
  check("تحديث عقد الأخصائي نجح", savedA2.status === 200 && savedA2.json?.ok === true);
  const pend3b = (await req("GET", `/api/contract?view=pending&userId=${client1.id}`)).json?.contract;
  check("العقد المفتوح تُحدّث لقطة نصه", (pend3b?.text || "").includes("بند إضافي"));
  const one1b = (await req("GET", `/api/contract?view=one&id=${ctr1.id}&userId=${client1.id}`)).json?.contract;
  check("العقد الممضى الأول لم يُمَس (نصه الأصلي)", one1b?.text === TEXT1 && one1b?.status === "SIGNED");
  const oneAcc = await req("GET", `/api/contract?view=one&id=${ctr1.id}&userId=${client2.id}`);
  check("غريب مرفوض من عرض العقد", oneAcc.status === 403);

  /* ═══ 9) قائمة الأخصائي ═══ */
  console.log("\n── 7) قائمة عقود الأخصائي ──");
  const listA = (await req("GET", `/api/contract?view=list&userId=${drA.id}`)).json?.contracts || [];
  check("القائمة تحوي 5 عقود (لكل جلسة عقد)", listA.length === 5, `count=${listA.length}`);
  check("أرقام كلها فريدة بالشكل الرسمي", listA.every((c) => /^TC-\d{4}-\d{5}$/.test(c.number || "")) && new Set(listA.map((c) => c.number)).size === listA.length);
  check("حالات ممضاة ومفتوحة ظاهرة", listA.some((c) => c.status === "SIGNED") && listA.some((c) => c.status === "AWAITING_CLIENT"));
  check("أسماء العملاء ظاهرة (clientName)", listA.some((c) => !!c.clientName), JSON.stringify(listA.slice(0, 1)));

  /* ═══ 10) فحوص الملفات ═══ */
  console.log("\n── 8) فحوص الملفات (نزع القالب + الطباعة + i18n + الإصدارات) ──");
  const ct = read("src/lib/contract-template.ts");
  check("✦ نُزع النموذج المقترح من المنصة نهائياً", !ct.includes("SUGGESTED_TEMPLATE"));
  check("هيكل الوثيقة الرسمي سداسي اللغات باقٍ", ["ar:", "fr:", "en:", "tr:", "ru:", "zh:"].every((k) => ct.includes(`  ${k}`)) && ct.includes("CONTRACT_DOC_TEXTS"));
  const settings = read("src/components/views/settings.tsx");
  check("✦ الإعدادات بلا زر القالب أو محدد لغته", !settings.includes("SUGGESTED_TEMPLATE") && !settings.includes("useTemplate") && !settings.includes("templateLang"));
  check("الإعدادات: زر الطباعة الاحترافية + إمضاء 280px", settings.includes("ContractPrintButton") && /height=\{280\}/.test(settings));
  const gcss = read("src/app/globals.css");
  check("✦ الطباعة: إزالة كل المحتوى عدا المستند (بلا صفحات فارغة)", gcss.includes("body > *:not(#tumaanina-contract-print)") && gcss.includes("display: none !important"));
  check("✦ الطباعة: المستند في التدفق الطبيعي داخل هوامش A4", gcss.includes("position: static !important") && gcss.includes("size: A4 portrait"));
  const cdoc = read("src/components/shared/contract-document.tsx");
  check("✦ الطباعة: مستوى رسم مخصص للطباعة بخطوط A4", cdoc.includes('variant = "screen"') && cdoc.includes("SIZES") && cdoc.includes("variant=\"print\""));
  check("الطباعة: منع انقسام الإقرار والتوقيعات", cdoc.includes('data-nosplit="true"') && gcss.includes('data-nosplit="true"'));
  check("محدد لغة المستند + محرك الطباعة باقيان", cdoc.includes("ContractLangSelect") && cdoc.includes("printContractDocument") && cdoc.includes("CONTRACT_LANGS"));
  const popup = read("src/components/shared/contract-popup.tsx");
  check("المنبثقة: حدث لحظي + استقصاء + إمضاء واسع 300px", popup.includes("CONTRACT_ARRIVED_EVENT") && popup.includes("POLL_MS") && /height=\{300\}/.test(popup));
  const models = read("src/lib/models.ts");
  check("✦ النموذج: فهرس الثلاثية بدل الزوج الفريد", models.includes("counselorId: 1, clientUserId: 1, sessionId: 1") && !models.includes("{ counselorId: 1, clientUserId: 1 }, { unique: true }"));
  const scontract = read("src/lib/server/contract.ts");
  check("✦ ترحيل الفهرس القديم عند الإقلاع (dropIndex)", scontract.includes("ensureContractIndexes") && scontract.includes("dropIndex"));
  const sessApi = read("src/app/api/sessions/route.ts");
  check("✦ الحجز: عقد جديد دائماً لكل جلسة (بلا دمج الزوج)", sessApi.includes("nextContractNumber") && !sessApi.includes('existing.status === "AWAITING_CLIENT"'));
  const sessId = read("src/app/api/sessions/[id]/route.ts");
  check("القبول الاحتياطي: بحث بثلاثية الجلسة", sessId.includes("sessionId: updated._id") && sessId.includes("nextContractNumber"));
  for (const lg of ["ar", "en", "fr", "ru", "tr", "zh"]) {
    const t = read(`src/lib/i18n/${lg}.ts`);
    check(`i18n ${lg}: بلا useTemplate وبمفاتيح العقد`, !t.includes("useTemplate") && t.includes("docLangLabel") && t.includes("pendingBannerTitle") && t.includes("printBtnShort"));
  }
  const i18nAr = read("src/lib/i18n/ar.ts");
  check("i18n: صياغة «لكل جلسة عقد مستقل»", i18nAr.includes("لكل جلسة عقد مستقل") && i18nAr.includes("لا تُنشئ العقود ولا تفرض نصوصاً"));
  const pkg = JSON.parse(read("package.json"));
  const health = read("src/app/api/health/route.ts");
  const svrjs = read("server.js");
  const manifest = read("../apk-env/app/AndroidManifest.xml");
  check("الإصدار 1.11.0 في الملفات الأربعة", pkg.version === "1.11.0" && health.includes('"1.11.0"') && svrjs.includes("v1.11.0") && manifest.includes('android:versionCode="1110"') && manifest.includes('android:versionName="1.11.0"'));

  /* ═══ الخلاصة ═══ */
  console.log("\n" + "═".repeat(56));
  if (failures === 0) {
    console.log("🏆 كل الاختبارات نجحت — إصلاحات v1.11.0 الثلاثة تعمل كاملاً");
  } else {
    console.log(`⚠️  فشل ${failures} فحصاً`);
  }
  console.log("═".repeat(56));
  server.kill();
  await mongod.stop();
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error("💥 فشل غير متوقع:", e);
  process.exit(1);
});
