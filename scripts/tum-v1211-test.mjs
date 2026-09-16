#!/usr/bin/env node
/**
 * غرفة اختبار طمأنينة v1.21.1 — خادم إنتاجي حقيقي + MongoDB ذاكرة (منفذ 27078)
 * بنود هذه الجولة:
 *  1) الرسائل الصوتية — إصلاح «تشتغل فور الإرسال ثم ✕ و00:00 لاحقاً»:
 *     • إرسال صوتي في dm → الاستجابة تحمل content كاملاً + audioReady (فقاعة فورية)
 *     • استقصاء full=1 يعيد content="" + audioReady (قائمة خفيفة لا تمسح الصوت من الخادم)
 *     • /api/messages/{id}/audio (JSON) يعيد المحتوى مطابقاً 100%
 *     • mode=raw يعيد بثاً ثنائياً: Content-Type صحيح + Accept-Ranges + Cache immutable
 *     • Range bytes=0-9 → 206 + Content-Range صحيح
 *     • رسالة حقبة v1.5.0 المقصوصة (4000 حرف بالضبط) → 410 LEGACY_BROKEN في الوضعين
 *     • صوت أكبر من 1.3MB يُرفض، والحدّ الأقصى مقبول
 *  2) الدورات — تجاوب + معلومات التواصل كما في v1.21.0 (لا تراجع):
 *     • enroll بلا هاتف → CONTACT_REQUIRED
 *     • enroll بهاتف → نجاح + مقاعد تنقص + myEnrollments تعيد rejectReason
 *     • رفض بسبب إلزامي → rejectReason يصل لعميل الدورة
 *     • إلغاء العميل يحرر المقعد
 *  3) الصحة 1.21.1 + استقرار
 */
import { spawn } from "child_process";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";

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

/* data:audio/webm;codecs=opus;base64,<بادئة صالحة> — بايتات حقيقية للفحص الثنائي */
const AUDIO_BYTES = Buffer.from(
  "1a45dfa3" + "4282886400" + "0".repeat(400) + "a3" + "0102030405060708", "hex"
);
const AUDIO_DATA_URL = `data:audio/webm;codecs=opus;base64,${AUDIO_BYTES.toString("base64")}`;

const run = async () => {
  console.log("═══ طمأنينة v1.21.1 — غرفة اختبار الصوت والدورات ═══\n");
  const mongod = await MongoMemoryServer.create({ instance: { port: 27078 } });
  const mongoClient = new MongoClient(mongod.getUri("tumaanina-v1211"));
  const server = spawn("node", ["server.js"], {
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("tumaanina-v1211"), ADMIN_PASSCODE: "tum-pass-1211", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  const stderrTail = [];
  server.stderr.on("data", (d) => { stderrTail.push(String(d)); if (stderrTail.length > 40) stderrTail.shift(); });

  let ready = false;
  for (let i = 0; i < 60; i++) {
    await wait(500);
    try {
      const h = await req("GET", "/api/health");
      if (h.json?.version === "1.21.1" && h.json?.ok) { ready = true; break; }
    } catch {}
  }
  check("الخادم جاهز ويقول 1.21.1", ready);
  if (!ready) { console.log("SERVER STDERR:\n" + stderrTail.join("")); server.kill(); await mongod.stop(); process.exit(1); }

  const admin = await req("POST", "/api/admin", { action: "login", passcode: "tum-pass-1211" });
  const AH = { "x-admin-token": admin.json?.token || "" };
  check("دخول الإدارة", !!AH["x-admin-token"]);

  /* ══ الحسابات ══ */
  const stamp = Date.now();
  const couns = await req("POST", "/api/counselor", {
    action: "register", fullName: `د. صوت تجريبي ${stamp}`, email: `voice${stamp}@t.dz`, password: "pass-tumaanina-1",
    recoveryPhrase: "عبارة استرجاع الأخصائي", whatsapp: "+213555000111", specialties: ["anxiety"], languages: ["ar"], yearsExperience: 8,
  });
  const C_uid = couns.json?.userId;
  check("أخصائي مسجل", !!C_uid);

  const v1 = (await req("POST", "/api/client", { action: "register", pseudonym: `عميل-صوت-${stamp}`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة صوت", gender: "male", phone: "0555000101" })).json?.user;
  check("عميل مسجل", !!v1?.id);

  /* توثيق الأخصائي */
  const pend = (await req("POST", "/api/admin", { action: "pending-counselors" }, AH)).json;
  const profId = (pend?.counselors || pend?.profiles || pend?.pending || []).find?.((c) => String(c.userId) === String(C_uid))?.id
    || (pend?.counselors || pend?.profiles || pend?.pending || [])[0]?.id;
  await req("POST", "/api/admin", { action: "verify", profileId: profId }, AH);
  check("أخصائي موثّق", !!profId);

  /* ══ 1) الرسائل الصوتية في dm ══ */
  console.log("\n── الصوت: إرسال ثم جلب بثلاثة مسارات ──");
  const threadKey = `dm:${v1.id}:${C_uid}`;
  const send = await req("POST", "/api/messages", {
    threadKey, senderRole: "VICTIM", senderId: v1.id, senderName: v1.pseudonym,
    type: "voice", seconds: 7, content: AUDIO_DATA_URL,
  });
  check("إرسال صوتي ينجح", send.status === 200 && send.json?.ok === true, `status=${send.status} err=${send.json?.error}`);
  check("استجابة الإرسال تحمل المحتوى الكامل (فقاعة فورية بلا شبكة)", send.json?.message?.content === AUDIO_DATA_URL);
  check("استجابة الإرسال تحمل audioReady + seconds", send.json?.message?.audioReady === true && send.json?.message?.seconds === 7);
  const msgId = send.json?.message?.id || send.json?.message?._id;

  const poll = await req("GET", `/api/messages?threadKey=${encodeURIComponent(threadKey)}&full=1`);
  const polled = (poll.json?.messages || []).find((m) => m.id === msgId);
  check("الاستقصاء full=1 يعيد content فارغاً للصوت (قائمة خفيفة)", polled && polled.content === "");
  check("الاستقصاء يعيد audioReady=true + seconds=7", polled?.audioReady === true && polled?.seconds === 7);

  const jsonAudio = await fetch(`${BASE}/api/messages/${msgId}/audio?userId=${v1.id}`);
  const jsonBody = await jsonAudio.json();
  check("مسار JSON يعيد 200 + المحتوى مطابقاً 100%", jsonAudio.status === 200 && jsonBody?.content === AUDIO_DATA_URL);

  const raw = await fetch(`${BASE}/api/messages/${msgId}/audio?mode=raw&userId=${v1.id}`);
  const rawBuf = Buffer.from(await raw.arrayBuffer());
  check("mode=raw يعيد 200 بثنائي مطابق للـ data URL", raw.status === 200 && rawBuf.equals(AUDIO_BYTES), `status=${raw.status} len=${rawBuf.length}/${AUDIO_BYTES.length}`);
  check("ترويسة Content-Type صحيحة (audio/webm;codecs=opus)", (raw.headers.get("content-type") || "").startsWith("audio/webm"));
  check("Accept-Ranges: bytes + Cache-Control immutable", raw.headers.get("accept-ranges") === "bytes" && /immutable/.test(raw.headers.get("cache-control") || ""));

  const range = await fetch(`${BASE}/api/messages/${msgId}/audio?mode=raw&userId=${v1.id}`, { headers: { Range: "bytes=0-9" } });
  const rangeBuf = Buffer.from(await range.arrayBuffer());
  check("Range bytes=0-9 → 206 + شطبة مطابقة", range.status === 206 && rangeBuf.length === 10 && rangeBuf.equals(AUDIO_BYTES.subarray(0, 10)));
  check("Content-Range يعلن الطول الكامل", range.headers.get("content-range") === `bytes 0-9/${AUDIO_BYTES.length}`);

  /* رسالة حقبة v1.5.0 المقصوصة — نحقنها مباشرة في قاعدة البيانات */
  await mongoClient.connect();
  const db = mongoClient.db("tumaanina-v1211");
  await db.collection("messages").insertOne({
    threadKey, senderRole: "VICTIM", senderId: v1.id, type: "voice", seconds: 9,
    content: "x".repeat(4000), deleted: false, createdAt: new Date(),
  });
  const legacyDoc = await db.collection("messages").findOne({ content: "x".repeat(4000) });
  const legacyId = String(legacyDoc._id);
  const legacyJson = await fetch(`${BASE}/api/messages/${legacyId}/audio?userId=${v1.id}`);
  const legacyRaw = await fetch(`${BASE}/api/messages/${legacyId}/audio?mode=raw&userId=${v1.id}`);
  const lj = await legacyJson.json().catch(() => null);
  check("رسالة مقصوصة (4000) → 410 LEGACY_BROKEN في وضع JSON", legacyJson.status === 410 && lj?.error === "LEGACY_BROKEN");
  check("رسالة مقصوصة (4000) → 410 LEGACY_BROKEN في وضع raw", legacyRaw.status === 410);

  /* حدود الحجم: فوق 1.3MB يُرفض — الحد نفسه مقبول */
  const bigB64 = Buffer.alloc(1_310_000, 7).toString("base64");
  const tooBig = await req("POST", "/api/messages", {
    threadKey, senderRole: "VICTIM", senderId: v1.id, type: "voice", seconds: 3, content: `data:audio/webm;base64,${bigB64}`,
  });
  check("صوت فوق الحد (1.3MB) يُرفض", tooBig.status === 400);
  const okBig = await req("POST", "/api/messages", {
    threadKey, senderRole: "VICTIM", senderId: v1.id, type: "voice", seconds: 3,
    content: `data:audio/webm;base64,${Buffer.alloc(900_000, 7).toString("base64")}`,
  });
  check("صوت داخل الحد يُقبل", okBig.status === 200 && okBig.json?.ok === true);

  /* صلاحيات: طرف غريب لا يسمع الصوت */
  const stranger = (await req("POST", "/api/client", { action: "register", pseudonym: `غريب-${stamp}`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة غريب", gender: "female", phone: "0555000102" })).json?.user;
  const forb = await fetch(`${BASE}/api/messages/${msgId}/audio?userId=${stranger.id}`);
  check("طرف خارج الخيط يُمنع (403)", forb.status === 403);

  /* ══ 2) الدورات — تواصل + رفض بسبب + إلغاء ══ */
  console.log("\n── الدورات: contactPhone + الرفض بالإلزام + التتبع ──");
  const course = await req("POST", "/api/courses", { userId: C_uid, title: `دورة الصوت ${stamp}`, description: "وصف", price: 1500, capacity: 2 });
  check("إنشاء دورة", course.status === 200 && !!course.json?.course?.id, JSON.stringify(course.json));
  const courseId = course.json?.course?.id;

  const noPhone = await req("POST", `/api/courses/${courseId}/enroll`, { userId: v1.id, name: v1.pseudonym });
  check("enroll بلا هاتف → CONTACT_REQUIRED (سلوك v1.21.0 محفوظ)", noPhone.status === 400 && noPhone.json?.error === "CONTACT_REQUIRED");

  const badPhone = await req("POST", `/api/courses/${courseId}/enroll`, { userId: v1.id, contactPhone: "abc" });
  check("هاتف فاسد يُرفض CONTACT_REQUIRED", badPhone.status === 400 && badPhone.json?.error === "CONTACT_REQUIRED");

  const enroll = await req("POST", `/api/courses/${courseId}/enroll`, { userId: v1.id, name: v1.pseudonym, contactPhone: "+213 555 00 01 01", contactEmail: "v@t.dz", contactNote: "أفضل المساء" });
  check("enroll بهاتف ينجح", enroll.status === 200 && enroll.json?.ok === true, JSON.stringify(enroll.json));

  const list = (await req("GET", `/api/courses?userId=${v1.id}`)).json;
  const inList = (list?.courses || []).find((c) => c.id === courseId);
  check("المقاعد تنقص لحظياً (2→1)", inList?.taken === 1 && inList?.remaining === 1);
  check("حالتي في البطاقة pending + myEnrollmentId", inList?.myStatus === "pending" && !!inList?.myEnrollmentId);
  const myEn = (list?.myEnrollments || []).find((e) => e.courseId === courseId);
  check("myEnrollments تعيد الحقلين status+rejectReason", myEn?.status === "pending" && myEn?.rejectReason === null);

  /* صاحب الدورة يرى معلومات التواصل */
  const ownerList = (await req("GET", `/api/counselor/courses?userId=${C_uid}`)).json;
  const ownCourse = (ownerList?.courses || []).find((c) => c.id === courseId);
  const ownEn = (ownCourse?.enrollments || [])[0];
  check("المالك يرى هاتف المسجّل", ownEn?.contactPhone === "+213 555 00 01 01");
  check("المالك يرى البريد والملاحظة", ownEn?.contactEmail === "v@t.dz" && ownEn?.contactNote === "أفضل المساء");

  /* الرفض بسبب إلزامي */
  const noReason = await req("POST", `/api/courses/enrollments/${myEn.id}`, { action: "reject", userId: C_uid, reason: "" });
  check("رفض بلا سبب يُرفض REASON_REQUIRED", noReason.status === 400 && noReason.json?.error === "REASON_REQUIRED");
  const reject = await req("POST", `/api/courses/enrollments/${myEn.id}`, { action: "reject", userId: C_uid, reason: "المقاعد محجوزة للمجموعة الأولى — ستُفتح دورة قريباً" });
  check("رفض بسبب ينجح", reject.status === 200 && reject.json?.ok === true);

  const list2 = (await req("GET", `/api/courses?userId=${v1.id}`)).json;
  const myEn2 = (list2?.myEnrollments || []).find((e) => e.id === myEn.id);
  check("العميل يرى الحالة rejected + سبب الرفض كاملاً", myEn2?.status === "rejected" && myEn2?.rejectReason === "المقاعد محجوزة للمجموعة الأولى — ستُفتح دورة قريباً");

  /* إعادة حجز بعد الرفض ثم إلغاء — المقعد يتحرر */
  const enroll2 = await req("POST", `/api/courses/${courseId}/enroll`, { userId: v1.id, contactPhone: "0555000101" });
  check("إعادة الحجز بعد الرفض تُقبل", enroll2.status === 200 && enroll2.json?.ok === true);
  const listRe = (await req("GET", `/api/courses?userId=${v1.id}`)).json;
  const inRe = (listRe?.courses || []).find((c) => c.id === courseId);
  const cancel = await req("POST", `/api/courses/enrollments/${inRe?.myEnrollmentId}`, { action: "cancel", userId: v1.id });
  check("طلب الإلغاء ينجح", cancel.status === 200 && cancel.json?.ok === true, JSON.stringify(cancel.json));
  const list3 = (await req("GET", `/api/courses?userId=${v1.id}`)).json;
  const inList3 = (list3?.courses || []).find((c) => c.id === courseId);
  check("الإلغاء يحرر المقعد (1→2) ويمسح حالتي", inList3?.remaining === 2 && inList3?.myStatus === null, JSON.stringify(inList3));

  /* ══ 3) استقرار ══ */
  console.log("\n── الاستقرار ──");
  const h2 = await req("GET", "/api/health");
  check("الصحة ما زالت 1.21.1 بعد كل العمليات", h2.json?.version === "1.21.1" && h2.json?.ok === true);

  mongoClient.close().catch(() => {});
  server.kill();
  await mongod.stop();

  console.log(`\n═══ النتيجة: ${pass} نجاح / ${fail} إخفاق ═══`);
  if (fails.length) { console.log("البنود الفاشلة:"); fails.forEach((f) => console.log(`  - ${f}`)); }
  process.exit(fail ? 1 : 0);
};

run().catch((e) => { console.error("FATAL:", e); process.exit(1); });
