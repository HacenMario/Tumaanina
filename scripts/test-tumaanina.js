/**
 * اختبار طمأنينة v1.0.0 — النسخة التجارية المدفوعة
 * ─────────────────────────────────────────────────────────────
 *  1. الخادم v1.0.0 (service: tumaanina) جاهز
 *  2. تسجيل عميل مباشر بلا أي توثيق (بلا fireCase/fireStatus)
 *  3. التوثيق للأخصائيين فقط: حجز مع أخصائي غير موثّق → COUNSELOR_UNVERIFIED
 *  4. الحجز بلا رصيد → 402 INSUFFICIENT_BALANCE
 *  5. شحن بطاقة: فشل Luhn → INVALID_CARD | نجاح → رصيد فوري
 *  6. الحجز المدفوع: خصم السعر + جلسة PAID + حركة SESSION_PAYMENT
 *  7. الإلغاء → استرداد كامل + REFUND + إشعار
 *  8. الاكتمال → صرف 80% للأخصائي (EARNING + إشعار) وSETTLED
 *  9. حوالة بنكية PENDING → موافقة الإدارة → إضافة الرصيد + إشعار
 * 10. سحب الأرباح: خصم فوري → رفض إداري → استرداد المبلغ
 * 11. جلسة متابعة UNPAID → دفع من «جلستي» (pay-session)
 * 12. انحدار: actions التوثيق القديمة أُزيلت (Unknown action)
 */
const { MongoMemoryServer } = require("mongodb-memory-server");
const { spawn } = require("child_process");
const http = require("http");

const PORT = String(3400 + (process.pid % 300) + Math.floor(Math.random() * 100));
const BASE = `http://localhost:${PORT}`;
let failures = 0;

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(`${BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}) },
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
  console.log("🧪 اختبار طمأنينة v1.0.0 — المحفظة والتوثيق للأخصائيين فقط");
  console.log("═".repeat(56));

  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri("tumaanina-v1");
  const server = spawn("node", ["server.js"], {
    env: { ...process.env, PORT, MONGODB_URI: uri, ADMIN_PASSCODE: "tum-pass-1", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  server.stderr.on("data", (d) => process.stderr.write(d));
  let ready = false;
  for (let i = 0; i < 60; i++) {
    await wait(500);
    try {
      const h = await req("GET", "/api/health");
      if (h.json?.version === "1.0.0" && h.json?.service === "tumaanina") { ready = true; break; }
    } catch {}
  }
  check("الخادم v1.0.0 (tumaanina) جاهز", ready);
  if (!ready) process.exit(1);

  await req("POST", "/api/admin", { action: "login", passcode: "tum-pass-1" });

  /* ─── 1) عميل: تسجيل مباشر بلا توثيق ─── */
  console.log("\n── 1) تسجيل عميل مباشر ──");
  const client = (await req("POST", "/api/victim", {
    action: "register", pseudonym: "عميل-تجربة", password: "pass-tumaanina-1",
    recoveryPhrase: "عبارة استرجاع تجريبية", gender: "male", phone: "0555777000",
  })).json.user;
  check("تسجيل عميل بدون أي توثيق", !!client?.id);
  check("الحساب بلا fireStatus", !("fireStatus" in (client || {})) && !("fireDeclared" in (client || {})));
  check("رصيد المحفظة يظهر (0)", Number(client?.walletBalance) === 0);

  /* ─── 2) أخصائي: التسجيل بسعر ثم التوثيق الإلزامي ─── */
  console.log("\n── 2) أخصائي بسعر + توثيق إلزامي ──");
  const cEmail = `doc1-${Date.now()}@test.dz`;
  await req("POST", "/api/counselor", {
    action: "register", fullName: "د. طمأنينة التجربة", email: cEmail,
    password: "pass-tumaanina-1", recoveryPhrase: "عبارة اختبار الأخصائي",
    specialties: ["anxietyDepression"], languages: ["ar"], yearsExperience: 7,
    whatsapp: "213666777000", sessionPrice: 20,
  });
  const counselor = (await req("POST", "/api/counselor", { action: "login", email: cEmail, password: "pass-tumaanina-1" })).json.user;
  const meProf = await req("GET", `/api/counselor?userId=${counselor.id}`);
  check("سعر الجلسة محفوظ (20)", Number(meProf.json?.profile?.sessionPrice) === 20);
  check("الأخصائي يبدأ PENDING", meProf.json?.profile?.verificationStatus === "PENDING");

  /* حجز مع أخصائي غير موثّق → مرفوض */
  const blockedBook = await req("POST", "/api/sessions", {
    victimId: client.id, counselorId: counselor.id, topic: "قلق", mode: "TEXT",
    scheduledAt: new Date(Date.now() + 26 * 3600 * 1000).toISOString(),
  });
  check("حجز مع أخصائي غير موثّق مرفوض (COUNSELOR_UNVERIFIED)", blockedBook.status === 403 && blockedBook.json?.error === "COUNSELOR_UNVERIFIED");

  await req("POST", "/api/admin", { action: "verify", profileId: meProf.json?.profile?.id });
  check("الأخصائي موثّق من الإدارة", true);

  /* ─── 3) الحجز بلا رصيد ─── */
  console.log("\n── 3) رفض الحجز بلا رصيد ──");
  const brokeBook = await req("POST", "/api/sessions", {
    victimId: client.id, counselorId: counselor.id, topic: "قلق", mode: "TEXT",
    scheduledAt: new Date(Date.now() + 26 * 3600 * 1000).toISOString(),
  });
  check("402 INSUFFICIENT_BALANCE", brokeBook.status === 402 && brokeBook.json?.error === "INSUFFICIENT_BALANCE", JSON.stringify(brokeBook.json));
  check("المبلغ المطلوب يُعاد (needed=20)", Number(brokeBook.json?.needed) === 20);

  /* ─── 4) شحن البطاقة ─── */
  console.log("\n── 4) شحن المحفظة ببطاقة ──");
  const badCard = await req("POST", "/api/payments", {
    action: "topup-card", userId: client.id, amount: 50,
    cardName: "TEST CLIENT", cardNumber: "4242424242424241", expiry: "12/29", cvc: "123",
  });
  check("بطاقة فاشلة (Luhn) → INVALID_CARD", badCard.status === 400 && badCard.json?.error === "INVALID_CARD");

  const topup = await req("POST", "/api/payments", {
    action: "topup-card", userId: client.id, amount: 100,
    cardName: "TEST CLIENT", cardNumber: "4242 4242 4242 4242", expiry: "12/29", cvc: "123",
  });
  check("شحن 100$ ناجح", topup.status === 200 && Number(topup.json?.balance) === 100, JSON.stringify(topup.json));

  /* ─── 5) الحجز المدفوع ─── */
  console.log("\n── 5) الحجز المدفوع من المحفظة ──");
  const when = new Date(Date.now() + 26 * 3600 * 1000).toISOString();
  const book = await req("POST", "/api/sessions", {
    victimId: client.id, counselorId: counselor.id, topic: "قلق", mode: "TEXT", scheduledAt: when,
  });
  const sid = book.json?.session?.id || book.json?.id;
  check("الحجز نجح", book.status === 200 && !!sid);
  check("السعر مثبّت (20)", Number(book.json?.session?.price) === 20);
  check("الجلسة PAID", book.json?.session?.paymentStatus === "PAID");
  const balAfter = (await req("GET", `/api/payments?userId=${client.id}`)).json;
  check("الرصيد خصم 20$ → 80", Number(balAfter?.balance) === 80, `balance=${balAfter?.balance}`);
  check("حركة SESSION_PAYMENT مسجّلة", (balAfter?.transactions || []).some((t) => t.type === "SESSION_PAYMENT" && Number(t.amount) === -20));

  /* ─── 6) قبول ثم إلغاء العميل → استرداد ─── */
  console.log("\n── 6) الإلغاء → استرداد كامل ──");
  await req("PATCH", `/api/sessions/${sid}`, { status: "ACCEPTED", durationMinutes: 45 });
  await wait(600);
  const n1 = (await req("GET", `/api/notifications?userId=${client.id}`)).json;
  check("إشعار القبول وصل للعميل", (n1?.notifications || []).some((n) => n.key === "accepted"));
  const cancel = await req("PATCH", `/api/sessions/${sid}`, { status: "CANCELLED", cancelledBy: "VICTIM" });
  check("الإلغاء نجح", cancel.status === 200);
  check("الجلسة REFUNDED", cancel.json?.session?.paymentStatus === "REFUNDED");
  const balRefund = (await req("GET", `/api/payments?userId=${client.id}`)).json;
  check("الرصيد استُرد → 100", Number(balRefund?.balance) === 100, `balance=${balRefund?.balance}`);
  check("حركة REFUND مسجّلة", (balRefund?.transactions || []).some((t) => t.type === "REFUND" && Number(t.amount) === 20));
  await wait(700);
  const n2 = (await req("GET", `/api/notifications?userId=${client.id}`)).json;
  check("إشعار الاسترداد وصل", (n2?.notifications || []).some((n) => n.key === "refunded"));

  /* ─── 7) إعادة الحجز + اكتمال → صرف 80% ─── */
  console.log("\n── 7) الاكتمال → أرباح الأخصائي 80% ──");
  const when2 = new Date(Date.now() + 50 * 3600 * 1000).toISOString();
  const book2 = await req("POST", "/api/sessions", {
    victimId: client.id, counselorId: counselor.id, topic: "قلق", mode: "TEXT", scheduledAt: when2,
  });
  const sid2 = book2.json?.session?.id;
  check("إعادة الحجز نجحت (رصيد يكفي)", book2.status === 200 && !!sid2);
  const done = await req("PATCH", `/api/sessions/${sid2}`, { status: "COMPLETED" });
  check("الاكتمال نجح", done.status === 200);
  check("الجلسة SETTLED", done.json?.session?.paymentStatus === "SETTLED");
  const prof2 = (await req("GET", `/api/counselor?userId=${counselor.id}`)).json;
  check("أرباح الأخصائي 16$ (80% من 20)", Number(prof2?.profile?.walletBalance) === 16, `wallet=${prof2?.profile?.walletBalance}`);
  await wait(700);
  const nC = (await req("GET", `/api/notifications?userId=${counselor.id}`)).json;
  check("إشعار الأرباح وصل للأخصائي", (nC?.notifications || []).some((n) => n.key === "earningCredited"));
  const nCli = (await req("GET", `/api/notifications?userId=${client.id}`)).json;
  check("إشعار الاكتمال وصل للعميل", (nCli?.notifications || []).some((n) => n.key === "completed"));

  /* ─── 8) حوالة بنكية → موافقة الإدارة ─── */
  console.log("\n── 8) حوالة بنكية + موافقة الإدارة ──");
  const transfer = await req("POST", "/api/payments", {
    action: "topup-transfer", userId: client.id, amount: 50, reference: "TRX-99881",
  });
  check("الحوالة PENDING", transfer.status === 200 && transfer.json?.pending === true);
  const pendingList = await req("POST", "/api/admin", { action: "payments-list", status: "PENDING" });
  check("تظهر في لوحة المدفوعات", (pendingList.json?.transactions || []).some((t) => t.type === "TOPUP_TRANSFER" && t.ref === "TRX-99881"));
  const txId = (pendingList.json?.transactions || []).find((t) => t.type === "TOPUP_TRANSFER")?.id;
  const approve = await req("POST", "/api/admin", { action: "payment-decide", txId, approve: true });
  check("الموافقة نجحت", approve.status === 200);
  const balT = (await req("GET", `/api/payments?userId=${client.id}`)).json;
  /* 100 شحن − 20 حجز أول + 20 استرداد − 20 حجز ثاني + 50 حوالة = 130 */
  check("الرصيد 130$ بعد الحوالة", Number(balT?.balance) === 130, `balance=${balT?.balance}`);
  await wait(700);
  const nT = (await req("GET", `/api/notifications?userId=${client.id}`)).json;
  check("إشعار topupApproved وصل", (nT?.notifications || []).some((n) => n.key === "topupApproved"));

  /* ─── 9) سحب الأرباح → رفض إداري → استرداد ─── */
  console.log("\n── 9) سحب الأرباح + رفض إداري ──");
  const wd = await req("POST", "/api/payments", { action: "withdraw", userId: counselor.id, amount: 10 });
  check("السحب يخصم فوراً (16→6)", Number(wd.json?.balance) === 6, `balance=${wd.json?.balance}`);
  const wdList = await req("POST", "/api/admin", { action: "payments-list", status: "PENDING", type: "WITHDRAWAL" });
  const wdTx = (wdList.json?.transactions || []).find((t) => t.userId === counselor.id);
  check("طلب السحب ظاهر للإدارة", !!wdTx);
  const reject = await req("POST", "/api/admin", { action: "payment-decide", txId: wdTx?.id, approve: false });
  check("الرفض نجح", reject.status === 200);
  const balW = (await req("GET", `/api/payments?userId=${counselor.id}`)).json;
  check("المبلغ استُرد للمحفظة → 16", Number(balW?.balance) === 16, `balance=${balW?.balance}`);
  await wait(700);
  const nW = (await req("GET", `/api/notifications?userId=${counselor.id}`)).json;
  check("إشعار withdrawalRejected وصل", (nW?.notifications || []).some((n) => n.key === "withdrawalRejected"));

  /* ─── 10) جلسة متابعة UNPAID → دفع من جلساتي ─── */
  console.log("\n── 10) متابعة UNPAID → دفع لاحق ──");
  const when3 = new Date(Date.now() + 74 * 3600 * 1000).toISOString();
  const book3 = await req("POST", "/api/sessions", {
    victimId: client.id, counselorId: counselor.id, topic: "قلق", mode: "TEXT", scheduledAt: when3,
  });
  const sid3 = book3.json?.session?.id;
  const fu = await req("PATCH", `/api/sessions/${sid3}`, { status: "COMPLETED", followUpAt: new Date(Date.now() + 98 * 3600 * 1000).toISOString() });
  check("جلسة المتابعة أُنشئت", fu.status === 200 && !!fu.json?.followUpCreated);
  const fuSession = await req("GET", `/api/sessions/${fu.json?.followUpCreated}`);
  check("المتابعة UNPAID بسعر 20", fuSession.json?.session?.paymentStatus === "UNPAID" && Number(fuSession.json?.session?.price) === 20);
  const balBeforePay = (await req("GET", `/api/payments?userId=${client.id}`)).json;
  const pay = await req("POST", "/api/payments", { action: "pay-session", userId: client.id, sessionId: fu.json?.followUpCreated });
  check("الدفع من جلساتي نجح", pay.status === 200);
  check("الرصيد خصم 20", Number(pay.json?.balance) === Number(balBeforePay?.balance) - 20);
  const fuAfter = await req("GET", `/api/sessions/${fu.json?.followUpCreated}`);
  check("المتابعة صارت PAID", fuAfter.json?.session?.paymentStatus === "PAID");

  /* ─── 11) انحدار: actions التوثيق القديمة أُزيلت ─── */
  console.log("\n── 11) إزالة توثيق العملاء تماماً ──");
  const oldVv = await req("POST", "/api/admin", { action: "victim-verifications" });
  check("victim-verifications لم يعد موجوداً", oldVv.json?.error === "Unknown action");
  const oldVverify = await req("POST", "/api/admin", { action: "verify-victim", victimId: client.id, approve: true });
  check("verify-victim لم يعد موجوداً", oldVverify.json?.error === "Unknown action");

  /* ─── 12) إيرادات المنصة ─── */
  console.log("\n── 12) إيرادات المنصة ──");
  const rev = await req("POST", "/api/admin", { action: "revenue-stats" });
  /* 4 مدفوعات جلسات × 20 = 80 (حجز، إعادة حجز، جلسة book3، دفع المتابعة) */
  check("إجمالي التحصيل 80$", Number(rev.json?.revenue?.grossCollected) === 80, JSON.stringify(rev.json?.revenue));
  /* جلستان مكتملتان أُصرف نصيبهما: 16 + 16 = 32 */
  check("المصروف للأخصائي 32$", Number(rev.json?.revenue?.totalPaidOut) === 32);
  /* إيراد المنصة = 80 − 32 = 48 (عمولة 20%) */
  check("إيراد المنصة 48$ (عمولة)", Number(rev.json?.revenue?.platformRevenue) === 48);

  console.log("═".repeat(56));
  if (failures === 0) console.log("🎉 كل الفحوصات خضراء — طمأنينة v1.0.0 تعمل");
  else { console.log(`⚠️ ${failures} فحص فاشل`); process.exitCode = 1; }

  server.kill();
  await mongod.stop();
  process.exit(process.exitCode || 0);
})();
