import "server-only";
import { connectDB } from "@/lib/db";
import { CounselorProfile, CrisisLog, SupportSession, User } from "@/lib/models";

/* ─── إثراء سجل الأزمات (v2.5.4) ───
   يضيف لكل سجل: الاسم المستعار للعميل، اسم الأخصائي، ومن كتب العبارة.
   الإثراء يحدث عند القراءة من الجلسة المرتبطة — فيعمل حتى مع السجلات
   القديمة المحفوظة قبل هذا التحديث دون أي ترحيل بيانات. */
export async function enrichCrisisLogs(
  logs: Array<Record<string, unknown>>
): Promise<Array<Record<string, unknown>>> {
  const sessionIds = [
    ...new Set(logs.map((l) => String(l.sessionId ?? "")).filter(Boolean)),
  ];
  if (sessionIds.length === 0) {
    return logs.map((l) => ({ ...l, saidBy: (l.saidBy as string | null) ?? null, victimAlias: null, counselorName: null }));
  }

  await connectDB();
  const sessions: any[] = await SupportSession.find({ _id: { $in: sessionIds } })
    .select("victimId counselorId")
    .lean();

  const userIds = [
    ...new Set(sessions.flatMap((s) => [String(s.victimId), String(s.counselorId)])),
  ];
  const users: any[] = userIds.length
    ? await User.find({ _id: { $in: userIds } }).select("pseudonym").lean()
    : [];
  const profiles: any[] = userIds.length
    ? await CounselorProfile.find({ userId: { $in: userIds } }).select("userId fullName").lean()
    : [];

  const pseudonymByUserId = new Map(users.map((u) => [String(u._id), String(u.pseudonym)]));
  const fullNameByUserId = new Map(profiles.map((p) => [String(p.userId), String(p.fullName)]));
  const sessById = new Map(sessions.map((s) => [String(s._id), s]));

  return logs.map((l) => {
    const s = l.sessionId ? sessById.get(String(l.sessionId)) : undefined;
    return {
      ...l,
      saidBy: (l.saidBy as string | null) ?? null,
      victimAlias: s ? pseudonymByUserId.get(String(s.victimId)) ?? null : null,
      counselorName: s ? fullNameByUserId.get(String(s.counselorId)) ?? null : null,
    };
  });
}

/** قراءة آخر 100 سجل أزمة مُثرى — يستعملها /api/crisis و /api/admin معاً */
export async function listEnrichedCrisisLogs() {
  await connectDB();
  const logs: any[] = await CrisisLog.find().sort({ createdAt: -1 }).limit(100).lean();
  const enriched = await enrichCrisisLogs(
    logs.map((l) => ({ ...l, id: String(l._id), sessionId: l.sessionId ?? null }))
  );
  return enriched;
}
