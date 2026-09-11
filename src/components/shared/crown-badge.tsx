"use client";

/**
 * v2.7.0 — تاج التحدي الملكي
 * شارة أنيقة فوق صورة الفائز بالتحدي — تظهر لكل مستخدمي المنصة
 * في دليل الأخصائيين، صفحات المطابقة، الملف العام، ولوحته الخاصة.
 * التاج ذهبي مع توهج ناعم، وموضعه فوق الزاوية اليمنى للصورة.
 */
export function RoyalCrown({ size = 26, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size * 0.72}
      viewBox="0 0 100 72"
      className={className}
      role="img"
      aria-label="winner crown"
    >
      <defs>
        <linearGradient id="crownGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFE082" />
          <stop offset="45%" stopColor="#FFC107" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
      </defs>
      {/* جسم التاج الملكي */}
      <path
        d="M8 62 L4 22 L26 38 L50 8 L74 38 L96 22 L92 62 Z"
        fill="url(#crownGold)"
        stroke="#B45309"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* الجواهر الثلاثة */}
      <circle cx="50" cy="46" r="6.5" fill="#E11D48" stroke="#9F1239" strokeWidth="2" />
      <circle cx="26" cy="50" r="5" fill="#38BDF8" stroke="#0369A1" strokeWidth="2" />
      <circle cx="74" cy="50" r="5" fill="#34D399" stroke="#047857" strokeWidth="2" />
      {/* كرات الرؤوس */}
      <circle cx="4" cy="20" r="5" fill="#FFC107" stroke="#B45309" strokeWidth="2" />
      <circle cx="50" cy="7" r="5.5" fill="#FFC107" stroke="#B45309" strokeWidth="2" />
      <circle cx="96" cy="20" r="5" fill="#FFC107" stroke="#B45309" strokeWidth="2" />
    </svg>
  );
}

/**
 * غلاف الصورة مع التاج — يُغلّف أي Avatar/صورة بتاج ملكي فوقها.
 * الاستعمال: <CrownedAvatar crown><Avatar …/></CrownedAvatar>
 */
export function CrownedAvatar({
  children,
  crownSize = 30,
  className = "",
}: {
  children: React.ReactNode;
  crownSize?: number;
  className?: string;
}) {
  return (
    <div className={`relative inline-block ${className}`}>
      {/* التاج يطفو فوق الصورة */}
      <div className="absolute -top-3.5 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 z-20 drop-shadow-md pointer-events-none">
        <RoyalCrown size={crownSize} className="animate-breathe" />
      </div>
      {children}
    </div>
  );
}
