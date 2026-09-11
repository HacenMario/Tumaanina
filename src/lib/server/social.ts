import "server-only";
import { CounselorProfile, User } from "@/lib/models";

/**
 * v2.12.0 — أدوات مساعدة لمنشورات المجتمع.
 * اسم كاتب التعليق: الأخصائيون باسمهم المهني الكامل، والبقية بالاسم المستعار.
 */
export async function commentAuthorInfo(
  authorId: unknown
): Promise<{ name: string; role: string }> {
  const uid = String(authorId);
  try {
    const u = (await User.findById(uid).select("role pseudonym").lean()) as
      | { role?: string; pseudonym?: string | null }
      | null;
    if (!u) return { name: "—", role: "VICTIM" };
    if (u.role === "COUNSELOR") {
      const p = (await CounselorProfile.findOne({ userId: uid }).select("fullName").lean()) as
        | { fullName?: string }
        | null;
      return { name: p?.fullName || u.pseudonym || "—", role: "COUNSELOR" };
    }
    return { name: u.pseudonym || "—", role: u.role || "VICTIM" };
  } catch {
    return { name: "—", role: "VICTIM" };
  }
}

/** بيانات كاتب المنشور (أخصائي): الاسم المهني + صورته + تخصصاته + حالة التوثيق */
export async function postAuthorInfo(authorId: unknown): Promise<{
  id: string;
  name: string;
  role: string;
  verified: boolean;
  photoUrl: string | null;
  specialties: string[];
} | null> {
  const uid = String(authorId);
  try {
    const u = (await User.findById(uid).select("role pseudonym").lean()) as
      | { role?: string; pseudonym?: string | null }
      | null;
    if (!u) return null;
    if (u.role === "COUNSELOR") {
      const p = (await CounselorProfile.findOne({ userId: uid })
        .select("fullName photo verificationStatus specialties customSpecialties")
        .lean()) as {
        _id?: unknown;
        fullName?: string;
        photo?: string | null;
        verificationStatus?: string;
        specialties?: string[];
        customSpecialties?: string[];
      } | null;
      return {
        id: uid,
        name: p?.fullName || u.pseudonym || "—",
        role: "COUNSELOR",
        verified: p?.verificationStatus === "VERIFIED",
        photoUrl: p?.photo ? `/api/counselors/${String(p._id)}/photo` : null,
        specialties: [...(p?.specialties || []), ...(p?.customSpecialties || [])].slice(0, 6),
      };
    }
    return {
      id: uid,
      name: u.pseudonym || "—",
      role: u.role || "VICTIM",
      verified: false,
      photoUrl: null,
      specialties: [],
    };
  } catch {
    return null;
  }
}
