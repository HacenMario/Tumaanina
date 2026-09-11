"use client";

/**
 * v2.9.0 — صفحة الدعاء — v2.10.0 جدارية نقية بلا أزرار.
 * أطلب من كل من أعجب بالصفحة أو أفادته أن يدعي لأمي الحبيبة بالشفاء
 * العاجل، وأن يفرج كرب أخي رفيق، وأن يحفظ أبي وكل والدينا…
 * الصفحة تحفظ الدعاء في جدارية أنيقة فقط — بلا عدّاد ولا نسخ ولا مشاركة
 * (نزع «آمين» وعبارة الأجر وزر «نسخ / مشاركة رابط ملفي العام» بطلب المستخدم).
 * v2.14.0: الأيقونة 🤲 يدان مرفوعتين للسماء — كما في تطبيقات التواصل
 * (بطلب صريح من المستخدم بدل أيقونة القلب).
 */
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { BackButton } from "@/components/shared/back-button";

export function DuaView() {
  const { t, lang } = useI18n();

  const isAr = lang === "ar";

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 md:py-14">
      <BackButton />
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-full bg-amber-400/15 flex items-center justify-center">
            <span className="text-4xl leading-none select-none" role="img" aria-label="dúa" style={{ filter: "saturate(1.15)" }}>
              🤲
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black">{t.dua.title}</h1>
          <p className="text-muted-foreground leading-relaxed max-w-lg mx-auto">{t.dua.subtitle}</p>
        </div>

        <Card className="border-amber-400/40 bg-gradient-to-b from-amber-400/[0.07] to-transparent overflow-hidden relative">
          {/* زخرفة إسلامية خفيفة في الزوايا */}
          <div className="absolute top-0 start-0 w-14 h-14 border-s-4 border-t-4 border-amber-400/30 rounded-ss-3xl" aria-hidden="true" />
          <div className="absolute bottom-0 end-0 w-14 h-14 border-e-4 border-b-4 border-amber-400/30 rounded-ee-3xl" aria-hidden="true" />
          <CardContent className="p-6 sm:p-8 space-y-5">
            <p className="font-black text-base text-amber-700 dark:text-amber-400 text-center" dir="auto">
              {t.dua.intro}
            </p>
            <ul className="space-y-3">
              {t.dua.items.map((item, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.08 * i }}
                  className="flex items-start gap-3 rounded-xl bg-card border border-border/70 px-4 py-3"
                >
                  <span className="shrink-0 h-7 w-7 rounded-full bg-amber-400/15 text-amber-600 dark:text-amber-400 text-xs font-black flex items-center justify-center">
                    {i + 1}
                  </span>
                  <p className="text-sm font-semibold leading-relaxed flex-1" dir="auto">
                    {item}
                  </p>
                </motion.li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {!isAr && (
          <p className="text-[11px] font-semibold text-muted-foreground text-center leading-relaxed" dir="rtl">
            الدعاء الأصلي بالعربية — والدعاء بمحبتها وترجمتها مقبول بإذن الله
          </p>
        )}
      </motion.div>
    </div>
  );
}
