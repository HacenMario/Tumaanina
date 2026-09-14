import "server-only";
import mongoose from "mongoose";
import { CounselorProfile, Course, CourseEnrollment, User } from "@/lib/models";

/* ═ v1.19.0 — منطق الدورات الأونلاين المشترك ═
   المقاعد المشغولة = التسجيلات النشطة فقط (pending + confirmed).
   الرفض والإلغاء يحرّران المقعد تلقائياً لأن العدّ يُحسب من القاعدة
   لحظياً عند كل قراءة — بلا عدّاد مخزّن ينجرف. */

export const ACTIVE_STATUSES = ["pending", "confirmed"] as const;

export async function activeSeats(courseId: string): Promise<number> {
  const n = await CourseEnrollment.countDocuments({
    courseId: new mongoose.Types.ObjectId(courseId),
    status: { $in: ACTIVE_STATUSES },
  });
  return n;
}

export async function courseSpecialist(specialistId: string) {
  const prof = (await CounselorProfile.findOne({ userId: specialistId })
    .select("fullName rating photo updatedAt slug")
    .lean()) as Record<string, unknown> | null;
  const user = (await User.findById(specialistId).select("suspended").lean()) as { suspended?: boolean } | null;
  return {
    id: String(specialistId),
    name: (String(prof?.fullName || "") || "—").slice(0, 80),
    slug: (prof?.slug as string) || null,
    rating: Math.round((Number(prof?.rating) || 5) * 10) / 10,
    suspended: !!user?.suspended,
    photoUrl: prof?.photo ? `/api/counselors/${String((prof as { _id: unknown })._id)}/photo?v=${prof?.updatedAt ? new Date(prof.updatedAt as string).getTime() : 0}` : null,
  };
}

export async function counselorVerified(specialistId: string): Promise<boolean> {
  const prof = (await CounselorProfile.findOne({ userId: specialistId })
    .select("verificationStatus")
    .lean()) as { verificationStatus?: string } | null;
  return prof?.verificationStatus === "VERIFIED";
}

/* تسلسل شامل لدورة واحدة مع كل ما تحتاجه الواجهات */
export async function serializeCourse(
  course: Record<string, unknown>,
  viewerClientId?: string | null
) {
  const id = String((course._id as unknown) ?? "");
  const taken = await activeSeats(id);
  const capacity = Number(course.capacity) || 0;
  const specialist = await courseSpecialist(String(course.specialistId));
  let myStatus: string | null = null;
  let myEnrollmentId: string | null = null;
  if (viewerClientId) {
    const mine = (await CourseEnrollment.findOne({
      courseId: new mongoose.Types.ObjectId(id),
      clientId: new mongoose.Types.ObjectId(viewerClientId),
      status: { $in: ["pending", "confirmed"] },
    })
      .select("_id status")
      .lean()) as { _id: unknown; status?: string } | null;
    if (mine) {
      myStatus = String(mine.status);
      myEnrollmentId = String(mine._id);
    }
  }
  return {
    id,
    title: String(course.title || ""),
    description: String(course.description || ""),
    price: Number(course.price) || 0,
    capacity,
    taken,
    remaining: Math.max(0, capacity - taken),
    startsAt: (course.startsAt as Date | null) || null,
    status: String(course.status || "open"),
    specialist,
    myStatus,
    myEnrollmentId,
    createdAt: course.createdAt as Date,
  };
}

export async function getOwnedCourse(courseId: string, userId: string) {
  if (!/^[a-f0-9]{24}$/i.test(String(courseId || ""))) return null;
  const course = (await Course.findById(courseId).lean()) as Record<string, unknown> | null;
  if (!course) return null;
  if (String(course.specialistId) !== String(userId)) return null;
  return course;
}
