"use client";

/**
 * v2.14.0 — الثيمات الحقيقية (لوحات ألوان متعددة)
 * ─────────────────────────────────────────────────
 * المنصة لم تعد تقتصر على الوضع النهاري/الليلي: لكل ثيم لوحة ألوان كاملة
 * (نهارية وليلية) تُطبَّق عبر data-theme على عنصر html، فيتغيّر كل شيء:
 * الألوان الأساسية، الأزرار، التدرّجات، الرسوم البيانية، الخلفيات…
 *
 * التخزين: localStorage "tumaanina-palette" — يبقى الاختيار عبر الزيارات.
 */

export type PaletteKey = "atlas" | "ocean" | "sunset" | "lavender" | "rose" | "forest";

export interface PaletteMeta {
  key: PaletteKey;
  /* ألوان المعاينة في محدد الثيمات (نهاري/ليلي/نقطة رئيسية) */
  swatch: [string, string, string];
}

export const PALETTES: PaletteMeta[] = [
  /* أطلس = اللوحة الافتراضية (أخضر أطلس + رملي دافئ) — بلا data-theme */
  { key: "atlas", swatch: ["oklch(0.56 0.17 293)", "oklch(0.66 0.11 262)", "oklch(0.72 0.14 90)"] },
  { key: "ocean", swatch: ["oklch(0.55 0.13 240)", "oklch(0.68 0.11 200)", "oklch(0.72 0.13 90)"] },
  { key: "sunset", swatch: ["oklch(0.60 0.15 50)", "oklch(0.70 0.12 85)", "oklch(0.68 0.11 165)"] },
  { key: "lavender", swatch: ["oklch(0.56 0.13 295)", "oklch(0.66 0.11 265)", "oklch(0.72 0.12 340)"] },
  { key: "rose", swatch: ["oklch(0.60 0.15 10)", "oklch(0.70 0.12 350)", "oklch(0.70 0.12 60)"] },
  { key: "forest", swatch: ["oklch(0.50 0.11 150)", "oklch(0.62 0.10 120)", "oklch(0.68 0.12 95)"] },
];

const STORAGE_KEY = "tumaanina-palette";

export function isPaletteKey(v: unknown): v is PaletteKey {
  return typeof v === "string" && PALETTES.some((p) => p.key === v);
}

export function getStoredPalette(): PaletteKey {
  if (typeof window === "undefined") return "atlas";
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isPaletteKey(v) ? v : "atlas";
  } catch {
    return "atlas";
  }
}

/** تطبيق الثيم على عنصر html — الأطلس الافتراضي يُزيل data-theme كلياً */
export function applyPalette(p: PaletteKey) {
  if (typeof document === "undefined") return;
  if (p === "atlas") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", p);
}

export function setStoredPalette(p: PaletteKey) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, p);
  } catch {
    /* تجاهل */
  }
  applyPalette(p);
}
