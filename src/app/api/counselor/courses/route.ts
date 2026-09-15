import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Course, CourseEnrollment, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";
import { activeSeats } from "@/lib/server/courses";

export const dynamic = "force-dynamic";

/* ═ v1.19.0 — دورات الأخصائي: قائمته الخاصة مع ملتحقي كل دورة ═
   GET /api/counselor/courses?userId={أخصائي} → الدورات كلها (مفتوحة ومغلقة)
   مرتبة الأحدث أولاً، وكل دورة تحمل تسجيلاتها كاملة لإدارة التأكيد
   والرفض داخل لوحة الأخصائي. المقاعد المحجوبة = النشطة فقط. */

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

async function GET_impl(req: NextRequest) {
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId || !/^[a-f0-9]{24}$/i.test(String(userId))) return bad("INVALID", 401);
  await connectDB();
  const u = (await User.findById(String(userId)).select("role suspended").lean()) as { role?: string; suspended?: boolean } | null;
  /* v1.20.0: الدورات من صلاحية الأخصائيين والعيادات معاً (طلب المستخدم) */
  if (!u || u.suspended || !(u.role === "COUNSELOR" || u.role === "CLINIC")) return bad("INVALID", 401);

  const rows = (await Course.find({ specialistId: userId }).sort({ createdAt: -1 }).limit(100).lean()) as Record<string, unknown>[];
  const courses: Record<string, unknown>[] = [];
  for (const c of rows) {
    const id = String(c._id);
    const enrollments = (
      await CourseEnrollment.find({ courseId: id }).sort({ createdAt: -1 }).limit(500).lean()
    ) as Record<string, unknown>[];
    const taken = await activeSeats(id);
    courses.push({
      id,
      title: String(c.title || ""),
      description: String(c.description || ""),
      price: Number(c.price) || 0,
      capacity: Number(c.capacity) || 0,
      taken,
      remaining: Math.max(0, (Number(c.capacity) || 0) - taken),
      startsAt: (c.startsAt as Date | null) || null,
      status: String(c.status || "open"),
      createdAt: c.createdAt,
      enrollments: enrollments.map((e) => ({
        id: String(e._id),
        clientName: (e.clientName as string) || "—",
        /* v1.21.0: معلومات تواصل المسجّل — تُظهر للمالك وحده عند الضغط على الاسم */
        contactPhone: (e.contactPhone as string) || null,
        contactEmail: (e.contactEmail as string) || null,
        contactNote: (e.contactNote as string) || null,
        price: Number(e.price) || 0,
        status: String(e.status || "pending"),
        rejectReason: (e.rejectReason as string) || null,
        createdAt: e.createdAt,
      })),
    });
  }
  return NextResponse.json({ courses });
}

export const GET = apiHandler(GET_impl);
