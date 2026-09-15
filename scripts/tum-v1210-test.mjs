#!/usr/bin/env node
/**
 * غرفة اختبار طمأنينة v1.21.0 — خادم إنتاجي حقيقي + MongoDB ذاكرة (منفذ 27077)
 * بنود هذه الجولة:
 *  1) نزع رفع الفيديو كلياً: POST /api/media يعيد 410 MEDIA_DISABLED لكل
 *     العمليات (start/chunk/commit) — وتقديم الوسائط القديمة /api/media/{id}
 *     يبقى حياً (404 لغير الموجود لا انكسار المسار)
 *  2) حجز الدورة بمعلومات التواصل: الهاتف إلزامي (CONTACT_REQUIRED)، البريد
 *     اختياري بصحة (INVALID_EMAIL)، الملاحظة اختيارية — تُخزّن وتظهر لصاحب
 *     الدورة وحده في قائمة الملتحقين
 *  3) تراجع سليم: إنشاء إعلان بالصور يعمل، ومدقق وسائط الإعلان يرفض مرجع
 *     GridFS غير مملوك (INVALID_MEDIA) كما كان
 *  4) الصحة 1.21.0 + استقرار 60 طلباً مختلطاً
 */
import { spawn } from "child_process";
import { MongoMemoryServer } from "mongodb-memory-server";

const PORT = "3995";
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

const run = async () => {
  console.log("═══ طمأنينة v1.21.0 — غرفة اختبار بنود الجولة ═══\n");
  const mongod = await MongoMemoryServer.create({ instance: { port: 27077 } });
  const server = spawn("node", ["server.js"], {
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("tumaanina-v21"), ADMIN_PASSCODE: "tum-pass-21", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  const stderrTail = [];
  server.stderr.on("data", (d) => { stderrTail.push(String(d)); if (stderrTail.length > 40) stderrTail.shift(); });

  let ready = false;
  for (let i = 0; i < 60; i++) {
    await wait(500);
    try {
      const h = await req("GET", "/api/health");
      if (h.json?.version === "1.21.0" && h.json?.ok) { ready = true; break; }
    } catch {}
  }
  check("الخادم جاهز ويقول 1.21.0", ready);
  if (!ready) { console.log("SERVER STDERR:\n" + stderrTail.join("")); server.kill(); await mongod.stop(); process.exit(1); }

  /* ══ الحسابات ══ */
  const stamp = Date.now();
  const clA = await req("POST", "/api/clinic", { action: "register", name: `عيادة الدورات ${stamp}`, email: `clinA${stamp}@t.dz`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة استرجاع أ" });
  const A_uid = clA.json?.userId, A_slug = clA.json?.slug;
  const clB = await req("POST", "/api/clinic", { action: "register", name: `عيادة أخرى ${stamp}`, email: `clinB${stamp}@t.dz`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة استرجاع ب" });
  const B_uid = clB.json?.userId;
  check("عيادتان مسجلتان", !!A_uid && !!B_uid);

  const c1 = (await req("POST", "/api/client", { action: "register", pseudonym: `مسجّل-أ-${stamp}`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة أ", gender: "male", phone: "0555000001" })).json?.user;
  const c2 = (await req("POST", "/api/client", { action: "register", pseudonym: `مسجّل-ب-${stamp}`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة ب", gender: "female", phone: "0555000002" })).json?.user;
  check("عميلان مسجلان", !!c1?.id && !!c2?.id);

  /* ══ 1) نزع رفع الفيديو ══ */
  const upStart = await req("POST", "/api/media", { userId: A_uid, op: "start", mime: "video/mp4", name: "v.mp4", size: 1000 });
  check("رفع الفيديو مُزع — start يعيد 410 MEDIA_DISABLED", upStart.status === 410 && upStart.json?.error === "MEDIA_DISABLED", JSON.stringify(upStart.json));

  const chunkRes = await fetch(`${BASE}/api/media?op=chunk&uid=${"a".repeat(24)}&idx=0`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: Buffer.alloc(10) });
  check("دفعة فيديو مرفوضة أيضاً (410)", chunkRes.status === 410);
  await chunkRes.text().catch(() => "");

  const mediaGet = await req("GET", `/api/media/${"b".repeat(24)}`);
  check("مسار تقديم الوسائط القديمة يبقى حياً (404 لغير الموجود)", mediaGet.status === 404);

  /* ══ 2) حجز الدورة بمعلومات التواصل ══ */
  const course = await req("POST", "/api/courses", { userId: A_uid, title: "دورة إدارة القلق", description: "دورة تجريبية لمعلومات التواصل", price: 1500, capacity: 5 });
  const courseId = course.json?.course?.id || course.json?.id;
  check("العيادة تنشئ دورة", !!courseId, JSON.stringify(course.json));

  const eNoPhone = await req("POST", `/api/courses/${courseId}/enroll`, { userId: c1.id, name: "مسجّل أ" });
  check("الحجز بلا هاتف مرفوض CONTACT_REQUIRED", eNoPhone.status === 400 && eNoPhone.json?.error === "CONTACT_REQUIRED", JSON.stringify(eNoPhone.json));

  const eBadPhone = await req("POST", `/api/courses/${courseId}/enroll`, { userId: c1.id, name: "مسجّل أ", contactPhone: "هاتف غير صالح" });
  check("هاتف فاسد مرفوض CONTACT_REQUIRED", eBadPhone.status === 400 && eBadPhone.json?.error === "CONTACT_REQUIRED");

  const eBadMail = await req("POST", `/api/courses/${courseId}/enroll`, { userId: c1.id, name: "مسجّل أ", contactPhone: "0555112233", contactEmail: "بريد-فاسد" });
  check("بريد فاسد مرفوض INVALID_EMAIL", eBadMail.status === 400 && eBadMail.json?.error === "INVALID_EMAIL");

  const eOk = await req("POST", `/api/courses/${courseId}/enroll`, { userId: c1.id, name: "مسجّل أ", contactPhone: "+213 555 11 22 33", contactEmail: `c1${stamp}@t.dz`, contactNote: "أفضل التواصل مساءً" });
  check("الحجز بهاتف + بريد + ملاحظة ينجح", eOk.status === 200 && eOk.json?.ok === true, JSON.stringify(eOk.json));

  const eOk2 = await req("POST", `/api/courses/${courseId}/enroll`, { userId: c2.id, name: "مسجّل ب", contactPhone: "05554445566" });
  check("الحجز بالهاتف فقط (بريد وملاحظة اختياريان) ينجح", eOk2.status === 200 && eOk2.json?.ok === true);

  /* الملتحقون في قائمة المالك — بمعلومات التواصل كاملة */
  const ownerList = (await req("GET", `/api/counselor/courses?userId=${A_uid}`)).json?.courses || [];
  const ownedRow = ownerList.find((x) => x.id === courseId);
  const enA = ownedRow?.enrollments?.find((e) => e.clientName === "مسجّل أ");
  const enB = ownedRow?.enrollments?.find((e) => e.clientName === "مسجّل ب");
  check("قائمة المالك تحمل ملتحقيها", ownedRow?.enrollments?.length === 2);
  check("معلومات تواصل المسجّل الأول ظاهرة للمالك (هاتف/بريد/ملاحظة)",
    enA?.contactPhone === "+213 555 11 22 33" && enA?.contactEmail === `c1${stamp}@t.dz` && enA?.contactNote === "أفضل التواصل مساءً",
    JSON.stringify(enA));
  check("المسجّل الثاني: الهاتف فقط والباقي null", enB?.contactPhone === "05554445566" && enB?.contactEmail === null && enB?.contactNote === null);

  const otherList = (await req("GET", `/api/counselor/courses?userId=${B_uid}`)).json?.courses || [];
  check("عيادة أخرى لا ترى دورات غيرها (قائمتها خاوية بلا دورة العيادة أ)", otherList.status === undefined && !otherList.some((x) => x.id === courseId), JSON.stringify(otherList));

  /* إشعار الحجز يصل لصاحبة الدورة (بقي سليماً بعد التعديل) */
  const nOwner = (await req("GET", `/api/notifications?userId=${A_uid}`)).json?.notifications || [];
  check("إشعار حجز الدورة وصل للمالية (courseNewBooking)", nOwner.some((n) => n.key === "courseNewBooking"));

  /* ══ 3) تراجع: الإعلانات بالصور كما كانت ══ */
  const tinyPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const adOk = await req("POST", "/api/ads", { action: "create", userId: A_uid, title: "إعلان بالصور فقط", body: "نص الإعلان", media: [tinyPng] });
  check("إنشاء إعلان بصورة data URL يعمل", adOk.json?.ok === true, JSON.stringify(adOk.json));

  const adBadRef = await req("POST", "/api/ads", { action: "create", userId: A_uid, title: "إعلان بمرجع غريب", body: "نص", media: [`/api/media/${"c".repeat(24)}`] });
  check("مرجع GridFS غير مملوك مرفوض كما كان", adBadRef.json?.ok !== true, JSON.stringify(adBadRef.json));

  /* ══ 4) استقرار ══ */
  const targets = ["/api/health", "/api/ads?page=1", `/api/courses?userId=${c1.id}`, `/api/clinics/${A_slug}`];
  let okCount = 0;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: 60 }, (_, i) => req("GET", targets[i % targets.length]).then((r) => { if (r.status === 200) okCount++; })));
  check(`استقرار 60 طلباً مختلطاً (${Date.now() - t0}ms)`, okCount === 60, `ok=${okCount}`);

  server.kill();
  await mongod.stop();
  console.log(`\n═══ النتيجة: ${pass} نجاح / ${fail} إخفاق ═══`);
  if (fail) { console.log("إخفاقات: " + fails.join(" | ")); process.exit(1); }
  process.exit(0);
};

run().catch((e) => { console.error(e); process.exit(1); });
