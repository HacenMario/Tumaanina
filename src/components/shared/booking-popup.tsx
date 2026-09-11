"use client";

/* ═══ v1.4.0 — نافذة الحجوزات المنبثقة للأخصائي (بنمط تطبيقات التوصيل) ═══
   بعد كل حجز جديد تظهر نافذة أنيقة بتفاصيل الطلب وأزرار سريعة:
   قبول الجلسة (بمدتها) / تغيير الموعد / التواصل مع العميل / التخطي.
   • تظهر مباشرة عند ولوج الأخصائي لحسابه، وينتقل الزر تلقائياً للطلب التالي
   • «تخطي» يُخفي الطلب حتى الولوج القادم (sessionStorage) — الطلب يبقى
     في اللوحة كالمعتاد ولن يضيع
   • القبول والاعتذار وتغيير الموعد كلها نفس أفعال الخادم الموثوقة */

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CalendarClock, CalendarCog, CheckCircle2, MessageCircle, Hourglass, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { fmtMoney } from "@/lib/money";
import type { TopicKey, SessionMode, CurrencyCode } from "@/lib/constants";
import { SLOT_TIMES } from "@/lib/constants";
import { formatDateTime, localDateStr } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { openDm } from "@/components/shared/dm-dialog";
import { MessageSquareText, Mic, Video } from "lucide-react";

interface PopupSession {
  id: string;
  topic: string;
  mode: SessionMode;
  status: string;
  scheduledAt: string;
  price?: number | null;
  currency?: string | null;
  victim?: { id: string; pseudonym: string; gender?: string | null } | null;
}

const SKIP_KEY = "tumaanina-popup-skip";
const MODE_ICONS: Record<SessionMode, React.ElementType> = {
  TEXT: MessageSquareText,
  VOICE: Mic,
  VIDEO: Video,
};

function readSkips(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(SKIP_KEY) || "[]") as string[];
  } catch {
    return [];
  }
}

export function BookingPopups() {
  const { t, lang } = useI18n();
  const { user, currency } = useApp();
  const [pending, setPending] = useState<PopupSession[]>([]);
  const [skips, setSkips] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [duration, setDuration] = useState("60");
  /* تغيير الموعد داخل النافذة نفسها */
  const [reschedMode, setReschedMode] = useState(false);
  const [reschedDate, setReschedDate] = useState(localDateStr());
  const [reschedSlot, setReschedSlot] = useState(SLOT_TIMES[0]);
  const [reschedErr, setReschedErr] = useState("");

  const isCounselor = user?.role === "COUNSELOR";

  const load = useCallback(async () => {
    if (!isCounselor || !user) return;
    try {
      const res = await fetch(`/api/sessions?userId=${user.id}&role=COUNSELOR`, { cache: "no-store" });
      const data = await res.json();
      setPending((data.sessions || []).filter((s: PopupSession) => s.status === "PENDING"));
    } catch {
      /* تجاهل */
    }
  }, [isCounselor, user]);

  useEffect(() => {
    if (!isCounselor) return;
    setSkips(readSkips());
    load();
    const i = setInterval(load, 10_000);
    return () => clearInterval(i);
  }, [isCounselor, load]);

  /* الطلب المعروض: أول طلب قيد الانتظار لم يُتخطَّ */
  const current = pending.find((s) => !skips.includes(s.id));

  const skip = () => {
    if (!current) return;
    const next = [...skips, current.id];
    setSkips(next);
    try {
      sessionStorage.setItem(SKIP_KEY, JSON.stringify(next));
    } catch {}
  };

  const accept = async () => {
    if (!current) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sessions/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ACCEPTED", durationMinutes: Number(duration) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) load();
    } finally {
      setBusy(false);
    }
  };

  const reschedule = async () => {
    if (!current) return;
    const [h, m] = reschedSlot.split(":").map(Number);
    const nd = new Date(`${reschedDate}T00:00:00`);
    nd.setHours(h, m, 0, 0);
    if (nd.getTime() <= Date.now()) {
      setReschedErr(t.client.bookingPastError);
      return;
    }
    setBusy(true);
    setReschedErr("");
    try {
      const res = await fetch(`/api/sessions/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rescheduleTo: nd.toISOString() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setReschedMode(false);
        load();
      } else if (data?.error === "SLOT_TAKEN") {
        setReschedErr(t.client.bookedSlotTaken);
      } else if (data?.error === "PAST_DATE") {
        setReschedErr(t.client.bookingPastError);
      } else {
        setReschedErr(t.common.error);
      }
    } finally {
      setBusy(false);
    }
  };

  if (!isCounselor || !current) return null;

  const ModeIcon = MODE_ICONS[current.mode] || MessageSquareText;
  const clientName = current.victim?.pseudonym || "—";
  const cur: CurrencyCode = current.currency === "EUR" || current.currency === "USD" ? current.currency : "DZD";

  return (
    <Dialog open onOpenChange={(o) => !o && skip()}>
      <DialogContent className="sm:max-w-sm overflow-hidden p-0 gap-0" showCloseButton={false}>
        {/* v1.5.0: عنوان مخفي لقارئات الشاشة — كان يُطلق تحذير DialogContent requires DialogTitle في الكونسول */}
        <DialogTitle className="sr-only">{t.bpop.title}</DialogTitle>
        <DialogDescription className="sr-only">{t.bpop.sub}</DialogDescription>
        {/* رأس متدرّج بلون المنصة */}
        <div className="gradient-primary text-white px-5 pt-5 pb-6 relative">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-white/15 flex items-center justify-center shrink-0 animate-pop">
              <Sparkles className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="font-black leading-tight">{t.bpop.title}</p>
              <p className="text-[11px] text-white/85 font-semibold mt-0.5">{t.bpop.sub}</p>
            </div>
          </div>
        </div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="p-5 space-y-4">
          {/* تفاصيل الطلب */}
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <ModeIcon className="h-5.5 w-5.5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-black truncate" dir="auto">{clientName}</p>
              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                <Badge variant="secondary" className="text-[10px] font-bold max-w-32">
                  {t.client.topics[current.topic as TopicKey] ?? current.topic}
                </Badge>
                <Badge variant="outline" className="text-[10px] font-bold">
                  {t.session.modes[current.mode]}
                </Badge>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-muted/50 border border-border/70 p-3.5 space-y-2.5">
            <div className="flex items-center gap-2 text-sm font-bold">
              <CalendarClock className="h-4 w-4 text-primary shrink-0" />
              <span dir="ltr" className="font-mono text-[13px]">{formatDateTime(current.scheduledAt)}</span>
            </div>
            {current.price ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground font-semibold text-xs">{t.client.sessionPriceLabel}</span>
                <span className="font-black text-primary" dir="ltr">{fmtMoney(current.price, cur, lang)}</span>
              </div>
            ) : null}
          </div>

          {reschedMode ? (
            /* تغيير الموعد داخل النافذة */
            <div className="space-y-3 rounded-2xl border border-border bg-card p-3.5">
              <div className="space-y-1.5">
                <Label className="font-bold text-xs">{t.client.bookingDateLabel}</Label>
                <input
                  type="date"
                  dir="ltr"
                  value={reschedDate}
                  min={localDateStr()}
                  onChange={(e) => setReschedDate(e.target.value)}
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-xs">{t.client.bookingSlotLabel}</Label>
                <div className="grid grid-cols-4 gap-1.5">
                  {SLOT_TIMES.map((sl) => (
                    <button
                      key={sl}
                      onClick={() => setReschedSlot(sl)}
                      className={`rounded-lg border py-1.5 text-[11px] font-bold font-mono transition-all ${
                        reschedSlot === sl ? "border-primary bg-primary text-white" : "border-border hover:border-primary/40"
                      }`}
                    >
                      {sl}
                    </button>
                  ))}
                </div>
              </div>
              {reschedErr && <p className="text-[11px] font-bold text-destructive">{reschedErr}</p>}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 rounded-lg font-bold" disabled={busy} onClick={() => setReschedMode(false)}>
                  {t.common.cancel}
                </Button>
                <Button size="sm" className="flex-1 gradient-primary text-white font-bold rounded-lg" disabled={busy} onClick={reschedule}>
                  <CalendarCog className="h-4 w-4" />
                  {busy ? t.common.loading : t.counselor.rescheduleConfirm}
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* مدة الجلسة عند القبول */}
              <div className="flex items-center gap-2.5">
                <Hourglass className="h-4 w-4 text-primary shrink-0" />
                <Select value={duration} onValueChange={setDuration} dir={lang === "ar" ? "rtl" : "ltr"}>
                  <SelectTrigger className="flex-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["30", "45", "60", "90", "120"].map((d) => (
                      <SelectItem key={d} value={d}>{t.counselor.durationChip.replace("{n}", d)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* الأزرار الأربعة — بنمط تطبيقات التوصيل */}
              <div className="space-y-2">
                <Button
                  className="w-full gradient-primary text-white font-black rounded-2xl h-12 shadow-lg shadow-primary/25"
                  disabled={busy}
                  onClick={accept}
                >
                  <CheckCircle2 className="h-5 w-5" />
                  {busy ? t.common.loading : t.bpop.acceptBtn}
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="rounded-xl font-bold border-primary/40 text-primary" disabled={busy} onClick={() => setReschedMode(true)}>
                    <CalendarCog className="h-4 w-4" />
                    {t.counselor.rescheduleBtn}
                  </Button>
                  <Button variant="outline" className="rounded-xl font-bold border-primary/40 text-primary" disabled={busy} onClick={() => openDm(current.victim?.id || "", clientName)}>
                    <MessageCircle className="h-4 w-4" />
                    {t.dm.contactBtn}
                  </Button>
                </div>
                <Button variant="ghost" className="w-full rounded-xl font-bold text-muted-foreground" disabled={busy} onClick={skip}>
                  {t.bpop.skipBtn}
                </Button>
              </div>
            </>
          )}
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
