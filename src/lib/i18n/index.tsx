"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ar, type Dict } from "./ar";
import { fr } from "./fr";
import { en } from "./en";
import { tr } from "./tr";
import { ru } from "./ru";
import { zh } from "./zh";
import type { AppLang } from "@/lib/constants";
import { useApp } from "@/lib/store";

export const dictionaries: Record<AppLang, Dict> = { ar, fr, en, tr, ru, zh };

export const LANG_META: Record<AppLang, { label: string; dir: "rtl" | "ltr"; flag: string }> = {
  ar: { label: "العربية", dir: "rtl", flag: "🇩🇿" },
  fr: { label: "Français", dir: "ltr", flag: "🇫🇷" },
  en: { label: "English", dir: "ltr", flag: "🇬🇧" },
  tr: { label: "Türkçe", dir: "ltr", flag: "🇹🇷" },
  ru: { label: "Русский", dir: "ltr", flag: "🇷🇺" },
  zh: { label: "中文", dir: "ltr", flag: "🇨🇳" },
};

interface I18nCtx {
  lang: AppLang;
  dir: "rtl" | "ltr";
  t: Dict;
  setLang: (l: AppLang) => void;
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<AppLang>("ar");

  useEffect(() => {
    const timer = setTimeout(() => {
      const saved = (typeof window !== "undefined" && localStorage.getItem("tumaanina-lang")) as AppLang | null;
      if (saved && saved in dictionaries) setLangState(saved);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const setLang = useCallback((l: AppLang) => {
    setLangState(l);
    localStorage.setItem("tumaanina-lang", l);
    /* v1.6.0: مزامنة اللغة مع الحساب — فتُرسل الإشعارات الفورية القادمة
       بلغة المستخدم الحالية (طلب المستخدم: ترجمة كل الإشعارات للغات الست) */
    try {
      const u = useApp.getState().user;
      if (u?.id) {
        void fetch("/api/user-language", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: u.id, language: l }),
        }).catch(() => {});
      }
    } catch {
      /* المتجر غير جاهز بعد — لا شيء */
    }
  }, []);

  const dir = LANG_META[lang].dir;

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const value = useMemo<I18nCtx>(() => ({ lang, dir, t: dictionaries[lang], setLang }), [lang, dir, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
