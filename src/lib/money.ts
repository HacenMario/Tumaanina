/* ═ v1.3.0 — مساعد عرض الأسعار بثلاث عملات (بلا أي تحويل) ═
   الأخصائي يحدد سعر جلسته لكل عملة على حدة (DZD/EUR/USD)،
   والمبلغ المُمرَّر هنا مخزَّن أصلاً بعملة العرض — نُنسّق الرقم فقط.
   لا توجد أي عملية تحويل عملات في المنصة كلها. */

import { CurrencyCode, PLATFORM_COMMISSION_RATE } from "./constants";

/** رمز العملة حسب لغة الواجهة: الدج «دج» بالعربية و«DZD» بغيرها، والبقية رموزها العالمية */
export function currencySymbol(cur: CurrencyCode, lang?: string): string {
  if (cur === "DZD") return lang === "ar" ? "دج" : "DZD";
  if (cur === "EUR") return "€";
  return "$";
}

/** نص السعر الكامل بعملة المبلغ نفسها (بلا تحويل): «2 500 دج» / «17,00 €» / «19,00 $» */
export function fmtMoney(amount: number, cur: CurrencyCode = "DZD", lang?: string): string {
  const v = Math.max(0, Number(amount) || 0);
  const formatted = cur === "DZD"
    ? Math.round(v).toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ")
    : v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${formatted} ${currencySymbol(cur, lang)}`;
}

/** نص عمولة المنصة (20%) عن مبلغ بعملته — للمختص فقط */
export function fmtCommission(amount: number, cur: CurrencyCode = "DZD", lang?: string): string {
  return fmtMoney(Math.round(Number(amount) * PLATFORM_COMMISSION_RATE * 100) / 100, cur, lang);
}

/* ═ v1.17.0 — أسعار العيادات بالدينار أساساً + عملات عرض اختيارية ═
   العيادة تحدد أسعارها (الجلسة والباقات) بالدينار الجزائري فقط —
   ومن يتصفح يمكنه رؤية تقدير تقريبي بعملته المختارة (EUR/USD) بجانب
   السعر الأصلي. التحويل تقريبي بأسعار صرف ثابتة معلنة، والعلامة «≈»
   تُنصّ صراحةً أن المبلغ التقريبي لا يلغي السعر الرسمي بالدينار. */
const DZD_PER_EUR = 145;
const DZD_PER_USD = 135;

export function convertFromDzd(amountDzd: number, cur: CurrencyCode): number | null {
  const v = Math.max(0, Number(amountDzd) || 0);
  if (cur === "EUR") return Math.round((v / DZD_PER_EUR) * 10) / 10;
  if (cur === "USD") return Math.round((v / DZD_PER_USD) * 10) / 10;
  return null; /* DZD — لا تحويل */
}

/** تقدير تقريبي بعملة العرض لمبلغ أصله بالدينار — null إن كانت العملة DZD */
export function fmtApproxFromDzd(amountDzd: number, cur: CurrencyCode, lang?: string): string | null {
  const c = convertFromDzd(amountDzd, cur);
  if (c === null) return null;
  return `≈ ${fmtMoney(c, cur, lang)}`;
}
