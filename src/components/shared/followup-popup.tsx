"use client";

/**
 * v1.5.0 — نافذة «الجلسة التالية + اختيار المزاج» للعميل.
 * تظهر فور جدولة الجلسة التالية من طرف الأخصائي (بنهاية الجلسة) مهما كانت
 * الصفحة التي يتواجد فيها العميل على المنصة — بلا انتظار ولوج «جلستي»
 * (طلب المستخدم الصريح). تُفتح أيضاً بعد نافذة الاطمئنان إن كان مسجّلاً.
 *
 * المنطق: استقصاء جلسات العميل كل 10 ثوانٍ؛ عند ظهور جلسة مكتملة بخطة
 * متابعة حديثة (انتهت خلال آخر 10 دقائق) ولم يُقرأ مزاجها بعد:
 *   → نافذة جميلة بالموعد القادم + اختيار المزاج قبل/بعد الجلسة.
 * التعرف يُحفظ محلياً حتى لا تتكرر النافذة لنفس الجلسة.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CalendarCheck2, HeartPulse, CalendarDays } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface FUSession {
  id: string;
  status: string;
  scheduledAt: string;
  followUpAt?: string | null;
  endedAt?: string | null;
  moodBefore?: number | null;
  moodAfter?: number | null;
  counselor?: { id: string; pseudonym: string; counselorProfile?: { fullName: string } | null } | null;
}

const SEEN_KEY = "tumaanina-followup-seen";
const RECENT_MS = 10 * 60 * 1000; /* الجلسة التي انتهت خلال آخر 10 دقائق */

const MOOD_EMOJIS = ["😫", "😟", "😐", "🙂", "😊"];

function readSeen(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((x: unknown) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function FollowUpPopup() {
  const { t } = useI18n();
  const { user, setView } = useApp();
  const [session, setSession] = useState<FUSession | null>(null);
  const [moodBefore, setMoodBefore] = useState<number | null>(null);
  const [moodAfter, setMoodAfter] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(false);

  useEffect(() => {
    seenRef.current = new Set(readSeen());
    mountedRef.current = true;
  }, []);

  const load = useCallback(async () => {
    if (!user || user.role !== "VICTIM" || !user.id) return;
    try {
      const res = await fetch(`/api/sessions?userId=${user.id}&role=VICTIM`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const sessions: FUSession[] = data.sessions || [];
      /* جلسة مكتملة بخطة متابعة، انتهت حديثاً، ولم تُقرأ بعد */
      const target = sessions.find(
        (s) =>
          s.status === "COMPLETED" &&
          !!s.followUpAt &&
          s.moodAfter == null &&
          !seenRef.current.has(s.id) &&
          s.endedAt &&
          Date.now() - new Date(s.endedAt).getTime() < RECENT_MS
      );
      if (target) {
        setSession(target);
        setMoodBefore(target.moodBefore ?? null);
        setMoodAfter(null);
      }
    } catch {
      /* الشبكة متقطعة — الدورة القادمة تعيد المحاولة */
    }
  }, [user]);

  useEffect(() => {
    if (!user || user.role !== "VICTIM") return;
    load();
    const i = setInterval(load, 10_000);
    return () => clearInterval(i);
  }, [user, load]);

  const dismiss = () => {
    if (session) {
      seenRef.current.add(session.id);
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify([...seenRef.current].slice(-60)));
      } catch {
        /* تجاهل */
      }
    }
    setSession(null);
  };

  const submit = async () => {
    if (!session || !user?.id || busy) return;
    setBusy(true);
    try {
      await fetch(`/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moodBefore: moodBefore ?? undefined,
          moodAfter: moodAfter ?? undefined,
        }),
      });
    } catch {
      /* تجاهل */
    } finally {
      setBusy(false);
      dismiss();
    }
  };

  if (!session) return null;

  const counselorName = session.counselor?.counselorProfile?.fullName || session.counselor?.pseudonym || "";
  const needBefore = session.moodBefore == null;

  return (
    <Dialog open onOpenChange={(o) => !o && dismiss()}>
      <DialogContent className="sm:max-w-md overflow-hidden p-0 gap-0">
        <DialogTitle className="sr-only">{t.followup.title}</DialogTitle>
        {/* رأس متدرج */}
        <div className="gradient-primary text-white px-5 pt-5 pb-6 relative">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-white/15 flex items-center justify-center shrink-0 animate-pop">
              <CalendarCheck2 className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="font-black leading-tight">{t.followup.title}</p>
              <p className="text-[11px] text-white/85 font-semibold mt-0.5">{t.followup.sub}</p>
            </div>
          </div>
        </div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="p-5 space-y-4">
          {/* الموعد القادم */}
          <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 px-4 py-3.5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <CalendarDays className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-muted-foreground">{t.followup.nextLabel}</p>
              <p className="text-sm font-black text-primary font-mono" dir="ltr">
                {formatDateTime(session.followUpAt || "")}
              </p>
              {counselorName && (
                <p className="text-[11px] font-semibold text-muted-foreground truncate" dir="auto">
                  {t.client.sessionWith} {counselorName}
                </p>
              )}
            </div>
          </div>

          {/* المزاج قبل الجلسة (إن لم يُسجّل) وبعد الجلسة */}
          <div className="space-y-3">
            {needBefore && (
              <div className="space-y-1.5">
                <span className="text-xs font-bold flex items-center gap-1.5">
                  <HeartPulse className="h-3.5 w-3.5 text-primary" />
                  {t.session.moodBeforeTitle}
                </span>
                <div className="flex justify-between gap-2">
                  {MOOD_EMOJIS.map((emoji, i) => (
                    <button
                      key={emoji}
                      onClick={() => setMoodBefore(i + 1)}
                      aria-label={t.session.moodScale[i] || String(i + 1)}
                      className={`flex-1 rounded-2xl border-2 py-1.5 text-xl sm:text-2xl leading-none transition-all hover:scale-105 ${
                        moodBefore === i + 1
                          ? "border-primary bg-primary/10 scale-110"
                          : "border-transparent bg-muted/60 hover:bg-muted"
                      }`}
                    >
                      <span aria-hidden="true">{emoji}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <span className="text-xs font-bold flex items-center gap-1.5">
                <HeartPulse className="h-3.5 w-3.5 text-primary" />
                {t.session.moodAfterTitle}
              </span>
              <div className="flex justify-between gap-2">
                {MOOD_EMOJIS.map((emoji, i) => (
                  <button
                    key={emoji}
                    onClick={() => setMoodAfter(i + 1)}
                    aria-label={t.session.moodScale[i] || String(i + 1)}
                    className={`flex-1 rounded-2xl border-2 py-1.5 text-xl sm:text-2xl leading-none transition-all hover:scale-105 ${
                      moodAfter === i + 1
                        ? "border-primary bg-primary/10 scale-110"
                        : "border-transparent bg-muted/60 hover:bg-muted"
                    }`}
                  >
                    <span aria-hidden="true">{emoji}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Button
            className="w-full gradient-primary text-white font-black rounded-2xl h-12"
            disabled={busy || moodAfter == null}
            onClick={submit}
          >
            {busy ? t.common.loading : t.followup.submit}
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="flex-1 rounded-xl font-bold"
              onClick={() => {
                dismiss();
                setView("client-sessions");
              }}
            >
              {t.followup.mySessions}
            </Button>
            <Button variant="ghost" className="flex-1 rounded-xl font-bold text-muted-foreground" disabled={busy} onClick={dismiss}>
              {t.followup.later}
            </Button>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
