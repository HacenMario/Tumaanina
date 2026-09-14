"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Megaphone, Check, Ban, Trash2, RefreshCw, Loader2, Phone, Mail, MapPin, Building2,
  BadgeCheck, ShieldX, Wallet, DollarSign, Eye, Heart, MessageCircle, Zap, TrendingUp, Pin, PinOff,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { showAppToast } from "@/components/shared/app-toast";
import { WhatsAppGlyph } from "@/components/session/whatsapp-panel";
import { waLink } from "@/lib/whatsapp";
import { WILAYA_LIST } from "@/lib/constants";
import { cn , formatDateTime} from "@/lib/utils";

/* ═ v1.15.0 — تبويب «إعلانات العيادات» في لوحة الإدارة ═
   سير عمل واقعي كامل:
   • العيادة تنشر إعلاناً (بانتظار المراجعة)
   • الأدمين يحدد مبلغ المستحقات → يصل إشعار فوري للعيادة بالتواصل والسداد
   • الأدمين يحدّد «تم السداد» بعد استلام المبلغ (مع مرجع)
   • الموافقة على النشر (تشترط السداد إن حُدد مبلغ) + تفعيل العرض العائم
     (كم مرة يظهر لكل مستخدم + مدة صلاحيته بالأيام)
   • إحصاءات مستحقات كل عيادة (الإجمالي/المسدد/المتأخر)
   كل بيانات المستحقات تظهر هنا وللعيادة فقط — لا تُرسل للعموم. */

interface AdAdminRow {
  id: string;
  title: string;
  body: string;
  mediaCount: number;
  imageUrl: string | null;
  status: string;
  adminNote: string | null;
  paymentNote: string | null;
  amountDue: number;
  paid: boolean;
  paidAt: string | null;
  float: boolean;
  floatPerUser: number;
  floatDays: number;
  expiresAt: string | null;
  views: number;
  likesCount: number;
  commentsCount: number;
  reviewedAt: string | null;
  createdAt: string;
  clinic: {
    id: string;
    name: string;
    slug: string | null;
    wilaya: string | null;
    city: string | null;
    address: string | null;
    phones: string[];
    whatsapp: string | null;
    contactEmail: string | null;
    isActive: boolean;
  };
}

interface StatsRow {
  clinicId: string;
  clinicName: string;
  clinicSlug: string | null;
  adsCount: number;
  approvedCount: number;
  duesTotal: number;
  duesPaid: number;
  duesPending: number;
}

const PAGE = 12;

export function AdminClinicAdsTab() {
  const { t, lang } = useI18n();
  const [ads, setAds] = useState<AdAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  /* الإحصاءات */
  const [statsOpen, setStatsOpen] = useState(false);
  const [stats, setStats] = useState<{ rows: StatsRow[]; totals: { adsCount: number; duesTotal: number; duesPaid: number; duesPending: number } } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  /* نافذتا الموافقة والرفض */
  const [approveId, setApproveId] = useState<AdAdminRow | null>(null);
  const [paymentNote, setPaymentNote] = useState("");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [busy, setBusy] = useState(false);

  const token = () => (typeof window !== "undefined" && localStorage.getItem("tumaanina-admin-token")) || "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ads/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": token() },
        body: JSON.stringify({ action: "ads-list", status: statusFilter === "all" ? undefined : statusFilter, page }),
      });
      const data = await res.json();
      setAds(data.ads || []);
      setPages(data.pages || 1);
    } catch {
      setAds([]);
      setPages(1);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  const loadStats = async () => {
    setStatsOpen(true);
    setStatsLoading(true);
    try {
      const res = await fetch("/api/ads/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": token() },
        body: JSON.stringify({ action: "ads-stats" }),
      });
      setStats(await res.json());
    } catch {
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  };

  const act = async (action: string, id: string, extra?: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch("/api/ads/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": token() },
        body: JSON.stringify({ action, id, ...extra }),
      });
      const data = await res.json();
      if (data.ok) {
        showAppToast(t.adminAds.done, "");
        setApproveId(null);
        setRejectId(null);
        setPaymentNote("");
        setAdminNote("");
        load();
      } else if (data.error === "DUES_NOT_PAID") {
        showAppToast(t.adminAds.duesNotPaid, "");
      } else {
        showAppToast(t.common.errorServer, data.error || "");
      }
    } finally {
      setBusy(false);
    }
  };

  const statusBadge = (s: string) => {
    if (s === "APPROVED") return <Badge className="bg-primary/12 text-primary border-0">{t.clinicDash.adApproved}</Badge>;
    if (s === "REJECTED") return <Badge className="bg-destructive/10 text-destructive border-0">{t.clinicDash.adRejected}</Badge>;
    return <Badge className="bg-amber-400/12 text-amber-600 dark:text-amber-400 border-0">{t.clinicDash.adPending}</Badge>;
  };

  const wilayaLabel = (w: string | null) => {
    if (!w) return "";
    const rec = WILAYA_LIST.find((x) => x.key === w);
    return rec ? (lang === "ar" ? rec.ar : lang === "fr" ? rec.fr : rec.en) : w;
  };

  /* v1.16.0: التنسيق الموحد YYYY/MM/DD HH:MM:SS في كل مكان */
  const fmtDate = (iso: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return formatDateTime(d);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="rounded-xl bg-card font-semibold w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="PENDING">{t.adminAds.filterPending}</SelectItem>
            <SelectItem value="APPROVED">{t.adminAds.filterApproved}</SelectItem>
            <SelectItem value="REJECTED">{t.adminAds.filterRejected}</SelectItem>
            <SelectItem value="all">{t.adminAds.filterAll}</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="rounded-xl font-bold gap-1.5" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" />
          {t.clinicDash.refresh}
        </Button>
        {/* إحصاءات المستحقات لكل عيادة */}
        <Button variant="outline" size="sm" className="rounded-xl font-bold gap-1.5 border-primary/40 text-primary" onClick={() => void loadStats()}>
          <TrendingUp className="h-3.5 w-3.5" />
          {t.adminAds.statsBtn}
        </Button>
      </div>

      <div className="rounded-xl bg-amber-400/[0.07] border border-amber-400/40 px-4 py-3 text-xs font-bold text-amber-700 dark:text-amber-400 leading-relaxed">
        {t.adminAds.notice}
      </div>

      {/* v1.17.0: معلومة إدارية سرّية — ترتيب صفحة الإعلانات العمومية */}
      <div className="rounded-xl bg-indigo-500/[0.07] border border-indigo-400/40 px-4 py-3 text-xs font-bold text-indigo-700 dark:text-indigo-300 leading-relaxed">
        {t.adminAds.orderNote}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : ads.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center space-y-3 text-muted-foreground">
            <Megaphone className="h-10 w-10 mx-auto opacity-40" />
            <p className="font-semibold">{t.adminAds.empty}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {ads.map((a) => (
            <Card key={a.id} className="border-border/70">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="font-black leading-snug">{a.title}</p>
                    <p className="text-[11px] text-muted-foreground font-semibold mt-0.5" dir="auto">
                      {formatDateTime(a.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {a.float ? <Badge className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-0 gap-1"><Zap className="h-3 w-3" />{t.adminAds.floatOn}</Badge> : null}
                    {statusBadge(a.status)}
                  </div>
                </div>

                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{a.body}</p>
                {a.mediaCount > 0 ? (
                  <p className="text-[11px] font-bold text-muted-foreground">{t.adminAds.mediaCount.replace("{n}", String(a.mediaCount))}</p>
                ) : null}

                {/* بطاقة العيادة الناشرة — بيانات التواصل كاملة للأدمين */}
                <div className="rounded-xl border border-primary/25 bg-primary/5 p-3.5 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Building2 className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-black text-sm">{a.clinic.name}</span>
                    {a.clinic.isActive ? (
                      <BadgeCheck className="h-4 w-4 text-primary" />
                    ) : (
                      <Badge className="bg-destructive/10 text-destructive border-0 gap-1"><ShieldX className="h-3 w-3" />{t.adminAds.clinicDisabled}</Badge>
                    )}
                  </div>
                  {(a.clinic.wilaya || a.clinic.city || a.clinic.address) ? (
                    <p className="text-xs font-semibold text-muted-foreground flex items-start gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                      {[a.clinic.address, a.clinic.city, wilayaLabel(a.clinic.wilaya)].filter(Boolean).join("، ")}
                    </p>
                  ) : null}
                  <div className="flex items-center gap-2 flex-wrap">
                    {a.clinic.phones.map((p) => (
                      <a key={p} href={`tel:${p}`} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-card text-primary px-2.5 py-1.5 text-xs font-black" dir="ltr">
                        <Phone className="h-3.5 w-3.5" />
                        {p}
                      </a>
                    ))}
                    {(() => {
                      const wa = waLink(a.clinic.whatsapp, t.adminAds.waIntro.replace("{clinic}", a.clinic.name));
                      if (!wa) return null;
                      return (
                        <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] hover:bg-[#1fb857] text-white px-3 py-1.5 text-xs font-black">
                          <WhatsAppGlyph className="h-3.5 w-3.5" />
                          WhatsApp
                        </a>
                      );
                    })()}
                    {a.clinic.contactEmail ? (
                      <a href={`mailto:${a.clinic.contactEmail}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border text-muted-foreground px-2.5 py-1.5 text-xs font-bold" dir="ltr">
                        <Mail className="h-3.5 w-3.5" />
                        {a.clinic.contactEmail}
                      </a>
                    ) : null}
                  </div>
                </div>

                {/* ══ المستحقات — سرّية بين الإدارة والعيادة ══ */}
                <div className="rounded-xl border border-border/70 bg-muted/30 p-3.5 space-y-2.5">
                  <p className="text-[11px] font-black text-muted-foreground flex items-center gap-1.5">
                    <Wallet className="h-3.5 w-3.5" />
                    {t.adminAds.duesSection}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label className="text-xs font-bold">{t.adminAds.duesAmount}</Label>
                    <Input
                      type="number"
                      min={0}
                      defaultValue={a.amountDue || 0}
                      id={`dues-${a.id}`}
                      className="rounded-lg bg-card w-32 h-9 font-black"
                      dir="ltr"
                    />
                    <span className="text-[11px] font-bold text-muted-foreground">{t.clinicDash.dz}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg font-black h-9 gap-1 border-primary/40 text-primary"
                      disabled={busy}
                      onClick={() => act("ads-set-dues", a.id, { amount: Number((document.getElementById(`dues-${a.id}`) as HTMLInputElement)?.value || 0) })}
                    >
                      <DollarSign className="h-3.5 w-3.5" />
                      {t.adminAds.setDues}
                    </Button>
                    {a.amountDue > 0 ? (
                      a.paid ? (
                        <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0 gap-1"><Check className="h-3 w-3" />{t.adminAds.paidYes}</Badge>
                      ) : (
                        <Badge className="bg-amber-400/12 text-amber-600 dark:text-amber-400 border-0 gap-1">{t.adminAds.paidNo}</Badge>
                      )
                    ) : null}
                    {a.amountDue > 0 && !a.paid ? (
                      <Button size="sm" variant="outline" className="rounded-lg font-black h-9 gap-1 border-emerald-500/40 text-emerald-600 dark:text-emerald-400" disabled={busy} onClick={() => act("ads-set-paid", a.id, { paid: true })}>
                        <Check className="h-3.5 w-3.5" />
                        {t.adminAds.markPaid}
                      </Button>
                    ) : null}
                    {a.paid && a.amountDue > 0 ? (
                      <Button size="sm" variant="ghost" className="rounded-lg font-bold h-9 text-muted-foreground gap-1" disabled={busy} onClick={() => act("ads-set-paid", a.id, { paid: false })}>
                        {t.adminAds.markUnpaid}
                      </Button>
                    ) : null}
                  </div>
                  {a.paid && a.paidAt ? (
                    <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">{t.adminAds.paidOn.replace("{d}", fmtDate(a.paidAt))}</p>
                  ) : null}
                  {/* تفعيل العرض العائم */}
                  <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-border/60">
                    <Label className="text-xs font-bold flex items-center gap-1.5 pt-1.5"><Zap className="h-3.5 w-3.5 text-indigo-500" />{t.adminAds.floatSection}</Label>
                    <Button
                      size="sm"
                      variant={a.float ? "default" : "outline"}
                      className={cn("rounded-lg font-black h-9 gap-1", a.float ? "bg-indigo-500 text-white" : "border-indigo-500/40 text-indigo-600 dark:text-indigo-400")}
                      disabled={busy}
                      onClick={() => act("ads-set-float", a.id, { float: !a.float, perUser: a.floatPerUser, days: a.floatDays })}
                    >
                      {a.float ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                      {a.float ? t.adminAds.floatDisable : t.adminAds.floatEnable}
                    </Button>
                    {a.float ? (
                      <span className="text-[10px] font-bold text-muted-foreground">
                        {t.adminAds.floatMeta.replace("{n}", String(a.floatPerUser)).replace("{d}", String(a.floatDays))}
                        {a.expiresAt ? ` — ${t.adminAds.expires.replace("{d}", fmtDate(a.expiresAt))}` : ""}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* تفاعلات الجمهور */}
                {a.status === "APPROVED" ? (
                  <div className="flex items-center gap-3 text-[11px] font-bold text-muted-foreground flex-wrap">
                    <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{a.views}</span>
                    <span className="inline-flex items-center gap-1 text-rose-500"><Heart className="h-3.5 w-3.5 fill-rose-500" />{a.likesCount}</span>
                    <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{a.commentsCount}</span>
                  </div>
                ) : null}

                {a.status === "APPROVED" && a.paymentNote ? (
                  <p className="text-[11px] text-muted-foreground font-semibold">{t.clinicDash.paymentRef}: {a.paymentNote}</p>
                ) : null}
                {a.status === "REJECTED" && a.adminNote ? (
                  <p className="text-xs text-destructive font-semibold">{t.clinicDash.rejectReason}: {a.adminNote}</p>
                ) : null}

                {/* الأفعال */}
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  {a.status !== "APPROVED" ? (
                    <Button size="sm" className="gradient-primary text-white font-black rounded-lg" onClick={() => { setApproveId(a); setPaymentNote(""); }}>
                      <Check className="h-3.5 w-3.5" />
                      {t.adminAds.approve}
                    </Button>
                  ) : null}
                  {a.status !== "REJECTED" ? (
                    <Button size="sm" variant="outline" className="rounded-lg font-black text-destructive border-destructive/40" onClick={() => { setRejectId(a.id); setAdminNote(""); }}>
                      <Ban className="h-3.5 w-3.5" />
                      {t.adminAds.reject}
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" className="rounded-lg font-bold text-destructive gap-1" onClick={() => act("ads-delete", a.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                    {t.common.delete}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {pages > 1 ? (
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" className="rounded-lg font-bold" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t.directory.prev}</Button>
              <span className="text-xs font-bold text-muted-foreground font-mono px-1">{t.directory.pageInfo.replace("{p}", String(page)).replace("{n}", String(pages))}</span>
              <Button variant="outline" size="sm" className="rounded-lg font-bold" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t.directory.next}</Button>
            </div>
          ) : null}
        </>
      )}

      {/* نافذة الموافقة: مرجع السداد + إعدادات العرض العائم */}
      <Dialog open={!!approveId} onOpenChange={(v) => { if (!v) setApproveId(null); }}>
        <DialogContent className="sm:max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-start text-base">{t.adminAds.approveTitle}</DialogTitle>
            <DialogDescription className="text-start text-xs leading-relaxed">{t.adminAds.approveDesc}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {approveId && approveId.amountDue > 0 && !approveId.paid ? (
              <div className="rounded-xl bg-amber-400/10 border border-amber-400/40 px-3.5 py-2.5 text-xs font-bold text-amber-700 dark:text-amber-400">
                {t.adminAds.approveNeedPaid}
              </div>
            ) : null}
            <Input value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} className="rounded-xl bg-card" maxLength={200} placeholder={t.adminAds.paymentPh} />
            {/* تفعيل العرض العائم عند النشر */}
            <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/[0.05] p-3 space-y-2">
              <label className="flex items-center gap-2 text-xs font-black text-indigo-600 dark:text-indigo-400">
                <input
                  type="checkbox"
                  defaultChecked={approveId?.float || false}
                  id="approve-float"
                  className="h-4 w-4 accent-indigo-500"
                />
                <Zap className="h-3.5 w-3.5" />
                {t.adminAds.approveFloat}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold">{t.adminAds.floatPerUser}</Label>
                  <Input id="approve-peruser" type="number" min={1} max={20} defaultValue={approveId?.floatPerUser || 3} className="rounded-lg bg-card h-9 font-black" dir="ltr" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold">{t.adminAds.floatDays}</Label>
                  <Input id="approve-days" type="number" min={1} max={365} defaultValue={approveId?.floatDays || 7} className="rounded-lg bg-card h-9 font-black" dir="ltr" />
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="flex-1 rounded-xl font-bold" onClick={() => setApproveId(null)}>{t.common.close}</Button>
            <Button
              className="flex-1 gradient-primary text-white font-black rounded-xl"
              disabled={busy}
              onClick={() =>
                approveId &&
                act("ads-approve", approveId.id, {
                  paymentNote: paymentNote.trim() || undefined,
                  float: (document.getElementById("approve-float") as HTMLInputElement)?.checked || false,
                  perUser: Number((document.getElementById("approve-peruser") as HTMLInputElement)?.value || 3),
                  days: Number((document.getElementById("approve-days") as HTMLInputElement)?.value || 7),
                })
              }
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {t.adminAds.approveBtn}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* نافذة الرفض بسبب */}
      <Dialog open={!!rejectId} onOpenChange={(v) => { if (!v) setRejectId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-start text-base">{t.adminAds.rejectTitle}</DialogTitle>
            <DialogDescription className="text-start text-xs leading-relaxed">{t.adminAds.rejectDesc}</DialogDescription>
          </DialogHeader>
          <Textarea value={adminNote} onChange={(e) => setAdminNote(e.target.value)} className="rounded-xl min-h-20" maxLength={400} placeholder={t.adminAds.rejectPh} />
          <div className="flex items-center gap-2">
            <Button variant="outline" className="flex-1 rounded-xl font-bold" onClick={() => setRejectId(null)}>{t.common.close}</Button>
            <Button variant="destructive" className="flex-1 rounded-xl font-black" disabled={busy} onClick={() => rejectId && act("ads-reject", rejectId, { adminNote: adminNote.trim() || undefined })}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              {t.adminAds.rejectBtn}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* نافذة إحصاءات المستحقات */}
      <Dialog open={statsOpen} onOpenChange={setStatsOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-start text-base flex items-center gap-2">
              <TrendingUp className="h-4.5 w-4.5 text-primary" />
              {t.adminAds.statsTitle}
            </DialogTitle>
            <DialogDescription className="text-start text-xs leading-relaxed">{t.adminAds.statsDesc}</DialogDescription>
          </DialogHeader>
          {statsLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : stats ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <Card className="border-border/70"><CardContent className="p-3 text-center space-y-0.5">
                  <p className="text-[9px] font-black text-muted-foreground">{t.adminAds.totDues}</p>
                  <p className="font-black font-mono" dir="ltr">{stats.totals.duesTotal.toLocaleString("en-US")}</p>
                </CardContent></Card>
                <Card className="border-emerald-500/25"><CardContent className="p-3 text-center space-y-0.5">
                  <p className="text-[9px] font-black text-emerald-600 dark:text-emerald-400">{t.adminAds.totPaid}</p>
                  <p className="font-black font-mono text-emerald-600 dark:text-emerald-400" dir="ltr">{stats.totals.duesPaid.toLocaleString("en-US")}</p>
                </CardContent></Card>
                <Card className="border-amber-400/25"><CardContent className="p-3 text-center space-y-0.5">
                  <p className="text-[9px] font-black text-amber-600 dark:text-amber-400">{t.adminAds.totPending}</p>
                  <p className="font-black font-mono text-amber-600 dark:text-amber-400" dir="ltr">{stats.totals.duesPending.toLocaleString("en-US")}</p>
                </CardContent></Card>
              </div>
              <div className="space-y-1.5">
                {stats.rows.map((r) => (
                  <div key={r.clinicId} className="rounded-xl border border-border/70 bg-card px-3.5 py-3 flex items-center gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-sm truncate">{r.clinicName}</p>
                      <p className="text-[10px] font-bold text-muted-foreground">{t.adminAds.statsAds.replace("{n}", String(r.adsCount))} · {t.adminAds.statsApproved.replace("{n}", String(r.approvedCount))}</p>
                    </div>
                    <div className="text-end text-[11px] font-bold">
                      <p className="text-muted-foreground">{t.adminAds.totDues}: <span className="font-mono" dir="ltr">{r.duesTotal.toLocaleString("en-US")}</span></p>
                      <p className="text-emerald-600 dark:text-emerald-400">{t.adminAds.totPaid}: <span className="font-mono" dir="ltr">{r.duesPaid.toLocaleString("en-US")}</span></p>
                      <p className="text-amber-600 dark:text-amber-400">{t.adminAds.totPending}: <span className="font-mono" dir="ltr">{r.duesPending.toLocaleString("en-US")}</span></p>
                    </div>
                  </div>
                ))}
                {stats.rows.length === 0 ? <p className="text-center text-sm font-bold text-muted-foreground py-6">{t.adminAds.statsEmpty}</p> : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
