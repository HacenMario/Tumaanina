"use client";

import { useEffect } from "react";

/* ═ v1.14.0 — الرابط العام للعيادة /clinic/{slug} ═
   صفحة Next حقيقية قابلة للمشاركة (زر النسخ في لوحة العيادة، وروابط
   الإعلانات) — تنقل فوراً إلى المنصة وتفتح صفحة العيادة مباشرة
   عبر الربط العميق ?clinic={slug}. */

export default function ClinicPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  useEffect(() => {
    let slug = "";
    params.then((p) => {
      slug = p.slug || "";
      window.location.replace(`/?clinic=${encodeURIComponent(slug)}`);
    });
  }, [params]);

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center animate-pulse">
        <span className="text-2xl">🏥</span>
      </div>
      <p className="text-lg font-black">جارٍ فتح صفحة العيادة…</p>
      <p className="text-xs text-muted-foreground font-semibold">Opening clinic page — Tumaanina</p>
    </div>
  );
}
