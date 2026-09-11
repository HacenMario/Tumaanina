import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * التنسيق الموحّد للتاريخ والوقت في كل المنصة وكل اللغات:
 * YYYY/MM/DD HH:MM:SS (بتوقيت جهاز المستخدم) — استغناء كامل عن
 * التواريخ المحلية المتنوعة (ar-DZ / AM / PM …) لضمان اتساق العرض.
 */
export function formatDateTime(input: string | Date | null | undefined): string {
  if (!input) return "";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * «عضو منذ» بصيغة YYYY/MM — موحّد في كل المنصة:
 * الشهادة، الملف العام للأخصائي، وواجهات الإدارة.
 */
export function formatYearMonth(d: Date): string {
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * تاريخ كامل بصيغة رقمية موحّدة YYYY/MM/DD (أرقام لاتينية) في كل اللغات —
 * أُضيف في v2.5.5 لتفادي تشوّه تاريخ الإصدار بالعربية (Intl/ar-DZ)،
 * ويُستعمل في شهادة الأخصائي وأي تاريخ يُعرض للتوثيق.
 */
export function formatDateYMD(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
}

/**
 * تاريخ اليوم/يوم معيّن بالتوقيت المحلي (YYYY-MM-DD) — بديل آمن عن
 * toISOString الذي يقرأ UTC وقد يُخطئ يوماً كاملاً في الجزائر (UTC+1)،
 * ما كان يسمح بجدولة جلسة في تاريخ فائت في نافذة الجدولة.
 */
export function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
