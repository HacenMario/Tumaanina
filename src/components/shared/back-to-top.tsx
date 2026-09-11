"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

/** زر العودة إلى الأعلى — يظهر في كل الصفحات بعد التمرير */
export function BackToTop() {
  const { t } = useI18n();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 350);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <Button
      size="icon"
      aria-label={t.common.backToTop}
      title={t.common.backToTop}
      className={`fixed bottom-5 end-5 z-50 rounded-full gradient-primary text-white shadow-lg shadow-primary/30 transition-all duration-300 ${
        show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      }`}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
    >
      <ArrowUp className="h-5 w-5" />
    </Button>
  );
}
