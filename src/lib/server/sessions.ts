import "server-only";
import { CounselorProfile, User } from "@/lib/models";

/**
 * يربط كل جلسة بكائني victim وcounselor (بنفس شكل الاستجابة السابق)
 * ويضمّن رقم واتساب الأخصائي لاستخدامه في غرفة الجلسة.
 *
 * v2.7.0 — خصوصية رقم هاتف العميل:
 * رقم هاتف العميل لا يُرسَل إلا لطرف واحد في العالم: الأخصائي الذي
 * اختاره هذا العميل في هذه الجلسة (viewerId = counselorId). لا قوائم
 * ولا لوحات ولا أطراف أخرى ترى الرقم أبداً — وهو أساس زر واتساب
 * الذي يظهر للأخصائي داخل غرفة الجلسة فقط.
 */
export async function attachParticipants(sessions: any[], viewerId?: string | null): Promise<any[]> {
  if (!sessions.length) return [];
  const ids = [...new Set(sessions.flatMap((s) => [String(s.victimId), String(s.counselorId)]))];

  const [users, profiles] = await Promise.all([
    User.find({ _id: { $in: ids } }).select("pseudonym language phone gender").lean(),
    CounselorProfile.find({ userId: { $in: ids } })
      .select("userId fullName specialties verificationStatus whatsapp")
      .lean(),
  ]);

  const userById = new Map(users.map((u) => [String(u._id), u]));
  const profileByUserId = new Map(profiles.map((p) => [String(p.userId), p]));

  return sessions.map((s) => {
    const v = userById.get(String(s.victimId));
    const c = userById.get(String(s.counselorId));
    const cp = profileByUserId.get(String(s.counselorId));
    const { __v, ...rest } = s;
    void __v;
    /* v2.7.0: الرقم يُكشف حصراً للمختص الذي اختاره العميل في هذه الجلسة —
       لا للعميل نفسه في الواجهة، ولا لأي طرف آخر أو في أي قائمة */
    const victimPhone =
      !!viewerId &&
      String(viewerId) === String(s.counselorId) &&
      (v as { phone?: string | null } | undefined)?.phone
        ? (v as { phone?: string | null }).phone
        : null;
    return {
      ...rest,
      id: String(s._id),
      victim: v
        ? {
            id: String(v._id),
            pseudonym: v.pseudonym,
            language: v.language,
            phone: victimPhone,
            /* v2.9.0: جنس العميل — يراه الأخصائي قبل قبول الجلسة (تفضيل معلن) */
            gender: (v as { gender?: string | null }).gender ?? null,
          }
        : null,
      counselor: c
        ? {
            id: String(c._id),
            pseudonym: c.pseudonym,
            counselorProfile: cp
              ? {
                  fullName: cp.fullName,
                  specialties: cp.specialties || [],
                  verificationStatus: cp.verificationStatus,
                  whatsapp: cp.whatsapp || null,
                }
              : null,
          }
        : null,
    };
  });
}
