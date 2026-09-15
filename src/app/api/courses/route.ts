import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { Clinic, Course, CourseEnrollment, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";
import { counselorVerified, courseSpecialist, serializeCourse } from "@/lib/server/courses";

export const dynamic = "force-dynamic";

/* ═ v1.19.0 — الدورات الأونلاين (v1.20.0: لكل الأدوار المسجّلة) ═
   GET  /api/courses?userId={حساب} → الدورات المفتوحة + ما يخصّ المتصفح:
        المقاعد المتبقية لحظياً + حالة حجزه في كل دورة. تظهر للعملاء
        والأخصائيين والعيادات والإدارة (طلب المستخدم) — صاحب الدورة
        يدير دوراته من مساره الخاص بلوحته.
   POST /api/courses { userId(أخصائي موثّق أو عيادة نشطة), title,
        description?, price, capacity, startsAt? } → إنشاء دورة جديدة. */

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

async function GET_impl(req: NextRequest) {
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId || !/^[a-f0-9]{24}$/i.test(String(userId))) return bad("CLIENT_ONLY", 403);
  await connectDB();
  const u = (await User.findById(String(userId)).select("role suspended").lean()) as { role?: string; suspended?: boolean } | null;
  /* v1.20.0: صفحة الدورات لكل الأدوار المسجّلة غير المعلّقة
     (عميل/أخصائي/عيادة/إدارة — طلب المستخدم) */
  if (!u || u.suspended || !(u.role === "VICTIM" || u.role === "COUNSELOR" || u.role === "CLINIC" || u.role === "ADMIN")) {
    return bad("CLIENT_ONLY", 403);
  }

  const rows = (await Course.find({ status: "open" }).sort({ createdAt: -1 }).limit(100).lean()) as Record<string, unknown>[];
  const courses: Record<string, unknown>[] = [];
  for (const c of rows) courses.push(await serializeCourse(c, String(userId)));

  /* حجوزاتي كعميل — تشمل الدورات المغلقة/المنتهية حتى يتتبع العميل حالتها */
  const myRows = (await CourseEnrollment.find({ clientId: userId }).sort({ createdAt: -1 }).limit(50).lean()) as Record<string, unknown>[];
  const courseIds = Array.from(new Set(myRows.map((e) => String(e.courseId))));
  const rel = courseIds.length ? (await Course.find({ _id: { $in: courseIds } }).select("title price specialistId startsAt status").lean()) as Record<string, unknown>[] : [];
  const byId = new Map(rel.map((c) => [String(c._id), c]));
  const myEnrollments: Record<string, unknown>[] = [];
  for (const e of myRows) {
    const c = byId.get(String(e.courseId));
    if (!c) continue;
    myEnrollments.push({
      id: String(e._id),
      courseId: String(e.courseId),
      title: String(c.title || ""),
      price: Number(c.price ?? e.price) || 0,
      startsAt: (c.startsAt as Date | null) || null,
      specialistName: (await courseSpecialist(String(c.specialistId))).name,
      status: String(e.status || "pending"),
      rejectReason: (e.rejectReason as string) || null,
      createdAt: e.createdAt,
    });
  }
  return NextResponse.json({ courses, myEnrollments });
}

async function POST_impl(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const userId = String(body.userId || "");
  if (!/^[a-f0-9]{24}$/i.test(userId)) return bad("INVALID", 401);
  await connectDB();
  const u = (await User.findById(userId).select("role suspended").lean()) as { role?: string; suspended?: boolean } | null;
  if (!u || u.suspended || !(u.role === "COUNSELOR" || u.role === "CLINIC")) return bad("INVALID", 401);
  /* الأخصائي الموثّق أو العيادة النشطة — طلب المستخدم: الدورات من صلاحية الاثنين */
  if (u.role === "COUNSELOR") {
    if (!(await counselorVerified(userId))) return bad("NOT_VERIFIED", 403);
  } else {
    const clinic = (await Clinic.findOne({ ownerUserId: userId }).select("isActive").lean()) as { isActive?: boolean } | null;
    if (!clinic || clinic.isActive === false) return bad("NOT_VERIFIED", 403);
  }

  const title = String(body.title || "").trim().slice(0, 150);
  const description = String(body.description || "").trim().slice(0, 2000);
  const price = Math.round(Number(body.price));
  const capacity = Math.round(Number(body.capacity));
  if (!title || !Number.isFinite(price) || price < 0 || price > 100000000) return bad("INVALID");
  if (!Number.isFinite(capacity) || capacity < 1 || capacity > 10000) return bad("INVALID_CAPACITY");
  let startsAt: Date | null = null;
  if (body.startsAt) {
    const d = new Date(String(body.startsAt));
    if (!Number.isNaN(d.getTime())) startsAt = d;
  }

  const doc = await Course.create({ specialistId: new mongoose.Types.ObjectId(userId), title, description, price, capacity, startsAt, status: "open" });
  const created = (await Course.findById((doc as unknown as { _id: unknown })._id).lean()) as Record<string, unknown> | null;
  return NextResponse.json({ ok: true, course: created ? await serializeCourse(created, null) : null });
}

export const POST = apiHandler(POST_impl);
export const GET = apiHandler(GET_impl);
