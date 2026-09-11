/**
 * طمأنينة النفسي — الإخفاء السريع (v2.5.3)
 * ─────────────────────────────────────────────────────────
 * طبقة خصوصية محلية بالكامل: 3 ضغطات سريعة على شعار المنصة
 * تُخفي كل شيء فوراً خلف حاسبة حقيقية تعمل فعلاً، والعودة
 * بإدخال الرمز السري ثم «=».
 *
 * - الرمز يُحفظ مشفّراً (SHA-256) في localStorage الجهاز فقط — لا يُرسل لأي خادم.
 * - حالة الاختباء في sessionStorage: تبقى عند تحديث الصفحة،
 *   وتنتهي بإغلاق التبويب (فتح تبويب جديد = منفذ طوارئ طبيعي إن نُسي الرمز).
 */

const CFG_KEY = "tumaanina-quickhide";
const HIDDEN_KEY = "tumaanina-quickhide-hidden";

export const QUICK_HIDE_TRIGGER = "tumaanina-quickhide-trigger";
export const QUICK_HIDE_CHANGE = "tumaanina-quickhide-change";

export interface QuickHideConfig {
  enabled: boolean;
  hash: string | null;
}

/** SHA-256 للرمز السري — لا نحفظ الرمز نفسه أبداً */
export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`tumaanina-quickhide::${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function getQuickHideConfig(): QuickHideConfig {
  if (typeof window === "undefined") return { enabled: false, hash: null };
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (!raw) return { enabled: false, hash: null };
    const parsed = JSON.parse(raw) as Partial<QuickHideConfig>;
    return { enabled: !!parsed.enabled && !!parsed.hash, hash: parsed.hash || null };
  } catch {
    return { enabled: false, hash: null };
  }
}

/** تفعيل/تعطيل الإخفاء السريع — التفعيل يتطلب رمزاً من 4–8 أرقام */
export async function saveQuickHideConfig(enabled: boolean, pin?: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (!enabled) {
    localStorage.removeItem(CFG_KEY);
    return;
  }
  if (!pin || !/^\d{4,8}$/.test(pin)) throw new Error("PIN_INVALID");
  const hash = await hashPin(pin);
  localStorage.setItem(CFG_KEY, JSON.stringify({ enabled: true, hash }));
}

/** v2.8.0: مزامنة الحالة من قاعدة البيانات — تُستعمل عند الولوج من أي جهاز */
export function applyRemoteConfig(enabled: boolean, hash: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled && hash) localStorage.setItem(CFG_KEY, JSON.stringify({ enabled: true, hash }));
    else localStorage.removeItem(CFG_KEY);
  } catch {
    /* وضع خاص */
  }
}

export function isHidden(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function setHidden(hidden: boolean): void {
  try {
    if (hidden) sessionStorage.setItem(HIDDEN_KEY, "1");
    else sessionStorage.removeItem(HIDDEN_KEY);
  } catch {
    /* الوضع الخاص في بعض المتصفحات — الاختباء يعمل للجلسة الحالية فقط */
  }
  try {
    window.dispatchEvent(new CustomEvent(QUICK_HIDE_CHANGE, { detail: hidden }));
  } catch {
    /* لا شيء */
  }
}

/** يُستدعى من 3 ضغطات الشعار — يخفي فوراً إن كانت الميزة مفعّلة */
export function triggerQuickHideIfEnabled(): void {
  if (typeof window === "undefined") return;
  if (!getQuickHideConfig().enabled) return;
  setHidden(true);
  try {
    window.dispatchEvent(new CustomEvent(QUICK_HIDE_TRIGGER));
  } catch {
    /* لا شيء */
  }
}
