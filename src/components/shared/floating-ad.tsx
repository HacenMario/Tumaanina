"use client";

/**
 * v1.15.0 — نافذة الإعلان العائم (الإعلانات المدفوعة المعتمدة من الإدارة):
 * • تُجلب من /api/ads/floating — لا تظهر للعيادات ولا للإدارة ولا لمن رفض
 *   الإعلانات المدفوعة من إعداداته، وبحد ظهور لكل مستخدم (منع الإزعاج)
 * • سلايدر وسائط: حتى 5 صور + فيديو — سحب يمين/يسار + أسهم
 * • شارة «إعلان مدفوع» + زر «افتح صفحة العيادة» يوجه مباشرة لصفحتها
 * • إغلاق يدوي (X) وإغلاق تلقائي بعد مهلة قصيرة — ومساحة خنق بين العروض
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, ChevronLeft, ChevronRight, Building2, Volume2, BadgeDollarSign } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { openClinicPage } from "@/components/views/clinics-directory";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FloatingAd {
  id: string;
  title: string;
  body: string;
  mediaUrls: string[];
  expiresAt: string | null;
  likesCount: number;
  clinic: { id: string; name: string; slug: string | null; hasLogo: boolean; logoUrl: string };
}

const AUTO_CLOSE_MS = 14000;     /* الإغلاق التلقائي للنافذة */
const COOLDOWN_MS = 6 * 60000;   /* مهلة الخنق بين العروض — لا إزعاج بالتكرار */
const POLL_MS = 5 * 60000;       /* فحص دوري خفيف */

function isVideo(url: string) {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

export function FloatingAdPopup() {
  const { t } = useI18n();
  const user = useApp((s) => s.user);
  const [ad, setAd] = useState<FloatingAd | null>(null);
  const [slide, setSlide] = useState(0);
  const [show, setShow] = useState(false);
  const shownIdRef = useRef<string | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartX = useRef<number | null>(null);

  const recordImpression = useCallback((adId: string, uid: string) => {
    void fetch("/api/ads/floating", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: uid, adId }),
    }).catch(() => {});
  }, []);

  const fetchAd = useCallback(async () => {
    const u = useApp.getState().user;
    if (!u?.id || (u.role !== "VICTIM" && u.role !== "COUNSELOR")) return;
    try {
      const res = await fetch(`/api/ads/floating?userId=${u.id}`);
      const data = await res.json();
      if (data?.ad && data.ad.id !== shownIdRef.current) {
        setAd(data.ad as FloatingAd);
        setSlide(0);
        setShow(true);
        shownIdRef.current = data.ad.id;
        recordImpression(data.ad.id, u.id);
        /* الإغلاق التلقائي — منع الإزعاج */
        if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
        autoTimerRef.current = setTimeout(() => setShow(false), AUTO_CLOSE_MS);
      }
    } catch {
      /* تجاهل — الإعلان العائم غير حرج */
    }
  }, [recordImpression]);

  useEffect(() => {
    if (!user?.id) return;
    /* أول فحص بعد استقرار الصفحة + فحص دوري خفيف */
    const boot = setTimeout(() => {
      try {
        const last = Number(localStorage.getItem("tumaanina-floating-last") || "0");
        if (Date.now() - last < COOLDOWN_MS) return;
        void fetchAd();
        localStorage.setItem("tumaanina-floating-last", String(Date.now()));
      } catch {
        void fetchAd();
      }
    }, 4000);
    const poll = setInterval(() => {
      try {
        const last = Number(localStorage.getItem("tumaanina-floating-last") || "0");
        if (Date.now() - last < COOLDOWN_MS) return;
        void fetchAd();
        localStorage.setItem("tumaanina-floating-last", String(Date.now()));
      } catch {
        /* تجاهل */
      }
    }, POLL_MS);
    return () => {
      clearTimeout(boot);
      clearInterval(poll);
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    };
  }, [user?.id, fetchAd]);

  const close = () => {
    setShow(false);
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
  };

  const next = () => setSlide((s) => (ad && s < ad.mediaUrls.length - 1 ? s + 1 : 0));
  const prev = () => setSlide((s) => (s > 0 ? s - 1 : ad ? ad.mediaUrls.length - 1 : 0));

  /* سحب اللمس يمين/يسار لتبديل الوسائط */
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    if (Math.abs(dx) > 40) {
      if (dx < 0) next();
      else prev();
    }
    touchStartX.current = null;
  };

  if (!ad || !show) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 60, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.97 }}
        transition={{ type: "spring", damping: 24, stiffness: 260 }}
        className="fixed z-[70] bottom-4 end-4 start-4 sm:start-auto sm:w-[340px] max-w-[calc(100vw-2rem)]"
        role="dialog"
        aria-label={t.floatingAd.badge}
      >
        <div className="rounded-2xl border border-border/70 bg-card shadow-2xl overflow-hidden">
          {/* الشريط العلوي: شارة الإعلان المدفوع + الإغلاق */}
          <div className="flex items-center justify-between gap-2 px-3 py-2 bg-amber-400/10 border-b border-amber-400/30">
            <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-600 dark:text-amber-400">
              <BadgeDollarSign className="h-3.5 w-3.5" />
              {t.floatingAd.badge}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-muted-foreground font-mono" dir="ltr">
                {slide + 1}/{Math.max(1, ad.mediaUrls.length)}
              </span>
              <button type="button" onClick={close} aria-label={t.common.close} className="h-7 w-7 rounded-full bg-muted hover:bg-muted/70 flex items-center justify-center">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* السلايدر: صور/فيديو بالسحب يمين/يسار */}
          {ad.mediaUrls.length > 0 ? (
            <div
              className="relative aspect-[16/10] bg-muted/40 select-none"
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
            >
              {isVideo(ad.mediaUrls[slide]) ? (
                <video
                  key={ad.mediaUrls[slide]}
                  src={ad.mediaUrls[slide]}
                  className="h-full w-full object-cover"
                  controls
                  autoPlay
                  muted
                  playsInline
                />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={ad.mediaUrls[slide]} alt={ad.title} className="h-full w-full object-cover" draggable={false} />
              )}
              {ad.mediaUrls.length > 1 ? (
                <>
                  <button type="button" onClick={prev} aria-label="prev" className="absolute start-1.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center">
                    <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                  </button>
                  <button type="button" onClick={next} aria-label="next" className="absolute end-1.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center">
                    <ChevronRight className="h-4 w-4 rtl:rotate-180" />
                  </button>
                  <div className="absolute bottom-1.5 inset-x-0 flex items-center justify-center gap-1">
                    {ad.mediaUrls.map((_, i) => (
                      <span key={i} className={cn("h-1.5 rounded-full transition-all", i === slide ? "w-4 bg-white" : "w-1.5 bg-white/50")} />
                    ))}
                  </div>
                </>
              ) : null}
              {isVideo(ad.mediaUrls[slide]) ? (
                <span className="absolute top-2 start-2 inline-flex items-center gap-1 rounded-full bg-black/50 text-white text-[10px] font-black px-2 py-0.5">
                  <Volume2 className="h-3 w-3" />
                  {t.floatingAd.video}
                </span>
              ) : null}
            </div>
          ) : null}

          {/* المحتوى */}
          <div className="p-3.5 space-y-2">
            <h3 className="font-black text-sm leading-snug line-clamp-1">{ad.title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 whitespace-pre-line">{ad.body}</p>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                className="flex items-center gap-2 min-w-0 flex-1"
                onClick={() => {
                  close();
                  openClinicPage(ad.clinic.slug, ad.clinic.id);
                }}
              >
                <Avatar className="h-8 w-8 rounded-lg shrink-0 border border-border/60 bg-card">
                  {ad.clinic.hasLogo ? <AvatarImage src={ad.clinic.logoUrl} alt={ad.clinic.name} className="rounded-lg object-contain p-0.5" /> : null}
                  <AvatarFallback className="gradient-primary text-white rounded-lg font-black text-xs">{ad.clinic.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <span className="text-[11px] font-black truncate">{ad.clinic.name}</span>
              </button>
            </div>
            {/* زر «افتح صفحة العيادة» — يوجه مباشرة لصفحتها */}
            <Button
              size="sm"
              className="w-full gradient-primary text-white font-black rounded-xl h-10 gap-1.5"
              onClick={() => {
                close();
                openClinicPage(ad.clinic.slug, ad.clinic.id);
              }}
            >
              <Building2 className="h-4 w-4" />
              {t.floatingAd.openClinic}
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
