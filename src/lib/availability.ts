/**
 * طمأنينة النفسي — v2.6.0 منطق التوفر الأسبوعي والمطابقة
 * ─────────────────────────────────────────────────────────────
 * جدول التوفر: كائن مفتاحه رقم اليوم (0=الأحد … 6=السبت) وقيمته
 * مصفوفة الساعات المتاحة من SLOT_TIMES.
 *   null / غائب / غير صالح  →  «غير مخصّص» = كل المواعيد متاحة
 *   (سلوك backward-compatible مع كل الأخصائيين الحاليين)
 *
 * تستعمله الواجهات (الإعدادات، نافذة الحجز، المطابقة) والخادم
 * (التحقق عند إنشاء الجلسة) من مكان واحد لضمان التطابق التام.
 */
import { SLOT_TIMES } from "@/lib/constants";

export type WeeklyAvailability = Record<string, string[]>;

/** أقصى عدد مواعيد يختارها العميل في خطوة «المواعيد التي تناسبك» */
export const MAX_SLOT_PICKS = 8;

/** تمريرات المسح الدوري قبل أول حفظ — يمنع تكرار الإشعار لنفس الطلب */
export const OVERDUE_HOURS = 36;
/** عدد التأخرات التي تُفعّل التعليق التلقائي للحساب */
export const LATE_STRIKES_TO_SUSPEND = 3;

/* ─── v2.8.0: توزيع عادل للجلسات وحدود الحجز ───
   أقصى عدد جلسات «مقبولة» في نفس اليوم يُقبل عندها حجز طلب جديد مع نفس الأخصائي:
   إذا قبل أكثر من 4 (أي وصل 5) لا يمكن اختياره من عميل آخر في ذلك اليوم —
   توزيعاً للضغط على الجميع. */
export const MAX_ACCEPTED_PER_DAY = 4;

/**
 * مفتاح اليوم بتوقيت الجزائر (UTC+1) من تاريخ نصي أو كائن Date —
 * "YYYY-MM-DD". يُوحَّد به فحص «جلسة واحدة فقط في نفس اليوم» للعميل
 * وحساب حمل الأخصائي اليومي بغضّ النظر عن المنطقة الزمنية للخادم.
 */
export function dayKeyUTC1(input: Date | string): string {
  const d = typeof input === "string" ? new Date(`${input.length === 10 ? `${input}T12:00:00Z` : input}`) : new Date(input.getTime());
  const shifted = new Date(d.getTime() + 60 * 60 * 1000); // UTC+1
  return shifted.toISOString().slice(0, 10);
}

/** تاريخ مطلق من تاريخ نصي + ساعة SLOT (بتوقيت الجزائر UTC+1) */
export function slotDateUTC1(dateStr: string, slot: string): Date {
  const [h, m] = slot.split(":").map(Number);
  return new Date(`${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+01:00`);
}

/**
 * تطبيع أي قيمة قادمة من قاعدة البيانات أو من الطلب إلى جدول صالح،
 * أو null إن كان «غير مخصّص».
 */
export function normalizeAvailability(raw: unknown): WeeklyAvailability | null {
  if (!raw || typeof raw !== "object") return null;
  const out: WeeklyAvailability = {};
  let total = 0;
  for (let d = 0; d < 7; d++) {
    const arr = (raw as Record<string, unknown>)[String(d)];
    if (!Array.isArray(arr)) return null; // بنية ناقصة → نعتبرها غير مخصّص كلياً
    const slots = arr.filter((s): s is string => typeof s === "string" && (SLOT_TIMES as string[]).includes(s));
    out[String(d)] = slots;
    total += slots.length;
  }
  /* جدول فارغ تماماً = الأخصائي لم يحدد شيئاً → نعامله كغير مخصّص
     (وإلا فلن يستطيع أحد الحجز معه أبداً) */
  if (total === 0) return null;
  return out;
}

/** الجدول الافتراضي الكامل (كل الأيام × كل المواعيد) — يُستعمل في واجهات الاختيار */
export function fullAvailability(): WeeklyAvailability {
  const out: WeeklyAvailability = {};
  for (let d = 0; d < 7; d++) out[String(d)] = [...SLOT_TIMES];
  return out;
}

/** هل الساعة متاحة في يوم معيّن؟ (غير مخصّص = متاحة دائماً) */
export function isSlotAvailable(av: WeeklyAvailability | null, weekday: number, slot: string): boolean {
  if (!av) return true;
  const day = av[String(weekday)];
  if (!day) return false;
  return day.includes(slot);
}

/** ساعات يوم معيّن من الجدول (غير مخصّص = كل SLOT_TIMES) */
export function slotsForDay(av: WeeklyAvailability | null, weekday: number): string[] {
  if (!av) return [...SLOT_TIMES];
  const day = av[String(weekday)];
  return Array.isArray(day) ? [...day] : [];
}

/** رقم يوم الأسبوع من تاريخ نصي YYYY-MM-DD — مستقل عن المنطقة الزمنية للخادم */
export function weekdayOfDate(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return -1;
  return d.getUTCDay(); // 0=الأحد … 6=السبت
}

/**
 * هل يوفي الأخصائي بشرط مطابقة أحد المواعيد التي اختارها العميل؟
 * يُرجع قائمة المواعيد المتقاطعة (تاريخ + ساعة) — فارغة = لا مطابقة.
 * الأخصائي «غير المخصّص» يطابق كل المواعيد المطلوبة.
 */
export function matchSlots(
  av: WeeklyAvailability | null,
  picks: { date: string; slot: string }[]
): { date: string; slot: string }[] {
  const out: { date: string; slot: string }[] = [];
  for (const p of picks) {
    const wd = weekdayOfDate(p.date);
    if (wd < 0) continue;
    if (isSlotAvailable(av, wd, p.slot)) out.push({ date: p.date, slot: p.slot });
  }
  return out;
}
