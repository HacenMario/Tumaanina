"use client";

/**
 * v2.11.0 — تمرين تهدئة النفس 4-4-6 بمحرك زمني دقيق (الحل النهائي)
 * ─────────────────────────────────────────────────────────────
 * المشكلة السابقة: المؤقّت القديم كان يدير الطورات بتحديثات state متداخلة
 * (setState داخل updater) فتتشوّه العدّادات وتتسارع الدورات وينتهي التمرين
 * قبل الوقت، كما كان عدّاد الوقت الإجمالي ينقص فقط عند انتقال الطورات
 * لا كل ثانية.
 *
 * الحل: محرك يعتمد على ساعة الحائط (Date.now) وليس عدّ الفِترات:
 *   • نُخزّن لحظة البدء والمدة الإجمالية بالمللي ثانية فقط.
 *   • نبض كل 200ms يقرأ الوقت المنقضي الحقيقي ويشتقّ منه:
 *       رقم الدورة، الطور الحالي (شهيق 4ث / حبس 4ث / زفير 6ث)،
 *       والثواني المتبقية للطور = ceil(نهاية الطور - المنقضي).
 *   • النتيجة: كل طور يدوم ثوانيه الحقيقية بالضبط (4/4/6) والدورة 14
 *     ثانية بالضبط، والمجموع = 3:02 أو 4:54 دقيقة مهما كان أداء الجهاز
 *     أو تجميد المتصفح للفِترات — لا تسارع ولا انحراف ممكن.
 *
 * خطوات التطبيق كما وردت من المستخدم حرفياً (مترجمة لكل اللغات):
 *   1. الشهيق (4 ثوانٍ): نفس عميق وبطيء من الأنف يملأ البطن بهدوء
 *   2. حبس النفس (4 ثوانٍ): الاحتفاظ بالهواء دون توتر
 *   3. الزفير (6 ثوانٍ): إخراج الهواء ببطء شديد كأنك تنفخ في شمعة
 *   4. التكرار من 3 إلى 5 دقائق حتى تهدأ ضربات القلب
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Wind, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Phase = "in" | "hold" | "out";
const PHASES: { key: Phase; seconds: number }[] = [
  { key: "in", seconds: 4 },
  { key: "hold", seconds: 4 },
  { key: "out", seconds: 6 },
];
const CYCLE_SECONDS = PHASES.reduce((s, p) => s + p.seconds, 0); /* 14ث بالضبط */
const DURATIONS = [
  { minutes: 3, cycles: 13 }, /* 13×14 = 182ث = 3:02 */
  { minutes: 5, cycles: 21 }, /* 21×14 = 294ث = 4:54 */
];

/** اشتقاق موضع الدورة من الوقت المنقضي — دالة نقية تُحسب من ساعة الحائط */
function positionOf(elapsedSec: number) {
  const inSec = PHASES[0].seconds;
  const holdSec = PHASES[1].seconds;
  const pos = elapsedSec % CYCLE_SECONDS;
  if (pos < inSec) return { phaseIdx: 0, phaseElapsed: pos };
  if (pos < inSec + holdSec) return { phaseIdx: 1, phaseElapsed: pos - inSec };
  return { phaseIdx: 2, phaseElapsed: pos - inSec - holdSec };
}

export function BreathingExerciseDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  /* run = جلسة جارية: لحظة البدء (epoch ms) + المدة الإجمالية بالثواني */
  const [run, setRun] = useState<{ startAt: number; total: number; cycles: number } | null>(null);
  const [now, setNow] = useState(0); /* نبض ساعة الحائط */
  const [finished, setFinished] = useState(false);
  const rafRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runRef = useRef<{ startAt: number; total: number } | null>(null);

  const stop = useCallback(() => {
    setRun(null);
    runRef.current = null;
    if (rafRef.current) clearInterval(rafRef.current);
    rafRef.current = null;
  }, []);

  const reset = useCallback(() => {
    stop();
    setFinished(false);
  }, [stop]);

  const start = useCallback((cycles: number) => {
    if (rafRef.current) clearInterval(rafRef.current);
    setFinished(false);
    const session = { startAt: Date.now(), total: cycles * CYCLE_SECONDS };
    runRef.current = session;
    setNow(session.startAt);
    setRun({ ...session, cycles });
    /* نبض 200ms — قراءة الوقت الحقيقي من ساعة الحائط لا عدّ فِترات،
       فلا تسارع ولا انحراف مهما أداء الجهاز أو تجميد المتصفح للفِترات */
    rafRef.current = setInterval(() => {
      const t0 = Date.now();
      const s = runRef.current;
      if (!s) return;
      if (t0 - s.startAt >= s.total * 1000) {
        /* انتهى الوقت الحقيقي المطلوب بالضبط */
        clearInterval(rafRef.current!);
        rafRef.current = null;
        runRef.current = null;
        setRun(null);
        setFinished(true);
        return;
      }
      setNow(t0);
    }, 200);
  }, []);

  useEffect(() => {
    if (open) reset();
    else stop();
  }, [open, reset, stop]);

  useEffect(
    () => () => {
      if (rafRef.current) clearInterval(rafRef.current);
    },
    []
  );

  /* ─── الاشتقاقات من ساعة الحائط ─── */
  const elapsedSec = run ? Math.max(0, (now - run.startAt) / 1000) : 0;
  const isFinished = run ? elapsedSec >= run.total : false;

  const cycle = run ? Math.min(run.cycles, Math.floor(elapsedSec / CYCLE_SECONDS) + 1) : 1;
  const { phaseIdx, phaseElapsed } = positionOf(run && run.total > 0 ? Math.min(elapsedSec, run.total - 0.001) : 0);
  const phase = PHASES[phaseIdx];
  const phaseRemaining = Math.max(1, Math.ceil(phase.seconds - phaseElapsed));
  const totalLeft = run ? Math.max(0, Math.ceil(run.total - elapsedSec)) : 0;

  const phaseLabel = phase.key === "in" ? t.breathing.phaseIn : phase.key === "hold" ? t.breathing.phaseHold : t.breathing.phaseOut;
  const phaseHint = phase.key === "in" ? t.breathing.inHint : phase.key === "hold" ? t.breathing.holdHint : t.breathing.outHint;
  const scale = phase.key === "in" ? 1 : phase.key === "hold" ? 1 : 0.55;
  const mm = String(Math.floor(totalLeft / 60)).padStart(1, "0");
  const ss = String(totalLeft % 60).padStart(2, "0");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-start flex items-center gap-2">
            <Wind className="h-5 w-5 text-primary" />
            {t.breathing.title}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs font-semibold text-muted-foreground -mt-1 leading-relaxed">{t.breathing.subtitle}</p>

        {!run && !finished && (
          /* خطوات التطبيق الأربع — كما هي بالحرف مع ترجمة تفي بالمعنى */
          <div className="space-y-2">
            {[t.breathing.step1, t.breathing.step2, t.breathing.step3].map((s, i) => (
              <div key={i} className="flex items-start gap-2.5 rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5">
                <span className="text-[11px] font-black text-primary font-mono shrink-0 mt-0.5">{i + 1}</span>
                <p className="text-xs font-semibold leading-relaxed flex-1">{s}</p>
              </div>
            ))}
            <p className="text-[11px] font-bold text-primary leading-relaxed px-1">{t.breathing.stepNote}</p>
          </div>
        )}

        <div className="py-2 flex flex-col items-center gap-5">
          {run && !isFinished ? (
            <>
              {/* الدائرة الموجّهة — تتوسع بالشهيق، ثبات بالحبس، تنكمش ببطء بالزفير.
                  مدة حركة الدائرة = ثواني الطور الحقيقية كما يقودها المحرك الزمني */}
              <div className="relative h-52 w-52 flex items-center justify-center">
                <motion.div
                  key={`${phaseIdx}-${cycle}`}
                  animate={{ scale }}
                  transition={{ duration: phase.seconds, ease: phase.key === "out" ? "easeOut" : "easeInOut" }}
                  className="absolute inset-0 rounded-full gradient-primary opacity-25"
                />
                <motion.div
                  key={`${phaseIdx}-${cycle}-inner`}
                  animate={{ scale: scale + 0.15 }}
                  transition={{ duration: phase.seconds, ease: phase.key === "out" ? "easeOut" : "easeInOut" }}
                  className="absolute inset-6 rounded-full gradient-primary opacity-50"
                />
                <div className="relative z-10 text-center">
                  <div className="text-5xl font-black font-mono tabular-nums" dir="ltr">
                    {phaseRemaining}
                  </div>
                  <div className="text-[10px] font-bold text-muted-foreground">{t.breathing.seconds}</div>
                </div>
              </div>
              <div className="text-center space-y-1">
                <p className="font-black text-lg">{phaseLabel}</p>
                {/* الإرشاد الفعلي لكل طور — املأ بطنك / دون توتر / نفخ الشمعة */}
                <p className="text-xs font-semibold text-muted-foreground leading-relaxed max-w-72">{phaseHint}</p>
                <p className="text-[11px] font-bold text-primary">
                  {t.breathing.cycleOf.replace("{n}", String(cycle)).replace("{total}", String(run.cycles))}
                  <span className="mx-1.5 text-muted-foreground">·</span>
                  <span className="font-mono" dir="ltr">{mm}:{ss}</span>
                </p>
              </div>
            </>
          ) : finished ? (
            <div className="text-center space-y-4 py-6">
              <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center text-4xl">🌿</div>
              <p className="font-black text-lg">{t.breathing.done}</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button className="gradient-primary text-white font-black rounded-xl" onClick={() => start(DURATIONS[0].cycles)}>
                  {t.breathing.dur3}
                </Button>
                <Button variant="outline" className="rounded-xl font-black" onClick={() => start(DURATIONS[1].cycles)}>
                  {t.breathing.dur5}
                </Button>
              </div>
            </div>
          ) : (
            /* اختيار المدة: 3 أو 5 دقائق — كما نصّ التمرين (3 إلى 5 دقائق) */
            <div className="w-full text-center space-y-4 py-2">
              <p className="text-xs font-semibold text-muted-foreground leading-relaxed">{t.breathing.hint}</p>
              <p className="text-xs font-black">{t.breathing.durTitle}</p>
              <div className="grid grid-cols-2 gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d.minutes}
                    onClick={() => start(d.cycles)}
                    className="rounded-xl border-2 border-primary/40 bg-primary/5 hover:bg-primary/15 transition-all px-3 py-4 space-y-1"
                  >
                    <div className="text-2xl font-black text-primary font-mono" dir="ltr">{d.minutes}:00</div>
                    <div className="text-[11px] font-bold text-muted-foreground">{t.breathing.durNote.replace("{n}", String(d.cycles))}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {run && !isFinished && (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 rounded-xl font-bold" onClick={stop}>
              {t.breathing.stop}
            </Button>
          </div>
        )}
        <button
          onClick={() => onOpenChange(false)}
          className="w-full py-1.5 text-center text-[11px] font-bold text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-1"
        >
          <X className="h-3 w-3" />
          {t.common.close}
        </button>
      </DialogContent>
    </Dialog>
  );
}

/** زر مختصر يُستعمل في الهيدر والصفحات */
export function BreathingTriggerButton({ className }: { className?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={`gap-1.5 font-bold text-primary hover:text-primary ${className || ""}`}
        onClick={() => setOpen(true)}
        title={t.breathing.openBtn}
      >
        <Wind className="h-4 w-4" />
        <span className="hidden sm:inline text-xs">{t.breathing.openBtn}</span>
      </Button>
      <BreathingExerciseDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
