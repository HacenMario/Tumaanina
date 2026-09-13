/**
 * طمأنينة — Tumaanina Nafsi
 * ─────────────────────────────────────────────────────────────────
 * خادم موحّد: Next.js (الواجهة + REST API) + Socket.io (المحادثة الفورية)
 * في عملية واحدة وعلى منفذ واحد — جاهز للنشر المباشر على Railway.
 *
 * قاعدة البيانات: MongoDB (mongoose) — MONGODB_URI في .env
 *
 * التطوير:  npm run dev
 * الإنتاج:  npm run build && npm start
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const webpush = require("web-push");

/* ─── إعدادات افتراضية تضمن الإقلاع بدون أي متغيرات بيئة إلزامية ─── */
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/tumaanina";

/* وضع الإنتاج: عبر الراية --prod أو متغير NODE_ENV=production (متوافق Windows وLinux) */
const DEV = !process.argv.includes("--prod") && process.env.NODE_ENV !== "production";
/* v1.1.0: المنفذ 3020 افتراضياً — استقلال تام عن أي تطبيق آخر مثبَّت على 3000 */
const PORT = Number(process.env.PORT) || 3020;
const CRISIS_KEYWORDS = require("./shared/crisis-keywords.json");

fs.mkdirSync(DATA_DIR, { recursive: true });

function detectCrisis(content) {
  const lower = String(content).toLowerCase();
  for (const kw of CRISIS_KEYWORDS) {
    if (lower.includes(String(kw).toLowerCase())) return kw;
  }
  return null;
}

/* ─── مخططات مبسطة للشات (نفس مجموعات Next API: sessions/messages/crisis_logs) ─── */
const MessageSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "SupportSession", default: null, index: true },
    threadKey: { type: String, default: null, index: true },
    senderRole: { type: String, default: "SYSTEM" },
    senderName: { type: String, default: null },
    /* v1.5.0: مطابقة models.ts — معرّف المرسل + نوع الرسالة + تعديل/حذف ناعم
       (أي حقل يُضاف هنا يجب أن يُضاف لمخطط models.ts أيضاً وإلا أسقطه strict mode) */
    senderId: { type: String, default: null, index: true },
    type: { type: String, enum: ["text", "voice"], default: "text" },
    content: { type: String, required: true },
    editedAt: { type: Date, default: null },
    deleted: { type: Boolean, default: false },
    /* v1.6.0: مدة الرسالة الصوتية بالثواني — يجب أن يطابق models.ts حرفياً */
    seconds: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "messages" }
);

const SupportSessionSchema = new mongoose.Schema(
  {
    victimId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    counselorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    topic: { type: String, required: true },
    mode: { type: String, enum: ["TEXT", "VOICE", "VIDEO"], default: "TEXT" },
    scheduledAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "ACTIVE", "COMPLETED", "CANCELLED"],
      default: "PENDING",
    },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    /* خطة ما بعد الجلسة: موعد الجلسة التالية أو إنهاء العلاج (يقرره الأخصائي) */
    followUpAt: { type: Date, default: null },
    treatmentEnded: { type: Boolean, default: false },
    /* مصدر إنشاء الجلسة: FOLLOW_UP = أُنشئت تلقائياً من موعد متابعة */
    source: { type: String, default: null },
    /* تذكير ما قبل الموعد بساعة — timestamp آخر إرسال لمنع التكرار */
    reminderSentAt: { type: Date, default: null },
    /* نبض الحضور داخل غرفة الجلسة (يتحدث من واجهة REST للحضور) */
    victimLastSeenAt: { type: Date, default: null },
    counselorLastSeenAt: { type: Date, default: null },
    /* v1.6.0: أول دخول للعميل الغرفة — يجب أن يطابق models.ts حرفياً */
    victimFirstSeenAt: { type: Date, default: null },
    /* v2.6.0: وُشِر الطلب كـ«تأخر +36 ساعة» — يجب أن يطابق مخطط Next (models.ts)
       وإلا فقد strict mode يحذف الحقل من $set عند تحديث المسح الدوري */
    lateFlagged: { type: Boolean, default: false },
    moodBefore: { type: Number, default: null },
    moodAfter: { type: Number, default: null },
    notes: { type: String, default: null },
    crisisFlag: { type: Boolean, default: false },
    /* v2.9.0: مدة الجلسة + سبب الرفض + من ألغى + تغييرات الموعد */
    durationMinutes: { type: Number, default: null },
    cancelReason: { type: String, default: null },
    cancelledBy: { type: String, default: null },
    rescheduleCount: { type: Number, default: 0 },
    lastRescheduledAt: { type: Date, default: null },
    /* v1.1.0 (طمأنينة): سعر الجلسة بالدينار الجزائري (للعرض فقط) —
       يجب أن يطابق models.ts حرفياً (server.js يُحمَّل قبل Next
       فيُسجّل الموديل أولاً على نفس نسخة mongoose) */
    price: { type: Number, default: null },
    /* v1.3.0: عملة السعر (DZD/EUR/USD) — يجب أن يطابق models.ts حرفياً
       وإلا أسقط strict mode الحقل عند إنشاء الجلسة بعملة العميل */
    currency: { type: String, enum: ["DZD", "EUR", "USD"], default: "DZD" },
  },
  { timestamps: true, collection: "sessions" }
);

const CrisisLogSchema = new mongoose.Schema(
  {
    sessionId: { type: String, default: null },
    source: { type: String, default: "CLIENT" },
    phrase: { type: String, required: true },
    action: { type: String, default: "CRISIS_BANNER_SHOWN" },
    /* من كتب العبارة: VICTIM | COUNSELOR — null للسجلات القديمة (v2.5.4) */
    saidBy: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "crisis_logs" }
);

/* مخططات الإشعارات (نفس مجموعات Next API) — للتذكيرات المسبقة بالموعد */
const InAppNotificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    key: { type: String, default: null },
    title: { type: String, default: "" },
    body: { type: String, default: "" },
    url: { type: String, default: "/" },
    read: { type: Boolean, default: false },
    /* v1.6.0: متغيرات القالب — يجب أن يطابق models.ts حرفياً */
    vars: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "notifications" }
);

const PushSubscriptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: { type: String, default: "VICTIM" },
    endpoint: { type: String, required: true, unique: true },
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "push_subscriptions" }
);

/* استخدم موديلات موجودة إن سجّلتها مسارات Next في نفس العملية (dev hot-reload) */
const MessageModel = mongoose.models.Message || mongoose.model("Message", MessageSchema);
const SessionModel =
  mongoose.models.SupportSession || mongoose.model("SupportSession", SupportSessionSchema);
const CrisisLogModel = mongoose.models.CrisisLog || mongoose.model("CrisisLog", CrisisLogSchema);
const NotificationModel =
  mongoose.models.InAppNotification || mongoose.model("InAppNotification", InAppNotificationSchema);
const PushSubModel =
  mongoose.models.PushSubscription || mongoose.model("PushSubscription", PushSubscriptionSchema);

/* قراءة لغة المستخدم مباشرة من المجموعة الخام — لا نسجّل موديل User هنا إطلاقاً
   (تسجيله بمخطط مقطوع يفسد موديل models.ts المشترك في نفس العملية:
   strictQuery يُسقط حقول الفلترة غير المعرّفة فيفشل تسجيل الدخول والحجز) */
async function userLanguage(userId) {
  try {
    const col = mongoose.connection.collection("users");
    const u = await col.findOne(
      { _id: new mongoose.Types.ObjectId(String(userId)) },
      { projection: { language: 1 } }
    );
    /* v1.0.0: اللغات الست كاملة — كانت tr/ru/zh تُسقط إلى العربية */
    return u && ["ar", "fr", "en", "tr", "ru", "zh"].includes(u.language) ? u.language : "ar";
  } catch {
    return "ar";
  }
}

/* ─── التذكير المسبق بالموعد بساعة (إشعار داخل المنصة + إشعار فوري على الهاتف) ──
   يفحص كل دقيقة الجلسات القادمة (PENDING/ACCEPTED) التي يقع موعدها بعد
   55–65 دقيقة من الآن ولم يُرسل لها تذكير بعد — idempotent عبر reminderSentAt.
   نفس المنطق مكرر في src/lib/server/reminders.ts ليعمل أيضاً على Vercel. */
const REMINDER_TEXTS = {
  ar: { title: "⏰ تذكير: جلستك بعد ساعة", body: "جلستك في «طمأنينة» بعد ساعة تقريباً — الغرفة تنتظركما" },
  fr: { title: "⏰ Rappel : votre séance dans une heure", body: "Votre séance sur Tumaanina commence dans une heure — la salle vous attend" },
  en: { title: "⏰ Reminder: your session in one hour", body: "Your Tumaanina session starts in about an hour — the room is waiting for you" },
  tr: { title: "⏰ Hatırlatma: seansınız bir saat sonra", body: "Tumaanina seansınız bir saat içinde başlıyor — oda sizi bekliyor" },
  ru: { title: "⏰ Напоминание: сессия через час", body: "Ваша сессия Tumaanina начнётся примерно через час — комната ждёт вас" },
  zh: { title: "⏰ 提醒：您的会话将在一小时后开始", body: "您的「心灵伴侣」会话约一小时后开始——房间正在等候二位" },
};

async function sendDueReminders() {
  try {
    const now = Date.now();
    const due = await SessionModel.find({
      status: { $in: ["PENDING", "ACCEPTED"] },
      scheduledAt: { $gte: new Date(now + 55 * 60 * 1000), $lte: new Date(now + 65 * 60 * 1000) },
      reminderSentAt: null,
    })
      .select("_id victimId counselorId reminderSentAt")
      .limit(20)
      .lean();

    for (const s of due) {
      /* حجز ذري: من يضبط reminderSentAt أولاً يفوز — يمنع التكرار بين Vercel وRailway */
      const claim = await SessionModel.updateOne(
        { _id: s._id, reminderSentAt: null },
        { $set: { reminderSentAt: new Date() } }
      );
      if (!claim.modifiedCount) continue;

      for (const userId of [String(s.victimId), String(s.counselorId)]) {
        try {
          const lang = await userLanguage(userId);
          const txt = REMINDER_TEXTS[lang];
          await NotificationModel.create({ userId, key: "reminder", title: txt.title, body: txt.body, url: "/" }).catch(() => {});

          const subs = await PushSubModel.find({ userId }).lean();
          await Promise.all(
            subs.map(async (sub) => {
              try {
                await webpush.sendNotification(
                  { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                  JSON.stringify({ title: txt.title, body: txt.body, url: "/" })
                );
              } catch (err) {
                const code = err && err.statusCode;
                if (code === 404 || code === 410) await PushSubModel.findByIdAndDelete(sub._id).catch(() => {});
              }
            })
          );
        } catch (e) {
          console.error("[REMINDER] فشل إشعار المستخدم:", e.message);
        }
      }
      console.log(`[REMINDER] أُرسل تذكير الجلسة ${s._id} للطرفين`);
    }
  } catch (e) {
    console.error("[REMINDER] خطأ دورة التذكير:", e.message);
  }
}

async function main() {
  /* ─── الاتصال بـ MongoDB أولاً ─── */
  const safeUri = MONGODB_URI.replace(/\/\/([^@/]*)@/, "//***:***@");
  try {
    mongoose.set("strictQuery", true);
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    console.log(`🗄️  MongoDB متصل: ${safeUri}`);
  } catch (e) {
    /* وضع محدود بدل الإسقاط: الصفحات والملفات الثابتة تعمل،
       وواجهات القاعدة ستفشل لكل طلب حتى يتوفر الاتصال */
    console.error("⚠️  تعذر الاتصال بـ MongoDB — تحقق من MONGODB_URI في .env");
    console.error("   التفاصيل:", e.message);
    console.error("   ▶ الخادم سيستمر بالعمل بوضع محدود (بلا قاعدة بيانات).");
  }

  const next = require("next");
  const { Server } = require("socket.io");

  const app = next({ dev: DEV, dir: process.cwd() });
  const handle = app.getRequestHandler();
  await app.prepare();

  const server = http.createServer((req, res) => handle(req, res));

  /* Socket.io على نفس الخادم والمنفذ — مسار /socket.io */
  const io = new Server(server, {
    path: "/socket.io",
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e6,
  });

  /* ─── جسر REST → Socket.io ───
     مسارات Next API (مثل POST /api/messages) تعمل في نفس العملية على
     Railway، فتسجل هذا الجسر في globalThis لتنشر الرسائل لحظياً لغرف
     الجلسات. على Vercel (serverless) الجسر غير موجود والعميل يتحول
     تلقائياً لوضع المزامنة (استقصاء REST). */
  globalThis.__tumaaninaEmit = (room, event, payload) => {
    try {
      io.to(room).emit(event, payload);
    } catch (e) {
      console.error("[CHAT] فشل بث الجسر:", e.message);
    }
  };

  /* تمرير ترقيات WebSocket الأخرى (HMR في التطوير) إلى Next */
  try {
    const upgradeHandler = app.getUpgradeHandler();
    server.on("upgrade", (req, socket, head) => {
      if (!req.url || !req.url.startsWith("/socket.io")) {
        upgradeHandler(req, socket, head);
      }
    });
  } catch (_) {
    /* اختياري */
  }

  /* ─── منطق غرف الجلسات الفورية (نفس بروتوكول العميل) ─── */
  const rooms = new Map();

  io.on("connection", (socket) => {
    socket.on("join_session", ({ sessionId, role, name }) => {
      if (!sessionId || !role) return;
      socket.join(sessionId);
      if (!rooms.has(sessionId)) rooms.set(sessionId, new Map());
      const room = rooms.get(sessionId);
      room.set(socket.id, { socketId: socket.id, role, name: name || role });
      io.to(sessionId).emit("presence", {
        members: [...room.values()].map((m) => ({ role: m.role, name: m.name })),
        joined: { role, name },
      });
      console.log(`[CHAT] انضمام ${role} → الغرفة ${sessionId} (${room.size})`);
    });

    socket.on("text_message", async ({ sessionId, role, name, content }) => {
      if (!sessionId || !content || !String(content).trim()) return;
      const message = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sessionId,
        senderRole: role,
        senderName: name,
        content: String(content).slice(0, 4000),
        createdAt: new Date().toISOString(),
      };
      io.to(sessionId).emit("text_message", message);

      try {
        await MessageModel.create({
          sessionId,
          senderRole: role || "SYSTEM",
          senderName: name || null,
          content: message.content,
        });
      } catch (e) {
        console.error("[CHAT] تعذر حفظ الرسالة:", e.message);
      }

      /* كشف عبور الخط الأحمر → بروتوكول الأزمة */
      const phrase = detectCrisis(message.content);
      if (phrase) {
        io.to(sessionId).emit("crisis_alert", { phrase, at: new Date().toISOString() });
        try {
          await CrisisLogModel.create({
            sessionId,
            source: "CHAT_SERVER",
            phrase,
            action: "CRISIS_BANNER_SHOWN",
            saidBy: role || null,
          });
          await SessionModel.updateOne(
            { _id: sessionId },
            { $set: { crisisFlag: true } }
          ).catch(() => {});
        } catch (e) {
          console.error("[CHAT] تعذر تسجيل حالة الأزمة:", e.message);
        }
      }
    });

    socket.on("typing", ({ sessionId, role, typing }) => {
      if (!sessionId) return;
      socket.to(sessionId).emit("typing", { role, typing: !!typing });
    });

    socket.on("session_event", ({ sessionId, event, by }) => {
      if (!sessionId) return;
      io.to(sessionId).emit("session_event", { event, by, at: new Date().toISOString() });
    });

    socket.on("disconnect", () => {
      for (const [sessionId, room] of rooms.entries()) {
        const member = room.get(socket.id);
        if (member) {
          room.delete(socket.id);
          if (room.size === 0) rooms.delete(sessionId);
          else {
            io.to(sessionId).emit("presence", {
              members: [...room.values()].map((m) => ({ role: m.role, name: m.name })),
              left: { role: member.role, name: member.name },
            });
          }
        }
      }
    });
  });

  /* ─── الإقلاع ─── */
  server.listen(PORT, () => {
    console.log("────────────────────────────────────────────────");
    console.log(`🟢 طمأنينة — الخادم الموحّد يعمل (${DEV ? "تطوير" : "إنتاج"})`);
    console.log(`   الإصدار:     v1.14.0`);
    console.log(`   العنوان:     http://localhost:${PORT}`);
    console.log(`   فحص الصحة:   http://localhost:${PORT}/api/health`);
    console.log(`   قاعدة البيانات: ${safeUri}`);
    console.log(`   Socket.io:   /socket.io (نفس المنفذ)`);
    console.log("────────────────────────────────────────────────");
    /* إن رأيت 404 على /api/push أو أي مسار جديد فهذا يعني نسخة .next قديمة:
       احذف مجلد .next وأعد التشغيل (dev) أو أعد npm run build (إنتاج) */
  });

  /* مجدول التذكيرات المسبقة بالموعد — كل دقيقة */
  const reminderTimer = setInterval(sendDueReminders, 60 * 1000);
  reminderTimer.unref?.();
  sendDueReminders();
}

main().catch((e) => {
  console.error("❌ فشل إقلاع الخادم:", e);
  process.exit(1);
});

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
