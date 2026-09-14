import { cn } from "@/lib/utils";
import { AlgeriaFlag } from "@/components/shared/algeria-flag";

/**
 * شعار "طمأنينة" — زهرة اللوتس الهادئة داخل دائرة بنفسجية.
 * رمز النسخة التجارية v1.0.0 — SVG قابل للتحجيم لكل الأحجام.
 */
export function LogoMark({
  className,
  size = 40,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      role="img"
      aria-label="Tumaanina logo"
    >
      <defs>
        <linearGradient id="tumGrad" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8B5CF6" />
          <stop offset="0.55" stopColor="#7C3AED" />
          <stop offset="1" stopColor="#5B21B6" />
        </linearGradient>
        <linearGradient id="tumGradSoft" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#EDE9FE" />
          <stop offset="1" stopColor="#C4B5FD" />
        </linearGradient>
      </defs>

      {/* الدائرة الخارجية */}
      <circle cx="32" cy="32" r="30" fill="url(#tumGrad)" />
      <circle cx="32" cy="32" r="30" stroke="#FFFFFF" strokeOpacity="0.22" strokeWidth="1.5" />

      {/* بتلات اللوتس */}
      <g fill="url(#tumGradSoft)">
        {/* البتلة الوسطى */}
        <path d="M32 14 C35 20.5 36.6 25.6 36.6 30.6 C36.6 36.6 34.5 40.1 32 42 C29.5 40.1 27.4 36.6 27.4 30.6 C27.4 25.6 29 20.5 32 14 Z" />
        {/* الجناح الأيمن */}
        <path d="M39.7 21.9 C42.2 27.6 42.5 33.3 40.5 38.1 C38.6 41.9 35.4 43.8 32.6 43.8 C34.2 39.7 34.8 34.5 33.8 29.7 C35.4 26.5 37.3 23.9 39.7 21.9 Z" fillOpacity="0.85" />
        {/* الجناح الأيسر */}
        <path d="M24.3 21.9 C21.8 27.6 21.5 33.3 23.5 38.1 C25.4 41.9 28.6 43.8 31.4 43.8 C29.8 39.7 29.2 34.5 30.2 29.7 C28.6 26.5 26.7 23.9 24.3 21.9 Z" fillOpacity="0.85" />
        {/* البتلة الجانبية اليمنى */}
        <path d="M46.6 30 C46.9 35.1 45.3 39.5 41.8 42.4 C39.3 44.3 36.4 44.8 34.2 44 C37.1 41.1 39.3 37.3 40.3 33.1 C42.5 31.2 44.4 30.2 46.6 30 Z" fillOpacity="0.7" />
        {/* البتلة الجانبية اليسرى */}
        <path d="M17.4 30 C17.1 35.1 18.7 39.5 22.2 42.4 C24.7 44.3 27.6 44.8 29.8 44 C26.9 41.1 24.7 37.3 23.7 33.1 C21.5 31.2 19.6 30.2 17.4 30 Z" fillOpacity="0.7" />
      </g>

      {/* انعكاس مائي هادئ */}
      <path d="M19.2 50.5 Q32 53.2 44.8 50.5" stroke="#FFFFFF" strokeOpacity="0.5" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function LogoFull({
  className,
  lang = "ar",
  compact = false,
}: {
  className?: string;
  lang?: string;
  compact?: boolean;
}) {
  const names: Record<string, { main: string; sub: string }> = {
    ar: { main: "طمأنينة", sub: "استشارات نفسية احترافية عبر الإنترنت" },
    fr: { main: "Tumaanina", sub: "Consultations psychologiques en ligne" },
    en: { main: "Tumaanina", sub: "Professional online consultations" },
    tr: { main: "Tumaanina", sub: "Çevrimiçi profesyonel danışmanlık" },
    ru: { main: "Tumaanina", sub: "Профессиональные онлайн-консультации" },
    zh: { main: "Tumaanina", sub: "专业在线心理咨询" },
  };
  const n = names[lang] ?? names.ar;
  return (
    <div className={cn("flex items-center gap-2.5 min-w-0", className)}>
      <LogoMark size={compact ? 34 : 42} />
      {/* النص لا يلتف أبداً على عدة أسطر في الهواتف — يُقصّ بسطر واحد،
          والوصف الفرعي يظهر على الشاشات المتوسطة فأعلى فقط */}
      <div className="flex flex-col leading-tight min-w-0">
        <span className="flex items-center gap-1.5 min-w-0">
          <span
            className={cn(
              "font-extrabold tracking-tight bg-gradient-to-r from-violet-600 via-purple-600 to-violet-700 dark:from-violet-400 dark:via-purple-300 dark:to-violet-400 bg-clip-text text-transparent whitespace-nowrap overflow-hidden text-ellipsis max-w-[33vw] sm:max-w-[40vw] md:max-w-none",
              lang === "ar" ? "text-base sm:text-lg" : "text-sm sm:text-base"
            )}
          >
            {n.main}
          </span>
          {/* v1.16.0: علم الجزائر الرسمي بجانب اسم المنصة في كل مكان */}
          <AlgeriaFlag size={compact ? 17 : 21} className="shrink-0" />
        </span>
        {!compact && (
          <span className="hidden md:block text-[10px] sm:text-[11px] text-muted-foreground font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-[46vw] md:max-w-none">
            {n.sub}
          </span>
        )}
      </div>
    </div>
  );
}
