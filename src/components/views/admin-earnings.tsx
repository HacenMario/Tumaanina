"use client";

/* ═══ v1.7.0 — تبويب «مستحقات المختصين» في لوحة الإدارة ═══
   النسخة الإدارية من صفحة «إحصائياتي» الخاصة بكل مختص:
   • ملخّص عام: كل الجلسات المكتملة + إجمالي المبيعات + عمولة المنصة 20% + مستحق هذا الشهر
   • بطاقة لكل مختص: عدد جلساته المكتملة والمبالغ بعملتها (DZD/EUR/USD بلا أي تحويل)
     + صافي المختص + مستحق المنصة هذا الشهر + آخر جلسة مكتملة
   • تفاصيل قابلة للطي: آخر 8 جلسات (العميل، الموضوع، النمط، السعر، العمولة، التاريخ)
   • بيانات لكل عملة على حدة كما في «إحصائياتي» — بلا أي تحويل بين العملات */

import { useCallback, useEffect, useState } from "react";
import {
  LayoutDashboard,
  CalendarCheck,
  TrendingUp,
  Landmark,
  Wallet,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  UserRound,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtMoney } from "@/lib/money";
import { CURRENCY_CODES, PLATFORM_COMMISSION_RATE } from "@/lib/constants";
import type { CurrencyCode } from "@/lib/constants";

/* v1.4.0: رمز الإدارة — يُرفق مع كل نداءات اللوحة (بوابة خادمية إلزامية) */
function adminHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-admin-token": (typeof window !== "undefined" && localStorage.getItem("tumaanina-admin-token")) || "",
  };
}

type MoneyBag = Record<CurrencyCode, number>;

interface RecentSession {
  clientAlias: string | null;
  topic: string;
  mode: string;
  price: number;
  currency: CurrencyCode;
  commission: number;
  endedAt: string | null;
}

interface EarningsRow {
  id: string;
  name: string;
  email: string | null;
  suspended: boolean;
  completedCount: number;
  gross: MoneyBag;
  commission: MoneyBag;
  net: MoneyBag;
  dueThisMonth: MoneyBag;
  lastCompletedAt: string | null;
  recent: RecentSession[];
}

interface EarningsResp {
  ok: boolean;
  commissionRate: number;
  grand: { count: number; gross: MoneyBag; commission: MoneyBag; net: MoneyBag; dueThisMonth: MoneyBag };
  counselors: EarningsRow[];
}

/* نص مبالغ حقيبة عملات — يعرض فقط العملات ذات قيمة أكبر من صفر */
function bagText(bag: MoneyBag | undefined, lang: string): string {
  if (!bag) return "—";
  const parts = CURRENCY_CODES.filter((c) => (bag[c] || 0) > 0).map((c) => fmtMoney(bag[c], c, lang));
  return parts.length ? parts.join(" · ") : "—";
}

export function AdminEarningsTab() {
  const { t, lang } = useI18n();
  const [data, setData] = useState<EarningsResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ action: "counselors-earnings" }),
      });
      const j = (await res.json()) as EarningsResp;
      if (j?.ok) setData(j);
    } catch {
      /* الشبكة متقطعة */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      {/* العنوان + التحديث */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl gradient-primary text-white flex items-center justify-center shrink-0">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-black text-sm">{t.admin.earningsTitle}</h3>
            <p className="text-[11px] text-muted-foreground font-semibold">{t.admin.earningsDesc}</p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="rounded-xl font-bold" onClick={() => load()} aria-label={t.common.loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {t.admin.refreshBtn}
        </Button>
      </div>

      {/* الملخّص العام — 4 بطاقات مثل «إحصائياتي» لكن على مستوى كل المنصة */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-border/70">
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarCheck className="h-4 w-4" />
              <span className="text-xs font-bold">{t.admin.earningsAllCompleted}</span>
            </div>
            <p className="text-2xl font-black">{data?.grand.count ?? "—"}</p>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs font-bold">{t.cdash.gross}</span>
            </div>
            <p className="text-sm md:text-base font-black text-primary" dir="ltr">
              {bagText(data?.grand.gross, lang)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <Landmark className="h-4 w-4" />
              <span className="text-xs font-bold">
                {t.cdash.commission} ({Math.round((data?.commissionRate ?? PLATFORM_COMMISSION_RATE) * 100)}%)
              </span>
            </div>
            <p className="text-sm md:text-base font-black text-amber-600 dark:text-amber-400" dir="ltr">
              {bagText(data?.grand.commission, lang)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-primary">
              <LayoutDashboard className="h-4 w-4" />
              <span className="text-xs font-bold">{t.cdash.dueTitle}</span>
            </div>
            <p className="text-sm md:text-base font-black text-primary" dir="ltr">
              {bagText(data?.grand.dueThisMonth, lang)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* بطاقات المختصين — الأكثر جلسات مكتملة أولاً */}
      <div className="space-y-3">
        {(data?.counselors || []).map((c) => {
          const open = !!expanded[c.id];
          const hasSessions = c.completedCount > 0;
          return (
            <Card key={c.id} className={`border-border/70 ${hasSessions ? "" : "opacity-75"}`}>
              <CardContent className="p-4 space-y-3">
                {/* رأس البطاقة */}
                <div className="flex items-center gap-3">
                  <span className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                    <UserRound className="h-5 w-5 text-primary" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black truncate flex items-center gap-2" dir="auto">
                      {c.name}
                      {c.suspended && (
                        <Badge variant="outline" className="text-[9px] font-black text-destructive border-destructive/40 shrink-0">
                          {t.admin.earningsSuspendedBadge}
                        </Badge>
                      )}
                    </p>
                    {c.email && (
                      <p className="text-[10px] text-muted-foreground font-semibold truncate" dir="ltr">
                        {c.email}
                      </p>
                    )}
                  </div>
                  <div className="text-end shrink-0">
                    <p className="text-lg font-black leading-none">{c.completedCount}</p>
                    <p className="text-[9px] text-muted-foreground font-bold">{t.cdash.completedSessions}</p>
                  </div>
                  {hasSessions && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 shrink-0"
                      onClick={() => setExpanded((p) => ({ ...p, [c.id]: !p[c.id] }))}
                      aria-label={open ? t.admin.earningsHide : t.admin.earningsDetails}
                    >
                      {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  )}
                </div>

                {/* المبالغ — لكل عملة على حدة (بلا تحويل) */}
                {hasSessions ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div className="rounded-xl bg-muted/50 px-3 py-2">
                        <p className="text-[9px] font-bold text-muted-foreground">{t.cdash.gross}</p>
                        <p className="text-xs font-black text-primary truncate" dir="ltr">{bagText(c.gross, lang)}</p>
                      </div>
                      <div className="rounded-xl bg-amber-500/10 px-3 py-2">
                        <p className="text-[9px] font-bold text-amber-700 dark:text-amber-400">{t.cdash.commission} ({Math.round(PLATFORM_COMMISSION_RATE * 100)}%)</p>
                        <p className="text-xs font-black text-amber-600 dark:text-amber-400 truncate" dir="ltr">{bagText(c.commission, lang)}</p>
                      </div>
                      <div className="rounded-xl bg-muted/50 px-3 py-2">
                        <p className="text-[9px] font-bold text-muted-foreground">{t.admin.earningsNetHis}</p>
                        <p className="text-xs font-black truncate" dir="ltr">{bagText(c.net, lang)}</p>
                      </div>
                      <div className="rounded-xl bg-primary/5 border border-primary/20 px-3 py-2">
                        <p className="text-[9px] font-bold text-primary">{t.cdash.dueTitle}</p>
                        <p className="text-xs font-black text-primary truncate" dir="ltr">{bagText(c.dueThisMonth, lang)}</p>
                      </div>
                    </div>
                    {c.lastCompletedAt && (
                      <p className="text-[10px] text-muted-foreground font-semibold">
                        {t.admin.earningsLastCompleted}:{" "}
                        <span className="font-mono" dir="ltr">
                          {c.lastCompletedAt.slice(0, 16).replace("T", " ")}
                        </span>
                      </p>
                    )}

                    {/* التفاصيل القابلة للطي — آخر 8 جلسات */}
                    {open && (
                      <div className="space-y-2 rounded-xl border bg-card/60 p-3">
                        <h4 className="text-xs font-black">{t.cdash.recentTitle}</h4>
                        {c.recent.map((s, i) => {
                          const cur: CurrencyCode = s.currency === "EUR" || s.currency === "USD" ? s.currency : "DZD";
                          return (
                            <div key={i} className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2">
                              <div className="min-w-0">
                                <p className="text-xs font-bold truncate" dir="auto">
                                  {t.client.topics[s.topic as keyof typeof t.client.topics] ?? s.topic}
                                  <Badge variant="secondary" className="ms-1.5 text-[8px] font-bold">
                                    {t.session[`mode${s.mode}` as keyof typeof t.session] as string ?? s.mode}
                                  </Badge>
                                </p>
                                <p className="text-[10px] text-muted-foreground font-semibold truncate">
                                  {t.admin.earningsClientLabel}: <span dir="auto">{s.clientAlias || "—"}</span>
                                  <span className="font-mono ms-2" dir="ltr">
                                    {s.endedAt ? s.endedAt.slice(0, 16).replace("T", " ") : ""}
                                  </span>
                                </p>
                              </div>
                              <div className="text-end shrink-0">
                                <p className="text-xs font-black text-primary" dir="ltr">{fmtMoney(s.price, cur, lang)}</p>
                                <p className="text-[9px] text-amber-600 dark:text-amber-400 font-bold" dir="ltr">
                                  −{fmtMoney(s.commission, cur, lang)} ({t.cdash.commission})
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-[11px] text-muted-foreground font-semibold rounded-xl bg-muted/50 px-3.5 py-2.5">
                    {t.cdash.empty}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
        {!loading && (!data || data.counselors.length === 0) && (
          <p className="text-xs text-muted-foreground font-semibold text-center py-8">{t.admin.earningsNoCounselors}</p>
        )}
      </div>
    </div>
  );
}
