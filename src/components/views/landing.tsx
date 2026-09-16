"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  HeartHandshake,
  BadgeCheck,
  Languages,
  MessageSquareText,
  Phone,
  Video,
  Sparkles,
  BellRing,
  Smartphone,
  FileCheck2,
  Timer,
  PhoneCall,
  ArrowLeft,
  ArrowRight,
  Wind,
  Building2,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { LANGUAGES } from "@/lib/constants";
import { BreathingExerciseDialog } from "@/components/shared/breathing-exercise";
import { useApp } from "@/lib/store";
import { LogoMark } from "@/lib/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.55, ease: "easeOut" as const },
};

export function LandingView() {
  const { t, lang } = useI18n();
  const { setView, user } = useApp();
  const Arrow = lang === "ar" ? ArrowLeft : ArrowRight;
  /* v1.13.0: العميل المسجّل يضغط «ابدأ رحلة التعافي» فينتقل مباشرة إلى
     «ما الذي يسكن قلبك اليوم؟» — دون المرور بصفحة «من أنت اليوم؟»
     v1.15.0: المختص المسجّل أيضاً يتخطى «من أنت اليوم» وينتقل للوحته
     مباشرة عند الضغط على زر الحجز (طلب المستخدم) */
  const startJourney = () =>
    setView(
      user?.role === "VICTIM" ? "client-topics" : user?.role === "COUNSELOR" ? "counselor-dashboard" : "roles"
    );
  const [stats, setStats] = useState({ counselors: 0, sessions: 0, victims: 0 });

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  return (
    <div className="overflow-hidden">
      {/* ── Hero ── */}
      <section className="gradient-hero relative">
        <div className="max-w-6xl mx-auto px-4 pt-14 pb-20 md:pt-20 md:pb-28 grid lg:grid-cols-2 gap-10 items-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="space-y-6"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/8 px-4 py-1.5 text-xs sm:text-sm font-semibold text-primary">
              <Sparkles className="h-4 w-4" />
              {t.landing.badge}
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-black leading-[1.15] tracking-tight">
              {t.landing.heroTitle1}
              <br />
              <span className="text-gradient">{t.landing.heroTitle2}</span>
            </h1>
            <p className="text-muted-foreground text-base sm:text-lg leading-relaxed max-w-xl">
              {t.landing.heroSubtitle}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" className="gradient-primary text-white font-bold h-13 px-7 rounded-2xl shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-shadow" onClick={startJourney}>
                {t.landing.ctaPrimary}
                <Arrow className="h-5 w-5" />
              </Button>
              {/* v1.17.0: زر تصفح العيادات المسجلة — بجانب زرّي البداية والانضمام،
                  يوجّه مباشرة إلى دليل العيادات (طلب المستخدم) */}
              <Button size="lg" variant="outline" className="font-bold h-13 px-6 rounded-2xl border-primary/40" onClick={() => setView("clinics-directory")}>
                <Building2 className="h-5 w-5" />
                {t.landing.ctaClinics}
              </Button>
              {/* v2.13.0: المختص المسجّل يتجاوز بوابة الدخول إلى لوحته مباشرة */}
              <Button size="lg" variant="outline" className="font-bold h-13 px-7 rounded-2xl border-primary/40" onClick={() => setView(user?.role === "COUNSELOR" ? "counselor-dashboard" : "counselor-auth")}>
                <HeartHandshake className="h-5 w-5" />
                {user?.role === "COUNSELOR" ? t.roles.counselorBtnLoggedIn : t.landing.ctaSecondary}
              </Button>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 pt-2">
              {[
                { icon: ShieldCheck, label: t.landing.trustAnon },
                { icon: HeartHandshake, label: t.landing.trustFree },
                { icon: BadgeCheck, label: t.landing.trustVerified },
                { icon: Languages, label: t.landing.trustLanguages },
              ].map((c) => (
                <span key={c.label} className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground/80">
                  <c.icon className="h-4 w-4 text-primary" />
                  {c.label}
                </span>
              ))}
            </div>
          </motion.div>

          {/* Visual */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.15, ease: "easeOut" }}
            className="relative hidden sm:flex items-center justify-center"
          >
            <div className="absolute w-72 h-72 md:w-96 md:h-96 rounded-full bg-primary/10 animate-breathe" />
            <div className="absolute w-56 h-56 md:w-72 md:h-72 rounded-full bg-primary/10 animate-breathe [animation-delay:1.2s]" />
            <div className="animate-float relative">
              <LogoMark size={190} className="drop-shadow-2xl" />
            </div>
            <div className="absolute glass rounded-2xl shadow-xl border border-border/60 px-4 py-3 top-6 start-0 flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
              </span>
              <span className="text-xs font-bold">{t.client.availableNow}</span>
            </div>
          </motion.div>
        </div>

        {/* Stats band */}
        <div className="border-t border-border/60 bg-card/60">
          <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { value: stats.counselors, label: t.landing.statsCounselors },
              { value: stats.victims, label: t.landing.statsVictims },
              { value: stats.sessions, label: t.landing.statsSessions },
              { /* v1.22.1: العدد من قائمة اللغات نفسها — كان 6 مُصلّبًا فظلّ يظهر بعد إضافة الإسبانية/الألمانية/الإيطالية */
                value: LANGUAGES.length, label: t.landing.statsLanguages },
              { value: "7/7", label: t.landing.statsAvailability },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-2xl sm:text-3xl font-black text-primary font-mono">{s.value}</div>
                <div className="text-xs sm:text-sm text-muted-foreground font-semibold mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="max-w-6xl mx-auto px-4 py-16 md:py-20">
        <motion.div {...fadeUp} className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-black">{t.landing.howTitle}</h2>
        </motion.div>
        <div className="grid md:grid-cols-3 gap-5">
          {[
            { n: "1", title: t.landing.how1Title, desc: t.landing.how1Desc, icon: ShieldCheck },
            { n: "2", title: t.landing.how2Title, desc: t.landing.how2Desc, icon: BadgeCheck },
            { n: "3", title: t.landing.how3Title, desc: t.landing.how3Desc, icon: Timer },
          ].map((s, i) => (
            <motion.div key={s.n} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.12 }}>
              <Card className="h-full border-border/70 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all">
                <CardContent className="p-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center text-white">
                      <s.icon className="h-6 w-6" />
                    </div>
                    <span className="text-4xl font-black text-primary/15 font-mono">{s.n}</span>
                  </div>
                  <h3 className="font-bold text-lg">{s.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Modes ── */}
      <section className="bg-secondary/40 border-y border-border/60">
        <div className="max-w-6xl mx-auto px-4 py-16 md:py-20">
          <motion.div {...fadeUp} className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-black">{t.landing.modesTitle}</h2>
          </motion.div>
          <div className="grid md:grid-cols-2 gap-5 md:max-w-3xl md:mx-auto">
            {[
              /* v1.5.0: طرق الاستشارة صوتية أو مرئية فقط — البطاقة النصية لم تعد استشارة */
              { icon: Phone, title: t.landing.modeVoiceTitle, desc: t.landing.modeVoiceDesc },
              { icon: Video, title: t.landing.modeVideoTitle, desc: t.landing.modeVideoDesc },
            ].map((m, i) => (
              <motion.div key={m.title} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.12 }}>
                <Card className="h-full group hover:-translate-y-1 transition-transform border-border/70">
                  <CardContent className="p-7 space-y-3 text-center items-center flex flex-col">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors">
                      <m.icon className="h-8 w-8 text-primary group-hover:text-white transition-colors" />
                    </div>
                    <h3 className="font-bold text-lg">{m.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{m.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="max-w-6xl mx-auto px-4 py-16 md:py-20">
        <motion.div {...fadeUp} className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-black">{t.landing.featuresTitle}</h2>
        </motion.div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { icon: BellRing, title: t.landing.feat1Title, desc: t.landing.feat1Desc },
            { icon: FileCheck2, title: t.landing.feat2Title, desc: t.landing.feat2Desc },
            { icon: ShieldCheck, title: t.landing.feat3Title, desc: t.landing.feat3Desc },
            { icon: Timer, title: t.landing.feat4Title, desc: t.landing.feat4Desc },
            { icon: Smartphone, title: t.landing.feat5Title, desc: t.landing.feat5Desc },
            { icon: Languages, title: t.landing.feat6Title, desc: t.landing.feat6Desc },
          ].map((f, i) => (
            <motion.div key={f.title} {...fadeUp} transition={{ ...fadeUp.transition, delay: (i % 3) * 0.1 }}>
              <Card className="h-full border-border/70">
                <CardContent className="p-6 flex gap-4 items-start">
                  <div className="w-11 h-11 shrink-0 rounded-xl bg-accent flex items-center justify-center">
                    <f.icon className="h-5.5 w-5.5 text-primary" />
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="font-bold">{f.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Emergency ── */}
      <section className="max-w-6xl mx-auto px-4 pb-16">
        <motion.div {...fadeUp}>
          <Card className="border-destructive/40 bg-destructive/5 overflow-hidden">
            <BreathingCard />

                    <CardContent className="p-7 flex flex-col md:flex-row items-start md:items-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-destructive/15 flex items-center justify-center shrink-0">
                <PhoneCall className="h-7 w-7 text-destructive" />
              </div>
              <div className="flex-1 space-y-1.5">
                <h3 className="font-black text-lg text-destructive">{t.landing.emergencyTitle}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{t.landing.emergencyText}</p>
              </div>
              <div className="flex gap-3">
                <a href="tel:14" className="inline-flex items-center gap-2 rounded-xl bg-destructive text-white px-5 py-3 font-bold text-sm hover:bg-destructive/90 transition-colors shadow-lg shadow-destructive/25">
                  <PhoneCall className="h-4 w-4" />
                  {t.landing.emergencyCall} · 14
                </a>
                <a href="tel:115" className="inline-flex items-center gap-2 rounded-xl border border-destructive/40 text-destructive px-5 py-3 font-bold text-sm hover:bg-destructive/10 transition-colors">
                  {t.landing.emergencyCall2} · 115
                </a>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </section>

      {/* ── Final CTA ── */}
      <section className="gradient-primary">
        <div className="max-w-6xl mx-auto px-4 py-16 text-center text-white space-y-5">
          <motion.h2 {...fadeUp} className="text-3xl md:text-4xl font-black leading-snug">
            {t.landing.finalTitle}
          </motion.h2>
          <motion.p {...fadeUp} className="text-white/85 max-w-2xl mx-auto leading-relaxed">
            {t.landing.finalText}
          </motion.p>
          <motion.div {...fadeUp}>
            <Button size="lg" variant="secondary" className="h-13 px-8 rounded-2xl font-black text-base bg-white text-violet-700 dark:text-violet-300 hover:bg-white/90 shadow-xl" onClick={startJourney}>
              {t.landing.finalCta}
              <Arrow className="h-5 w-5" />
            </Button>
          </motion.div>
        </div>
      </section>
    </div>
  );
}

/* v2.9.0: بطاقة تمرين تهدئة النفس — زر بارز في الصفحة الرئيسية */
function BreathingCard() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <Card className="border-primary/30 bg-gradient-to-b from-primary/[0.08] to-transparent">
      <CardContent className="p-6 sm:p-7 flex flex-col sm:flex-row items-center gap-5 text-center sm:text-start">
        <div className="w-16 h-16 rounded-2xl gradient-primary opacity-90 flex items-center justify-center shrink-0">
          <Wind className="h-8 w-8 text-white" />
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <h3 className="font-black text-lg">{t.breathing.openBtn}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{t.breathing.subtitle}</p>
        </div>
        <Button size="lg" className="gradient-primary text-white font-black rounded-xl h-12 px-7 shrink-0" onClick={() => setOpen(true)}>
          {t.breathing.start}
        </Button>
        <BreathingExerciseDialog open={open} onOpenChange={setOpen} />
      </CardContent>
    </Card>
  );
}
