"use client";

/**
 * طمأنينة v1.0.0 — تبويبا لوحة القيادة والمدفوعات في لوحة الإدارة.
 * ─────────────────────────────────────────────────────────────
 * لوحة القيادة: كل الإحصائيات الممكنة في صفحة واحدة — بطاقات عددية،
 * رسم أعمدة لآخر 14 يوماً (CSS خالص بلا مكتبات)، توزيع الجنس والولايات،
 * أعلى الأخصائيين انشغالاً، الإيرادات، وفائزو التحديات.
 * المدفوعات: الحوالات البنكية وطلبات السحب — موافقة الإدارة تُضاف
 * للرصيد أو تنفّذ السحب، والرفض يُشعر المستخدم تلقائياً.
 */
import { useCallback, useEffect, useState } from "react";
import { Users, HeartPulse, Hourglass, ShieldAlert, CalendarClock, MessageSquare, MessagesSquare, Crown, RefreshCw, Check, X, Phone, MapPin } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/* v1.4.0: رمز الإدارة — يُرفق مع كل نداءات اللوحة (بوابة خادمية إلزامية) */
function adminHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-admin-token": (typeof window !== "undefined" && localStorage.getItem("tumaanina-admin-token")) || "",
  };
}

interface DashStats {
  users: { totalVictims: number; totalCounselors: number; pendingCounselors: number; suspendedUsers: number };
  sessions: { totalSessions: number; pendingSessions: number; acceptedSessions: number; activeSessions: number; completedSessions: number; cancelledSessions: number; todaySessions: number; weekSessions: number };
  crisisCount: number;
  feedbackUnhandled: number;
  messagesCount: number;
  gender: { key: string; n: number }[];
  wilayas: { key: string; n: number }[];
  counselorLoad: { name: string; n: number }[];
  daily: { day: string; count: number }[];
  victims: {
    victimWinner: { userId: string; name: string; wonAt: string | null } | null;
    counselorWinner: { userId: string; name: string; profileId: string | null; wonAt: string | null } | null;
  };
}

function StatCard({ icon: Icon, value, label, tone = "primary" }: { icon: React.ElementType; value: number | string; label: string; tone?: "primary" | "amber" | "destructive" | "sky" }) {
  const tones: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    amber: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
    destructive: "text-destructive bg-destructive/10",
    sky: "text-sky-600 dark:text-sky-400 bg-sky-500/10",
  };
  return (
    <Card className="border-border/70">
      <CardContent className="p-4 flex items-center gap-3">
        <span className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-xl font-black font-mono leading-none" dir="ltr">{value}</span>
          <span className="block text-[11px] font-bold text-muted-foreground mt-1 leading-tight">{label}</span>
        </span>
      </CardContent>
    </Card>
  );
}

export function DashboardTab() {
  const { t, lang } = useI18n();
  const [stats, setStats] = useState<DashStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ action: "dashboard-stats" }),
      });
      const d = await res.json();
      if (d?.stats) setStats(d.stats);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !stats) {
    return <Card className="h-48 animate-pulse bg-muted/40 border-0" />;
  }
  if (!stats) return null;

  const maxDaily = Math.max(1, ...stats.daily.map((d) => d.count));
  const genderMale = stats.gender.find((g) => g.key === "male")?.n ?? 0;
  const genderFemale = stats.gender.find((g) => g.key === "female")?.n ?? 0;
  const genderUnknown = stats.gender.find((g) => g.key === "unknown")?.n ?? 0;
  const genderTotal = Math.max(1, genderMale + genderFemale + genderUnknown);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-black text-lg">{t.admin.tabDashboard}</h2>
        <Button size="sm" variant="outline" className="rounded-lg font-bold gap-1.5" disabled={loading} onClick={load}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {t.admin.dashRefresh}
        </Button>
      </div>

      {/* المستخدمون */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Users} value={stats.users.totalVictims} label={t.admin.dashVictims} />
        <StatCard icon={HeartPulse} value={stats.users.totalCounselors} label={t.admin.dashCounselors} />
        <StatCard icon={Hourglass} value={stats.users.pendingCounselors} label={t.admin.dashPendingCounselors} tone="amber" />
        <StatCard icon={ShieldAlert} value={stats.users.suspendedUsers} label={t.admin.dashSuspended} tone="destructive" />
      </div>

      {/* الجلسات */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={CalendarClock} value={stats.sessions.totalSessions} label={t.admin.dashTotalSessions} />
        <StatCard icon={CalendarClock} value={stats.sessions.todaySessions} label={t.admin.dashToday} tone="sky" />
        <StatCard icon={CalendarClock} value={stats.sessions.weekSessions} label={t.admin.dashWeek} tone="sky" />
        <StatCard icon={Hourglass} value={stats.sessions.pendingSessions} label={t.admin.dashPending} tone="amber" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Crown} value={stats.sessions.activeSessions} label={t.admin.dashActive} />
        <StatCard icon={Check} value={stats.sessions.completedSessions} label={t.admin.dashCompleted} />
        <StatCard icon={X} value={stats.sessions.cancelledSessions} label={t.admin.dashCancelled} tone="destructive" />
        <StatCard icon={Hourglass} value={stats.sessions.acceptedSessions} label={t.admin.dashAcceptedSessions ?? t.admin.dashPending} tone="sky" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard icon={HeartPulse} value={stats.crisisCount} label={t.admin.dashCrisis} tone="destructive" />
        <StatCard icon={MessageSquare} value={stats.feedbackUnhandled} label={t.admin.dashFeedback} tone="amber" />
        <StatCard icon={MessagesSquare} value={stats.messagesCount} label={t.admin.dashMessages} />
      </div>

      {/* رسم أعمدة — آخر 14 يوماً */}
      <Card className="border-border/70">
        <CardContent className="p-4 space-y-3">
          <h3 className="font-bold text-sm">{t.admin.dashDaily}</h3>
          <div className="flex items-end gap-1.5 h-32" dir="ltr">
            {stats.daily.map((d) => (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${d.day}: ${d.count}`}>
                <span className="text-[9px] font-black text-muted-foreground">{d.count > 0 ? d.count : ""}</span>
                <div
                  className="w-full rounded-t-md gradient-primary min-h-1"
                  style={{ height: `${Math.max(4, (d.count / maxDaily) * 100)}%` }}
                />
                <span className="text-[8px] font-bold text-muted-foreground truncate w-full text-center">{d.day.slice(5)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-3">
        {/* الجنس */}
        <Card className="border-border/70">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-bold text-sm">{t.admin.dashGender}</h3>
            {[
              { label: t.admin.dashMale, n: genderMale, cls: "bg-sky-500" },
              { label: t.admin.dashFemale, n: genderFemale, cls: "bg-pink-500" },
              { label: t.admin.dashUnknown, n: genderUnknown, cls: "bg-muted-foreground/50" },
            ].map((g) => (
              <div key={g.label} className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span>{g.label}</span>
                  <span className="font-mono" dir="ltr">{g.n} ({Math.round((g.n / genderTotal) * 100)}%)</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full ${g.cls}`} style={{ width: `${(g.n / genderTotal) * 100}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* الولايات */}
        <Card className="border-border/70">
          <CardContent className="p-4 space-y-2">
            <h3 className="font-bold text-sm flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-primary" />
              {t.admin.dashWilayas}
            </h3>
            {stats.wilayas.length === 0 ? (
              <p className="text-xs text-muted-foreground font-semibold">—</p>
            ) : (
              stats.wilayas.map((w) => (
                <div key={w.key} className="flex items-center justify-between text-xs font-bold">
                  <span className="truncate" dir="auto">{w.key}</span>
                  <Badge variant="secondary" className="font-mono" dir="ltr">{w.n}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* أعلى الأخصائيين */}
        <Card className="border-border/70">
          <CardContent className="p-4 space-y-2">
            <h3 className="font-bold text-sm">{t.admin.dashTopCounselors}</h3>
            {stats.counselorLoad.length === 0 ? (
              <p className="text-xs text-muted-foreground font-semibold">—</p>
            ) : (
              stats.counselorLoad.map((c, i) => (
                <div key={i} className="flex items-center justify-between text-xs font-bold gap-2">
                  <span className="truncate" dir="auto">{i + 1}. {c.name}</span>
                  <Badge variant="secondary" className="font-mono shrink-0" dir="ltr">{c.n}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* فائزو التحديات */}
        <Card className="border-border/70">
          <CardContent className="p-4 space-y-2.5">
            <h3 className="font-bold text-sm flex items-center gap-1.5">
              <Crown className="h-4 w-4 text-amber-500" />
              {t.admin.dashWinners}
            </h3>
            <div className="space-y-1 text-xs font-bold">
              <p className="text-muted-foreground">{t.admin.dashVictimWinner}:</p>
              <p dir="auto">{stats.victims.victimWinner ? `👑 ${stats.victims.victimWinner.name}` : `— ${t.admin.dashNoWinner}`}</p>
              <p className="text-muted-foreground pt-1">{t.admin.dashCounselorWinner}:</p>
              <p dir="auto">{stats.victims.counselorWinner ? `👑 ${stats.victims.counselorWinner.name}` : `— ${t.admin.dashNoWinner}`}</p>
            </div>
          </CardContent>
        </Card>
      </div>
      {/* دعم اللغة المتغيرة بلا استعمال مباشر */}
      <span className="hidden">{lang}</span>
    </div>
  );
}
