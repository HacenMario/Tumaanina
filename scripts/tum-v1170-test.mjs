#!/usr/bin/env node
/**
 * غرفة اختبار طمأنينة v1.19.0 — خادم إنتاجي حقيقي + MongoDB ذاكرة (منفذ 27077)
 * تثبت بنود المستخدم الجديدة:
 *  1) اختيار الباقة (Pack) في الحجز + ظهورها للعيادة + رفض فهرس خاطئ
 *  2) تعديل الإعلان المنشور من العيادة → يصل للمستخدمين تلقائياً
 *  3) رد العيادة يظهر باسم العيادة (لا «رد العيادة»)
 *  4) صفحة الإعلانات العمومية: إعلان واحد في الصفحة، مرتب من أعلى مستحقات
 *     إلى أدناها (سرّياً — لا حقل مالي في الاستجابة العمومية إطلاقاً)
 *     + pageSize للبانر العمومي
 *  5) فيديوهات المعرض: رفع/عرض/تقديم بدعم Range + حدود الحجم والعدد
 *  6) انتماء الأخصائي للعيادة + قائمة الأخصائيين في صفحة العيادة (بعد التوثيق)
 *  7) رفض الإعلانات يحجب البانر أيضاً (user-ads-status)
 *  8) الصحة 1.19.0 + استقرار
 */
import { spawn } from "child_process";
import { MongoMemoryServer } from "mongodb-memory-server";

const PORT = "3993";
const BASE = `http://127.0.0.1:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ✗ ${name} ${extra}`); }
}

async function req(method, path, body = null, headers = {}) {
  const opt = { method, headers: { "Content-Type": "application/json", ...headers } };
  if (body) opt.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opt);
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json, headers: res.headers };
}

/* mp4 مصغّر صالح البنية (ftyp + mdat) لاختبار التقديم والمدى */
function tinyMp4() {
  const ftyp = Buffer.concat([
    Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom", "ascii"),
    Buffer.from([0, 0, 2, 0]), Buffer.from("isomiso2", "ascii"),
  ]);
  const payload = Buffer.alloc(2000, 7);
  const mdatHeader = Buffer.alloc(4);
  mdatHeader.writeUInt32BE(payload.length + 8, 0);
  return Buffer.concat([ftyp, mdatHeader, Buffer.from("mdat", "ascii"), payload]);
}

const run = async () => {
  console.log("═══ طمأنينة v1.19.0 — غرفة اختبار بنود الجولة الجديدة ═══\n");
  const mongod = await MongoMemoryServer.create({ instance: { port: 27077 } });
  const server = spawn("node", ["server.js"], {
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("tumaanina-v17-reg"), ADMIN_PASSCODE: "tum-pass-17", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  server.stderr.on("data", () => {});
  let ready = false;
  for (let i = 0; i < 60; i++) {
    await wait(500);
    try {
      const h = await req("GET", "/api/health");
      if (h.json?.version === "1.19.0" && h.json?.ok) { ready = true; break; }
    } catch {}
  }
  check("الخادم جاهز ويقول 1.19.0", ready);
  if (!ready) { server.kill(); await mongod.stop(); process.exit(1); }

  const admin = await req("POST", "/api/admin", { action: "login", passcode: "tum-pass-17" });
  const ADMIN_TOKEN = admin.json?.token || "";
  check("رمز الإدارة صادر", !!ADMIN_TOKEN);
  const AH = { "x-admin-token": ADMIN_TOKEN };

  /* ══ الحسابات ══ */
  const clA = await req("POST", "/api/clinic", { action: "register", name: `عيادة الأمل ${Date.now()}`, email: `clinA${Date.now()}@t.dz`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة استرجاع عيادة أ" });
  const clB = await req("POST", "/api/clinic", { action: "register", name: `مركز الصفاء ${Date.now()}`, email: `clinB${Date.now()}@t.dz`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة استرجاع عيادة ب" });
  const uA = (await req("POST", "/api/clinic", { action: "login", email: clA.json?.user?.email || clA.json?.email, password: "pass-tumaanina-1" })).json?.user
    || (await req("POST", "/api/clinic", { action: "login", email: `clinA${Date.now()}@t.dz`, password: "pass-tumaanina-1" })).json?.user;
  /* تسجيل يعيد userId/slug — نستخرجهما مباشرة */
  const A_uid = clA.json?.userId, A_slug = clA.json?.slug;
  const B_uid = clB.json?.userId, B_slug = clB.json?.slug;
  check("عيادتان مسجلتان", !!A_uid && !!B_uid && !!A_slug && !!B_slug);

  const clientC = (await req("POST", "/api/client", {
    action: "register", pseudonym: "عميل-باقات", password: "pass-tumaanina-1",
    recoveryPhrase: "عبارة استرجاع تجريبية", gender: "male", phone: "0555111001",
  })).json?.user;
  const clientC2 = (await req("POST", "/api/client", {
    action: "register", pseudonym: "عميل-ثانٍ", password: "pass-tumaanina-1",
    recoveryPhrase: "عبارة استرجاع ثانية", gender: "female", phone: "0555111002",
  })).json?.user;
  check("عميلان مسجلان", !!clientC?.id && !!clientC2?.id);

  /* ══ 1) الباقات في الحجز ══ */
  console.log("\n── 1) الباقات (Packs): تسعير + اختيار في الحجز + ظهور للعيادة ──");
  const putPacks = await req("POST", "/api/clinic", {
    action: "update-profile", userId: A_uid,
    sessionPrice: 2500,
    packs: [
      { name: "باقة الأربع جلسات", sessions: 4, price: 8000, note: "الأكثر طلباً" },
      { name: "باقة الثماني جلسات", sessions: 8, price: 15000, note: null },
    ],
  });
  check("العيادة تحدد السعر والباقات", putPacks.json?.ok === true);

  const profA = (await req("GET", `/api/clinics/${A_slug}`)).json?.clinic;
  check("صفحة العيادة تعيد السعر والباقات", profA?.sessionPrice === 2500 && profA?.packs?.length === 2);

  const tomorrow = new Date(Date.now() + 26 * 3600 * 1000).toISOString().slice(0, 10);
  const bk1 = await req("POST", `/api/clinics/${profA.id}/book`, {
    userId: clientC.id, name: "عميل باقات", phone: "0555111001", date: tomorrow, slot: "10:00", packIndex: 1,
  });
  check("حجز بباقة (فهرس 1) نجح", bk1.json?.ok === true);

  const bookingsA = (await req("GET", `/api/clinics/bookings?userId=${A_uid}`)).json?.bookings || [];
  const withPack = bookingsA.find((b) => b.packName);
  check("الباقة ظهرت للعيادة في بطاقة الحجز (اسم/عدد/سعر)", !!withPack && withPack.packName === "باقة الثماني جلسات" && withPack.packSessions === 8 && withPack.packPrice === 15000);

  const bkBad = await req("POST", `/api/clinics/${profA.id}/book`, {
    userId: clientC2.id, name: "عميل ثان", phone: "0555111002", date: tomorrow, slot: "11:00", packIndex: 99,
  });
  check("فهرس باقة خاطئ → BAD_PACK", bkBad.status === 400 && bkBad.json?.error === "BAD_PACK");

  const bkNone = await req("POST", `/api/clinics/${profA.id}/book`, {
    userId: clientC2.id, name: "عميل ثان", phone: "0555111002", date: tomorrow, slot: "11:00",
  });
  check("حجز بلا باقة يعمل كما هو", bkNone.json?.ok === true);

  /* ══ 2) الإعلانات: ترتيب سري بالسعر + تعديل من العيادة + اسم الرد ══ */
  console.log("\n── 2) الإعلانات: إعلان كامل بالصفحة بترتيب المستحقات (سرّي) + تعديل + رد ──");
  await req("POST", "/api/ads", { action: "create", userId: A_uid, title: "إعلان عيادة الأمل", body: "نص إعلان الأمل الأول" });
  await req("POST", "/api/ads", { action: "create", userId: B_uid, title: "إعلان مركز الصفاء", body: "نص إعلان الصفاء" });
  await req("POST", "/api/ads", { action: "create", userId: A_uid, title: "إعلان مرفوض", body: "نص سيُرفض" });

  const listA = (await req("GET", `/api/ads?userId=${A_uid}&page=1&pageSize=8`)).json?.ads || [];
  const listB = (await req("GET", `/api/ads?userId=${B_uid}&page=1&pageSize=8`)).json?.ads || [];
  const ad1 = listA.find((a) => a.title === "إعلان عيادة الأمل");
  const ad2 = listB.find((a) => a.title === "إعلان مركز الصفاء");
  const ad3 = listA.find((a) => a.title === "إعلان مرفوض");
  check("ثلاثة إعلانات صيغت", !!ad1 && !!ad2 && !!ad3);

  await req("POST", "/api/ads/admin", { action: "ads-set-dues", id: ad1.id, amount: 100 }, AH);
  await req("POST", "/api/ads/admin", { action: "ads-set-dues", id: ad2.id, amount: 500 }, AH);
  await req("POST", "/api/ads/admin", { action: "ads-set-paid", id: ad1.id, paid: true, paymentNote: "REF-A" }, AH);
  await req("POST", "/api/ads/admin", { action: "ads-set-paid", id: ad2.id, paid: true, paymentNote: "REF-B" }, AH);
  const ap1 = await req("POST", "/api/ads/admin", { action: "ads-approve", id: ad1.id }, AH);
  const ap2 = await req("POST", "/api/ads/admin", { action: "ads-approve", id: ad2.id }, AH);
  check("الأدمين اعتمد الإعلانين", ap1.json?.ok === true && ap2.json?.ok === true);

  const pub1 = (await req("GET", "/api/ads?page=1")).json;
  const pub2 = (await req("GET", "/api/ads?page=2")).json;
  check("الصفحة العمومية: إعلان واحد في الصفحة", pub1?.ads?.length === 1 && pub2?.ads?.length === 1);
  check("الترتيب من أعلى مستحقات: الأغلى (500) في الصفحة الأولى", pub1?.ads?.[0]?.title === "إعلان مركز الصفاء");
  check("الأدنى (100) في الصفحة الثانية", pub2?.ads?.[0]?.title === "إعلان عيادة الأمل");
  check("عدد الصفحات = عدد الإعلانات", pub1?.pages === 2);
  const leak = JSON.stringify({ ...pub1, ...pub2 });
  check("صفر تسريب مالي في الاستجابة العمومية", !leak.includes("amountDue") && !leak.includes('"paid"') && !leak.includes("500"));

  const banner = (await req("GET", "/api/ads?pageSize=8")).json;
  check("البانر يجلب عدة إعلانات (pageSize=8)", (banner?.ads?.length || 0) === 2);

  /* تعديل الإعلان المنشور من العيادة → يصل للجمهور تلقائياً */
  const upd = await req("POST", "/api/ads", { action: "update", userId: A_uid, id: ad1.id, title: "إعلان الأمل المحدَّث", body: "نص محدّث بعد التعديل", media: [] });
  check("العيادة عدّلت إعلانها المنشور", upd.json?.ok === true && upd.json?.updated === true);
  const pubAfter = (await req("GET", "/api/ads?page=2")).json;
  check("التعديل وصل للمستخدمين تلقائياً", pubAfter?.ads?.[0]?.title === "إعلان الأمل المحدَّث");

  /* التعديل بإعلان عيادة أخرى → مرفوض */
  const updForeign = await req("POST", "/api/ads", { action: "update", userId: B_uid, id: ad1.id, title: "اختراق", body: "x", media: [] });
  check("لا تعديل لإعلان عيادة أخرى (404)", updForeign.status === 404);

  /* الإعلان المرفوض لا يُعدَّل */
  const rj = await req("POST", "/api/ads/admin", { action: "ads-reject", id: ad3.id, adminNote: "غير مطابق" }, AH);
  const updRejected = await req("POST", "/api/ads", { action: "update", userId: A_uid, id: ad3.id, title: "محاولة", body: "x", media: [] });
  check("رفض الإعلان من الأدمين ثم منع تعديله (REJECTED_LOCKED)", rj.json?.ok === true && updRejected.status === 403 && updRejected.json?.error === "REJECTED_LOCKED");

  /* رد العيادة يظهر باسمها */
  const cm = await req("POST", "/api/ads", { action: "comment", userId: clientC.id, id: ad2.id, text: "هل الأجور مناسبة؟" });
  check("تعليق العميل سُجّل", cm.json?.ok === true);
  const rep = await req("POST", "/api/ads", { action: "comment-reply", userId: B_uid, id: ad2.id, commentIndex: 0, text: "نعم، بأسعار مناسبة للجميع" });
  check("العيادة ردّت", rep.json?.ok === true);
  const pubReply = (await req("GET", "/api/ads?page=1")).json?.ads?.[0];
  check("الرد يظهر باسم العيادة صاحبة الإعلان", pubReply?.comments?.[0]?.reply?.name?.includes("الصفاء") === true && pubReply?.comments?.[0]?.reply?.text === "نعم، بأسعار مناسبة للجميع");

  /* ══ 3) فيديوهات المعرض ══ */
  console.log("\n── 3) فيديوهات المعرض: رفع + تقديم Range + حدود ──");
  const mp4 = `data:video/mp4;base64,${tinyMp4().toString("base64")}`;
  const gv1 = await req("POST", "/api/clinic", { action: "update-profile", userId: A_uid, galleryVideos: [mp4] });
  check("العيادة رفعت فيديو معرض", gv1.json?.ok === true);

  const dashA = (await req("GET", `/api/clinic?userId=${A_uid}`)).json?.clinic;
  check("اللوحة تعيد رابط الفيديو", (dashA?.galleryVideos?.length || 0) === 1 && !!dashA.galleryVideos[0].url);

  const vidUrl = dashA.galleryVideos[0].url;
  const vRes = await fetch(`${BASE}${vidUrl}`);
  check("الفيديو يُقدَّم 200 video/mp4", vRes.status === 200 && (vRes.headers.get("content-type") || "").includes("video/mp4"));
  const r206 = await fetch(`${BASE}${vidUrl}`, { headers: { Range: "bytes=0-99" } });
  check("دعم Range 206 للتمرير في المشغّل", r206.status === 206 && (r206.headers.get("content-range") || "").startsWith("bytes 0-99/"));
  await vRes.arrayBuffer?.().catch(() => {}); await r206.arrayBuffer?.().catch(() => {});

  const gal = (await req("GET", `/api/clinics/${A_slug}/gallery`)).json;
  check("معرض العيادة يعرض الصور والفيديوهات معاً", Array.isArray(gal?.images) && gal?.videos?.length === 1);

  const gv3 = await req("POST", "/api/clinic", { action: "update-profile", userId: A_uid, galleryVideos: [mp4, mp4, mp4] });
  check("رفض أكثر من فيديو اثنين (MAX_2_VIDEOS)", gv3.status === 400 && gv3.json?.error === "MAX_2_VIDEOS");
  const gvBad = await req("POST", "/api/clinic", { action: "update-profile", userId: A_uid, galleryVideos: ["data:image/png;base64,AAAA"] });
  check("رفض ملف غير فيديو (INVALID_VIDEO)", gvBad.status === 400 && gvBad.json?.error === "INVALID_VIDEO");
  const gvEmpty = await req("POST", "/api/clinic", { action: "update-profile", userId: A_uid, galleryVideos: [] });
  check("حذف كل الفيديوهات يعمل", gvEmpty.json?.ok === true && ((await req("GET", `/api/clinic?userId=${A_uid}`)).json?.clinic?.galleryVideos?.length || 0) === 0);

  /* ══ 4) انتماء الأخصائي للعيادة ══ */
  console.log("\n── 4) انتماء الأخصائي: حقل اختياري + قائمة أخصائيي العيادة ──");
  const dEmail = `doc17-${Date.now()}@t.dz`;
  await req("POST", "/api/counselor", {
    action: "register", fullName: "د. منتسب للعيادة", email: dEmail,
    password: "pass-tumaanina-1", recoveryPhrase: "عبارة اختبار الأخصائي",
    specialties: ["anxietyDepression"], languages: ["ar"], yearsExperience: 7,
    whatsapp: "213666000111", sessionPrice: 2200, clinicId: profA.id,
  });
  /* نجلب ملف الأخصائي من قائمة الإدارة (pending-counselors تعيدهم كلهم) */
  const pend = (await req("POST", "/api/admin", { action: "pending-counselors" }, AH)).json;
  const profId = (pend?.counselors || pend?.profiles || pend?.pending || []).find?.((c) => c.fullName === "د. منتسب للعيادة")?.id;
  let specBefore = (await req("GET", `/api/clinics/${A_slug}`)).json?.clinic?.specialists || [];
  check("قبل التوثيق: الأخصائي ليس في قائمة العيادة (موثّقون فقط)", !specBefore.some((s) => s.name === "د. منتسب للعيادة"));
  if (profId) {
    await req("POST", "/api/admin", { action: "verify", profileId: profId }, AH);
    specBefore = (await req("GET", `/api/clinics/${A_slug}`)).json?.clinic?.specialists || [];
    const sp = specBefore.find((s) => s.name === "د. منتسب للعيادة");
    check("بعد التوثيق: الأخصائي في صفحة عيادته بكل تفاصيله", !!sp && sp.yearsExperience === 7 && Array.isArray(sp.specialties));
  } else {
    /* احتياط: تحقق مباشر من القاعدة عبر مسار التوثيق بالبريد */
    check("قائمة الإدارة أعادت ملف الأخصائي", false);
  }

  /* ══ 5) رفض الإعلانات يحجب البانر ══ */
  console.log("\n── 5) رفض الإعلانات المدفوعة يشمل البانر الإعلاني ──");
  const st1 = (await req("GET", `/api/user-ads-status?userId=${clientC.id}`)).json;
  check("الحالة الابتدائية: غير رافض", st1?.adsOptOut === false);
  await req("POST", "/api/ads", { action: "ads-optout", userId: clientC.id, optOut: true });
  const st2 = (await req("GET", `/api/user-ads-status?userId=${clientC.id}`)).json;
  check("بعد الرفض: adsOptOut=true (البانر والعائم محجوبان معاً)", st2?.adsOptOut === true);

  /* ══ 6) استقرار سريع ══ */
  console.log("\n── 6) استقرار: 40 طلباً مختلطاً ──");
  let okN = 0;
  for (let i = 0; i < 40; i++) {
    const r = await req("GET", i % 3 === 0 ? "/api/health" : i % 3 === 1 ? "/api/ads?pageSize=8" : `/api/clinics/${A_slug}`);
    if (r.status < 500) okN++;
  }
  check("40/40 طلباً بلا أخطاء خادم", okN === 40, `(${okN})`);

  console.log(`\n═══ النتيجة: ${pass} ناجح / ${fail} فاشل ═══`);
  if (fail) { console.log("البنود الفاشلة:", fails.join(" | ")); }
  server.kill();
  await mongod.stop();
  process.exit(fail ? 1 : 0);
};

run().catch(async (e) => { console.error("CRASH:", e); process.exit(1); });
