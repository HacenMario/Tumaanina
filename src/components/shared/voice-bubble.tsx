"use client";

/**
 * v1.22.0 — فقاعة الرسالة الصوتية الموحّدة (الجيل الثالث)
 * ─────────────────────────────────────────────────────────────
 * إصلاح جذري لمشكل «رمز ✕ والمدة 00:00 بعد فترة» — تحليل الجيل الثاني
 * كشف ثلاث ثغرات متبقية كانت تُفشل التشغيل لاحقاً رغم نجاحه لحظة الإرسال:
 *
 *  1) عنصر Audio «مسموم»: بعد أول حدث error كان retry يعيد استخدام العنصر
 *     نفسه (a.load) — وعلى iOS/Safari خصوصاً يبقى العنصر معطوباً فيفشل
 *     التشغيل دائماً بعدها. الآن كل محاولة تشغيل تبدأ بعنصر جديد نظيف.
 *
 *  2) بلا مسار بديل: كان mode=raw (بثّ ثنائي + Range) هو المحاولة الوحيدة،
 *     وأي خلل في كاش المتصفح مع Range/immutable (سلوك iOS المتقلب) يُظهر ✕.
 *     الآن السلسلة: عنصر جديد + raw → عنصر جديد + JSON dataUrl → ✕.
 *
 *  3) مقارنة a.src !== url كانت دائماً صحيحة (src مطلق وurl نسبي) فتُعيّن
 *     src في كل ضغطة وتُهدر الكاش — الآن المقياس في ref داخلي.
 *
 * يُحتفظ بمكاسب الجيل الثاني: بثّ raw خفيف، كاش immutable، إعادة محاولة،
 * ورسالة واضحة للرسائل القديمة التالفة (410). المدة من حقل seconds المخزّن.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, AudioLines, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function fmt(s: number): string {
  const v = Math.max(0, Math.round(s));
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
}

export function VoiceBubble({
  id,
  seconds,
  mine,
  userId,
  dataUrl,
  className,
}: {
  id: string;
  seconds: number;
  mine?: boolean;
  userId?: string | null;
  /** بيانات جاهزة (رسالتي المُرسلة للتو — بلا أي جلب شبكي) */
  dataUrl?: string | null;
  className?: string;
}) {
  const { t } = useI18n();
  /* بيانات رسالتي المرسلة للتو — تُثبَّت لحظة التركيب ولا تتأثر بالاستقصاء */
  const localUrlRef = useRef<string | null>(dataUrl || null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [err, setErr] = useState(false);
  const [legacy, setLegacy] = useState(false);
  const retriedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /* v1.22.0: مصدر الصوت المعيَّن حالياً على العنصر — بديل a.src النسبي/المطلق */
  const assignedSrcRef = useRef<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const failBusyRef = useRef(false);
  const total = Math.max(1, Math.round(seconds || 0));

  /* مسار البث الثنائي — كاش المتصفح يتكفل بالتكرار (immutable) */
  const rawUrl = `/api/messages/${id}/audio?mode=raw${userId ? `&userId=${encodeURIComponent(userId)}` : ""}`;
  /* المسار البديل: JSON كامل ببيانات الصوت — يُستعمل فقط عند فشل raw */
  const jsonUrl = `/api/messages/${id}/audio${userId ? `?userId=${encodeURIComponent(userId)}` : ""}`;

  const stopAudio = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.src = "";
    }
  }, []);

  const releaseBlobUrl = useCallback(() => {
    if (blobUrlRef.current) {
      try {
        URL.revokeObjectURL(blobUrlRef.current);
      } catch {
        /* تجاهل */
      }
      blobUrlRef.current = null;
    }
  }, []);

  /* v1.22.0: كسر الاعتماد الدائري بين العنصر ومسار التعافي —
     مستمع error يستدعي أحدث نسخة من handleFailure عبر مرجع */
  const handleFailureRef = useRef<() => Promise<void>>(async () => {});

  /* عنصر صوت نظيف لكل محاولة — العنصر الذي أصابه error لا يُعاد استخدامه */
  const freshAudio = useCallback((): HTMLAudioElement => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch {
        /* تجاهل */
      }
    }
    const a = new Audio();
    a.preload = "auto";
    a.addEventListener("timeupdate", () => {
      /* ملفات webm بلا مدة مضمّنة: نقيّد الموضع بالمدة المخزّنة */
      const dur = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : total;
      setPos(Math.min(a.currentTime, dur));
    });
    a.addEventListener("ended", () => {
      setPlaying(false);
      setPos(0);
    });
    /* خطأ أثناء البث بعد نجاح التشغيل (انقطاع شبكة/كاش تالف) —
       نفس سلسلة التعافي، مع حارس يمنع الازدواج مع رفض play() */
    a.addEventListener("error", () => {
      setPlaying(false);
      if (failBusyRef.current) return;
      failBusyRef.current = true;
      void handleFailureRef.current().finally(() => {
        failBusyRef.current = false;
      });
    });
    audioRef.current = a;
    return a;
  }, [total]);

  /* v1.22.0: جلب data URL عبر المسار البديل — آخر ورقة قبل ✕.
     يعالج خلل كاش Range/immutable على iOS وأي خلل بثّ عابر */
  const fetchJsonFallback = useCallback(async (): Promise<string | null> => {
    try {
      const r = await fetch(jsonUrl, { cache: "no-store" });
      if (!r.ok) return null;
      const d = (await r.json()) as { ok?: boolean; content?: string; seconds?: number };
      if (!d?.content || !String(d.content).startsWith("data:audio/")) return null;
      const res = await fetch(d.content);
      const blob = await res.blob();
      releaseBlobUrl();
      blobUrlRef.current = URL.createObjectURL(blob);
      return blobUrlRef.current;
    } catch {
      return null;
    }
  }, [jsonUrl, releaseBlobUrl]);

  /* تصنيف الفشل: رسالة قديمة تالفة (410) → رسالة واضحة بلا إعادة محاولة،
     غير ذلك → عنصر جديد عبر raw ثم بديل JSON ثم ✕ */
  const handleFailure = useCallback(async () => {
    if (!legacy) {
      try {
        const probe = await fetch(rawUrl, { headers: { Range: "bytes=0-0" } });
        if (probe.status === 410) {
          setLegacy(true);
          setErr(false);
          setLoading(false);
          return;
        }
      } catch {
        /* شبكة — نكمل إلى المحاولات التالية */
      }
    }
    /* المحاولة 2: عنصر جديد عبر raw */
    if (!retriedRef.current) {
      retriedRef.current = true;
      const a = freshAudio();
      assignedSrcRef.current = rawUrl;
      a.src = rawUrl;
      try {
        await a.play();
        setPlaying(true);
        setErr(false);
        setLoading(false);
        return;
      } catch {
        /* نكمل للمسار البديل */
      }
    }
    /* المحاولة 3: JSON dataUrl (blob) — عنصر جديد أيضاً */
    const url = await fetchJsonFallback();
    if (url) {
      const a = freshAudio();
      assignedSrcRef.current = url;
      a.src = url;
      try {
        await a.play();
        setPlaying(true);
        setErr(false);
        setLoading(false);
        return;
      } catch {
        /* فشل نهائي */
      }
    }
    setErr(true);
    setLoading(false);
  }, [rawUrl, legacy, freshAudio, fetchJsonFallback]);

  /* مزامنة المرجع مع أحدث نسخة من مسار التعافي في كل تصيير */
  useEffect(() => {
    handleFailureRef.current = handleFailure;
  }, [handleFailure]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        try {
          audioRef.current.pause();
        } catch {
          /* تجاهل */
        }
        audioRef.current = null;
      }
      releaseBlobUrl();
    };
  }, [releaseBlobUrl]);

  const toggle = useCallback(async () => {
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    /* الضغط بعد الخطأ = محاولة جديدة دائماً */
    if (err) retriedRef.current = false;
    setLoading(true);
    setErr(false);
    const local = localUrlRef.current;
    const url = local || rawUrl;
    /* v1.22.0: مقارنة عبر ref داخلي — كانت a.src (مطلق) !== url (نسبي)
       صحيحة دائماً فتُعيّن src بكل ضغطة وتُهدر كاش المتصفح */
    const a = assignedSrcRef.current === url && audioRef.current ? audioRef.current : freshAudio();
    if (assignedSrcRef.current !== url) {
      if (!local) releaseBlobUrl();
      assignedSrcRef.current = url;
      a.src = url;
    }
    try {
      await a.play();
      setPlaying(true);
      setLoading(false);
    } catch {
      await handleFailure();
    }
  }, [playing, err, rawUrl, handleFailure, freshAudio, releaseBlobUrl]);

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    /* dir=ltr داخل الفقاعة دائماً — النسبة من اليسار */
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const next = ratio * total;
    setPos(next);
    const a = audioRef.current;
    if (a && playing) a.currentTime = next;
  };

  const pct = Math.min(100, (pos / total) * 100);

  return (
    <span
      className={cn("flex items-center gap-2.5 min-w-44 sm:min-w-52 max-w-full select-none", className)}
      dir="ltr"
      data-voice-bubble="1"
    >
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={loading}
        aria-label={playing ? "pause" : "play"}
        className={cn(
          "h-9 w-9 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-90",
          mine ? "bg-white/20 text-white hover:bg-white/30" : "bg-primary/15 text-primary hover:bg-primary/25"
        )}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : playing ? (
          <Pause className="h-4 w-4 fill-current" />
        ) : (
          <Play className="h-4 w-4 fill-current" />
        )}
      </button>
      <span className="flex-1 min-w-0">
        <span
          onClick={seek}
          role="presentation"
          className={cn("block h-2 rounded-full cursor-pointer overflow-hidden", mine ? "bg-white/25" : "bg-muted-foreground/20")}
        >
          <span
            className={cn("block h-full rounded-full transition-[width] duration-200", mine ? "bg-white" : "bg-primary")}
            style={{ width: `${pct}%` }}
          />
        </span>
        <span className={cn("flex items-center gap-1.5 mt-0.5 text-[10px] font-black font-mono", mine ? "text-white/85" : "text-muted-foreground")}>
          <AudioLines className="h-3 w-3 shrink-0" />
          {legacy ? (
            <span className={cn("font-sans whitespace-nowrap", mine ? "text-white/85" : "text-destructive")}>{t.session.voiceLegacy}</span>
          ) : (
            <>
              {err ? <span className="font-sans text-destructive">✕</span> : null}
              {fmt(pos)} / {fmt(total)}
            </>
          )}
        </span>
      </span>
    </span>
  );
}
