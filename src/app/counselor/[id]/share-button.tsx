"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

/* زر مشاركة/نسخ رابط الملف العام — مكون عميل داخل صفحة سيرفر */
export function ShareButton({ label, copiedLabel }: { label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: document.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* المستخدم ألغى المشاركة */
    }
  };

  return (
    <button
      type="button"
      onClick={() => void share()}
      className="inline-flex items-center gap-2 rounded-xl border border-emerald-600/40 text-emerald-700 dark:text-emerald-300 px-4 py-2.5 text-sm font-bold hover:bg-emerald-600/10 transition-colors"
    >
      {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
      {copied ? copiedLabel : label}
    </button>
  );
}
