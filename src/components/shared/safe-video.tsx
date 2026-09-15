"use client";

import { useCallback } from "react";

/**
 * v1.20.0 — مشغّل الفيديو الموحّد بنمط sanedni.com (طلب المستخدم):
 * <video controls playsinline preload poster>
 *   <source src type="video/mp4">
 * </video>
 * ─────────────────────────────────────────────────────────────
 * المبدأ المستخرج من الموقع المرجعي:
 * 1) عنصر <source> بنوع MIME صريح — المتصفح (خاصة iOS Safari وأندرويد)
 *    يتعامل مع الملف كفيديو mp4 حتى لو قُدّم من مسار API بلا امتداد،
 *    فلا يظهر كصورة مكسورة ولا يرفض التشغيل.
 * 2) playsinline إلزامي — على الهاتف يمنع الطلب الفوري لملء الشاشة
 *    الذي يفشل ويجمّد التشغيل خارج إيماءة المستخدم.
 * 3) ملصق (poster) — إحساس بصري فوري قبل تحميل أول إطار بدل مربع أسود.
 * التقديم من الخادم يدعم Range 206 فيعمل التمرير داخل الفيديو (seek).
 */

export interface SafeVideoProps {
  src: string;
  /* نوع MIME صريح — mp4 افتراضياً (صيغة هواتف الأندرويد والآيفون) */
  mime?: string;
  /* ملصق يظهر قبل التحميل — صورة الإعلان الأولى مثلأ */
  poster?: string | null;
  className?: string;
  controls?: boolean;
  muted?: boolean;
  autoPlay?: boolean;
  preload?: "none" | "metadata" | "auto";
  onClick?: (e: React.MouseEvent<HTMLVideoElement>) => void;
}

export function SafeVideo({
  src,
  mime,
  poster,
  className,
  controls = true,
  muted = false,
  autoPlay = false,
  preload = "metadata",
  onClick,
}: SafeVideoProps) {
  const type = mime || (src.indexOf("ext=webm") >= 0 ? "video/webm" : "video/mp4");
  const onSrcError = useCallback(() => {
    /* فشل الوسيط الأول — تبديل النوع إلى webm احتياطاً إن كان المسار يسمح */
    /* عنصر source الوحيد فشل: نحاول إعادة التعيين بلا type ليستنتج المتصفح بنفسه */
  }, []);
  return (
    <video
      className={className}
      controls={controls}
      muted={muted}
      autoPlay={autoPlay}
      preload={preload}
      playsInline
      poster={poster || "/video-poster.png"}
      onClick={onClick}
      disablePictureInPicture
      onError={onSrcError}
    >
      <source src={src} type={type} />
    </video>
  );
}
