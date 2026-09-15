"use client";

/**
 * v1.15.0 — تبويبا «إعلاناتي» و«المستحقات» في لوحة العيادة:
 *
 * إعلاناتي: قائمة مرقّمة من الخادم (8 لكل صفحة — تحميل سريع)، لكل إعلان
 * إحصاءاته (كم شخصاً شاهده، كم أعجب، التعليقات)، وحجب تعليق أو الرد عليه.
 * صياغة إعلان جديد بوسائط: حتى 5 صور + فيديو واحد.
 *
 * المستحقات: ما دفعته العيادة للإدارة مقابل الإعلانات — بياناتها سرّية
 * بين العيادة والإدارة — مع فلاتر (هذا الأسبوع/الشهر/السنة/فترة محددة)
 * وإجماليات مدفوعة ومتأخرة.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Megaphone, Loader2, Plus, Trash2, X, Upload, Check, Ban, Flag,
  Eye, Heart, MessageCircle, Wallet, CalendarRange, CornerUpLeft, EyeOff, Pencil, Play,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { showAppToast } from "@/components/shared/app-toast";
import { formatDateTime } from "@/lib/utils";
import { SafeVideo } from "@/components/shared/safe-video";

const MAX_ADIMG_B64 = 1_200_000;
const PAGE = 8;

async function compressImage(file: File, maxSide = 1200, limit = MAX_ADIMG_B64): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("READ_FAILED"));
    reader.readAsDataURL(file);
  });
  if (file.size <= 250 * 1024 && file.type !== "image/heic" && file.type !== "image/heif") {
    return dataUrl;
  }
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("DECODE_FAILED"));
      image.src = dataUrl;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    for (const q of [0.85, 0.75, 0.6, 0.45]) {
      const out = canvas.toDataURL("image/jpeg", q);
      if (out.length <= limit) return out;
    }
    return canvas.toDataURL("image/jpeg", 0.35);
  } catch {
    if (dataUrl.length <= limit) return dataUrl;
    throw new Error("TOO_BIG");
  }
}

interface AdComment {
  id: string;
  name: string;
  text: string;
  hidden: boolean;
  reply: { text: string | null; at: string | null };
  createdAt: string | null;
}

export interface AdRow {
  id: string;
  title: string;
  body: string;
  mediaUrls: string[];
  /* v1.18.0: نوع كل وسيط — image/video (الفيديو مرجع GridFS بلا حد حجم) */
  mediaKinds: string[];
  hasImage: boolean;
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
  comments: AdComment[];
  createdAt: string;
}

interface DuesRow {
  id: string;
  title: string;
  amountDue: number;
  paid: boolean;
  paidAt: string | null;
  status: string;
  createdAt: string;
}

/* v1.16.0: التنسيق الموحد YYYY/MM/DD HH:MM:SS في كل مكان */
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return formatDateTime(d);
}

/* ═══════════════════ تبويب إعلاناتي ═══════════════════ */
export function ClinicAdsTab({ userId }: { userId: string }) {
  const { t } = useI18n();
  const [ads, setAds] = useState<AdRow[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  /* نافذة صياغة الإعلان — v1.17.0: تُستعمل للإنشاء وللتعديل معاً
     v1.18.0: الوسائط بkindها — الصور data URLs والفيديو مرجع GridFS */
  const [adOpen, setAdOpen] = useState(false);
  const [adTitle, setAdTitle] = useState("");
  const [adBody, setAdBody] = useState("");
  const [adMedia, setAdMedia] = useState<{ src: string; kind: "image" | "video" }[]>([]);
  const [adBusy, setAdBusy] = useState(false);
  const [adError, setAdError] = useState("");
  /* v1.17.0: الإعلان قيد التعديل (null = إنشاء جديد) */
  const [editingAd, setEditingAd] = useState<AdRow | null>(null);

  /* إدارة التعليقات */
  const [commentsAd, setCommentsAd] = useState<AdRow | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyIdx, setReplyIdx] = useState<number | null>(null);
  const [cmBusy, setCmBusy] = useState(false);

  /* v1.16.0: نافذة «من أعجب بالإعلان؟» — لصاحب العيادة حصراً */
  const [likersAd, setLikersAd] = useState<AdRow | null>(null);
  const [likers, setLikers] = useState<string[]>([]);
  const [likersBusy, setLikersBusy] = useState(false);

  /* v1.20.0: نافذة «من شاهد الإعلان؟» — أسماء حسابات المشاهدين لصاحب العيادة */
  const [viewersAd, setViewersAd] = useState<AdRow | null>(null);
  const [viewers, setViewers] = useState<{ id: string; name: string }[]>([]);
  const [viewersAnon, setViewersAnon] = useState(0);
  const [viewersBusy, setViewersBusy] = useState(false);

  const openViewers = async (ad: AdRow) => {
    setViewersAd(ad);
    setViewers([]);
    setViewersAnon(0);
    setViewersBusy(true);
    try {
      const res = await fetch(`/api/ads/viewers?id=${ad.id}&userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setViewers(Array.isArray(data.viewers) ? data.viewers : []);
        setViewersAnon(Number(data.anonymous) || 0);
      }
    } catch {
      /* تجاهل */
    } finally {
      setViewersBusy(false);
    }
  };

  const openLikers = async (ad: AdRow) => {
    setLikersAd(ad);
    setLikers([]);
    setLikersBusy(true);
    try {
      const res = await fetch(`/api/ads/${ad.id}/likes?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setLikers(Array.isArray(data.likers) ? data.likers : []);
      }
    } catch {
      /* تجاهل */
    } finally {
      setLikersBusy(false);
    }
  };

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/ads?userId=${userId}&page=${page}`);
      const data = await res.json();
      setAds(data.ads || []);
      setPages(data.pages || 1);
      setTotal(data.total || 0);
    } catch {
      setAds([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, page]);

  useEffect(() => {
    load();
  }, [load]);

  const openEditAd = async (a: AdRow) => {
    setEditingAd(a);
    setAdTitle(a.title);
    setAdBody(a.body);
    setAdMedia([]);
    setAdOpen(true);
    try {
      /* v1.18.0: الصور فقط تُجلَب كـ data URLs — الفيديو يبقى بمرجعه
         كما هو (بلا إعادة رفع ولا أي حد حجم) بفضل mediaKinds */
      const kinds = a.mediaKinds || [];
      const out: { src: string; kind: "image" | "video" }[] = [];
      for (let i = 0; i < a.mediaUrls.length; i++) {
        const u = a.mediaUrls[i];
        if (kinds[i] === "video" || u.startsWith("/api/media/")) {
          out.push({ src: u, kind: "video" });
          continue;
        }
        if (u.startsWith("data:")) {
          out.push({ src: u, kind: "image" });
          continue;
        }
        try {
          const blob = await fetch(u).then((r) => r.blob());
          const d = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          out.push({ src: d, kind: "image" });
        } catch {
          /* تجاهل ما تعذّر جلبه */
        }
      }
      setAdMedia(out);
    } catch {
      /* تُترك الوسائط فارغة إن تعذّر جلبها — النص يُحفظ دائماً */
    }
  };

  const submitAd = async () => {
    setAdError("");
    if (!adTitle.trim() || !adBody.trim()) {
      setAdError(t.clinicDash.adMissing);
      return;
    }
    setAdBusy(true);
    try {
      /* v1.17.0: تعديل إعلان قائم — يصل للمستخدمين تلقائياً بعد الحفظ */
      const editing = !!editingAd;
      const res = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing
          ? { action: "update", userId, id: editingAd!.id, title: adTitle.trim(), body: adBody.trim(), media: adMedia.map((m) => m.src) }
          : { action: "create", userId, title: adTitle.trim(), body: adBody.trim(), media: adMedia.map((m) => m.src) }),
      });
      const data = await res.json();
      if (data.ok) {
        setAdOpen(false);
        setAdTitle("");
        setAdBody("");
        setAdMedia([]);
        setEditingAd(null);
        if (editing) showAppToast(t.clinicDash.adUpdated, t.clinicDash.adUpdatedSub);
        else showAppToast(t.clinicDash.adSent, t.clinicDash.adSentSub);
        load(true);
      } else if (data.error === "ADS_LIMIT") {
        setAdError(t.clinicDash.adLimit);
      } else if (data.error === "MAX_6_MEDIA") {
        setAdError(t.clinicDash.adMaxMedia);
      } else if (data.error === "MEDIA_TOO_BIG") {
        setAdError(t.clinicDash.adMediaBig);
      } else if (data.error === "REJECTED_LOCKED") {
        setAdError(t.clinicDash.adRejectedLocked);
        setEditingAd(null);
      } else {
        setAdError(t.common.errorServer);
      }
    } finally {
      setAdBusy(false);
    }
  };

  const deleteAd = async (id: string) => {
    const res = await fetch("/api/ads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", userId, id }),
    });
    const data = await res.json();
    if (data.ok) {
      showAppToast(t.clinicDash.adDeleted, "");
      load(true);
    }
  };

  const commentAct = async (adId: string, action: "comment-hide" | "comment-reply", commentIndex: number, extra?: Record<string, unknown>) => {
    setCmBusy(true);
    try {
      const res = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, userId, id: adId, commentIndex, ...extra }),
      });
      const data = await res.json();
      if (data.ok) {
        setReplyIdx(null);
        setReplyText("");
        /* v1.19.0: تحديث فوري لحالة التعليق — زر حجب/إظهار يتبدّل في النافذة
           نفسها دون إعادة فتحها، والبطاقة خلفها تتحدث معه */
        const patch = (row: AdRow): AdRow => {
          if (row.id !== adId) return row;
          const comments = row.comments.map((c, j) => {
            if (j !== commentIndex) return c;
            if (action === "comment-hide") return { ...c, hidden: extra?.hidden !== false };
            return { ...c, reply: { text: String(extra?.text || ""), at: new Date().toISOString() } };
          });
          return { ...row, comments };
        };
        setAds((p) => p.map(patch));
        setCommentsAd((p) => (p ? patch(p) : p));
        load(true);
      } else {
        showAppToast(t.common.errorServer, "");
      }
    } finally {
      setCmBusy(false);
    }
  };

  const statusBadge = (s: string) => {
    if (s === "APPROVED") return <Badge className="bg-primary/12 text-primary border-0 gap-1"><Check className="h-3 w-3" />{t.clinicDash.adApproved}</Badge>;
    if (s === "REJECTED") return <Badge className="bg-destructive/10 text-destructive border-0 gap-1"><Ban className="h-3 w-3" />{t.clinicDash.adRejected}</Badge>;
    return <Badge className="bg-amber-400/12 text-amber-600 dark:text-amber-400 border-0 gap-1"><Flag className="h-3 w-3" />{t.clinicDash.adPending}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-amber-400/[0.07] border border-amber-400/40 px-4 py-3 text-xs font-bold text-amber-700 dark:text-amber-400 leading-relaxed">
        {t.clinicDash.adsNotice}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Button className="gradient-primary text-white font-black rounded-xl gap-2" onClick={() => setAdOpen(true)}>
          <Plus className="h-4 w-4" />
          {t.clinicDash.newAd}
        </Button>
        <span className="text-xs font-bold text-muted-foreground">{t.clinicDash.adsTotal.replace("{n}", String(total))}</span>
      </div>

      {loading ? (
        <Card className="h-40 animate-pulse bg-muted/50 border-border/50" />
      ) : ads.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center space-y-3 text-muted-foreground">
            <Megaphone className="h-10 w-10 mx-auto opacity-40" />
            <p className="font-semibold">{t.clinicDash.noAds}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {ads.map((a) => (
            <Card key={a.id} className="border-border/70 overflow-hidden max-w-full">
              <CardContent className="p-4 space-y-2.5 min-w-0">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <p className="font-black text-sm min-w-0">{a.title}</p>
                  <div className="flex items-center gap-1.5">
                    {a.float ? <Badge className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-0">{t.clinicDash.floatBadge}</Badge> : null}
                    {statusBadge(a.status)}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line break-words min-w-0">{a.body}</p>
                {a.mediaUrls.length > 0 ? (
                  /* v1.18.0: شبكة مُغلِفة تلتف بلا أي فيض أفقي — كان الصف
                     الأفقي الممتد يبرّج إطار البطاقة على الهاتف مع كثرة الصور.
                     الفيديو بمرجعه من GridFS يظهر بإطاره الأول + زر تشغيل */
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 max-w-full overflow-hidden">
                    {a.mediaUrls.map((u, i) =>
                      (a.mediaKinds || [])[i] === "video" || u.startsWith("/api/media/") ? (
                        <div key={i} className="relative rounded-lg h-24 w-full border border-border/60 bg-black/80 overflow-hidden">
                          <SafeVideo src={u} controls={false} muted preload="metadata" className="h-full w-full object-cover" />
                          <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <span className="h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center">
                              <Play className="h-3.5 w-3.5 fill-white" />
                            </span>
                          </span>
                        </div>
                      ) : (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img key={i} src={u} alt={`${a.title} ${i + 1}`} loading="lazy" className="rounded-lg h-24 w-full border border-border/60 bg-muted/40 object-contain" />
                      )
                    )}
                  </div>
                ) : null}
                {a.status === "REJECTED" && a.adminNote ? (
                  <p className="text-xs text-destructive font-semibold rounded-lg bg-destructive/10 px-3 py-2">{t.clinicDash.rejectReason}: {a.adminNote}</p>
                ) : null}
                {a.status === "APPROVED" && a.paymentNote ? (
                  <p className="text-[11px] text-muted-foreground font-semibold">{t.clinicDash.paymentRef}: {a.paymentNote}</p>
                ) : null}
                {/* تفاعلات الجمهور — كم شخصاً شاهده/أعجبه/علّق */}
                {a.status === "APPROVED" ? (
                  <div className="flex items-center gap-3 text-[11px] font-bold text-muted-foreground flex-wrap">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-primary hover:underline transition-colors"
                      title={t.clinicDash.whoViewed}
                      onClick={() => void openViewers(a)}
                    >
                      <Eye className="h-3.5 w-3.5" />{t.clinicDash.viewsCount.replace("{n}", String(a.views))}
                    </button>
                    {/* v1.16.0: عدّاد الإعجابات زر يفتح «من أعجب بالإعلان؟» — لصاحب العيادة حصراً */}
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-rose-500 hover:text-rose-600 hover:underline transition-colors"
                      title={t.clinicDash.whoLiked}
                      onClick={() => void openLikers(a)}
                    >
                      <Heart className="h-3.5 w-3.5 fill-rose-500" />
                      {t.clinicDash.likesCount.replace("{n}", String(a.likesCount))}
                    </button>
                    <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{t.clinicDash.commentsCount.replace("{n}", String(a.commentsCount))}</span>
                    {a.expiresAt ? (
                      <span className="inline-flex items-center gap-1"><CalendarRange className="h-3.5 w-3.5" />{t.clinicDash.expiresOn.replace("{d}", fmtDate(a.expiresAt))}</span>
                    ) : null}
                  </div>
                ) : null}
                {/* إدارة التعليقات: حجب + رد */}
                {a.comments.length > 0 ? (
                  <Button size="sm" variant="outline" className="rounded-lg font-bold gap-1.5" onClick={() => setCommentsAd(a)}>
                    <MessageCircle className="h-3.5 w-3.5" />
                    {t.clinicDash.manageComments}
                  </Button>
                ) : null}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[10px] text-muted-foreground/70 font-semibold">{fmtDate(a.createdAt)}</span>
                  <div className="flex items-center gap-1.5">
                    {/* v1.17.0: تعديل الإعلان — المنشور يتحدّث عند المستخدمين فور الحفظ */}
                    {a.status !== "REJECTED" ? (
                      <Button size="sm" variant="outline" className="rounded-lg font-bold gap-1 border-primary/40 text-primary" disabled={adBusy} onClick={() => void openEditAd(a)}>
                        <Pencil className="h-3.5 w-3.5" />
                        {t.clinicDash.editAd}
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" className="rounded-lg text-destructive font-bold gap-1" onClick={() => deleteAd(a.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                      {t.common.delete}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* v1.15.0: ترقيم صفحات إعلاناتي — تُحمَّل صفحة واحدة فقط */}
          {pages > 1 ? (
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" className="rounded-lg font-bold" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t.directory.prev}</Button>
              <span className="text-xs font-bold text-muted-foreground font-mono px-1">{t.directory.pageInfo.replace("{p}", String(page)).replace("{n}", String(pages))}</span>
              <Button variant="outline" size="sm" className="rounded-lg font-bold" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t.directory.next}</Button>
            </div>
          ) : null}
        </>
      )}

      {/* نافذة إعلان جديد — وسائط: 5 صور + فيديو */}
      <Dialog open={adOpen} onOpenChange={(v) => { setAdOpen(v); if (!v) setEditingAd(null); }}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-start flex items-center gap-2 text-base">
              <Megaphone className="h-4.5 w-4.5 text-primary" />
              {editingAd ? t.clinicDash.editAdTitle : t.clinicDash.newAdTitle}
            </DialogTitle>
            <DialogDescription className="text-start text-xs leading-relaxed">
              {editingAd ? t.clinicDash.editAdDesc : t.clinicDash.newAdDesc}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="font-bold">{t.clinicDash.adTitle} *</Label>
              <Input value={adTitle} onChange={(e) => setAdTitle(e.target.value)} className="rounded-xl bg-card" maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold">{t.clinicDash.adBody} *</Label>
              <Textarea value={adBody} onChange={(e) => setAdBody(e.target.value)} className="rounded-xl min-h-28" maxLength={1200} placeholder={t.clinicDash.adBodyPh} />
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold">{t.clinicDash.adMedia}</Label>
              <p className="text-[10px] text-muted-foreground font-semibold">{t.clinicDash.adMediaHintMulti ?? t.clinicDash.adMediaHint}</p>
              <div className="flex items-center gap-2 flex-wrap">
                {/* v1.19.0: ملف شفاف فوق الزر مباشرة بدل النقر البرمجي على input مخفي —
                    display:none يمنع فتح منتقي الملفات على بعض هواتف iOS/Android */}
                <div className="relative">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-lg font-bold gap-1.5"
                    disabled={adMedia.filter((m) => m.kind === "image").length >= 5}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {t.clinicDash.addImage} ({adMedia.filter((m) => m.kind === "image").length}/5)
                  </Button>
                  <input
                    type="file"
                    accept="image/*"
                    /* v1.15.1: multiple — اختيار كل الصور دفعة واحدة (حتى 5) بدل صورة بعد صورة */
                    multiple
                    className={`absolute inset-0 h-full w-full cursor-pointer opacity-0 ${adMedia.filter((m) => m.kind === "image").length >= 5 ? "pointer-events-none" : ""}`}
                    onChange={async (e) => {
                      const files = Array.from(e.target.files || []);
                      e.currentTarget.value = "";
                      if (!files.length) return;
                      /* حتى 5 صور + فيديو واحد = 6 وسائط كحد أقصى */
                      const room = 6 - adMedia.length;
                      const imgRoom = 5 - adMedia.filter((m) => m.kind === "image").length;
                      const take = Math.min(files.length, room, imgRoom);
                      if (take <= 0) {
                        showAppToast(t.clinicDash.adMaxMedia, "");
                        return;
                      }
                      if (files.length > take) showAppToast(t.clinicDash.adMaxMedia, "");
                      const picked = files.slice(0, take);
                      const compressed: string[] = [];
                      for (const f of picked) {
                        try {
                          compressed.push(await compressImage(f, 1200, MAX_ADIMG_B64));
                        } catch {
                          showAppToast(t.clinicDash.adMediaBig, "");
                        }
                      }
                      if (compressed.length) setAdMedia((p) => [...p, ...compressed.map((src) => ({ src, kind: "image" as const }))]);
                    }}
                  />
                </div>
              </div>
              {adMedia.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {adMedia.map((m, i) => (
                    <div key={i} className="relative rounded-lg overflow-hidden border border-border/60 aspect-video bg-muted/40">
                      {m.kind === "video" ? (
                        /* v1.18.0: معاينة الفيديو بإطارها الأول + زر تشغيل */
                        <span className="absolute inset-0">
                          <SafeVideo src={m.src} controls={false} muted preload="metadata" className="h-full w-full object-cover" />
                          <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <span className="h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center">
                              <Play className="h-3.5 w-3.5 fill-white" />
                            </span>
                          </span>
                        </span>
                      ) : (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={m.src} alt={`media ${i + 1}`} className="h-full w-full object-cover" />
                      )}
                      <button
                        type="button"
                        className="absolute top-1 end-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center"
                        onClick={() => setAdMedia((p) => p.filter((_, j) => j !== i))}
                        aria-label="remove"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            {adError ? <div className="rounded-xl bg-destructive/10 text-destructive text-sm font-bold px-4 py-3">{adError}</div> : null}
            <Button className="w-full gradient-primary text-white font-black rounded-xl h-12" disabled={adBusy} onClick={submitAd}>
              {adBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
              {/* v1.18.0: زر نافذة الإعلان يقول «حفظ الإعلان» لا «حفظ معلومات العيادة» */}
              {editingAd ? t.clinicDash.saveAd : t.clinicDash.adSubmit}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* نافذة إدارة التعليقات: حجب + رد */}
      <Dialog open={!!commentsAd} onOpenChange={(v) => { if (!v) { setCommentsAd(null); setReplyIdx(null); } }}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-start text-base flex items-center gap-2">
              <MessageCircle className="h-4.5 w-4.5 text-primary" />
              {t.clinicDash.commentsTitle}
            </DialogTitle>
            <DialogDescription className="text-start text-xs leading-relaxed">{t.clinicDash.commentsDesc}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2.5">
            {(commentsAd?.comments || []).map((c, i) => (
              <div key={c.id} className={`rounded-xl border px-3.5 py-3 space-y-2 ${c.hidden ? "border-border/40 bg-muted/30 opacity-70" : "border-border/70 bg-card"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black truncate">{c.name}</span>
                  {c.hidden ? (
                    <Badge className="bg-muted text-muted-foreground border-0 gap-1"><EyeOff className="h-3 w-3" />{t.clinicDash.hiddenBadge}</Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{c.text}</p>
                {c.reply?.text ? (
                  <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 space-y-0.5">
                    <p className="text-[10px] font-black text-primary flex items-center gap-1"><CornerUpLeft className="h-3 w-3" />{t.clinicDash.yourReply}</p>
                    <p className="text-xs font-semibold leading-relaxed">{c.reply.text}</p>
                  </div>
                ) : null}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-lg font-bold h-7 text-[11px] gap-1"
                    onClick={() => void commentAct(commentsAd!.id, "comment-hide", i, { hidden: !c.hidden })}
                    disabled={cmBusy}
                  >
                    <EyeOff className="h-3 w-3" />
                    {c.hidden ? t.clinicDash.unhide : t.clinicDash.hide}
                  </Button>
                  {!c.reply?.text ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg font-bold h-7 text-[11px] gap-1 text-primary border-primary/40"
                      onClick={() => { setReplyIdx(replyIdx === i ? null : i); setReplyText(""); }}
                    >
                      <CornerUpLeft className="h-3 w-3" />
                      {t.clinicDash.reply}
                    </Button>
                  ) : null}
                </div>
                {replyIdx === i ? (
                  <div className="flex items-center gap-1.5">
                    <Input value={replyText} onChange={(e) => setReplyText(e.target.value)} className="rounded-lg bg-card h-9 text-xs" maxLength={300} placeholder={t.clinicDash.replyPh} />
                    <Button
                      size="sm"
                      className="gradient-primary text-white font-black rounded-lg h-9 shrink-0"
                      disabled={!replyText.trim() || cmBusy}
                      onClick={() => void commentAct(commentsAd!.id, "comment-reply", i, { text: replyText.trim() })}
                    >
                      {t.clinicDash.replySend}
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
            {(commentsAd?.comments.length || 0) === 0 ? (
              <p className="text-center text-sm font-bold text-muted-foreground py-6">{t.clinicDash.noComments}</p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* v1.20.0: نافذة «من شاهد الإعلان؟» — أسماء حسابات المشاهدين + الزوار العابرون */}
      <Dialog open={!!viewersAd} onOpenChange={(v) => { if (!v) setViewersAd(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-start flex items-center gap-2 text-base">
              <Eye className="h-4.5 w-4.5 text-primary" />
              {t.clinicDash.whoViewed}
            </DialogTitle>
            <DialogDescription className="text-start text-xs">{viewersAd?.title}</DialogDescription>
          </DialogHeader>
          {viewersBusy ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : viewers.length === 0 ? (
            <p className="text-center text-sm font-bold text-muted-foreground py-6">{t.clinicDash.noViewers}</p>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-1.5">
              {viewers.map((v) => (
                <div key={v.id} className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-card px-3 py-2">
                  <span className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black text-xs shrink-0">
                    {v.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-sm font-bold truncate">{v.name}</span>
                </div>
              ))}
              {viewersAnon > 0 ? (
                <p className="text-[11px] text-muted-foreground font-semibold text-center pt-1">{t.clinicDash.anonViewers.replace("{n}", String(viewersAnon))}</p>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* v1.16.0: نافذة «من أعجب بالإعلان؟» — أسماء المعجبين لصاحب العيادة حصراً */}
      <Dialog open={!!likersAd} onOpenChange={(v) => { if (!v) setLikersAd(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-start flex items-center gap-2 text-base">
              <Heart className="h-4.5 w-4.5 text-rose-500 fill-rose-500" />
              {t.clinicDash.whoLiked}
            </DialogTitle>
            <DialogDescription className="text-start text-xs">{likersAd?.title}</DialogDescription>
          </DialogHeader>
          {likersBusy ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : likers.length === 0 ? (
            <p className="text-center text-sm font-bold text-muted-foreground py-6">{t.clinicDash.noLikers}</p>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-1.5">
              {likers.map((name, i) => (
                <div key={i} className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-card px-3 py-2">
                  <span className="h-8 w-8 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center font-black text-xs shrink-0">
                    {name.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-sm font-bold truncate">{name}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════════════ تبويب المستحقات ═══════════════════ */
export function ClinicDuesTab({ userId }: { userId: string }) {
  const { t } = useI18n();
  const [ads, setAds] = useState<AdRow[]>([]);
  const [loading, setLoading] = useState(true);
  /* الفلاتر: هذا الأسبوع / هذا الشهر / هذه السنة / فترة محددة */
  const [filter, setFilter] = useState<"week" | "month" | "year" | "custom">("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      /* نجلب كل صفحات إعلانات العيادة (بحد أقصى معقول) لحساب المستحقات */
      const all: AdRow[] = [];
      for (let p = 1; p <= 5; p++) {
        const res = await fetch(`/api/ads?userId=${userId}&page=${p}`);
        const data = await res.json();
        all.push(...(data.ads || []));
        if (p >= (data.pages || 1)) break;
      }
      setAds(all);
    } catch {
      setAds([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  /* حدود الفترة الزمنية */
  const bounds = (): { start: number; end: number } => {
    const now = new Date();
    if (filter === "week") {
      const d = new Date(now);
      const day = (d.getDay() + 1) % 7; /* السبت بداية الأسبوع */
      d.setDate(d.getDate() - day);
      d.setHours(0, 0, 0, 0);
      return { start: d.getTime(), end: now.getTime() + 86400000 };
    }
    if (filter === "month") {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: d.getTime(), end: now.getTime() + 86400000 };
    }
    if (filter === "year") {
      const d = new Date(now.getFullYear(), 0, 1);
      return { start: d.getTime(), end: now.getTime() + 86400000 };
    }
    const s = from ? new Date(`${from}T00:00:00`).getTime() : 0;
    const e = to ? new Date(`${to}T23:59:59`).getTime() : Date.now() + 86400000;
    return { start: s, end: e };
  };

  const { start, end } = bounds();
  const scoped = ads.filter((a) => {
    const ts = new Date(a.paidAt || a.createdAt).getTime();
    return ts >= start && ts <= end;
  });
  const totalDue = scoped.reduce((s, a) => s + a.amountDue, 0);
  const totalPaid = scoped.filter((a) => a.paid).reduce((s, a) => s + a.amountDue, 0);
  const totalPending = totalDue - totalPaid;

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-primary/[0.06] border border-primary/25 px-4 py-3 text-xs font-bold text-muted-foreground leading-relaxed">
        {t.clinicDash.duesNotice}
      </div>

      {/* الفلاتر */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="rounded-xl bg-card font-semibold w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="week">{t.clinicDash.fWeek}</SelectItem>
            <SelectItem value="month">{t.clinicDash.fMonth}</SelectItem>
            <SelectItem value="year">{t.clinicDash.fYear}</SelectItem>
            <SelectItem value="custom">{t.clinicDash.fCustom}</SelectItem>
          </SelectContent>
        </Select>
        {filter === "custom" ? (
          <>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl bg-card w-40" dir="ltr" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl bg-card w-40" dir="ltr" />
          </>
        ) : null}
      </div>

      {/* الإجماليات */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="border-border/70">
          <CardContent className="p-3.5 text-center space-y-1">
            <p className="text-[10px] font-black text-muted-foreground">{t.clinicDash.duesTotal}</p>
            <p className="text-lg font-black font-mono text-foreground" dir="ltr">{totalDue.toLocaleString("en-US")}</p>
            <p className="text-[10px] font-bold text-muted-foreground">{t.clinicDash.dz}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/25">
          <CardContent className="p-3.5 text-center space-y-1">
            <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400">{t.clinicDash.duesPaid}</p>
            <p className="text-lg font-black font-mono text-emerald-600 dark:text-emerald-400" dir="ltr">{totalPaid.toLocaleString("en-US")}</p>
            <p className="text-[10px] font-bold text-muted-foreground">{t.clinicDash.dz}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-400/25">
          <CardContent className="p-3.5 text-center space-y-1">
            <p className="text-[10px] font-black text-amber-600 dark:text-amber-400">{t.clinicDash.duesPending}</p>
            <p className="text-lg font-black font-mono text-amber-600 dark:text-amber-400" dir="ltr">{totalPending.toLocaleString("en-US")}</p>
            <p className="text-[10px] font-bold text-muted-foreground">{t.clinicDash.dz}</p>
          </CardContent>
        </Card>
      </div>

      {/* قائمة الإعلانات بمستحقاتها */}
      {loading ? (
        <Card className="h-40 animate-pulse bg-muted/50 border-border/50" />
      ) : scoped.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center space-y-3 text-muted-foreground">
            <Wallet className="h-10 w-10 mx-auto opacity-40" />
            <p className="font-semibold">{t.clinicDash.noDues}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {scoped.map((a) => (
            <Card key={a.id} className="border-border/70">
              <CardContent className="p-4 flex items-center gap-3 flex-wrap">
                <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-primary/10 shrink-0">
                  <Wallet className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-black text-sm truncate">{a.title}</p>
                  <p className="text-[10px] font-bold text-muted-foreground">{fmtDate(a.paidAt || a.createdAt)}</p>
                </div>
                <div className="text-end">
                  <p className="font-black font-mono text-sm" dir="ltr">{a.amountDue.toLocaleString("en-US")} {t.clinicDash.dz}</p>
                  {a.paid ? (
                    <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0 gap-1 mt-0.5"><Check className="h-3 w-3" />{t.clinicDash.paidBadge}</Badge>
                  ) : (
                    <Badge className="bg-amber-400/12 text-amber-600 dark:text-amber-400 border-0 gap-1 mt-0.5"><Flag className="h-3 w-3" />{t.clinicDash.unpaidBadge}</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
