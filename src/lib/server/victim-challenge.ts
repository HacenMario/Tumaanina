import "server-only";
import { SupportSession, User, VictimChallengeState } from "@/lib/models";

/**
 * v2.9.0 — تحدي الالتزام الخاص بالمختصين… بنسخة المتضررين
 * ─────────────────────────────────────────────────────────
 * الفائز هو أول متضرر يحترم 4 مواعيد متتالية بينه وبين المختصين،
 * مع السماح بتأخر بسيط لا يتجاوز 10 دقائق عن الموعد.
 *
 * كيف يُحتسب «احترام الموعد»؟
 *  • جلسة مجدولة في الماضي (ACCEPTED/ACTIVE/COMPLETED) يُعتبر المتضرر
 *    قد احترمها إذا دخل غرفة الجلسة خلال 10 دقائق من موعدها
 *    (victimLastSeenAt — نبض الحضور داخل الغرفة).
 *  • أي جلسة مجدولة فاتته أو تأخر فيها أكثر من 10 دقائق تكسر السلسلة
 *    (consecutive) — يبدأ العد من جديد.
 *  • الجلسات الملغاة (بأي طرف) لا تُحتسب ولا تكسر السلسلة — الإلغاء
 *    خارج إرادة الحضور.
 *
 * الحسم ذري: مستند واحد بشرط winnerUserId: null عبر findOneAndUpdate
 * فلا يمكن أن يفوز اثنان في اللحظة نفسها.
 */

export const VICTIM_STREAK_TARGET = 4;
/** أقصى تأخير مسموح عن الموعد (بالدقائق) */
export const VICTIM_LATE_TOLERANCE_MIN = 10;

/** معلومات فائز تحدي المتضررين (أو null) */
export interface VictimChallengeWinnerInfo {
  userId: string;
  name: string;
  wonAt: string | null;
}

export async function getVictimChallengeWinner(): Promise<VictimChallengeWinnerInfo | null> {
  const state = (await VictimChallengeState.findById("victim-challenge").lean()) as
    | { winnerUserId?: string | null; winnerName?: string | null; wonAt?: Date | null }
    | null;
  if (!state?.winnerUserId) return null;
  return {
    userId: String(state.winnerUserId),
    name: String(state.winnerName || ""),
    wonAt: state.wonAt ? new Date(state.wonAt).toISOString() : null,
  };
}

/**
 * حساب سلسلة الالتزام الحالية لمتضرر — من أحدث جلسة مجدولة نحو الأقدم.
 * تتوقف السلسلة عند أول جلسة فائتة/متأخرة أكثر من الحد المسموح.
 * تعمل على قراءة فقط — لا كتابة.
 */
export async function victimStreak(victimId: string): Promise<number> {
  const sessions = (await SupportSession.find({
    victimId,
    status: { $in: ["ACCEPTED", "ACTIVE", "COMPLETED"] },
    scheduledAt: { $lt: new Date() }, /* المواعيد المستقبلية لا تُحتسب بعد */
  })
    .sort({ scheduledAt: -1 })
    .limit(60)
    .lean()) as unknown as { scheduledAt: Date; startedAt?: Date | null; victimLastSeenAt?: Date | null }[];

  let streak = 0;
  for (const s of sessions) {
    const sched = new Date(s.scheduledAt).getTime();
    const seen = s.victimLastSeenAt ? new Date(s.victimLastSeenAt as unknown as string).getTime() : 0;
    /* v1.5.0: إذا بدأ الأخصائي الجلسة قبل الموعد المحدد فيُعتبر دخول العميل
       بعد البدء الفعلي التزاماً بالمواعيد (طلب المستخدم) — الحد الأدنى
       يتّسع ليشمل لحظة البدء الفعلي بدل أن يكسر السلسلة بظلم */
    const startedEarly = s.startedAt ? new Date(s.startedAt as unknown as string).getTime() : null;
    const lower = startedEarly && startedEarly < sched - 5 * 60 * 1000
      ? startedEarly - 60 * 1000 /* دقيقة سماحية قبل لحظة البدء الفعلي */
      : sched - 5 * 60 * 1000;
    /* حضر الدورة؟ (دخول الغرفة من قبل الموعد بقليل حتى +10 دقائق) */
    const kept = seen > 0 && seen >= lower && seen <= sched + VICTIM_LATE_TOLERANCE_MIN * 60 * 1000;
    if (!kept) break;
    streak++;
  }
  return streak;
}

/**
 * تقييم سلسلة المتضرر بعد نبض حضور جديد داخل الغرفة — يُستدعى من
 * /api/sessions/[id]/presence عند كل نبض للمتضرر (كل 10 ثوانٍ) لكن
 * الكتابة تحدث فقط عند بلوغ 4 دون فائز سابق (كتابة واحدة في العمر).
 */
export async function evaluateVictimChallenge(victimId: string): Promise<{
  streak: number;
  won: boolean;
  isWinner: boolean;
  winner: VictimChallengeWinnerInfo | null;
}> {
  const streak = await victimStreak(victimId);
  const winnerBefore = await getVictimChallengeWinner();

  if (winnerBefore) {
    return { streak, won: false, isWinner: winnerBefore.userId === String(victimId), winner: winnerBefore };
  }
  if (streak < VICTIM_STREAK_TARGET) {
    return { streak, won: false, isWinner: false, winner: null };
  }

  const victim = (await User.findById(victimId).select("pseudonym").lean()) as
    | { pseudonym?: string }
    | null;
  const winnerName = String(victim?.pseudonym || "").slice(0, 80);

  const claimed = (await VictimChallengeState.findOneAndUpdate(
    { _id: "victim-challenge", winnerUserId: null },
    { $set: { winnerUserId: String(victimId), winnerName, wonAt: new Date() } },
    { upsert: true, new: true }
  ).lean()) as { winnerUserId?: string | null; wonAt?: Date | null } | null;

  if (claimed && String(claimed.winnerUserId) === String(victimId)) {
    return {
      streak,
      won: true,
      isWinner: true,
      winner: { userId: String(victimId), name: winnerName, wonAt: claimed.wonAt ? new Date(claimed.wonAt).toISOString() : null },
    };
  }
  const winner = await getVictimChallengeWinner();
  return { streak, won: false, isWinner: false, winner };
}

/** حالة التحدي لواجهة المتضرر: سلسلتي + الفائز (إن وُجد) */
export async function victimChallengeStatus(myUserId?: string | null): Promise<{
  target: number;
  myStreak: number;
  isWinner: boolean;
  winner: VictimChallengeWinnerInfo | null;
}> {
  const winner = await getVictimChallengeWinner();
  const myStreak = myUserId ? await victimStreak(String(myUserId)) : 0;
  return {
    target: VICTIM_STREAK_TARGET,
    myStreak,
    isWinner: !!winner && !!myUserId && winner.userId === String(myUserId),
    winner,
  };
}
