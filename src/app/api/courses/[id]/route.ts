import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Course, CourseEnrollment, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";
import { activeSeats, getOwnedCourse } from "@/lib/server/courses";

export const dynamic = "force-dynamic";

/* ═ v1.19.0 — تعديل/إغلاق/حذف دورة من صاحبها حصراً ═
   PATCH  /api/courses/{id} { userId, action: "update"|"close"|"open", ... }
   DELETE /api/courses/{id}?userId={صاحب الدورة} → تحذف الدورة وتسجيلاتها */

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

async function ownerOf(courseId: string, userId: unknown) {
  if (!userId || !/^[a-f0-9]{24}$/i.test(String(userId))) return null;
  const u = (await User.findById(String(userId)).select("role suspended").lean()) as { role?: string; suspended?: boolean } | null;
  /* v1.20.0: صاحب الدورة أخصائي أو عيادة */
  if (!u || u.suspended || !(u.role === "COUNSELOR" || u.role === "CLINIC")) return null;
  return getOwnedCourse(courseId, String(userId));
}

async function PATCH_impl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  await connectDB();
  const course = await ownerOf(id, body.userId);
  if (!course) return bad("NOT_FOUND", 404);

  const action = String(body.action || "update");
  if (action === "close" || action === "open") {
    await Course.updateOne({ _id: course._id }, { $set: { status: action === "close" ? "closed" : "open" } });
    return NextResponse.json({ ok: true });
  }

  /* تحديث البيانات — السعة لا تنزل تحت المقاعد المشغولة فعلاً */
  const title = String(body.title ?? course.title).trim().slice(0, 150);
  const description = String(body.description ?? course.description).trim().slice(0, 2000);
  const price = Math.round(Number(body.price ?? course.price));
  let capacity = Math.round(Number(body.capacity ?? course.capacity));
  if (!title || !Number.isFinite(price) || price < 0 || price > 100000000) return bad("INVALID");
  const taken = await activeSeats(String(course._id));
  if (!Number.isFinite(capacity) || capacity < Math.max(1, taken) || capacity > 10000) return bad("CAPACITY_MIN");
  let startsAt: Date | null = (course.startsAt as Date | null) || null;
  if (body.startsAt !== undefined) {
    if (body.startsAt === null || body.startsAt === "") startsAt = null;
    else {
      const d = new Date(String(body.startsAt));
      if (!Number.isNaN(d.getTime())) startsAt = d;
    }
  }
  await Course.updateOne({ _id: course._id }, { $set: { title, description, price, capacity, startsAt } });
  return NextResponse.json({ ok: true });
}

async function DELETE_impl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const userId = new URL(req.url).searchParams.get("userId");
  await connectDB();
  const course = await ownerOf(id, userId);
  if (!course) return bad("NOT_FOUND", 404);
  await CourseEnrollment.deleteMany({ courseId: course._id });
  await Course.deleteOne({ _id: course._id });
  return NextResponse.json({ ok: true });
}

export const PATCH = apiHandler(PATCH_impl);
export const DELETE = apiHandler(DELETE_impl);
