"use client";

/**
 * v2.14.0 — نظام الثيمات الحقيقي (طلب المستخدم):
 * «ليغير الثيم وليس فقط الوضع النهاري الليلي — ثيمات بعدة لوحات ألوان
 * وكل شيء في المنصة يظهر كما يجب بعد الاختيار».
 * ─────────────────────────────────────────────────────────────
 * الوضع (نهاري/ليلي) يبقى على next-themes كما هو، والثيم = لوحة ألوان
 * (palette) تُطبَّق كسمة data-palette على <html> فتستبدل متغيرات CSS
 * الأساسية في كل مكونات المنصة (أزرار، بطاقات، تدرجات، رسوم…) —
 * لأن كل الألوان تتدفق من متغيرات globals.css حصراً.
 */

export type PaletteId = "atlas" | "atlasgreen" | "ocean" | "forest" | "sunset" | "lavender" | "rose" | "sand";

export interface PaletteMeta {
  id: PaletteId;
  /* لون العيّنة في نافذة الاختيار */
  swatch: string;
  swatch2: string;
}

export const PALETTES: PaletteMeta[] = [
  { id: "atlas", swatch: "oklch(0.56 0.17 293)", swatch2: "oklch(0.66 0.11 262)" },
  /* v1.2.0: الأخضر الأطلسي — الهوية الخضراء الأصلية */
  { id: "atlasgreen", swatch: "oklch(0.52 0.096 163)", swatch2: "oklch(0.6 0.08 150)" },
  { id: "ocean", swatch: "oklch(0.55 0.12 245)", swatch2: "oklch(0.62 0.1 215)" },
  { id: "forest", swatch: "oklch(0.5 0.11 150)", swatch2: "oklch(0.6 0.09 130)" },
  { id: "sunset", swatch: "oklch(0.63 0.16 45)", swatch2: "oklch(0.66 0.14 25)" },
  { id: "lavender", swatch: "oklch(0.56 0.13 295)", swatch2: "oklch(0.62 0.11 265)" },
  { id: "rose", swatch: "oklch(0.6 0.15 15)", swatch2: "oklch(0.66 0.13 355)" },
  { id: "sand", swatch: "oklch(0.55 0.09 70)", swatch2: "oklch(0.62 0.08 95)" },
];

const STORAGE_KEY = "tumaanina-palette";

export function getPalette(): PaletteId {
  if (typeof window === "undefined") return "atlas";
  const v = localStorage.getItem(STORAGE_KEY) as PaletteId | null;
  return v && PALETTES.some((p) => p.id === v) ? v : "atlas";
}

export function setPalette(id: PaletteId) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, id);
  applyPalette(id);
}

/** تطبيق فوري بلا إعادة تحميل — كل المكونات تتبدل عبر متغيرات CSS */
export function applyPalette(id: PaletteId) {
  if (typeof window === "undefined") return;
  if (id === "atlas") delete document.documentElement.dataset.palette;
  else document.documentElement.dataset.palette = id;
}

/** يُستدعى مرة عند إقلاع المنصة (Providers) */
export function initPalette() {
  applyPalette(getPalette());
}

/* سكربت مبكر يُحقن في <head> — يمنع وميض الثيم الافتراضي قبل الإقلاع */
export const PALETTE_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem("tumaanina-palette");if(p&&p!=="atlas"&&/^(atlasgreen|ocean|forest|sunset|lavender|rose|sand)$/.test(p)){document.documentElement.setAttribute("data-palette",p);}}catch(e){}})();`;
