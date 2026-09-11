"use client";

// ─── Web Push + PWA client helpers ──────────────────────────────────
//
// ✅ الحل النهائي لمشكلة إشعارات الهاتف (v2.5.2):
// 1) المفاتيح على الخادم أصبحت حتمية مستقرة (لا تتغير عبر إعادة النشر)
// 2) الاشتراك هنا مضاد للسباقات: يقارن مفتاح الاشتراك الحالي بالمفتاح الفعلي
//    للخادم، ويجدده نظيفاً عند أي اختلاف — بلا InvalidStateError
// 3) المزامنة الصامتة عند الإقلاع (syncPushSubscription): من فعّل الإشعارات
//    سابقاً يُجدَّد اشتراكه تلقائياً أول ما يفتح الموقع — بلا أي تدخل
// 4) فحص تشخيصي كامل (diagnosePush) يعرض نتيجة كل خطوة في الإعدادات

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

/* مخزن الحالة المحلي: مفتاح VAPID المعروف + حالة التفعيل (من فعّل وماذا) */
const VAPID_KEY_STORE = "tumaanina-vapid-key";
const PUSH_STATE_STORE = "tumaanina-push-state";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (e) {
    console.error("[SW] registration failed:", e);
    return null;
  }
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/* ─── v1.8.0: أدوات كشف iOS — أساس تطبيق الآيفون (نقل من رفيقي v2.17.0) ───

   قاعدة iOS الجوهرية: الإشعارات الفورية تعمل فقط من التطبيق المثبّت
   (الشاشة الرئيسية) وعلى iOS 16.4+. في تبويب Safari العادي يفشل
   الاشتراك بصمت أو لا تُسلّم الإشعارات أبداً — لذا نكشف الحالة ونوجّه
   المستخدم للتثبيت أولاً بدل رسالة «متصفحك لا يدعم» المضللة. */

/** هل الجهاز آيفون/آيباد/آيبود؟ (يشمل آيباد في وضع «سطح المكتب» الذي يخفي iOS من UA) */
export function isIOS(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const classic = /iPad|iPhone|iPod/.test(ua);
  /* آيبادOS 13+ يقدّم نفسه Macintosh — نكشفه عبر دعم اللمس */
  const ipadDesktop = /Macintosh/.test(ua) && "ontouchend" in document;
  return classic || ipadDesktop;
}

/** هل الموقع يعمل كتطبيق مثبّت؟ (شاشة رئيسية على iOS، أو display-mode: standalone) */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  try {
    return window.matchMedia?.("(display-mode: standalone)")?.matches === true;
  } catch {
    return false;
  }
}

/** iOS + غير مثبّت = يجب التثبيت أولاً قبل أي حديث عن إشعارات */
export function iosPushBlocked(): boolean {
  return isIOS() && !isStandalone();
}

/* تسجيل Service Worker مع إعادة محاولة قصيرة — في وضع PWA المثبّت أو بعد
   تحديث الموقع قد يتأخر التسجيل لحظات، وإعادة المحاولة تحل أغلب حالات الفشل */
async function registerServiceWorkerResilient(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      try {
        await navigator.serviceWorker.ready;
      } catch {
        /* بعض المتصفحات ترفض promise ready — نتابع بالتسجيل المعاد */
      }
      return reg;
    } catch (e) {
      console.error(`[SW] registration attempt ${attempt + 1} failed:`, e);
      await wait(600 * (attempt + 1));
    }
  }
  return null;
}

/* هل اشتراك المتصفح الحالي موقّع بنفس مفتاح الخادم؟
   null = المتصفح لا يكشف المفتاح — نعتمد على المخزن المحلي حينها */
function sameAppServerKey(sub: PushSubscription, publicKey: string): boolean | null {
  try {
    const opt = (sub.options as { applicationServerKey?: BufferSource | null } | undefined)?.applicationServerKey;
    if (!opt) return null;
    const a = opt instanceof Uint8Array ? opt : new Uint8Array(opt as ArrayBuffer);
    const b = urlBase64ToUint8Array(publicKey);
    return a.length === b.length && a.every((v, i) => v === b[i]);
  } catch {
    return null;
  }
}

/* جلب مفتاح الخادم بمحاولتين — فشل عابر في الشبكة لا يُسقط التفعيل */
async function fetchVapidPublicKey(): Promise<string | null> {
  for (let i = 0; i < 2; i++) {
    try {
      const res = await fetch("/api/vapid-key", { cache: "no-store" });
      const j = (await res.json()) as { publicKey?: string };
      if (j.publicKey) return j.publicKey;
    } catch {
      /* إعادة المحاولة */
    }
    if (i === 0) await wait(500);
  }
  return null;
}

/**
 * اشتراك مضمون بلا سباق:
 * - اشتراك قائم بنفس مفتاح الخادم → يُعاد كما هو (بلا endpoints زائدة)
 * - اشتراك قديم/بمفتاح مغاير → إلغاء + استقرار + اشتراك نظيف
 * - فشل الاشتراك → أخذ الاشتراك الداخلي إن وُجد، ثم إعادة تسجيل SW كاملة كحل أخير
 */
async function ensureSubscription(registration: ServiceWorkerRegistration, publicKey: string): Promise<PushSubscription> {
  const appServerKey = urlBase64ToUint8Array(publicKey) as BufferSource;
  const subscribe = () =>
    registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appServerKey });

  const existing = await registration.pushManager.getSubscription().catch(() => null);
  if (existing) {
    const same = sameAppServerKey(existing, publicKey);
    const known = localStorage.getItem(VAPID_KEY_STORE);
    const stale = same === false || (same === null && !!known && known !== publicKey);
    if (!stale) return existing;
    try {
      await existing.unsubscribe();
    } catch {}
    await wait(250); /* استقرار الحالة الداخلية للمتصفح قبل إعادة الاشتراك */
  }

  try {
    return await subscribe();
  } catch (e) {
    console.warn("[PUSH] subscribe retry path:", e);
    /* اشتراك داخلي متبقٍ رغم الإلغاء؟ خذه بدل الفشل */
    const leftover = await registration.pushManager.getSubscription().catch(() => null);
    if (leftover) return leftover;
    /* v1.3.0: محاولة ثانية بعد استقرار أطول — InvalidStateError بعد إلغاء
       الاشتراك يحتاج زمناً أطول في بعض متصفحات أندرويد */
    await wait(600);
    try {
      return await subscribe();
    } catch {
      /* الحل الأخير: إعادة تسجيل Service Worker كاملة ثم الاشتراك */
    }
    try {
      await registration.unregister();
    } catch {}
    await wait(300);
    const fresh = await registerServiceWorkerResilient();
    if (!fresh) throw new Error("SW_REREGISTER_FAILED");
    return await fresh.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appServerKey });
  }
}

export async function enablePush(
  userId: string,
  role: "VICTIM" | "COUNSELOR" | "ADMIN"
): Promise<{ ok: boolean; error?: string }> {
  try {
    /* v1.8.0: بوابة iOS — على الآيفون غير المثبّت الاشتراك يفشل دائماً،
       نرجع خطأً واضحاً ليُظهر فوراً دليل التثبيت بدل محاولة محكومة بالفشل */
    if (iosPushBlocked()) return { ok: false, error: "IOS_NEEDS_INSTALL" };
    if (!pushSupported()) return { ok: false, error: "UNSUPPORTED" };

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, error: "DENIED" };

    const registration = await registerServiceWorkerResilient();
    if (!registration) return { ok: false, error: "SW_FAILED" };

    const publicKey = await fetchVapidPublicKey();
    if (!publicKey) return { ok: false, error: "NO_KEY" };

    const subscription = await ensureSubscription(registration, publicKey);

    const subJson = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    const saveRes = await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "subscribe", userId, role, subscription: subJson }),
    });
    if (!saveRes.ok) return { ok: false, error: "SAVE_FAILED" };

    localStorage.setItem(VAPID_KEY_STORE, publicKey);
    localStorage.setItem(PUSH_STATE_STORE, JSON.stringify({ userId, role }));
    return { ok: true };
  } catch (e) {
    console.error("[PUSH] enablePush failed:", e);
    return { ok: false, error: "SUBSCRIBE_FAILED" };
  }
}

/**
 * 🔄 المزامنة الصامتة عند الإقلاع — الجزء الثاني من الحل النهائي:
 * لمن فعّل الإشعارات سابقاً: إذا تغيّر مفتاح الخادم (تحديث/نشر جديد) يُجدَّد
 * الاشتراك ويُحفظ تلقائياً أول ما يفتح الموقع — بلا أي رسالة أو تدخل.
 */
export async function syncPushSubscription(
  userId?: string,
  role?: "VICTIM" | "COUNSELOR" | "ADMIN"
): Promise<void> {
  try {
    if (typeof window === "undefined" || !pushSupported()) return;
    if (!("permissions" in navigator) && Notification.permission !== "granted") return;
    if (Notification.permission !== "granted") return;

    /* الحالة المحفوظة تتفوق على المُمرَّر (هي صاحبة الاشتراك الأصلي) —
       وتُستخدم أيضاً حين لا يوجد مستخدم في الذاكرة بعد */
    let state: { userId: string; role: string } | null = null;
    try {
      state = JSON.parse(localStorage.getItem(PUSH_STATE_STORE) || "null");
    } catch {}
    const targetUser = userId || state?.userId;
    const targetRole = role || (state?.role as "VICTIM" | "COUNSELOR" | "ADMIN" | undefined);
    if (!targetUser) return;

    const reg =
      (await navigator.serviceWorker.getRegistration("/")) || (await registerServiceWorkerResilient());
    if (!reg) return;

    const publicKey = await fetchVapidPublicKey();
    if (!publicKey) return;

    const sub = await reg.pushManager.getSubscription().catch(() => null);

    /* ═ v1.3.0: الإصلاح الذاتي الكامل ═
       سابقاً: غياب الاشتراك = خروج صامت — فبقي الجهاز بلا إشعارات أبداً
       («اشتراك هذا الجهاز ❌» في التشخيص). الآن: اشتراك مفقود لمن فعّل
       سابقاً يُعاد إنشاؤه وحفظه تلقائياً هنا عند كل إقلاع. */
    if (!sub) {
      if (!targetUser) return;
      try {
        const fresh = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });
        await fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "subscribe", userId: targetUser, role: targetRole, subscription: fresh.toJSON() }),
        });
        localStorage.setItem(VAPID_KEY_STORE, publicKey);
        localStorage.setItem(PUSH_STATE_STORE, JSON.stringify({ userId: targetUser, role: targetRole }));
        console.log("[PUSH] تم استعادة اشتراك الجهاز تلقائياً (كان مفقوداً)");
      } catch (e) {
        console.warn("[PUSH] فشل استعادة الاشتراك تلقائياً:", e);
      }
      return;
    }

    const same = sameAppServerKey(sub, publicKey);
    const known = localStorage.getItem(VAPID_KEY_STORE);
    const stale = same === false || (same === null && !!known && known !== publicKey);
    if (!stale) return;

    try {
      await sub.unsubscribe();
    } catch {}
    await wait(250);
    const fresh = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
    await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "subscribe", userId: targetUser, role: targetRole, subscription: fresh.toJSON() }),
    });
    localStorage.setItem(VAPID_KEY_STORE, publicKey);
    localStorage.setItem(PUSH_STATE_STORE, JSON.stringify({ userId: targetUser, role: targetRole }));
    console.log("[PUSH] تم تجديد الاشتراك تلقائياً (تغيّر مفتاح الخادم)");
  } catch (e) {
    console.warn("[PUSH] syncPushSubscription:", e);
  }
}

/* ─── الفحص التشخيصي الكامل ─── */

export interface PushDiagStep {
  step: "support" | "sw" | "permission" | "key" | "subscription" | "save";
  ok: boolean;
  detail?: string;
}

/** يفحص سلسلة الإشعارات خطوة بخطوة دون تغيير أي إعداد عند المستخدم */
export async function diagnosePush(userId?: string, role?: string): Promise<PushDiagStep[]> {
  const steps: PushDiagStep[] = [];
  const push = (step: PushDiagStep["step"], ok: boolean, detail?: string) =>
    steps.push({ step, ok, detail });

  push("support", pushSupported());
  if (!steps[0].ok) return steps;

  let reg: ServiceWorkerRegistration | null = null;
  try {
    reg = await registerServiceWorkerResilient();
  } catch {}
  push("sw", !!reg);
  if (!reg) return steps;

  const perm = Notification.permission;
  push("permission", perm === "granted", perm);

  const publicKey = await fetchVapidPublicKey();
  push("key", !!publicKey);
  if (!publicKey) return steps;

  let sub: PushSubscription | null = null;
  try {
    sub = await reg.pushManager.getSubscription();
  } catch {}
  push("subscription", !!sub, sub ? sub.endpoint.slice(-20) : undefined);

  if (sub && userId) {
    try {
      const r = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "subscribe", userId, role, subscription: sub.toJSON() }),
      });
      push("save", r.ok, String(r.status));
    } catch (e) {
      push("save", false, String(e));
    }
  } else {
    push("save", true, "skip");
  }
  return steps;
}

export async function sendTestPush(
  userId: string,
  title?: string,
  body?: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "test",
      userId,
      title: title || "مرحباً بك في طمأنينة النفسي 💚",
      body: body || "الإشعارات تعمل بنجاح — أنت في أيدٍ أمينة",
    }),
  });
  /* الخادم يرجع 200 مع ok:false عند غياب الاشتراك (NO_SUBSCRIPTION) —
     نقرأ الجسم دائماً لتجنب أخطاء الكونسول */
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || j.ok === false) {
    return { ok: false, error: j.error || "FAILED" };
  }
  return { ok: true };
}

// ─── PWA install prompt ─────────────────────────────────────────────

let deferredPrompt: (Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }) | null = null;
let installBusy = false;

export function initInstallPrompt(onChange?: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    e.preventDefault();
    deferredPrompt = e as never;
    onChange?.();
  };
  /* التثبيت تم (من الحملة المدمجة أو زرنا) — تنظيف المرجع */
  const installed = () => {
    deferredPrompt = null;
    onChange?.();
  };
  window.addEventListener("beforeinstallprompt", handler);
  window.addEventListener("appinstalled", installed);
  return () => {
    window.removeEventListener("beforeinstallprompt", handler);
    window.removeEventListener("appinstalled", installed);
  };
}

export function canInstall(): boolean {
  return deferredPrompt !== null;
}

export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  /* الحماية من الاستدعاء المتزامن المزدوج: prompt() يُستدعى مرة واحدة لكل حدث */
  if (!deferredPrompt || installBusy) return "unavailable";
  installBusy = true;
  try {
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    return choice.outcome as "accepted" | "dismissed";
  } catch {
    return "unavailable";
  } finally {
    deferredPrompt = null;
    installBusy = false;
  }
}
