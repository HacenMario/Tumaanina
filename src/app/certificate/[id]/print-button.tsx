"use client";

import { useCallback, useRef, useState } from "react";
import { Printer } from "lucide-react";

/* زر طباعة شهادة الاعتماد — v1.3.0
   ❗ طلب المستخدم: الزر يفتح إعدادات الطباعة في الجهاز (نافذة حوار الطباعة)
   ليختار المستخدم طابعته وإعداداته بحرية، وإن اختار «حفظ كـ PDF» من النافذة
   نفسها فستخرج الشهادة A4 أفقية كاملة بإطار كامل دون مساحات فارغة.
   الآلية: iframe مستقل يُبنى في كل ضغطة ويحمل الشهادة + قواعد @page A4
   margin:0 (بلا أي هوامش) ثم يُستدعى print() — يفتح حوار الطباعة القياسي.
   عند أي فشل نعود للطباعة المباشرة window.print(). */
export function PrintButton({ label }: { label: string }) {
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const printViaIframe = useCallback(() => {
    try {
      const sheet = document.querySelector(".certificate-sheet");
      if (!sheet) throw new Error("certificate-sheet not found");

      /* جمع أنماط الصفحة الحالية (Tailwind + أنماط مضمّنة) لنسخها داخل الإطار */
      const head: string[] = [];
      document.querySelectorAll('link[rel="stylesheet"]').forEach((l) => {
        const href = (l as HTMLLinkElement).href;
        if (href) head.push(`<link rel="stylesheet" href="${href}">`);
      });
      document.querySelectorAll("style").forEach((s) => {
        if (s.textContent) head.push(`<style>${s.textContent}</style>`);
      });
      /* قواعد الطباعة: A4 أفقية بلا أي هوامش — الورقة تملأ الصفحة كاملة
         بإطارها الكامل (border 3px أصفر) من الحافة إلى الحافة */
      head.push(
        `<style>@page{size:A4 landscape;margin:0}html,body{margin:0;padding:0;background:#fff;overflow:hidden}.certificate-sheet{max-width:none!important;border-radius:0!important;box-shadow:none!important;width:100%!important;min-height:100vh;height:100vh;display:flex;flex-direction:column;justify-content:center}.no-print{display:none!important}</style>`
      );

      const frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
      document.body.appendChild(frame);

      const doc = frame.contentDocument;
      if (!doc) throw new Error("iframe document unavailable");
      doc.open();
      doc.write(
        `<!DOCTYPE html><html dir="${document.documentElement.getAttribute("dir") || "rtl"}"><head><meta charset="utf-8"><title>${document.title}</title>${head.join("")}</head><body>${sheet.outerHTML}</body></html>`
      );
      doc.close();

      let fired = false;
      const go = () => {
        if (fired) return;
        fired = true;
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print(); /* ← يفتح حوار طباعة النظام */
        } catch {
          window.print();
        }
        setTimeout(() => frame.remove(), 1500);
      };
      frame.onload = () => setTimeout(go, 150);
      setTimeout(go, 900);
    } catch {
      /* آخر احتياط — حوار الطباعة المباشر */
      window.print();
    }
  }, []);

  const print = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      printViaIframe();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [printViaIframe]);

  return (
    <div className="no-print fixed bottom-5 inset-x-0 z-50 flex justify-center px-4">
      <button
        type="button"
        onClick={() => void print()}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-2xl bg-teal-700 text-white px-7 py-3.5 text-sm font-black shadow-xl hover:bg-teal-600 transition-colors disabled:opacity-70"
      >
        <Printer className="h-4.5 w-4.5" />
        {label}
      </button>
    </div>
  );
}
