import "server-only";
import { ChallengeConfig } from "@/lib/models";

/**
 * v1.6.0 — تحكّم الإدارة في التحديين (طلب المستخدم الصريح):
 * ─────────────────────────────────────────────────────────────
 * «بعد فوز أحد المختصين في التحدي يجب أن يتعطل التحدي مباشرة وتختفي
 * نافذته، اعطاء الصلاحية للأدمين بتفعيل/تعطيل التحدي وتحديد مدة
 * الصلاحية، نفس الشيء بالنسبة لتحدي العملاء».
 *
 * مستند ChallengeConfig لكل تحدي ("counselor" | "victim"):
 *  • enabled       — مفتاح تشغيل/إيقاف فوري من لوحة الإدارة
 *  • durationDays  — مدة الصلاحية بالأيام من لحظة التفعيل (0 = بلا حد)
 *  • startedAt     — لحظة آخر تفعيل/إعادة تشغيل
 *
 * والفوز يُعطّل التحدي تلقائياً: وجود فائز في ChallengeState /
 * VictimChallengeState يجعل التحدي منتهياً للجميع فتختفي نافذته.
 */

export type ChallengeWhich = "counselor" | "victim";

export interface ChallengeConfigInfo {
  enabled: boolean;
  durationDays: number;
  startedAt: string | null;
  endsAt: string | null;
  /** هل التحدي فعالاً الآن؟ (مفعّل + داخل مدة الصلاحية) */
  running: boolean;
}

/** قراءة إعداد تحدٍّ مع حساب انتهاء المدة — يُنشأ افتراضياً عند أول قراءة */
export async function readChallengeConfig(which: ChallengeWhich): Promise<ChallengeConfigInfo> {
  const doc = (await ChallengeConfig.findById(which).lean()) as
    | { enabled?: boolean; durationDays?: number; startedAt?: Date | null }
    | null;
  const enabled = doc ? doc.enabled !== false : true;
  const durationDays = Math.max(0, Number(doc?.durationDays) || 0);
  const startedAt = doc?.startedAt ? new Date(doc.startedAt) : null;
  const endsAt =
    enabled && durationDays > 0 && startedAt
      ? new Date(startedAt.getTime() + durationDays * 24 * 60 * 60 * 1000)
      : null;
  const running = enabled && (!endsAt || endsAt.getTime() > Date.now());
  return {
    enabled,
    durationDays,
    startedAt: startedAt ? startedAt.toISOString() : null,
    endsAt: endsAt ? endsAt.toISOString() : null,
    running,
  };
}

/** تفعيل/تعطيل مع تحديد المدة — من لوحة الإدارة */
export async function writeChallengeConfig(
  which: ChallengeWhich,
  opts: { enabled: boolean; durationDays?: number }
): Promise<ChallengeConfigInfo> {
  const durationDays = Math.max(0, Math.min(3650, Math.round(Number(opts.durationDays) || 0)));
  /* إعادة التفعيل تبدأ مدة صلاحية جديدة من الآن */
  const startedAt = opts.enabled ? new Date() : new Date(0);
  await ChallengeConfig.findByIdAndUpdate(
    which,
    { $set: { enabled: opts.enabled, durationDays, startedAt } },
    { upsert: true }
  );
  return readChallengeConfig(which);
}

/** إعادة تشغيل التحدي بعد فوز (تفعيل + مسح حالة الفوز تتم في نداء الأدمين) */
export async function resetChallengeConfig(which: ChallengeWhich): Promise<ChallengeConfigInfo> {
  return writeChallengeConfig(which, { enabled: true, durationDays: 0 });
}
