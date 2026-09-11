"use client";

import { useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { I18nProvider } from "@/lib/i18n";
import { registerServiceWorker, initInstallPrompt } from "@/lib/push-client";
import { initPalette } from "@/lib/themes";
import { QuickHideOverlay } from "@/components/shared/quick-hide";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // service worker + install prompt
    registerServiceWorker();
    initInstallPrompt();
    /* v2.14.0: تفعيل الثيم المحفوظ بعد الإقلاع (السكربت المبكر في layout يغطي الأول) */
    initPalette();
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <I18nProvider>{children}</I18nProvider>
      {/* الإخفاء السريع — فوق كل شيء، خارج سياق اللغة والمظهر ليبدو حاسبة محايدة */}
      <QuickHideOverlay />
    </ThemeProvider>
  );
}
