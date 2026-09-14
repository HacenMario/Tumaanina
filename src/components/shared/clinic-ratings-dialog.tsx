"use client";

/**
 * v1.15.0 — نافذة تقييمات العيادة (نفس مبدأ نافذة تقييمات الأخصائيين):
 * تُفتح من زر «التقييمات» في بطاقة العيادة بالدليل أو من صفحة العيادة:
 *   window.dispatchEvent(new CustomEvent("open-clinic-ratings", { detail: {
 *     clinicId, clinicName }}))
 * المتوسط + توزيع النجوم + نموذج التقييم للعميل (من حجز) + قائمة التقييمات،
 * وبعد كل تقييم تُحدَّث البيانات فوراً (المتوسط والعدّاد يُعادان من الخادم).
 */
import { useCallback, useEffect, useState } from "react";
import { Star, Sparkles, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { showAppToast } from "@/components/shared/app-toast";
import { playSound } from "@/lib/sounds";
import { StarsRow } from "@/components/shared/ratings-dialog";
import { cn , formatDateTime} from "@/lib/utils";

interface ClinicRatingItem {
  id: string;
  stars: number;
  comment: string | null;
  clientName: string;
  createdAt: string | null;
}

interface ClinicRatingsData {
  avg: number;
  count: number;
  distribution?: { stars: number; count: number }[];
  /* v1.15.1: الاسم الفعلي للحقل في استجابة الـ API هو reviews (وليس items)
     — كان الاختلاف يسبب انهياراً côté العميل (reading 'length' of undefined) */
  reviews?: ClinicRatingItem[];
  myRating?: { stars: number; comment: string | null } | null;
}

const STARS = [1, 2, 3, 4, 5];

export function ClinicRatingsDialog() {
  const { t } = useI18n();
  const { user } = useApp();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const [data, setData] = useState<ClinicRatingsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [stars, setStars] = useState<number>(0);
  const [hover, setHover] = useState<number>(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (user?.id) qs.set("viewerId", user.id);
      const res = await fetch(`/api/clinics/${id}/reviews?${qs.toString()}`);
      if (res.ok) {
        const d = (await res.json()) as ClinicRatingsData;
        setData(d);
        if (d.myRating) {
          setStars(d.myRating.stars);
          setComment(d.myRating.comment || "");
        }
      }
    } catch {
      /* تجاهل — تُعرض رسالة الفراغ */
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail as { clinicId: string; clinicName?: string };
      if (!d?.clinicId) return;
      setTarget({ id: d.clinicId, name: d.clinicName || "" });
      setData(null);
      setStars(0);
      setComment("");
      setOpen(true);
      void load(d.clinicId);
    };
    window.addEventListener("open-clinic-ratings", handler);
    return () => window.removeEventListener("open-clinic-ratings", handler);
  }, [load]);

  const canRate = !!user && user.role === "VICTIM";

  const submit = async () => {
    if (!target || !user || stars < 1 || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/clinics/${target.id}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, stars, comment: comment.trim() || undefined }),
      });
      const d = await res.json().catch(() => null);
      if (res.ok && d?.ok) {
        playSound("success");
        showAppToast(t.clinics.ratingThanks, t.clinics.ratingThanksSub);
        /* تحديث البيانات بعد كل تقييم — المتوسط والعدّاد من الخادم مباشرة */
        await load(target.id);
      } else if (d?.error === "BOOKING_REQUIRED") {
        showAppToast(t.clinics.ratingNeedBooking, t.clinics.ratingNeedBookingSub);
      }
    } catch {
      /* تجاهل */
    } finally {
      setBusy(false);
    }
  };

  /* v1.16.0: التنسيق الموحد YYYY/MM/DD HH:MM:SS في كل مكان */
  const fmtDate = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return formatDateTime(d);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-start flex items-center gap-2 text-base">
            <Star className="h-4.5 w-4.5 text-amber-400 fill-amber-400" />
            {t.clinicRatings.dialogTitle}
            {target?.name && <span className="text-primary truncate">{target.name}</span>}
          </DialogTitle>
        </DialogHeader>

        {loading && !data ? (
          <p className="text-center text-sm font-bold text-muted-foreground py-8">{t.common.loading}</p>
        ) : (
          <div className="space-y-5">
            {/* المتوسط + التوزيع — نفس تصميم نافذة الأخصائيين */}
            <div className="flex items-center gap-5 rounded-2xl border border-border bg-muted/30 p-4">
              <div className="text-center shrink-0">
                <div className="text-4xl font-black font-mono text-amber-500" dir="ltr">
                  {data && data.count > 0 ? data.avg.toFixed(1) : "—"}
                </div>
                {data && data.count > 0 && <StarsRow value={data.avg} />}
                <p className="text-[11px] font-bold text-muted-foreground mt-1">
                  {t.clinicRatings.count.replace("{n}", String(data?.count ?? 0))}
                </p>
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                {(data?.distribution ?? []).map((d) => {
                  const pct = Math.round((d.stars / 5) * 100);
                  return (
                    <div key={d.stars} className="flex items-center gap-2">
                      <span className="text-[11px] font-black text-muted-foreground w-3 shrink-0" dir="ltr">{d.stars}</span>
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0" />
                      <div className="flex-1 h-2.5 rounded-full bg-border overflow-hidden">
                        <div className="h-full rounded-full bg-amber-400 transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] font-black text-muted-foreground/70 w-9 text-end shrink-0" dir="ltr">{pct}%</span>
                      <span className="text-[11px] font-black font-mono text-muted-foreground w-6 text-end shrink-0" dir="ltr">{d.count}</span>
                    </div>
                  );
                })}
                {/* v1.16.0: نُزعت عبارة «لا تقييمات بعد…» وما يقابلها بكل اللغات —
                    القسم يعرض التوزيع فقط دون رسالة فحص */}
              </div>
            </div>

            {/* نموذج التقييم — للعميل المسجّل (السداد يُفحص من الخادم) */}
            {canRate && target && (
              <div className="rounded-2xl border-2 border-amber-400/40 bg-amber-400/[0.06] p-4 space-y-3">
                <p className="text-sm font-black flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  {t.clinicRatings.yourRating}
                </p>
                <div className="flex justify-center gap-1.5" dir="ltr">
                  {STARS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={busy}
                      onMouseEnter={() => setHover(s)}
                      onMouseLeave={() => setHover(0)}
                      onClick={() => setStars(s)}
                      aria-label={`${s} / 5`}
                      className="transition-transform hover:scale-125 disabled:opacity-60"
                    >
                      <Star
                        className={cn(
                          "h-9 w-9 transition-colors",
                          s <= (hover || stars) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
                        )}
                      />
                    </button>
                  ))}
                </div>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={t.clinicRatings.commentPlaceholder}
                  className="rounded-xl min-h-16 bg-card"
                  maxLength={500}
                  dir="auto"
                />
                <Button
                  className="w-full gradient-primary text-white font-black rounded-xl h-11"
                  disabled={stars < 1 || busy}
                  onClick={() => void submit()}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {busy ? t.common.loading : t.clinicRatings.submit}
                </Button>
              </div>
            )}

            {/* قائمة التقييمات — v1.15.1: من حقل reviews المُعاد من الخادم مع حماية كاملة */}
            {data && (data.reviews?.length ?? 0) > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-black text-muted-foreground">{t.clinicRatings.listTitle}</p>
                {(data.reviews ?? []).slice(0, 10).map((r) => (
                  <div key={r.id} className="rounded-xl border border-border/70 bg-card px-3.5 py-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black truncate">{r.clientName}</span>
                      <span className="flex items-center gap-2 shrink-0">
                        <StarsRow value={r.stars} size="h-3 w-3" />
                        {r.createdAt && <span className="text-[10px] font-bold text-muted-foreground/70 font-mono" dir="ltr">{fmtDate(r.createdAt)}</span>}
                      </span>
                    </div>
                    {r.comment && <p className="text-xs text-muted-foreground leading-relaxed" dir="auto">{r.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** فتح نافذة تقييمات العيادة من أي مكان */
export function openClinicRatings(clinicId: string, clinicName?: string) {
  window.dispatchEvent(new CustomEvent("open-clinic-ratings", { detail: { clinicId, clinicName } }));
}
