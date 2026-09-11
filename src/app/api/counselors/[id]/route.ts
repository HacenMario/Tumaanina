import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { CounselorProfile, SupportSession } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/* ─── الملف العام للأخصائي (v2.5.3) ───
   صفحة عمومية قابلة للمشاركة: /counselor/{id}
   تعرض فقط ما هو آمن للنشر: الاسم المهني، التخصصات، اللغات،
   سنوات الخبرة، عدد الجلسات المكتملة (محدّث لحظياً)، ونبذة.
   لا تُعاد أبداً: رقم الواتساب، صورة الشهادة، أو أي بيانات تواصل. */
async function GET_impl(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await connectDB();

  const p = (await CounselorProfile.findById(id).lean()) as Record<string, unknown> | null;
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const verified = p.verificationStatus === "VERIFIED";
  const userId = String(p.userId);

  /* عدد الجلسات المكتملة يُحسب مباشرة من قاعدة البيانات في كل طلب */
  const done = await SupportSession.countDocuments({ counselorId: p.userId, status: "COMPLETED" });

  const createdAt = p.createdAt ? new Date(p.createdAt as string) : null;

  return NextResponse.json({
    profile: {
      id: String(p._id),
      userId,
      fullName: p.fullName,
      bio: p.bio ?? null,
      specialties: p.specialties || [],
      customSpecialties: p.customSpecialties || [],
      languages: p.languages || [],
      yearsExperience: p.yearsExperience ?? 0,
      available: !!p.available,
      rating: Math.round((Number(p.rating) || 5) * 10) / 10,
      verified,
      sessionsCount: done,
      /* «عضو منذ» بصيغة YYYY/MM — موحّد مع الشهادة والملف العام */
      memberSince: createdAt ? `${createdAt.getFullYear()}/${String(createdAt.getMonth() + 1).padStart(2, "0")}` : null,
      photoUrl: (p.photo as string | null) ? `/api/counselors/${id}/photo` : null,
    },
  });
}

export const GET = apiHandler(GET_impl);
