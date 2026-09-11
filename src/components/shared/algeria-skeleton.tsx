"use client";

import { motion } from "framer-motion";

/**
 * طمأنينة — زهرة اللوتس الهادئة (رمز النسخة التجارية v1.0.0).
 * لوتس بخمس بتلات داخل دائرة ناعمة — SVG نقي بلون العلامة.
 * يُستخدم كهيكل تحميل (skeleton) عند كل تحميل أو تنقّل بين الصفحات،
 * وفي الفوتر وغرفة الجلسة.
 * (التصدير القديم AlgeriaFlag متروك كاسم بديل للتوافق مع الاستيرادات القائمة)
 */
export function CalmBlossom({ className = "", size = 84 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Tumaanina"
    >
      <defs>
        <linearGradient id="tumBlossomGrad" x1="20" y1="10" x2="80" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#A78BFA" />
          <stop offset="0.55" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#6D28D9" />
        </linearGradient>
        <linearGradient id="tumBlossomSoft" x1="20" y1="10" x2="80" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#EDE9FE" />
          <stop offset="1" stopColor="#C4B5FD" />
        </linearGradient>
      </defs>

      {/* الدائرة الخارجية */}
      <circle cx="50" cy="50" r="46" fill="url(#tumBlossomGrad)" />
      <circle cx="50" cy="50" r="46" fill="none" stroke="#FFFFFF" strokeOpacity="0.22" strokeWidth="1.5" />

      {/* البتلات — وسطية مرتفعة + جناحان + بتلتان جانبيتان */}
      <g fill="url(#tumBlossomSoft)">
        {/* البتلة الوسطى */}
        <path d="M50 24 C55.5 33 58 41 58 49 C58 58.5 54.5 64 50 67 C45.5 64 42 58.5 42 49 C42 41 44.5 33 50 24 Z" />
        {/* الجناح الأيمن */}
        <path d="M62 34 C66 43 66.5 52 63 59.5 C60 65.5 55 68.5 50.5 68.5 C53 62 54 54 52.5 46.5 C55 41.5 58 37.5 62 34 Z" fillOpacity="0.85" />
        {/* الجناح الأيسر */}
        <path d="M38 34 C34 43 33.5 52 37 59.5 C40 65.5 45 68.5 49.5 68.5 C47 62 46 54 47.5 46.5 C45 41.5 42 37.5 38 34 Z" fillOpacity="0.85" />
        {/* البتلة الجانبية اليمنى */}
        <path d="M73 47 C73.5 55 71 62 65.5 66.5 C61.5 69.5 57 70.3 53.5 69 C58 64.5 61.5 58.5 63 52 C66.5 49 69.5 47.5 73 47 Z" fillOpacity="0.7" />
        {/* البتلة الجانبية اليسرى */}
        <path d="M27 47 C26.5 55 29 62 34.5 66.5 C38.5 69.5 43 70.3 46.5 69 C42 64.5 38.5 58.5 37 52 C33.5 49 30.5 47.5 27 47 Z" fillOpacity="0.7" />
      </g>

      {/* انعكاس مائي هادئ */}
      <path d="M30 79 Q50 84 70 79" stroke="#FFFFFF" strokeOpacity="0.5" strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/* توافق مع الاستيرادات القائمة — نفس الرمز بلا علم */
export const AlgeriaFlag = CalmBlossom;

/** هيكل تحميل الصفحة: اللوتس النابض + أسطر وهمية متدرجة */
export function ViewSkeleton() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-20 px-4 gap-7">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="relative"
      >
        <div className="absolute inset-0 -m-8 rounded-full bg-primary/10 animate-ping opacity-30" />
        <CalmBlossom size={96} className="drop-shadow-lg animate-pulse" />
      </motion.div>
      <div className="w-full max-w-xs space-y-3" aria-hidden>
        <div className="h-3.5 rounded-full bg-muted animate-pulse" />
        <div className="h-3 rounded-full bg-muted animate-pulse w-4/5 mx-auto [animation-delay:120ms]" />
        <div className="h-3 rounded-full bg-muted animate-pulse w-3/5 mx-auto [animation-delay:240ms]" />
        <div className="grid grid-cols-3 gap-3 pt-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-muted animate-pulse" style={{ animationDelay: `${i * 120}ms` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
