"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

/**
 * v2.12.0 — إشعار نجاح خفيف (Toast) يظهر أعلى الشاشة.
 * ─────────────────────────────────────────────────────────────
 * يُستعمل لتأكيد العمليات المهمة: تم تسجيل الدخول بنجاح،
 * تم تسجيل الخروج بنجاح… يُستدعى من أي مكان عبر showAppToast()
 * ولا يحتاج مزوّد سياق — أحداث نافذة فقط.
 */

export function showAppToast(title: string, sub?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("tumaanina-app-toast", { detail: { title, sub } }));
}

export function AppToast() {
  const [toast, setToast] = useState<{ title: string; sub?: string } | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onToast = (e: Event) => {
      const d = (e as CustomEvent).detail as { title: string; sub?: string };
      setToast(d);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setToast(null), 3000);
    };
    window.addEventListener("tumaanina-app-toast", onToast);
    return () => {
      window.removeEventListener("tumaanina-app-toast", onToast);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key="app-toast"
          initial={{ opacity: 0, y: -18, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.97 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="fixed top-20 inset-x-0 z-[85] flex justify-center px-4 pointer-events-none"
          role="status"
          aria-live="polite"
        >
          <div className="gradient-primary text-white rounded-2xl shadow-xl shadow-primary/25 px-5 py-3.5 flex items-center gap-3 max-w-sm">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <div className="min-w-0">
              <div className="font-black text-sm leading-tight">{toast.title}</div>
              {toast.sub && (
                <div className="text-[11px] text-white/85 font-semibold mt-0.5">{toast.sub}</div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
