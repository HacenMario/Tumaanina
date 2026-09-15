import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { Course, CourseEnrollment, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";
import { notifyUser } from "@/lib/server/notify";
import { ACTIVE_STATUSES, activeSeats, courseSpecialist } from "@/lib/server/courses";

export const dynamic = "force-dynamic";

/* ═ v1.19.0 — حجز مقعد في دورة ═
   POST /api/courses/{id}/enroll { userId, name?, contactPhone, contactEmail?, contactNote? }
   • v1.20.0: الحجز متاح لكل الأدوار المسجّلة (عميل/أخصائي/عيادة)
     غير صاحب الدورة — الإدارة لا تحجز.
   • v1.21.0: رقم الهاتف إلزامي عند الحجز (والبريد والملاحظة اختياريان)
     — تُخزّن معلومات التواصل مع الحجز ويراها صاحب الدورة وحده في نافذة
     الملتحقين عند الضغط على اسم المسجّل.
   • الدورة مفتوحة + مقعد متاح + لا حجز نشط سابق لنفس المستخدم
   • الحجز يُنشأ بحالة pending — المقعد محجوز فوراً (يبقى متاحاً للآخرين
     فقط بعد رفض/إلغاء الحجز)
   • إشعار فوري للطرفين — منتظَر (await) ضماناً للحفظ حتى على مضيفي
     الدوال المؤقتة، وبلغة كل حساب */

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

async function POST_impl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const userId = String(body.userId || "");
  if (!/^[a-f0-9]{24}$/i.test(id) || !/^[a-f0-9]{24}$/i.test(userId)) return bad("INVALID");
  await connectDB();

  const u = (await User.findById(userId).select("role suspended pseudonym fullName").lean()) as
    | { role?: string; suspended?: boolean; pseudonym?: string; fullName?: string }
    | null;
  if (!u || u.suspended || u.role === "ADMIN") return bad("CLIENT_ONLY", 403);

  const course = (await Course.findById(id).lean()) as Record<string, unknown> | null;
  if (!course) return bad("NOT_FOUND", 404);
  /* صاحب الدورة لا يحجز مقعداً في دورته */
  if (String(course.specialistId) === userId) return bad("INVALID", 403);
  if (String(course.status) !== "open") return bad("COURSE_CLOSED", 409);

  /* لا حجز نشط مكرر — الحجوزات المرفوضة/الملغاة لا تمنع إعادة المحاولة */
  const dup = await CourseEnrollment.findOne({
    courseId: new mongoose.Types.ObjectId(id),
    clientId: new mongoose.Types.ObjectId(userId),
    status: { $in: ACTIVE_STATUSES },
  }).lean();
  if (dup) return bad("ALREADY_BOOKED", 409);

  /* v1.21.0: معلومات التواصل — الهاتف إلزامي كي يتمكن صاحب الدورة من التواصل */
  const contactPhone = String(body.contactPhone || "").trim().slice(0, 40) || null;
  if (!contactPhone || !/^\+?[0-9][0-9\s().-]{5,19}$/.test(contactPhone)) return bad("CONTACT_REQUIRED");
  const contactEmail = String(body.contactEmail || "").trim().slice(0, 160).toLowerCase() || null;
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contactEmail)) return bad("INVALID_EMAIL");
  const contactNote = String(body.contactNote || "").trim().slice(0, 500) || null;

  /* المقعد الفعلي — عدّ لحظي تحت قفل تحقق قبل الإنشاء */
  const taken = await activeSeats(id);
  const capacity = Number(course.capacity) || 0;
  if (taken >= capacity) return bad("COURSE_FULL", 409);

  const clientName =
    String(body.name || u.pseudonym || u.fullName || "").trim().slice(0, 80) || null;
  const created = await CourseEnrollment.create({
    courseId: new mongoose.Types.ObjectId(id),
    clientId: new mongoose.Types.ObjectId(userId),
    clientName,
    contactPhone,
    contactEmail,
    contactNote,
    price: Number(course.price) || 0,
    status: "pending",
  });

  /* تحقق بعد الإنشاء — لو تسابق طلبان على آخر مقعد يُتراجع تلقائياً
     عن الأحدث فيبقى العدد داخل السعة دوماً */
  const after = await activeSeats(id);
  if (after > capacity) {
    await CourseEnrollment.deleteOne({ _id: created._id });
    return bad("COURSE_FULL", 409);
  }

  /* إشعارات فورية للطرفين — منتظَرة (await) ضماناً للحفظ */
  const specialist = await courseSpecialist(String(course.specialistId));
  const ownerUrl = specialist.role === "CLINIC" ? "/?view=clinic-dashboard" : "/?view=counselor-dashboard";
  try {
    await notifyUser(String(course.specialistId), "courseNewBooking", ownerUrl, {
      name: clientName || "—",
      course: String(course.title || "").slice(0, 80),
    });
    await notifyUser(userId, "coursePending", "/?view=courses", {
      name: specialist.name,
      course: String(course.title || "").slice(0, 80),
    });
  } catch {
    /* الإشعار لا يُفشل الحجز */
  }

  return NextResponse.json({ ok: true, remaining: Math.max(0, capacity - after) });
}

export const POST = apiHandler(POST_impl);
