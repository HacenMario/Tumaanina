"use client";

/* ═══ v1.3.0 — لوحة أخصائي (Dashboard): كل ما يحتاجه المختص في صفحة واحدة ═══
   • عدد الجلسات المكتملة + المبالغ لكل عملة على حدة (DZD/EUR/USD بلا أي تحويل)
   • فلترة متقدمة: يومي (30 يوماً) / أسبوعي (12 أسبوعاً) / شهري (12 شهراً)
   • المستحق للمنصة هذا الشهر — لكل عملة، يظهر للمختص حصراً
   • آخر الجلسات المكتملة بأسعارها وعملاتها */

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LayoutDashboard, CalendarCheck, Wallet, Landmark, TrendingUp, RefreshCw } from "lucide-react";
import { fmtMoney } from "@/lib/money";
import { CURRENCY_CODES, TopicKey } from "@/lib/constants";
import type { CurrencyCode } from "@/lib/constants";

type Period = "day" | "week" | "month";
type MoneyBag = Record<CurrencyCode, number>;

interface StatsResp {
  stats: {
    period: Period;
    commissionRate: number;
    totals: { count: number; gross: MoneyBag; commission: MoneyBag; net: MoneyBag };
    dueThisMonth: MoneyBag;
    buckets: { key: string; count: number; gross: MoneyBag; commission: MoneyBag; net: MoneyBag }[];
    recent: { topic: string; mode: string; price: number; currency: string; commission: number; endedAt: string | null }[];
  };
}

/* نص مبالغ حقيبة عملات — يعرض فقط العملات ذات قيمة أكبر من صفر */
function bagText(bag: MoneyBag | undefined, lang: string): string {
  if (!bag) return "—";
  const parts = CURRENCY_CODES.filter((c) => (bag[c] || 0) > 0).map((c) => fmtMoney(bag[c], c, lang));
  return parts.length ? parts.join(" · ") : "—";
}

export function CounselorStats() {
  const { t, lang } = useI18n();
  const { user } = useApp();
  const [period, setPeriod] = useState<Period>("month");
  const [data, setData] = useState<StatsResp["stats"] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (p: Period) => {
    if (!user) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/counselor/stats?userId=${user.id}&period=${p}`);
      const j = (await r.json()) as StatsResp;
      if (j?.stats) setData(j.stats);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load(period);
  }, [period, load]);

  if (!user || user.role !== "COUNSELOR") {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
        <p className="text-muted-foreground font-semibold">{t.roles.counselorDesc}</p>
        <Button className="gradient-primary text-white" onClick={() => useApp.getState().setView("counselor-login")}>
          {t.roles.counselorBtn}
        </Button>
      </div>
    );
  }

  const periods: { key: Period; label: string }[] = [
    { key: "day", label: t.cdash.daily },
    { key: "week", label: t.cdash.weekly },
    { key: "month", label: t.cdash.monthly },
  ];
  /* الرسم بأعداد الجلسات — محايد للعملات (المبالغ لكل عملة في البطاقات) */
  const maxCount = data ? Math.max(1, ...data.buckets.map((b) => b.count)) : 1;

  const bucketLabel = (key: string) => {
    if (period === "month") {
      const [y, m] = key.split("-");
      const names = t.cdash.monthNames;
      return `${names[Number(m) - 1]} ${y.slice(2)}`;
    }
    const d = new Date(`${key}T00:00:00Z`);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6" dir={lang === "ar" ? "rtl" : "ltr"}>
      {/* العنوان + الفلتر */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl gradient-primary text-white flex items-center justify-center shrink-0">
            <LayoutDashboard className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black">{t.cdash.title}</h1>
            <p className="text-xs text-muted-foreground font-semibold">{t.cdash.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-xl border bg-card p-1">
          {periods.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant={period === p.key ? "default" : "ghost"}
              className={`h-8 font-black text-xs rounded-lg ${period === p.key ? "gradient-primary text-white" : ""}`}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => load(period)} aria-label={t.common.loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* البطاقات الأربع — المبالغ لكل عملة على حدة */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-border/70">
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarCheck className="h-4 w-4" />
              <span className="text-xs font-bold">{t.cdash.completedSessions}</span>
            </div>
            <p className="text-2xl font-black">{data?.totals.count ?? "—"}</p>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs font-bold">{t.cdash.gross}</span>
            </div>
            <p className="text-base md:text-lg font-black text-primary" dir="ltr">
              {bagText(data?.totals.gross, lang)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <Landmark className="h-4 w-4" />
              <span className="text-xs font-bold">{t.cdash.commission} (15%)</span>
            </div>
            <p className="text-base md:text-lg font-black text-amber-600 dark:text-amber-400" dir="ltr">
              {bagText(data?.totals.commission, lang)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-primary">
              <Wallet className="h-4 w-4" />
              <span className="text-xs font-bold">{t.cdash.net}</span>
            </div>
            <p className="text-base md:text-lg font-black text-primary" dir="ltr">
              {bagText(data?.totals.net, lang)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* المستحق للمنصة هذا الشهر — لكل عملة، للمختص فقط */}
      <Card className="border-amber-500/40 bg-gradient-to-br from-amber-500/10 via-transparent to-amber-500/5">
        <CardContent className="p-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-amber-500/15 flex items-center justify-center shrink-0">
              <Landmark className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="font-black">{t.cdash.dueTitle}</p>
              <p className="text-[11px] text-muted-foreground font-semibold leading-relaxed max-w-md">{t.cdash.dueHint}</p>
            </div>
          </div>
          <p className="text-xl font-black text-amber-600 dark:text-amber-400" dir="ltr">
            {bagText(data?.dueThisMonth, lang)}
          </p>
        </CardContent>
      </Card>

      {/* الرسم الزمني — بعدد الجلسات (محايد للعملات) */}
      <Card className="border-border/70">
        <CardContent className="p-4 space-y-3">
          <h3 className="font-bold text-sm">{t.cdash.chartTitle}</h3>
          <div className="flex items-end gap-1 h-36" dir="ltr">
            {(data?.buckets || []).map((b) => (
              <div key={b.key} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${bucketLabel(b.key)}: ${b.count}`}>
                <div
                  className="w-full rounded-t-md bg-primary/70 hover:bg-primary transition-all min-h-[2px]"
                  style={{ height: `${Math.max(2, (b.count / maxCount) * 100)}%` }}
                />
                {period !== "day" && (
                  <span className="text-[8px] font-bold text-muted-foreground rotate-45 origin-top-left whitespace-nowrap hidden md:block">
                    {bucketLabel(b.key)}
                  </span>
                )}
              </div>
            ))}
          </div>
          {!data?.buckets.some((b) => b.count > 0) && (
            <p className="text-xs text-muted-foreground font-semibold text-center">{t.cdash.empty}</p>
          )}
        </CardContent>
      </Card>

      {/* آخر الجلسات المكتملة — كل جلسة بعملتها */}
      <Card className="border-border/70">
        <CardContent className="p-4 space-y-3">
          <h3 className="font-bold text-sm">{t.cdash.recentTitle}</h3>
          <div className="space-y-2">
            {(data?.recent || []).map((s, i) => {
              const cur: CurrencyCode = s.currency === "EUR" || s.currency === "USD" ? s.currency : "DZD";
              return (
                <div key={i} className="flex items-center justify-between gap-3 rounded-xl border bg-card/60 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">
                      {t.client.topics[s.topic as TopicKey] ?? s.topic}
                      <Badge variant="secondary" className="ms-2 text-[9px] font-bold">{t.session[`mode${s.mode}` as keyof typeof t.session] as string ?? s.mode}</Badge>
                    </p>
                    <p className="text-[11px] text-muted-foreground font-semibold" dir="ltr">
                      {s.endedAt ? new Date(s.endedAt).toISOString().slice(0, 16).replace("T", " ") : ""}
                    </p>
                  </div>
                  <div className="text-end shrink-0">
                    <p className="text-sm font-black text-primary" dir="ltr">{fmtMoney(s.price, cur, lang)}</p>
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold" dir="ltr">
                      −{fmtMoney(s.commission, cur, lang)} ({t.cdash.commission})
                    </p>
                  </div>
                </div>
              );
            })}
            {data && data.recent.length === 0 && (
              <p className="text-xs text-muted-foreground font-semibold text-center py-6">{t.cdash.empty}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
