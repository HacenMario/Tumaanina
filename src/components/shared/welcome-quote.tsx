"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { playAmbient30s } from "@/lib/sounds";
import type { AppLang } from "@/lib/constants";
import seedQuotes from "../../../shared/uplift-quotes.json";

/**
 * نافذة «لحظة اطمئنان» — تظهر عند كل ولوج للموقع:
 * عبارة دعم نفسي (دينية/اجتماعية/حكمة) تُختار عشوائياً من مكتبة
 * يديرها الأدمين، بلغة المستخدم الأخيرة (والعربية في أول ولوج)،
 * وتختفي تلقائياً بعد 7 ثوانٍ أو بمغلق يدوي.
 */

interface Quote {
  id: string;
  textAr: string;
  textFr: string;
  textEn: string;
  textTr?: string | null;
  textRu?: string | null;
  textZh?: string | null;
  textEs?: string | null;
  textDe?: string | null;
  textIt?: string | null;
  author?: string | null;
  category?: string;
}

const SHOW_DELAY_MS = 550; /* بعد انتهاء هيكل التحميل تقريباً */
const AUTO_CLOSE_MS = 10000; /* 10 ثوانٍ — مدة مريحة للقراءة (تفضيل المستخدم) */
const FETCH_TIMEOUT_MS = 3500;

/* v2.10.0: اختيار النص بالستّ لغات — احتياطاً التركية/الروسية/الصينية
   تسقط إلى العربية إن كان السجل قديماً بلا ترجمة */
function textFor(q: Quote, lang: AppLang): string {
  if (lang === "fr") return q.textFr || q.textAr;
  if (lang === "en") return q.textEn || q.textAr;
  if (lang === "tr") return q.textTr || q.textAr;
  if (lang === "ru") return q.textRu || q.textAr;
  if (lang === "zh") return q.textZh || q.textAr;
  /* v1.22.0: الإسبانية/الألمانية/الإيطالية — تسقط إلى الإنجليزية ثم العربية
     إن كان السجل قديماً بلا ترجمة (نفس فلسفة اللغات الست) */
  if (lang === "es") return q.textEs || q.textEn || q.textAr;
  if (lang === "de") return q.textDe || q.textEn || q.textAr;
  if (lang === "it") return q.textIt || q.textEn || q.textAr;
  return q.textAr;
}

export function WelcomeQuote() {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [displayLang, setDisplayLang] = useState<AppLang>("ar");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    /* v1.9.0: بثّ حدث إغلاق النافذة — تنطلق بعده نافذة العقد العلاجي
       الإلزامية إن وُجد عقد بانتظار إمضاء العميل المسجّل */
    try {
      window.dispatchEvent(new Event("tumaanina-welcome-closed"));
    } catch {
      /* تجاهل */
    }
    /* v2.13.0: صوت طبيعة مهدئ عشوائي (مطر / نار مشتعلة / عصافير مع ماء /
       حيتان البحر / غابة وشلال) لمدة 20 ثانية يبدأ فور إغلاق نافذة
       الاطمئنان — على الصفحة الرئيسية فقط كما طلب المستخدم */
    if (useApp.getState().view === "landing") {
      playAmbient30s();
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const openWith = (q: Quote, at: AppLang) => {
      if (cancelled) return;
      setQuote(q);
      setDisplayLang(at);
      setOpen(true);
      timerRef.current = setTimeout(close, AUTO_CLOSE_MS);
    };

    const launch = async () => {
      if (cancelled) return;
      /* اللغة: آخر لغة استعملها المستخدم قبل الخروج — والعربية في أول ولوج.
         مخزن i18n يقرأ raifiqi-lang عند الإقلاع، فبنهاية هذا التأخير تكون
         lang قد استقرّت على القيمة المحفوظة (أو العربية افتراضياً). */
      const resolvedLang: AppLang = (window.localStorage.getItem("tumaanina-lang") as AppLang | null) || "ar";

      let pool: Quote[] = [];
      try {
        const r = await fetch("/api/quotes", { cache: "no-store", signal: controller.signal });
        if (r.ok) {
          const d = await r.json();
          pool = Array.isArray(d.quotes) ? d.quotes : [];
        }
      } catch {
        /* الخادم غير متاح — مكتبة العبارات المدمجة شبكة أمان */
      }
      if (cancelled) return;
      if (pool.length === 0) {
        /* مكتبة مدمجة مسبقاً: أبداً لا تظهر النافذة فارغة */
        pool = (seedQuotes as { cat: string; ar: string; fr: string; en: string; tr?: string; ru?: string; zh?: string; es?: string; de?: string; it?: string; au: string }[]).map((q, i) => ({
          id: `seed-${i}`,
          textAr: q.ar,
          textFr: q.fr,
          textEn: q.en,
          textTr: q.tr ?? null,
          textRu: q.ru ?? null,
          textZh: q.zh ?? null,
          textEs: q.es ?? null,
          textDe: q.de ?? null,
          textIt: q.it ?? null,
          author: q.au,
          category: q.cat,
        }));
      }
      /* v2.13.0: دورة بلا تكرار — لا تظهر أي عبارة ثانيةً إلا بعد أن
         تظهر كل عبارات المكتبة مرة واحدة على الأقل (حقيبة خلط).
         السجل يُخزَّن محلياً، ويُنظّف تلقائياً من معرّفات لم تعد موجودة
         حتى لا يعلق المستخدم على عبارة واحدة إن صغرت المكتبة. */
      const poolIds = new Set(pool.map((q) => q.id));
      let seen: string[] = [];
      try {
        const raw = JSON.parse(window.localStorage.getItem("tumaanina-quote-seen") || "[]");
        seen = Array.isArray(raw) ? raw.filter((x: unknown) => typeof x === "string" && poolIds.has(x)) : [];
      } catch {
        seen = [];
      }
      const seenSet = new Set(seen);
      let fresh = pool.filter((q) => !seenSet.has(q.id));
      if (fresh.length === 0) {
        /* ظهرت كل العبارات — نبدأ دورة جديدة كاملة */
        seen = [];
        fresh = pool;
      }
      const chosen = fresh[Math.floor(Math.random() * fresh.length)];
      seen.push(chosen.id);
      try {
        window.localStorage.setItem("tumaanina-quote-seen", JSON.stringify(seen.slice(-400)));
      } catch {
        /* تجاهل */
      }
      openWith(chosen, resolvedLang);
    };

    /* v1.17.0: لا نُطلق العبارة إلا بعد اكتمال تحميل الصفحة بالكامل —
       إحكام سباق React #418 النادر حين تصل استجابة الشبكة وتُحدَّث الحالة
       قبل اكتمال ترطيب الشجرة (كان سبباً في ظهور الخطأ متقطعاً) */
    let launchId: ReturnType<typeof setTimeout> | null = null;
    const scheduleLaunch = () => {
      if (cancelled) return;
      launchId = setTimeout(launch, SHOW_DELAY_MS);
    };
    if (document.readyState === "complete") scheduleLaunch();
    else window.addEventListener("load", scheduleLaunch, { once: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      cancelled = true;
      if (launchId) clearTimeout(launchId);
      window.removeEventListener("load", scheduleLaunch);
      clearTimeout(timeoutId);
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener("keydown", onKey);
    };
  }, [close]);

  return (
    <AnimatePresence>
      {open && quote && (
        <motion.div
          key="welcome-quote-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.25 } }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 backdrop-blur-[3px] px-4"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label={t.quote.title}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="relative w-full max-w-md bg-card border border-border rounded-3xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* رأس متدرج بألوان الهوية */}
            <div className="gradient-primary px-5 pt-5 pb-6 text-white relative">
              <button
                onClick={close}
                aria-label={t.quote.close}
                className="absolute top-3 end-3 h-9 w-9 rounded-full bg-white/15 hover:bg-white hover:text-primary transition-all duration-300 hover:rotate-90 hover:scale-110 active:scale-95 flex items-center justify-center"
              >
                <X className="h-4.5 w-4.5" />
              </button>
              <div className="flex items-center gap-2.5">
                <span className="h-9 w-9 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
                  <Sparkles className="h-4.5 w-4.5" />
                </span>
                <div>
                  <div className="font-black text-base leading-tight">{t.quote.title}</div>
                  <div className="text-[11px] text-white/80 font-semibold mt-0.5">{t.quote.subtitle}</div>
                </div>
              </div>
            </div>

            {/* العبارة */}
            <div className="px-6 py-7 text-center">
              <p className="text-lg leading-loose font-bold text-foreground min-h-16" dir="auto">
                {textFor(quote, displayLang)}
              </p>
              {quote.author && (
                <span className="inline-block mt-4 text-[11px] font-bold text-muted-foreground bg-muted rounded-full px-3 py-1" dir="auto">
                  {quote.author}
                </span>
              )}
            </div>

            {/* الشريط السفلي: عدّاد الإغلاق التلقائي */}
            <div className="px-6 pb-4 flex items-center justify-between gap-3">
              <span className="text-[10px] text-muted-foreground font-semibold">{t.quote.autoClose}</span>
              <button
                onClick={close}
                className="text-[11px] font-black gradient-primary bg-clip-text text-transparent hover:opacity-80 transition-opacity"
              >
                {t.quote.close}
              </button>
            </div>
            <motion.div
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: AUTO_CLOSE_MS / 1000, ease: "linear" }}
              className="h-1 gradient-primary origin-start"
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
