#!/usr/bin/env node
/**
 * غرفة اختبار طمأنينة v1.20.0 — خادم إنتاجي حقيقي + MongoDB ذاكرة (منفذ 27077)
 * بنود هذه الجولة:
 *  1) الإشعارات مضمونة (منتظَرة await): حجز عيادة → صاحبها، تأكيد → العميل،
 *     إعلان جديد → الإدارة، تعليق → صاحب العيادة، رد → المعلّق
 *  2) مشاهدات الإعلان: تسجيل مشاهدة فريدة للمسجّلين + عدّاد للزوار،
 *     قائمة أسماء المشاهدين لصاحبة العيادة حصراً (رفض غير المالك)
 *  3) الدورات للعيادات والإدارة: العيادة تنشئ دورة، كل الأدوار تتصفح،
 *     الأخصائي يحجز في دورة عيادة، الإشعارات بالاتجاه الصحيح، الإدارة تتصفح
 *  4) الفيديو: رفع دفعي → GridFS → تقديم Range 206 مع Content-Type
 *     video/mp4 و Content-Disposition inline (نمط sanedni)
 *  5) الصحة 1.20.0 + استقرار 60 طلباً
 */
import { spawn } from "child_process";
import { MongoMemoryServer } from "mongodb-memory-server";

const PORT = "3994";
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

function tinyMp4(fillByte = 7, size = 2000) {
  const ftyp = Buffer.concat([
    Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom", "ascii"),
    Buffer.from([0, 0, 2, 0]), Buffer.from("isomiso2", "ascii"),
  ]);
  const payload = Buffer.alloc(size, fillByte);
  const mdatHeader = Buffer.alloc(4);
  mdatHeader.writeUInt32BE(payload.length + 8, 0);
  return Buffer.concat([ftyp, mdatHeader, Buffer.from("mdat", "ascii"), payload]);
}

const run = async () => {
  console.log("═══ طمأنينة v1.20.0 — غرفة اختبار بنود الجولة ═══\n");
  const mongod = await MongoMemoryServer.create({ instance: { port: 27077 } });
  const server = spawn("node", ["server.js"], {
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("tumaanina-v20"), ADMIN_PASSCODE: "tum-pass-20", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  const stderrTail = [];
  server.stderr.on("data", (d) => { stderrTail.push(String(d)); if (stderrTail.length > 40) stderrTail.shift(); });

  let ready = false;
  for (let i = 0; i < 60; i++) {
    await wait(500);
    try {
      const h = await req("GET", "/api/health");
      if (h.json?.version === "1.20.0" && h.json?.ok) { ready = true; break; }
    } catch {}
  }
  check("الخادم جاهز ويقول 1.20.0", ready);
  if (!ready) { console.log("SERVER STDERR:\n" + stderrTail.join("")); server.kill(); await mongod.stop(); process.exit(1); }

  const admin = await req("POST", "/api/admin", { action: "login", passcode: "tum-pass-20" });
  const ADMIN_TOKEN = admin.json?.token || "";
  /* v2.7.0: تسجيل دخول الإدارة ينشئ مستند User حقيقي بدور ADMIN — الإشعارات تصل له */
  const ADMIN_UID = admin.json?.user?.id || "admin";
  const AH = { "x-admin-token": ADMIN_TOKEN };
  check("رمز الإدارة صادر", !!ADMIN_TOKEN);
  check("حساب إدارة حقيقي بمستند User", /^[a-f0-9]{24}$/i.test(ADMIN_UID));

  /* ══ الحسابات ══ */
  const stamp = Date.now();
  const clA = await req("POST", "/api/clinic", { action: "register", name: `عيادة الإشعارات ${stamp}`, email: `clinA${stamp}@t.dz`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة استرجاع أ" });
  const A_uid = clA.json?.userId, A_slug = clA.json?.slug;
  check("عيادة (أ) مسجلة", !!A_uid && !!A_slug);

  const clB = await req("POST", "/api/clinic", { action: "register", name: `عيادة أخرى ${stamp}`, email: `clinB${stamp}@t.dz`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة استرجاع ب" });
  const B_uid = clB.json?.userId;
  check("عيادة (ب) مسجلة", !!B_uid);

  const couns = await req("POST", "/api/counselor", {
    action: "register", fullName: `د. إشعارات ${stamp}`, email: `couns${stamp}@t.dz`, password: "pass-tumaanina-1",
    recoveryPhrase: "عبارة استرجاع الأخصائي", whatsapp: "+213555000111", specialties: ["anxiety"], languages: ["ar"], yearsExperience: 6,
  });
  const C_uid = couns.json?.userId;
  check("أخصائي مسجل", !!C_uid);

  const c1 = (await req("POST", "/api/client", { action: "register", pseudonym: `مشاهد-أ-${stamp}`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة أ", gender: "male", phone: "0555000001" })).json?.user;
  const c2 = (await req("POST", "/api/client", { action: "register", pseudonym: `مشاهد-ب-${stamp}`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة ب", gender: "female", phone: "0555000002" })).json?.user;
  check("عميلان مسجلان", !!c1?.id && !!c2?.id);

  /* ══ 1) الإشعارات المضمونة — حجز العيادة ══ */
  const clinicDoc = (await req("GET", `/api/clinics/${A_slug}`)).json?.clinic;
  check("صفحة العيادة تعيد بياناتها", !!clinicDoc?.id);
  const today = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const book = await req("POST", `/api/clinics/${clinicDoc.id}/book`, { userId: c1.id, name: "مشاهد أ", phone: "0555000001", date: today, slot: "10:00", reason: "استشارة" });
  check("العميل يحجز موعداً حضورياً", book.json?.ok === true, JSON.stringify(book.json));

  const nOwner = (await req("GET", `/api/notifications?userId=${A_uid}`)).json?.notifications || [];
  check("إشعار الحجز وصل لصاحبة العيادة (منتظَر لا مقتول)", nOwner.some((n) => n.key === "clinicBookingNew" && (n.body || "").includes("مشاهد أ")));

  const bkList = (await req("GET", `/api/clinics/bookings?userId=${A_uid}`)).json?.bookings || [];
  const bk = bkList[0];
  check("الحجز في قائمة العيادة", !!bk?.id);
  await req("POST", "/api/clinics/bookings", { userId: A_uid, id: bk.id, action: "confirm" });
  const nC1 = (await req("GET", `/api/notifications?userId=${c1.id}`)).json?.notifications || [];
  check("إشعار التأكيد وصل للعميل", nC1.some((n) => n.key === "clinicBookingConfirmed"));

  /* ══ 2) الإعلان: إنشاء → إشعار الإدارة → مشاهدة → قائمة المشاهدين → تعليق → رد ══ */
  const adCreate = await req("POST", "/api/ads", { action: "create", userId: A_uid, title: "إعلان الإشعارات", body: "جلسات دعم نفسي إضافية هذا الشهر" });
  check("العيادة تنشئ إعلاناً", adCreate.json?.ok === true);

  /* الإدارة تُبلَّغ: الإشعار يُحفظ للمعرّف الاصطناعي admin (لا مستند User أدمن) */
  const nAdmin = (await req("GET", `/api/notifications?userId=${ADMIN_UID}`)).json?.notifications || [];
  check("إشعار إعلان جديد وصل للإدارة (clinicAdSubmitted)", nAdmin.some((n) => n.key === "clinicAdSubmitted" && (n.body || "").includes("إعلان الإشعارات")));

  /* الإدارة تحدد المستحقات وتؤكد السداد ثم تعتمد النشر (السير الواقعي) */
  const adsList = (await req("POST", "/api/ads/admin", { action: "ads-list" }, AH)).json?.ads || [];
  const adId2 = adsList.find((x) => x.title === "إعلان الإشعارات")?.id;
  check("الإعلان موجود في لوحة الإدارة", !!adId2);
  await req("POST", "/api/ads/admin", { action: "ads-set-dues", id: adId2, amount: 500 }, AH);
  await req("POST", "/api/ads/admin", { action: "ads-set-paid", id: adId2, paid: true, paymentNote: "إيصال 1" }, AH);
  const appr = await req("POST", "/api/ads/admin", { action: "ads-approve", id: adId2, paymentNote: "إيصال 1" }, AH);
  check("الإدارة تعتمد النشر", appr.json?.ok === true);

  /* مشاهدة فريدة للمسجّلين + عدّاد للزوار */
  const v1 = await req("POST", "/api/ads", { action: "view", userId: c1.id, id: adId2 });
  check("مشاهدة العميل أ تُحتسب", v1.json?.ok && v1.json?.counted === true);
  const v1b = await req("POST", "/api/ads", { action: "view", userId: c1.id, id: adId2 });
  check("مشاهدة العميل أ الثانية لا تُكرر", v1b.json?.ok && v1b.json?.counted === false);
  await req("POST", "/api/ads", { action: "view", userId: c2.id, id: adId2 });
  await req("POST", "/api/ads", { action: "view", userId: null, id: adId2 }); // زائر

  /* قائمة المشاهدين — لصاحبة العيادة حصراً */
  const viewersOwner = (await req("GET", `/api/ads/viewers?id=${adId2}&userId=${A_uid}`)).json;
  check("قائمة المشاهدين تعيد الاسمين المسجلين", viewersOwner?.viewers?.length === 2
    && viewersOwner.viewers.some((v) => (v.name || "").includes("مشاهد-أ"))
    && viewersOwner.viewers.some((v) => (v.name || "").includes("مشاهد-ب")));
  check("الزائر العابر يُعدّ في anonymous فقط", viewersOwner?.anonymous === 1 && viewersOwner?.views === 3);
  const viewersOther = await req("GET", `/api/ads/viewers?id=${adId2}&userId=${B_uid}`);
  check("عيادة أخرى لا ترى قائمة مشاهدين (404)", viewersOther.status === 404);
  const viewersClient = await req("GET", `/api/ads/viewers?id=${adId2}&userId=${c1.id}`);
  check("عميل لا يرى قائمة المشاهدين (401)", viewersClient.status === 401);

  /* تعليق العميل → إشعار العيادة، ورد العيادة → إشعار المعلّق */
  await req("POST", "/api/ads", { action: "comment", userId: c2.id, id: adId2, text: "هل الجلسات متاحة مساءً؟" });
  const nOwner2 = (await req("GET", `/api/notifications?userId=${A_uid}`)).json?.notifications || [];
  check("إشعار التعليق وصل لصاحبة العيادة (clinicAdComment)", nOwner2.some((n) => n.key === "clinicAdComment" && (n.body || "").includes("مشاهد-ب")));

  const myAdsOwner = (await req("GET", `/api/ads?userId=${A_uid}`)).json?.ads || [];
  const myAd = myAdsOwner.find((a) => a.id === adId2);
  check("التعليق ظاهر لصاحبة العيادة", (myAd?.comments || []).length === 1);
  await req("POST", "/api/ads", { action: "comment-reply", userId: A_uid, id: adId2, commentIndex: 0, text: "نعم، حتى الثامنة مساءً" });
  const nC2 = (await req("GET", `/api/notifications?userId=${c2.id}`)).json?.notifications || [];
  check("إشعار الرد وصل للمعلّق (clinicAdReply)", nC2.some((n) => n.key === "clinicAdReply" && (n.body || "").includes("عيادة الإشعارات")));

  /* ══ 3) الدورات للعيادات والإدارة ══ */
  const clCourse = await req("POST", "/api/courses", { userId: A_uid, title: "دورة الصمود النفسي للعيادة", description: "دورة تقدمها العيادة", price: 2500, capacity: 3 });
  check("العيادة تنشئ دورة", clCourse.json?.ok === true && !!clCourse.json?.course?.id);
  const courseClId = clCourse.json?.course?.id;
  check("تسلسل الدورة يظهر اسم العيادة ودورها", clCourse.json?.course?.specialist?.name?.includes("عيادة الإشعارات") && clCourse.json?.course?.specialist?.role === "CLINIC");

  const listForCounselor = await req("GET", `/api/courses?userId=${C_uid}`);
  check("الأخصائي يتصفح قائمة الدورات (بدون حاجة عميل)", listForCounselor.status === 200 && (listForCounselor.json?.courses || []).some((x) => x.id === courseClId));
  const listForClinicB = await req("GET", `/api/courses?userId=${B_uid}`);
  check("عيادة أخرى تتصفح قائمة الدورات", listForClinicB.status === 200);

  /* الأخصائي يحجز في دورة العيادة — إشعار الاتجاه الصحيح */
  const eByCouns = await req("POST", `/api/courses/${courseClId}/enroll`, { userId: C_uid });
  check("الأخصائي يحجز مقعداً في دورة العيادة", eByCouns.json?.ok === true && eByCouns.json?.remaining === 2);
  const nOwner3 = (await req("GET", `/api/notifications?userId=${A_uid}`)).json?.notifications || [];
  check("إشعار الحجز وصل للعيادة صاحبة الدورة", nOwner3.some((n) => n.key === "courseNewBooking" && (n.body || "").includes("د. إشعارات")));
  const nCouns = (await req("GET", `/api/notifications?userId=${C_uid}`)).json?.notifications || [];
  check("إشعار الاستلام وصل للأخصائي المحجز", nCouns.some((n) => n.key === "coursePending"));

  /* صاحب الدورة لا يحجز في دورته */
  const eOwner = await req("POST", `/api/courses/${courseClId}/enroll`, { userId: A_uid });
  check("صاحبة العيادة لا تحجز في دورتها (403)", eOwner.status === 403);

  /* قرار العيادة: تأكيد ثم إلغاء الأخصائي */
  const clList = (await req("GET", `/api/counselor/courses?userId=${A_uid}`)).json?.courses || [];
  const clCourseRow = clList.find((x) => x.id === courseClId);
  check("دورة العيادة في قائمتها مع الملتحقين", !!clCourseRow && clCourseRow.enrollments.length === 1);
  const enCouns = clCourseRow.enrollments[0];
  const confirmByClinic = await req("POST", `/api/courses/enrollments/${enCouns.id}`, { userId: A_uid, action: "confirm" });
  check("العيادة تؤكد الحجز", confirmByClinic.json?.ok === true);
  const nCouns2 = (await req("GET", `/api/notifications?userId=${C_uid}`)).json?.notifications || [];
  check("إشعار التأكيد وصل للأخصائي", nCouns2.some((n) => n.key === "courseConfirmed"));
  const cancelByCouns = await req("POST", `/api/courses/enrollments/${enCouns.id}`, { userId: C_uid, action: "cancel" });
  check("الأخصائي يلغي حجزه", cancelByCouns.json?.ok === true);
  const nOwner4 = (await req("GET", `/api/notifications?userId=${A_uid}`)).json?.notifications || [];
  check("إشعار الإلغاء وصل للعيادة", nOwner4.some((n) => n.key === "courseCancelled"));

  /* إدارة الدورة: إغلاق/فتح/حذف من صاحبة العيادة */
  const closeCl = await req("PATCH", `/api/courses/${courseClId}`, { userId: A_uid, action: "close" });
  check("العيادة تغلق دورتها", closeCl.json?.ok === true);
  const enrollClosed = await req("POST", `/api/courses/${courseClId}/enroll`, { userId: c1.id });
  check("الحجز في الدورة المغلقة مرفوض", enrollClosed.status === 409 && enrollClosed.json?.error === "COURSE_CLOSED");
  await req("PATCH", `/api/courses/${courseClId}`, { userId: A_uid, action: "open" });
  const reopen = await req("POST", `/api/courses/${courseClId}/enroll`, { userId: c1.id });
  check("بعد الفتح يعود الحجز ممكناً", reopen.json?.ok === true);
  const delOther = await req("DELETE", `/api/courses/${courseClId}?userId=${B_uid}`);
  check("عيادة أخرى لا تحذف دورة غيرها (404)", delOther.status === 404);
  const delCl = await req("DELETE", `/api/courses/${courseClId}?userId=${A_uid}`);
  check("العيادة تحذف دورتها", delCl.json?.ok === true);

  /* ══ 4) الفيديو: GridFS + Range + ترويسات نمط sanedni ══ */
  const st = await req("POST", "/api/media", { userId: A_uid, op: "start", mime: "video/mp4", name: "v.mp4", size: 4000 });
  const buf = tinyMp4(9, 4000);
  const ch = await fetch(`${BASE}/api/media?op=chunk&uid=${st.json.uploadId}&idx=0`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: buf });
  const cm = await req("POST", "/api/media", { userId: A_uid, op: "commit", uploadId: st.json.uploadId });
  check("رفع دفعي → GridFS commit", ch.ok && cm.json?.ok && !!cm.json?.url);
  const vr = await fetch(`${BASE}${cm.json.url}`, { headers: { Range: "bytes=0-99" } });
  const vh = await vr.arrayBuffer();
  check("Range 206 مع Content-Range صحيح", vr.status === 206 && (vr.headers.get("content-range") || "").startsWith("bytes 0-99/"));
  check("ترويسة Content-Type فيديو صريحة", (vr.headers.get("content-type") || "").startsWith("video/"));
  check("ترويسة inline لمنع التنزيل القسري", (vr.headers.get("content-disposition") || "").includes("inline"));
  check("قبول المحتوى أول 100 بايت مطابق", Buffer.from(vh).equals(buf.subarray(0, 100)));

  /* ══ 5) استقرار ══ */
  let okAll = 0;
  const targets = ["/api/health", "/api/ads?page=1", `/api/courses?userId=${c1.id}`, `/api/clinics/${A_slug}`, "/api/notifications?userId=admin"];
  for (let i = 0; i < 60; i++) {
    const t0 = targets[i % targets.length];
    try {
      const r = await fetch(`${BASE}${t0}`);
      if (r.status < 500) okAll++;
    } catch {}
  }
  check("استقرار 60/60 طلباً بلا أخطاء خادم", okAll === 60, `(${okAll}/60)`);

  console.log(`\n═══ النتيجة: ${pass} نجح / ${fail} فشل ═══`);
  if (fail) { console.log("البنود الفاشلة:\n - " + fails.join("\n - ")); }

  server.kill();
  await mongod.stop();
  process.exit(fail ? 1 : 0);
};

run().catch((e) => { console.error("FATAL:", e); process.exit(1); });
