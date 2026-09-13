import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Clinic, ClinicAd, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/* ═ v1.15.0 — الإعلان العائم ═
   GET /api/ads/floating?userId={عميل|مختص}
     يعيد إعلاناً عائماً واحداً مؤهلاً للعرض لهذا المستخدم:
     • منشور (APPROVED) + مفعّل عائماً + لم تنته صلاحيته
     • لا يظهر لحسابات العيادات الأخرى ولا للإدارة أبداً
     • لا يظهر لمن رفض الإعلانات المدفوعة من إعداداته
     • لا يظهر لمن استنفد حده (كم مرة يظهر لكل مستخدم) — منع الإزعاج
   POST /api/ads/floating {userId, adId}
     تسجيل ظهور فعلي: يزيد عدّاد مرات ظهوره لهذا المستخدم + المشاهدات الفريدة. */

async function GET_impl(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId || !/^[a-f0-9]{24}$/i.test(userId)) {
    return NextResponse.json({ ad: null });
  }
  await connectDB();

  const user = (await User.findById(userId).select("role suspended adsOptOut").lean()) as
    | { role?: string; suspended?: boolean; adsOptOut?: boolean }
    | null;
  if (!user || user.suspended) return NextResponse.json({ ad: null });
  /* الإعلان العائم للعملاء والمختصين فقط — لا عيادات ولا إدارة */
  if (user.role !== "VICTIM" && user.role !== "COUNSELOR") return NextResponse.json({ ad: null });
  /* حق الرفض: من أغلق الإعلانات المدفوعة من إعداداته لا يرى شيئاً */
  if (user.adsOptOut === true) return NextResponse.json({ ad: null });

  const now = new Date();
  const ads = await ClinicAd.find({ status: "APPROVED", float: true, expiresAt: { $gt: now } })
    .sort({ reviewedAt: -1 })
    .limit(10)
    .lean();

  for (const a of ads) {
    const rec = a as unknown as {
      _id: unknown; clinicId: unknown; title: string; body: string; media?: string[]; image?: string | null;
      floatPerUser?: number; expiresAt?: Date | null; likes?: string[]; impressions?: { userId: unknown; count: number }[];
    };
    /* حد التكرار: كم مرة ظهر لهذا المستخدم سابقاً */
    const mine = (rec.impressions || []).find((im) => String(im.userId) === userId);
    const seen = mine ? mine.count : 0;
    if (seen >= (rec.floatPerUser || 3)) continue;

    const cid = String(rec.clinicId as { toString(): string });
    const clinic = (await Clinic.findById(cid).select("name slug hasLogo").lean()) as Record<string, unknown> | null;
    if (!clinic || clinic.isActive === false) continue;
    if (!(clinic.slug as string)) continue;

    const media = (rec.media && rec.media.length ? rec.media : rec.image ? [rec.image] : []) as string[];
    return NextResponse.json({
      ad: {
        id: String(rec._id),
        title: rec.title,
        body: rec.body,
        mediaUrls: media.map((_, i) => `/api/ads/${String(rec._id)}/media/${i}`),
        expiresAt: rec.expiresAt ?? null,
        likesCount: (rec.likes || []).length,
        clinic: {
          id: cid,
          name: (clinic.name as string) || "—",
          slug: (clinic.slug as string) || null,
          hasLogo: clinic.hasLogo === true,
          logoUrl: `/api/clinics/${cid}/logo`,
        },
      },
    });
  }

  return NextResponse.json({ ad: null });
}

async function POST_impl(req: NextRequest) {
  const body = await req.json();
  const { userId, adId } = body as { userId?: string; adId?: string };
  if (!userId || !adId || !/^[a-f0-9]{24}$/i.test(userId) || !/^[a-f0-9]{24}$/i.test(adId)) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  await connectDB();

  const user = (await User.findById(userId).select("role adsOptOut").lean()) as { role?: string; adsOptOut?: boolean } | null;
  if (!user || (user.role !== "VICTIM" && user.role !== "COUNSELOR") || user.adsOptOut === true) {
    return NextResponse.json({ ok: false });
  }

  const ad = (await ClinicAd.findById(adId).select("float expiresAt impressions viewers views").lean()) as
    | { float?: boolean; expiresAt?: Date | null; impressions?: { userId: unknown; count: number }[]; viewers?: unknown[]; views?: number }
    | null;
  if (!ad || ad.float !== true || !ad.expiresAt || ad.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ ok: false });
  }

  /* زيادة عدّاد هذا المستخدم + المشاهدات الفريدة */
  const mine = (ad.impressions || []).findIndex((im) => String(im.userId) === userId);
  if (mine >= 0) {
    await ClinicAd.updateOne({ _id: adId, "impressions.userId": userId }, { $inc: { "impressions.$.count": 1 } });
  } else {
    await ClinicAd.updateOne({ _id: adId }, { $push: { impressions: { userId, count: 1 } } });
  }
  const isNewViewer = !(ad.viewers || []).some((v) => String(v) === userId);
  if (isNewViewer) {
    await ClinicAd.updateOne({ _id: adId }, { $addToSet: { viewers: userId }, $inc: { views: 1 } });
  }
  return NextResponse.json({ ok: true });
}

export const GET = apiHandler(GET_impl);
export const POST = apiHandler(POST_impl);
