"use client";

/**
 * v2.6.0 — الخيار الأول: «المواعيد التي تناسبك» قبل ظهور قائمة المختصين
 * v2.7.0 — تصميم مضغوط يجعل الصفحة كاملة داخل شاشة الهاتف الواحدة:
 *   لا تمرير نحو الأسفل ولا نحو الطرفين — تقويم أسبوعي/شهري بشبكة 7 أعمدة
 *   (بدل شريط التمرير الأفقي) وتباعد مضغوط في كل الأقسام.
 *
 * العميل يدخل المواعيد التي تناسبه في الأسبوع الحالي أو الشهر الحالي،
 * ثم تُعرض قائمة الأخصائيين الذين يوفرون نفس المواعيد فقط.
 *
 * النافذة المنبثقة الشارحة: تظهر أول 3 مرات (عدّاد محلي) أو تختفي
 * نهائياً بالضغط على «لا تُرني هذا مرة أخرى» — ليتعلم المستخدمون
 * كيفية استعمال المنصة شيئاً فشيئاً دون إزعاج متكرر.
 */
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarClock, CalendarDays, X, Check, Lightbulb, Users, Clock, ArrowLeft, ArrowRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { SLOT_TIMES, WEEKDAY_LABELS, WEEKDAY_SHORT } from "@/lib/constants";
import { MAX_SLOT_PICKS } from "@/lib/availability";
import { localDateStr } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BackButton } from "@/components/shared/back-button";

interface SlotPick {
  date: string;
  slot: string;
}

/* مفاتيح التعلّم المحلية — النافذة الشارحة تختفي بعد 3 مشاهدات أو بالتخطي النهائي */
const GUIDE_SEEN_KEY = "tumaanina-booking-guide-seen";
const GUIDE_OFF_KEY = "tumaanina-booking-guide-off";
const GUIDE_MAX_SHOWS = 3;

export function guideShouldShow(): boolean {
  try {
    if (localStorage.getItem(GUIDE_OFF_KEY) === "1") return false;
    const seen = Number(localStorage.getItem(GUIDE_SEEN_KEY) || "0");
    return seen < GUIDE_MAX_SHOWS;
  } catch {
    return false;
  }
}

export function markGuideSeen() {
  try {
    const seen = Number(localStorage.getItem(GUIDE_SEEN_KEY) || "0");
    localStorage.setItem(GUIDE_SEEN_KEY, String(seen + 1));
  } catch {
    /* تجاهل */
  }
}

export function markGuideOff() {
  try {
    localStorage.setItem(GUIDE_OFF_KEY, "1");
  } catch {
    /* تجاهل */
  }
}

/** نافذة الشرح — تُستعمل داخل خطوة المواعيد (تُصدَّر للاستعمال المستقبلي أيضاً) */
export function BookingGuideDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const steps = [t.client.guideStep1, t.client.guideStep2, t.client.guideStep3];
  const icons = [Clock, Users, CalendarDays];
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-start flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary shrink-0" />
            {t.client.guideTitle}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {steps.map((s, i) => {
            const Icon = icons[i];
            return (
              <div key={i} className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/30 px-3.5 py-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <p className="text-sm font-semibold leading-relaxed flex-1">{s}</p>
                <span className="text-[11px] font-black text-primary font-mono shrink-0 mt-0.5">{i + 1}</span>
              </div>
            );
          })}
        </div>
        <div className="space-y-2 pt-1">
          <Button
            className="w-full gradient-primary text-white font-black rounded-xl h-11"
            onClick={() => {
              markGuideSeen();
              onClose();
            }}
          >
            <Check className="h-4 w-4" />
            {t.client.guideGotIt}
          </Button>
          <button
            className="w-full text-center text-xs font-bold text-muted-foreground hover:text-primary transition-colors"
            onClick={() => {
              markGuideSeen();
              markGuideOff();
              onClose();
            }}
          >
            {t.client.guideDontShow}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** أيام النطاق المطلوب: الأسبوع الحالي (7 أيام من اليوم) أو باقي الشهر الحالي */
function daysForScope(scope: "week" | "month"): { date: string; weekday: number; isToday: boolean }[] {
  const out: { date: string; weekday: number; isToday: boolean }[] = [];
  const today = new Date();
  if (scope === "week") {
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      out.push({ date: localDateStr(d), weekday: d.getDay(), isToday: i === 0 });
    }
  } else {
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate(); // آخر يوم بالشهر
    for (let i = 0; today.getDate() + i <= end; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      out.push({ date: localDateStr(d), weekday: d.getDay(), isToday: i === 0 });
    }
  }
  return out;
}

export function ClientSlotsView() {
  const { t, lang } = useI18n();
  const { clientDraft, setDraft, setView } = useApp();
  const [scope, setScope] = useState<"week" | "month">("week");
  const [picks, setPicks] = useState<SlotPick[]>(clientDraft.preferredSlots || []);
  const [guideOpen, setGuideOpen] = useState(false);
  /* اليوم النشط: اليوم الحالي افتراضياً — الشبكة ظاهرة فوراً وبلا فراغات */
  const [activeDay, setActiveDay] = useState<string>(() => localDateStr());

  /* النافذة الشارحة: أول 3 مرات فقط أو معطّلة نهائياً */
  useEffect(() => {
    if (guideShouldShow()) setGuideOpen(true);
  }, []);

  const days = useMemo(() => daysForScope(scope), [scope]);
  const Arrow = lang === "ar" ? ArrowLeft : ArrowRight;

  /* v2.7.0: شبكة التقويم الشهري — فراغات بداية الشهر + كل أيامه
     (الأيام الفائتة معطّلة) — بدل الشريط الأفقي الذي كان يفرض التمرير الجانبي */
  const monthGrid = useMemo(() => {
    if (scope !== "month") return null;
    const today = new Date();
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const blanks = Array.from({ length: first.getDay() }, () => null);
    const cells = Array.from({ length: today.getDate() === 1 ? days.length : new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() }, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth(), i + 1);
      const date = localDateStr(d);
      return { date, day: i + 1, selectable: date >= localDateStr(today) };
    });
    return { blanks, cells };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, days]);

  /* الساعات المعطّلة لليوم الفعلي — المواعيد الفائتة لا تُقبل */
  const todayStr = localDateStr();
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const slotPassed = (date: string, s: string) => {
    if (date !== todayStr) return false;
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m <= nowMinutes;
  };

  const togglePick = (date: string, slot: string) => {
    setPicks((cur) => {
      const exists = cur.some((p) => p.date === date && p.slot === slot);
      if (exists) return cur.filter((p) => !(p.date === date && p.slot === slot));
      if (cur.length >= MAX_SLOT_PICKS) return cur;
      return [...cur, { date, slot }];
    });
  };

  const hasPick = (date: string, slot: string) => picks.some((p) => p.date === date && p.slot === slot);
  const dayPicks = (date: string) => picks.filter((p) => p.date === date).length;

  const continueToFind = () => {
    setDraft({ preferredSlots: picks });
    setView("client-find");
  };

  const skipToFind = () => {
    setDraft({ preferredSlots: [] });
    setView("client-find");
  };

  const dayLabel = (date: string) => {
    const d = new Date(`${date}T00:00:00`);
    return `${WEEKDAY_LABELS[lang][d.getDay()]} · ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 md:py-6">
      <BackButton />

      {/* رأس مضغوط — سطر واحد: الأيقونة والعنوان جنباً إلى جنب */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-1 mb-3">
        <div className="flex items-center justify-center gap-2.5">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <CalendarClock className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-xl md:text-2xl font-black">{t.client.slotPrefsTitle}</h1>
        </div>
        <p className="text-[11px] md:text-xs text-muted-foreground leading-snug text-center max-w-xl mx-auto">{t.client.slotPrefsDesc}</p>
      </motion.div>

      {/* نطاق الوقت: الأسبوع الحالي / الشهر الحالي — أزرار مضغوطة */}
      <div className="grid grid-cols-2 gap-2 mb-2.5">
        {(["week", "month"] as const).map((s) => (
          <button
            key={s}
            onClick={() => {
              setScope(s);
              setActiveDay(localDateStr());
            }}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs md:text-sm font-black transition-all ${
              scope === s ? "gradient-primary text-white shadow" : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            <CalendarDays className="h-4 w-4" />
            {s === "week" ? t.client.scopeWeek : t.client.scopeMonth}
          </button>
        ))}
      </div>

      {/* التقويم: شبكة 7 أعمدة ثابتة — لا تمرير جانبي إطلاقاً
          الأسبوع: 7 خلايا (يوم + رقم) — الشهر: تقويم مصغّر كامل بفراغات بداية الشهر */}
      <div className="rounded-2xl border border-border/70 bg-card/60 p-2 mb-3">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAY_SHORT[lang].map((w, i) => (
            <div key={i} className="text-center text-[9px] font-black text-muted-foreground/80 py-0.5">
              {w}
            </div>
          ))}
        </div>

        {scope === "week" ? (
          <div className="grid grid-cols-7 gap-1">
            {days.map((d) => {
              const active = activeDay === d.date;
              const nPicks = dayPicks(d.date);
              return (
                <button
                  key={d.date}
                  onClick={() => setActiveDay(d.date)}
                  className={`relative rounded-xl border py-1.5 text-center transition-all ${
                    active ? "border-primary bg-primary/10 shadow-sm" : "border-transparent hover:border-primary/30"
                  }`}
                >
                  <div className={`text-[9px] font-bold leading-none ${active ? "text-primary" : "text-muted-foreground"}`}>
                    {WEEKDAY_SHORT[lang][d.weekday]}
                  </div>
                  <div className={`text-sm font-black leading-tight ${active ? "text-primary" : ""}`} dir="ltr">
                    {d.date.slice(8, 10)}
                  </div>
                  {nPicks > 0 && (
                    <span className="absolute top-0.5 end-0.5 rounded-full bg-primary text-white text-[8px] font-black h-3.5 min-w-3.5 px-0.5 flex items-center justify-center">
                      {nPicks}
                    </span>
                  )}
                  {d.isToday && !active && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1">
              {monthGrid?.blanks.map((_, i) => <div key={`b-${i}`} />)}
              {monthGrid?.cells.map((c) => {
                const active = activeDay === c.date;
                const nPicks = dayPicks(c.date);
                const isToday = c.date === todayStr;
                return (
                  <button
                    key={c.date}
                    disabled={!c.selectable}
                    onClick={() => c.selectable && setActiveDay(c.date)}
                    className={`relative rounded-lg border aspect-square min-h-8 flex items-center justify-center text-xs font-black transition-all ${
                      active
                        ? "border-primary bg-primary text-white shadow-sm"
                        : nPicks > 0
                          ? "border-primary/50 bg-primary/15 text-primary"
                          : c.selectable
                            ? isToday
                              ? "border-primary/60 text-primary"
                              : "border-transparent hover:border-primary/30"
                            : "border-transparent text-muted-foreground/30 cursor-not-allowed"
                    }`}
                  >
                    {c.day}
                  </button>
                );
              })}
            </div>
            <div className="text-center text-[10px] font-bold text-primary mt-1">
              {activeDay ? dayLabel(activeDay) : ""}
            </div>
          </>
        )}
      </div>

      {/* ساعات اليوم المحدد — شطب سهل داخل الإطار نفسه */}
      <div className="mb-3">
        <p className="text-[11px] font-bold text-muted-foreground mb-1.5 flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          {activeDay ? dayLabel(activeDay) : t.client.pickDayHint}
        </p>
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
          {SLOT_TIMES.map((s) => {
            const passed = activeDay ? slotPassed(activeDay, s) : false;
            const on = activeDay ? hasPick(activeDay, s) : false;
            return (
              <button
                key={s}
                disabled={!activeDay || passed}
                onClick={() => activeDay && togglePick(activeDay, s)}
                className={`rounded-lg border py-1.5 text-[11px] md:text-xs font-bold font-mono transition-all ${
                  on
                    ? "border-primary bg-primary text-white shadow-sm"
                    : passed
                      ? "border-border/50 text-muted-foreground/40 line-through cursor-not-allowed"
                      : "border-border hover:border-primary/40"
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>

      {/* ملخص المواعيد المختارة — شارات مضغوطة تسطر في صفين كحد أقصى */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-xs font-bold flex items-center gap-1.5">
          <Check className="h-3.5 w-3.5 text-primary" />
          {t.client.selectedPicks} ({picks.length}/{MAX_SLOT_PICKS})
        </span>
        {picks.length > 0 && (
          <button
            onClick={() => setPicks([])}
            className="text-[11px] font-bold text-destructive hover:underline flex items-center gap-1 shrink-0"
          >
            <X className="h-3 w-3" />
            {t.common.delete}
          </button>
        )}
      </div>
      {picks.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {picks.map((p) => (
            <Badge key={`${p.date}-${p.slot}`} variant="secondary" className="gap-1 text-[10px] font-bold px-2 py-1">
              {dayLabel(p.date)} · <span className="font-mono" dir="ltr">{p.slot}</span>
              <button onClick={() => togglePick(p.date, p.slot)} aria-label="remove">
                <X className="h-2.5 w-2.5 text-destructive" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground font-semibold mb-3">{t.client.maxPicksNote}</p>
      )}

      {/* أزرار التنقل — أسفل الصفحة مباشرة داخل الإطار */}
      <div className="space-y-2">
        <Button
          size="lg"
          className="w-full gradient-primary text-white font-black text-sm md:text-base rounded-xl h-11"
          disabled={picks.length === 0}
          onClick={continueToFind}
        >
          <Users className="h-4 w-4" />
          {t.client.slotPrefsContinue}
          <Arrow className="h-4 w-4" />
        </Button>
        <button
          className="w-full text-center text-[11px] font-bold text-muted-foreground hover:text-primary transition-colors"
          onClick={skipToFind}
        >
          {t.client.slotPrefsSkip}
        </button>
      </div>

      <BookingGuideDialog open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}
