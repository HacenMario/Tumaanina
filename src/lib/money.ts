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

/* ═ v1.18.0 — نُزعت خاصية تحويل الدينار إلى EUR/USD نهائياً ═
   أسعار العيادات بالدينار هي الرسمية الوحيدة، ومن أراد عرض سعر بالأورو
   أو الدولار حدّده بنفسه من إعداداته (priceEur/priceUsd اختياريان) —
   لا يوجد أي تحويل عملات في كل المنصة. */
