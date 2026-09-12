import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Message, SupportSession, TherapyContract, User, CounselorProfile } from "@/lib/models";
import { attachParticipants } from "@/lib/server/sessions";
import { notifyUser, displayNameOf } from "@/lib/server/notify";
import { apiHandler } from "@/lib/server/api";
import { nextContractNumber } from "@/lib/server/contract";
import { dayKeyUTC1, MAX_ACCEPTED_PER_DAY, isSlotAvailable, normalizeAvailability, weekdayOfDate } from "@/lib/availability";
import { DEFAULT_SESSION_PRICE, priceForCurrency, CURRENCY_CODES, CURRENCIES } from "@/lib/constants";
import type { CurrencyCode } from "@/lib/constants";

export const dynamic = "force-dynamic";

/* تذكيرات المواعيد القادمة — كسول ليعمل أيضاً على Vercel (بلا مجدول دائم) */
function triggerReminders() {
  import("@/lib/server/reminders")
    .then((m) => m.sendDueReminders())
    .catch(() => {});
}

async function GET_impl(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const role = searchParams.get("role");
  if (!userId || !role) {
    return NextResponse.json({ error: "userId and role required" }, { status: 400 });
  }

  await connectDB();
  triggerReminders();

  const filter = role === "COUNSELOR" ? { counselorId: userId } : { victimId: userId };
  const sessions = await SupportSession.find(filter)
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const attached = await attachParticipants(sessions);

  /* آخر رسالة لكل جلسة (نفس شكل الاستجابة السابق: messages = [آخر رسالة]) */
  const sessionIds = sessions.map((s) => s._id);
  const lastMsgs = await Message.aggregate([
    { $match: { sessionId: { $in: sessionIds } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: "$sessionId", doc: { $first: "$$ROOT" } } },
  ]);
  const lastBySession = new Map(lastMsgs.map((m) => [String(m._id), m.doc]));

  const withMessages = attached.map((s) => {
    const last = lastBySession.get(String(s.id));
    return {
      ...s,
      messages: last
        ? [{ id: String(last._id), sessionId: String(last.sessionId), senderRole: last.senderRole, senderName: last.senderName, content: last.content, createdAt: last.createdAt }]
        : [],
    };
  });

  return NextResponse.json({ sessions: withMessages });
}

async function POST_impl(req: NextRequest) {
  const body = await req.json();
  const { victimId, counselorId, topic, mode, scheduledAt } = body;
  if (!victimId || !counselorId || !topic || !mode) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  await connectDB();

  /* تحقق مزدوج (واجهة + خادم): لا تُقبل جلسة بموعد فائت — حتى لو تجاوز
     المتصفح سمة min بحفظ النموذج عبر منتصف الليل أو تأخر الرد */
  const sched = scheduledAt ? new Date(scheduledAt) : new Date();
  if (Number.isNaN(sched.getTime()) || sched.getTime() < Date.now() - 2 * 60 * 1000) {
    return NextResponse.json({ error: "PAST_DATE" }, { status: 400 });
  }

  /* v2.6.0: التحقق من جدول التوفر الأسبوعي للأخصائي — الطلب يجب أن يكون
     في واحدة من الساعات التي حددها الأخصائي ليوم ذلك التاريخ.
     الأخصائي غير المخصّص (بلا جدول) متاح في كل المواعيد كما في v2.5. */
  const bodyDate = typeof body.date === "string" ? body.date : null;
  const bodySlot = typeof body.slot === "string" ? body.slot : null;
  if (bodyDate && bodySlot) {
    const profile = await CounselorProfile.findOne({ userId: counselorId })
      .select("weeklyAvailability")
      .lean();
    const av = profile ? normalizeAvailability((profile as { weeklyAvailability?: unknown }).weeklyAvailability) : null;
    const wd = weekdayOfDate(bodyDate);
    if (wd >= 0 && !isSlotAvailable(av, wd, bodySlot)) {
      return NextResponse.json({ error: "SLOT_UNAVAILABLE" }, { status: 400 });
    }
  }

  const victim = (await User.findById(victimId)
    .select("gender pseudonym")
    .lean()) as {
    gender?: string | null;
    pseudonym?: string | null;
  } | null;
  if (!victim) return NextResponse.json({ error: "Victim not found" }, { status: 404 });

  /* ─── v1.0.0 (طمأنينة): التوثيق للأخصائيين فقط ───
     الحجز لا يُقبل إلا مع أخصائي موثّق من الإدارة (شهادته مراجَعة).
     حساب العميل نفسه بلا أي توثيق — التسجيل مباشر.
     v1.10.0: جلب حقول العقد أيضاً — لإنشاء العقد لحظة الحجز مباشرة */
  const counselorProfile = (await CounselorProfile.findOne({ userId: counselorId })
    .select("sessionPrice sessionPrices verificationStatus fullName contractText contractSignature contractSignedAt")
    .lean()) as {
    sessionPrice?: number;
    sessionPrices?: unknown;
    verificationStatus?: string;
    fullName?: string;
    contractText?: string | null;
    contractSignature?: string | null;
    contractSignedAt?: Date | null;
  } | null;
  if (!counselorProfile || counselorProfile.verificationStatus !== "VERIFIED") {
    return NextResponse.json({ error: "COUNSELOR_UNVERIFIED" }, { status: 403 });
  }

  /* ═ v1.3.0: عملة الجلسة = عملة عرض العميل عند الحجز ═
     السعر المثبّت على الجلسة هو السعر الذي حدده الأخصائي لهذه العملة تحديداً،
     بلا أي تحويل — العملاء على نفس المنصة قد يحجزون بعملات مختلفة */
  const reqCurrency = String(body.currency || "DZD").toUpperCase() as CurrencyCode;
  const currency: CurrencyCode = CURRENCY_CODES.includes(reqCurrency) ? reqCurrency : "DZD";

  /* ─── v2.9.0: تفضيل الأخصائي بشأن جنس العميلين ───
     الأخصائي يحدد من إعداداته جنس العميلين الذين يقبل التعامل معهم —
     الحجز معه لا يُقبل لجنس خارج تفضيله المعلن (واجهة + خادم معاً) */
  if (victim.gender) {
    const counselorUser = (await User.findById(counselorId).select("acceptedGenders").lean()) as
      | { acceptedGenders?: string[] }
      | null;
    const accepted = counselorUser?.acceptedGenders?.length ? counselorUser.acceptedGenders : ["male", "female"];
    if (!accepted.includes(victim.gender)) {
      return NextResponse.json({ error: "GENDER_NOT_ACCEPTED" }, { status: 403 });
    }
  }

  /* ─── جلسة واحدة فقط في نفس اليوم لكل عميل (v2.9.0: صارمة) ───
     تُحتسب كل الجلسات في نفس اليوم بتوقيت الجزائر: المعلّقة والمقبولة
     والجارية والمنتهية — الإلغاء وحده لا يُحتسب (يمكن إعادة الحجز بعده).
     v2.8.0 كانت تُسقط الجلسات المكتملة فأصبح بالإمكان أكثر من جلسة/يوم */
  const vk = dayKeyUTC1(sched);
  const victimDayStart = new Date(`${vk}T00:00:00+01:00`).getTime();
  const victimDayEnd = victimDayStart + 24 * 60 * 60 * 1000;
  const victimSessions = await SupportSession.find({
    victimId,
    status: { $in: ["PENDING", "ACCEPTED", "ACTIVE", "COMPLETED"] },
    scheduledAt: { $gte: new Date(victimDayStart), $lt: new Date(victimDayEnd) },
  })
    .select("_id")
    .lean();
  if (victimSessions.length > 0) {
    return NextResponse.json({ error: "VICTIM_DAY_LIMIT" }, { status: 409 });
  }

  /* ─── v2.8.0: الموعد المحجوز لعميل آخر لا يمكن اختياره ───
     أي طلب/جلسة قائمة مع نفس الأخصائي يتقاطع زمنياً (±30 دقيقة) يحجب الموعد */
  const clash = await SupportSession.findOne({
    counselorId,
    status: { $in: ["PENDING", "ACCEPTED", "ACTIVE"] },
    scheduledAt: { $gte: new Date(sched.getTime() - 30 * 60 * 1000), $lte: new Date(sched.getTime() + 30 * 60 * 1000) },
  })
    .select("_id")
    .lean();
  if (clash) {
    return NextResponse.json({ error: "SLOT_TAKEN" }, { status: 409 });
  }

  /* ─── v2.8.0: توزيع عادل — من قبل أكثر من 4 جلسات اليوم لا يمكن اختياره ─── */
  const dayStart = new Date(`${vk}T00:00:00+01:00`).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const acceptedToday = await SupportSession.countDocuments({
    counselorId,
    status: { $in: ["ACCEPTED", "ACTIVE"] },
    scheduledAt: { $gte: new Date(dayStart), $lt: new Date(dayEnd) },
  });
  if (acceptedToday > MAX_ACCEPTED_PER_DAY) {
    return NextResponse.json({ error: "COUNSELOR_DAY_FULL" }, { status: 409 });
  }

  /* ─── v1.1.0 (طمأنينة): بلا محفظة وبلا دفع إلكتروني ───
     v1.3.0: السعر بعملة العميل المختارة (من أسعار الأخصائي الثلاثة المستقلة)
     ويُثبّت على الجلسة لحظة الحجز للعرض فقط — الدفع مباشرة بين العميل
     والمختص وفق ما يتفقان عليه، والمنصة وسيط تقني لا يمسك أي أموال */
  const cfg = CURRENCIES[currency];
  const rawPrice = priceForCurrency(counselorProfile.sessionPrices, currency, counselorProfile.sessionPrice);
  const price = Math.min(cfg.max, Math.max(cfg.min, Math.round(rawPrice * 100) / 100)) || DEFAULT_SESSION_PRICE;

  const session = await SupportSession.create({
    victimId,
    counselorId,
    topic,
    mode,
    scheduledAt: sched,
    status: "PENDING",
    price,
    currency,
  });

  /* ═ v1.10.0: العقد العلاجي لحظة الحجز مباشرة — المنطق الجديد المطلوب ═
     إذا كان الأخصائي قد أعّد عقداً ووقّعه في إعداداته مسبقاً، يُنشأ عقد
     هذا العميل فوراً برقم تسلسلي فريد ولقطة النص والإمضاء، فتظهر النافذة
     المنبثقة للعميل على أي صفحة مفتوحة دون أي انتظار لقبول الأخصائي.
     العقود الممضاة سابقاً للعميل نفسه لا تُمَس، والعقد المفتوح القديم
     تُحدَّث لقطة النص والجلسة المرتبطة فقط. */
  let contractForClient: { id: string; number: string } | null = null;
  try {
    if (counselorProfile.contractText && counselorProfile.contractSignature && counselorProfile.contractSignedAt) {
      const existing = (await TherapyContract.findOne({ counselorId, clientUserId: victimId }).lean()) as
        | { _id: unknown; status?: string; number?: string | null }
        | null;
      if (!existing) {
        const number = await nextContractNumber();
        const created = await TherapyContract.create({
          number,
          counselorId,
          clientUserId: victimId,
          sessionId: session._id,
          contractText: counselorProfile.contractText,
          counselorName: counselorProfile.fullName || null,
          counselorSignature: counselorProfile.contractSignature,
          counselorSignedAt: counselorProfile.contractSignedAt,
          status: "AWAITING_CLIENT",
        });
        contractForClient = { id: String(created._id), number };
      } else if (existing.status === "AWAITING_CLIENT") {
        await TherapyContract.findByIdAndUpdate(existing._id, {
          $set: {
            sessionId: session._id,
            contractText: counselorProfile.contractText,
            counselorSignature: counselorProfile.contractSignature,
            counselorSignedAt: counselorProfile.contractSignedAt,
          },
        });
        contractForClient = { id: String(existing._id), number: existing.number || "" };
      }
    }
  } catch (e) {
    console.error("[CONTRACT] تعذر تجهيز العقد عند الحجز:", (e as Error).message);
  }

  // إشعار فوري للأخصائي (محلّي حسب لغته) — v1.4.0: باسم العميل
  void displayNameOf(String(victimId)).then((clientName) =>
    notifyUser(String(counselorId), "booked", "/?view=counselor-dashboard", { name: clientName || "—" })
      .then((r) => console.log(`[PUSH] booked → counselor: sent=${r.sent}`))
      .catch((e) => console.error("[PUSH] booked error:", e))
  );

  return NextResponse.json({
    ok: true,
    session: { ...session.toObject(), id: String(session._id) },
    /* v1.10.0: العقد الجاهز للعميل — الواجهة تفتح النافذة المنبثقة فوراً */
    contract: contractForClient,
  });
}

export const GET = apiHandler(GET_impl);
export const POST = apiHandler(POST_impl);
