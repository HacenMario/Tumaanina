/**
 * طمأنينة النفسي — أدوات واتساب
 * ─────────────────────────────────────────────────────────────────
 * واتساب لا يسمح ببدء مكالمة صوتية/مرئية من رابط ويب رسمياً،
 * لكن wa.me يفتح محادثة الطرفين مباشرة — ومن داخل المحادثة
 * يكون زر الاتصال الصوتي 📞 أو المرئي 🎥 بضغطة واحدة.
 *
 * الصيغة المعتمدة للتخزين: أرقام دولية بدون + أو مسافات
 * مثال الجزائر: 213555123456  (213 + الرقم المحلي بدون 0)
 * أرقام الجزائر المحلية (05xxxxxxxx / 06xxxxxxxx / 07xxxxxxxx)
 * تُحوَّل تلقائياً إلى الصيغة الدولية عند الإدخال.
 */

/** تنظيف رقم واتساب: يحذف كل ما عدا الأرقام ويعيد null إن كان غير صالح */
export function normalizeWhatsapp(input?: string | null): string | null {
  if (!input) return null;
  let digits = String(input).replace(/\D/g, "");
  // صيغة دولية بادئة بـ 00 (مثل 00213...) → نزع الصفرين
  if (digits.startsWith("00")) digits = digits.slice(2);
  // رقم جزائري محلي 0XXXXXXXXX (10 خانات) → 213 + الرقم بدون 0
  if (digits.startsWith("0") && digits.length === 10) {
    digits = "213" + digits.slice(1);
  }
  // أقصر أرقام العالم ~7 خانات وأطولها 15 (معيار E.164)
  if (digits.length < 7 || digits.length > 15) return null;
  return digits;
}

/**
 * تنسيق الرقم للعرض في الواجهات:
 *  - يبدأ بـ 213 → +213… (صيغة دولية)
 *  - يبدأ بـ 0   → يُعرض كما هو محلياً (05xxxxxxxx)
 *  - غير ذلك     → +… كما حُفظ
 */
export function formatWhatsapp(digits?: string | null): string {
  if (!digits) return "";
  if (digits.startsWith("0")) return digits;
  return `+${digits}`;
}

/** رابط فتح محادثة واتساب مع رسالة مسبقة (اختيارية) */
export function waLink(whatsapp?: string | null, text?: string): string | null {
  const num = normalizeWhatsapp(whatsapp);
  if (!num) return null;
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${num}${q}`;
}
