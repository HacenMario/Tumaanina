"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BadgeCheck,
  Hourglass,
  CalendarClock,
  CheckCheck,
  Star,
  MessageSquareText,
  Mic,
  Video,
  LogIn,
  XCircle,
  ShieldAlert,
  KeyRound,
  IdCard,
  Award,
  Copy,
  History,
  HeartPulse,
  ChevronRight,
  FileSignature,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { Dict } from "@/lib/i18n/ar";
import { useApp } from "@/lib/store";
import type { TopicKey, SessionMode } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { BackButton } from "@/components/shared/back-button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RoyalCrown } from "@/components/shared/crown-badge";
import { openDm } from "@/components/shared/dm-dialog";
import { CounselorsChatCard } from "@/components/shared/counselors-chat";
import { CounselorCoursesSection } from "./counselor-courses";
import { localDateStr } from "@/lib/utils";
import { SLOT_TIMES } from "@/lib/constants";
import { Clock3, CalendarCog, MessageCircle, Timer } from "lucide-react";

interface SessionRow {
  id: string;
  topic: string;
  mode: SessionMode;
  status: string;
  scheduledAt: string;
  victim: { id: string; pseudonym: string; gender?: string | null } | null;
  /* v1.5.0: نبض حضور العميل داخل الغرفة — لشارة «العميل في الغرفة الآن» */
  victimLastSeenAt?: string | null;
  /* v2.8.0: المدة المختارة عند القبول + سبب الرفض (يظهر في السجل الملغى) */
  durationMinutes?: number | null;
  /* تفاصيل السجل المكتمل (v2.5.4) */
  moodBefore?: number | null;
  moodAfter?: number | null;
  crisisFlag?: boolean;
  notes?: string | null;
  treatmentEnded?: boolean;
}

const MODE_ICONS: Record<SessionMode, React.ElementType> = {
  TEXT: MessageSquareText,
  VOICE: Mic,
  VIDEO: Video,
};

/* ─── v2.9.0: صندوق المحادثات (خيوط ما قبل الجلسة) — للأخصائي ليرد بلا جلسة ───
   v1.7.0: بلا أي معاينة لمحتوى آخر رسالة (طلب المستخدم — كانت تشوّه الهاتف
   عندما تكون الصوتية) — الاسم والوقت فقط، والضغط يفتح نافذة الدردشة كاملة */
interface DmThread {
  peerId: string;
  peerName: string | null;
  lastAt: string;
  lastSenderRole: string | null;
  mine: boolean;
}

function ConversationsCard() {
  const { t, lang } = useI18n();
  const { user } = useApp();
  const [threads, setThreads] = useState<DmThread[]>([]);
  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`/api/messages/threads?userId=${user.id}`, { cache: "no-store" });
      if (!res.ok) return;
      const d = await res.json();
      setThreads(d.threads || []);
    } catch {
      /* الشبكة متقطعة */
    }
  }, [user]);
  useEffect(() => {
    load();
    const i = setInterval(load, 10000);
    return () => clearInterval(i);
  }, [load]);

  if (threads.length === 0) return null;

  return (
    <Card className="border-primary/30 bg-primary/[0.04]">
      <CardContent className="p-4 space-y-3">
        <h3 className="font-bold text-sm flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          {t.counselor.conversationsTitle}
          <Badge className="bg-primary text-white border-0 text-[10px] font-black shrink-0">{threads.length}</Badge>
        </h3>
        <p className="text-[11px] font-semibold text-muted-foreground">{t.counselor.conversationsHint}</p>
        <div className="space-y-1.5 max-h-56 overflow-y-auto scrollbar-thin pe-1">
          {threads.map((th) => (
            <button
              key={th.peerId}
              onClick={() => openDm(th.peerId, th.peerName || "—")}
              className="w-full text-start rounded-xl border border-border/70 bg-card hover:border-primary/40 hover:bg-primary/5 transition-all px-3 py-2.5 flex items-center gap-3"
            >
              <span className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <MessageCircle className="h-4 w-4 text-primary" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-xs font-black truncate" dir="auto">{th.peerName || "—"}</span>
                  <span className="text-[9px] font-bold text-muted-foreground shrink-0" dir="ltr">
                    {formatDateTime(th.lastAt)}
                  </span>
                </span>
                <span className="block text-[10px] text-primary/70 font-bold">
                  {th.mine ? t.counselor.convoOpenMine : t.counselor.convoOpenPeer}
                </span>
              </span>
              <span className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <ChevronRight className="h-3.5 w-3.5 text-primary rtl:rotate-180" />
              </span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}


/* v2.9.0: شارة جنس العميل — يراه الأخصائي قبل قبول الجلسة */
function genderBadgeOf(gender: string | null | undefined, t: Dict) {
  if (gender !== "male" && gender !== "female") return null;
  const label = gender === "male" ? t.client.genderMale : t.client.genderFemale;
  return (
    <Badge variant="outline" className="text-[10px] font-bold text-muted-foreground shrink-0">
      {label}
    </Badge>
  );
}

export function CounselorDashboardView() {
  const { t, lang } = useI18n();
  const { user, setView, setActiveSession } = useApp();
  /* ─── v2.8.0: نوافذ القبول بالمدة / الاعتذار بسبب / تغيير الموعد ─── */
  const [acceptTarget, setAcceptTarget] = useState<SessionRow | null>(null);
  const [duration, setDuration] = useState(60);
  const [declineTarget, setDeclineTarget] = useState<SessionRow | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [declineErr, setDeclineErr] = useState("");
  const [reschedTarget, setReschedTarget] = useState<SessionRow | null>(null);
  const [reschedDate, setReschedDate] = useState(localDateStr());
  const [reschedSlot, setReschedSlot] = useState(SLOT_TIMES[0]);
  const [reschedErr, setReschedErr] = useState("");
  const [actBusy, setActBusy] = useState(false);
  const [available, setAvailable] = useState(true);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [stats, setStats] = useState({ upcoming: 0, done: 0, rating: 5 });
  const [loading, setLoading] = useState(true);
  /* تغيير كلمة المرور */
  const [pwOld, setPwOld] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwErr, setPwErr] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  /* بطاقتي المهنية (v2.5.3): الملف العام + الشهادة — v2.5.5: slug رابط الملف العام */
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [myProfileSlug, setMyProfileSlug] = useState<string | null>(null);
  const [myVerified, setMyVerified] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  /* v2.7.0: هل أنا فائز التحدي؟ (التاج الملكي في لوحتي) */
  const [challengeWinner, setChallengeWinner] = useState(false);
  /* v2.6.0: هل خصّص جدول التوفر الأسبوعي؟ */
  const [availConfigured, setAvailConfigured] = useState<boolean | null>(null);
  /* v1.12.0: هل امضى الأخصائي عقد المنصة؟ (null = لم تصل البيانات بعد) */
  const [platformContractSigned, setPlatformContractSigned] = useState<boolean | null>(null);
  /* سجل الجلسات المكتملة (v2.5.4): 5 في الصفحة + الباقي في نافذة */
  const [showAllLog, setShowAllLog] = useState(false);

  const changePw = async () => {
    if (!user) return;
    setPwErr("");
    setPwMsg("");
    setPwBusy(true);
    try {
      const res = await fetch("/api/counselor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "change-password", userId: user.id, oldPassword: pwOld, newPassword: pwNew }),
      });
      const data = await res.json();
      if (data.ok) {
        setPwMsg(t.counselor.changePwOk);
        setPwOld("");
        setPwNew("");
      } else if (data.error === "WEAK_PASSWORD") {
        setPwErr(t.client.weakPassword);
      } else {
        setPwErr(t.counselor.loginError);
      }
    } finally {
      setPwBusy(false);
    }
  };

  const load = useCallback(async () => {
    if (!user || user.role !== "COUNSELOR") return;
    try {
      /* v2.5.3: المسار الخفيف الخاص بدل قائمة كل الأخصائيين (كانت تُسحب كل 8 ثوانٍ بالصور الضخمة!) */
      const [sessRes, profRes] = await Promise.all([
        fetch(`/api/sessions?userId=${user.id}&role=COUNSELOR`),
        fetch(`/api/counselor?userId=${user.id}`),
      ]);
      const sessData = await sessRes.json();
      setSessions(sessData.sessions || []);
      const profData = await profRes.json();
      const me = profData.profile;
      if (me) {
        setAvailable(me.available);
        setMyProfileId(me.id || null);
        setMyProfileSlug((me as { slug?: string | null }).slug || null);
        setMyVerified(me.verificationStatus === "VERIFIED");
        setAvailConfigured(!!(me as { weeklyAvailability?: unknown }).weeklyAvailability);
        setChallengeWinner(!!(me as { challengeWinner?: boolean }).challengeWinner);
        /* v1.12.0: حالة إمضاء عقد المنصة — للافتة الإلزامية */
        const pcs = (me as { platformContractSigned?: boolean }).platformContractSigned;
        setPlatformContractSigned(typeof pcs === "boolean" ? pcs : null);
        setStats({ upcoming: 0, done: me.sessionsCount, rating: me.rating });
      }
      // stats
      const list: SessionRow[] = sessData.sessions || [];
      setStats((s) => ({
        ...s,
        upcoming: list.filter((x) => x.status === "PENDING" || x.status === "ACCEPTED").length,
        done: list.filter((x) => x.status === "COMPLETED").length || s.done,
      }));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
    const i = setInterval(load, 8000);
    return () => clearInterval(i);
  }, [load]);

  const toggleAvailability = async (v: boolean) => {
    setAvailable(v);
    if (!user) return;
    await fetch("/api/counselor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "availability", userId: user.id, available: v }),
    });
  };

  /* v2.8.0: القبول بمدة محددة يراها العميل — الجلسة لا تُغلق تلقائياً بعد انقائها */
  const accept = async (id: string, durationMinutes: number) => {
    const res = await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ACCEPTED", durationMinutes, cancelledBy: null, cancelReason: null }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      console.error("[SESSION] فشل القبول:", d?.error || res.status, d?.detail || "");
    }
    await load();
  };

  /* v2.8.0: الاعتذار بسبب مذكور — إلزامي، ويصل العميل إشعار تلقائي بالسبب */
  const decline = async (id: string, reason: string) => {
    const res = await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CANCELLED", cancelReason: reason, cancelledBy: "COUNSELOR" }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      console.error("[SESSION] فشل الاعتذار:", d?.error || res.status, d?.detail || "");
    }
    await load();
  };

  /* v2.8.0: تغيير موعد الطلب قبل قبوله — يصل العميل إشعار خاص بالموعد الجديد
     v1.3.0: عند النجاح يُعاد تحميل القائمة فوراً (كان ينتظر دورة التحديث 8 ثوانٍ
     فبدو أن التغيير «يتأخر ولا ينجح») + إشعار نجاح واضح */
  const reschedule = async (id: string, iso: string) => {
    const res = await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rescheduleTo: iso }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      await load();
      return undefined;
    }
    return (data?.error as string | undefined) || "SERVER_ERROR";
  };

  const startSession = async (id: string) => {
    await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ACTIVE" }),
    });
    setActiveSession(id);
    setView("session-room");
  };

  if (!user || user.role !== "COUNSELOR") {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
        <p className="text-muted-foreground font-semibold">{t.counselor.loginDescPassword}</p>
        <Button className="gradient-primary text-white font-bold" onClick={() => setView("counselor-auth")}>
          {t.counselor.loginSubmit}
        </Button>
      </div>
    );
  }

  const pending = sessions.filter((s) => s.status === "PENDING");
  const accepted = sessions.filter((s) => s.status === "ACCEPTED" || s.status === "ACTIVE");
  /* السجل المكتمل: الأحدث أولاً — 5 في الصفحة والباقي في نافذة منبثقة */
  const completed = sessions
    .filter((s) => s.status === "COMPLETED")
    .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 md:py-12">
      {/* v1.5.0: نافذة الحجوزات المنبثقة انتقلت إلى page.tsx — عالمية في كل الصفحات */}
      <BackButton />
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="space-y-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-black">
              {t.counselor.welcomeBack} {user.fullName}
            </h1>
            {/* v2.7.0: شارة فائز التحدي — الفائز يراه في لوحته دائماً */}
            {challengeWinner && (
              <Badge className="mt-2 bg-gradient-to-r from-amber-400 to-amber-500 text-white border-0 gap-1.5 shadow shadow-amber-500/30">
                <RoyalCrown size={16} />
                {t.challenge.winnerBadge}
              </Badge>
            )}
            {user.verified ? (
              <Badge className="mt-2 bg-primary/15 text-primary border-0 gap-1">
                <BadgeCheck className="h-3.5 w-3.5" />
                {t.counselor.verificationBadge}
              </Badge>
            ) : (
              <Badge className="mt-2 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-0 gap-1">
                <Hourglass className="h-3.5 w-3.5" />
                {t.counselor.pendingTitle}
              </Badge>
            )}
          </div>
        </div>

        {!user.verified && (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardContent className="p-5 flex items-center gap-4">
              <ShieldAlert className="h-7 w-7 text-amber-500 shrink-0" />
              <div className="space-y-0.5">
                <p className="font-bold text-sm">{t.counselor.pendingTitle}</p>
                <p className="text-xs text-muted-foreground">{t.counselor.pendingDesc}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ═ v1.12.0: لافتة إمضاء عقد المنصة — بدونها لن تُنشأ عقود لعملائه ═ */}
        {platformContractSigned === false && (
          <Card className="border-primary/40 bg-primary/[0.04]">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-4">
                <FileSignature className="h-7 w-7 text-primary shrink-0" />
                <div className="space-y-0.5">
                  <p className="font-bold text-sm">{t.contract.settingsTitle}</p>
                  <p className="text-xs text-muted-foreground">{t.contract.notSignedBadge}</p>
                </div>
              </div>
              <Button
                size="sm"
                className="gradient-primary text-white font-bold rounded-lg w-full sm:w-auto"
                onClick={() => setView("settings")}
              >
                <FileSignature className="h-4 w-4" />
                {t.contract.signNowBtn}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Stats + availability */}
        <div className="grid sm:grid-cols-2 gap-4">
          <Card className="border-border/70">
            <CardContent className="p-5 space-y-3">
              <h3 className="font-bold text-sm">{t.counselor.availabilityTitle}</h3>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-muted-foreground">{t.counselor.availableToggle}</span>
                <Switch checked={available} onCheckedChange={toggleAvailability} aria-label={t.counselor.availableToggle} />
              </div>
              {/* v2.6.0: تذكير لطيف لتخصيص الجدول الأسبوعي — بدون إزعاج (البيانات لم تصل بعد = لا نظهر شيئاً) */}
              {availConfigured === false && (
                <button
                  onClick={() => setView("settings")}
                  className="w-full text-start rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[11px] font-bold px-3 py-2 leading-relaxed hover:bg-amber-500/15 transition-colors"
                >
                  {t.counselor.availNotSet}
                </button>
              )}
            </CardContent>
          </Card>
          <Card className="border-border/70">
            <CardContent className="p-5 grid grid-cols-3 gap-2 text-center">
              {[
                { icon: CalendarClock, value: stats.upcoming, label: t.counselor.statsUpcoming },
                { icon: CheckCheck, value: stats.done, label: t.counselor.statsDone },
                { icon: Star, value: stats.rating, label: t.counselor.statsRating },
              ].map((s) => (
                <div key={s.label} className="space-y-1">
                  <s.icon className="h-4 w-4 mx-auto text-primary" />
                  <div className="text-xl font-black font-mono">{s.value}</div>
                  <div className="text-[10px] text-muted-foreground font-semibold leading-tight">{s.label}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* بطاقتي المهنية (v2.5.3): الملف العام القابل للمشاركة + شهادة الاعتماد */}
        {myVerified && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-5 space-y-3">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <IdCard className="h-4 w-4 text-primary" />
                {t.counselor.myProfileCard}
              </h3>
              <p className="text-xs text-muted-foreground font-semibold">{t.counselor.myProfileDesc}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg font-bold"
                  disabled={!myProfileId && !myProfileSlug}
                  onClick={async () => {
                    if (!myProfileId && !myProfileSlug) return;
                    /* v2.5.5: الرابط بالاسم الكامل للأخصائي (slug) — والأقدم بمعرّف الملف يبقى صالحاً */
                    const url = `${window.location.origin}/counselor/${myProfileSlug || myProfileId}`;
                    try {
                      if (navigator.share) await navigator.share({ title: t.counselor.myProfileCard, url });
                      else await navigator.clipboard.writeText(url);
                      setLinkCopied(true);
                      setTimeout(() => setLinkCopied(false), 2500);
                    } catch {
                      /* المستخدم ألغى المشاركة — لا شيء */
                    }
                  }}
                >
                  <Copy className="h-4 w-4" />
                  {linkCopied ? t.counselor.linkCopied : t.counselor.copyPublicLink}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg font-bold"
                  onClick={() => user && window.open(`/certificate/${user.id}`, "_blank")}
                >
                  <Award className="h-4 w-4" />
                  {t.counselor.myCertificate}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ─── v2.9.0: صندوق المحادثات — رد على العميلين قبل قبول الجلسات ─── */}
        <ConversationsCard />

        {/* ─── v2.9.0: فضاء الأخصائيين — دردشة جماعية خاصة بالمختصين ─── */}
        <CounselorsChatCard />

        {/* ─── v1.19.0: الدورات الأونلاين — إنشاء وإدارة الملتحقين ─── */}
        <CounselorCoursesSection />

        {/* Incoming requests */}
        <section className="space-y-3">
          <h2 className="font-black text-lg">{t.counselor.incomingTitle}</h2>
          {pending.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center text-muted-foreground text-sm font-semibold">
                {t.counselor.incomingEmpty}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {pending.map((s) => {
                const ModeIcon = MODE_ICONS[s.mode] || MessageSquareText;
                /* v2.8.0: الاسم المستعار للعميل يظهر للأخصائي قبل قبول الجلسة —
                   ليعرف مريضه مسبقاً بدل «عميل مجهول» */
                const alias = s.victim?.pseudonym || t.counselor.anonymousVictim;
                return (
                  <motion.div key={s.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                    <Card className="border-primary/40 shadow-md shadow-primary/5">
                      <CardContent className="p-4 sm:p-5 flex flex-wrap items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                          <ModeIcon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-40">
                          <div className="font-bold text-sm">{t.client.topics[s.topic as TopicKey] ?? s.topic}</div>
                          <div className="text-xs text-muted-foreground font-semibold mt-0.5">
                            <span className="text-foreground font-bold" dir="auto">{alias}</span> {genderBadgeOf(s.victim?.gender, t)} · {formatDateTime(s.scheduledAt)}
                          </div>
                        </div>
                        <div className="flex gap-2 ms-auto flex-wrap justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-lg font-bold border-primary/40 text-primary"
                            title={t.dm.contactBtn}
                            onClick={() => s.victim && openDm(s.victim.id, s.victim.pseudonym)}
                          >
                            <MessageCircle className="h-4 w-4" />
                            {t.dm.contactBtn}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-lg font-bold"
                            onClick={() => {
                              setReschedTarget(s);
                              setReschedDate(localDateStr());
                              setReschedSlot(SLOT_TIMES[0]);
                              setReschedErr("");
                            }}
                          >
                            <CalendarCog className="h-4 w-4" />
                            {t.counselor.rescheduleBtn}
                          </Button>
                          <Button size="sm" className="gradient-primary text-white font-bold rounded-lg" onClick={() => { setAcceptTarget(s); setDuration(60); }}>
                            <CheckCheck className="h-4 w-4" />
                            {t.counselor.accept}
                          </Button>
                          <Button size="sm" variant="outline" className="rounded-lg text-destructive border-destructive/40" onClick={() => { setDeclineTarget(s); setDeclineReason(""); setDeclineErr(""); }}>
                            <XCircle className="h-4 w-4" />
                            {t.counselor.decline}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>

        {/* Accepted sessions */}
        <section className="space-y-3">
          <h2 className="font-black text-lg">{t.counselor.todaySessions}</h2>
          {accepted.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center text-muted-foreground text-sm font-semibold">
                {t.counselor.incomingEmpty}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {accepted.map((s) => {
                const ModeIcon = MODE_ICONS[s.mode] || MessageSquareText;
                const alias2 = s.victim?.pseudonym || t.counselor.anonymousVictim;
                /* v1.5.0: هل العميل داخل غرفة الجلسة الآن؟ (آخر نبض له خلال 35 ثانية)
                   — يعرف الأخصائي ذلك من بطاقة الجلسة قبل بدء الجلسة (طلب المستخدم) */
                const clientSeen = s.victimLastSeenAt ? new Date(s.victimLastSeenAt).getTime() : 0;
                const clientInRoom = clientSeen > 0 && Date.now() - clientSeen < 35_000;
                return (
                  <Card key={s.id} className={`border-border/70 ${clientInRoom ? "border-primary/50 shadow-md shadow-primary/10" : ""}`}>
                    <CardContent className="p-4 sm:p-5 flex flex-wrap items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <ModeIcon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-40">
                        <div className="font-bold text-sm">{t.client.topics[s.topic as TopicKey] ?? s.topic}</div>
                        <div className="text-xs text-muted-foreground font-semibold mt-0.5">
                          <span className="text-foreground font-bold" dir="auto">{alias2}</span> {genderBadgeOf(s.victim?.gender, t)} · {formatDateTime(s.scheduledAt)} · {s.status}
                          {s.durationMinutes ? (
                            <span className="inline-flex items-center gap-1 ms-2 text-primary font-bold">
                              <Timer className="h-3 w-3" />
                              {t.counselor.durationChip.replace("{n}", String(s.durationMinutes))}
                            </span>
                          ) : null}
                        </div>
                        {clientInRoom && (
                          <div className="mt-1.5 w-fit inline-flex items-center gap-1.5 rounded-full bg-primary/12 text-primary px-2.5 py-0.5 text-[10px] font-black animate-pulse">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                            {t.counselor.clientInRoom}
                          </div>
                        )}
                      </div>
                      {s.victim && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-lg font-bold border-primary/40 text-primary"
                          title={t.dm.contactBtn}
                          onClick={() => openDm(s.victim!.id, s.victim!.pseudonym)}
                        >
                          <MessageCircle className="h-4 w-4" />
                          <span className="hidden sm:inline">{t.dm.contactBtn}</span>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className={`ms-auto font-bold rounded-lg ${s.status === "ACTIVE" ? "gradient-primary text-white animate-pulse" : "gradient-primary text-white"}`}
                        onClick={() => {
                          if (s.status === "ACCEPTED") startSession(s.id);
                          else {
                            setActiveSession(s.id);
                            setView("session-room");
                          }
                        }}
                      >
                        <LogIn className="h-4 w-4" />
                        {s.status === "ACTIVE" ? t.counselor.joinRoom : t.counselor.startSession}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* سجل الجلسات المكتملة — 5 أحدث بتفاصيلها والباقي في نافذة منبثقة (v2.5.4) */}
        {completed.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-black text-lg flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              {t.counselor.completedLogTitle}
            </h2>
            <div className="space-y-3">
              {completed.slice(0, 5).map((s) => (
                <CompletedRow key={s.id} s={s} t={t} />
              ))}
            </div>
            {completed.length > 5 && (
              <Button variant="outline" className="rounded-xl font-bold" onClick={() => setShowAllLog(true)}>
                <History className="h-4 w-4" />
                {t.counselor.completedLogAll} ({completed.length})
              </Button>
            )}
          </section>
        )}

        {/* تغيير كلمة المرور */}
        <section className="space-y-3">
          <h2 className="font-black text-lg">{t.counselor.changePwTitle}</h2>
          <Card className="border-border/70">
            <CardContent className="p-5 space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="font-bold text-xs">{t.counselor.currentPw}</Label>
                  <Input type="password" dir="ltr" value={pwOld} onChange={(e) => setPwOld(e.target.value)} className="rounded-xl bg-card" />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-bold text-xs">{t.client.newPasswordLabel}</Label>
                  <Input type="password" dir="ltr" value={pwNew} onChange={(e) => setPwNew(e.target.value)} className="rounded-xl bg-card" />
                </div>
              </div>
              {pwErr && <div className="rounded-xl bg-destructive/10 text-destructive text-xs font-bold px-3 py-2">{pwErr}</div>}
              {pwMsg && <div className="rounded-xl bg-primary/10 text-primary text-xs font-bold px-3 py-2">{pwMsg}</div>}
              <Button size="sm" className="gradient-primary text-white font-bold rounded-lg" disabled={pwBusy} onClick={changePw}>
                <KeyRound className="h-4 w-4" />
                {pwBusy ? t.common.loading : t.counselor.changePwBtn}
              </Button>
            </CardContent>
          </Card>
        </section>
      </motion.div>

      {/* ─── v2.8.0: نافذة القبول — اختيار مدة الجلسة ليراها العميل ─── */}
      <Dialog open={!!acceptTarget} onOpenChange={(o) => !o && setAcceptTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-start flex items-center gap-2">
              <Timer className="h-5 w-5 text-primary" />
              {t.counselor.acceptTitle}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs font-semibold text-muted-foreground -mt-1" dir="auto">
            {acceptTarget?.victim?.pseudonym || t.counselor.anonymousVictim} ·{" "}
            {acceptTarget ? formatDateTime(acceptTarget.scheduledAt) : ""}
          </p>
          <div className="space-y-2">
            <Label className="font-bold text-xs">{t.counselor.durationLabel}</Label>
            <div className="grid grid-cols-4 gap-2">
              {[30, 45, 60, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={`rounded-xl border-2 py-2.5 text-center transition-all ${
                    duration === d ? "border-primary bg-primary text-white" : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="text-sm font-black font-mono" dir="ltr">{d}</div>
                  <div className="text-[9px] font-bold">{t.counselor.durationMin}</div>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground font-bold leading-relaxed rounded-xl bg-primary/5 px-3 py-2">
              {t.counselor.durationNote}
            </p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" className="rounded-lg font-bold" onClick={() => setAcceptTarget(null)}>
              {t.common.cancel}
            </Button>
            <Button
              className="gradient-primary text-white font-bold rounded-lg"
              disabled={actBusy}
              onClick={async () => {
                if (!acceptTarget) return;
                setActBusy(true);
                try {
                  await accept(acceptTarget.id, duration);
                  setAcceptTarget(null);
                } finally {
                  setActBusy(false);
                }
              }}
            >
              <CheckCheck className="h-4 w-4" />
              {actBusy ? t.common.loading : t.counselor.acceptConfirm}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── v2.8.0: نافذة الاعتذار — سبب إلزامي يُرسل تلقائياً في إشعار للعميل ─── */}
      <Dialog open={!!declineTarget} onOpenChange={(o) => !o && setDeclineTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-start flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              {t.counselor.declineTitle}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="font-bold text-xs">{t.counselor.declineReasonLabel} *</Label>
            <Textarea
              value={declineReason}
              onChange={(e) => {
                setDeclineReason(e.target.value);
                setDeclineErr("");
              }}
              placeholder={t.counselor.declineReasonPlaceholder}
              className="rounded-xl min-h-24"
              dir="auto"
              maxLength={500}
            />
            {declineErr && <p className="text-[11px] font-bold text-destructive">{declineErr}</p>}
            <p className="text-[11px] text-muted-foreground font-semibold">{t.counselor.declineNote}</p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" className="rounded-lg font-bold" onClick={() => setDeclineTarget(null)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="outline"
              className="rounded-lg text-destructive border-destructive/40 font-bold"
              disabled={actBusy}
              onClick={async () => {
                if (!declineTarget) return;
                if (declineReason.trim().length < 3) {
                  setDeclineErr(t.counselor.declineReasonRequired);
                  return;
                }
                setActBusy(true);
                try {
                  await decline(declineTarget.id, declineReason.trim());
                  setDeclineTarget(null);
                } finally {
                  setActBusy(false);
                }
              }}
            >
              <XCircle className="h-4 w-4" />
              {actBusy ? t.common.loading : t.counselor.declineConfirm}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── v2.8.0: نافذة تغيير الموعد قبل القبول — إشعار خاص يصل للعميل ─── */}
      <Dialog open={!!reschedTarget} onOpenChange={(o) => !o && setReschedTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-start flex items-center gap-2">
              <CalendarCog className="h-5 w-5 text-primary" />
              {t.counselor.rescheduleTitle}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs font-semibold text-muted-foreground -mt-1" dir="auto">
            {reschedTarget?.victim?.pseudonym || t.counselor.anonymousVictim} ·{" "}
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
              <div className="grid grid-cols-4 gap-1.5">
                {SLOT_TIMES.map((sl) => (
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
            </div>
            {reschedErr && <p className="text-[11px] font-bold text-destructive">{reschedErr}</p>}
            <p className="text-[11px] text-muted-foreground font-semibold">{t.counselor.rescheduleNote}</p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" className="rounded-lg font-bold" onClick={() => setReschedTarget(null)}>
              {t.common.cancel}
            </Button>
            <Button
              className="gradient-primary text-white font-bold rounded-lg"
              disabled={actBusy}
              onClick={async () => {
                if (!reschedTarget) return;
                const [h, m] = reschedSlot.split(":").map(Number);
                const nd = new Date(`${reschedDate}T00:00:00`);
                nd.setHours(h, m, 0, 0);
                if (nd.getTime() <= Date.now()) {
                  setReschedErr(t.client.bookingPastError);
                  return;
                }
                setActBusy(true);
                try {
                  const err = await reschedule(reschedTarget.id, nd.toISOString());
                  if (err === "SLOT_TAKEN") {
                    setReschedErr(t.client.bookedSlotTaken);
                    return;
                  }
                  if (err === "PAST_DATE") {
                    setReschedErr(t.client.bookingPastError);
                    return;
                  }
                  if (err) {
                    setReschedErr(t.common.error);
                    return;
                  }
                  setReschedTarget(null);
                } finally {
                  setActBusy(false);
                }
              }}
            >
              <CalendarCog className="h-4 w-4" />
              {actBusy ? t.common.loading : t.counselor.rescheduleConfirm}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* النافذة المنبثقة: السجل الكامل للجلسات المكتملة */}
      <Dialog open={showAllLog} onOpenChange={setShowAllLog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-start flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              {t.counselor.completedLogTitle} ({completed.length})
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-3 pe-1 scrollbar-thin">
            {completed.map((s) => (
              <CompletedRow key={s.id} s={s} t={t} />
            ))}
          </div>
          <Button variant="outline" className="w-full rounded-xl font-bold" onClick={() => setShowAllLog(false)}>
            {t.counselor.completedClose}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* سطر جلسة مكتملة في السجل — تفاصيل: الموضوع، العميل، الموعد، المزاج، الأزمة، الملاحظات */
function CompletedRow({ s, t }: { s: SessionRow; t: Dict }) {
  const ModeIcon = MODE_ICONS[s.mode] || MessageSquareText;
  const victimAlias = s.victim?.pseudonym || t.counselor.anonymousVictim;
  const hasMood = s.moodBefore != null || s.moodAfter != null;
  return (
    <Card className="border-border/70">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
            <ModeIcon className="h-4.5 w-4.5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm flex items-center gap-2 flex-wrap">
              <span>{t.client.topics[s.topic as TopicKey] ?? s.topic}</span>
              {s.crisisFlag && (
                <Badge className="bg-destructive/15 text-destructive border-0 gap-1 text-[10px]">
                  <HeartPulse className="h-3 w-3" />
                  {t.counselor.completedCrisis}
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground font-semibold mt-0.5" dir="auto">
              {victimAlias} · <span className="font-mono" dir="ltr">{formatDateTime(s.scheduledAt)}</span>
            </div>
          </div>
          {hasMood && (
            <div className="text-end shrink-0">
              <div className="text-[10px] font-bold text-muted-foreground">{t.counselor.completedMood}</div>
              <div className="text-sm font-black font-mono" dir="ltr">
                {s.moodBefore ?? "—"} <span className="text-primary">→</span> {s.moodAfter ?? "—"}
              </div>
            </div>
          )}
        </div>
        {s.notes && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 rounded-xl bg-muted/50 px-3 py-2" dir="auto">
            {s.notes}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
