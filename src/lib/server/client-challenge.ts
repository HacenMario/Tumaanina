import "server-only";
import { SupportSession, User, VictimChallengeState } from "@/lib/models";
import { readChallengeConfig } from "@/lib/server/challenge-config";

/**
 * v2.9.0 — تحدي الالتزام الخاص بالمختصين… بنسخة العميلين
 * ─────────────────────────────────────────────────────────
 * الفائز هو أول عميل يحترم 4 مواعيد متتالية بينه وبين المختصين،
 * مع السماح بتأخر بسيط لا يتجاوز 10 دقائق عن الموعد.
 *
 * كيف يُحتسب «احترام الموعد»؟
 *  • جلسة مجدولة في الماضي (ACCEPTED/ACTIVE/COMPLETED) يُعتبر العميل
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

/** معلومات فائز تحدي العميلين (أو null) */
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
 * حساب سلسلة الالتزام الحالية لعميل — من أحدث جلسة مجدولة نحو الأقدم.
 * تتوقف السلسلة عند أول جلسة فائتة/متأخرة أكثر من الحد المسموح.
 * تعمل على قراءة فقط — لا كتابة.
 *
 * v1.6.0 — إصلاح جذري لـ«يبقى دائماً 0/4» (طلب المستخدم):
 * كان الاعتماد على victimLastSeenAt (آخر نبض) — فأي جلسة تمتد أكثر من
 * 10 دقائق بعد موعدها تفشل الفحص دائماً لأن آخر نبض لها بعيد عن الموعد.
 * المعيار الآن victimFirstSeenAt (أول دخول للغرفة، يُضبط مرة واحدة في
 * نبض الحضور): العدّ صحيح إن دخل العميل في موعده أو قبله أو حتى بعد
 * بداية الأخصائي المبكرة — كما هو مطلوب.
 */
export async function victimStreak(victimId: string): Promise<number> {
  const sessions = (await SupportSession.find({
    victimId,
    status: { $in: ["ACCEPTED", "ACTIVE", "COMPLETED"] },
    scheduledAt: { $lt: new Date() }, /* المواعيد المستقبلية لا تُحتسب بعد */
  })
    .sort({ scheduledAt: -1 })
    .limit(60)
    .lean()) as unknown as {
    scheduledAt: Date;
    startedAt?: Date | null;
    victimFirstSeenAt?: Date | null;
    victimLastSeenAt?: Date | null;
    endedAt?: Date | null;
  }[];

  let streak = 0;
  for (const s of sessions) {
    const sched = new Date(s.scheduledAt).getTime();
    /* v1.6.0: أول دخول للغرفة هو معيار الحضور — لا آخر نبض */
    const first = s.victimFirstSeenAt ? new Date(s.victimFirstSeenAt as unknown as string).getTime() : 0;
    const seen = s.victimLastSeenAt ? new Date(s.victimLastSeenAt as unknown as string).getTime() : 0;
    /* البدء المبكر للجلسة من الأخصائي يفتح نافذة الحضور من لحظة بدئه */
    const startTs = s.startedAt ? new Date(s.startedAt as unknown as string).getTime() : 0;
    const windowStart = startTs > 0 && startTs < sched - 5 * 60 * 1000 ? startTs : sched - 5 * 60 * 1000;
    const windowEnd = sched + VICTIM_LATE_TOLERANCE_MIN * 60 * 1000;
    /* سجلات ما قبل v1.6.0 بلا firstSeen: احتياطاً يُقبل آخر نبض داخل النافذة
       (جلسات قصيرة فقط) — أما الجديدة فتفحص بأول دخول بدقة */
    const kept = first > 0
      ? first >= windowStart && first <= windowEnd
      : seen > 0 && seen >= windowStart && seen <= windowEnd;
    if (!kept) break;
    streak++;
  }
  return streak;
}

/**
 * تقييم سلسلة العميل بعد نبض حضور جديد داخل الغرفة — يُستدعى من
 * /api/sessions/[id]/presence عند كل نبض للعميل (كل 10 ثوانٍ) لكن
 * الكتابة تحدث فقط عند بلوغ 4 دون فائز سابق (كتابة واحدة في العمر).
 */
export async function evaluateVictimChallenge(victimId: string): Promise<{
  streak: number;
  won: boolean;
  isWinner: boolean;
  winner: VictimChallengeWinnerInfo | null;
}> {
  /* v1.6.0: تحدٍّ معطّل من الإدارة أو منتهي المدة لا يُحسم لأحد */
  const cfg = await readChallengeConfig("victim");
  if (!cfg.running) {
    return { streak: 0, won: false, isWinner: false, winner: null };
  }
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

/** حالة التحدي لواجهة العميل: سلسلتي + الفائز (إن وُجد) + صلاحية التحدي */
export async function victimChallengeStatus(myUserId?: string | null): Promise<{
  target: number;
  myStreak: number;
  isWinner: boolean;
  winner: VictimChallengeWinnerInfo | null;
  /* v1.6.0: false = التحدي معطّل من الإدارة أو انتهت مدته أو فاز غيره —
     النافذة تختفي عندها من حساب العميل مباشرة */
  active: boolean;
}> {
  const [winner, cfg] = await Promise.all([getVictimChallengeWinner(), readChallengeConfig("victim")]);
  const myStreak = myUserId && cfg.running && !winner ? await victimStreak(String(myUserId)) : 0;
  /* v1.6.0: الفوز يُعطّل التحدي فوراً — النافذة تختفي للجميع (طلب المستخدم) */
  const active = cfg.running && !winner;
  return {
    target: VICTIM_STREAK_TARGET,
    myStreak,
    isWinner: !!winner && !!myUserId && winner.userId === String(myUserId),
    winner,
    active,
  };
}
