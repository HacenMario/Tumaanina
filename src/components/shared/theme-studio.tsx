"use client";

/**
 * v2.14.0 — نافذة «المظهر والثيمات» (طلب المستخدم):
 * زر واحد في القائمة الجانبية والهيدر يفتح هذه النافذة:
 *  - اختيار الثيم: 7 لوحات ألوان كاملة تتغير بها كل ألوان المنصة.
 *  - اختيار الوضع: نهاري / ليلي.
 * تُفتح عبر الحدث العام "open-theme-studio" من أي مكان.
 */
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Check, Moon, Palette, Sun } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { PALETTES, getPalette, setPalette, type PaletteId } from "@/lib/themes";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function ThemeStudio() {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [palette, setPaletteState] = useState<PaletteId>("atlas");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setPaletteState(getPalette());
    const handler = () => setOpen(true);
    window.addEventListener("open-theme-studio", handler);
    return () => window.removeEventListener("open-theme-studio", handler);
  }, []);

  const choose = (id: PaletteId) => {
    setPalette(id);
    setPaletteState(id);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-start flex items-center gap-2 text-base">
            <Palette className="h-4.5 w-4.5 text-primary" />
            {t.themes.title}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs font-bold text-muted-foreground -mt-1">{t.themes.subtitle}</p>

        {/* الوضع: نهاري / ليلي */}
        <div className="space-y-2">
          <p className="text-xs font-black text-muted-foreground">{t.themes.mode}</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border-2 py-2.5 text-sm font-bold transition-all",
                mounted && theme !== "dark"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:border-primary/40"
              )}
            >
              <Sun className="h-4 w-4" />
              {t.themes.light}
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border-2 py-2.5 text-sm font-bold transition-all",
                mounted && theme === "dark"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:border-primary/40"
              )}
            >
              <Moon className="h-4 w-4" />
              {t.themes.dark}
            </button>
          </div>
        </div>

        {/* الثيمات: لوحات الألوان */}
        <div className="space-y-2">
          <p className="text-xs font-black text-muted-foreground">{t.themes.palette}</p>
          <div className="grid grid-cols-2 gap-2">
            {PALETTES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => choose(p.id)}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-start transition-all",
                  palette === p.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"
                )}
                aria-pressed={palette === p.id}
              >
                <span
                  className="h-7 w-7 shrink-0 rounded-full ring-2 ring-border shadow-inner"
                  style={{ background: `linear-gradient(135deg, ${p.swatch}, ${p.swatch2})` }}
                  aria-hidden="true"
                />
                <span className="flex-1 min-w-0 text-sm font-bold truncate">{t.themes.list[p.id]}</span>
                {palette === p.id && <Check className="h-4 w-4 text-primary shrink-0" />}
              </button>
            ))}
          </div>
        </div>

        <p className="text-[11px] font-semibold text-muted-foreground leading-relaxed">{t.themes.note}</p>
      </DialogContent>
    </Dialog>
  );
}

/** أداة فتح النافذة من أي مكان */
export function openThemeStudio() {
  window.dispatchEvent(new CustomEvent("open-theme-studio"));
}
