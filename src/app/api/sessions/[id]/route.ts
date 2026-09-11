import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { CounselorProfile, Message, SupportSession } from "@/lib/models";
import { attachParticipants } from "@/lib/server/sessions";
import { notifyUser, formatWhenUTC1, displayNameOf } from "@/lib/server/notify";
import { apiHandler } from "@/lib/server/api";
import { SLOT_TIMES } from "@/lib/constants";

export const dynamic = "force-dynamic";

/* تذكيرات المواعيد القادمة — كسول (fire-and-forget) ليعمل أيضاً على Vercel */
function triggerReminders() {
  import("@/lib/server/reminders")
    .then((m) => m.sendDueReminders())
    .catch(() => {});
}

async function GET_impl(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  /* v2.7.0: هوية الطالب — تُستعمل حصراً لكشف رقم هاتف العميل لأخصائي
     جلسته هو (أي استعلام آخر لا يرى الرقم إطلاقاً) */
  const viewerId = searchParams.get("userId");
  await connectDB();
  triggerReminders();

  const session = await SupportSession.findById(id).lean();
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [attached] = await attachParticipants([session], viewerId);
  const messages = await Message.find({ sessionId: id })
    .sort({ createdAt: 1 })
    .limit(200)
    .lean();

  return NextResponse.json({
    session: {
      ...attached,
      messages: messages.map((m) => ({
        id: String(m._id),
        sessionId: String(m.sessionId),
        senderRole: m.senderRole,
        senderName: m.senderName,
        content: m.content,
        createdAt: m.createdAt,
      })),
    },
  });
}

async function PATCH_impl(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { status, mode, moodBefore, moodAfter, notes, crisisFlag, followUpAt, treatmentEnded } = body;
  /* v2.8.0: القبول بمدة محددة + الرفض بسبب إلزامي + تغيير الموعد قبل القبول */
  const durationMinutes = body.durationMinutes;
  const cancelReason = typeof body.cancelReason === "string" ? body.cancelReason.trim() : "";
  const cancelledBy = typeof body.cancelledBy === "string" ? body.cancelledBy : null;
  const rescheduleTo = body.rescheduleTo;
  /* v2.7.0: هوية الطالب لكشف رقم هاتف العميل لأخصائي الجلسة في الاستجابة */
  const viewerId = typeof body?.viewerId === "string" ? body.viewerId : null;

  await connectDB();

  const data: Record<string, unknown> = {};
  if (status) {
    data.status = status;
    if (status === "ACTIVE") data.startedAt = new Date();
    if (status === "COMPLETED") data.endedAt = new Date();
  }
  if (mode) data.mode = mode;
  /* v2.8.0: مدة الجلسة (30–240 دقيقة) تُحفظ عند القبول ليراها العميل —
     الجلسة لا تُغلق تلقائياً بعد انقضاء المدة، الإنهاء قرار الأخصائي دائماً */
  if (durationMinutes !== undefined && durationMinutes !== null) {
    const dm = Number(durationMinutes);
    if (!Number.isFinite(dm) || dm < 15 || dm > 240) {
      return NextResponse.json({ error: "INVALID_DURATION" }, { status: 400 });
    }
    data.durationMinutes = Math.round(dm);
  }
  /* v2.8.0: سبب التعذّر إلزامي عند اعتذار الأخصائي عن الطلب */
  if (cancelReason) data.cancelReason = cancelReason.slice(0, 500);
  if (cancelledBy) data.cancelledBy = cancelledBy;
  if (status === "CANCELLED" && cancelledBy === "COUNSELOR" && !data.cancelReason) {
    return NextResponse.json({ error: "REASON_REQUIRED" }, { status: 400 });
  }
  if (moodBefore !== undefined) data.moodBefore = moodBefore;
  if (moodAfter !== undefined) data.moodAfter = moodAfter;
  if (notes !== undefined) data.notes = notes;
  if (crisisFlag !== undefined) data.crisisFlag = crisisFlag;

  /* v2.8.0: تغيير موعد الطلب — مع إشعار خاص للطرف الآخر بالتفاصيل الكاملة
     (القديم ← الجديد). v2.14.0: أصبح مسموحاً على الجلسة المقبولة أيضاً
     (كان يُرفض بـ NOT_PENDING فلا يتغير الموعد ولا يصل أي إشعار للعميل —
     سبب شكوى «لم يصل أي إشعار عند تغيير المختص للموعد») */
  let rescheduled = false;
  let oldWhen: Date | null = null;
  let rescheduleTarget: string | null = null; /* من يُبلَّغ بالتغيير */
  if (rescheduleTo) {
    const current = (await SupportSession.findById(id).select("status scheduledAt victimId counselorId").lean()) as {
      status?: string;
      scheduledAt?: Date | string | null;
      victimId: unknown;
      counselorId: unknown;
    } | null;
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (current.status !== "PENDING" && current.status !== "ACCEPTED") {
      return NextResponse.json({ error: "NOT_PENDING" }, { status: 400 });
    }
    oldWhen = current.scheduledAt ? new Date(current.scheduledAt) : null;
    const nd = new Date(rescheduleTo);
    if (Number.isNaN(nd.getTime()) || nd.getTime() < Date.now() - 2 * 60 * 1000) {
      return NextResponse.json({ error: "PAST_DATE" }, { status: 400 });
    }
    /* لا تصادم مع جلسة أخرى لنفس الأخصائي في نفس الموعد الجديد */
    const clash = await SupportSession.findOne({
      _id: { $ne: id },
      counselorId: current.counselorId,
      status: { $in: ["PENDING", "ACCEPTED", "ACTIVE"] },
      scheduledAt: { $gte: new Date(nd.getTime() - 30 * 60 * 1000), $lte: new Date(nd.getTime() + 30 * 60 * 1000) },
    })
      .select("_id")
      .lean();
    if (clash) return NextResponse.json({ error: "SLOT_TAKEN" }, { status: 409 });

    /* ─── v1.6.0: تغيير موعد من طرف العميل يُقيد بمواعيد الأخصائي المسموحة ───
       (طلب المستخدم: «يجب أن يختار فقط المواعيد التي يسمح بها المختص»)
       إذا خصّص الأخصائي جدولاً أسبوعياً فيجب أن يقع الموعد الجديد في إحدى
       ساعات يومه المسموحة حصراً — الأخصائي نفسه غير مقيد (يرتّب وقته بحرية) */
    if (body.rescheduledBy === "VICTIM") {
      const prof = (await CounselorProfile.findOne({ userId: current.counselorId })
        .select("weeklyAvailability")
        .lean()) as { weeklyAvailability?: Record<string, string[]> | null } | null;
      const wa = prof?.weeklyAvailability;
      if (wa && typeof wa === "object") {
        const weekday = String(nd.getDay());
        const hhmm = `${String(nd.getHours()).padStart(2, "0")}:${String(nd.getMinutes()).padStart(2, "0")}`;
        const daySlots = Array.isArray(wa[weekday]) ? wa[weekday] : [];
        if (!daySlots.includes(hhmm) || !SLOT_TIMES.includes(hhmm as never)) {
          return NextResponse.json({ error: "SLOT_UNAVAILABLE" }, { status: 400 });
        }
      }
    }

    data.scheduledAt = nd;
    /* إذا أُعيد الجدولة على جلسة مقبولة وأُلغيت المدة… تبقى المدة كما هي */
    const prevCount = ((await SupportSession.findById(id).select("rescheduleCount").lean()) as unknown as { rescheduleCount?: number } | null)?.rescheduleCount || 0;
    data.rescheduleCount = prevCount + 1;
    data.lastRescheduledAt = new Date();
    rescheduled = true;
    /* v2.14.0: من قام بتغيير الموعد؟ العميل يُبلِّغ الأخصائي والعكس */
    rescheduleTarget = body.rescheduledBy === "VICTIM"
      ? String(current.counselorId)
      : String(current.victimId);
  }

  /* خطة ما بعد الجلسة — قرار الأخصائي حسب حالة العميل
     (تحقق خادم صارم: لا تُقبل جلسة متابعة بموعد فائت) */
  let followUpCreated: string | null = null;
  if (followUpAt) {
    const d = new Date(followUpAt);
    if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) {
      return NextResponse.json({ error: "PAST_DATE" }, { status: 400 });
    }
    data.followUpAt = d;
    data.status = "COMPLETED";
    data.endedAt = data.endedAt || new Date();
  }
  if (treatmentEnded) {
    data.treatmentEnded = true;
    data.status = "COMPLETED";
    data.endedAt = data.endedAt || new Date();
  }

  const updated = (await SupportSession.findByIdAndUpdate(id, { $set: data }, { new: true }).lean()) as
    | ({ _id: unknown; victimId: unknown; counselorId: unknown } & Record<string, unknown>)
    | null;
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  /* ─── v1.1.0 (طمأنينة): بلا تسويات مالية ───
     المنصة لا تمسك أي أموال ولا تخصم ولا تردّ — اكتمال الجلسة أو
     إلغاؤها مجرد انتقال حالة وإشعار، والدفع مباشرة بين الطرفين */

  /* جدولة الجلسة التالية: تُنشأ الجلسة تلقائياً بتفاصيلها (نفس الطرفين ونفس الموضوع
     والنمط) بحالة «مقبولة» — لا حاجة لإنشاء جلسة يدوياً في كل مرة؛ يكفي أن
     يدخل الطرفان الغرفة في الموعد المحدد، ويصلهما تذكير قبل ساعة من الموعد */
  if (data.followUpAt && !data.treatmentEnded) {
    try {
      /* جلسة المتابعة تحمل سعر وعملة الجلسة الأصلية نفسهما —
         (v1.3.0: بدل قراءة السعر الحالي من ملف الأخصائي، حتى يرى العميل
         السعر نفسه الذي حسب عليه ولو عدّل الأخصائي أسعاره لاحقاً) */
      const cur = (updated as { currency?: string }).currency;
      const followCurrency = cur === "EUR" || cur === "USD" ? cur : "DZD";
      const followPrice = Math.max(0, Math.round(Number((updated as { price?: number }).price) * 100) / 100);
      const created = await SupportSession.create({
        victimId: updated.victimId,
        counselorId: updated.counselorId,
        topic: updated.topic,
        mode: updated.mode || "TEXT",
        scheduledAt: data.followUpAt,
        status: "ACCEPTED",
        source: "FOLLOW_UP",
        price: followPrice,
        currency: followCurrency,
      });
      followUpCreated = String(created._id);
    } catch (e) {
      console.error("[SESSION] تعذر إنشاء جلسة المتابعة تلقائياً:", (e as Error).message);
    }
  }

  /* ═ v1.4.0: كل إشعار يذكر اسم الطرف الآخر صراحة ═
     أسماء الطرفين تُجلب مرة واحدة وتُمرّر للقوالب ({name}) */
  const [clientName, counselorName] = await Promise.all([
    displayNameOf(String(updated.victimId)),
    displayNameOf(String(updated.counselorId)),
  ]);

  // إشعارات محلّية عند انتقالات الحالة — v2.12.0: كل تغيير حالة يرافقه
  // إشعار للطرف الآخر في كل وقت، للعميل وللمختص معاً
  if (status === "ACCEPTED") {
    notifyUser(String(updated.victimId), "accepted", "/?view=client-sessions", {
      when: formatWhenUTC1(updated.scheduledAt as Date),
      name: counselorName || "—",
    }).catch(() => {});
  }
  /* اعتذار الأخصائي عن الطلب → إشعار تلقائي للعميل مع سبب التعذّر (v2.8.0).
     إلغاء العميل نفسه لطلبه → إشعار للأخصائي بتحرّر الموعد (v2.12.0) */
  if (status === "CANCELLED") {
    if (data.cancelledBy === "COUNSELOR" && data.cancelReason) {
      notifyUser(String(updated.victimId), "declinedReason", "/?view=counselors-directory", { reason: String(data.cancelReason), name: counselorName || "—" }).catch(() => {});
    } else if (data.cancelledBy === "VICTIM") {
      notifyUser(String(updated.counselorId), "cancelledByVictim", "/?view=counselor-dashboard", {
        when: formatWhenUTC1(updated.scheduledAt as Date),
        name: clientName || "—",
      }).catch(() => {});
    } else {
      notifyUser(String(updated.victimId), "declined", "/?view=counselors-directory", { name: counselorName || "—" }).catch(() => {});
    }
  }
  /* v2.12.0: تغيير الموعد → إشعار للطرف الآخر بالتفاصيل الكاملة: القديم ← الجديد
     v2.14.0: الهدف يُحدَّد حسب من قام بالتغيير (عميل → يُبلَّغ الأخصائي والعكس)
     v1.4.0: اسم من قام بالتغيير يُذكر في النص */
  if (rescheduled && data.scheduledAt && rescheduleTarget) {
    const actorName = body.rescheduledBy === "VICTIM" ? clientName : counselorName;
    /* v1.5.0: رابط الإشعار يفتح صفحة من يُبلَّغ: الأخصائي → لوحته، العميل → جلستي */
    const reschedUrl = rescheduleTarget === String(updated.counselorId)
      ? "/?view=counselor-dashboard"
      : "/?view=client-sessions";
    notifyUser(rescheduleTarget, "rescheduled", reschedUrl, {
      old: oldWhen ? formatWhenUTC1(oldWhen) : "—",
      when: formatWhenUTC1(data.scheduledAt as Date),
      name: actorName || "—",
    }).catch(() => {});
  }
  if (status === "ACTIVE") {
    /* إشعار بدء الجلسة للعميل فقط — الأخصائي هو من بدأها فلا يحتاج تنبيهاً
       (احترام صارم لحقل role: لا إشعارات عميل تصل للأخصائي أو العكس)
       v1.5.0: رابط الإشعار يفتح غرفة الجلسة نفسها مباشرة */
    notifyUser(String(updated.victimId), "started", `/?session=${id}`, { name: counselorName || "—" }).catch(() => {});
  }
  if (data.followUpAt) {
    notifyUser(String(updated.victimId), "followUp", "/?view=client-sessions", {
      when: formatWhenUTC1(data.followUpAt as Date),
      name: counselorName || "—",
    }).catch(() => {});
  }
  if (data.treatmentEnded) {
    notifyUser(String(updated.victimId), "treatmentEnded", "/?view=counselors-directory", { name: counselorName || "—" }).catch(() => {});
  }
  /* v2.12.0: اكتمال الجلسة (بلا خطة متابعة مرفقة) → إشعار للعميل —
   * كان الانتقال الوحيد الذي يمرّ بلا إشعار */
  if (status === "COMPLETED" && !data.followUpAt && !data.treatmentEnded) {
    notifyUser(String(updated.victimId), "completed", "/?view=client-sessions", { name: counselorName || "—" }).catch(() => {});
  }

  const [attached] = await attachParticipants([updated], viewerId);
  return NextResponse.json({ ok: true, session: attached, followUpCreated });
}

export const GET = apiHandler(GET_impl);
export const PATCH = apiHandler(PATCH_impl);
