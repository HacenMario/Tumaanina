"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { HeartHandshake } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { AppLang } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { BackButton } from "@/components/shared/back-button";

interface GratitudeContent {
  id: string;
  textAr: string;
  textFr: string;
  textEn: string;
  symbol: string;
  active: boolean;
}

/* مواقع ثابتة بعناية للرموز الطافية — حول النص وليس فوقه (pointer-events-none + شفافية عالية) */
const FLOATERS = [
  { top: "8%", start: "6%", size: "text-4xl", delay: "0s", dur: "7s" },
  { top: "16%", start: "82%", size: "text-3xl", delay: "1.2s", dur: "8s" },
  { top: "30%", start: "14%", size: "text-2xl", delay: "2.1s", dur: "9s" },
  { top: "34%", start: "88%", size: "text-4xl", delay: "0.6s", dur: "7.5s" },
  { top: "52%", start: "4%", size: "text-3xl", delay: "1.8s", dur: "8.5s" },
  { top: "58%", start: "78%", size: "text-2xl", delay: "0.3s", dur: "7.2s" },
  { top: "72%", start: "10%", size: "text-4xl", delay: "2.6s", dur: "9.5s" },
  { top: "78%", start: "86%", size: "text-3xl", delay: "1s", dur: "8s" },
  { top: "90%", start: "22%", size: "text-2xl", delay: "3s", dur: "7.8s" },
  { top: "92%", start: "70%", size: "text-4xl", delay: "0.9s", dur: "8.8s" },
  { top: "6%", start: "46%", size: "text-2xl", delay: "2.3s", dur: "9.2s" },
  { top: "66%", start: "40%", size: "text-2xl", delay: "1.5s", dur: "7.6s" },
];

function textFor(c: GratitudeContent, lang: AppLang): string {
  if (lang === "fr") return c.textFr || c.textAr;
  if (lang === "en") return c.textEn || c.textAr;
  return c.textAr;
}

/**
 * صفحة الشكر والعرفان — متاحة لكل الحسابات إلى جانب الصفحات الأخرى:
 * نص تُديره الإدارة (ثلاث لغات) وررموز صغيرة تطفو بهدوء في الخلفية
 * بعيداً عن النص تماماً (شفافية منخفضة + pointer-events none).
 */
export function GratitudeView() {
  const { t, lang } = useI18n();
  const [content, setContent] = useState<GratitudeContent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/gratitude", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setContent(d.content || null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const symbol = content?.symbol || "❤️";

  return (
    <div className="relative overflow-hidden min-h-[70vh]">
      {/* الخلفية الطافية — خلف النص، شفافة، غير تفاعلية */}
      <div aria-hidden className="pointer-events-none select-none absolute inset-0 -z-0 overflow-hidden">
        {FLOATERS.map((f, i) => (
          <span
            key={i}
            className={`absolute ${f.size} opacity-[0.10] animate-float`}
            style={{ top: f.top, insetInlineStart: f.start, animationDelay: f.delay, animationDuration: f.dur }}
          >
            {symbol}
          </span>
        ))}
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-4 py-12 md:py-16">
        <BackButton />
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <HeartHandshake className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-gradient">{t.gratitude.title}</h1>
            <p className="text-muted-foreground font-semibold">{t.gratitude.subtitle}</p>
          </div>

          {loading ? (
            <Card className="border-border/60">
              <CardContent className="p-10 space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-4 rounded-full bg-muted animate-pulse" style={{ width: `${90 - i * 12}%` }} />
                ))}
              </CardContent>
            </Card>
          ) : content && content.active ? (
            <Card className="border-primary/25 shadow-xl shadow-primary/5">
              <CardContent className="p-7 md:p-10">
                <p className="whitespace-pre-line text-base md:text-lg leading-loose font-semibold text-foreground/90" dir="auto">
                  {textFor(content, lang)}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-10 text-center text-sm font-semibold text-muted-foreground">
                {t.gratitude.disabled}
              </CardContent>
            </Card>
          )}
        </motion.div>
      </div>
    </div>
  );
}
