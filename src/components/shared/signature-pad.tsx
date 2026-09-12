"use client";

/**
 * v1.9.0 — لوحة الامضاء الرقمي (تُستعمل في العقد العلاجي).
 * رسم بالإصبع/الفأرة على لوحة Canvas بحجم متجاوب، وتصدير الامضاء
 * كصورة PNG شفافة مضغوطة (dataURL) عبر onChange.
 * الميزات: أبعاد حسب كثافة الشاشة (devicePixelRatio) — دعم اللمس والقلم
 * والفأرة (Pointer Events) — زر مسح — كشف «هل رُسم شيء فعلاً».
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

interface Props {
  onChange: (dataUrl: string | null) => void;
  /** ارتفاع اللوحة بالبكسل CSS (افتراضي 160) */
  height?: number;
  /** لون الحبر — يتبع لون الهوية افتراضياً */
  inkColor?: string;
  disabled?: boolean;
}

export function SignaturePad({ onChange, height = 160, inkColor, disabled }: Props) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const dirty = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  const ink = inkColor || "#3b2a6b";

  /* تهيئة الأبعاد عند التركيب وتغيّر المقاس — مع الحفاظ على الرسم الحالي */
  const resize = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    if (rect.width === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    /* انسخ الرسم القديم قبل تغيير الأبعاد */
    const old = document.createElement("canvas");
    old.width = cv.width;
    old.height = cv.height;
    if (cv.width > 0 && cv.height > 0) old.getContext("2d")?.drawImage(cv, 0, 0);
    cv.width = Math.round(rect.width * dpr);
    cv.height = Math.round(rect.height * dpr);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = ink;
    /* أعِد رسم المحتوى القديم بمقياس جديد */
    if (old.width > 0 && dirty.current) {
      ctx.drawImage(old, 0, 0, rect.width, rect.height);
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [ink]);

  useEffect(() => {
    resize();
    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [resize]);

  const posOf = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current!;
    const rect = cv.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = posOf(e);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return;
    const ctx = canvasRef.current?.getContext("2d");
    const p = posOf(e);
    if (!ctx || !last.current) return;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!dirty.current) {
      dirty.current = true;
      setHasInk(true);
    }
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    exportInk();
  };

  /* مرجع حيّ لـ onChange لتجنب إعادة تهيئة المؤثرات في كل رندر */
  const onChangeRef = useRef<Props["onChange"]>(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  /* تصدير الرسم كصورة PNG بخلفية شفافة (dataURL) */
  const exportInk = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv || !dirty.current) {
      onChangeRef.current?.(null);
      return;
    }
    try {
      /* قصّ المنطقة المرسمة فقط — امضاء مضغوط ونظيف */
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      const { width, height } = cv;
      const img = ctx.getImageData(0, 0, width, height);
      let minX = width, minY = height, maxX = 0, maxY = 0, found = false;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (img.data[(y * width + x) * 4 + 3] > 10) {
            found = true;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (!found) {
        onChangeRef.current?.(null);
        return;
      }
      const pad = 12;
      minX = Math.max(0, minX - pad);
      minY = Math.max(0, minY - pad);
      maxX = Math.min(width, maxX + pad);
      maxY = Math.min(height, maxY + pad);
      const out = document.createElement("canvas");
      const scale = Math.min(2, 480 / Math.max(maxX - minX, 1)); /* عرض أقصى 480px */
      out.width = Math.round((maxX - minX) * scale);
      out.height = Math.round((maxY - minY) * scale);
      out.getContext("2d")?.drawImage(cv, minX, minY, maxX - minX, maxY - minY, 0, 0, out.width, out.height);
      onChangeRef.current?.(out.toDataURL("image/png"));
    } catch {
      onChangeRef.current?.(null);
    }
  }, []);

  const clear = () => {
    const cv = canvasRef.current;
    if (!cv) return;
    dirty.current = false;
    /* إعادة ضبط عرض/ارتفاع اللوحة تمسح كل المحتوى، ثم resize يعيد التحويل والقلم */
    cv.width = cv.width;
    resize();
    setHasInk(false);
    onChangeRef.current?.(null);
  };

  return (
    <div className="space-y-1.5">
      <div className="relative rounded-xl border-2 border-dashed border-border bg-card overflow-hidden" style={{ height }}>
        <canvas
          ref={canvasRef}
          className="w-full h-full touch-none cursor-crosshair"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
          aria-label={t.contract.drawHint}
        />
        {!hasInk && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
            <span className="text-xs font-semibold text-muted-foreground/70">{t.contract.drawHint}</span>
          </div>
        )}
        <div className="absolute inset-x-6 bottom-6 border-b border-dashed border-muted-foreground/25 pointer-events-none" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold text-muted-foreground">{t.contract.signHint}</span>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-[11px] font-bold" disabled={disabled || !hasInk} onClick={clear}>
          <Eraser className="h-3.5 w-3.5" />
          {t.contract.clearSign}
        </Button>
      </div>
    </div>
  );
}
