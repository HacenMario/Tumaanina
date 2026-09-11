import "server-only";
import { ChallengeProgress, ChallengeState, CounselorProfile, User } from "@/lib/models";
import { readChallengeConfig } from "@/lib/server/challenge-config";

/**
 * v2.7.0 — التحدي الداخلي الخاص بالمختصين
 * ─────────────────────────────────────────────────────────
 * لغز المنصة: الضغط على علم الجزائر أسفل الصفحة بعدد ضغطات يساوي
 * الأيام المتبقية من الشهر الحالي (عدد أيام الشهر − رقم اليوم).
 * مثال: 2026/09/03 → 30 − 3 = 27 ضغطة.
 *
 * القواعد المحققة هنا:
 *  • التقدم يُحفظ في الخادم لكل مستخدم ولكل يوم (مفتاح فريد userId+day)
 *    — لا يمكن الغش بمحاولة إرسال عدد ضغطات دفعة واحدة، فكل ضغطة
 *      تُعالج زائداً واحداً فقط على الخادم.
 *  • الفائز الأول فقط: كتابة الفائز ذرية عبر findOneAndUpdate على
 *    مستند مفرد بشرط winnerUserId: null — السباق يحسمه MongoDB.
 *  • التحدي خاص بالمختصين المسجلين (role=COUNSELOR) وحتى نهاية السنة.
 *  • المؤهلون فقط: الحسابات غير المعلّقة.
 */

export const CHALLENGE_YEAR = 2026;
/* نهاية الصلاحية: آخر لحظة من 31 ديسمبر 2026 بتوقيت الجزائر (UTC+1) */
const CHALLENGE_END_ISO = "2026-12-31T23:59:59+01:00";

/** تاريخ اليوم بتوقيت الجزائر (UTC+1) بصيغة YYYY-MM-DD */
export function algeriaToday(): string {
  const now = new Date();
  const dz = new Date(now.getTime() + 60 * 60 * 1000); // UTC+1
  return dz.toISOString().slice(0, 10);
}

/** العدد المطلوب من الضغطات اليوم: أيام الشهر الحالي − رقم اليوم */
export function requiredClicks(today = algeriaToday()): number {
  const [y, m, d] = today.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  return Math.max(0, daysInMonth - d);
}

/** هل التحدي ما زال صالحاً زمنياً؟ (ابتداءً من بدء الخادم بهذه النسخة حتى نهاية السنة) */
function challengeTimeValid(now = new Date()): boolean {
  const end = new Date(CHALLENGE_END_ISO);
  return now.getTime() <= end.getTime();
}

/**
 * v1.6.0: هل التحدي فعالاً الآن؟
 * = صالح زمنياً + مفعّل من الإدارة + داخل مدة الصلاحية + بلا فائز سابق.
 * الفوز يُعطّل التحدي فوراً وتختفي نافذته للجميع (طلب المستخدم).
 */
export async function isChallengeRunning(now = new Date()): Promise<boolean> {
  if (!challengeTimeValid(now)) return false;
  const [cfg, winner] = await Promise.all([readChallengeConfig("counselor"), getChallengeWinner()]);
  return cfg.running && !winner;
}

export interface ChallengeWinnerInfo {
  userId: string;
  name: string;
  profileId: string | null;
  wonAt: string | null;
}

/** معلومات الفائز الحالي (أو null) — تُستعمل في التاج ولوحة الأدمين */
export async function getChallengeWinner(): Promise<ChallengeWinnerInfo | null> {
  const state = (await ChallengeState.findById("challenge").lean()) as
    | { winnerUserId?: string | null; winnerName?: string | null; winnerProfileId?: string | null; wonAt?: Date | null }
    | null;
  if (!state?.winnerUserId) return null;
  return {
    userId: String(state.winnerUserId),
    name: String(state.winnerName || ""),
    profileId: state.winnerProfileId ? String(state.winnerProfileId) : null,
    wonAt: state.wonAt ? new Date(state.wonAt).toISOString() : null,
  };
}

export interface ClickResult {
  clicks: number;
  required: number;
  won: boolean;
  isWinner: boolean;
  winner: ChallengeWinnerInfo | null;
}

/**
 * تسجيل ضغطة واحدة للأخصائي الحالي في يوم اليوم.
 * يُرجع العدد الجديد + حالة الفوز + معلومات الفائز (لو فاز غيره قبلاً).
 */
export async function registerClick(userId: string): Promise<ClickResult | { error: string }> {
  /* v1.6.0: الفوز يُعطّل التحدي فوراً — بلا عدّ أي ضغطات بعده */
  if (!(await isChallengeRunning())) return { error: "CHALLENGE_ENDED" };

  const user = (await User.findById(userId)
    .select("role suspended pseudonym")
    .lean()) as { role?: string; suspended?: boolean; pseudonym?: string } | null;
  if (!user) return { error: "INVALID" };
  /* التحدي خاص بالمختصين فقط — العميلون والإدارة لا يدخلون في العدّ */
  if (user.role !== "COUNSELOR") return { error: "COUNSELOR_ONLY" };
  if (user.suspended) return { error: "SUSPENDED" };

  const day = algeriaToday();
  const required = requiredClicks(day);

  /* ضغطة واحدة حقيقية = +1 في الخادم (upsert مع سقف العدد عند المطلوب) */
  const doc = (await ChallengeProgress.findOneAndUpdate(
    { userId, day },
    { $inc: { clicks: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean()) as { clicks?: number } | null;
  const clicks = Math.min(Number(doc?.clicks) || 0, required);

  const [winnerBefore, cfg] = await Promise.all([getChallengeWinner(), readChallengeConfig("counselor")]);
  if (winnerBefore) {
    return { clicks, required, won: false, isWinner: userId === winnerBefore.userId, winner: winnerBefore };
  }
  if (!cfg.running) return { error: "CHALLENGE_ENDED" };

  /* بلوغ العدد المطلوب اليوم → محاولة حسم الفوز ذرياً */
  if (clicks >= required && required > 0) {
    const profile = (await CounselorProfile.findOne({ userId }).select("_id fullName").lean()) as
      | { _id: unknown; fullName?: string }
      | null;
    const winnerName = String(profile?.fullName || user.pseudonym || "").slice(0, 80);

    const claimed = (await ChallengeState.findOneAndUpdate(
      { _id: "challenge", winnerUserId: null },
      {
        $set: {
          winnerUserId: String(userId),
          winnerName,
          winnerProfileId: profile?._id ? String(profile._id) : null,
          wonAt: new Date(),
        },
      },
      { upsert: true, new: true }
    ).lean()) as { winnerUserId?: string | null; wonAt?: Date | null } | null;

    if (claimed && String(claimed.winnerUserId) === String(userId)) {
      /* أنا الفائز الأول — يُشعَر الأدمين من مسار الـ API بعد هذه الدالة */
      return {
        clicks,
        required,
        won: true,
        isWinner: true,
        winner: {
          userId: String(userId),
          name: winnerName,
          profileId: profile?._id ? String(profile._id) : null,
          wonAt: claimed.wonAt ? new Date(claimed.wonAt).toISOString() : null,
        },
      };
    }

    /* سباق خسرناه: فاز غيرنا في اللحظة نفسها */
    const winner = await getChallengeWinner();
    return { clicks, required, won: false, isWinner: false, winner };
  }

  return { clicks, required, won: false, isWinner: false, winner: null };
}

/** قراءة حالة التحدي لواجهة المستخدم: الصلاحية + المطلوب + تقدمي + الفائز */
export async function challengeStatus(myUserId?: string | null): Promise<{
  active: boolean;
  required: number;
  myClicks: number;
  isWinner: boolean;
  winner: ChallengeWinnerInfo | null;
}> {
  const [winner, day, cfg] = await Promise.all([
    getChallengeWinner(),
    Promise.resolve(algeriaToday()),
    readChallengeConfig("counselor"),
  ]);
  let myClicks = 0;
  if (myUserId) {
    const doc = (await ChallengeProgress.findOne({ userId: myUserId, day })
      .select("clicks")
      .lean()) as { clicks?: number } | null;
    myClicks = Number(doc?.clicks) || 0;
  }
  /* v1.6.0: active = مفعّل + داخل المدة + بلا فائز — الفوز يطفئه فوراً */
  return {
    active: challengeTimeValid() && cfg.running && !winner,
    required: requiredClicks(day),
    myClicks,
    isWinner: !!winner && !!myUserId && winner.userId === String(myUserId),
    winner,
  };
}

/** حماية من الوثائق المزدوجة: مستند الحالة يُنشأ مرة عند أول استعمال (upsert) */
export async function ensureChallengeState(): Promise<void> {
  await ChallengeState.updateOne({ _id: "challenge" }, { $setOnInsert: { winnerUserId: null } }, { upsert: true });
}
