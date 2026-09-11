"use client";

import { motion } from "framer-motion";
import {
  UserRound,
  Flame,
  Compass,
  CalendarCheck,
  MessagesSquare,
  Sprout,
  ShieldCheck,
  HeartHandshake,
  Languages,
  BellRing,
  UsersRound,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * v2.13.0 — صفحة «كيف تعمل المنصة؟»
 * شرح مبسّط لمفهوم المنصة ورحلة المستخدم من أول زيارة حتى التعافي،
 * بست خطوات واضحة + وعود المنصة الأساسية — لكل الأعمار والأعمار الرقمية.
 */

const STEP_ICONS = [UserRound, Flame, Compass, CalendarCheck, MessagesSquare, Sprout];

export function HowItWorksView() {
  const { t, lang } = useI18n();
  const { setView } = useApp();
  const Arrow = lang === "ar" ? ArrowLeft : ArrowRight;

  const steps = [
    { icon: STEP_ICONS[0], title: t.how.s1Title, desc: t.how.s1Desc },
    { icon: STEP_ICONS[1], title: t.how.s2Title, desc: t.how.s2Desc },
    { icon: STEP_ICONS[2], title: t.how.s3Title, desc: t.how.s3Desc },
    { icon: STEP_ICONS[3], title: t.how.s4Title, desc: t.how.s4Desc },
    { icon: STEP_ICONS[4], title: t.how.s5Title, desc: t.how.s5Desc },
    { icon: STEP_ICONS[5], title: t.how.s6Title, desc: t.how.s6Desc },
  ];

  const values = [
    { icon: HeartHandshake, title: t.how.v1, desc: t.how.v1Desc },
    { icon: ShieldCheck, title: t.how.v2, desc: t.how.v2Desc },
    { icon: UsersRound, title: t.how.v3, desc: t.how.v3Desc },
    { icon: Languages, title: t.how.v4, desc: t.how.v4Desc },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 md:py-16">
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-3 mb-10">
        <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
          <Compass className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl md:text-3xl font-black">{t.how.title}</h1>
        <p className="text-muted-foreground leading-relaxed max-w-2xl mx-auto">{t.how.subtitle}</p>
      </motion.div>

      {/* الرحلة في ست خطوات */}
      <h2 className="font-black text-lg mb-4 flex items-center gap-2">
        <span className="h-1.5 w-6 rounded-full gradient-primary inline-block" />
        {t.how.stepsTitle}
      </h2>
      <div className="grid sm:grid-cols-2 gap-4 mb-10">
        {steps.map((s, i) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.4 }}
          >
            <Card className="h-full border-border/70 hover:border-primary/40 transition-colors">
              <CardContent className="p-5 flex items-start gap-3.5">
                <div className="relative shrink-0">
                  <span className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <s.icon className="h-6 w-6 text-primary" />
                  </span>
                  <span className="absolute -top-1.5 -start-1.5 h-6 w-6 rounded-full gradient-primary text-white text-[11px] font-black flex items-center justify-center shadow">
                    {i + 1}
                  </span>
                </div>
                <div className="min-w-0">
                  <h3 className="font-black text-sm mb-1" dir="auto">{s.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed" dir="auto">{s.desc}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* ماذا يحدث بعد الحجز؟ — الإشعارات الفورية */}
      <Card className="border-primary/25 bg-primary/[0.04] mb-10">
        <CardContent className="p-5 flex items-start gap-3.5">
          <span className="h-11 w-11 rounded-2xl gradient-primary text-white flex items-center justify-center shrink-0">
            <BellRing className="h-5.5 w-5.5" />
          </span>
          <div className="min-w-0">
            <h3 className="font-black text-sm mb-1">{t.how.afterTitle}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{t.how.afterDesc}</p>
          </div>
        </CardContent>
      </Card>

      {/* وعدنا لك */}
      <h2 className="font-black text-lg mb-4 flex items-center gap-2">
        <span className="h-1.5 w-6 rounded-full gradient-primary inline-block" />
        {t.how.valuesTitle}
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
        {values.map((v) => (
          <Card key={v.title} className="border-border/70">
            <CardContent className="p-4 text-center space-y-2">
              <span className="h-10 w-10 mx-auto rounded-xl bg-primary/10 flex items-center justify-center">
                <v.icon className="h-5 w-5 text-primary" />
              </span>
              <h3 className="font-black text-xs" dir="auto">{v.title}</h3>
              <p className="text-[10px] text-muted-foreground leading-relaxed" dir="auto">{v.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* أزرار البداية */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button size="lg" className="gradient-primary text-white font-black rounded-xl h-13 px-8" onClick={() => setView("roles")}>
          {t.how.ctaStart}
          <Arrow className="h-5 w-5" />
        </Button>
        <Button size="lg" variant="outline" className="font-black rounded-xl h-13 px-8 border-primary/40" onClick={() => setView("counselors-directory")}>
          <UsersRound className="h-5 w-5" />
          {t.how.ctaDirectory}
        </Button>
      </div>
    </div>
  );
}
