import "server-only";
import { CounselorProfile, InAppNotification, SupportSession, User } from "@/lib/models";
import { OVERDUE_HOURS, LATE_STRIKES_TO_SUSPEND } from "@/lib/availability";

/**
 * v2.6.0 — منطق «التأخر عن قبول الطلبات»
 * ─────────────────────────────────────────────────────────────
 * الطلب المعلق (PENDING) الذي لم يقبله الأخصائي خلال 36 ساعة من إنشائه:
 *   1. يُوسَم lateFlagged=true (لا يُحتسب مرتين أبداً)
 *   2. يزيد lateCount في ملف الأخصائي
 *   3. يصل الأدمين إشعار داخلي بالتفاصيل (الجرس + لافتة اللوحة)
 *      — لا Web Push للأدمين لأن الإشعارات الفورية تعمل لحسابي
 *        العميل والأخصائي فقط
 *   4. عند بلوغ 3 تأخرات: يُعلَّق حساب الأخصائي تلقائياً
 *      ولا يُعاد إلا يدوياً من لوحة الأدمين (تفعيل الحساب
 *      يصفّر العدّاد — بداية جديدة)
 *
 * حماية النشر: الطلبات المنشأة قبل 2026-09-03 (إطلاق v2.6.0)
 * لا تُحتسب تأخرات إطلاقاً — حتى لا تُعاقب الحسابات القائمة
 * على بيانات قديمة عند أول تشغيل. يمكن ضبط التاريخ بمتغير البيئة
 * V26_LAUNCH (يستعمله الاختبار الآلي).
 */
/* قراءة بيئة التشغيل عبر globalThis — يمنع حزم البناء من تثبيت القيمة
   وقت البناء (Next/Turbopack يستبدل process.env.X نصياً عند البناء) */
const RUNTIME_ENV = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
const V26_LAUNCH = RUNTIME_ENV?.["V26_LAUNCH"]
  ? new Date(RUNTIME_ENV["V26_LAUNCH"] as string)
  : new Date("2026-09-03T00:00:00.000Z");

export interface OverdueRow {
  id: string;
  counselorId: string;
  counselorName: string | null;
  victimAlias: string | null;
  createdAt: string;
  scheduledAt: string | null;
  topic: string | null;
  mode: string | null;
  hoursPending: number;
}

/* صيغة التاريخ الكامل YYYY/MM/DD HH:MM:SS لأجسام الإشعارات */
function fmt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/* إشعار داخلي للأدمين بلغة حسابه — بلا Web Push (غير متاح للأدمين) */
async function notifyAdmins(key: string, titleAr: string, titleFr: string, titleEn: string, body: string) {
  try {
    const admins = await User.find({ role: "ADMIN" }).select("language").lean();
    for (const a of admins) {
      const lang = (a as { language?: string }).language;
      const title = lang === "fr" ? titleFr : lang === "en" ? titleEn : titleAr;
      await InAppNotification.create({ userId: a._id, key, title, body, url: "/" });
    }
  } catch (e) {
    console.error("[OVERDUE] تعذر حفظ إشعار الأدمين:", (e as Error).message);
  }
}

/**
 * المسح الدوري: يفحص الطلبات المعلقة الأقدم من 36 ساعة، يوسمها،
 * يزيد عدّاد الأخصائي، ويُعلّق الحساب عند 3 تأخرات، ويُبلغ الأدمين.
 * تُستدعى بكسل من مسارات الأدمين (مثل تذكيرات المواعيد — بلا مجدول دائم).
 */
export async function sweepOverdueRequests(): Promise<void> {
  const cutoff = new Date(Date.now() - OVERDUE_HOURS * 3600 * 1000);
  const overdue = await SupportSession.find({
    status: "PENDING",
    lateFlagged: { $ne: true },
    createdAt: { $lt: cutoff, $gte: V26_LAUNCH },
  })
    .sort({ createdAt: 1 })
    .limit(100)
    .lean();

  for (const s of overdue) {
    const doc = s as unknown as { _id: unknown; counselorId: unknown; victimId: unknown; createdAt?: Date; lateFlagged?: boolean };
    /* وسْم الطلب أولاً (ذرّيّة العملية) — ثم بقية الخطوات */
    await SupportSession.updateOne({ _id: doc._id }, { $set: { lateFlagged: true } });

    const counselorId = String(doc.counselorId);
    const profile = await CounselorProfile.findOne({ userId: doc.counselorId }).lean();
    const victim = await User.findById(doc.victimId).select("pseudonym").lean();
    const counselorUser = await User.findById(counselorId).select("pseudonym suspended").lean();
    const counselorName = (profile as { fullName?: string } | null)?.fullName ?? (counselorUser as { pseudonym?: string } | null)?.pseudonym ?? counselorId;
    const victimAlias = (victim as { pseudonym?: string } | null)?.pseudonym ?? "—";
    const createdAt = doc.createdAt ? new Date(doc.createdAt) : new Date();

    if (profile) {
      const lateCount = (((profile as { lateCount?: number }).lateCount ?? 0) as number) + 1;
      await CounselorProfile.updateOne({ _id: (profile as { _id: unknown })._id }, { $set: { lateCount } });

      /* إشعار التأخّر للإدارة بكل التفاصيل */
      await notifyAdmins(
        "overdueRequest",
        "⏰ طلب حجز معلّق أكثر من 36 ساعة",
        "⏰ Demande en attente depuis plus de 36 h",
        "⏰ Booking request pending over 36h",
        `${counselorName} — ${victimAlias} — ${fmt(createdAt)}`
      );

      /* 3 تأخرات → تعليق تلقائي + إشعار الأدمين بتفعيله يدوياً */
      if (lateCount >= LATE_STRIKES_TO_SUSPEND) {
        await User.updateOne({ _id: counselorId }, { $set: { suspended: true } });
        await notifyAdmins(
          "counselorSuspended",
          "⛔ عُطّل حساب أخصائي تلقائياً",
          "⛔ Compte de professionnel suspendu automatiquement",
          "⛔ Counselor account auto-suspended",
          `${counselorName} — تأخر في قبول الطلبات ${lateCount} مرات — فعّل حسابه من إدارة الحسابات`
        );
      }
    }
  }
}

/**
 * قائمة الطلبات المتأخرة حالياً (للافتة الأدمين) — قراءة فقط بلا آثار جانبية.
 * يشمل المتأخرة الموسومة سابقاً والمستمرة في التأخر.
 */
export async function listOverdueRequests(): Promise<OverdueRow[]> {
  const cutoff = new Date(Date.now() - OVERDUE_HOURS * 3600 * 1000);
  const overdue = await SupportSession.find({
    status: "PENDING",
    createdAt: { $lt: cutoff, $gte: V26_LAUNCH },
  })
    .sort({ createdAt: 1 })
    .limit(50)
    .lean();

  if (overdue.length === 0) return [];

  const victimIds = overdue.map((s) => (s as unknown as { victimId: unknown }).victimId);
  const counselorIds = overdue.map((s) => (s as unknown as { counselorId: unknown }).counselorId);
  const [victims, profiles] = await Promise.all([
    User.find({ _id: { $in: victimIds } }).select("pseudonym").lean(),
    CounselorProfile.find({ userId: { $in: counselorIds } }).select("userId fullName").lean(),
  ]);
  const victimById = new Map(victims.map((v) => [String(v._id), (v as unknown as { pseudonym?: string }).pseudonym ?? null]));
  const profileByUser = new Map(profiles.map((p) => [String((p as unknown as { userId: unknown }).userId), (p as unknown as { fullName?: string }).fullName ?? null]));

  const now = Date.now();
  return overdue.map((s) => {
    const doc = s as unknown as { _id: unknown; counselorId: unknown; victimId: unknown; createdAt?: Date; scheduledAt?: Date; topic?: string; mode?: string };
    const created = doc.createdAt ? new Date(doc.createdAt) : new Date();
    return {
      id: String(doc._id),
      counselorId: String(doc.counselorId),
      counselorName: profileByUser.get(String(doc.counselorId)) ?? null,
      victimAlias: victimById.get(String(doc.victimId)) ?? null,
      createdAt: created.toISOString(),
      scheduledAt: doc.scheduledAt ? new Date(doc.scheduledAt).toISOString() : null,
      topic: doc.topic ?? null,
      mode: doc.mode ?? null,
      hoursPending: Math.floor((now - created.getTime()) / 3600000),
    };
  });
}
