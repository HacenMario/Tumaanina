#!/usr/bin/env node
/**
 * غرفة اختبار طمأنينة v1.19.0 — خادم إنتاجي حقيقي + MongoDB ذاكرة (منفذ 27077)
 * بنود هذه الجولة:
 *  1) الدورات الأونلاين: إنشاء الأخصائي، ظهور للعملاء حصراً، حجز مقعد مع
 *     خصم لحظي، منع التكرار، منع التجاوز للسعة، إعادة المحاولة بعد الرفض،
 *     تأكيد/رفض بالسبب (إلزامي)، إلغاء العميل يحرر المقعد، إغلاق/فتح الاشتراك،
 *     حماية السعة عند التعديل، الحذف، إشعارات فورية للطرفين
 *  2) أسعار EUR/USD اختيارية داخل الباقات (بلا تحويل) + رفض القيم الفاسدة
 *  3) صورة الأخصائي في بطاقة أخصائيي العيادة — بمعرّف الملف الصحيح (لا 404)
 *  4) حجب/إظهار التعليقات من الخادم يعمل ويُحدّث الحالة (الواجهة تتبعه فوراً)
 *  5) رفع الفيديو الدفعي ما زال يعمل (توافق) + Range 206
 *  6) الصحة 1.19.0 + استقرار
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

async function reqRaw(method, path, buf, headers = {}) {
  const opt = { method, headers: { "Content-Type": "application/octet-stream", ...headers }, body: buf };
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

const tinyImg = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const run = async () => {
  console.log("═══ طمأنينة v1.19.0 — غرفة اختبار بنود الجولة الجديدة ═══\n");
  const mongod = await MongoMemoryServer.create({ instance: { port: 27077 } });
  const server = spawn("node", ["server.js"], {
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("tumaanina-v19"), ADMIN_PASSCODE: "tum-pass-19", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  const stderrTail = [];
  server.stderr.on("data", (d) => { stderrTail.push(String(d)); if (stderrTail.length > 40) stderrTail.shift(); });

  let ready = false;
  for (let i = 0; i < 60; i++) {
    await wait(500);
    try {
      const h = await req("GET", "/api/health");
      if (h.json?.version === "1.19.0" && h.json?.ok) { ready = true; break; }
    } catch {}
  }
  check("الخادم جاهز ويقول 1.19.0", ready);
  if (!ready) { console.log("SERVER STDERR:\n" + stderrTail.join("")); server.kill(); await mongod.stop(); process.exit(1); }

  const admin = await req("POST", "/api/admin", { action: "login", passcode: "tum-pass-19" });
  const ADMIN_TOKEN = admin.json?.token || "";
  const AH = { "x-admin-token": ADMIN_TOKEN };
  check("رمز الإدارة صادر", !!ADMIN_TOKEN);

  /* ══ الحسابات ══ */
  const stamp = Date.now();
  const couns = await req("POST", "/api/counselor", {
    action: "register", fullName: `د. دورات تجريبي ${stamp}`, email: `couns${stamp}@t.dz`, password: "pass-tumaanina-1",
    recoveryPhrase: "عبارة استرجاع الأخصائي", whatsapp: "+213555000111", specialties: ["anxiety"], languages: ["ar"], yearsExperience: 8,
  });
  const C_uid = couns.json?.userId;
  check("أخصائي مسجل", !!C_uid);

  const clA = await req("POST", "/api/clinic", { action: "register", name: `عيادة الدورات ${stamp}`, email: `clinA${stamp}@t.dz`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة استرجاع العيادة" });
  const A_uid = clA.json?.userId, A_slug = clA.json?.slug;
  check("عيادة مسجلة", !!A_uid && !!A_slug);

  const c1 = (await req("POST", "/api/client", { action: "register", pseudonym: `عميل-أ-${stamp}`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة أ", gender: "male", phone: "0555000001" })).json?.user;
  const c2 = (await req("POST", "/api/client", { action: "register", pseudonym: `عميل-ب-${stamp}`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة ب", gender: "female", phone: "0555000002" })).json?.user;
  const c3 = (await req("POST", "/api/client", { action: "register", pseudonym: `عميل-ج-${stamp}`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة ج", gender: "male", phone: "0555000003" })).json?.user;
  check("ثلاثة عملاء مسجلين", !!c1?.id && !!c2?.id && !!c3?.id);

  /* توثيق الأخصائي + صورة شخصية + انتماء للعيادة */
  const pend = (await req("POST", "/api/admin", { action: "pending-counselors" }, AH)).json;
  const profId = (pend?.counselors || pend?.profiles || pend?.pending || []).find?.((c) => String(c.userId) === String(C_uid))?.id
    || (pend?.counselors || pend?.profiles || pend?.pending || [])[0]?.id;
  check("ملف الأخصائي في قائمة الإدارة", !!profId);
  await req("POST", "/api/admin", { action: "verify", profileId: profId }, AH);

  const photoData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const upPhoto = await req("POST", "/api/counselor", { action: "update-profile", userId: C_uid, photo: photoData });
  check("صورة الأخصائي تُحفظ من إعداداته", upPhoto.json?.ok === true || upPhoto.status === 200);

  /* الانتماء بمعرّف وثيقة العيادة (كما تجيبه الواجهة من قائمة العيادات) */
  const upAffil = await req("POST", "/api/counselor", { action: "update-profile", userId: C_uid, clinicId: (await req("GET", `/api/clinics/${A_slug}`)).json?.clinic?.id });
  check("انتماء الأخصائي للعيادة يُحفظ", upAffil.json?.ok === true || upAffil.status === 200);

  /* ══ 3) صورة الأخصائي في بطاقة أخصائيي العيادة ══ */
  const clinicPub = (await req("GET", `/api/clinics/${A_slug}`)).json?.clinic;
  const spec = (clinicPub?.specialists || []).find((s) => String(s.id) === String(C_uid));
  check("الأخصائي يظهر في صفحة العيادة بعد التوثيق", !!spec);
  const photoUrlOk = !!spec?.photoUrl && /\/api\/counselors\/[a-f0-9]{24}\/photo\?v=\d+/.test(spec.photoUrl);
  check(`رابط الصورة بمعرّف الملف الصحيح (${spec?.photoUrl || "—"})`, photoUrlOk);
  if (spec?.photoUrl) {
    const photoRes = await fetch(`${BASE}${spec.photoUrl}`);
    check("رابط الصورة يقدّم صورة فعلاً (لا 404)", photoRes.status === 200 && (photoRes.headers.get("content-type") || "").startsWith("image/"));
  }

  /* ══ 2) الباقات بأسعار EUR/USD اختيارية ══ */
  const packBad = await req("POST", "/api/clinic", { action: "update-profile", userId: A_uid, packs: [{ name: "باقة فاسدة", sessions: 4, price: 5000, priceEur: "abc" }] });
  check("سعر باقة فاسد يُرفض INVALID_PACK", packBad.status === 400 && packBad.json?.error === "INVALID_PACK");
  const packSet = await req("POST", "/api/clinic", { action: "update-profile", userId: A_uid, packs: [
    { name: "باقة الاطمئنان", sessions: 4, price: 8000, priceEur: 55.5, priceUsd: 60 },
    { name: "باقة متابعة", sessions: 8, price: 15000, priceEur: null, priceUsd: null },
  ]});
  check("الباقات بأسعار اختيارية تُحفظ", packSet.json?.ok === true || packSet.status === 200);
  const clinicPub2 = (await req("GET", `/api/clinics/${A_slug}`)).json?.clinic;
  const pk = clinicPub2?.packs || [];
  check("سعر EUR/USD للباقة يصل كما حُفظ بلا تحويل", pk[0]?.price === 8000 && pk[0]?.priceEur === 55.5 && pk[0]?.priceUsd === 60);
  check("باقة بلا أسعار أجنبية تعيد null", pk[1]?.priceEur === null && pk[1]?.priceUsd === null);

  /* ══ 4) حجب/إظهار تعليق — الخادم يبدّل الحالة ══ */
  const adC = await req("POST", "/api/ads", { action: "create", userId: A_uid, title: `إعلان التعليق ${stamp}`, body: "نص الإعلان", media: [tinyImg] });
  check("إعلان أُنشئ لتجربة التعليقات", adC.json?.ok === true);
  const adsList = (await req("GET", `/api/ads?userId=${A_uid}`)).json?.ads || [];
  const adId = adsList[0]?.id;
  const adAdmin = await req("POST", "/api/ads/admin", { action: "ads-set-dues", id: adId, amount: 100 }, AH);
  await req("POST", "/api/ads/admin", { action: "ads-set-paid", id: adId, paid: true }, AH);
  await req("POST", "/api/ads/admin", { action: "ads-approve", id: adId }, AH);
  const cmt = await req("POST", "/api/ads", { action: "comment", userId: c1.id, id: adId, text: "تعليق تجريبي للإخفاء" });
  check("عميل علّق على الإعلان", cmt.json?.ok === true || cmt.status === 200);
  const hide1 = await req("POST", "/api/ads", { action: "comment-hide", userId: A_uid, id: adId, commentIndex: 0, hidden: true });
  const afterHide = (await req("GET", `/api/ads?userId=${A_uid}`)).json?.ads?.[0]?.comments?.[0];
  check("الحجب يعمل من الخادم (hidden=true)", hide1.json?.ok === true && afterHide?.hidden === true);
  const hide2 = await req("POST", "/api/ads", { action: "comment-hide", userId: A_uid, id: adId, commentIndex: 0, hidden: false });
  const afterUnhide = (await req("GET", `/api/ads?userId=${A_uid}`)).json?.ads?.[0]?.comments?.[0];
  check("الإظهار يعمل من الخادم (hidden=false)", hide2.json?.ok === true && afterUnhide?.hidden === false);

  /* ══ 5) رفع الفيديو الدفعي + Range — توافق ما زال قائماً ══ */
  const st = await req("POST", "/api/media", { userId: A_uid, op: "start", mime: "video/mp4", name: "v19.mp4", size: 4000 });
  check("جلسة رفع تبدأ", !!st.json?.uploadId);
  const ch1 = await reqRaw("POST", `/api/media?op=chunk&uid=${st.json.uploadId}&idx=0`, tinyMp4(3, 2000));
  const ch2 = await reqRaw("POST", `/api/media?op=chunk&uid=${st.json.uploadId}&idx=1`, tinyMp4(5, 2000));
  const cm = await req("POST", "/api/media", { userId: A_uid, op: "commit", uploadId: st.json.uploadId });
  check("دفعتان → GridFS commit", ch1.json?.ok && ch2.json?.ok && !!cm.json?.url);
  const rangeRes = await fetch(`${BASE}${cm.json.url}`, { headers: { Range: "bytes=0-99" } });
  check("Range 206 يعمل على ملف GridFS", rangeRes.status === 206 && (rangeRes.headers.get("content-range") || "").startsWith("bytes 0-99/"));
  await rangeRes.arrayBuffer();

  /* ══ 1) الدورات الأونلاين ══ */
  /* ظهور للعملاء حصراً */
  const anon = await req("GET", "/api/courses");
  check("الدورات ترفض الزائر غير المسجل (403)", anon.status === 403);
  const asClinic = await req("GET", `/api/courses?userId=${A_uid}`);
  check("الدورات ترفض حساب العيادة (403)", asClinic.status === 403);
  const asCounselor = await req("GET", `/api/courses?userId=${C_uid}`);
  check("الدورات ترفض حساب الأخصائي (403)", asCounselor.status === 403);

  /* إنشاء الدورة */
  const createByClient = await req("POST", "/api/courses", { userId: c1.id, title: "دورة مسروقة", price: 1, capacity: 5 });
  check("العميل لا يستطيع إنشاء دورة (401)", createByClient.status === 401);
  const createOk = await req("POST", "/api/courses", { userId: C_uid, title: "إدارة القلق خطوة بخطوة", description: "دورة أونلاين لمدة أسبوعين", price: 1500, capacity: 2, startsAt: new Date(Date.now() + 7 * 86400000).toISOString() });
  check("الأخصائي الموثّق ينشئ دورة", createOk.json?.ok === true && !!createOk.json?.course?.id);
  const courseId = createOk.json?.course?.id;
  check("الدورة الجديدة سعة 2 والمتبقي 2", createOk.json?.course?.capacity === 2 && createOk.json?.course?.remaining === 2);

  /* حجوزات العملاء */
  const e1 = await req("POST", `/api/courses/${courseId}/enroll`, { userId: c1.id });
  check("العميل أ يحجز مقعداً (pending)", e1.json?.ok === true && e1.json?.remaining === 1);
  const e1b = await req("POST", `/api/courses/${courseId}/enroll`, { userId: c1.id });
  check("الحجز المكرر مرفوض ALREADY_BOOKED", e1b.status === 409 && e1b.json?.error === "ALREADY_BOOKED");
  const e2 = await req("POST", `/api/courses/${courseId}/enroll`, { userId: c2.id });
  check("العميل ب يحجز آخر مقعد (remaining=0)", e2.json?.ok === true && e2.json?.remaining === 0);
  const e3 = await req("POST", `/api/courses/${courseId}/enroll`, { userId: c3.id });
  check("تجاوز السعة مرفوض COURSE_FULL", e3.status === 409 && e3.json?.error === "COURSE_FULL");

  /* حالة العميل في القائمة + myEnrollments */
  const list1 = (await req("GET", `/api/courses?userId=${c1.id}`)).json;
  const mine1 = list1?.courses?.find((x) => x.id === courseId);
  check("القائمة تعيد myStatus=pending لصاحب الحجز", mine1?.myStatus === "pending" && mine1?.taken === 2 && mine1?.remaining === 0);
  check("myEnrollments تتضمن حجز العميل", (list1?.myEnrollments || []).some((m) => m.courseId === courseId && m.status === "pending"));

  /* إشعارات فورية — الأخصائي باسم العميل + العميل باستلام الحجز */
  const nSpec = (await req("GET", `/api/notifications?userId=${C_uid}`)).json?.notifications || [];
  check("إشعار حجز مقعد وصل للأخصائي (باسم العميل)", nSpec.some((n) => n.key === "courseNewBooking" && (n.body || "").includes("عميل-أ-")));
  const nC1 = (await req("GET", `/api/notifications?userId=${c1.id}`)).json?.notifications || [];
  check("إشعار استلام الحجز وصل للعميل", nC1.some((n) => n.key === "coursePending"));
  const nC2 = (await req("GET", `/api/notifications?userId=${c2.id}`)).json?.notifications || [];
  check("إشعار استلام الحجز وصل للعميل ب", nC2.some((n) => n.key === "coursePending"));

  /* قرارات الأخصائي — من قائمة دوراته */
  const mine = (await req("GET", `/api/counselor/courses?userId=${C_uid}`)).json?.courses || [];
  const myCourse = mine.find((x) => x.id === courseId);
  check("دورة الأخصائي تظهر في قائمته مع ملتحقيها", !!myCourse && myCourse.enrollments.length === 2);
  const enA = myCourse.enrollments.find((x) => x.clientName?.includes("عميل-أ-"));
  const enB = myCourse.enrollments.find((x) => x.clientName?.includes("عميل-ب-"));

  const rejectNoReason = await req("POST", `/api/courses/enrollments/${enA.id}`, { userId: C_uid, action: "reject" });
  check("الرفض بلا سبب مرفوض REASON_REQUIRED", rejectNoReason.status === 400 && rejectNoReason.json?.error === "REASON_REQUIRED");
  const rejectOk = await req("POST", `/api/courses/enrollments/${enA.id}`, { userId: C_uid, action: "reject", reason: "المجموعة مخصصة للنساء" });
  check("الرفض بالسبب ينجح", rejectOk.json?.ok === true);
  const nC1b = (await req("GET", `/api/notifications?userId=${c1.id}`)).json?.notifications || [];
  check("إشعار الرفض بالسبب وصل للعميل أ", nC1b.some((n) => n.key === "courseRejected" && (n.body || "").includes("المجموعة مخصصة للنساء")));

  const confirmOk = await req("POST", `/api/courses/enrollments/${enB.id}`, { userId: C_uid, action: "confirm" });
  check("تأكيد العميل ب ينجح", confirmOk.json?.ok === true);
  const nC2b = (await req("GET", `/api/notifications?userId=${c2.id}`)).json?.notifications || [];
  check("إشعار التأكيد وصل للعميل ب", nC2b.some((n) => n.key === "courseConfirmed"));
  const confirmAgain = await req("POST", `/api/courses/enrollments/${enB.id}`, { userId: C_uid, action: "reject", reason: "x" });
  check("قرار مكرر مرفوض ALREADY_DECIDED", confirmAgain.status === 409);

  /* الرفض حرر مقعداً → العميل ج يستطيع الحجز الآن */
  const e3b = await req("POST", `/api/courses/${courseId}/enroll`, { userId: c3.id });
  check("المقعد المحرر بعد الرفض يُحجز (العدّ لحظي)", e3b.json?.ok === true && e3b.json?.remaining === 0);

  /* إلغاء العميل ب يحرر مقعده ويُبلغ الأخصائي */
  const cancelB = await req("POST", `/api/courses/enrollments/${enB.id}`, { userId: c2.id, action: "cancel" });
  check("العميل ب يلغي حجز confirmed", cancelB.json?.ok === true);
  const nSpecB = (await req("GET", `/api/notifications?userId=${C_uid}`)).json?.notifications || [];
  check("إشعار الإلغاء وصل للأخصائي", nSpecB.some((n) => n.key === "courseCancelled"));
  /* محاولة إلغاء من طرف غريب */
  const cancelForeign = await req("POST", `/api/courses/enrollments/${enA.id}`, { userId: c2.id, action: "cancel" });
  check("إلغاء حجز غيره مرفوض", cancelForeign.status === 403);

  /* العميل أ بعد رفضه يعيد الحجز بنجاح (المرفوض لا يمنع) */
  const e1c = await req("POST", `/api/courses/${courseId}/enroll`, { userId: c1.id });
  check("إعادة الحجز بعد الرفض تنجح", e1c.json?.ok === true);

  /* إغلاق الاشتراك يمنع الحجز الجديد */
  const closeC = await req("PATCH", `/api/courses/${courseId}`, { userId: C_uid, action: "close" });
  check("إغلاق الاشتراك ينجح", closeC.json?.ok === true);
  const c4 = (await req("POST", "/api/client", { action: "register", pseudonym: `عميل-د-${stamp}`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة د", gender: "female", phone: "0555000004" })).json?.user;
  const e4 = await req("POST", `/api/courses/${courseId}/enroll`, { userId: c4.id });
  check("الحجز في دورة مغلقة مرفوض COURSE_CLOSED", e4.status === 409 && e4.json?.error === "COURSE_CLOSED");
  const reopenC = await req("PATCH", `/api/courses/${courseId}`, { userId: C_uid, action: "open" });
  check("إعادة فتح الاشتراك تعمل", reopenC.json?.ok === true);

  /* حماية السعة عند التعديل */
  const capBad = await req("PATCH", `/api/courses/${courseId}`, { userId: C_uid, action: "update", title: "إدارة القلق خطوة بخطوة", price: 1500, capacity: 0 });
  check("سعة أقل من المحجوز مرفوضة CAPACITY_MIN", capBad.status === 400 && capBad.json?.error === "CAPACITY_MIN");
  const upd = await req("PATCH", `/api/courses/${courseId}`, { userId: C_uid, action: "update", title: "إدارة القلق خطوة بخطوة (محدثة)", price: 2000, capacity: 5 });
  check("تحديث عادي للدورة ينجح", upd.json?.ok === true);

  /* صاحب الدورة لا يحجز في دورته + قائمة دورات غير المالك مرفوضة */
  const selfEnroll = await req("POST", `/api/courses/${courseId}/enroll`, { userId: C_uid });
  check("الأخصائي لا يحجز في دورته", selfEnroll.status === 403);
  const foreignDecide = await req("POST", `/api/ads`, { action: "comment-hide", userId: C_uid, id: adId, commentIndex: 0, hidden: true });
  check("أخصائي لا يحجب تعليقات إعلان عيادة (401)", foreignDecide.status === 401);

  /* حذف الدورة */
  const c5 = (await req("POST", "/api/client", { action: "register", pseudonym: `عميل-هـ-${stamp}`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة هـ", gender: "male", phone: "0555000005" })).json?.user;
  const c2r = (await req("GET", `/api/courses?userId=${c5.id}`)).json?.courses || [];
  const delCourse = c2r[0];
  const e5 = await req("POST", `/api/courses/${courseId}/enroll`, { userId: c5.id });
  check("العميل هـ يحجز قبل الحذف (سعة مرفوعة)", e5.json?.ok === true);
  const del = await req("DELETE", `/api/courses/${courseId}?userId=${C_uid}`);
  check("حذف الدورة ينجح", del.json?.ok === true);
  const mineAfterDel = (await req("GET", `/api/counselor/courses?userId=${C_uid}`)).json?.courses || [];
  check("الدورة المحذوفة غابت عن قائمة صاحبها", !mineAfterDel.some((x) => x.id === courseId));
  const enrollDeleted = await req("POST", `/api/courses/${courseId}/enroll`, { userId: c5.id });
  check("الحجز في دورة محذوفة مرفوض 404", enrollDeleted.status === 404);

  /* تراجع سريع: حجز عيادة عادي لم يُمس */
  const profC = (await req("GET", `/api/clinics/${A_slug}`)).json?.clinic;
  const tomorrow = new Date(Date.now() + 26 * 3600 * 1000).toISOString().slice(0, 10);
  const bk = await req("POST", `/api/clinics/${profC.id}/book`, { userId: c1.id, name: "عميل أ", phone: "0555000001", date: tomorrow, slot: "10:00", packIndex: 0 });
  check("حجز باقة العيادة يعمل كما كان (تراجع)", bk.json?.ok === true);

  /* استقرار الواجهة العمومية */
  const hp = await req("GET", "/");
  check("الصفحة الرئيسية تعمل", hp.status === 200);

  console.log(`\n═══ النتيجة: ${pass} نجاح / ${fail} فشل ═══`);
  if (fails.length) { console.log("بنود فاشلة:"); fails.forEach((f) => console.log("  -", f)); }
  server.kill();
  await mongod.stop();
  process.exit(fail ? 1 : 0);
};

run().catch((e) => { console.error("CRASH:", e); process.exit(1); });
