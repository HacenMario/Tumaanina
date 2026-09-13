"use client";

import { useCallback, useEffect, useState } from "react";
import { Megaphone, Check, Ban, Trash2, RefreshCw, Loader2, Phone, Mail, MapPin, Building2, BadgeCheck, ShieldX } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { showAppToast } from "@/components/shared/app-toast";
import { WhatsAppGlyph } from "@/components/session/whatsapp-panel";
import { waLink } from "@/lib/whatsapp";
import { WILAYA_LIST } from "@/lib/constants";

/* ═ v1.14.0 — تبويب «إعلانات العيادات» في لوحة الإدارة ═
   سير العمل الواقعي: الإعلان الجديد يصل «بانتظار المراجعة» — يرى الأدمين
   محتواه وكامل بيانات تواصل العيادة (هاتف/واتساب/بريد) ليتواصل معها
   ويؤكد سداد مستحقات النشر، ثم:
   • نشر → يُسجَّل مرجع السداد ويظهر الإعلان عمومياً + إشعار للعيادة
   • رفض → سبب يصل للعيادة إشعاراً
   • حذف نهائي لأي إعلان. */

interface AdAdminRow {
  id: string;
  title: string;
  body: string;
  hasImage: boolean;
  imageUrl: string | null;
  status: string;
  adminNote: string | null;
  paymentNote: string | null;
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

export function AdminClinicAdsTab() {
  const { t, lang } = useI18n();
  const [ads, setAds] = useState<AdAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("PENDING");

  /* نافذتا الموافقة والرفض */
  const [approveId, setApproveId] = useState<string | null>(null);
  const [paymentNote, setPaymentNote] = useState("");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ads/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": (typeof window !== "undefined" && localStorage.getItem("tumaanina-admin-token")) || "",
        },
        body: JSON.stringify({ action: "ads-list", status: statusFilter === "all" ? undefined : statusFilter }),
      });
      const data = await res.json();
      setAds(data.ads || []);
    } catch {
      setAds([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (action: string, id: string, extra?: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch("/api/ads/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": (typeof window !== "undefined" && localStorage.getItem("tumaanina-admin-token")) || "",
        },
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
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
      </div>

      <div className="rounded-xl bg-amber-400/[0.07] border border-amber-400/40 px-4 py-3 text-xs font-bold text-amber-700 dark:text-amber-400 leading-relaxed">
        {t.adminAds.notice}
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
        ads.map((a) => (
          <Card key={a.id} className="border-border/70">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="font-black leading-snug">{a.title}</p>
                  <p className="text-[11px] text-muted-foreground font-semibold mt-0.5" dir="auto">
                    {new Date(a.createdAt).toLocaleString()}
                  </p>
                </div>
                {statusBadge(a.status)}
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{a.body}</p>
              {a.imageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={a.imageUrl} alt={a.title} className="rounded-xl max-h-48 w-auto object-cover border border-border/60" />
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

              {a.status === "APPROVED" && a.paymentNote ? (
                <p className="text-[11px] text-muted-foreground font-semibold">{t.clinicDash.paymentRef}: {a.paymentNote}</p>
              ) : null}
              {a.status === "REJECTED" && a.adminNote ? (
                <p className="text-xs text-destructive font-semibold">{t.clinicDash.rejectReason}: {a.adminNote}</p>
              ) : null}

              {/* الأفعال */}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                {a.status !== "APPROVED" ? (
                  <Button size="sm" className="gradient-primary text-white font-black rounded-lg" onClick={() => { setApproveId(a.id); setPaymentNote(""); }}>
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
        ))
      )}

      {/* نافذة الموافقة + مرجع السداد */}
      <Dialog open={!!approveId} onOpenChange={(v) => { if (!v) setApproveId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-start text-base">{t.adminAds.approveTitle}</DialogTitle>
            <DialogDescription className="text-start text-xs leading-relaxed">{t.adminAds.approveDesc}</DialogDescription>
          </DialogHeader>
          <Input value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} className="rounded-xl bg-card" maxLength={200} placeholder={t.adminAds.paymentPh} />
          <div className="flex items-center gap-2">
            <Button variant="outline" className="flex-1 rounded-xl font-bold" onClick={() => setApproveId(null)}>{t.common.close}</Button>
            <Button className="flex-1 gradient-primary text-white font-black rounded-xl" disabled={busy} onClick={() => approveId && act("ads-approve", approveId, { paymentNote: paymentNote.trim() || undefined })}>
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
    </div>
  );
}
