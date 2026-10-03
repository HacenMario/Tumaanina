/* طمأنينة — Service Worker: PWA shell + Web Push (VAPID) */
/* v1.22.3: تجديد اسم الكاش — عند التفعيل يُحذف كل كاش باسم آخر تلقائياً،
   ويستلم الزوّار النسخة الجديدة (نطاق المواعيد 08:00 → 00:00) دون مسح يدوي. */
const CACHE_NAME = "tumaanina-v1.22.3";
const PRECACHE = ["/icons/icon-192.png", "/icons/icon-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// network-first passthrough (avoid stale dev content), cache fallback for static assets
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  const isStatic = url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest";
  if (!isStatic) return; // let the network handle app content

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

// ─── Web Push ───
self.addEventListener("push", (event) => {
  let data = { title: "طمأنينة 💚", body: "لديك تحديث جديد", url: "/", lang: "ar", dir: "rtl" };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }

  /* v1.5.0: اتجاه الإشعار حسب لغة المستخدم — الإشعارات العربية RTL
     والبقية LTR حتى تُقرأ العناوين والنصوص كما يجب على الهاتف */
  const dir = data.dir === "rtl" || data.dir === "ltr" ? data.dir : (data.lang === "ar" ? "rtl" : "ltr");

  /* tag فريد لكل إشعار: يمنع اختفاء الإشعارات اللاحقة خلف إشعار معروض */
  const tag = `tumaanina-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      vibrate: [100, 50, 100],
      tag,
      renotify: true,
      dir,
      lang: data.lang || "ar",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

/* ─── إعادة الاشتراك التلقائية عند تدوير مفتاح الاشتراك ───
   المتصفحات (خصوصاً Chrome/Android) تجدّد اشتراك Push دورياً؛
   بدون هذا المعالج تتوقف الإشعارات بعد فترة — هنا نحفظ الاشتراك الجديد
   على الخادم مع نفس المستخدم عبر نقطة نهاية الاشتراك القديم. */
self.addEventListener("pushsubscriptionchange", (event) => {
  const oldEndpoint = event.oldSubscription ? event.oldSubscription.endpoint : null;
  event.waitUntil(
    (async () => {
      try {
        const reg = self.registration;
        const vapidRes = await fetch("/api/vapid-key");
        const { publicKey } = await vapidRes.json();
        if (!publicKey) return;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        await fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "resubscribe",
            oldEndpoint,
            subscription: sub.toJSON(),
          }),
        });
      } catch (e) {
        /* تجاهل — سيعيد المستخدم التفعيل من الإعدادات */
      }
    })()
  );
});

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}
