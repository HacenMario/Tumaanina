import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { CounselorProfile, SupportSession, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";
import { ensureCounselorSlug } from "@/lib/server/slug";
import { getChallengeWinner } from "@/lib/server/challenge";
import { DEFAULT_SESSION_PRICE, buildSessionPrices } from "@/lib/constants";
import type { WeeklyAvailability } from "@/lib/availability";

export const dynamic = "force-dynamic";

async function GET_impl(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const specialty = searchParams.get("specialty");
  const language = searchParams.get("language");
  /* v2.9.0: جنس العميل الباحث — يُستبعد كل أخصائي أعلن عدم قبوله لهذا الجنس */
  const gender = searchParams.get("gender");

  await connectDB();

  const query: Record<string, unknown> = { verificationStatus: "VERIFIED" };
  if (specialty && specialty !== "all") query.specialties = specialty;
  if (language && language !== "all") query.languages = language;

  /* v2.5.3: نستبعد photo وdiplomaImage من المستندات نفسها — الصور (base64 ضخمة)
     كانت سبب بطء الدليل، وتُحمَّل الآن من /api/counselors/{id}/photo مع تخزين مؤقت */
  const profiles = await CounselorProfile.find(query)
    .select("-photo -diplomaImage")
    /* v2.8.0: الترتيب حسب الخبرة من الأكثر إلى الأقل (ثم التقييم) */
    .sort({ yearsExperience: -1, rating: -1 })
    .lean();

  /* أسماء المستخدمين المرتبطة (إن وجدت) + حالة تعليق الحساب (v2.6.0) */
  const userIds = profiles.map((p) => p.userId).filter(Boolean);
  const users = await User.find({ _id: { $in: userIds } })
    .select("pseudonym suspended acceptedGenders")
    .lean();
  const nameById = new Map(users.map((u) => [String(u._id), (u as { pseudonym?: string }).pseudonym]));
  const suspendedById = new Set(
    users.filter((u) => (u as { suspended?: boolean }).suspended).map((u) => String(u._id))
  );
  /* v2.9.0: تفضيل الجنس لكل أخصائي (الافتراضي: كلا الجنسين) */
  const gendersById = new Map(
    users.map((u) => [
      String(u._id),
      ((u as { acceptedGenders?: string[] }).acceptedGenders?.length
        ? (u as { acceptedGenders?: string[] }).acceptedGenders!
        : ["male", "female"]) as string[],
    ])
  );
  const genderBlocked = (userId: string) =>
    !!gender && gender !== "all" && !(gendersById.get(userId) || ["male", "female"]).includes(gender);

  /* عدد الجلسات المكتملة يُحسب مباشرة من قاعدة البيانات في كل طلب —
     يحدّث فوراً في صفحة الأخصائيين والدليل بعد كل جلسة (بدل العداد القديم الثابت) */
  const doneCounts = await SupportSession.aggregate([
    { $match: { status: "COMPLETED", counselorId: { $in: userIds } } },
    { $group: { _id: "$counselorId", n: { $sum: 1 } } },
  ]);
  const countByCounselor = new Map(doneCounts.map((c) => [String(c._id), c.n as number]));

  /* v2.5.5: ترحيل تلقائي — الحسابات القديمة بلا slug تُولَّد عند أول قائمة
     (كتابة واحدة فقط لكل ملف، ثم تُقدّم من القاعدة مباشرة) */
  for (const p of profiles) {
    if (!p.slug) await ensureCounselorSlug(p as Record<string, any>);
  }

  /* v2.7.0: فائز التحدي — يحمل تاجاً ملكياً فوق صورته في كل الواجهات */
  const challengeWinnerInfo = await getChallengeWinner();

  return NextResponse.json({
    counselors: profiles
      .filter((p) => !suspendedById.has(String(p.userId))) /* v2.6.0: إخفاء الحسابات المعلّقة */
      .filter((p) => !genderBlocked(String(p.userId))) /* v2.9.0: احترام تفضيل الجنس */
      .map((p) => ({
      id: String(p._id),
      userId: String(p.userId),
      slug: p.slug || null,
      fullName: p.fullName,
      specialties: p.specialties || [],
      customSpecialties: (p as { customSpecialties?: string[] }).customSpecialties || [],
      languages: p.languages || [],
      bio: p.bio ?? null,
      whatsapp: p.whatsapp || null,
      /* الصورة تُحمَّل من مسار مستقل مخبّأ — لا base64 داخل JSON القائمة */
      /* v1.3.0: ?v= وقت آخر تحديث — كسر ذاكرة المتصفح فور تغيير الصورة */
      photoUrl: `/api/counselors/${String(p._id)}/photo?v=${p.updatedAt ? new Date(p.updatedAt as string).getTime() : 0}`,
      yearsExperience: p.yearsExperience ?? 0,
      available: !!p.available,
      rating: Math.round((p.rating ?? 5) * 10) / 10,
      sessionsCount: countByCounselor.get(String(p.userId)) ?? 0,
      pseudonym: nameById.get(String(p.userId)) || null,
      /* v2.6.0: جدول التوفر الأسبوعي — للنافذة المنبثقة للحجز (الخيار الثاني)
         وللمطابقة في الواجهة؛ null = غير مخصّص = كل الأوقات */
      weeklyAvailability: (p.weeklyAvailability as WeeklyAvailability | null) ?? null,
      /* v2.7.0: فائز التحدي (التاج الملكي) */
      challengeWinner: !!challengeWinnerInfo && challengeWinnerInfo.userId === String(p.userId),
      /* v2.9.0: روابط التواصل الاجتماعي (أيقونات حقيقية في البطاقة) */
      socials: (p as { socials?: { facebook?: string | null; instagram?: string | null; tiktok?: string | null } }).socials ?? {},
      /* v1.0.0 (طمأنينة): سعر الجلسة — v1.3.0: الأسعار الثلاثة المستقلة + دينار للتوافق */
      sessionPrice: Math.max(200, Math.round(Number((p as { sessionPrice?: number }).sessionPrice) || DEFAULT_SESSION_PRICE)),
      sessionPrices: buildSessionPrices((p as { sessionPrices?: unknown }).sessionPrices as never, (p as { sessionPrice?: number }).sessionPrice),
    })),
  });
}

export const GET = apiHandler(GET_impl);
