"use client";

/**
 * v2.14.0 — نافذة التقييمات (طلب المستخدم: زر تقييمات واضح يفهمه العميلون
 * من أول نظرة). تُفتح من زر «التقييمات» في بطاقة المختص أو من زر «قيّم
 * الأخصائي» بعد انتهاء الجلسة:
 *   window.dispatchEvent(new CustomEvent("open-ratings", { detail: {
 *     counselorId, counselorName, sessionId?, canRate?  }}))
 * العميل المسجّل يقيّم 1-5 نجوم + تعليق اختياري — تقييم واحد لكل جلسة.
 */
import { useCallback, useEffect, useState } from "react";
import { Star, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { showAppToast } from "@/components/shared/app-toast";
import { playSound } from "@/lib/sounds";
import { cn } from "@/lib/utils";

interface RatingItem {
  id: string;
  stars: number;
  comment: string | null;
  by: string;
  at: string | null;
  sessionWhen: string | null;
}

interface RatingsData {
  avg: number;
  count: number;
  distribution: { stars: number; count: number }[];
  items: RatingItem[];
  myRating: { stars: number; comment: string | null } | null;
}

const STARS = [1, 2, 3, 4, 5];

export function StarsRow({ value, size = "h-4 w-4" }: { value: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" dir="ltr" aria-label={`${value}/5`}>
      {STARS.map((s) => (
        <Star
          key={s}
          className={cn(size, s <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")}
        />
      ))}
    </span>
  );
}

export function RatingsDialog() {
  const { t, lang } = useI18n();
  const { user } = useApp();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<{ id: string; name: string; sessionId?: string } | null>(null);
  const [data, setData] = useState<RatingsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [stars, setStars] = useState<number>(0);
  const [hover, setHover] = useState<number>(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (id: string, sessionId?: string) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (user?.id) qs.set("viewerId", user.id);
      if (sessionId) qs.set("sessionId", sessionId);
      const res = await fetch(`/api/counselors/${id}/ratings?${qs.toString()}`);
      if (res.ok) {
        const d = (await res.json()) as RatingsData;
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
      const d = (e as CustomEvent).detail as { counselorId: string; counselorName?: string; sessionId?: string };
      if (!d?.counselorId) return;
      setTarget({ id: d.counselorId, name: d.counselorName || "", sessionId: d.sessionId });
      setData(null);
      setStars(0);
      setComment("");
      setOpen(true);
      void load(d.counselorId, d.sessionId);
    };
    window.addEventListener("open-ratings", handler);
    return () => window.removeEventListener("open-ratings", handler);
  }, [load]);

  const canRate = !!user && user.role === "VICTIM";

  const submit = async () => {
    if (!target || !user || stars < 1 || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/counselors/${target.id}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          victimId: user.id,
          stars,
          comment: comment.trim() || undefined,
          sessionId: target.sessionId || undefined,
        }),
      });
      if (res.ok) {
        playSound("success");
        showAppToast(t.rating.thanksTitle, t.rating.thanksSub);
        await load(target.id, target.sessionId);
      }
    } catch {
      /* تجاهل */
    } finally {
      setBusy(false);
    }
  };

  const fmtDate = (iso: string | null) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
    } catch {
      return "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-start flex items-center gap-2 text-base">
            <Star className="h-4.5 w-4.5 text-amber-400 fill-amber-400" />
            {t.rating.dialogTitle}
            {target?.name && <span className="text-primary truncate">{target.name}</span>}
          </DialogTitle>
        </DialogHeader>

        {loading && !data ? (
          <p className="text-center text-sm font-bold text-muted-foreground py-8">{t.common.loading}</p>
        ) : (
          <div className="space-y-5">
            {/* المتوسط + التوزيع */}
            <div className="flex items-center gap-5 rounded-2xl border border-border bg-muted/30 p-4">
              <div className="text-center shrink-0">
                <div className="text-4xl font-black font-mono text-amber-500" dir="ltr">
                  {data && data.count > 0 ? data.avg.toFixed(1) : "—"}
                </div>
                {data && data.count > 0 && <StarsRow value={data.avg} />}
                <p className="text-[11px] font-bold text-muted-foreground mt-1">
                  {t.rating.count.replace("{n}", String(data?.count ?? 0))}
                </p>
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                {/* v1.6.0 — تصحيح النسبة المئوية (طلب المستخدم الصريح):
                    النسبة تعبّر عن قيمة مستوى النجوم من الحد الأقصى:
                    5 = 100% ، 4 = 80% … 1 = 20% — وشريط التقدم يطابقها تماماً،
                    وعدد التقييمات في هذا المستوى يُعرض بجانبها للتوزيع الحقيقي */}
                {(data?.distribution ?? []).map((d) => {
                  const pct = Math.round((d.stars / 5) * 100);
                  return (
                    <div key={d.stars} className="flex items-center gap-2">
                      <span className="text-[11px] font-black text-muted-foreground w-3 shrink-0" dir="ltr">{d.stars}</span>
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0" />
                      <div className="flex-1 h-2.5 rounded-full bg-border overflow-hidden">
                        <div
                          className="h-full rounded-full bg-amber-400 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-black text-muted-foreground/70 w-9 text-end shrink-0" dir="ltr">
                        {pct}%
                      </span>
                      <span className="text-[11px] font-black font-mono text-muted-foreground w-6 text-end shrink-0" dir="ltr">{d.count}</span>
                    </div>
                  );
                })}
                {(!data || data.count === 0) && (
                  <p className="text-xs font-semibold text-muted-foreground">{t.rating.empty}</p>
                )}
              </div>
            </div>

            {/* نموذج التقييم — للعميل المسجّل فقط */}
            {canRate && target && (
              <div className="rounded-2xl border-2 border-amber-400/40 bg-amber-400/[0.06] p-4 space-y-3">
                <p className="text-sm font-black flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  {t.rating.yourRating}
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
                  placeholder={t.rating.commentPlaceholder}
                  className="rounded-xl min-h-16 bg-card"
                  maxLength={500}
                  dir="auto"
                />
                <Button
                  className="w-full gradient-primary text-white font-black rounded-xl h-11"
                  disabled={stars < 1 || busy}
                  onClick={() => void submit()}
                >
                  {busy ? t.common.loading : t.rating.submit}
                </Button>
              </div>
            )}

            {/* قائمة التقييمات */}
            {data && data.items.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-black text-muted-foreground">{t.rating.listTitle}</p>
                {data.items.slice(0, 10).map((r) => (
                  <div key={r.id} className="rounded-xl border border-border/70 bg-card px-3.5 py-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black truncate">{r.by}</span>
                      <span className="flex items-center gap-2 shrink-0">
                        <StarsRow value={r.stars} size="h-3 w-3" />
                        {r.at && <span className="text-[10px] font-bold text-muted-foreground/70 font-mono" dir="ltr">{fmtDate(r.at)}</span>}
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

/** فتح نافذة التقييمات من أي مكان */
export function openRatings(counselorId: string, counselorName?: string, sessionId?: string) {
  window.dispatchEvent(new CustomEvent("open-ratings", { detail: { counselorId, counselorName, sessionId } }));
}
