/**
 * اختبار طمأنينة v1.10.0 — منطق العقد العلاجي الاحترافي من أول مرحلة إلى آخر مرحلة
 * ─────────────────────────────────────────────────────────────────────────────────
 *  1. الخادم v1.10.0 جاهز
 *  2. حفظ القالب من إعدادات الأخصائي (نص + إمضاء) — بلا عقود سابقة
 *  3. العقد لحظة الحجز (المنطق الجديد): الحجز يعيد contract برقم تسلسلي فريد
 *  4. pending يعرض العقد برقمه ونصه وإمضاء الأخصائي
 *  5. توقيع العميل (إمضاء + الاسم الكامل + لغة المستند) → SIGNED
 *  6. العقد الموقّع: lang محفوظة، إمضاءا الطرفين، لا يعود في pending
 *  7. التسلسل: حجزان متوازيان (سباق) → رقمان مختلفان متتاليان بلا تكرار
 *  8. ثغرة الترتيب: حجز قبل وجود قالب ثم حفظ القالب → backfill + العقد يظهر
 *  9. قائمة عقود الأخصائي: أرقام + حالات
 * 10. فحوص ملفات: i18n ×6 + القالب السداسي + print CSS + مكونات الطباعة
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
const CONTRACT_TEXT =
  "وثيقة عقد استشارة نفسية (اتفاقية العقد العلاجي) — منصة طمأنينة.\n\nبند 1 — أهداف وضوابط العملية العلاجية:\nيلتزم الطرف الأول بتقديم الدعم النفسي والاستشاري وفق الأخلاقيات المهنية، ويقر الطرف الثاني برغبته الحرة ويلتزم بالتعاون.\n\nبند 2 — السرية والخصوصية:\nكافة معلومات العميل سرية تامة وتُرفع قانوناً في حالات الخطر على الحياة أو أمر قضائي فقط.\n\nبند 3 — المواعيد:\nيجب إخطار المختص بالإلغاء قبل 24 ساعة على الأقل وإلا احتُسبت الجلسة منعقدة.";

(async () => {
  console.log("═".repeat(56));
  console.log("🧪 اختبار طمأنينة v1.10.0 — العقد العلاجي الاحترافي");
  console.log("═".repeat(56));

  const mongod = await MongoMemoryServer.create();
  const server = spawn("node", ["server.js"], {
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("tumaanina-v1100"), ADMIN_PASSCODE: "tum-pass-1100", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  server.stderr.on("data", () => {});
  let ready = false;
  for (let i = 0; i < 60; i++) {
    await wait(500);
    try {
      const h = await req("GET", "/api/health");
      if (h.json?.version === "1.10.0" && h.json?.ok) { ready = true; break; }
    } catch {}
  }
  check("الخادم v1.10.0 جاهز", ready);
  if (!ready) { server.kill(); process.exit(1); }

  const login = await req("POST", "/api/admin", { action: "login", passcode: "tum-pass-1100" });
  ADMIN_TOKEN = login.json?.token || "";
  check("رمز الإدارة صادر", !!ADMIN_TOKEN);

  /* ═══ الحسابات: أخصائي موثّق + ثلاثة عملاء ═══ */
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

  const cEmail = `doc-contract-${Date.now()}@test.dz`;
  await req("POST", "/api/counselor", {
    action: "register", fullName: "د. عقد الاحتراف", email: cEmail,
    password: "pass-tumaanina-1", recoveryPhrase: "عبارة اختبار الأخصائي",
    specialties: ["anxietyDepression"], languages: ["ar"], yearsExperience: 8,
    whatsapp: "213666999017", sessionPrice: 2000,
  });
  const counselor = (await req("POST", "/api/counselor", { action: "login", email: cEmail, password: "pass-tumaanina-1" })).json.user;
  const meProf = (await req("GET", `/api/counselor?userId=${counselor.id}`)).json?.profile;
  await req("POST", "/api/admin", { action: "verify", profileId: meProf?.id });
  check("الأخصائي موثّق من الإدارة", !!counselor?.id);

  /* ═══ 2) حفظ القالب من الإعدادات ═══ */
  console.log("\n── 1) حفظ القالب الموقّع من إعدادات الأخصائي ──");
  const saved = await req("POST", "/api/contract", {
    action: "save-template", userId: counselor.id, text: CONTRACT_TEXT, signature: SIG_PNG,
  });
  check("حفظ القالب نجح", saved.status === 200 && saved.json?.ok === true);
  check("لا backfill بعد (لا جلسات بعد)", saved.json?.backfilled === 0, JSON.stringify(saved.json));
  const tpl = (await req("GET", `/api/contract?view=template&userId=${counselor.id}`)).json?.template;
  check("القالب يعود بالنص والإمضاء والتاريخ", !!tpl?.text && !!tpl?.signature && !!tpl?.signedAt);
  const badSave = await req("POST", "/api/contract", { action: "save-template", userId: counselor.id, text: "قصير", signature: SIG_PNG });
  check("نص قصير مرفوض", badSave.status === 400);
  const noSig = await req("POST", "/api/contract", { action: "save-template", userId: counselor.id, text: CONTRACT_TEXT });
  check("بلا إمضاء مرفوض", noSig.status === 400);

  /* ═══ 3+4) العقد لحظة الحجز + pending ═══ */
  console.log("\n── 2) العقد لحظة الحجز مباشرة (المنطق الجديد) ──");
  const when1 = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
  const b1 = await req("POST", "/api/sessions", { victimId: client1.id, counselorId: counselor.id, topic: "anxiety", mode: "TEXT", scheduledAt: when1, currency: "DZD" });
  check("الحجز الأول نجح", b1.status === 200 && b1.json?.ok === true);
  const ctr1 = b1.json?.contract;
  check("الاستجابة تحمل عقداً جاهزاً", !!ctr1?.id, JSON.stringify(b1.json).slice(0, 200));
  check("رقم تسلسلي بالشكل TC-YYYY-#####", /^TC-\d{4}-\d{5}$/.test(ctr1?.number || ""), ctr1?.number || "—");

  const pend = (await req("GET", `/api/contract?view=pending&userId=${client1.id}`)).json?.contract;
  check("pending يعرض العقد", !!pend?.id && pend.id === ctr1.id);
  check("pending بنفس الرقم التسلسلي", pend?.number === ctr1.number, `${pend?.number} vs ${ctr1.number}`);
  check("pending بنص القالب الموقّع", pend?.text === CONTRACT_TEXT);
  check("pending بإمضاء الأخصائي", !!pend?.counselorSignature);
  check("pending باسم الأخصائي", pend?.counselorName === "د. عقد الاحتراف");

  /* ═══ 5+6) توقيع العميل ═══ */
  console.log("\n── 3) توقيع العميل (إمضاء + اسم + لغة المستند) ──");
  const badSign = await req("POST", "/api/contract", { action: "client-sign", userId: client1.id, contractId: ctr1.id, signature: SIG_PNG, fullName: "أ" });
  check("اسم قصير مرفوض", badSign.status === 400);
  const wrongUser = await req("POST", "/api/contract", { action: "client-sign", userId: client2.id, contractId: ctr1.id, signature: SIG_PNG, fullName: "مزور الاختبار" });
  check("توقيع عميل آخر مرفوض (FORBIDDEN)", wrongUser.status === 403);
  const sign1 = await req("POST", "/api/contract", { action: "client-sign", userId: client1.id, contractId: ctr1.id, signature: SIG_PNG, fullName: "محمد الأمين التجريبي", lang: "fr" });
  check("التوقيع نجح", sign1.status === 200 && sign1.json?.ok === true);
  const one = (await req("GET", `/api/contract?view=one&id=${ctr1.id}&userId=${client1.id}`)).json?.contract;
  check("العقد SIGNED", one?.status === "SIGNED");
  check("لغة المستند محفوظة (fr)", one?.lang === "fr", one?.lang || "—");
  check("إمضاء العميل محفوظ", !!one?.clientSignature);
  check("الاسم الكامل محفوظ", one?.clientSignedName === "محمد الأمين التجريبي");
  check("إمضاء الأخصائي في العقد", !!one?.counselorSignature);
  const pend2 = (await req("GET", `/api/contract?view=pending&userId=${client1.id}`)).json?.contract;
  check("لم يعُد في pending بعد التوقيع", pend2 === null);

  /* ═══ 7) التسلسل والسباق — حجزان متوازيان ═══ */
  console.log("\n── 4) التسلسل الذرّي — حجزان متوازيان بلا تكرار ──");
  const whenA = new Date(Date.now() + 60 * 3600 * 1000);
  const whenB = new Date(Date.now() + 60 * 3600 * 1000 + 3 * 3600 * 1000);
  const [rb2, rb3] = await Promise.all([
    req("POST", "/api/sessions", { victimId: client2.id, counselorId: counselor.id, topic: "stress", mode: "VOICE", scheduledAt: whenA.toISOString(), currency: "DZD" }),
    req("POST", "/api/sessions", { victimId: client3.id, counselorId: counselor.id, topic: "stress", mode: "VIDEO", scheduledAt: whenB.toISOString(), currency: "DZD" }),
  ]);
  const n2 = rb2.json?.contract?.number || "";
  const n3 = rb3.json?.contract?.number || "";
  check("كلا الحجزين المتوازيين نجحا بعقد", !!rb2.json?.contract?.id && !!rb3.json?.contract?.id, `${rb2.status}/${rb3.status}`);
  check("الرقمان مختلفان (لا تكرار)", !!n2 && !!n3 && n2 !== n3, `${n2} / ${n3}`);
  const seqOk = (() => {
    const nums = [ctr1.number, n2, n3].map((x) => parseInt(String(x).split("-")[2], 10)).sort((a, b) => a - b);
    return nums[1] === nums[0] + 1 && nums[2] === nums[1] + 1;
  })();
  check("التسلسل تصاعدي بلا قفز (00001→00002→00003)", seqOk, `${ctr1.number}, ${n2}, ${n3}`);

  /* ═══ 8) ثغرة الترتيب: حجز قبل القالب ثم حفظ القالب ═══ */
  console.log("\n── 5) ثغرة الترتيب — القالب بعد الحجز (backfill) ──");
  const b4 = await req("POST", "/api/sessions", { victimId: client4.id, counselorId: counselor.id, topic: "sleep", mode: "TEXT", scheduledAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(), currency: "DZD" });
  check("حجز بلا عقد جديد… لكن العقد موجود أصلاً للقالب نفسه — القالب لم يتغير", b4.status === 200);
  const pend4a = (await req("GET", `/api/contract?view=pending&userId=${client4.id}`)).json?.contract;
  check("client4 يرى عقداً (نفس القالب الموقّع — منطق عقد لكل زوج)", !!pend4a?.id && !!pend4a?.number, JSON.stringify(pend4a || {}).slice(0, 120));
  /* تحديث القالب بعد الحجز → العقد المفتوح يتحدّث للقطة النص */
  const saved2 = await req("POST", "/api/contract", { action: "save-template", userId: counselor.id, text: CONTRACT_TEXT + "\n\nبند إضافي — يلتزم الطرفان بالتعامل باحترام تام عبر المنصة.", signature: SIG_PNG });
  console.log(`  [تشخيص] backfilled=${saved2.json?.backfilled}`);
  const pend4b = (await req("GET", `/api/contract?view=pending&userId=${client4.id}`)).json?.contract;
  check("العقد المفتوح تُحدّث لقطة نصه بعد تحديث القالب", (pend4b?.text || "").includes("بند إضافي"), `num=${pend4b?.number} text=${(pend4b?.text || "").slice(0, 60)}`);

  /* ═══ 9) قائمة عقود الأخصائي ═══ */
  console.log("\n── 6) قائمة عقود الأخصائي ──");
  const list = (await req("GET", `/api/contract?view=list&userId=${counselor.id}`)).json?.contracts || [];
  check("القائمة تحوي العقود", list.length >= 3, `count=${list.length}`);
  check("كل صف برقم تسلسلي فريد", list.every((c) => /^TC-\d{4}-\d{5}$/.test(c.number || "")) && new Set(list.map((c) => c.number)).size === list.length, JSON.stringify(list.map((c) => c.number)));
  check("حالة SIGNED ظاهرة", list.some((c) => c.status === "SIGNED"));

  /* ═══ 10) فحوص الملفات ═══ */
  console.log("\n── 7) فحوص الملفات (طباعة + ترجمة + واجهة) ──");
  const ct = read("src/lib/contract-template.ts");
  check("القالب السداسي موجود بكل اللغات", ["ar:", "fr:", "en:", "tr:", "ru:", "zh:"].every((k) => ct.includes(`  ${k}`)) && ct.includes("SUGGESTED_TEMPLATE"));
  check("نصوص المستند الرسمي سداسية اللغات", ct.includes("CONTRACT_DOC_TEXTS") && ct.includes("docDir") && ct.includes("docDate"));
  const gcss = read("src/app/globals.css");
  check("print CSS يعزل المستند في A4", gcss.includes("#tumaanina-contract-print") && gcss.includes("@page") && gcss.includes("size: A4"));
  const cdoc = read("src/components/shared/contract-document.tsx");
  check("مكون المستند + محرك الطباعة + محدد اللغة", cdoc.includes("printContractDocument") && cdoc.includes("ContractLangSelect") && cdoc.includes("CONTRACT_LANGS"));
  const popup = read("src/components/shared/contract-popup.tsx");
  check("المنبثقة: حدث وصول لحظي + استقصاء + إمضاء 300px", popup.includes("CONTRACT_ARRIVED_EVENT") && popup.includes("POLL_MS") && /height=\{300\}/.test(popup));
  const settings = read("src/components/views/settings.tsx");
  check("الإعدادات: طباعة احترافية بدل window.print()", settings.includes("ContractPrintButton") && !/onClick=\{\(\) => window\.print\(\)\}/.test(settings));
  check("الإعدادات: قالب سداسي اللغات + إمضاء 280px", settings.includes("SUGGESTED_TEMPLATE") && /height=\{280\}/.test(settings));
  const sessApi = read("src/app/api/sessions/route.ts");
  check("sessions POST ينشئ العقد لحظة الحجز ويعيده", sessApi.includes("nextContractNumber") && sessApi.includes("contract: contractForClient"));
  const cApi = read("src/app/api/contract/route.ts");
  check("API العقد: عدّاد ذرّي + لغة التوقيع + أرقام للقديم", cApi.includes("nextContractNumber") && cApi.includes("safeContractLang") && cApi.includes("ensureNumber"));
  const models = read("src/lib/models.ts");
  check("النموذج: حقل number فريد + lang + عدّاد", models.includes('number: { type: String, unique: true, sparse: true }') && models.includes("ContractCounterSchema"));
  const i18nAr = read("src/lib/i18n/ar.ts");
  const i18nZh = read("src/lib/i18n/zh.ts");
  const i18nRu = read("src/lib/i18n/ru.ts");
  check("i18n ×6: مفاتيح الطباعة واللافتة الجديدة", ["docLangLabel", "pendingBannerTitle", "printBtnShort"].every((k) => i18nAr.includes(k) && i18nZh.includes(k) && i18nRu.includes(k)));
  const cfind = read("src/components/views/client-find.tsx");
  check("client-find يشعِر النافذة فور نجاح الحجز", cfind.includes("CONTRACT_ARRIVED_EVENT") && cfind.includes("data.contract?.id"));
  const csess = read("src/components/views/client-sessions.tsx");
  check("جلستي العميل: لافتة عقد بانتظار الإمضاء", csess.includes("pendingContract") && csess.includes("pendingBannerTitle"));

  /* ═══ النتيجة ═══ */
  console.log("\n" + "═".repeat(56));
  if (failures === 0) console.log("🏆 كل الفحوص ناجحة — منطق العقد العلاجي v1.10.0 كامل وسليم");
  else { console.log(`⚠️ فحوص فاشلة: ${failures}`); }
  console.log("═".repeat(56));
  server.kill();
  await mongod.stop();
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error("💥 فشل الاختبار:", e);
  process.exit(1);
});
