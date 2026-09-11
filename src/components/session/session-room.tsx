"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquareText,
  Mic,
  Video,
  LogOut,
  PhoneCall,
  HeartPulse,
  ShieldCheck,
  Clock,
  CalendarCheck2,
  Leaf,
  FileHeart,
  TrendingUp,
  ChevronDown,
  UsersRound,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { EMERGENCY_NUMBERS, SLOT_TIMES, type SessionMode } from "@/lib/constants";
import { formatDateTime, localDateStr } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ChatPanel } from "@/components/session/chat-panel";
import { WhatsAppPanel, WhatsAppGlyph } from "@/components/session/whatsapp-panel";
import { BackButton } from "@/components/shared/back-button";
import { waLink } from "@/lib/whatsapp";
import { formatWhatsapp } from "@/lib/whatsapp";
import { AlgeriaFlag } from "@/components/shared/algeria-skeleton";

interface SessionData {
  id: string;
  topic: string;
  mode: SessionMode;
  status: string;
  scheduledAt: string;
  startedAt?: string;
  endedAt?: string;
  followUpAt?: string | null;
  treatmentEnded?: boolean;
  moodBefore?: number;
  moodAfter?: number;
  notes?: string;
  crisisFlag?: boolean;
  /* v2.8.0: مدة الجلسة المختارة عند القبول — تُعرض في رأس الغرفة */
  durationMinutes?: number | null;
  victim: { id: string; pseudonym: string; phone?: string | null; gender?: string | null };
  counselor: {
    id: string;
    pseudonym: string;
    counselorProfile?: { fullName: string; whatsapp?: string | null } | null;
  };
}

/* خلاصة المسار العلاجي مع هذا العميل — تُعرض للأخصائي قبل بدء الحوار */
interface VictimSummary {
  previousSessions: number;
  avgMoodBefore: number | null;
  avgMoodAfter: number | null;
  moodSampleSize: number;
  lastNotes: string | null;
  lastSessionAt: string | null;
  crisisSessions: number;
  /* v2.7.0: رقم هاتف العميل — يصل حصراً لأخصائي هذه الجلسة للتواصل عبر واتساب */
  phone?: string | null;
}

export function SessionRoomView() {
  const { t, lang } = useI18n();
  const { user, activeSessionId, setView } = useApp();
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentMode, setCurrentMode] = useState<SessionMode>("TEXT");
  /* بطاقة الأزمة: العبارة + من كتبها (يُشتق من طرف الرسالة الواردة) */
  const [crisis, setCrisis] = useState<{ phrase: string; saidBy?: string | null } | null>(null);
  const [partnerPresent, setPartnerPresent] = useState(false);
  const [ended, setEnded] = useState(false);
  const [moodBefore, setMoodBefore] = useState<number | null>(null);
  const [moodAfter, setMoodAfter] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const loggedRef = useRef(false);
  const modeInitRef = useRef(false);
  /* بطاقة ملخص العميل قبل الجلسة (v2.5.3) — للأخصائي فقط */
  const [summary, setSummary] = useState<VictimSummary | null>(null);
  /* ملخص قابل للطي — يُطوى افتراضياً منذ الدخول (v2.9.0) حماية لمساحة الدردشة
     (كان مفتوحاً في بداية الجلسة فيلتهم نصف المساحة على الهواتف) */
  const [summaryOpen, setSummaryOpen] = useState(false);
  /* خطة ما بعد الجلسة للأخصائي: جدولة متابعة أو إنهاء علاج */
  const [showPlan, setShowPlan] = useState(false);
  const [planDate, setPlanDate] = useState("");
  const [planSlot, setPlanSlot] = useState(SLOT_TIMES[4]);
  const [planBusy, setPlanBusy] = useState(false);
  const [planErr, setPlanErr] = useState(false);
  /* v1.5.0: فقرة مواعيد الأخصائي في نافذة الجلسة المقبلة —
     تُعرض فقط الساعات التي حدّدها في إعداداته (وكل الساعات إن لم يحدّد جدولاً)
     مع استثناء المواعيد المحجوزة في تلك الفترة (طلب المستخدم) */
  const [planAvail, setPlanAvail] = useState<Record<string, string[]> | null>(null);
  const [planTaken, setPlanTaken] = useState<Record<string, string[]>>({});
  const planDataRef = useRef(false);
  /* v1.4.0: نافذة الدردشة الواسعة — خطاف مع بقية الحالة فوق كل العائدات المبكرة */
  const [chatOpen, setChatOpen] = useState(false);
  /* مرجع لحظي لمرجعية نافذة الجدولة: لا يُهزم التمرير الجانبي (polling)
     نافذة مفتوحة لو أنهى الطرف الآخر الجلسة في اللحظة نفسها */
  const showPlanRef = useRef(false);
  useEffect(() => {
    showPlanRef.current = showPlan;
  }, [showPlan]);

  const myRole: "VICTIM" | "COUNSELOR" | null =
    user?.role === "COUNSELOR" ? "COUNSELOR" : user?.role === "VICTIM" ? "VICTIM" : null;

  const load = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      /* v2.7.0: userId في الطلب — به فقط يُكشف رقم هاتف العميل لأخصائي الجلسة */
      const res = await fetch(`/api/sessions/${activeSessionId}?userId=${user?.id || ""}`);
      const data = await res.json();
      if (data.session) {
        setSession(data.session);
        /* نمط الجلسة يُضبط من الخادم مرة واحدة فقط — التبديل اليدوي للتبويبات لا يُلغى بالاستقصاء */
        if (!modeInitRef.current) {
          modeInitRef.current = true;
          setCurrentMode(data.session.mode || "TEXT");
        }
        if (data.session.status === "COMPLETED") {
          /* لا نقفز لشاشة الإنهاء ونافذة جدولة الجلسة المقبلة مفتوحة —
           (كان هذا السباق يُخفي النافذة فجأة فلا تظهر دائماً) */
          if (!showPlanRef.current) setEnded(true);
        }
        if (data.session.status === "ACTIVE" && !loggedRef.current) {
          loggedRef.current = true;
        }
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, user?.id]);

  useEffect(() => {
    modeInitRef.current = false;
  }, [activeSessionId]);

  useEffect(() => {
    load();
  }, [load]);

  /* ─── بطاقة ملخص العميل: تُجلب مرة واحدة عند دخول الغرفة (للأخصائي فقط) ─── */
  useEffect(() => {
    setSummary(null);
    setSummaryOpen(true);
    if (!activeSessionId || myRole !== "COUNSELOR" || !user?.id) return;
    let cancelled = false;
    fetch(`/api/sessions/${activeSessionId}/summary?userId=${user.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!cancelled) setSummary(d.summary || null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeSessionId, myRole, user?.id]);

  /* عند تفعيل الجلسة: اطوِ الملخص تلقائياً — الدردشة تبدأ بمساحتها الكاملة */
  useEffect(() => {
    if (session?.status === "ACTIVE") setSummaryOpen(false);
  }, [session?.status]);

  // poll status so both sides see ACCEPTED → ACTIVE → COMPLETED
  useEffect(() => {
    if (!activeSessionId) return;
    const i = setInterval(load, 6000);
    return () => clearInterval(i);
  }, [activeSessionId, load]);

  // timer
  useEffect(() => {
    if (!session?.startedAt || ended) return;
    const start = new Date(session.startedAt).getTime();
    const i = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(i);
  }, [session?.startedAt, ended]);

  const activate = async () => {
    if (!session) return;
    await fetch(`/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ACTIVE", viewerId: user?.id }),
    });
    load();
  };

  const endSession = async (extra: Record<string, unknown> = {}) => {
    if (!session) return;
    const res = await fetch(`/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ viewerId: user?.id, ...extra }),
    });
    /* ندمج استجابة الخادم محلياً حتى تظهر بطاقة الجلسة القادمة/إنهاء العلاج فوراً */
    try {
      const data = await res.json();
      if (data?.session) {
        setSession((prev) => (prev ? { ...prev, ...data.session } : prev));
      }
    } catch {}
    setEnded(true);
    setShowPlan(false);
  };

  const handleEndClick = () => {
    if (myRole === "COUNSELOR") {
      /* الأخصائي يقرر: جدولة الجلسة التالية (افتراضياً بعد أسبوع) أو إنهاء العلاج تماماً */
      openPlanDialog();
    } else {
      /* خروج العميل يُنهي الجلسة فعلياً على الخادم */
      endSession({ status: "COMPLETED" });
    }
  };

  /* فتح نافذة جدولة الجلسة المقبلة — من زر الإنهاء أو من شاشة ملخص الأخصائي */
  const openPlanDialog = () => {
    const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    setPlanDate(localDateStr(d)); /* تاريخ محلي صحيح — toISOString كان يقرأ UTC */
    setPlanSlot(SLOT_TIMES[4]);
    setPlanErr(false);
    setShowPlan(true);
    /* v1.5.0: جلب فقرة مواعيد الأخصائي والمحجوز مرة واحدة لكل فتح */
    if (!planDataRef.current && user?.id) {
      planDataRef.current = true;
      Promise.all([
        fetch(`/api/counselor?userId=${user.id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/taken-slots?counselorId=${user.id}&days=60`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]).then(([prof, tk]) => {
        const wa = (prof?.profile as { weeklyAvailability?: Record<string, string[]> | null } | undefined)?.weeklyAvailability;
        setPlanAvail(wa && typeof wa === "object" ? wa : null);
        setPlanTaken((tk?.taken as Record<string, string[]>) || {});
      });
    }
  };

  /* الساعات المسموحة لليوم المختار: فقرة الأخصائي − المحجوز − الفائت */
  const planAllowedSlots = (() => {
    if (!planDate) return [] as string[];
    const weekday = String(new Date(`${planDate}T00:00:00`).getDay());
    const fromAvail = planAvail ? planAvail[weekday] || [] : SLOT_TIMES;
    const takenList = planTaken[planDate] || [];
    const todayStr = localDateStr();
    const isToday = planDate === todayStr;
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    return SLOT_TIMES.filter((s) => {
      if (!fromAvail.includes(s)) return false;
      if (takenList.includes(s)) return false;
      if (isToday) {
        const [h, m] = s.split(":").map(Number);
        if (h * 60 + m <= nowMin) return false;
      }
      return true;
    });
  })();

  const scheduleFollowUp = async () => {
    if (!session || !planDate) return;
    const when = new Date(`${planDate}T${planSlot}:00`);
    /* تحقق لحظي: الجلسة المقبلة في المستقبل حصراً (الخادم يرفض أيضاً) */
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      setPlanErr(true);
      return;
    }
    setPlanErr(false);
    setPlanBusy(true);
    try {
      await endSession({ followUpAt: when.toISOString() });
    } finally {
      setPlanBusy(false);
    }
  };

  const submitFeedback = async () => {
    if (!session) return;
    await fetch(`/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        moodBefore: moodBefore ?? undefined,
        moodAfter: moodAfter ?? undefined,
        notes: notes || undefined,
      }),
    });
    setFeedbackSent(true);
  };

  const handleCrisis = useCallback((phrase: string, saidBy?: string | null) => {
    setCrisis({ phrase, saidBy: saidBy ?? null });
  }, []);

  const handlePresence = useCallback((present: boolean) => {
    setPartnerPresent(present);
  }, []);

  /* ─── نبض الحضور عبر REST — يعمل على Railway وVercel معاً (حتى بلا Socket.io) ───
     كل 10 ثوانٍ: يبلّغ الخادم أنني داخل الغرفة ويقرأ حالة الطرف الآخر،
     فتتحدث عبارة «بانتظار الأخصائي/العميل…» فوراً عند دخوله أو خروجه */
  useEffect(() => {
    if (!session?.id || !myRole) return;
    let alive = true;
    let busy = false;
    const beat = async () => {
      if (busy) return;
      busy = true;
      try {
        const r = await fetch(`/api/sessions/${session.id}/presence`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: myRole }),
        });
        if (r.ok && alive) {
          const d = await r.json();
          setPartnerPresent(!!d.partnerPresent);
        }
      } catch {
        /* الشبكة متقطعة — الدورة القادمة تعيد المحاولة */
      } finally {
        busy = false;
      }
    };
    beat();
    const i = setInterval(beat, 10000);
    return () => {
      alive = false;
      clearInterval(i);
    };
  }, [session?.id, myRole]);

  if (!activeSessionId) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
        <p className="text-muted-foreground font-semibold">{t.client.mySessionsEmpty}</p>
        <Button className="gradient-primary text-white font-bold" onClick={() => setView("client-sessions")}>
          {t.client.mySessionsTitle}
        </Button>
      </div>
    );
  }

  if (loading || !session) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-5">
        <AlgeriaFlag size={88} className="mx-auto drop-shadow-lg animate-pulse" />
        <p className="text-sm font-semibold text-muted-foreground">{t.session.connecting}</p>
      </div>
    );
  }

  const counselorName = session.counselor?.counselorProfile?.fullName || session.counselor?.pseudonym || "";
  const victimName = session.victim?.pseudonym || t.counselor.anonymousVictim;
  const myName = myRole === "COUNSELOR" ? counselorName : victimName;
  const isActive = session.status === "ACTIVE" && !ended;
  const counselorWhatsapp = session.counselor?.counselorProfile?.whatsapp || null;
  const topicLabel = t.client.topics[session.topic as keyof typeof t.client.topics] ?? session.topic;
  /* التنسيق الموحد YYYY/MM/DD HH:MM:SS — في كل المنصة وكل اللغات */
  const slotLabel = session.scheduledAt ? formatDateTime(session.scheduledAt) : "";
  /* v2.7.0: رقم هاتف العميل — يصل للخادم حصراً عندما تكون أنت الأخصائي المختار
     في هذه الجلسة؛ الأخصائي يرى الرقم مع زر واتساب للتواصل المباشر */
  const victimPhone =
    myRole === "COUNSELOR" ? session.victim?.phone || summary?.phone || null : null;
  /* v2.9.0: زر واتساب واحد فقط في الغرفة — يفتح المحادثة مع الطرف الآخر:
     الأخصائي → هاتف العميل، والعميل → هاتف الأخصائي */
  const waTarget = myRole === "COUNSELOR" ? victimPhone : counselorWhatsapp;
  const waIntro =
    myRole === "COUNSELOR"
      ? t.session.waVictimIntro
          .replace("{counselor}", counselorName)
          .replace("{client}", victimName)
          .replace("{victim}", victimName)
          .replace("{topic}", topicLabel)
          .replace("{slot}", slotLabel)
      : t.session.waIntro
          .replace("{counselor}", counselorName)
          .replace("{client}", victimName)
          .replace("{victim}", victimName)
          .replace("{mode}", t.session.modes[currentMode])
          .replace("{topic}", topicLabel)
          .replace("{slot}", slotLabel);
  const waLabel = myRole === "COUNSELOR" ? t.session.waContactVictim : t.session.waQuick[currentMode];
  /* جنس العميل — يظهر للأخصائي في رأس الغرفة (v2.9.0) */
  const victimGender = session.victim?.gender || null;
  const genderLabel =
    victimGender === "male" ? t.client.genderMale : victimGender === "female" ? t.client.genderFemale : null;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  /* نافذة خطة ما بعد الجلسة — تُعرّف مرة وتُعرض في غرفة الجلسة النشطة
     وفي شاشة ملخص الأخصائي معاً (كان غيابها هناك سبب «لا تظهر دائماً») */
  const planDialog = (
    <Dialog open={showPlan} onOpenChange={setShowPlan}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-start">{t.session.planTitle}</DialogTitle>
          <DialogDescription className="text-start">{t.session.planDesc}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <span className="text-sm font-bold">{t.session.planDateLabel}</span>
            <input
              type="date"
              dir="ltr"
              value={planDate}
              min={localDateStr()}
              onChange={(e) => {
                setPlanDate(e.target.value);
                setPlanErr(false);
              }}
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-sm font-bold">{t.session.planSlotLabel}</span>
            {/* v1.5.0: مواعيد هذا الأخصائي فقط (فقرة إعداداته) بعد استثناء المحجوز والفائت */}
            {planAllowedSlots.length > 0 ? (
              <div className="grid grid-cols-4 gap-1.5">
                {planAllowedSlots.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setPlanSlot(s); setPlanErr(false); }}
                    className={`rounded-lg border py-1.5 text-[11px] font-bold font-mono transition-all ${
                      planSlot === s ? "border-primary bg-primary text-white" : "border-border hover:border-primary/40"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 rounded-xl bg-amber-500/10 px-3 py-2">{t.session.planNoSlots}</p>
            )}
          </div>
          {planErr && (
            <p className="text-xs font-bold text-destructive" role="alert">{t.session.planPastError}</p>
          )}
          <Button
            className="w-full gradient-primary text-white font-black rounded-xl h-11"
            disabled={planBusy || !planDate}
            onClick={scheduleFollowUp}
          >
            <CalendarCheck2 className="h-4 w-4" />
            {t.session.planScheduleBtn}
          </Button>
          <Button
            variant="outline"
            className="w-full rounded-xl font-bold text-destructive border-destructive/40 h-11"
            disabled={planBusy}
            onClick={() => endSession({ treatmentEnded: true })}
          >
            <Leaf className="h-4 w-4" />
            {t.session.planEndTreatmentBtn}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  // ── Ended → feedback (العميل) أو ملخص (الأخصائي) ──
  if (ended) {
    /* الأخصائي: لا تقييم مزاج — ملخص مختصر مع حالة خطة المتابعة */
    if (myRole === "COUNSELOR") {
      return (
        <div className="max-w-xl mx-auto px-4 py-14 md:py-20">
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
            <Card className="border-primary/30 shadow-xl shadow-primary/5">
              <CardContent className="p-8 space-y-7 text-center">
                <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center animate-breathe">
                  <HeartPulse className="h-8 w-8 text-primary" />
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl font-black">{t.session.counselorSummaryTitle}</h1>
                  <p className="text-sm text-muted-foreground leading-relaxed">{t.session.counselorSummaryDesc}</p>
                </div>

                {session.treatmentEnded ? (
                  <div className="w-full rounded-xl bg-primary/10 text-primary text-sm font-bold px-4 py-3 flex items-center justify-center gap-2">
                    <Leaf className="h-4 w-4" />
                    {t.session.treatmentEndedNote}
                  </div>
                ) : session.followUpAt ? (
                  <div className="w-full rounded-xl border border-primary/30 bg-primary/5 text-primary text-sm font-bold px-4 py-3 flex items-center justify-center gap-2 flex-wrap">
                    <CalendarCheck2 className="h-4 w-4" />
                    {t.session.nextSessionNote}
                    {formatDateTime(session.followUpAt)}
                  </div>
                ) : null}

                {!session.treatmentEnded && !session.followUpAt && (
                  <Button className="gradient-primary text-white font-black rounded-xl h-11" onClick={openPlanDialog}>
                    <CalendarCheck2 className="h-4 w-4" />
                    {t.session.scheduleNextBtn}
                  </Button>
                )}

                <Button variant="outline" className="rounded-xl font-bold" onClick={() => setView("counselor-dashboard")}>
                  {t.session.backToDashboard}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
          {planDialog}
        </div>
      );
    }

    /* العميل: تقييم المزاج + ملاحظات */
    return (
      <div className="max-w-xl mx-auto px-4 py-14 md:py-20">
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
          <Card className="border-primary/30 shadow-xl shadow-primary/5">
            <CardContent className="p-8 space-y-7 text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center animate-breathe">
                <HeartPulse className="h-8 w-8 text-primary" />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-black">{t.session.endedTitle}</h1>
              </div>

              {session.treatmentEnded ? (
                <div className="w-full rounded-xl bg-primary/10 text-primary text-sm font-bold px-4 py-3 flex items-center justify-center gap-2">
                  <Leaf className="h-4 w-4" />
                  {t.session.treatmentEndedNote}
                </div>
              ) : session.followUpAt ? (
                <div className="w-full rounded-xl border border-primary/30 bg-primary/5 text-primary text-sm font-bold px-4 py-3 flex items-center justify-center gap-2 flex-wrap">
                  <CalendarCheck2 className="h-4 w-4" />
                  {t.session.nextSessionNote}
                  {formatDateTime(session.followUpAt)}
                </div>
              ) : null}

              {!feedbackSent ? (
                <div className="space-y-6 text-start">
                  <MoodQuestion
                    title={session.moodBefore === undefined || session.moodBefore === null ? t.session.moodBeforeTitle : undefined}
                    value={moodBefore}
                    onSelect={setMoodBefore}
                    labels={t.session.moodScale}
                  />
                  <MoodQuestion title={t.session.moodAfterTitle} value={moodAfter} onSelect={setMoodAfter} labels={t.session.moodScale} />
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t.session.notesPlaceholder}
                    className="rounded-xl min-h-20"
                  />
                  <Button className="w-full gradient-primary text-white font-black rounded-xl h-12" onClick={submitFeedback}>
                    {t.session.feedbackSubmit}
                  </Button>
                </div>
              ) : (
                <div className="space-y-5">
                  <p className="font-bold text-primary">{t.session.feedbackThanks}</p>
                  <Button variant="outline" className="rounded-xl font-bold" onClick={() => setView("landing")}>
                    {t.nav.home}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // ── Active room ──
  /* v2.14.0: بطاقة ملخص العميل كمتغيّر واحد — تُعرض في عمود جانبي بالحاسوب
     وفوق الغرفة في الهاتف (جزء من إصلاح الإطار الضيق في حساب المختص) */
  const summaryCard = myRole === "COUNSELOR" && summary ? (
    <Card className="border-primary/25 bg-primary/5">
      <CardContent className="p-4 space-y-2.5">
        <button
          type="button"
          onClick={() => setSummaryOpen((v) => !v)}
          aria-expanded={summaryOpen}
          className="w-full flex items-center justify-between gap-2 text-start"
        >
          <span className="text-sm font-black flex items-center gap-2">
            <FileHeart className="h-4 w-4 text-primary" />
            {t.session.summaryTitle}
          </span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${summaryOpen ? "" : "-rotate-90"}`} />
        </button>
        {victimPhone && (
          <div className="rounded-xl bg-card border border-[#25D366]/30 px-3 py-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-muted-foreground">{t.session.victimPhone}</p>
              <p className="text-xs font-black font-mono text-[#128C4A]" dir="ltr">
                {formatWhatsapp(victimPhone)}
              </p>
            </div>
          </div>
        )}
        {summaryOpen && (summary.previousSessions === 0 ? (
          <p className="text-xs font-semibold text-muted-foreground">{t.session.summaryFirst}</p>
        ) : (
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-card px-2 py-2 space-y-0.5">
                <div className="text-lg font-black font-mono">{summary.previousSessions}</div>
                <div className="text-[10px] font-bold text-muted-foreground">{t.session.summaryPrev}</div>
              </div>
              <div className="rounded-xl bg-card px-2 py-2 space-y-0.5">
                <div className="text-lg font-black font-mono flex items-center justify-center gap-1">
                  {summary.avgMoodBefore ?? "—"}
                  <TrendingUp className="h-3.5 w-3.5 text-primary" />
                  {summary.avgMoodAfter ?? "—"}
                </div>
                <div className="text-[10px] font-bold text-muted-foreground">{t.session.summaryMood}</div>
              </div>
              <div className="rounded-xl bg-card px-2 py-2 space-y-0.5">
                <div className="text-[11px] font-black pt-1">
                  {summary.lastSessionAt ? formatDateTime(summary.lastSessionAt) : "—"}
                </div>
                <div className="text-[10px] font-bold text-muted-foreground">{t.session.summaryLast}</div>
              </div>
              <div className="rounded-xl bg-card px-2 py-2 space-y-0.5">
                <div className="text-lg font-black font-mono">
                  {summary.crisisSessions > 0 ? (
                    <span className="text-destructive">{summary.crisisSessions}</span>
                  ) : (
                    "0"
                  )}
                </div>
                <div className="text-[10px] font-bold text-muted-foreground">{t.session.summaryCrisis}</div>
              </div>
            </div>
            {summary.lastNotes && (
              <div className="rounded-xl bg-card px-3 py-2">
                <p className="text-[10px] font-bold text-muted-foreground mb-0.5">{t.session.summaryNote}</p>
                <p className="text-xs leading-relaxed" dir="auto">{summary.lastNotes}</p>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  ) : null;

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 md:py-6">
      {/* v2.9.0: زر الرجوع من داخل الغرفة — يعود لقائمة الجلسات أو لوحة الأخصائي */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <BackButton />
      </div>
      {/* v2.14.0: إطار الغرفة أوسع — ملخص العميل ينتقل لعمود جانبي في الشاشات
          العريضة فلا يضغط الدردشة، وكل شيء يظهر كما يجب في حساب المختص
          (طلب المستخدم: جعل الإطار جيداً مثل نافذة الدردشة) */}
      {/* v2.14.0: بطاقة الملخص مكوّن واحد — عمود جانبي في الحاسوب، ومطوية فوق
          الغرفة في الهاتف — فلا تضغط الدردشة في أي مقاس */}
      {myRole === "COUNSELOR" && summary && (
        <div className="lg:hidden mb-3">{summaryCard}</div>
      )}
      <div className={cn(
        "grid gap-3 sm:gap-4 items-start",
        myRole === "COUNSELOR" && summary ? "lg:grid-cols-[1fr_19rem]" : "grid-cols-1"
      )}>
      {/* بطاقة ملخص العميل — عمود جانبي في الشاشات العريضة (للأخصائي فقط) */}
      {myRole === "COUNSELOR" && summary && (
        <motion.aside
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="hidden lg:block"
        >
          {summaryCard}
        </motion.aside>
      )}

      {/* Room card — relative لأن لافتة الأزمة تطفو داخله بدل أن تلتهم مساحة الدردشة */}
      <Card className="relative flex flex-col border-border/70 shadow-xl shadow-primary/5 overflow-hidden">
        {/* Header — مضغوط للهواتف: صف واحد لا يتراكم، وزر واتساب واحد فقط (v2.9.0) */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 p-3 sm:p-4 border-b border-border bg-card/80">
          <Avatar className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl">
            <AvatarFallback className="gradient-primary text-white rounded-xl font-black">
              {(myRole === "COUNSELOR" ? victimName : counselorName).replace("د. ", "").charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-32">
            <div className="font-black leading-tight flex items-center gap-2 flex-wrap">
              <span className="truncate max-w-44 sm:max-w-none">{myRole === "COUNSELOR" ? victimName : counselorName}</span>
              <Badge variant="secondary" className="gap-1 text-[11px] max-w-36">
                <HeartPulse className="h-3 w-3 shrink-0" />
                <span className="truncate">{topicLabel}</span>
              </Badge>
              {/* v2.9.0: جنس العميل — يراه الأخصائي في رأس الغرفة قبل الجلسة */}
              {myRole === "COUNSELOR" && genderLabel && (
                <Badge variant="outline" className="text-[10px] gap-1 font-bold text-muted-foreground">
                  <UsersRound className="h-3 w-3" />
                  {genderLabel}
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground font-semibold flex items-center gap-2 mt-0.5 flex-wrap">
              <span className={`h-1.5 w-1.5 rounded-full ${partnerPresent ? "bg-primary animate-pulse" : "bg-amber-500"}`} />
              {partnerPresent
                ? t.session.partnerJoined
                : myRole === "COUNSELOR"
                  ? t.session.waitingForVictim
                  : t.session.waitingForCounselor}
              {/* v2.8.0: مدة الجلسة التي اختارها الأخصائي — معلومة للعميل.
                  الجلسة لا تُغلق تلقائياً بعد انقضاء المدة — الإنهاء قرار الأخصائي */}
              {session?.durationMinutes ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-black">
                  <Clock className="h-3 w-3" />
                  {t.counselor.durationChip.replace("{n}", String(session.durationMinutes))}
                </span>
              ) : null}
              {isActive && (
                <span className="font-mono inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {mm}:{ss}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* v1.4.0: زر الدردشة في رأس الغرفة — يفتح نافذة الدردشة الواسعة */}
            <Button
              size="sm"
              className="gradient-primary text-white font-bold rounded-lg animate-pop"
              onClick={() => setChatOpen(true)}
            >
              <MessageSquareText className="h-4 w-4" />
              <span className="hidden sm:inline">{t.session.openChat}</span>
            </Button>
            {myRole === "COUNSELOR" && session.status === "ACCEPTED" && (
              <Button size="sm" variant="outline" className="gradient-primary text-white font-bold rounded-lg" onClick={activate}>
                {t.counselor.startSession}
              </Button>
            )}
            {/* عمود أزرار: إنهاء الجلسة فوق — وزر واتساب واحد تحته (v2.9.0:
                زر واحد فقط يفتح المحادثة مع الطرف الآخر — الأخصائي←العميل والعكس) */}
            <div className="flex flex-col items-stretch gap-1.5">
              <Button size="sm" variant="outline" className="rounded-lg text-destructive border-destructive/40 font-bold" onClick={handleEndClick}>
                <LogOut className="h-4 w-4" />
                {t.session.endSession}
              </Button>
              {waTarget && (
                <a
                  href={waLink(waTarget, waIntro) || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={waLabel}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-[#25D366] hover:bg-[#1fb857] text-white px-3 py-1.5 text-xs font-black shadow transition-all"
                >
                  <WhatsAppGlyph className="h-3.5 w-3.5" />
                  {waLabel}
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1.5 px-4 pt-3 pb-2 bg-muted/30">
          {(
            [
              { key: "TEXT" as const, icon: MessageSquareText },
              { key: "VOICE" as const, icon: Mic },
              { key: "VIDEO" as const, icon: Video },
            ]
          ).map((m) => (
            <button
              key={m.key}
              onClick={() => setCurrentMode(m.key)}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                currentMode === m.key
                  ? "gradient-primary text-white shadow"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <m.icon className="h-3.5 w-3.5" />
              {t.session.modes[m.key]}
            </button>
          ))}
        </div>

        {/* Content — v1.6.0: ارتفاع أدنى مريح بدل القفص الصلب، والمحتوى يمدّه طبيعياً */}
        <div className="min-h-[280px] sm:min-h-[320px]">
          {currentMode === "TEXT" ? (
            /* v1.4.0: وضع النص — منصة وسطية أنيقة بزر يفتح نافذة الدردشة
               (كانت الدردشة مدمجة هنا فتُضيق بالرأس والتبويبات والملخص)
               v1.5.0: تجاوب مضمون في كل اللغات ومقاسات الخط — محتوى يُمرّر
               عمودياً إن ضاقت الشاشة ولا يقتص أي عنصر خارج الإطار */
            <div className="h-full min-h-[200px] overflow-y-auto scrollbar-thin flex flex-col items-center justify-center gap-3 sm:gap-4 p-4 sm:p-6 text-center">
              <div className="h-14 w-14 sm:h-16 sm:w-16 shrink-0 rounded-3xl bg-primary/10 flex items-center justify-center animate-breathe">
                <MessageSquareText className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />
              </div>
              <div className="space-y-1 max-w-sm min-w-0">
                <p className="font-black leading-snug break-words">{t.session.chatHintTitle}</p>
                <p className="text-xs text-muted-foreground font-semibold leading-relaxed break-words">{t.session.chatHintDesc}</p>
              </div>
              <Button className="gradient-primary text-white font-black rounded-2xl h-11 sm:h-12 px-6 sm:px-8 shadow-lg shadow-primary/25 shrink-0" onClick={() => setChatOpen(true)}>
                <MessageSquareText className="h-5 w-5" />
                {t.session.openChat}
              </Button>
            </div>
          ) : (
            <WhatsAppPanel
              mode={currentMode}
              whatsapp={counselorWhatsapp}
              counselorName={counselorName}
              victimPseudonym={victimName}
              topicLabel={topicLabel}
              slot={slotLabel}
              active={isActive}
            />
          )}
        </div>

        {/* لافتة الأزمة — عائمة فوق المحادثة (لا تستهلك من مساحتها شيئاً،
            وتُعرض للأخصائي والعميل معاً مع أزرار الطوارئ ورجوع المحادثة) */}
        <AnimatePresence>
          {crisis && (
            <motion.div
              initial={{ opacity: 0, y: -14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              className="absolute inset-x-3 top-3 z-30 rounded-2xl border-2 border-destructive bg-card shadow-2xl p-4 space-y-3"
              role="alert"
            >
              <div className="flex items-center gap-2 font-black text-destructive">
                <ShieldCheck className="h-5 w-5" />
                {t.session.crisisTitle}
              </div>
              <p className="text-sm text-foreground/85 leading-relaxed">{t.session.crisisText}</p>
              <div className="flex flex-wrap gap-2">
                <a href={`tel:${EMERGENCY_NUMBERS.civilProtection}`} className="inline-flex items-center gap-2 rounded-xl bg-destructive text-white px-4 py-2.5 text-sm font-bold hover:bg-destructive/90">
                  <PhoneCall className="h-4 w-4" />
                  {t.session.crisisCall} · {EMERGENCY_NUMBERS.civilProtection}
                </a>
                <a href={`tel:${EMERGENCY_NUMBERS.ambulance}`} className="inline-flex items-center gap-2 rounded-xl border border-destructive/40 text-destructive px-4 py-2.5 text-sm font-bold hover:bg-destructive/10">
                  {t.session.crisisCall2} · {EMERGENCY_NUMBERS.ambulance}
                </a>
                <Button variant="outline" size="sm" className="rounded-xl font-bold border-border" onClick={() => setCrisis(null)}>
                  {t.session.crisisKeepChat}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
      </div>

      {/* Waiting note — نصها يتناسب مع نوع الحساب */}
      {!partnerPresent && (
        <p className="text-center text-xs text-muted-foreground font-semibold pt-3">
          {myRole === "COUNSELOR" ? t.session.waitingDescCounselor : t.session.waitingDesc}
        </p>
      )}

      {/* خطة ما بعد الجلسة — نافذة مشتركة (غرفة الجلسة + شاشة الملخص) */}
      {planDialog}

      {/* ═ v1.4.0: نافذة الدردشة الواسعة — مطابقة لنافذة التواصل بين الطرفين ═
          نفس مكوّن الدردشة الداخلي بمساحة كاملة (75vh) بلا ضغط الرأس والملخص */}
      <Dialog open={chatOpen} onOpenChange={setChatOpen}>
        <DialogContent className="sm:max-w-lg h-[80vh] max-h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-4 py-3 border-b border-border shrink-0">
            <DialogTitle className="text-start flex items-center gap-2 text-base">
              <MessageSquareText className="h-4.5 w-4.5 text-primary" />
              {t.session.chatTitle}
              <span className="text-xs font-bold text-muted-foreground truncate">
                · {myRole === "COUNSELOR" ? victimName : counselorName}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            <ChatPanel
              sessionId={session.id}
              myRole={myRole || "VICTIM"}
              myName={myName}
              active={session.status === "ACTIVE" || session.status === "ACCEPTED"}
              onCrisis={handleCrisis}
              onPartnerPresence={handlePresence}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* v2.14.0: المزاج بالإيموجي — اختيار الحالة بإيموجي معبّر بدل الكلمات
   (طلب المستخدم). القيم تبقى 1-5 متوافقة مع السجلات القديمة والمتوسطات */
const MOOD_EMOJIS = ["😫", "😟", "😐", "🙂", "😊"];

function MoodQuestion({
  title,
  value,
  onSelect,
  labels,
}: {
  title?: string;
  value: number | null;
  onSelect: (v: number) => void;
  labels: string[];
}) {
  if (!title) return null;
  return (
    <div className="space-y-2.5">
      <span className="text-sm font-bold">{title}</span>
      <div className="flex justify-between gap-2">
        {MOOD_EMOJIS.map((emoji, i) => (
          <button
            key={emoji}
            onClick={() => onSelect(i + 1)}
            aria-label={labels[i] || String(i + 1)}
            title={labels[i] || String(i + 1)}
            className={`flex-1 rounded-2xl border-2 py-2 text-2xl sm:text-3xl leading-none transition-all hover:scale-105 ${
              value === i + 1
                ? "border-primary bg-primary/10 scale-110 shadow-md shadow-primary/10"
                : "border-transparent bg-muted/60 hover:bg-muted"
            }`}
          >
            <span aria-hidden="true">{emoji}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
