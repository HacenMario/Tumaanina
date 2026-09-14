#!/usr/bin/env node
/**
 * غرفة اختبار طمأنينة v1.18.0 — خادم إنتاجي حقيقي + MongoDB ذاكرة (منفذ 27077)
 * تثبت بنود المستخدم الجديدة:
 *  1) رفع الفيديو بلا حد للحجم: جلسات ودفعات /api/media → GridFS
 *     + تقديم بالبثّ مع Range (206) + حماية الحساب (غير العيادة مرفوض)
 *  2) الإعلان بالفيديو: mediaKinds صحيح، الصورة المصغّرة imageUrl صورة لا فيديو،
 *     مسار وسائط الإعلان يحوّل (307) لمرجع GridFS، الفيديو يعمل بالمدى
 *  3) تعديل/حذف الإعلان ينظّف ملفات GridFS اليتيمة (404 بعد الحذف)
 *  4) فيديوهات المعرض: بلا حد حجم (مرجع GridFS)، حد العدد 2، ترحيل القديم
 *     (data:video وروابط المعرض القديمة) تلقائياً إلى GridFS عند الحفظ
 *  5) أسعار EUR/USD: يحددهما صاحب العيادة (اختياريان) ويظهران كما هما
 *     — بلا أي تحويل (لا حقل مشتق في أي استجابة عمومية)
 *  6) انتماء الأخصائي للعيادة قابل للتعديل من الإعدادات (تعيين/استقلال/رفض معرّف فاسد)
 *  7) فلاتر حالات الحجوزات: بيانات الحجوزات مع الحالات تصل كما ينبغي للواجهة
 *  8) الصحة 1.18.0 + استقرار
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

async function reqRaw(method, path, buf, headers = {}) {
  const opt = { method, headers: { "Content-Type": "application/octet-stream", ...headers }, body: buf };
  const res = await fetch(`${BASE}${path}`, opt);
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json, headers: res.headers };
}

/* mp4 مصغّر صالح البنية (ftyp + mdat) */
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
  console.log("═══ طمأنينة v1.18.0 — غرفة اختبار بنود الجولة الجديدة ═══\n");
  const mongod = await MongoMemoryServer.create({ instance: { port: 27077 } });
  const server = spawn("node", ["server.js"], {
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("tumaanina-v18"), ADMIN_PASSCODE: "tum-pass-18", NODE_ENV: "production" },
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
  check("الخادم جاهز ويقول 1.18.0", ready);
  if (!ready) { console.log("SERVER STDERR:\n" + stderrTail.join("")); server.kill(); await mongod.stop(); process.exit(1); }

  const admin = await req("POST", "/api/admin", { action: "login", passcode: "tum-pass-18" });
  const ADMIN_TOKEN = admin.json?.token || "";
  const AH = { "x-admin-token": ADMIN_TOKEN };
  check("رمز الإدارة صادر", !!ADMIN_TOKEN);

  /* ══ الحسابات ══ */
  const stamp = Date.now();
  const clA = await req("POST", "/api/clinic", { action: "register", name: `عيادة الأمل ${stamp}`, email: `clinA${stamp}@t.dz`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة استرجاع عيادة أ" });
  const A_uid = clA.json?.userId, A_slug = clA.json?.slug;
  check("عيادة مسجلة", !!A_uid && !!A_slug);

  const couns = await req("POST", "/api/counselor", {
    action: "register", fullName: `الأخصائي تجريبي ${stamp}`, email: `couns${stamp}@t.dz`, password: "pass-tumaanina-1",
    recoveryPhrase: "عبارة استرجاع أخصائي", whatsapp: "+213555000111", specialties: ["anxiety"], languages: ["ar"], yearsExperience: 5,
  });
  const C_uid = couns.json?.userId;
  check("أخصائي مسجل", !!C_uid);

  const clientC = (await req("POST", "/api/client", {
    action: "register", pseudonym: "عميل-فيديو", password: "pass-tumaanina-1",
    recoveryPhrase: "عبارة استرجاع تجريبية", gender: "male", phone: "0555111001",
  })).json?.user;
  check("عميل مسجل", !!clientC?.id);

  /* ══ 1) رفع الفيديو بلا حد للحجم ══ */
  console.log("\n── 1) /api/media: جلسة رفع + دفعات + GridFS + Range ──");
  const chunkA = tinyMp4(7, 2000);
  const chunkB = tinyMp4(9, 3000);
  const whole = Buffer.concat([chunkA, chunkB]);

  const st = await req("POST", "/api/media", { userId: A_uid, op: "start", mime: "video/mp4", name: "test-video.mp4", size: whole.length });
  const uploadId = st.json?.uploadId;
  check("بدء جلسة رفع", st.json?.ok === true && /^[a-f0-9]{24}$/.test(uploadId || ""));

  const c1 = await reqRaw("POST", `/api/media?op=chunk&uid=${uploadId}&idx=0`, chunkA);
  const c2 = await reqRaw("POST", `/api/media?op=chunk&uid=${uploadId}&idx=1`, chunkB);
  check("دفعتان قُبلتا", c1.json?.ok === true && c2.json?.ok === true);

  const cm = await req("POST", "/api/media", { userId: A_uid, op: "commit", uploadId });
  const videoUrl = cm.json?.url;
  check("الإنهاء أعاد مرجع GridFS", cm.json?.ok === true && /^\/api\/media\/[a-f0-9]{24}$/.test(videoUrl || "") && cm.json?.bytes === whole.length);

  const full = await fetch(`${BASE}${videoUrl}`);
  const fullBuf = Buffer.from(await full.arrayBuffer());
  check("تقديم كامل يطابق البايتات", full.status === 200 && fullBuf.equals(whole) && (full.headers.get("content-type") || "").includes("video/mp4"));

  const part = await fetch(`${BASE}${videoUrl}`, { headers: { Range: "bytes=100-199" } });
  const partBuf = Buffer.from(await part.arrayBuffer());
  check("Range 206 يعيد المقطوعة الصحيحة", part.status === 206 && partBuf.length === 100 && (part.headers.get("content-range") || "").startsWith(`bytes 100-199/${whole.length}`));

  const badAuth = await req("POST", "/api/media", { userId: clientC.id, op: "start", mime: "video/mp4", name: "x", size: 10 });
  const noAuth = await req("POST", "/api/media", { op: "start", mime: "video/mp4", name: "x", size: 10 });
  check("غير العيادة مرفوض (عميل/مجهول)", badAuth.status === 401 && noAuth.status === 401);

  const gapCheck = await (async () => {
    const s2 = await req("POST", "/api/media", { userId: A_uid, op: "start", mime: "video/mp4", name: "gap", size: 4000 });
    await reqRaw("POST", `/api/media?op=chunk&uid=${s2.json?.uploadId}&idx=1`, chunkA); /* فجوة: idx=1 بلا 0 */
    return req("POST", "/api/media", { userId: A_uid, op: "commit", uploadId: s2.json?.uploadId });
  })();
  check("فجوة الدفعات → GAP_IN_CHUNKS", gapCheck.json?.error === "GAP_IN_CHUNKS");

  /* ══ 2) الإعلان بالفيديو + الصورة المصغّرة + التحويل 307 ══ */
  console.log("\n── 2) الإعلان: فيديو GridFS + mediaKinds + imageUrl صورة + 307 ──");
  const tinyImg = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const adVid = await req("POST", "/api/ads", { action: "create", userId: A_uid, title: "إعلان بفيديو كبير", body: "نص إعلان الفيديو — بلا حد للحجم", media: [tinyImg, videoUrl] });
  check("إنشاء إعلان بفيديو مرجعي نجح (بلا حد حجم)", adVid.json?.ok === true);

  const vidRefForeign = await req("POST", "/api/ads", { action: "create", userId: A_uid, title: "مرجع غير مملوك", body: "x", media: ["/api/media/aaaaaaaaaaaaaaaaaaaaaaaa"] });
  check("مرجع GridFS غير موجود/غير مملوك → INVALID_MEDIA", vidRefForeign.status === 400 && vidRefForeign.json?.error === "INVALID_MEDIA");

  const listA = (await req("GET", `/api/ads?userId=${A_uid}`)).json?.ads || [];
  const adRow = listA.find((a) => a.title === "إعلان بفيديو كبير");
  check("قائمة المالك تعيد mediaKinds صحيحاً", !!adRow && adRow.mediaKinds?.[0] === "image" && adRow.mediaKinds?.[1] === "video");
  check("imageUrl مصغّرة الصورة لا الفيديو", !!adRow && /\/media\/0$/.test(adRow.imageUrl || ""));

  await req("POST", "/api/ads/admin", { action: "ads-set-dues", id: adRow.id, amount: 300 }, AH);
  await req("POST", "/api/ads/admin", { action: "ads-set-paid", id: adRow.id, paid: true }, AH);
  await req("POST", "/api/ads/admin", { action: "ads-approve", id: adRow.id }, AH);

  const pub = (await req("GET", `/api/ads?page=1`)).json?.ads || [];
  const pubAd = pub.find((a) => a.id === adRow.id);
  check("العمومي: mediaKinds فيديو/صورة + بلا أي حقل مالي", !!pubAd && pubAd.mediaKinds?.[1] === "video" && pubAd.amountDue === undefined && pubAd.paid === undefined);

  const redir = await fetch(`${BASE}/api/ads/${adRow.id}/media/1`, { redirect: "manual" });
  check("مسار وسائط الإعلان يحوّل 307 لمرجع GridFS", redir.status === 307 && (redir.headers.get("location") || "").includes(videoUrl));

  const viaRange = await fetch(`${BASE}${videoUrl}`, { headers: { Range: "bytes=0-49" } });
  check("الفيديو المرجعي يعمل بالمدى من GridFS", viaRange.status === 206 && (await viaRange.arrayBuffer()).byteLength === 50);

  /* ══ 3) تنظيف GridFS عند التعديل/الحذف ══ */
  console.log("\n── 3) تنظيف الملفات اليتيمة ──");
  const st2 = await req("POST", "/api/media", { userId: A_uid, op: "start", mime: "video/mp4", name: "second.mp4", size: chunkA.length });
  await reqRaw("POST", `/api/media?op=chunk&uid=${st2.json?.uploadId}&idx=0`, chunkA);
  const cm2 = await req("POST", "/api/media", { userId: A_uid, op: "commit", uploadId: st2.json?.uploadId });
  const videoUrl2 = cm2.json?.url;

  await req("POST", "/api/ads", { action: "update", userId: A_uid, id: adRow.id, title: "إعلان بفيديو كبير (معدّل)", body: "نص محدث", media: [tinyImg, videoUrl2] });
  const oldAfterUpdate = await fetch(`${BASE}${videoUrl}`);
  check("الفيديو المستبدل حُذف من GridFS (404)", oldAfterUpdate.status === 404);
  const updRow = ((await req("GET", `/api/ads?userId=${A_uid}`)).json?.ads || []).find((a) => a.id === adRow.id);
  check("التعديل حُفظ ووصل للقائمة (عنوان + أنواع الوسائط)", updRow?.title === "إعلان بفيديو كبير (معدّل)" && updRow?.mediaKinds?.[1] === "video" && updRow?.mediaUrls?.length === 2);

  await req("POST", "/api/ads", { action: "delete", userId: A_uid, id: adRow.id });
  const afterDelete = await fetch(`${BASE}${videoUrl2}`);
  check("حذف الإعلان حذف فيديوهاته من GridFS (404)", afterDelete.status === 404);

  /* ══ 4) فيديوهات المعرض: بلا حد حجم + ترحيل القديم + حد العدد ══ */
  console.log("\n── 4) المعرض: GridFS بلا حد حجم + ترحيل القديم + حدّ العدد ──");
  const g1 = await req("POST", "/api/clinic", { action: "update-profile", userId: A_uid, galleryVideos: [videoUrl] });
  check("حفظ فيديو معرض بمرجع GridFS نجح", g1.json?.ok === true);

  const prof1 = (await req("GET", `/api/clinic?userId=${A_uid}`)).json?.clinic;
  check("لوحة العيادة تعيد الفيديو بالمرجع", prof1?.galleryVideos?.[0]?.url === videoUrl);

  const pubClinic = (await req("GET", `/api/clinics/${A_slug}`)).json?.clinic;
  check("صفحة العيادة العمومية تعيد الفيديو", pubClinic?.galleryVideoUrls?.[0]?.url === videoUrl);

  /* ترحيل القديم: نزرع وثيقة قديمة مباشرة في القاعدة ثم نحفظ بروابطها */
  const mongoose = (await import("mongoose")).default;
  const legacyConn = await mongoose.createConnection(mongod.getUri("tumaanina-v18")).asPromise();
  const legacyColl = legacyConn.collection("clinic_gallery_media");
  const clinicDoc = await legacyConn.collection("clinics").findOne({ slug: A_slug });
  await legacyColl.insertOne({ clinicId: clinicDoc._id, mime: "video/webm", data: tinyMp4(3, 800).toString("base64"), createdAt: new Date() });
  const legacyCount = await legacyColl.countDocuments({ clinicId: clinicDoc._id });
  check("زرع فيديو قديم (نمط ما قبل 1.18)", legacyCount === 1);

  const prof2 = (await req("GET", `/api/clinic?userId=${A_uid}`)).json?.clinic;
  const legacyUrl = prof2?.galleryVideos?.find((v) => v.url.includes("/gallery/media/"))?.url;
  check("القديم يُقرأ من مساره القديم", !!legacyUrl);

  /* الحفظ من اللوحة يرسل القائمة كاملة: المرجع الحالي + رابط القديم */
  const mig = await req("POST", "/api/clinic", { action: "update-profile", userId: A_uid, galleryVideos: [videoUrl, legacyUrl] });
  check("الحفظ بروابط القديم نجح (ترحيل تلقائي)", mig.json?.ok === true);

  const prof3 = (await req("GET", `/api/clinic?userId=${A_uid}`)).json?.clinic;
  const allGrid = (prof3?.galleryVideos || []).every((v) => v.url.startsWith("/api/media/"));
  const legacyLeft = await legacyColl.countDocuments({ clinicId: clinicDoc._id });
  check("القديم رُحّل إلى GridFS والمجموعة القديمة مُفرَّغة", allGrid && legacyLeft === 0 && (prof3?.galleryVideos?.length || 0) === 2);

  const over = await req("POST", "/api/clinic", { action: "update-profile", userId: A_uid, galleryVideos: ["/api/media/aaaaaaaaaaaaaaaaaaaaaaaa", "/api/media/bbbbbbbbbbbbbbbbbbbbbbbb", "/api/media/cccccccccccccccccccccccc"] });
  check("أكثر من فيديوهين → MAX_2_VIDEOS", over.status === 400 && over.json?.error === "MAX_2_VIDEOS");

  const clearV = await req("POST", "/api/clinic", { action: "update-profile", userId: A_uid, galleryVideos: [] });
  const prof4 = (await req("GET", `/api/clinic?userId=${A_uid}`)).json?.clinic;
  const cleared = await fetch(`${BASE}${prof3.galleryVideos[0].url}`);
  check("[] يفرّغ المعرض ويحذف ملفات GridFS", clearV.json?.ok === true && (prof4?.galleryVideos?.length || 0) === 0 && cleared.status === 404);

  /* ══ 5) أسعار EUR/USD من العيادة — بلا تحويل ══ */
  console.log("\n── 5) الأسعار: EUR/USD اختياريان من العيادة، الدينار الرسمي ──");
  const pr = await req("POST", "/api/clinic", { action: "update-profile", userId: A_uid, sessionPrice: 2500, priceEur: 17.5, priceUsd: 19 });
  check("حفظ الأسعار الثلاثة", pr.json?.ok === true);

  const prof5 = (await req("GET", `/api/clinic?userId=${A_uid}`)).json?.clinic;
  check("اللوحة تعيد EUR/USD كما حُفظا", prof5?.sessionPrice === 2500 && prof5?.priceEur === 17.5 && prof5?.priceUsd === 19);

  const pubP = (await req("GET", `/api/clinics/${A_slug}`)).json?.clinic;
  check("صفحة العيادة تعيد السعرين كما هما (لا حقول تحويل)", pubP?.priceEur === 17.5 && pubP?.priceUsd === 19 && pubP?.approx === undefined);

  const dirList = (await req("GET", `/api/clinics?pageSize=8`)).json?.clinics || [];
  const dirA = dirList.find((c) => c.slug === A_slug);
  check("الدليل يعيد السعرين كما هما", !!dirA && dirA.priceEur === 17.5 && dirA.priceUsd === 19);

  const prNull = await req("POST", "/api/clinic", { action: "update-profile", userId: A_uid, priceEur: null, priceUsd: null });
  const prof6 = (await req("GET", `/api/clinic?userId=${A_uid}`)).json?.clinic;
  check("الإفراغ يعيدهما null (يبقى DZD فقط)", prNull.json?.ok === true && prof6?.priceEur === null && prof6?.priceUsd === null && prof6?.sessionPrice === 2500);

  const prBad = await req("POST", "/api/clinic", { action: "update-profile", userId: A_uid, priceEur: -5 });
  check("سعر سالب مرفوض", prBad.status === 400 && prBad.json?.error === "INVALID_PRICE");

  /* ══ 6) انتماء الأخصائي: تعديل من الإعدادات ══ */
  console.log("\n── 6) الأخصائي: تعيين/استقلال/رفض عيادة فاسدة ──");
  const setC = await req("POST", "/api/counselor", { action: "update-profile", userId: C_uid, clinicId: pubClinic.id });
  const me1 = (await req("GET", `/api/counselor?userId=${C_uid}`)).json?.profile;
  check("الانتساب لعيادة نجح ويظهر في الملف", setC.json?.ok === true && me1?.clinicId === pubClinic.id && !!me1?.clinicName);

  const specList = (await req("GET", `/api/clinics/${A_slug}`)).json?.clinic?.specialists || [];
  check("الأخصائي (بلا توثيق بعد) لا يظهر في قائمة العيادة بعد", specList.length === 0);

  const unsetC = await req("POST", "/api/counselor", { action: "update-profile", userId: C_uid, clinicId: "none" });
  const me2 = (await req("GET", `/api/counselor?userId=${C_uid}`)).json?.profile;
  check("«مستقل» يفرغ الانتماء", unsetC.json?.ok === true && me2?.clinicId === null);

  const badC = await req("POST", "/api/counselor", { action: "update-profile", userId: C_uid, clinicId: "zzzz" });
  check("معرّف فاسد → INVALID_CLINIC", badC.status === 400 && badC.json?.error === "INVALID_CLINIC");

  /* ══ 7) الحجوزات: الحالات تصل للفلاتر ══ */
  console.log("\n── 7) الحجوزات: حالات الحجوزات للفلاتر الجديدة ──");
  const prx = await req("POST", "/api/clinic", { action: "update-profile", userId: A_uid, sessionPrice: 2500 });
  const tomorrow = new Date(Date.now() + 26 * 3600 * 1000).toISOString().slice(0, 10);
  await req("POST", `/api/clinics/${pubClinic.id}/book`, { userId: clientC.id, name: "عميل فلترة", phone: "0555111001", date: tomorrow, slot: "10:00" });
  const bookingsA = (await req("GET", `/api/clinics/bookings?userId=${A_uid}`)).json?.bookings || [];
  check("الحجوزات تحمل status (أساس الفلاتر والعدّاد)", bookingsA.length >= 1 && typeof bookingsA[0].status === "string");

  /* ══ 8) استقرار ══ */
  console.log("\n── 8) استقرار: 60 طلباً مختلطاً ──");
  let okCount = 0, errCount = 0;
  for (let i = 0; i < 60; i++) {
    try {
      const p = ["/api/health", "/api/ads?page=1", `/api/clinics/${A_slug}`, "/api/clinics?pageSize=4"][i % 4];
      const r = await fetch(`${BASE}${p}`);
      if (r.ok) okCount++; else errCount++;
    } catch { errCount++; }
  }
  check(`الاستقرار 60/60 (نجح ${okCount})`, errCount === 0);

  server.kill();
  await legacyConn.close().catch(() => {});
  await mongod.stop();
  console.log(`\n═══ النتيجة: ${pass} نجح / ${fail} فشل ═══`);
  if (fail) { console.log("البنود الفاشلة:"); fails.forEach((f) => console.log("  -", f)); process.exit(1); }
  process.exit(0);
};

run().catch(async (e) => { console.error("FATAL:", e); process.exit(1); });
