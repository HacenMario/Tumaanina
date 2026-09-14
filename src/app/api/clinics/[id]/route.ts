import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Clinic, ClinicGalleryMedia, CounselorProfile, User } from "@/lib/models";
import { loadClinicGalleryVideos } from "@/lib/server/media";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/* ═ v1.17.0 — الأخصائيون التابعون للعيادة ═
   الأخصائي يختار عيادته (اختيارياً) عند إنشاء حسابه — يظهر هنا في صفحة
   عيادته بقائمة أخصائييها: الموثّقون غير المعلّقين فقط، بكل تفاصيلهم
   العمومية (الاسم، التخصصات، الخبرة، النبذة، الصورة، التقييم، الرابط). */
async function loadClinicSpecialists(clinicId: string) {
  const users = (await User.find({ role: "COUNSELOR", suspended: false, clinicId }).select("_id").lean()) as {
    _id: unknown;
  }[];
  const ids = users.map((u) => String(u._id));
  if (!ids.length) return [];
  const profiles = (await CounselorProfile.find({ userId: { $in: ids }, verificationStatus: "VERIFIED" }).lean()) as Record<
    string,
    unknown
  >[];
  return profiles.map((p) => {
    const uid = String(p.userId);
    return {
      id: uid,
      name: (p.fullName as string) || "—",
      slug: (p.slug as string) || null,
      specialties: (p.specialties as string[]) || [],
      customSpecialties: (p.customSpecialties as string[]) || [],
      bio: (p.bio as string) || null,
      yearsExperience: Number(p.yearsExperience) || 0,
      rating: Math.round((Number(p.rating) || 5) * 10) / 10,
      sessionsCount: Number(p.sessionsCount) || 0,
      photoUrl: p.photo ? `/api/counselors/${uid}/photo` : null,
    };
  });
}

/* ═ v1.14.0 — ملف عيادة عام (صفحة العيادة) ═
   GET /api/clinics/{id} — يقبل المعرّف أو الـslug.
   يعرض الملف الكامل لعيادة نشطة: كل بياناتها العمومية + الهواتف
   (لأزرار الاتصال المباشر) + اللوغو من مساره. الحساب المعلّق
   (suspended) أو العيادة المعطّلة (isActive=false) تعيد 404. */

async function GET_impl(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await connectDB();

  const key = String(id || "").trim();
  if (!key) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isObjectId = /^[a-f0-9]{24}$/i.test(key);
  const clinic = (await Clinic.findOne(isObjectId ? { _id: key } : { slug: key }).lean()) as Record<string, unknown> | null;
  if (!clinic || clinic.isActive === false) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const owner = (await User.findById(clinic.ownerUserId).select("suspended email").lean()) as
    | { suspended?: boolean; email?: string }
    | null;
  if (!owner || owner.suspended) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const nowYear = new Date().getFullYear();
  const founded = Number(clinic.foundedYear) || 0;

  return NextResponse.json({
    clinic: {
      id: String(clinic._id),
      name: clinic.name,
      slug: clinic.slug,
      foundedYear: founded || null,
      yearsExperience: founded > 0 ? Math.max(0, nowYear - founded) : null,
      specialties: clinic.specialties || [],
      customSpecialties: clinic.customSpecialties || [],
      about: clinic.about ?? null,
      wilaya: clinic.wilaya ?? null,
      city: clinic.city ?? null,
      address: clinic.address ?? null,
      phones: clinic.phones || [],
      whatsapp: clinic.whatsapp || null,
      contactEmail: clinic.contactEmail ?? null,
      website: clinic.website ?? null,
      socials: clinic.socials ?? {},
      logoUrl: `/api/clinics/${String(clinic._id)}/logo?v=${clinic.updatedAt ? new Date(clinic.updatedAt as string).getTime() : 0}`,
      hasLogo: !!clinic.logo,
      workingHours: clinic.workingHours ?? null,
      priceNote: clinic.priceNote ?? null,
      licenseNumber: clinic.licenseNumber ?? null,
      rating: Math.round((Number(clinic.rating) || 5) * 10) / 10,
      ratingsCount: Number(clinic.ratingsCount) || 0,
      bookingsCount: Number(clinic.bookingsCount) || 0,
      /* v1.15.0: مواعيد الحجز الخاصة بالعيادة + المعرض + الموقع */
      slots: (clinic.slots as string[]) || [],
      galleryCount: ((clinic.gallery as string[]) || []).length,
      location: (clinic.location as { lat: number | null; lng: number | null }) ?? { lat: null, lng: null },
      /* v1.16.0: سعر الجلسة الحضورية + الباقات — v1.18.0: EUR/USD اختياري
         من العيادة نفسها (لا تحويل عملات في المنصة إطلاقاً) */
      sessionPrice: (clinic.sessionPrice as number | null) ?? null,
      priceEur: (clinic.priceEur as number | null) ?? null,
      priceUsd: (clinic.priceUsd as number | null) ?? null,
      packs: (clinic.packs as { name: string; sessions: number; price: number; note: string | null }[]) || [],
      /* v1.18.0: فيديوهات المعرض — القائمة الموحّدة (قديم + GridFS بلا حد حجم) */
      galleryVideoUrls: await loadClinicGalleryVideos(
        ClinicGalleryMedia,
        String(clinic._id),
        clinic.galleryVideoRefs as string[] | undefined
      ),
      specialists: await loadClinicSpecialists(String(clinic._id)),
      createdAt: clinic.createdAt,
    },
  });
}

export const GET = apiHandler(GET_impl);
