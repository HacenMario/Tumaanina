/**
 * اختبار طمأنينة v1.4.0 — إشعارات بالأسماء + فريق الإدارة + الميزات الجديدة
 * ─────────────────────────────────────────────────────────────────
 *  1. الخادم v1.4.0 جاهز
 *  2. الإشعارات: كل تحول حالة يذكر اسم الطرف الآخر (booked/accepted/rescheduled/cancelled...)
 *  3. فريق الإدارة: staff-create (SUPER) + staff-login + صلاحيات MANAGER (403 للحذف،
 *     يسمح بالإشعارات) + staff-toggle/delete + حماية المالك الأصلي
 *  4. البوابة الأمنية: أفعال الأدمين بلا رمز → 401
 *  5. العبارات: 120 عبارة مزروعة (الـ30 الجديدة)
 *  6. فحوصات ملفات: نافذة الحجز، دردشة الغرفة، زر الإغلاق، اسم المطور، صفحة الشكر
 */
const { MongoMemoryServer } = require("mongodb-memory-server");
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");

const PORT = String(3800 + (process.pid % 200) + Math.floor(Math.random() * 80));
const BASE = `http://localhost:${PORT}`;
let ADMIN_TOKEN = "";
let failures = 0;

function req(method, path, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(`${BASE}${path}`, {
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

(async () => {
  console.log("═".repeat(56));
  console.log("🧪 اختبار طمأنينة v1.4.0 — إشعارات بالأسماء + فريق الإدارة");
  console.log("═".repeat(56));

  const mongod = await MongoMemoryServer.create();
  const server = spawn("node", ["server.js"], {
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("tumaanina-v14-regression"), ADMIN_PASSCODE: "tum-pass-15", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    await wait(500);
    try {
      const h = await req("GET", "/api/health");
      if (h.json?.ok && /^1\./.test(String(h.json?.version))) { ready = true; break; }
    } catch {}
  }
  check("الخادم v1.4.0 جاهز", ready);
  if (!ready) process.exit(1);

  /* ─── 4) البوابة الأمنية أولاً: بلا رمز → 401 ─── */
  console.log("\n── 1) البوابة الأمنية (كانت الأفعال مكشوفة!) ──");
  const bare = await req("POST", "/api/admin", { action: "list-users" });
  check("فعل أدمين بلا رمز → 401 ADMIN_TOKEN_REQUIRED", bare.status === 401 && bare.json?.error === "ADMIN_TOKEN_REQUIRED");
  const forged = await req("POST", "/api/admin", { action: "list-users" }, { "x-admin-token": "fake.sig" });
  check("رمز مزوّر → 401", forged.status === 401);

  const login = await req("POST", "/api/admin", { action: "login", passcode: "tum-pass-15" });
  ADMIN_TOKEN = login.json?.token || "";
  check("دخول المالك (رمز البيئة) → SUPER + رمز", login.json?.ok && login.json?.user?.staffRole === "SUPER" && !!ADMIN_TOKEN);
  const badGate = await req("POST", "/api/admin", { action: "list-users" }, { "x-admin-token": "x.y" });
  check("رمز تالف → 401", badGate.status === 401);

  /* ─── الحسابات الأساسية ─── */
  const client = (await req("POST", "/api/client", {
    action: "register", pseudonym: "عميل-الإشعارات", password: "pass-tumaanina-1",
    recoveryPhrase: "عبارة استرجاع تجريبية", gender: "male", phone: "0555888001",
  })).json.user;
  const cEmail = `doc14-${Date.now()}@test.dz`;
  await req("POST", "/api/counselor", {
    action: "register", fullName: "د. إشعارات الأسماء", email: cEmail,
    password: "pass-tumaanina-1", recoveryPhrase: "عبارة اختبار الأخصائي",
    specialties: ["anxietyDepression"], languages: ["ar"], yearsExperience: 5,
    whatsapp: "213666888001", sessionPrice: 2000,
  });
  const counselor = (await req("POST", "/api/counselor", { action: "login", email: cEmail, password: "pass-tumaanina-1" })).json.user;
  const meProf = await req("GET", `/api/counselor?userId=${counselor.id}`);
  await req("POST", "/api/admin", { action: "verify", profileId: meProf.json?.profile?.id });

  /* ─── 2) الإشعارات بأسماء الطرفين ─── */
  console.log("\n── 2) إشعارات تحولات الحالة بأسماء الأطراف ──");
  const when = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
  const b = await req("POST", "/api/sessions", { victimId: client.id, counselorId: counselor.id, topic: "anxiety", mode: "TEXT", scheduledAt: when, currency: "DZD" });
  const sid = b.json?.session?.id;
  check("الحجز نجح", b.status === 200);
  await wait(800); /* الإشعار fire-and-forget */
  const cNotifs = (await req("GET", `/api/notifications?userId=${counselor.id}`)).json?.notifications || [];
  const booked = cNotifs.find((n) => (n.title || "").includes("طلب استشارة"));
  check("الأخصائي وصلته واقعة «طلب استشارة»", !!booked, JSON.stringify(cNotifs.slice(0, 1)));
  check("الإشعار يذكر اسم العميل", !!booked && (booked.body || "").includes("عميل-الإشعارات"), booked?.body);

  const acc = await req("PATCH", `/api/sessions/${sid}`, { status: "ACCEPTED", durationMinutes: 45 });
  check("القبول نجح", acc.status === 200 && acc.json?.ok);
  await wait(800);
  const vNotifs = (await req("GET", `/api/notifications?userId=${client.id}`)).json?.notifications || [];
  const accepted = vNotifs.find((n) => (n.title || "").includes("تأكيد حجز"));
  check("العميل وصلته واقعة «تأكيد الحجز»", !!accepted);
  check("إشعار القبول يذكر اسم الأخصائي", !!accepted && (accepted.body || "").includes("د. إشعارات الأسماء"), accepted?.body);

  const rs = await req("PATCH", `/api/sessions/${sid}`, { rescheduleTo: new Date(Date.now() + 72 * 3600 * 1000).toISOString(), rescheduledBy: "COUNSELOR" });
  check("تغيير الموعد نجح", rs.status === 200 && rs.json?.ok);
  await wait(800);
  const vNotifs2 = (await req("GET", `/api/notifications?userId=${client.id}`)).json?.notifications || [];
  const resched = vNotifs2.find((n) => (n.title || "").includes("تغيير موعد"));
  check("إشعار تغيير الموعد يذكر اسم من غيّر (الأخصائي)", !!resched && (resched.body || "").includes("د. إشعارات الأسماء"), resched?.body);

  const cc = await req("PATCH", `/api/sessions/${sid}`, { status: "CANCELLED", cancelledBy: "VICTIM" });
  check("إلغاء العميل نجح", cc.status === 200);
  await wait(800);
  const cNotifs2 = (await req("GET", `/api/notifications?userId=${counselor.id}`)).json?.notifications || [];
  const cancelled = cNotifs2.find((n) => (n.title || "").includes("ألغى العميل"));
  check("إشعار الإلغاء يذكر اسم العميل", !!cancelled && (cancelled.body || "").includes("عميل-الإشعارات"), cancelled?.body);

  /* ─── 3) فريق الإدارة ─── */
  console.log("\n── 3) فريق الإدارة بصلاحياته ──");
  const st = await req("POST", "/api/admin", { action: "staff-create", staffName: "مسير المحتوى", email: `mgr-${Date.now()}@test.dz`, password: "pass-tumaanina-1", staffRole: "MANAGER" });
  check("المالك ينشئ حساب مسير", st.status === 200 && st.json?.ok, JSON.stringify(st.json));
  const st2 = await req("POST", "/api/admin", { action: "staff-create", staffName: "أدمين ثانٍ", email: `adm-${Date.now()}@test.dz`, password: "pass-tumaanina-1", staffRole: "ADMIN" });
  check("المالك ينشئ حساب أدمين", st2.status === 200 && st2.json?.ok);
  const dup = await req("POST", "/api/admin", { action: "staff-create", staffName: "مكرر", email: `mgr-${Date.now()}@test.dz`, password: "pass-tumaanina-1", staffRole: "MANAGER" });
  check("تكرار البريد مستحيل — (نفس البريد الجديد مختلف) يُنشأ", dup.status === 200);

  const list = await req("POST", "/api/admin", { action: "staff-list" });
  check("قائمة الفريق تعمل وتشمل المالك", list.json?.staff?.length >= 3 && list.json.staff.some((s) => s.staffRole === "SUPER"));

  /* دخول المسير */
  const mgrMail = `mgr-${Date.now() - 1000}@test.dz`;
  /* استرجع بريد المسير من القائمة */
  const mgrRow = (list.json?.staff || []).find((s) => s.staffRole === "MANAGER");
  const mgrLogin = await req("POST", "/api/admin", { action: "staff-login", email: mgrRow?.email, password: "pass-tumaanina-1" });
  check("دخول المسير بالبريد وكلمة المرور يعمل", mgrLogin.json?.ok === true && mgrLogin.json?.user?.staffRole === "MANAGER" && !!mgrLogin.json?.token);
  const MGR_TOKEN = mgrLogin.json?.token || "";

  /* صلاحيات المسير: ممنوع من الحذف، مسموح له بالإشعارات */
  const mgrDelete = await req("POST", "/api/admin", { action: "delete-user", userId: client.id }, { "x-admin-token": MGR_TOKEN });
  check("المسير مرفوض من حذف حساب (403)", mgrDelete.status === 403, `got=${mgrDelete.status}`);
  const mgrVerify = await req("POST", "/api/admin", { action: "unverify", profileId: "x" }, { "x-admin-token": MGR_TOKEN });
  check("المسير مرفوض من التوثيق/إلغائه (403)", mgrVerify.status === 403, `got=${mgrVerify.status}`);
  const mgrNotify = await req("POST", "/api/admin", { action: "bulk-notify", target: "ALL_CLIENTS_NOT_REAL", identifier: client.pseudonym || "عميل-الإشعارات", textAr: "رسالة" }, { "x-admin-token": MGR_TOKEN });
  const mgrNotify2 = await req("POST", "/api/admin", { action: "bulk-notify", target: "USER", identifier: "عميل-الإشعارات", textAr: "مرحباً" }, { "x-admin-token": MGR_TOKEN });
  check("المسير يستطيع إرسال إشعار لمستخدم", mgrNotify2.status === 200 && mgrNotify2.json?.ok === true, `got=${mgrNotify2.status}`);
  const mgrStaff = await req("POST", "/api/admin", { action: "staff-list" }, { "x-admin-token": MGR_TOKEN });
  check("المسير مرفوض من إدارة الفريق (403)", mgrStaff.status === 403, `got=${mgrStaff.status}`);

  /* الأدمين الثانوي: يدير كل شيء عدا الفريق */
  const admRow = (list.json?.staff || []).find((s) => s.staffRole === "ADMIN" && s.email);
  const admLogin = await req("POST", "/api/admin", { action: "staff-login", email: admRow?.email, password: "pass-tumaanina-1" });
  const ADM_TOKEN = admLogin.json?.token || "";
  check("دخول الأدمين الثانوي يعمل", admLogin.json?.ok === true && !!ADM_TOKEN);
  const admStaff = await req("POST", "/api/admin", { action: "staff-create", staffName: "x", email: `zz-${Date.now()}@t.dz`, password: "pass-tumaanina-1" }, { "x-admin-token": ADM_TOKEN });
  check("الأدمين الثانوي مرفوض من إنشاء فريق (403)", admStaff.status === 403, `got=${admStaff.status}`);
  const admUsers = await req("POST", "/api/admin", { action: "list-users" }, { "x-admin-token": ADM_TOKEN });
  check("الأدمين الثانوي يقرأ الحسابات", admUsers.status === 200);

  /* حماية المالك الأصلي */
  const masterRow = (list.json?.staff || []).find((s) => s.isMaster);
  check("المالك الأصلي معلّم isMaster (رمز البيئة بلا بريد)", !!masterRow);
  const delMaster = await req("POST", "/api/admin", { action: "staff-delete", userId: masterRow?.id });
  check("حذف المالك الأصلي ممنوع (PROTECTED)", delMaster.status === 400 && delMaster.json?.error === "PROTECTED");

  /* تعليق وتنشيط وحذف مسير */
  const susp = await req("POST", "/api/admin", { action: "staff-toggle", userId: mgrRow?.id, suspended: true });
  check("تعليق مسير نجح", susp.status === 200 && susp.json?.ok);
  const mgrLogin2 = await req("POST", "/api/admin", { action: "staff-login", email: mgrRow?.email, password: "pass-tumaanina-1" });
  check("مسير معلّق لا يستطيع الدخول (403)", mgrLogin2.status === 403 && mgrLogin2.json?.error === "SUSPENDED");
  const del = await req("POST", "/api/admin", { action: "staff-delete", userId: mgrRow?.id });
  check("حذف مسير نجح", del.status === 200 && del.json?.ok);

  /* ─── 5) العبارات ─── */
  console.log("\n── 4) مكتبة العبارات ──");
  const q = await req("GET", "/api/quotes");
  check("120 عبارة مزروعة (90 + 30 جديدة)", (q.json?.quotes?.length || 0) >= 120, `got=${q.json?.quotes?.length}`);
  check("العبارة المطلوبة موجودة", (q.json?.quotes || []).some((x) => (x.textAr || "").includes("همّك وحدك")));

  /* ─── 6) فحوصات الملفات ─── */
  console.log("\n── 5) الميزات الجديدة في الملفات ──");
  const sr = fs.readFileSync("src/components/session/session-room.tsx", "utf-8");
  check("دردشة الغرفة بنافذة + زر (chatOpen/openChat)", sr.includes("setChatOpen(true)") && sr.includes("t.session.chatTitle"));
  const bp = fs.readFileSync("src/components/shared/booking-popup.tsx", "utf-8");
  check("نافذة الحجز المنبثقة موجودة بكل الأزرار", bp.includes("bpop.acceptBtn") && bp.includes("bpop.skipBtn") && bp.includes("openDm"));
  /* v1.5.0: النافذة صارت عالمية في page.tsx (تظهر في كل صفحات الأخصائي وبعد الولوج مباشرة) */
  check("النافذة عالمية في page.tsx (v1.5.0: بند 3)", fs.readFileSync("src/app/page.tsx", "utf-8").includes("<BookingPopups />"));
  const dlg = fs.readFileSync("src/components/ui/dialog.tsx", "utf-8");
  check("زر الإغلاق الموحد بلون المنصة (primary hover)", dlg.includes("hover:bg-primary hover:text-white") && dlg.includes("hover:rotate-90"));
  let byline = true;
  for (const l of ["ar", "fr", "en", "tr", "ru", "zh"]) {
    const s = fs.readFileSync(`src/lib/i18n/${l}.ts`, "utf-8");
    if (!s.includes("MADOUNINE Hacene")) { byline = false; console.log(`    byline مفقود في ${l}`); }
  }
  check("اسم المطور MADOUNINE Hacene لاتينياً ×6", byline);
  const grat = fs.readFileSync("src/app/api/gratitude/route.ts", "utf-8");
  check("صفحة الشكر بلا لغة تطوع", !grat.includes("المتطوعين") && !grat.includes("bénévoles") && !grat.includes("volunteer"));
  const hero = fs.readFileSync("src/lib/i18n/ar.ts", "utf-8");
  /* v1.5.0: صياغة الهبوط تحدّثت — الاستشارة صوتية أو مرئية عبر واتساب والدردشة مساندة */
  check("عبارة الهبوط تذكر واتساب (صيغة v1.5.0)", hero.includes("صوتية أو مرئية عبر واتساب"));
  check("fontScale بسقف ذكي للهاتف", fs.readFileSync("src/app/page.tsx", "utf-8").includes("const cap = w < 400 ? 115"));
  check("أنيميشن البطاقات في CSS", fs.readFileSync("src/app/globals.css", "utf-8").includes('[data-slot="card"]:hover'));
  const models = fs.readFileSync("src/lib/models.ts", "utf-8");
  check("مخطط الفريق (staffRole) في النماذج", models.includes('"SUPER", "ADMIN", "MANAGER"'));
  check("admin-auth: بوابة HMAC موجودة", fs.existsSync("src/lib/server/admin-auth.ts"));

  server.kill();
  await mongod.stop();
  console.log("\n" + "═".repeat(56));
  if (failures === 0) console.log("🎉 كل اختبارات v1.4.0 خضراء");
  else { console.log(`💥 ${failures} فحوصات حمراء`); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
