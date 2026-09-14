"use client";

/**
 * v1.16.0 — الشريط الإعلاني العام: إعلان في كل صفحة
 * • شريط أنيق رفيع أعلى المحتوى يدور تلقائياً بين الإعلانات المعتمدة
 *   (صورة مصغّرة + العنوان + اسم العيادة) — الضغط يفتح صفحة الإعلانات
 * • لا يظهر للعيادات ولا للإدارة ولا لمن رفض الإعلانات المدفوعة من إعداداته
 * • أسهم تنقّل يدوية + دوران تلقائي كل 7 ثوانٍ + إغلاق لكل جلسة
 * • جلب خفيف مرة واحدة (أول صفحة عمومية من /api/ads)
 */
import { useEffect, useState } from "react";
import { Megaphone, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

interface BannerAd {
  id: string;
  title: string;
  clinicName: string;
  imageUrl: string | null;
}

const ROTATE_MS = 7000;

export function GlobalAdBanner() {
  const { t } = useI18n();
  const user = useApp((s) => s.user);
  const [ads, setAds] = useState<BannerAd[]>([]);
  const [idx, setIdx] = useState(0);
  const [closed, setClosed] = useState(false);
  /* v1.17.0: من رفض الإعلانات المدفوعة من إعداداته لا يرى البانر الإعلاني
     أيضاً (كما لا يرى النافذة العائمة) — الحالة تُجلب من حسابه مباشرة */
  const [optedOut, setOptedOut] = useState(false);

  const eligible = !!user?.id && (user.role === "VICTIM" || user.role === "COUNSELOR");

  /* جلب خفيف مرة واحدة عند توفر مستخدم مؤهل — بلا تدوير في الخادم */
  useEffect(() => {
    if (!eligible) {
      setAds([]);
      setOptedOut(false);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const st = await fetch(`/api/user-ads-status?userId=${user!.id}`)
          .then((r) => r.json())
          .catch(() => ({ adsOptOut: false }));
        if (!alive) return;
        if (st?.adsOptOut === true) {
          setOptedOut(true);
          return;
        }
        const res = await fetch(`/api/ads?viewerId=${user!.id}&pageSize=8`);
        const data = await res.json();
        if (!alive || !Array.isArray(data?.ads)) return;
        const list: BannerAd[] = data.ads
          .filter((a: { id?: string; title?: string }) => a.id && a.title)
          .slice(0, 8)
          .map((a: { id: string; title: string; imageUrl?: string | null; clinic?: { name?: string } }) => ({
            id: a.id,
            title: a.title,
            clinicName: a.clinic?.name || "—",
            imageUrl: a.imageUrl || null,
          }));
        setAds(list);
      } catch {
        /* الشريط غير حرج */
      }
    })();
    return () => {
      alive = false;
    };
  }, [eligible, user?.id]);

  /* الدوران التلقائي */
  useEffect(() => {
    if (ads.length < 2) return;
    const iv = setInterval(() => setIdx((i) => (i + 1) % ads.length), ROTATE_MS);
    return () => clearInterval(iv);
  }, [ads.length]);

  if (!eligible || optedOut || closed || ads.length === 0) return null;
  const ad = ads[Math.min(idx, ads.length - 1)];

  return (
    <div className="px-3 sm:px-4 lg:px-6 pt-3" data-ad-banner>
      <div className="relative overflow-hidden rounded-2xl border border-amber-400/30 bg-gradient-to-l from-amber-400/10 via-amber-400/5 to-transparent">
        <div className="flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-2">
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-black text-amber-600 dark:text-amber-400">
            <Megaphone className="h-3 w-3" />
            <span className="hidden sm:inline">{t.adBanner.label}</span>
          </span>

          {/* محتوى الإعلان — ضغط يفتح صفحة الإعلانات */}
          <button
            type="button"
            onClick={() => {
              useApp.getState().setView("ads");
            }}
            className="flex items-center gap-2.5 min-w-0 flex-1 text-start"
          >
            {ad.imageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={ad.imageUrl} alt={ad.title} className="h-9 w-9 rounded-lg object-cover border border-border/50 shrink-0" />
            ) : (
              <span className="h-9 w-9 rounded-lg gradient-primary text-white flex items-center justify-center font-black text-sm shrink-0">
                {ad.clinicName.charAt(0)}
              </span>
            )}
            <span className="min-w-0">
              <span className="block text-xs font-black truncate">{ad.title}</span>
              <span className="block text-[10px] text-muted-foreground truncate">{ad.clinicName}</span>
            </span>
          </button>

          {/* أسهم التنقل اليدوي — تظهر مع تعدد الإعلانات */}
          {ads.length > 1 ? (
            <div className="shrink-0 flex items-center gap-1">
              <button
                type="button"
                aria-label="prev ad"
                onClick={() => setIdx((i) => (i - 1 + ads.length) % ads.length)}
                className="h-7 w-7 rounded-full bg-muted/70 hover:bg-muted flex items-center justify-center text-muted-foreground"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <span className="text-[10px] font-bold text-muted-foreground font-mono tabular-nums" dir="ltr">
                {Math.min(idx, ads.length - 1) + 1}/{ads.length}
              </span>
              <button
                type="button"
                aria-label="next ad"
                onClick={() => setIdx((i) => (i + 1) % ads.length)}
                className="h-7 w-7 rounded-full bg-muted/70 hover:bg-muted flex items-center justify-center text-muted-foreground"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}

          {/* إغلاق لكل جلسة */}
          <button
            type="button"
            aria-label={t.common.close}
            onClick={() => setClosed(true)}
            className="shrink-0 h-7 w-7 rounded-full bg-muted/70 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* مؤشرات الدوران */}
        {ads.length > 1 ? (
          <div className="flex items-center justify-center gap-1 pb-1.5">
            {ads.map((_, i) => (
              <span key={i} className={cn("h-1 rounded-full transition-all", i === idx ? "w-3.5 bg-amber-500" : "w-1.5 bg-amber-500/30")} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
