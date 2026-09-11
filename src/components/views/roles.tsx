"use client";

import { motion } from "framer-motion";
import { HeartHandshake, UserRound, ArrowLeft, ArrowRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function RolesView() {
  const { t, lang } = useI18n();
  const { setView, user } = useApp();
  const Arrow = lang === "ar" ? ArrowLeft : ArrowRight;

  /* v2.13.0: من يسجّل الدخول بحسابه يتجاوز مرحلة إنشاء الحساب/تسجيل الدخول
     مباشرة إلى الخطوة التالية — العميل إلى اختيار الموضوع، والمختص إلى لوحته */
  const roles = [
    {
      icon: UserRound,
      title: t.roles.victimTitle,
      desc: t.roles.victimDesc,
      btn: user?.role === "VICTIM" ? t.roles.victimBtnLoggedIn : t.roles.victimBtn,
      action: () => setView(user?.role === "VICTIM" ? "client-topics" : "client-start"),
      highlight: true,
    },
    {
      icon: HeartHandshake,
      title: t.roles.counselorTitle,
      desc: t.roles.counselorDesc,
      btn: user?.role === "COUNSELOR" ? t.roles.counselorBtnLoggedIn : t.roles.counselorBtn,
      action: () => setView(user?.role === "COUNSELOR" ? "counselor-dashboard" : "counselor-auth"),
      highlight: false,
    },
    /* دخول الإدارة فُصل إلى صفحة خاصة مستقلة (من الفوتر/القائمة) حفاظاً على ترتيب الواجهة */
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-14 md:py-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12 space-y-3"
      >
        <h1 className="text-3xl md:text-4xl font-black">{t.roles.title}</h1>
        <p className="text-muted-foreground">{t.roles.subtitle}</p>
      </motion.div>

      <div className="grid md:grid-cols-2 gap-5 max-w-3xl mx-auto">
        {roles.map((r, i) => (
          <motion.div
            key={r.title}
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.13, duration: 0.5 }}
          >
            <Card
              className={`h-full transition-all hover:-translate-y-1.5 hover:shadow-xl ${
                r.highlight
                  ? "border-primary/50 shadow-lg shadow-primary/10 bg-gradient-to-b from-primary/5 to-transparent"
                  : "border-border/70"
              }`}
            >
              <CardContent className="p-7 flex flex-col items-center text-center gap-4 h-full">
                <div
                  className={`w-16 h-16 rounded-full flex items-center justify-center ${
                    r.highlight ? "gradient-primary text-white" : "bg-primary/10 text-primary"
                  }`}
                >
                  <r.icon className="h-8 w-8" />
                </div>
                <h2 className="font-black text-xl">{r.title}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed flex-1">{r.desc}</p>
                <Button
                  className={`w-full rounded-xl font-bold ${r.highlight ? "gradient-primary text-white" : ""}`}
                  variant={r.highlight ? "default" : "outline"}
                  onClick={r.action}
                >
                  {r.btn}
                  <Arrow className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
