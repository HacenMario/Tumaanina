"use client";

/**
 * v1.19.0 — صفحة الدورات الأونلاين:
 * دورات يصوغها الأخصائيون والعيادات في مواضيع يختارونها مقابل مبلغ
 * وعدد مقاعد يحددونهما. العدد المتبقي يُحسب لحظياً من الخادم مع كل قراءة،
 * وبعد كل حجز يتحدث فوراً في الواجهة. المتصفح يتابع حجوزاته وحالاتها
 * من الأسفل، ويصل الطرفان إشعارات فورية عند الحجز والتأكيد والرفض
 * (بالسبب) والإلغاء.
 * v1.20.0 (طلب المستخدم):
 *  — الصفحة لكل الأدوار المسجّلة (عميل/أخصائي/عيادة/إدارة).
 *  — ترقيم صفحات: 5 بطاقات دورات في الصفحة الواحدة.
 *  — بطاقة دورة أجمل: رأس متدرّج بخلفية تفاعلية + شريط تقدّم المقاعد
 *    + شارات نظيفة بدل النصوص المكتظة، مع أنيميشن دخول ورفع عند التحويم.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { GraduationCap, Users, CalendarClock, Loader2, Wallet, Stethoscope, Building2, CircleCheck, CircleX, Clock4, RefreshCw, SearchX, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { showAppToast } from "@/components/shared/app-toast";
import { BackButton } from "@/components/shared/back-button";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 5; /* طلب المستخدم: 5 بطاقات دورات في الصفحة */

interface CourseItem {
  id: string;
  title: string;
  description: string;
  price: number;
  capacity: number;
  taken: number;
  remaining: number;
  startsAt: string | null;
  status: string;
  specialist: { id: string; name: string; rating: number; photoUrl: string | null; role?: string };
  myStatus: string | null;
  myEnrollmentId: string | null;
}

interface MyEnrollment {
  id: string;
  courseId: string;
  title: string;
  price: number;
  startsAt: string | null;
  specialistName: string;
  status: string;
  rejectReason: string | null;
  createdAt: string;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return formatDateTime(d);
}

export function CoursesView() {
  const { t } = useI18n();
  const user = useApp((s) => s.user);
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [myEnrolls, setMyEnrolls] = useState<MyEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  /* ترقيم الصفحات — 5 بطاقات في الصفحة */
  const [page, setPage] = useState(1);
  /* نافذة تأكيد الحجز */
  const [target, setTarget] = useState<CourseItem | null>(null);
  /* إلغاء الحجز */
  const [cancelTarget, setCancelTarget] = useState<MyEnrollment | null>(null);

  /* v1.20.0: الصفحة لكل الأدوار المسجّلة — غير المسجل يرى دعوة الدخول */
  const canBrowse = !!user?.id;

  const load = useCallback(async (silent = false) => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/courses?userId=${user.id}`);
      const data = await res.json();
      setCourses(Array.isArray(data.courses) ? data.courses : []);
      setMyEnrolls(Array.isArray(data.myEnrollments) ? data.myEnrollments : []);
    } catch {
      setCourses([]);
      setMyEnrolls([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  /* ترقيم الصفحات محلي — 5 بطاقات لكل صفحة */
  const pages = Math.max(1, Math.ceil(courses.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pageCourses = useMemo(
    () => courses.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [courses, safePage]
  );
  useEffect(() => {
    setPage(1);
  }, [courses.length]);

  const enroll = async (c: CourseItem) => {
    if (!user?.id) return;
    setBusy(c.id);
    try {
      const res = await fetch(`/api/courses/${c.id}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, name: user.pseudonym || "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        /* تحديث لحظي في الواجهة — المقعد يُحجز فوراً */
        setCourses((p) => p.map((x) => (x.id === c.id ? { ...x, taken: x.taken + 1, remaining: Math.max(0, x.remaining - 1), myStatus: "pending" } : x)));
        showAppToast(t.courses.statusPending, t.courses.enrollNote);
        setTarget(null);
        load(true);
      } else if (data.error === "COURSE_FULL") {
        showAppToast(t.courses.seatsFull, "");
        setCourses((p) => p.map((x) => (x.id === c.id ? { ...x, remaining: 0 } : x)));
      } else if (data.error === "ALREADY_BOOKED") {
        showAppToast(t.courses.statusPending, "");
      } else if (data.error === "COURSE_CLOSED") {
        showAppToast(t.courses.closed, "");
        load(true);
      } else {
        showAppToast(t.common.errorServer, "");
      }
    } finally {
      setBusy(null);
    }
  };

  const cancelBooking = async (e: MyEnrollment) => {
    if (!user?.id) return;
    setBusy(e.id);
    try {
      const res = await fetch(`/api/courses/enrollments/${e.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, action: "cancel" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setCourses((p) => p.map((x) => (x.id === e.courseId ? { ...x, taken: Math.max(0, x.taken - 1), remaining: x.remaining + 1, myStatus: null, myEnrollmentId: null } : x)));
        showAppToast(t.courses.statusCancelled, t.courses.cancelNote);
        setCancelTarget(null);
        load(true);
      } else {
        showAppToast(t.common.errorServer, "");
      }
    } finally {
      setBusy(null);
    }
  };

  const statusBadge = (s: string, reason?: string | null) => {
    if (s === "confirmed") return <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0 gap-1"><CircleCheck className="h-3 w-3" />{t.courses.statusConfirmed}</Badge>;
    if (s === "rejected") return <Badge className="bg-destructive/10 text-destructive border-0 gap-1"><CircleX className="h-3 w-3" />{t.courses.statusRejected}{reason ? ` · ${reason}` : ""}</Badge>;
    if (s === "cancelled") return <Badge className="bg-muted text-muted-foreground border-0 gap-1"><CircleX className="h-3 w-3" />{t.courses.statusCancelled}</Badge>;
    return <Badge className="bg-amber-400/12 text-amber-600 dark:text-amber-400 border-0 gap-1"><Clock4 className="h-3 w-3" />{t.courses.statusPending}</Badge>;
  };

  if (!canBrowse) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
        <GraduationCap className="h-10 w-10 mx-auto text-muted-foreground/40" />
        <p className="text-muted-foreground font-semibold">{t.courses.loginNeeded}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 md:py-14 overflow-x-hidden">
      <BackButton />
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-2 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <GraduationCap className="h-5.5 w-5.5 text-primary" />
          </div>
          <h1 className="text-2xl md:text-3xl font-black">{t.courses.title}</h1>
        </div>
        <p className="text-muted-foreground leading-relaxed">{t.courses.desc}</p>
      </motion.div>

      {loading ? (
        <Card className="h-64 animate-pulse bg-muted/50 border-border/50 max-w-full" />
      ) : courses.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center space-y-3 text-muted-foreground">
            <SearchX className="h-10 w-10 mx-auto opacity-40" />
            <p className="font-semibold">{t.courses.empty}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {pageCourses.map((c, i) => {
            /* v1.20.0: بطاقة أجمل — رأس متدرّج + شريط مقاعد + شارات */
            const pct = c.capacity > 0 ? Math.min(100, Math.round((c.taken / c.capacity) * 100)) : 0;
            const full = c.remaining <= 0;
            const isClinicOwner = c.specialist.role === "CLINIC";
            return (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.05, 0.25) }}
              >
                <Card className="group border-border/70 overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 max-w-full">
                  {/* رأس البطاقة — خلفية تفاعلية لا تحجب المحتوى */}
                  <div className="card-aurora relative px-5 pt-4 pb-4">
                    <div className="relative z-10 space-y-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <h2 className="font-black text-lg leading-snug min-w-0 break-words flex items-start gap-2">
                          <span className="h-8 w-8 rounded-xl bg-white/70 dark:bg-black/30 text-primary flex items-center justify-center shrink-0 shadow-sm">
                            <GraduationCap className="h-4.5 w-4.5" />
                          </span>
                          <span className="min-w-0">{c.title}</span>
                        </h2>
                        <Badge
                          className={cn(
                            "shrink-0 gap-1 border-0 font-black px-3 py-1.5 shadow-sm",
                            full ? "bg-destructive/10 text-destructive" : "gradient-primary text-white"
                          )}
                          dir="ltr"
                        >
                          <Wallet className="h-3.5 w-3.5" />
                          {c.price > 0 ? `${c.price.toLocaleString("en-US")} DZD` : "—"}
                        </Badge>
                      </div>
                      {/* شريط تقدّم المقاعد — يتحرك مع كل حجز */}
                      <div className="space-y-1.5">
                        <div className="h-2 rounded-full bg-white/60 dark:bg-black/30 overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-700",
                              full ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-gradient-to-r from-emerald-500 to-teal-500"
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
                          <span className={cn("inline-flex items-center gap-1", full ? "text-destructive" : "text-foreground/80")}>
                            <Users className="h-3.5 w-3.5" />
                            {full ? t.courses.seatsFull : t.courses.seats.replace("{taken}", String(c.taken)).replace("{cap}", String(c.capacity))}
                          </span>
                          <span className="text-muted-foreground font-mono" dir="ltr">{pct}%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <CardContent className="p-5 space-y-3.5 min-w-0">
                    {c.description ? (
                      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line break-words min-w-0 line-clamp-3">{c.description}</p>
                    ) : null}
                    <div className="flex items-center gap-2 flex-wrap text-xs font-bold text-muted-foreground">
                      {c.startsAt ? (
                        <span className="inline-flex items-center gap-1.5 rounded-xl bg-muted/70 px-3 py-1.5" dir="ltr">
                          <CalendarClock className="h-3.5 w-3.5 text-primary" />{t.courses.schedule}: {fmtDate(c.startsAt)}
                        </span>
                      ) : null}
                      {c.remaining > 0 ? (
                        <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0 gap-1">
                          <Users className="h-3 w-3" />
                          {c.remaining === 1 ? t.courses.seatsLeftOne : t.courses.seatsLeft.replace("{n}", String(c.remaining))}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-border/60">
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar className="h-9 w-9 rounded-xl border border-border/60 shrink-0">
                          {c.specialist.photoUrl ? <AvatarImage src={c.specialist.photoUrl} alt={c.specialist.name} className="rounded-xl object-cover" /> : null}
                          <AvatarFallback className="gradient-primary text-white rounded-xl font-black text-sm">{c.specialist.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-[11px] text-muted-foreground font-bold flex items-center gap-1">
                            {isClinicOwner ? <Building2 className="h-3 w-3" /> : <Stethoscope className="h-3 w-3" />}
                            {t.courses.by}
                          </p>
                          <p className="text-sm font-black truncate flex items-center gap-1.5">
                            <span className="truncate">{c.specialist.name}</span>
                            <span className="inline-flex items-center gap-0.5 text-amber-500 text-[11px] shrink-0" dir="ltr">
                              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                              {c.specialist.rating?.toFixed?.(1) || c.specialist.rating}
                            </span>
                          </p>
                        </div>
                      </div>
                      {c.myStatus ? (
                        <div className="flex items-center gap-2">
                          {statusBadge(c.myStatus)}
                          {c.myEnrollmentId ? (
                            <Button size="sm" variant="outline" className="rounded-lg font-bold text-destructive border-destructive/40 h-8" disabled={busy === c.id} onClick={() => { const en = myEnrolls.find((x) => x.id === c.myEnrollmentId); setCancelTarget(en || { id: c.myEnrollmentId!, courseId: c.id, title: c.title, price: c.price, startsAt: c.startsAt, specialistName: c.specialist.name, status: c.myStatus || "pending", rejectReason: null, createdAt: "" }); }}>
                              {t.courses.cancelBooking}
                            </Button>
                          ) : null}
                        </div>
                      ) : (
                        <Button size="sm" className="gradient-primary text-white font-black rounded-xl gap-1.5 shadow-md shadow-primary/20 hover:shadow-lg transition-all" disabled={c.remaining <= 0 || busy === c.id} onClick={() => setTarget(c)}>
                          <GraduationCap className="h-3.5 w-3.5" />
                          {c.remaining <= 0 ? t.courses.seatsFull : t.courses.enroll}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}

          {/* ترقيم الصفحات — 5 بطاقات في الصفحة */}
          {pages > 1 ? (
            <div className="flex items-center justify-center gap-3 pt-1">
              <Button variant="outline" size="sm" className="rounded-lg font-bold gap-1" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
                <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                {t.directory.prev}
              </Button>
              <span className="text-xs font-bold text-muted-foreground font-mono px-1" dir="ltr">{t.directory.pageInfo.replace("{p}", String(safePage)).replace("{n}", String(pages))}</span>
              <Button variant="outline" size="sm" className="rounded-lg font-bold gap-1" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)}>
                {t.directory.next}
                <ChevronRight className="h-4 w-4 rtl:rotate-180" />
              </Button>
            </div>
          ) : null}

          <div className="flex justify-center pt-1">
            <Button variant="outline" size="sm" className="rounded-lg font-bold gap-1.5" onClick={() => load()}>
              <RefreshCw className="h-3.5 w-3.5" />
              {t.clinicDash.refresh}
            </Button>
          </div>
        </div>
      )}

      {/* حجوزاتي — تتبع الحالة حتى بعد الرفض/الإلغاء */}
      {myEnrolls.length > 0 ? (
        <div className="mt-10 space-y-3">
          <h2 className="font-black text-lg">{t.courses.myEnrollments}</h2>
          <div className="space-y-2">
            {myEnrolls.map((e) => (
              <Card key={e.id} className="border-border/60">
                <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-black text-sm truncate">{e.title}</p>
                    <p className="text-[11px] font-bold text-muted-foreground truncate">
                      {t.courses.by} {e.specialistName}
                      {e.startsAt ? ` · ${t.courses.schedule}: ${fmtDate(e.startsAt)}` : ""}
                      {" · "}
                      <span dir="ltr">{fmtDate(e.createdAt)}</span>
                    </p>
                    {e.status === "rejected" && e.rejectReason ? (
                      <p className="text-[11px] font-semibold text-destructive mt-1">{t.courses.rejectReasonLabel}: {e.rejectReason}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {statusBadge(e.status, e.rejectReason)}
                    {e.status === "pending" || e.status === "confirmed" ? (
                      <Button size="sm" variant="outline" className="rounded-lg font-bold text-destructive border-destructive/40 h-8" disabled={busy === e.id} onClick={() => setCancelTarget(e)}>
                        {t.courses.cancelBooking}
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {/* نافذة تأكيد الحجز */}
      <Dialog open={!!target} onOpenChange={(v) => { if (!v) setTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-start text-base flex items-center gap-2">
              <GraduationCap className="h-4.5 w-4.5 text-primary" />
              {t.courses.enrollConfirmTitle}
            </DialogTitle>
            <DialogDescription className="text-start text-sm font-bold">{target?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3.5 py-2.5 text-sm font-bold">
              <span className="inline-flex items-center gap-1.5"><Wallet className="h-4 w-4 text-primary" />{target?.price.toLocaleString("en-US")} DZD</span>
              <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Users className="h-4 w-4" />{target ? t.courses.seatsRemaining.replace("{n}", String(target.remaining)) : ""}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed font-semibold">{t.courses.enrollNote}</p>
            <Button className="w-full gradient-primary text-white font-black rounded-xl h-11" disabled={!!busy} onClick={() => target && void enroll(target)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GraduationCap className="h-4 w-4" />}
              {t.courses.enroll}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* نافذة تأكيد إلغاء الحجز */}
      <Dialog open={!!cancelTarget} onOpenChange={(v) => { if (!v) setCancelTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-start text-base flex items-center gap-2">
              <CircleX className="h-4.5 w-4.5 text-destructive" />
              {t.courses.cancelBooking}
            </DialogTitle>
            <DialogDescription className="text-start text-sm font-bold">{cancelTarget?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed font-semibold">{t.courses.cancelNote}</p>
            <Button className="w-full bg-destructive text-white font-black rounded-xl h-11" disabled={!!busy} onClick={() => cancelTarget && void cancelBooking(cancelTarget)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleX className="h-4 w-4" />}
              {t.courses.cancelBooking}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
