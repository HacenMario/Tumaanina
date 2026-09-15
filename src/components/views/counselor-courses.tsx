"use client";

/**
 * v1.19.0 — تبويب «الدورات الأونلاين» داخل لوحة الأخصائي:
 * إنشاء دورة في موضوع يختاره بمبلغ وعدد مقاعد يحددهما، إغلاق/فتح
 * الاشتراك، تعديل وحذف، وإدارة الملتحقين: تأكيد أو رفض مع سبب إلزامي
 * يصل للعميل إشعاراً. يصله إشعار فوري باسم العميل مع كل حجز مقعد،
 * وعدد المقاعد المتبقية يُحسب لحظياً من الخادم.
 * v1.20.0 — من صلاحية العيادات أيضاً (طلب المستخدم): المكوّن نفسه يعمل
 * بحساب عيادة (يُضمَّن في لوحة العيادة) بنفس كل المنطق والإشعارات.
 */
import { useCallback, useEffect, useState } from "react";
import {
  GraduationCap, Plus, Loader2, Users, Wallet, CalendarClock, Pencil, Trash2, Ban,
  CircleCheck, CircleX, Clock4, Lock, LockOpen, ChevronDown, Phone, Mail, Info, MessageSquareText,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { showAppToast } from "@/components/shared/app-toast";
import { formatDateTime } from "@/lib/utils";

interface EnrollmentRow {
  id: string;
  clientName: string;
  /* v1.21.0: معلومات تواصل المسجّل — تُعرض للمالك عند الضغط على اسمه */
  contactPhone: string | null;
  contactEmail: string | null;
  contactNote: string | null;
  price: number;
  status: string;
  rejectReason: string | null;
  createdAt: string;
}

interface CourseRow {
  id: string;
  title: string;
  description: string;
  price: number;
  capacity: number;
  taken: number;
  remaining: number;
  startsAt: string | null;
  status: string;
  createdAt: string;
  enrollments: EnrollmentRow[];
}

const EMPTY_FORM = { title: "", description: "", price: "", capacity: "", startsAt: "" };

export function CounselorCoursesSection() {
  const { t } = useI18n();
  const user = useApp((s) => s.user);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  /* نافذة الإنشاء/التعديل */
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CourseRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErr, setFormErr] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  /* نافذة الملتحقين */
  const [attCourse, setAttCourse] = useState<CourseRow | null>(null);
  /* v1.21.0: نافذة معلومات تواصل المسجّل — تفتح بالضغط على اسمه */
  const [contactEn, setContactEn] = useState<EnrollmentRow | null>(null);
  const [rejectIdx, setRejectIdx] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  /* حذف */
  const [delTarget, setDelTarget] = useState<CourseRow | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!user?.id || (user.role !== "COUNSELOR" && user.role !== "CLINIC")) return;
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/counselor/courses?userId=${user.id}`);
      const data = await res.json();
      setCourses(Array.isArray(data.courses) ? data.courses : []);
    } catch {
      setCourses([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormErr("");
    setFormOpen(true);
  };

  const openEdit = (c: CourseRow) => {
    setEditing(c);
    setForm({
      title: c.title,
      description: c.description,
      price: String(c.price),
      capacity: String(c.capacity),
      startsAt: c.startsAt ? new Date(c.startsAt).toISOString().slice(0, 10) : "",
    });
    setFormErr("");
    setFormOpen(true);
  };

  const submitForm = async () => {
    setFormErr("");
    const title = form.title.trim();
    const price = Math.round(Number(form.price));
    const capacity = Math.round(Number(form.capacity));
    if (!title || !Number.isFinite(price) || price < 0 || !Number.isFinite(capacity) || capacity < 1) {
      setFormErr(t.courses.formTitle);
      return;
    }
    setFormBusy(true);
    try {
      const payload: Record<string, unknown> = {
        title,
        description: form.description.trim(),
        price,
        capacity,
      };
      if (form.startsAt) payload.startsAt = new Date(form.startsAt).toISOString();
      if (editing) payload.userId = user?.id;
      const res = await fetch(editing ? `/api/courses/${editing.id}` : "/api/courses", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { ...payload, userId: user?.id, action: "update" } : { ...payload, userId: user?.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setFormOpen(false);
        showAppToast(editing ? t.courses.saveEdit : t.courses.submit, editing ? "" : t.courses.tabDesc);
        load(true);
      } else if (data.error === "CAPACITY_MIN" || data.error === "INVALID_CAPACITY") {
        setFormErr(t.courses.capacityMin);
      } else if (data.error === "NOT_VERIFIED") {
        setFormErr(t.counselor.pendingDesc);
      } else {
        setFormErr(t.common.errorServer);
      }
    } finally {
      setFormBusy(false);
    }
  };

  const toggleStatus = async (c: CourseRow) => {
    setBusy(c.id);
    try {
      const res = await fetch(`/api/courses/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user?.id, action: c.status === "open" ? "close" : "open" }),
      });
      if (res.ok) load(true);
    } finally {
      setBusy(null);
    }
  };

  const deleteCourse = async (c: CourseRow) => {
    setBusy(c.id);
    try {
      const res = await fetch(`/api/courses/${c.id}?userId=${user?.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        showAppToast(t.courses.deleteCourse, "");
        setDelTarget(null);
        load(true);
      }
    } finally {
      setBusy(null);
    }
  };

  /* قرار الأخصائي: تأكيد أو رفض بالسبب — يصل العميل إشعار فوراً */
  const decide = async (en: EnrollmentRow, action: "confirm" | "reject", reason = "") => {
    setBusy(en.id);
    try {
      const res = await fetch(`/api/courses/enrollments/${en.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user?.id, action, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setRejectIdx(null);
        setRejectReason("");
        /* تحديث فوري داخل نافذة الملتحقين وفي القائمة خلفها */
        const patch = (row: CourseRow): CourseRow => ({
          ...row,
          enrollments: row.enrollments.map((x) => (x.id === en.id ? { ...x, status: action === "confirm" ? "confirmed" : "rejected", rejectReason: action === "reject" ? reason : null } : x)),
          taken: row.taken + (action === "reject" && (en.status === "pending" || en.status === "confirmed") ? -1 : 0),
          remaining: row.remaining + (action === "reject" && (en.status === "pending" || en.status === "confirmed") ? 1 : 0),
        });
        setCourses((p) => p.map((r) => (r.id === attCourse?.id ? patch(r) : r)));
        setAttCourse((p) => (p ? patch(p) : p));
        load(true);
      } else if (data.error === "REASON_REQUIRED") {
        setRejectIdx(en.id);
      } else {
        showAppToast(t.common.errorServer, "");
      }
    } finally {
      setBusy(null);
    }
  };

  const statusBadge = (s: string) => {
    if (s === "confirmed") return <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0 gap-1"><CircleCheck className="h-3 w-3" />{t.courses.statusConfirmed}</Badge>;
    if (s === "rejected") return <Badge className="bg-destructive/10 text-destructive border-0 gap-1"><CircleX className="h-3 w-3" />{t.courses.statusRejected}</Badge>;
    if (s === "cancelled") return <Badge className="bg-muted text-muted-foreground border-0 gap-1"><CircleX className="h-3 w-3" />{t.courses.statusCancelled}</Badge>;
    return <Badge className="bg-amber-400/12 text-amber-600 dark:text-amber-400 border-0 gap-1"><Clock4 className="h-3 w-3" />{t.courses.statusPending}</Badge>;
  };

  return (
    <Card className="border-border/70">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            <div>
              <p className="font-black text-sm">{t.courses.tabTitle}</p>
              <p className="text-[11px] text-muted-foreground font-semibold">{t.courses.tabDesc}</p>
            </div>
          </div>
          <Button size="sm" className="gradient-primary text-white font-black rounded-xl gap-1.5" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            {t.courses.newCourse}
          </Button>
        </div>

        {loading ? (
          <div className="h-24 animate-pulse rounded-xl bg-muted/50" />
        ) : courses.length === 0 ? (
          <p className="text-xs font-bold text-muted-foreground py-6 text-center">{t.courses.noCourses}</p>
        ) : (
          <div className="space-y-2.5">
            {courses.map((c) => (
              <div key={c.id} className="rounded-xl border border-border/60 bg-muted/20 p-3.5 space-y-2.5 max-w-full">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <p className="font-black text-sm min-w-0 break-words">{c.title}</p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {c.status === "open" ? (
                      <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0">{t.courses.open}</Badge>
                    ) : (
                      <Badge className="bg-muted text-muted-foreground border-0 gap-1"><Lock className="h-3 w-3" />{t.courses.closed}</Badge>
                    )}
                  </div>
                </div>
                {c.description ? <p className="text-xs text-muted-foreground leading-relaxed break-words min-w-0">{c.description}</p> : null}
                <div className="flex items-center gap-2 flex-wrap text-[11px] font-bold text-muted-foreground">
                  <span className="inline-flex items-center gap-1 rounded-lg bg-primary/10 text-primary border border-primary/20 px-2 py-1" dir="ltr"><Wallet className="h-3 w-3" />{c.price.toLocaleString("en-US")} DZD</span>
                  <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{t.courses.seats.replace("{taken}", String(c.taken)).replace("{cap}", String(c.capacity))}</span>
                  {c.startsAt ? <span className="inline-flex items-center gap-1" dir="ltr"><CalendarClock className="h-3 w-3" />{formatDateTime(new Date(c.startsAt))}</span> : null}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Button size="sm" variant="outline" className="rounded-lg font-bold gap-1 h-8" onClick={() => { setAttCourse(c); setRejectIdx(null); }}>
                    <ChevronDown className="h-3.5 w-3.5" />
                    {t.courses.enrollments} ({c.enrollments.length})
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-lg font-bold gap-1 h-8 border-primary/40 text-primary" onClick={() => openEdit(c)}>
                    <Pencil className="h-3.5 w-3.5" />
                    {t.courses.editCourse}
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-lg font-bold gap-1 h-8" disabled={busy === c.id} onClick={() => void toggleStatus(c)}>
                    {c.status === "open" ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
                    {c.status === "open" ? t.courses.closeCourse : t.courses.reopenCourse}
                  </Button>
                  <Button size="sm" variant="ghost" className="rounded-lg font-bold gap-1 h-8 text-destructive" onClick={() => setDelTarget(c)}>
                    <Trash2 className="h-3.5 w-3.5" />
                    {t.courses.deleteCourse}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* نافذة الإنشاء/التعديل */}
      <Dialog open={formOpen} onOpenChange={(v) => { setFormOpen(v); if (!v) setEditing(null); }}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-start text-base flex items-center gap-2">
              <GraduationCap className="h-4.5 w-4.5 text-primary" />
              {editing ? t.courses.editCourse : t.courses.formTitle}
            </DialogTitle>
            <DialogDescription className="text-start text-xs leading-relaxed">{t.courses.formDesc}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label className="font-bold">{t.courses.titleLabel}</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="rounded-xl bg-card" maxLength={150} placeholder={t.courses.titlePh} />
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold">{t.courses.descLabel}</Label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="rounded-xl min-h-24" maxLength={2000} placeholder={t.courses.descPh} />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1.5">
                <Label className="font-bold">{t.courses.priceLabel}</Label>
                <Input type="number" min={0} dir="ltr" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} className="rounded-xl bg-card" />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold">{t.courses.capacityLabel}</Label>
                <Input type="number" min={1} dir="ltr" value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} className="rounded-xl bg-card" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold">{t.courses.startsLabel}</Label>
              <Input type="date" dir="ltr" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} className="rounded-xl bg-card" />
            </div>
            {formErr ? <div className="rounded-xl bg-destructive/10 text-destructive text-sm font-bold px-4 py-3">{formErr}</div> : null}
            <Button className="w-full gradient-primary text-white font-black rounded-xl h-12" disabled={formBusy} onClick={() => void submitForm()}>
              {formBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GraduationCap className="h-4 w-4" />}
              {editing ? t.courses.saveEdit : t.courses.submit}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* نافذة الملتحقين — تأكيد / رفض بالسبب */}
      <Dialog open={!!attCourse} onOpenChange={(v) => { if (!v) { setAttCourse(null); setRejectIdx(null); } }}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-start text-base flex items-center gap-2">
              <Users className="h-4.5 w-4.5 text-primary" />
              {t.courses.enrollments} — {attCourse?.title}
            </DialogTitle>
            <DialogDescription className="text-start text-xs leading-relaxed">
              {attCourse ? t.courses.seats.replace("{taken}", String(attCourse.taken)).replace("{cap}", String(attCourse.capacity)) : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2.5">
            {/* v1.21.0: تنبيه المختص — الضغط على اسم المسجّل يظهر معلومات التواصل الخاصة به */}
            <div className="flex items-start gap-1.5 rounded-xl bg-primary/10 text-primary px-3 py-2 text-[11px] font-bold leading-relaxed">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{t.courses.tapForContact}</span>
            </div>
            {(attCourse?.enrollments || []).length === 0 ? (
              <p className="text-center text-sm font-bold text-muted-foreground py-6">{t.courses.noEnrollmentsYet}</p>
            ) : (
              attCourse?.enrollments.map((en) => (
                <div key={en.id} className={`rounded-xl border px-3.5 py-3 space-y-2 ${en.status === "rejected" || en.status === "cancelled" ? "border-border/40 bg-muted/30 opacity-70" : "border-border/70 bg-card"}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    {/* v1.21.0: الاسم زر — الضغط عليه يفتح نافذة معلومات التواصل */}
                    <button
                      type="button"
                      onClick={() => setContactEn(en)}
                      title={t.courses.tapForContact}
                      className="text-xs font-black truncate max-w-full text-start underline decoration-dotted decoration-primary/50 underline-offset-4 hover:text-primary transition-colors"
                    >
                      {en.clientName}
                    </button>
                    {statusBadge(en.status)}
                  </div>
                  <p className="text-[10px] font-bold text-muted-foreground" dir="ltr">{t.courses.bookedAt}: {formatDateTime(new Date(en.createdAt))}</p>
                  {en.status === "rejected" && en.rejectReason ? (
                    <p className="text-[11px] font-semibold text-destructive">{t.courses.rejectReasonLabel}: {en.rejectReason}</p>
                  ) : null}
                  {en.status === "pending" ? (
                    rejectIdx === en.id ? (
                      <div className="flex items-center gap-1.5">
                        <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="rounded-lg bg-card h-9 text-xs" maxLength={300} placeholder={t.courses.rejectReasonPh} />
                        <Button size="sm" className="bg-destructive text-white font-black rounded-lg h-9 shrink-0" disabled={!rejectReason.trim() || busy === en.id} onClick={() => void decide(en, "reject", rejectReason.trim())}>
                          {t.courses.rejectBtn}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Button size="sm" className="gradient-primary text-white font-black rounded-lg h-8 gap-1" disabled={busy === en.id} onClick={() => void decide(en, "confirm")}>
                          <CircleCheck className="h-3.5 w-3.5" />
                          {t.courses.confirmBtn}
                        </Button>
                        <Button size="sm" variant="outline" className="rounded-lg font-bold h-8 gap-1 text-destructive border-destructive/40" disabled={busy === en.id} onClick={() => { setRejectIdx(en.id); setRejectReason(""); }}>
                          <Ban className="h-3.5 w-3.5" />
                          {t.courses.rejectBtn}
                        </Button>
                      </div>
                    )
                  ) : null}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* v1.21.0: نافذة معلومات تواصل المسجّل — للمالك حصراً */}
      <Dialog open={!!contactEn} onOpenChange={(v) => { if (!v) setContactEn(null); }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-start text-base flex items-center gap-2">
              <Phone className="h-4.5 w-4.5 text-primary" />
              {t.courses.contactInfo}
            </DialogTitle>
            <DialogDescription className="text-start text-sm font-bold">{contactEn?.clientName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2.5">
            {contactEn?.contactPhone ? (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3.5 py-2.5">
                <span className="text-xs font-bold text-muted-foreground shrink-0">{t.courses.phoneLabel}</span>
                <a href={`tel:${contactEn.contactPhone}`} className="text-sm font-black text-primary hover:underline truncate" dir="ltr">{contactEn.contactPhone}</a>
              </div>
            ) : null}
            {contactEn?.contactEmail ? (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3.5 py-2.5">
                <span className="text-xs font-bold text-muted-foreground shrink-0 flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{t.courses.emailLabel}</span>
                <a href={`mailto:${contactEn.contactEmail}`} className="text-xs font-black text-primary hover:underline truncate min-w-0" dir="ltr">{contactEn.contactEmail}</a>
              </div>
            ) : null}
            {contactEn?.contactNote ? (
              <div className="space-y-1 rounded-xl bg-muted/40 px-3.5 py-2.5">
                <span className="text-xs font-bold text-muted-foreground flex items-center gap-1"><MessageSquareText className="h-3.5 w-3.5" />{t.courses.noteLabel}</span>
                <p className="text-xs font-semibold leading-relaxed break-words whitespace-pre-line">{contactEn.contactNote}</p>
              </div>
            ) : null}
            {!contactEn?.contactPhone && !contactEn?.contactEmail && !contactEn?.contactNote ? (
              <p className="text-xs font-bold text-muted-foreground text-center py-3">{t.courses.noContactInfo}</p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* نافذة تأكيد الحذف */}
      <Dialog open={!!delTarget} onOpenChange={(v) => { if (!v) setDelTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-start text-base flex items-center gap-2">
              <CircleX className="h-4.5 w-4.5 text-destructive" />
              {t.courses.deleteCourse}
            </DialogTitle>
            <DialogDescription className="text-start text-sm font-bold">{delTarget?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground font-semibold leading-relaxed">{t.courses.deleteConfirm}</p>
            <Button className="w-full bg-destructive text-white font-black rounded-xl h-11" disabled={!!busy} onClick={() => delTarget && void deleteCourse(delTarget)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {t.courses.deleteCourse}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
