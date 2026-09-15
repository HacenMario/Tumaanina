import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { Course, CourseEnrollment, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";
import { notifyUser } from "@/lib/server/notify";
import { courseSpecialist } from "@/lib/server/courses";

export const dynamic = "force-dynamic";

/* ═ v1.19.0 — إدارة تسجيل دورة: تأكيد/رفض بالسبب (صاحب الدورة) وإلغاء (المحجز) ═
   POST /api/courses/enrollments/{id}
     { userId(صاحب الدورة), action: "confirm" }            → يُبلغ فوراً
     { userId(صاحب الدورة), action: "reject", reason }     → السبب إلزامي ويصل للطرف الآخر
     { userId(صاحب الحجز), action: "cancel" }              → يُحرَّر المقعد ويُبلغ صاحب الدورة
   v1.20.0: صاحب الدورة أخصائي أو عيادة — الإشعارات منتظَرة (await)
   ضماناً للحفظ، وروابطها تفتح لوحة صاحب الدورة الصحيحة. */

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

async function POST_impl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const userId = String(body.userId || "");
  const action = String(body.action || "");
  if (!/^[a-f0-9]{24}$/i.test(id) || !/^[a-f0-9]{24}$/i.test(userId)) return bad("INVALID");
  if (!["confirm", "reject", "cancel"].includes(action)) return bad("INVALID");
  await connectDB();

  const enrollment = (await CourseEnrollment.findById(id).lean()) as Record<string, unknown> | null;
  if (!enrollment) return bad("NOT_FOUND", 404);
  const course = (await Course.findById(String(enrollment.courseId)).lean()) as Record<string, unknown> | null;
  if (!course) return bad("NOT_FOUND", 404);

  const u = (await User.findById(userId).select("role suspended").lean()) as { role?: string; suspended?: boolean } | null;
  if (!u || u.suspended) return bad("INVALID", 401);
  const courseIdStr = String(course._id);

  /* ─── قرار صاحب الدورة: تأكيد أو رفض بالسبب ─── */
  if (action === "confirm" || action === "reject") {
    const isOwner =
      String(course.specialistId) === userId && (u.role === "COUNSELOR" || u.role === "CLINIC");
    if (!isOwner) return bad("FORBIDDEN", 403);
    if (String(enrollment.status) !== "pending") return bad("ALREADY_DECIDED", 409);
    const reason = String(body.reason || "").trim().slice(0, 300);
    if (action === "reject" && !reason) return bad("REASON_REQUIRED");

    await CourseEnrollment.updateOne(
      { _id: enrollment._id },
      { $set: { status: action === "confirm" ? "confirmed" : "rejected", rejectReason: action === "reject" ? reason : null, decidedAt: new Date() } }
    );

    const specialist = await courseSpecialist(userId);
    try {
      if (action === "confirm") {
        await notifyUser(String(enrollment.clientId), "courseConfirmed", "/?view=courses", {
          name: specialist.name,
          course: String(course.title || "").slice(0, 80),
        });
      } else {
        await notifyUser(String(enrollment.clientId), "courseRejected", "/?view=courses", {
          name: specialist.name,
          course: String(course.title || "").slice(0, 80),
          reason: reason.slice(0, 120),
        });
      }
    } catch {
      /* الإشعار لا يُفشل القرار */
    }
    return NextResponse.json({ ok: true });
  }

  /* ─── إلغاء المحجز لحجزه — المقعد يتحرر لأن العدّ يخصّ النشطة فقط ─── */
  if (String(enrollment.clientId) !== userId) return bad("FORBIDDEN", 403);
  if (!["pending", "confirmed"].includes(String(enrollment.status))) return bad("ALREADY_DECIDED", 409);
  await CourseEnrollment.updateOne({ _id: enrollment._id }, { $set: { status: "cancelled", decidedAt: new Date() } });

  try {
    const specialist = await courseSpecialist(String(course.specialistId));
    const ownerUrl = specialist.role === "CLINIC" ? "/?view=clinic-dashboard" : "/?view=counselor-dashboard";
    await notifyUser(String(course.specialistId), "courseCancelled", ownerUrl, {
      name: String(enrollment.clientName || "").slice(0, 60) || "—",
      course: String(course.title || "").slice(0, 80),
    });
  } catch {
    /* الإشعار لا يُفشل الإلغاء */
  }
  return NextResponse.json({ ok: true, courseId: courseIdStr });
}

export const POST = apiHandler(POST_impl);
