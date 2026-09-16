import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User, CounselorProfile, Clinic } from "@/lib/models";

export const dynamic = "force-dynamic";

/**
 * v1.22.2 — نقطة مزامنة الحساب (الحل الجذري لمشكلة «الكاش» بعد التوثيق)
 * ─────────────────────────────────────────────────────────────
 * كانت حالة التوثيق والصورة والاسم تُخزَّن في localStorage لحظة الدخول
 * فقط، فكان الأخصائي الموثَّق من الإدارة يرى لافتة «قيد التوثيق» حتى
 * يمسح بيانات الموقع يدوياً — وكثير منهم لا يعرف كيف.
 * الحل: الواجهة تستعلم هنا عند إقلاع المنصة فتستبدل نسخة الحساب المحفوظة
 * محلياً بالنسخة الحية من الخادم — الخادم مصدر الحقيقة دائماً، ولا حاجة
 * لمسح أي كاش أبداً بعد اليوم.
 * بلا كوكيز/جلسات: يتبع نمط المنصة القائم (userId في الاستعلام كما في
 * /api/counselor و/api/sessions و/api/messages/threads).
 */
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId") || "";
    if (!userId) {
      return NextResponse.json({ error: "USER_ID_REQUIRED" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    await connectDB();
    const u = (await User.findById(userId)
      .select("role pseudonym language wilaya ageGroup gender phone staffRole staffName suspended")
      .lean()) as
      | {
          _id: unknown;
          role?: string;
          pseudonym?: string | null;
          language?: string | null;
          wilaya?: string | null;
          ageGroup?: string | null;
          gender?: string | null;
          phone?: string | null;
          staffRole?: string | null;
          staffName?: string | null;
          suspended?: boolean;
        }
      | null;

    if (!u) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "no-store" } });

    /* الحقول المشتركة لكل الأدوار — نفس حقول AuthUser في المتجر المحلي */
    const user: Record<string, unknown> = {
      id: String(u._id),
      role: u.role,
      pseudonym: u.pseudonym ?? null,
      language: u.language ?? null,
      wilaya: u.wilaya ?? null,
      ageGroup: u.ageGroup ?? null,
      gender: u.gender ?? null,
      phone: u.phone ?? null,
      suspended: !!u.suspended,
    };

    /* الأخصائي: حالة التوثيق والصورة والاسم تعيش في CounselorProfile */
    if (u.role === "COUNSELOR") {
      const profile = (await CounselorProfile.findOne({ userId: u._id })
        .select("fullName verificationStatus photo")
        .lean()) as { fullName?: string | null; verificationStatus?: string | null; photo?: string | null } | null;
      user.fullName = profile?.fullName ?? null;
      user.verified = profile?.verificationStatus === "VERIFIED";
      user.verificationStatus = profile?.verificationStatus ?? "PENDING";
      user.photo = profile?.photo ?? null;
    }

    /* العيادة: اسمها ورابطها وحالتها تعيش في Clinic */
    if (u.role === "CLINIC") {
      const clinic = (await Clinic.findOne({ ownerUserId: u._id })
        .select("name slug isActive")
        .lean()) as { _id: unknown; name?: string | null; slug?: string | null; isActive?: boolean } | null;
      user.clinicName = clinic?.name ?? u.pseudonym ?? null;
      user.clinicSlug = clinic?.slug ?? null;
      user.clinicId = clinic ? String(clinic._id) : null;
      user.clinicActive = clinic?.isActive !== false;
    }

    /* فريق الإدارة: مستوى الصلاحية والاسم */
    if (u.role === "ADMIN") {
      user.staffRole = u.staffRole === "SUPER" || u.staffRole === "MANAGER" ? u.staffRole : "ADMIN";
      user.fullName = u.staffName || u.pseudonym || null;
    }

    /* no-store إلزامي: لا المتصفح ولا أي وسيط يخزّن حالة الحساب أبداً */
    return NextResponse.json({ ok: true, user }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
