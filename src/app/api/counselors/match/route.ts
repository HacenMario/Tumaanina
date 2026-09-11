import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { CounselorProfile, SupportSession, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";
import { normalizeAvailability, matchSlots, dayKeyUTC1, MAX_ACCEPTED_PER_DAY } from "@/lib/availability";
import { getChallengeWinner } from "@/lib/server/challenge";
import { DEFAULT_SESSION_PRICE, buildSessionPrices } from "@/lib/constants";
import type { WeeklyAvailability } from "@/lib/availability";

export const dynamic = "force-dynamic";

/**
 * v2.6.0 — الخيار الأول: مطابقة الأخصائيين مع مواعيد العميل
 * ─────────────────────────────────────────────────────────────
 * POST { slots: [{ date: "YYYY-MM-DD", slot: "HH:MM" }, …] }
 * يُرجع الأخصائيين الموثّقين غير المعلّقين والمتاحين الذين يوفرون
 * واحداً على الأقل من المواعيد المطلوبة في جداولهم، مع قائمة
 * المواعيد المتقاطعة لكل أخصائي (تُبرز في البطاقة وتُعبّئ الحجز).
 *
 * الأخصائي «غير المخصّص» (بلا weeklyAvailability) يطابق كل المواعيد
 * — سلوك backward-compatible يضمن استمرارية الحسابات القائمة.
 */
async function POST_impl(req: NextRequest) {
  const body = await req.json();
  /* v2.9.0: جنس العميل — يُستبعد كل أخصائي أعلن عدم قبوله لهذا الجنس */
  const gender: string | null = typeof body?.gender === "string" && ["male", "female"].includes(body.gender) ? body.gender : null;
  const picks: { date: string; slot: string }[] = Array.isArray(body?.slots)
    ? body.slots
        .filter((s: unknown) => !!s && typeof (s as { date?: unknown }).date === "string" && typeof (s as { slot?: unknown }).slot === "string")
        .map((s: { date: string; slot: string }) => ({ date: s.date, slot: s.slot }))
        .slice(0, 12)
    : [];

  await connectDB();

  const profiles = await CounselorProfile.find({ verificationStatus: "VERIFIED" })
    .select("-photo -diplomaImage")
    .sort({ available: -1, rating: -1 })
    .lean();

  const userIds = profiles.map((p) => p.userId).filter(Boolean);
  const users = await User.find({ _id: { $in: userIds } }).select("pseudonym suspended acceptedGenders").lean();
  const suspendedById = new Set(
    users.filter((u) => (u as { suspended?: boolean }).suspended).map((u) => String(u._id))
  );
  const nameById = new Map(users.map((u) => [String(u._id), (u as { pseudonym?: string }).pseudonym]));
  /* v2.9.0: تفضيل الجنس */
  const acceptedBy = new Map(
    users.map((u) => [
      String(u._id),
      ((u as { acceptedGenders?: string[] }).acceptedGenders?.length
        ? (u as { acceptedGenders?: string[] }).acceptedGenders!
        : ["male", "female"]) as string[],
    ])
  );

  const matched = profiles
    .filter((p) => !suspendedById.has(String(p.userId)))
    /* v2.9.0: استبعاد من لا يقبل جنس العميل (بدون جنس معروف = لا استبعاد) */
    .filter((p) => !gender || (acceptedBy.get(String(p.userId)) || ["male", "female"]).includes(gender))
    .map((p) => {
      const av = normalizeAvailability(p.weeklyAvailability) as WeeklyAvailability | null;
      return { p, av, hits: matchSlots(av, picks) };
    })
    /* الخيار الأول: يظهر فقط من يوفر نفس الموعد الذي اختاره العميل
       — والمتاح فعلاً للحجز (available=false لا فائدة من مطابقته) */
    .filter((x) => x.hits.length > 0 && x.p.available);

  /* ─── v2.8.0: توزيع عادل للجلسات ───
     1) الموعد الذي يبلغ فيه الأخصائي حدّه اليومي (أكثر من 4 مقبولة في نفس اليوم)
        يُحذف من مواعيده المتقاطعة — ومن لم يتبقَّ له موعد يُستبعد كلياً
     2) الترتيب يقدّم الأقل حملاً على أيام المطابقة (توزيع المهام على الجميع) */
  const today = dayKeyUTC1(new Date());
  const horizon = new Date(Date.now() + 62 * 24 * 60 * 60 * 1000);
  const acceptedSessions = (await SupportSession.find({
    status: { $in: ["ACCEPTED", "ACTIVE"] },
    scheduledAt: { $gte: new Date(Date.now() - 2 * 60 * 60 * 1000), $lte: horizon },
  })
    .select("counselorId scheduledAt")
    .lean()) as unknown as { counselorId: unknown; scheduledAt: Date }[];

  /* counts[counselorId][dayKey] = عدد المقبولة في ذلك اليوم (توقيت الجزائر) */
  const counts: Record<string, Record<string, number>> = {};
  for (const s of acceptedSessions) {
    const cId = String(s.counselorId);
    const key = dayKeyUTC1(new Date(s.scheduledAt.getTime()));
    (counts[cId] ||= {});
    counts[cId][key] = (counts[cId][key] || 0) + 1;
  }

  const fair = matched
    .map((x) => {
      const cId = String(x.p.userId);
      const byDay = counts[cId] || {};
      const liveHits = x.hits.filter((h) => (byDay[h.date] || 0) <= MAX_ACCEPTED_PER_DAY);
      const todayLoad = byDay[today] || 0;
      const totalNearby = Object.values(byDay).reduce((a, b) => a + b, 0);
      return { ...x, hits: liveHits, todayLoad, _fairKey: totalNearby };
    })
    .filter((x) => x.hits.length > 0)
    .sort((a, b) => a._fairKey - b._fairKey || b.hits.length - a.hits.length);

  /* v2.7.0: فائز التحدي — التاج الملكي يظهر له حتى في نتائج المطابقة */
  const challengeWinnerInfo = await getChallengeWinner();

  return NextResponse.json({
    counselors: fair.map(({ p, av, hits, todayLoad }) => ({
      id: String(p._id),
      userId: String(p.userId),
      slug: p.slug || null,
      fullName: p.fullName,
      specialties: p.specialties || [],
      customSpecialties: (p as { customSpecialties?: string[] }).customSpecialties || [],
      languages: p.languages || [],
      bio: p.bio ?? null,
      photoUrl: `/api/counselors/${String(p._id)}/photo`,
      yearsExperience: p.yearsExperience ?? 0,
      available: !!p.available,
      rating: Math.round((p.rating ?? 5) * 10) / 10,
      sessionsCount: p.sessionsCount ?? 0,
      pseudonym: nameById.get(String(p.userId)) || null,
      weeklyAvailability: (p.weeklyAvailability as WeeklyAvailability | null) ?? null,
      matchedSlots: hits,
      /* v2.8.0: عدد جلساته المقبولة اليوم — لتظهر الصورة العادلة للتوزيع */
      todayLoad,
      /* v2.7.0: فائز التحدي (التاج الملكي) */
      challengeWinner: !!challengeWinnerInfo && challengeWinnerInfo.userId === String(p.userId),
      /* v2.9.0: روابط التواصل الاجتماعي */
      socials: (p as { socials?: { facebook?: string | null; instagram?: string | null; tiktok?: string | null } }).socials ?? {},
      /* v1.0.0 (طمأنينة): سعر الجلسة — v1.3.0: الأسعار الثلاثة المستقلة + دينار للتوافق */
      sessionPrice: Math.max(200, Math.round(Number((p as { sessionPrice?: number }).sessionPrice) || DEFAULT_SESSION_PRICE)),
      sessionPrices: buildSessionPrices((p as { sessionPrices?: unknown }).sessionPrices as never, (p as { sessionPrice?: number }).sessionPrice),
    })),
  });
}

export const POST = apiHandler(POST_impl);
