"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CalendarPlus, CalendarClock, LogIn, XCircle, MessageSquareText, Mic, Video, Crown, Hourglass, Rocket, CalendarDays, CheckCircle2, Ban, MessageCircle, Star, CalendarCog } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { fmtMoney } from "@/lib/money";
import type { TopicKey, SessionMode, CurrencyCode } from "@/lib/constants";
import { SLOT_TIMES } from "@/lib/constants";
import { formatDateTime, localDateStr } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BackButton } from "@/components/shared/back-button";
import { openDm } from "@/components/shared/dm-dialog";
import { openRatings } from "@/components/shared/ratings-dialog";
import { Clock3 } from "lucide-react";

interface SessionRow {
  id: string;
  topic: string;
  mode: SessionMode;
  status: string;
  scheduledAt: string;
  followUpAt?: string | null;
  treatmentEnded?: boolean;
  createdAt: string;
  source?: string | null;
  /* v2.8.0: المدة المختارة عند القبول + سبب الاعتذار عند الرفض */
  durationMinutes?: number | null;
  cancelReason?: string | null;
  cancelledBy?: string | null;
  /* v1.0.0 (طمأنينة): بيانات الدفع — v1.3.0: بعملة الحجز نفسها */
  price?: number | null;
  currency?: string | null;
  victim: { id: string; pseudonym: string };
  counselor: {
    id: string;
    pseudonym: string;
    counselorProfile?: { fullName: string } | null;
  };
}

/* ─── v2.9.0: تحدي الالتزام للعميلين ─── */
interface VictimChallenge {
  target: number;
  myStreak: number;
  isWinner: boolean;
  winner: { userId: string; name: string; wonAt: string | null } | null;
  /* v1.6.0: false = معطّل من الإدارة أو منتهي المدة أو فاز غيره — النافذة تختفي */
  active: boolean;
}

const MODE_ICONS: Record<SessionMode, React.ElementType> = {
  TEXT: MessageSquareText,
  VOICE: Mic,
  VIDEO: Video,
};

/* ترتيب المجموعات كما طلب المستخدم حرفياً:
   1) غرفة مفتوحة الآن (ACTIVE)
   2) مقبولة — جاهزة للدخول (ACCEPTED قريبة)
   3) طلبات جديدة بانتظار القبول (PENDING)
   4) مبرمجة لاحقاً (موعد مستقبلي بعيد / جلسة متابعة)
   5) مكتملة
   6) الملغاة في الأخير */
type GroupKey = "open" | "accepted" | "pending" | "upcoming" | "completed" | "cancelled";

const GROUP_STYLE: Record<GroupKey, { icon: React.ElementType; cls: string; descKey: string | null }> = {
  open: { icon: Rocket, cls: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30", descKey: "groupOpenDesc" },
  accepted: { icon: LogIn, cls: "text-primary bg-primary/10 border-primary/30", descKey: "groupAcceptedDesc" },
  pending: { icon: Hourglass, cls: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30", descKey: "groupPendingDesc" },
  upcoming: { icon: CalendarDays, cls: "text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/30", descKey: "groupUpcomingDesc" },
  completed: { icon: CheckCircle2, cls: "text-muted-foreground bg-muted border-border", descKey: null },
  cancelled: { icon: Ban, cls: "text-destructive bg-destructive/10 border-destructive/30", descKey: null },
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-0",
  ACCEPTED: "bg-primary/15 text-primary border-0",
  ACTIVE: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-0 animate-pulse",
  COMPLETED: "bg-muted text-muted-foreground border-0",
  CANCELLED: "bg-destructive/15 text-destructive border-0",
};

const HOUR = 60 * 60 * 1000;

function groupOf(s: SessionRow): GroupKey {
  if (s.status === "ACTIVE") return "open";
  if (s.status === "ACCEPTED") {
    /* قبول بموعد بعيد (>36 ساعة) أو جلسة متابعة مبرمجة = مبرمجة لاحقاً */
    const diff = new Date(s.scheduledAt).getTime() - Date.now();
    if (diff > 36 * HOUR || s.source === "FOLLOW_UP") return "upcoming";
    return "accepted";
  }
  if (s.status === "PENDING") return "pending";
  if (s.status === "COMPLETED") {
    /* جلسة مكتملة بلا متابعة = مكتملة؛ متابعة مبرمجة قادمة تظهر في upcoming */
    return "completed";
  }
  return "cancelled";
}

export function ClientSessionsView() {
  const { t, lang } = useI18n();
  const { user, setView, setActiveSession, currency } = useApp();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [challenge, setChallenge] = useState<VictimChallenge | null>(null);
  /* ═ v1.3.0: عمليات الحجز الموثوقة — إلغاء بتأكيد + تغيير موعد للعميل ═
     (كان الإلغاء صامتاً بلا تغذية راجعة ولا معالجة أخطاء، وتغيير الموعد
     غير موجود للعميل إطلاقاً) */
  const [cancelTarget, setCancelTarget] = useState<SessionRow | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelErr, setCancelErr] = useState("");
  const [reschedTarget, setReschedTarget] = useState<SessionRow | null>(null);
  const [reschedDate, setReschedDate] = useState(localDateStr());
  const [reschedSlot, setReschedSlot] = useState(SLOT_TIMES[0]);
  const [reschedBusy, setReschedBusy] = useState(false);
  const [reschedErr, setReschedErr] = useState("");
  /* ═ v1.6.0: تغيير الموعد يقيد بمواعيد الأخصائي المسموحة فقط ═
     (طلب المستخدم: «عند تغيير موعد يجب أن يختار فقط المواعيد التي
     يسمح بها المختص») — فقرة التوفر الأسبوعي + المحجوز + الفائت */
  const [reschedAvail, setReschedAvail] = useState<Record<string, string[]> | null>(null);
  const [reschedTaken, setReschedTaken] = useState<Record<string, string[]>>({});

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/sessions?userId=${user.id}&role=VICTIM`);
      const data = await res.json();
      setSessions(data.sessions || []);
    } finally {
      setLoading(false);
    }
  }, [user]);

  /* تحدي الالتزام — يُحسب على الخادم من نبضات الحضور */
  const loadChallenge = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/challenge?victim=1&userId=${user.id}`, { cache: "no-store" });
      if (!res.ok) return;
      const d = await res.json();
      /* v1.6.0: active = التحدي مفعّل وداخل مدته وبلا فائز — غير ذلك تختفي النافذة */
      if (d.ok) setChallenge({ target: d.target, myStreak: d.myStreak, isWinner: d.isWinner, winner: d.winner, active: d.active !== false });
    } catch {
      /* تجاهل */
    }
  }, [user]);

  useEffect(() => {
    load();
    loadChallenge();
    const interval = setInterval(load, 8000); // live status updates
    return () => clearInterval(interval);
  }, [load, loadChallenge]);

  /* ═ v1.3.0: إلغاء بتأكيد ونتيجة صريحة — يتعامل مع الأخطاء بدل الصمت ═ */
  const cancel = async (id: string) => {
    setCancelBusy(true);
    setCancelErr("");
    try {
      const res = await fetch(`/api/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED", cancelledBy: "VICTIM" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setCancelTarget(null);
        await load();
      } else {
        setCancelErr(data?.detail ? String(data.detail) : t.common.error);
      }
    } catch {
      setCancelErr(t.common.error);
    } finally {
      setCancelBusy(false);
    }
  };

  /* ═ v1.3.0: تغيير الموعد من طرف العميل — كان حصراً على الأخصائي ═ */
  const reschedule = async (id: string) => {
    const [h, m] = reschedSlot.split(":").map(Number);
    const nd = new Date(`${reschedDate}T00:00:00`);
    nd.setHours(h, m, 0, 0);
    if (nd.getTime() <= Date.now()) {
      setReschedErr(t.client.bookingPastError);
      return;
    }
    setReschedBusy(true);
    setReschedErr("");
    try {
      const res = await fetch(`/api/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rescheduleTo: nd.toISOString(), rescheduledBy: "VICTIM" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setReschedTarget(null);
        await load();
      } else if (data?.error === "SLOT_TAKEN") {
        setReschedErr(t.client.bookedSlotTaken);
      } else if (data?.error === "PAST_DATE") {
        setReschedErr(t.client.bookingPastError);
      } else {
        setReschedErr(t.common.error);
      }
    } catch {
      setReschedErr(t.common.error);
    } finally {
      setReschedBusy(false);
    }
  };

  const join = (s: SessionRow) => {
    setActiveSession(s.id);
    setView("session-room");
  };

  /* ═ v1.6.0: فتح نافذة تغيير الموعد يجلب فقرة مواعيد هذا الأخصائي والمحجوز ═ */
  const openReschedule = (s: SessionRow) => {
    setReschedTarget(s);
    setReschedErr("");
    setReschedDate(localDateStr());
    setReschedSlot(SLOT_TIMES[0]);
    setReschedAvail(null);
    setReschedTaken({});
    if (s.counselor?.id) {
      Promise.all([
        fetch(`/api/counselor?userId=${s.counselor.id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/taken-slots?counselorId=${s.counselor.id}&days=60`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]).then(([prof, tk]) => {
        const wa = (prof?.profile as { weeklyAvailability?: Record<string, string[]> | null } | undefined)?.weeklyAvailability;
        setReschedAvail(wa && typeof wa === "object" ? wa : null);
        setReschedTaken((tk?.taken as Record<string, string[]>) || {});
      });
    }
  };

  /* الساعات المسموحة لليوم المختار: فقرة الأخصائي − المحجوز − الفائت */
  const reschedAllowedSlots = (() => {
    if (!reschedDate) return [] as string[];
    const weekday = String(new Date(`${reschedDate}T00:00:00`).getDay());
    const fromAvail = reschedAvail ? reschedAvail[weekday] || [] : SLOT_TIMES;
    const takenList = reschedTaken[reschedDate] || [];
    const todayStr = localDateStr();
    const isToday = reschedDate === todayStr;
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

  if (!user) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
        <p className="text-muted-foreground font-semibold">{t.roles.victimDesc}</p>
        <Button className="gradient-primary text-white" onClick={() => setView("client-start")}>
          {t.roles.victimBtn}
        </Button>
      </div>
    );
  }

  /* التجميع بترتيب طلب المستخدم + الترتيب الزمني داخل كل مجموعة */
  const groups: { key: GroupKey; items: SessionRow[] }[] = (
    ["open", "accepted", "pending", "upcoming", "completed", "cancelled"] as GroupKey[]
  ).map((key) => ({ key, items: [] }));
  for (const s of sessions) {
    const g = groups.find((x) => x.key === groupOf(s));
    g?.items.push(s);
  }
  for (const g of groups) {
    g.items.sort((a, b) =>
      g.key === "cancelled" || g.key === "completed"
        ? new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
        : new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    );
  }
  const visibleGroups = groups.filter((g) => g.items.length > 0);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 md:py-12">
      <BackButton />
      <div className="flex items-center justify-between mb-5 gap-3">
        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl md:text-3xl font-black"
        >
          {t.client.mySessionsTitle}
        </motion.h1>
        <Button className="gradient-primary text-white font-bold rounded-xl" onClick={() => setView("client-topics")}>
          <CalendarPlus className="h-4 w-4" />
          {t.client.bookNew}
        </Button>
      </div>
      <p className="text-[11px] font-bold text-muted-foreground rounded-xl bg-muted/50 px-3 py-2 mb-5">{t.client.bookLimitNote}</p>

      {/* ─── v2.9.0: تحدي الالتزام — أول من يحترم 4 مواعيد متتالية (تأخير ≤10 دقائق) ───
          v1.6.0: الفوز يُعطّل التحدي فوراً وتختفي نافذته للجميع — وكذلك عند
          تعطيل الإدارة له أو انتهاء مدة صلاحيته (طلب المستخدم الصريح) ───
          v2.11.0: تباين قوي في الوضع النهاري — كانت البطاقة شبه غير مرئية */}
      {challenge && challenge.active && (
        <Card className="mb-5 border-2 shadow-sm border-amber-500/45 bg-amber-500/12">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
              <Crown className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black leading-snug text-amber-800 dark:text-amber-300">
                {t.client.challengeTitle.replace("{target}", String(challenge.target))}
              </p>
              <div className="flex items-center gap-1.5 mt-2">
                {Array.from({ length: challenge.target }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-2.5 w-8 rounded-full ${i < challenge.myStreak ? "bg-amber-500" : "bg-amber-500/25 dark:bg-amber-400/20"}`}
                    title={i < challenge.myStreak ? `${i + 1}/${challenge.target}` : ""}
                  />
                ))}
                <span className="text-xs font-black font-mono ms-1 text-amber-700 dark:text-amber-300" dir="ltr">
                  {challenge.myStreak}/{challenge.target}
                </span>
              </div>
              <p className="text-[10px] font-bold text-muted-foreground mt-1.5 leading-relaxed">
                {t.client.challengeHint}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <Card key={i} className="h-24 animate-pulse bg-muted/50 border-0" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="p-12 text-center space-y-4">
            <CalendarClock className="h-12 w-12 mx-auto text-muted-foreground/40" />
            <p className="text-muted-foreground font-semibold">{t.client.mySessionsEmpty}</p>
            <Button variant="outline" className="rounded-xl font-bold" onClick={() => setView("client-topics")}>
              {t.client.bookNew}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-7">
          {visibleGroups.map((g) => {
            const style = GROUP_STYLE[g.key];
            const Icon = style.icon;
            const groupTitle =
              g.key === "open"
                ? t.client.myGroups.open
                : g.key === "accepted"
                  ? t.client.myGroups.accepted
                  : g.key === "pending"
                    ? t.client.myGroups.pending
                    : g.key === "upcoming"
                      ? t.client.myGroups.upcoming
                      : g.key === "completed"
                        ? t.client.myGroups.completed
                        : t.client.myGroups.cancelled;
            return (
              <section key={g.key} className="space-y-3">
                {/* رأس المجموعة — تفرقة واضحة بين كل نوع */}
                <div className={`rounded-xl border px-3.5 py-2.5 flex items-center gap-2.5 ${style.cls}`}>
                  <Icon className="h-4 w-4 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-black flex items-center gap-2">
                      {groupTitle}
                      <span className="rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-black">{g.items.length}</span>
                    </span>
                    {style.descKey && (
                      <p className="text-[11px] font-semibold text-muted-foreground mt-0.5">
                        {style.descKey === "groupOpenDesc"
                          ? t.client.groupOpenDesc
                          : style.descKey === "groupAcceptedDesc"
                            ? t.client.groupAcceptedDesc
                            : style.descKey === "groupPendingDesc"
                              ? t.client.groupPendingDesc
                              : t.client.groupUpcomingDesc}
                      </p>
                    )}
                  </div>
                </div>
                {g.items.map((s, i) => {
                  const ModeIcon = MODE_ICONS[s.mode] || MessageSquareText;
                  const counselorName = s.counselor?.counselorProfile?.fullName || s.counselor?.pseudonym || "—";
                  const isRoomOpen = s.status === "ACTIVE";
                  return (
                    <motion.div key={s.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                      <Card className={`border-border/70 ${isRoomOpen ? "border-emerald-500/50 shadow-md shadow-emerald-500/10" : ""}`}>
                        <CardContent className="p-4 sm:p-5 flex flex-wrap items-center gap-3 sm:gap-4">
                          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                            <ModeIcon className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-40">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold">{t.client.topics[s.topic as TopicKey] ?? s.topic}</span>
                              <Badge className={STATUS_COLORS[s.status]}>{s.status}</Badge>
                              {/* v1.3.0: سعر الجلسة بعملة الحجز نفسها — بلا أي تحويل */}
                              {s.price ? (
                                <Badge className="bg-primary/10 text-primary border-0 gap-1" dir="ltr">
                                  {fmtMoney(s.price ?? 0, (s.currency as CurrencyCode) || "DZD", lang)}
                                </Badge>
                              ) : null}
                            </div>
                            <div className="text-xs text-muted-foreground font-semibold mt-1">
                              {t.client.sessionWith} {counselorName} · {formatDateTime(s.scheduledAt)}
                              {s.durationMinutes ? (
                                <span className="ms-2 text-primary font-bold">
                                  ⏱ {t.client.durationLabel}: {s.durationMinutes} {t.counselor.durationMin}
                                </span>
                              ) : null}
                            </div>
                            {/* v2.8.0: سبب الاعتذار يظهر للعميل مباشرة في بطاقة الجلسة الملغاة */}
                            {s.status === "CANCELLED" && s.cancelReason && s.cancelledBy === "COUNSELOR" && (
                              <div className="text-[11px] font-bold text-destructive mt-1 rounded-xl bg-destructive/5 px-3 py-1.5" dir="auto">
                                {t.client.declinedReason}: {s.cancelReason}
                              </div>
                            )}
                            {s.status === "COMPLETED" && s.followUpAt && !s.treatmentEnded && (
                              <div className="text-[11px] font-bold text-primary mt-1 flex items-center gap-1">
                                <CalendarClock className="h-3 w-3" />
                                {t.session.nextSessionNote}
                                {formatDateTime(s.followUpAt)}
                              </div>
                            )}
                            {s.status === "COMPLETED" && s.treatmentEnded && (
                              <div className="text-[11px] font-bold text-muted-foreground mt-1">🌿 {t.session.treatmentEndedNote}</div>
                            )}
                          </div>
                          <div className="flex gap-2 ms-auto">
                            {(s.status === "ACCEPTED" || s.status === "ACTIVE") && (
                              <Button
                                size="sm"
                                className={`font-bold rounded-lg ${isRoomOpen ? "gradient-primary text-white animate-pulse" : "gradient-primary text-white"}`}
                                onClick={() => join(s)}
                              >
                                <LogIn className="h-4 w-4" />
                                {isRoomOpen ? t.counselor.joinRoom : t.counselor.joinRoom}
                              </Button>
                            )}
                            {/* v2.14.0: نافذة التواصل تبقى في كل المراحل — زر تواصل في كل حالة
                                من حالات الجلسة (طلب المستخدم صراحة) */}
                            {s.status !== "ACTIVE" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-lg font-bold border-primary/40 text-primary"
                                title={t.dm.contactBtn}
                                onClick={() => openDm(s.counselor.id, counselorName)}
                              >
                                <MessageCircle className="h-4 w-4" />
                                <span className="hidden sm:inline">{t.dm.contactBtn}</span>
                              </Button>
                            )}
                            {/* v2.14.0: قيّم الأخصائي بعد اكتمال الجلسة — نجوم 1-5 */}
                            {s.status === "COMPLETED" && (
                              <Button
                                size="sm"
                                className="rounded-lg font-bold bg-amber-400 text-amber-950 hover:bg-amber-300"
                                onClick={() => openRatings(s.counselor.id, counselorName, s.id)}
                              >
                                <Star className="h-4 w-4 fill-amber-950/20" />
                                {t.rating.sessionBtn}
                              </Button>
                            )}
                            {s.status === "PENDING" && (
                              <>
                                <Button size="sm" variant="outline" className="rounded-lg font-bold border-primary/40 text-primary" onClick={() => openReschedule(s)}>
                                  <CalendarCog className="h-4 w-4" />
                                  {t.counselor.rescheduleBtn}
                                </Button>
                                <Button size="sm" variant="outline" className="rounded-lg text-destructive border-destructive/40" onClick={() => { setCancelTarget(s); setCancelErr(""); }}>
                                  <XCircle className="h-4 w-4" />
                                  {t.client.cancelSession}
                                </Button>
                              </>
                            )}
                            {s.status === "ACCEPTED" && (
                              <Button size="sm" variant="outline" className="rounded-lg font-bold border-primary/40 text-primary" onClick={() => openReschedule(s)}>
                                <CalendarCog className="h-4 w-4" />
                                {t.counselor.rescheduleBtn}
                              </Button>
                            )}
                            {(s.status === "COMPLETED" || s.status === "CANCELLED") && (
                              <Button size="sm" variant="outline" className="rounded-lg font-bold" onClick={() => setView("client-topics")}>
                                {t.client.rebook}
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}

      {/* ═ v1.3.0: تأكيد الإلغاء — لم يكن هناك أي تأكيد ولا ردّ فعل عند الضغط ═ */}
      <Dialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-start flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              {t.client.cancelConfirmTitle}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs font-semibold text-muted-foreground -mt-1" dir="auto">
            {t.client.sessionWith} {cancelTarget?.counselor?.counselorProfile?.fullName || cancelTarget?.counselor?.pseudonym || "—"} ·{" "}
            {cancelTarget ? formatDateTime(cancelTarget.scheduledAt) : ""}
          </p>
          <p className="text-xs text-muted-foreground font-semibold">{t.client.cancelConfirmDesc}</p>
          {cancelErr && <div className="rounded-xl bg-destructive/10 text-destructive text-xs font-bold px-3 py-2">{cancelErr}</div>}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" className="rounded-lg font-bold" disabled={cancelBusy} onClick={() => setCancelTarget(null)}>
              {t.common.cancel}
            </Button>
            <Button className="rounded-lg font-bold bg-destructive text-white hover:bg-destructive/90" disabled={cancelBusy} onClick={() => cancelTarget && void cancel(cancelTarget.id)}>
              <XCircle className="h-4 w-4" />
              {cancelBusy ? t.common.loading : t.client.confirmCancel}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═ v1.3.0: تغيير الموعد من طرف العميل — مع إشعار تلقائي للأخصائي ═ */}
      <Dialog open={!!reschedTarget} onOpenChange={(o) => !o && setReschedTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-start flex items-center gap-2">
              <CalendarCog className="h-5 w-5 text-primary" />
              {t.client.rescheduleTitle}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs font-semibold text-muted-foreground -mt-1" dir="auto">
            {t.client.sessionWith} {reschedTarget?.counselor?.counselorProfile?.fullName || reschedTarget?.counselor?.pseudonym || "—"} ·{" "}
            {reschedTarget ? formatDateTime(reschedTarget.scheduledAt) : ""}
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="font-bold text-xs">{t.client.bookingDateLabel}</Label>
              <input
                type="date"
                dir="ltr"
                value={reschedDate}
                min={localDateStr()}
                onChange={(e) => {
                  setReschedDate(e.target.value);
                  setReschedErr("");
                }}
                className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold text-xs flex items-center gap-1.5">
                <Clock3 className="h-3.5 w-3.5" />
                {t.client.bookingSlotLabel}
              </Label>
              {/* v1.6.0: مواعيد هذا الأخصائي فقط (فقرة إعداداته) بعد استثناء
                  المحجوز والفائت — كان كل ساعات اليوم معروضة رغم كلام الأخصائي */}
              {reschedAllowedSlots.length > 0 ? (
                <div className="grid grid-cols-4 gap-1.5">
                  {reschedAllowedSlots.map((sl) => (
                    <button
                      key={sl}
                      onClick={() => setReschedSlot(sl)}
                      className={`rounded-lg border py-1.5 text-[11px] font-bold font-mono transition-all ${
                        reschedSlot === sl ? "border-primary bg-primary text-white" : "border-border hover:border-primary/40"
                      }`}
                    >
                      {sl}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 rounded-xl bg-amber-500/10 px-3 py-2">
                  {t.client.rescheduleNoSlots}
                </p>
              )}
            </div>
            {reschedErr && <p className="text-[11px] font-bold text-destructive">{reschedErr}</p>}
            <p className="text-[11px] text-muted-foreground font-semibold">{t.client.rescheduleHint}</p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" className="rounded-lg font-bold" disabled={reschedBusy} onClick={() => setReschedTarget(null)}>
              {t.common.cancel}
            </Button>
            <Button
              className="gradient-primary text-white font-bold rounded-lg"
              disabled={reschedBusy || reschedAllowedSlots.length === 0}
              onClick={() => reschedTarget && void reschedule(reschedTarget.id)}
            >
              <CalendarCog className="h-4 w-4" />
              {reschedBusy ? t.common.loading : t.counselor.rescheduleConfirm}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
