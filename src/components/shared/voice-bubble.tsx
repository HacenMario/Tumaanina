"use client";

/**
 * v1.21.1 — فقاعة الرسالة الصوتية الموحّدة (الجيل الثاني)
 * ─────────────────────────────────────────────────────────────
 * إصلاح جذري لمشكل «رمز ✕ والمدة 00:00 بعد فترة»:
 *  1) بثّ ثنائي مباشر (mode=raw) بدل JSON يحمّل data URL كاملاً —
 *     أخف على الشبكة، يدعم Range، ويستفيد من كاش المتصفح الآمن.
 *  2) إعادة محاولة تلقائية واحدة عند أي فشل عابر (شبكة/خادم) قبل
 *     إظهار ✕ — الفشل العابر لم يعد يعلق الفقاعة في خطأ للأبد،
 *     والضغط بعد ✕ يعيد المحاولة دائماً.
 *  3) الرسائل القديمة التالفة (خطأ قصّ v1.5.0) تُعرض برسالة واضحة
 *     مترجمة بدل رمز غامض.
 * المدة تُقرأ من حقل seconds المخزّن (ملفات webm بلا مدة مضمّنة).
 * رسالة المرسل الحديثة تُشغَّل من الذاكرة (dataUrl) بلا أي شبكة.
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
  const total = Math.max(1, Math.round(seconds || 0));

  /* مسار البث الثنائي — كاش المتصفح يتكفل بالتكرار (immutable) */
  const rawUrl = `/api/messages/${id}/audio?mode=raw${userId ? `&userId=${encodeURIComponent(userId)}` : ""}`;

  /* تصنيف الفشل: رسالة قديمة تالفة (410) → رسالة واضحة بلا إعادة محاولة،
     غير ذلك → إعادة محاولة تلقائية واحدة ثم ✕ عند التكرار */
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
        /* شبكة — نكمل إلى إعادة المحاولة */
      }
    }
    if (retriedRef.current) {
      setErr(true);
      setLoading(false);
      return;
    }
    retriedRef.current = true;
    const a = audioRef.current;
    if (a) {
      try {
        a.load();
        await a.play();
        setPlaying(true);
        setErr(false);
        setLoading(false);
        return;
      } catch {
        /* نفشل نهائياً أدناه */
      }
    }
    setErr(true);
    setLoading(false);
  }, [rawUrl, legacy]);

  const ensureAudio = useCallback((): HTMLAudioElement => {
    if (audioRef.current) return audioRef.current;
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
    a.addEventListener("error", () => {
      setPlaying(false);
      void handleFailure();
    });
    audioRef.current = a;
    return a;
  }, [total, handleFailure]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

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
    const a = ensureAudio();
    const url = localUrlRef.current || rawUrl;
    if (a.src !== url) {
      retriedRef.current = false;
      a.src = url;
    }
    try {
      await a.play();
      setPlaying(true);
      setLoading(false);
    } catch {
      await handleFailure();
    }
  }, [playing, err, ensureAudio, rawUrl, handleFailure]);

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
