"use client";

/**
 * v1.6.0 — فقاعة الرسالة الصوتية الموحّدة (غرفة الجلسة + محادثة ما قبل
 * الجلسة + فضاء الأخصائيين).
 * ─────────────────────────────────────────────────────────────
 * إصلاح جذري لمشكلتين وصفهما المستخدم:
 *  • «مدة التسجيل تبقى 0»: ملفات webm المسجّلة بـ MediaRecorder لا تحمل
 *    مدة مضمّنة فيُقرأ audio.duration = ∞ أو 0 — المدة تُقرأ الآن من
 *    حقل seconds المخزّن مع الرسالة (ثوانٍ حقيقية من مسجّل المتصفح).
 *  • «لا يمكن بدأ الاستماع»: المشغّل الأصلي <audio controls> مع data URL
 *    ثقيل كان متعثراً في عرضه وتشغيله على الهاتف — مشغّل مخصّص بزر
 *    تشغيل/إيقاف وشريط تقدّم قابل للسحب، ويجلب الصوت عند الطلب الفعلي
 *    عبر /api/messages/{id}/audio (قوائم الاستقصاء بقيت خفيفة).
 * التخزين المؤقت في الذاكرة: التشغيل الثاني فوري بلا أي شبكة.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, AudioLines, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* ذاكرة مشتركة على مستوى الصفحة — التشغيل المتكرر بلا إعادة تنزيل */
const audioCache = new Map<string, string>();

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
  const [src, setSrc] = useState<string | null>(dataUrl || audioCache.get(id) || null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [err, setErr] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const total = Math.max(1, Math.round(seconds || 0));

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const fetchSrc = useCallback(async (): Promise<string | null> => {
    if (src) return src;
    const cached = audioCache.get(id);
    if (cached) {
      setSrc(cached);
      return cached;
    }
    setLoading(true);
    setErr(false);
    try {
      const qs = userId ? `?userId=${encodeURIComponent(userId)}` : "";
      const r = await fetch(`/api/messages/${id}/audio${qs}`, { cache: "force-cache" });
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      if (!d?.content) throw new Error("empty");
      audioCache.set(id, d.content);
      setSrc(d.content);
      return d.content as string;
    } catch {
      setErr(true);
      return null;
    } finally {
      setLoading(false);
    }
  }, [id, userId, src]);

  const toggle = useCallback(async () => {
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    const url = await fetchSrc();
    if (!url) return;
    if (!audioRef.current) {
      const a = new Audio();
      a.preload = "auto";
      audioRef.current = a;
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
        setErr(true);
      });
    }
    const a = audioRef.current;
    if (a.src !== url) a.src = url;
    try {
      await a.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
      setErr(true);
    }
  }, [playing, fetchSrc, total]);

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
          {err ? <span className="font-sans">✕</span> : null}
          {fmt(pos)} / {fmt(total)}
        </span>
      </span>
    </span>
  );
}
