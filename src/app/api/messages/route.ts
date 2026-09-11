import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Message, SupportSession, CrisisLog, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";
import { notifyNewMessage, notifyDmMessage, notifyAdminChatMessage, messageExcerpt } from "@/lib/server/notify";
import { SupportSession as SessionModel, User as UserModel } from "@/lib/models";
import CRISIS_KEYWORDS from "../../../../shared/crisis-keywords.json";

export const dynamic = "force-dynamic";

/* نافذة اعتبار الطرف «حاضراً في الغرفة»: آخر نبض أحدث من هذا الحد */
const PRESENCE_WINDOW_MS = 35_000;

/* كشف عبور الخط الأحمر — نفس قائمة server.js لضمان تطابق السلوك */
function detectCrisis(content: string): string | null {
  const lower = String(content).toLowerCase();
  for (const kw of CRISIS_KEYWORDS as string[]) {
    if (lower.includes(String(kw).toLowerCase())) return kw;
  }
  return null;
}

/* جسر البث الفوري: على الخادم الموحّد (server.js / Railway) تسجّل socket.io
   هذه الدالة في globalThis، فتصلك الرسالة المُرسلة عبر REST للغرفة لحظياً.
   على Vercel (serverless) الدالة غير موجودة — يتكفل الاستقصاء في العميل. */
function bridgeEmit(room: string, event: string, payload: unknown) {
  try {
    const emit = (globalThis as { __tumaaninaEmit?: (r: string, e: string, p: unknown) => void }).__tumaaninaEmit;
    if (typeof emit === "function") emit(room, event, payload);
  } catch {
    /* الجسر اختياري — لا يعطل حفظ الرسالة أبداً */
  }
}

async function GET_impl(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  const threadKey = searchParams.get("threadKey"); // v2.8.0: خيوط ما قبل الجلسة
  if (!sessionId && !threadKey) return NextResponse.json({ error: "sessionId or threadKey required" }, { status: 400 });

  const since = searchParams.get("since"); // استقصاء: الرسائل الأحدث من هذا الطابع فقط
  /* v1.5.0: full=1 — سجل كامل (يُستعمل في الاستقصاء لالتقاط التعديلات والحذف
     أيضاً وليس الرسائل الجديدة فقط) */
  const full = searchParams.get("full") === "1";

  await connectDB();
  const filter: Record<string, unknown> = sessionId ? { sessionId } : { threadKey };
  if (since && !full) {
    const d = new Date(since);
    if (!Number.isNaN(d.getTime())) filter.createdAt = { $gt: d };
  }
  const messages = await Message.find(filter)
    .sort({ createdAt: 1 })
    .limit(300)
    .lean();

  /* v1.6.0: الرسائل الصوتية لا تُعيد بيانات الصوت الثقيلة في قائمة الاستقصاء
     (كان كل نبض 4 ثوانٍ يسحب مئات الكيلوبايتات لكل رسالة صوتية!) —
     تُجلب البيانات عند الطلب الفعلي للتشغيل عبر /api/messages/[id]/audio،
     والمدة تُقرأ من حقل seconds المخزّن */
  return NextResponse.json({
    messages: messages.map((m) => ({
      id: String(m._id),
      sessionId: m.sessionId ? String(m.sessionId) : null,
      threadKey: m.threadKey || null,
      senderRole: m.senderRole,
      senderName: m.senderName,
      senderId: (m as { senderId?: string | null }).senderId || null,
      type: (m as { type?: string }).type || "text",
      content: (m as { type?: string }).type === "voice" && !(m as { deleted?: boolean }).deleted ? "" : m.content,
      audioReady: (m as { type?: string }).type === "voice" && !(m as { deleted?: boolean }).deleted,
      seconds: Number((m as { seconds?: number }).seconds) || 0,
      editedAt: (m as { editedAt?: Date | null }).editedAt || null,
      deleted: !!(m as { deleted?: boolean }).deleted,
      createdAt: m.createdAt,
    })),
  });
}

async function POST_impl(req: NextRequest) {
  const body = await req.json();
  const { sessionId, threadKey, senderRole, senderName, senderId, content } = body;
  /* v1.5.0: type=voice — رسالة صوتية (data URL صوتي مضغوط من المتصفح) */
  const msgType = body.type === "voice" ? "voice" : "text";
  /* v1.6.0: مدة الرسالة الصوتية بالثواني — تُخزّن وتُعرض في فقاعة المشغّل */
  const msgSeconds = Math.max(0, Math.min(600, Number(body.seconds) || 0));
  if ((!sessionId && !threadKey) || !senderRole || !content) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  /* رسالة صوتية: يجب أن تكون data URL صوتياً وبحجم معقول (≤ 1.3MB)
     v1.6.0 إصلاح جذري: كان `String(content).slice(0, 4000)` يقتطع الـ data URL
     الصوتي (حجمه الحقيقي مئات الكيلوبايتات) فيُخزَّن ملف تالف لا يُشغَّل
     وتظهر مدته 0 — النص وحده يُقتطع الآن والصوت يُخزَّن كاملاً */
  if (msgType === "voice" && !(String(content).startsWith("data:audio/") && String(content).length <= 1_300_000)) {
    return NextResponse.json({ error: "INVALID_VOICE" }, { status: 400 });
  }
  const contentToStore = msgType === "voice" ? String(content) : String(content).slice(0, 4000);
  await connectDB();

  /* ─── v2.9.0: فضاء الأخصائيين — دردشة جماعية خاصة بين المختصين ───
     خيط ثابت threadKey = "counselors" — الإرسال للأخصائيين المسجلين فقط،
     والقراءة متاحة لكل من يستعلم بالخيط نفسه (الواجهة تعرضه للمختصين حصراً). */
  if (threadKey === "counselors") {
    if (senderRole !== "COUNSELOR") {
      return NextResponse.json({ error: "NOT_ALLOWED" }, { status: 403 });
    }
    /* تحقق اختياري من الحساب إن أُرسل senderId */
    if (senderId) {
      const u = (await UserModel.findById(senderId).select("role suspended").lean()) as {
        role?: string;
        suspended?: boolean;
      } | null;
      if (!u || u.role !== "COUNSELOR" || u.suspended) {
        return NextResponse.json({ error: "NOT_ALLOWED" }, { status: 403 });
      }
    }
    const message = await Message.create({
      threadKey: "counselors",
      senderRole,
      senderName: senderName || null,
      senderId: typeof senderId === "string" ? senderId : null,
      type: msgType,
      seconds: msgSeconds,
      content: contentToStore,
    });
    const payload = {
      id: String(message._id),
      sessionId: null,
      threadKey: "counselors",
      senderRole: message.senderRole,
      senderName: message.senderName,
      senderId: (message as { senderId?: string | null }).senderId || null,
      type: msgType,
      seconds: msgSeconds,
      content: message.content,
      audioReady: msgType === "voice",
      editedAt: null,
      deleted: false,
      createdAt: message.createdAt,
    };
    bridgeEmit("counselors", "counselor_message", payload);
    return NextResponse.json({ ok: true, message: payload, crisis: null });
  }

  /* ─── v2.10.0: محادثة المختص المباشرة مع الإدارة ───
     خيط لكل مختص: threadKey = "admin:{counselorId}" — يظهر في واجهة
     «التواصل مع الإدارة» للمختص حصراً، وتردّ عليه الإدارة من لوحتها.
     الإرسال للأدوار المصرّح بها فقط (المختص صاحب الخيط أو ADMIN)،
     مع إشعارات فورية للطرف الغائب (نفس منطق محادثة ما قبل الجلسة). */
  if (threadKey && String(threadKey).startsWith("admin:")) {
    const counselorId = String(threadKey).split(":")[1] || "";
    if (!/^[a-f\d]{24}$/i.test(counselorId)) {
      return NextResponse.json({ error: "BAD_THREAD" }, { status: 400 });
    }
    const counselor = (await UserModel.findById(counselorId).select("role suspended").lean()) as {
      role?: string;
      suspended?: boolean;
    } | null;
    if (!counselor || counselor.role !== "COUNSELOR" || counselor.suspended) {
      return NextResponse.json({ error: "BAD_THREAD" }, { status: 400 });
    }
    if (senderRole === "COUNSELOR") {
      /* المختص يكتب في خيطه هو فقط */
      if (!senderId || String(senderId) !== counselorId) {
        return NextResponse.json({ error: "NOT_ALLOWED" }, { status: 403 });
      }
      const u = (await UserModel.findById(senderId).select("role suspended").lean()) as {
        role?: string;
        suspended?: boolean;
      } | null;
      if (!u || u.role !== "COUNSELOR" || u.suspended) {
        return NextResponse.json({ error: "NOT_ALLOWED" }, { status: 403 });
      }
    } else if (senderRole !== "ADMIN") {
      return NextResponse.json({ error: "NOT_ALLOWED" }, { status: 403 });
    }

    const message = await Message.create({
      threadKey,
      senderRole,
      senderName: senderName || null,
      senderId: typeof senderId === "string" ? senderId : null,
      type: msgType,
      seconds: msgSeconds,
      content: contentToStore,
    });
    const payload = {
      id: String(message._id),
      sessionId: null,
      threadKey,
      senderRole: message.senderRole,
      senderName: message.senderName,
      senderId: (message as { senderId?: string | null }).senderId || null,
      type: msgType,
      seconds: msgSeconds,
      content: message.content,
      audioReady: msgType === "voice",
      editedAt: null,
      deleted: false,
      createdAt: message.createdAt,
    };

    bridgeEmit(threadKey, "dm_message", payload);

    /* إشعار الطرف الغائب: من المختص → حسابات الإدارة، ومن الإدارة → المختص */
    void notifyAdminChatMessage({
      fromAdmin: senderRole === "ADMIN",
      counselorId,
      senderName: String(senderName || ""),
      excerpt: messageExcerpt(String(content)),
    }).catch(() => {});

    return NextResponse.json({ ok: true, message: payload, crisis: null });
  }

  /* ─── v2.8.0: خيوط التواصل قبل الجلسة (DM) ───
     العميل يبدأ المحادثة مع أي أخصائي موثّق متاح، والأخصائي يرد أو يبادر
     مع من له معه طلب/جلسة قائمة. الرسائل تُخزَّن بلا sessionId (threadKey فقط). */
  if (threadKey) {
    const parts = String(threadKey).split(":");
    if (parts.length !== 3 || parts[0] !== "dm") {
      return NextResponse.json({ error: "BAD_THREAD" }, { status: 400 });
    }
    const victimId = parts[1];
    const counselorId = parts[2];
    const victim = (await UserModel.findById(victimId).select("role").lean()) as { role?: string } | null;
    const counselor = (await UserModel.findById(counselorId).select("role").lean()) as { role?: string } | null;
    if (!victim || !counselor || victim.role !== "VICTIM" || counselor.role !== "COUNSELOR") {
      return NextResponse.json({ error: "BAD_THREAD" }, { status: 400 });
    }
    /* صلاحية الإرسال: عميل يراسل بحرية؛ أخصائي يراسل من له معه جلسة/طلب
       أو سبق أن راسله العميل في هذا الخيط */
    if (senderRole === "COUNSELOR") {
      const hasSession = await SessionModel.exists({ victimId, counselorId });
      const hasThread = await Message.exists({ threadKey, senderRole: "VICTIM" });
      if (!hasSession && !hasThread) {
        return NextResponse.json({ error: "NOT_ALLOWED" }, { status: 403 });
      }
    } else if (senderRole !== "VICTIM") {
      return NextResponse.json({ error: "NOT_ALLOWED" }, { status: 403 });
    }

    const message = await Message.create({
      threadKey,
      senderRole,
      senderName: senderName || null,
      senderId: typeof senderId === "string" ? senderId : null,
      type: msgType,
      seconds: msgSeconds,
      content: contentToStore,
    });
    const payload = {
      id: String(message._id),
      sessionId: null,
      threadKey,
      senderRole: message.senderRole,
      senderName: message.senderName,
      senderId: (message as { senderId?: string | null }).senderId || null,
      type: msgType,
      seconds: msgSeconds,
      content: message.content,
      audioReady: msgType === "voice",
      editedAt: null,
      deleted: false,
      createdAt: message.createdAt,
    };

    /* بث فوري لخيط المحادثة عندما يكون الخادم الموحّد نشطاً */
    bridgeEmit(threadKey, "dm_message", payload);

    /* إشعار الطرف الآخر فقط إن كان غائباً عن المنصة (آخر نبض عام) —
       مع تفاصيل الرسالة: اسم المرسل + اقتباس من نصها (v2.8.0)
       v2.9.0: رابط الإشعار يفتح المحادثة مباشرة (?dm={senderId}) */
    const partnerId = senderRole === "VICTIM" ? counselorId : victimId;
    void notifyDmMessage(String(partnerId), String(senderName || ""), msgType === "voice" ? "🎤 رسالة صوتية" : messageExcerpt(String(content)), String(senderId || "")).catch(() => {});

    return NextResponse.json({ ok: true, message: payload, crisis: null });
  }

  const message = await Message.create({
    sessionId,
    senderRole,
    senderName: senderName || null,
    senderId: typeof senderId === "string" ? senderId : null,
    type: msgType,
    seconds: msgSeconds,
    content: contentToStore,
  });

  const payload = {
    id: String(message._id),
    sessionId: String(message.sessionId),
    senderRole: message.senderRole,
    senderName: message.senderName,
    senderId: (message as { senderId?: string | null }).senderId || null,
    type: msgType,
    seconds: msgSeconds,
    content: message.content,
    audioReady: msgType === "voice",
    editedAt: null,
    deleted: false,
    createdAt: message.createdAt,
  };

  /* بث فوري لغرفة الجلسة عندما يكون الخادم الموحّد نشطاً (Railway) */
  bridgeEmit(String(sessionId), "text_message", payload);

  /* إشعار فوري على الهاتف للطرف الآخر عندما يكون بعيداً عن الغرفة (آخر نبض
     أقدم من نافذة الحضور أو غائب) — لا يُرسل أبداً محتوى الرسالة نفسها */
  if (senderRole === "VICTIM" || senderRole === "COUNSELOR") {
    void (async () => {
      try {
        const s = (await SupportSession.findById(sessionId)
          .select("victimId counselorId victimLastSeenAt counselorLastSeenAt")
          .lean()) as {
          victimId: unknown;
          counselorId: unknown;
          victimLastSeenAt?: Date | null;
          counselorLastSeenAt?: Date | null;
        } | null;
        if (!s) return;
        const isVictim = senderRole === "VICTIM";
        const partnerId = String(isVictim ? s.counselorId : s.victimId);
        if (!partnerId) return;
        const partnerSeen = isVictim ? s.counselorLastSeenAt : s.victimLastSeenAt;
        const present = partnerSeen && Date.now() - new Date(partnerSeen as unknown as string).getTime() < PRESENCE_WINDOW_MS;
        if (present) return;
        /* v2.9.0: رابط الإشعار يفتح غرفة الجلسة مباشرة (?session={id}) */
        const r = await notifyNewMessage(partnerId, String(senderName || ""), msgType === "voice" ? "🎤 رسالة صوتية" : messageExcerpt(String(content)), String(sessionId));
        if (r.sent > 0) console.log(`[PUSH] message → partner ${partnerId}: sent=${r.sent}`);
      } catch (e) {
        console.error("[PUSH] message notify error:", (e as Error).message);
      }
    })();
  }

  /* بروتوكول الأزمة — نفس مسار server.js: تسجيل + رفع علم الجلسة + تنبيه فوري */
  let crisis: string | null = null;
  const phrase = detectCrisis(String(content));
  if (phrase) {
    crisis = phrase;
    bridgeEmit(String(sessionId), "crisis_alert", { phrase, at: new Date().toISOString() });
    try {
      await CrisisLog.create({
        sessionId,
        source: "REST_API",
        phrase,
        action: "CRISIS_BANNER_SHOWN",
        saidBy: senderRole, /* من كتب العبارة — يظهر في سجل الأزمات بالأدمين */
      });
      await SupportSession.updateOne({ _id: sessionId }, { $set: { crisisFlag: true } }).catch(() => {});
    } catch {
      /* تسجيل الأزمة لا يعطل إرسال الرسالة */
    }
  }

  return NextResponse.json({ ok: true, message: payload, crisis });
}

export const GET = apiHandler(GET_impl);
export const POST = apiHandler(POST_impl);

/* ─── v2.14.0: مسح المحادثة من نافذة الدردشة — لأي طرف من الطرفين ───
   DELETE { threadKey, userId } → حذف كل رسائل الخيط (للطرفين معاً).
   dm:{victimId}:{counselorId} — أحد الطرفين فقط.
   admin:{counselorId} — صاحب الخيط أو الأدمين. */
async function DELETE_impl(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const threadKey = typeof body.threadKey === "string" ? body.threadKey : "";
  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!threadKey || !userId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  await connectDB();

  const u = (await User.findById(userId).select("role").lean()) as { role?: string } | null;
  if (!u) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });

  let allowed = false;
  if (threadKey.startsWith("dm:")) {
    const parts = threadKey.split(":");
    /* v2.14.0: التحقق الكامل — الشكل + أن أحد الطرفين هو الطالب + أدوار
       الطرفين صحيحة (عميل ← أخصائي) كي لا يُمسح خيط وهمي */
    if (parts.length === 3 && (parts[1] === userId || parts[2] === userId)) {
      const [a, b] = (await Promise.all([
        User.findById(parts[1]).select("role").lean(),
        User.findById(parts[2]).select("role").lean(),
      ])) as unknown as [{ role?: string } | null, { role?: string } | null];
      allowed = !!a && !!b && a.role === "VICTIM" && b.role === "COUNSELOR";
    }
  } else if (threadKey.startsWith("admin:")) {
    const owner = threadKey.split(":")[1] || "";
    allowed = owner === userId || u.role === "ADMIN";
  }
  if (!allowed) return NextResponse.json({ error: "NOT_ALLOWED" }, { status: 403 });

  const r = await Message.deleteMany({ threadKey });
  return NextResponse.json({ ok: true, deleted: r.deletedCount ?? 0 });
}

export const DELETE = apiHandler(DELETE_impl);
