"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BadgeCheck, CalendarClock, Clock, Languages as LangIcon, SearchX, MessageSquareText as MessageIcon, Mic as MicIcon, Video as VideoIcon, CalendarX2, LayoutGrid } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { fmtMoney } from "@/lib/money";
import { priceForCurrency } from "@/lib/constants";
import type { CurrencyCode } from "@/lib/constants";
import { SPECIALTIES, type SpecialtyKey, type SessionMode, type AppLang } from "@/lib/constants";
import { slotsForDay, weekdayOfDate, type WeeklyAvailability } from "@/lib/availability";
import { WEEKDAY_LABELS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BackButton } from "@/components/shared/back-button";
import { RoyalCrown } from "@/components/shared/crown-badge";
import { SLOT_TIMES, WILAYA_LABELS } from "@/lib/constants";
import { openDm } from "@/components/shared/dm-dialog";
import { CONTRACT_ARRIVED_EVENT } from "@/components/shared/contract-popup";
import { openRatings } from "@/components/shared/ratings-dialog";
import { WhatsAppGlyph } from "@/components/session/whatsapp-panel";
import { waLink } from "@/lib/whatsapp";
import { MessageCircle, Star } from "lucide-react";

export interface SlotPick {
  date: string;
  slot: string;
}

export interface CounselorCard {
  id: string;
  userId: string;
  /* v2.5.5: الاسم في رابط الملف العام (/counselor/{slug}) */
  slug?: string | null;
  fullName: string;
  specialties: SpecialtyKey[];
  customSpecialties?: string[];
  languages: string[];
  bio?: string;
  /* v2.5.3: الصورة تُحمَّل من مسار مستقل مخبّأ بدل base64 داخل JSON */
  photoUrl?: string | null;
  yearsExperience: number;
  available: boolean;
  rating: number;
  sessionsCount: number;
  /* v2.6.0: جدول التوفر الأسبوعي — null = غير مخصّص = كل الأوقات متاحة */
  weeklyAvailability?: WeeklyAvailability | null;
  /* v2.6.0: المواعيد المتقاطعة مع اختيارات العميل (وضع المطابقة فقط) */
  matchedSlots?: SlotPick[];
  /* v2.7.0: فائز التحدي — يظهر له التاج الملكي فوق صورته في كل الواجهات */
  challengeWinner?: boolean;
  /* v2.9.0: روابط التواصل الاجتماعي (أيقونات حقيقية في البطاقة) */
  socials?: { facebook?: string | null; instagram?: string | null; tiktok?: string | null };
  /* v1.1.0: سعر الجلسة بالدينار الجزائري — يظهر في البطاقة وكل خطوات الحجز */
  sessionPrice?: number;
  /* v1.3.0: أسعار الجلسة الثلاثة المستقلة { DZD, EUR, USD } */
  sessionPrices?: { DZD: number; EUR: number; USD: number } | null;
}

/* شارة تخصص — يترجم مفاتيح القائمة الجاهزة ويعرض الخاصة كما هي */
function SpecialtyBadge({ label }: { label: string }) {
  return (
    <Badge variant="secondary" className="text-[11px] font-semibold">
      {label}
    </Badge>
  );
}

/* تاريخ اليوم بالتوقيت المحلي (YYYY-MM-DD) — toISOString يقرأ UTC وقد يُخطئ يومًا */
export function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ClientFindView() {
  const { t, lang } = useI18n();
  const { user, clientDraft, setDraft, setView, currency } = useApp();
  const [counselors, setCounselors] = useState<CounselorCard[]>([]);
  const [specialty, setSpecialty] = useState("all");
  const [language, setLanguage] = useState("all");
  const [loading, setLoading] = useState(true);

  /* v2.6.0: وضع المطابقة — مفعّل عندما يكون للعميل مواعيد مختارة (الخيار الأول)
     v2.12.0: استثناء — القادم من الرابط العام لأخصائي (؟book=) يرى القائمة
     الكاملة وليس مطابقة المواعيد، حتى يكون الأخصائي صاحب الرابط ضمنها
     وتُفتح نافذة الحجز معه تلقائياً بدل بداية أول خطوة في المسار */
  const [directBook] = useState(() => {
    try {
      return !!sessionStorage.getItem("tumaanina-pending-book");
    } catch {
      return false;
    }
  });
  const prefs: SlotPick[] = clientDraft.preferredSlots || [];
  const matching = prefs.length > 0 && !directBook;
  /* toast محلي بسيط بعد «عرض كل الأخصائيين» */
  const [clearedNote, setClearedNote] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      /* v2.9.0: جنس العميل يُرسل مع الطلب — يُستبعد الأخصائيون الذين لا يقبلونه */
      const g = user?.gender || "";
      if (matching) {
        /* الخيار الأول: فقط الأخصائيون الذين يوفرون نفس مواعيد العميل */
        const res = await fetch("/api/counselors/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slots: prefs, gender: g || undefined }),
        });
        const data = await res.json();
        setCounselors(data.counselors || []);
      } else {
        const res = await fetch(`/api/counselors?specialty=${specialty}&language=${language}${g ? `&gender=${g}` : ""}`);
        const data = await res.json();
        setCounselors(data.counselors || []);
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matching, specialty, language, JSON.stringify(prefs), user?.gender]);

  useEffect(() => {
    load();
  }, [load]);

  /* v2.5.5: تنفيذ الطلب المعلّق من الملف العام للأخصائي —
     عند القدوم من /?book={userId} تُفتح نافذة الحجز مع الأخصائي المطلوب
     تلقائياً بعد تحميل الدليل (أو بعد إتمام تسجيل العميل إن لم يكن ولجاً) */
  useEffect(() => {
    if (loading) return;
    let pending: string | null = null;
    try {
      pending = sessionStorage.getItem("tumaanina-pending-book");
    } catch {
      return;
    }
    if (!pending) return;
    /* إن لم يوجد حساب عميل بعد: نُبقي الطلب معلّقاً — يُنفَّذ بعد التسجيل */
    if (!user || user.role !== "VICTIM") return;
    const norm = pending.toLowerCase();
    const card = counselors.find(
      (c) =>
        c.userId === pending ||
        c.id === pending ||
        (c.slug && c.slug.toLowerCase() === norm) ||
        c.fullName.replace(/\s+/g, "").toLowerCase() === norm
    );
    try {
      sessionStorage.removeItem("tumaanina-pending-book");
    } catch {
      /* تجاهل */
    }
    if (card) {
      window.dispatchEvent(new CustomEvent("open-booking", { detail: card }));
    }
  }, [loading, counselors, user]);

  const showAll = () => {
    setDraft({ preferredSlots: [] });
    setCounselors([]);
    setClearedNote(true);
    /* matching سيتحول إلى false عبر تحديث الـ draft — القائمة العادية تُحمَّل تلقائياً */
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 md:py-14">
      <BackButton />
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-2 mb-8">
        <h1 className="text-2xl md:text-3xl font-black">{matching ? t.client.matchedTitle : t.client.findTitle}</h1>
        <p className="text-muted-foreground">{matching ? t.client.matchedDesc : t.client.findDesc}</p>
        {/* v1.0.0 (طمأنينة): بلا أي لافتات توثيق — التسجيل والحجز مباشران
            والتوثيق حكر على الأخصائيين (شارة «موثّق» في بطاقتهم) */}
        {matching && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {prefs.map((p) => (
              <Badge key={`${p.date}-${p.slot}`} className="bg-primary/12 text-primary border-0 text-[11px] font-bold gap-1">
                <Clock className="h-3 w-3" />
                {new Date(`${p.date}T00:00:00`).getDate()}/{new Date(`${p.date}T00:00:00`).getMonth() + 1} · <span className="font-mono" dir="ltr">{p.slot}</span>
              </Badge>
            ))}
            <button
              onClick={() => setView("client-slots")}
              className="text-[11px] font-bold text-primary hover:underline px-1"
            >
              {t.client.matchChangeSlots}
            </button>
          </div>
        )}
        {clearedNote && !matching && (
          <p className="text-xs font-bold text-primary">{t.client.slotsCleared}</p>
        )}
      </motion.div>

      {/* الفلاتر — في الوضع العادي فقط (وضع المطابقة يفلتر بالمواعيد أصلاً) */}
      {!matching && (
        <div className="grid sm:grid-cols-2 gap-3 mb-7">
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-muted-foreground">{t.client.filterSpecialty}</span>
            <Select value={specialty} onValueChange={setSpecialty} dir={lang === "ar" ? "rtl" : "ltr"}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.client.filterAll}</SelectItem>
                {SPECIALTIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t.client.specialties[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-muted-foreground">{t.client.filterLanguage}</span>
            <Select value={language} onValueChange={setLanguage} dir={lang === "ar" ? "rtl" : "ltr"}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.client.filterAll}</SelectItem>
                <SelectItem value="ar">العربية</SelectItem>
                <SelectItem value="fr">Français</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="tr">Türkçe</SelectItem>
                <SelectItem value="ru">Русский</SelectItem>
                <SelectItem value="zh">中文</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="h-44 animate-pulse bg-muted/50 border-border/50" />
          ))}
        </div>
      ) : counselors.length === 0 ? (
        matching ? (
          /* v2.6.0: لا أخصائي يوفي بشروط الموعد — نقترح تغيير الموعد أو التصفح الحر */
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardContent className="p-10 text-center space-y-4">
              <CalendarX2 className="h-12 w-12 mx-auto text-amber-500" />
              <div className="space-y-2">
                <p className="font-black text-lg">{t.client.matchEmptyTitle}</p>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">{t.client.matchEmptyDesc}</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                <Button className="gradient-primary text-white font-bold rounded-xl" onClick={() => setView("client-slots")}>
                  <CalendarClock className="h-4 w-4" />
                  {t.client.matchChangeSlots}
                </Button>
                <Button variant="outline" className="rounded-xl font-bold" onClick={showAll}>
                  <LayoutGrid className="h-4 w-4" />
                  {t.client.matchShowAll}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed">
            <CardContent className="p-10 text-center space-y-3 text-muted-foreground">
              <SearchX className="h-10 w-10 mx-auto opacity-40" />
              <p className="font-semibold">{t.client.mySessionsEmpty}</p>
            </CardContent>
          </Card>
        )
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {counselors.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
            >
              <Card className={`h-full transition-all hover:shadow-lg ${c.available ? "border-primary/30" : "opacity-75"} border-border/70`}>
                <CardContent className="p-5 space-y-3.5">
                  <div className="flex items-start gap-3.5">
                    {/* v2.7.0: التاج الملكي فوق صورة فائز التحدي */}
                    <div className="relative shrink-0">
                      {c.challengeWinner && (
                        <div className="absolute -top-4 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 z-20 drop-shadow-md">
                          <RoyalCrown size={30} />
                        </div>
                      )}
                      <Avatar className="h-20 w-20 rounded-2xl">
                        {c.photoUrl ? <AvatarImage src={c.photoUrl} alt={c.fullName} loading="lazy" className="rounded-2xl object-cover" /> : null}
                        <AvatarFallback className="gradient-primary text-white rounded-2xl font-black text-2xl">
                          {c.fullName.replace("د. ", "").charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black leading-tight">{c.fullName}</span>
                        <Badge className="bg-primary/12 text-primary border-0 hover:bg-primary/12 gap-1">
                          <BadgeCheck className="h-3 w-3" />
                          {t.client.verified}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground font-semibold">
                        <span>{c.yearsExperience} {t.client.yearsExp}</span>
                        <span>·</span>
                        <span>{c.sessionsCount} {t.client.sessionsDone}</span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <LangIcon className="h-3 w-3" />
                          {c.languages.map((l) => (l === "ar" ? "ع" : l === "fr" ? "FR" : l === "en" ? "EN" : l === "tr" ? "TR" : l === "ru" ? "RU" : "中文")).join(" · ")}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* v2.7.0: النبذة كاملة بلا اختصار — العميل يرى كل شيء ليختار واعياً */}
                  {c.bio && (
                    <p className="text-xs text-muted-foreground leading-relaxed">{c.bio}</p>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    {c.specialties.map((s) => (
                      <SpecialtyBadge key={s} label={t.client.specialties[s] ?? s} />
                    ))}
                    {(c.customSpecialties || []).map((cs) => (
                      <SpecialtyBadge key={`c-${cs}`} label={cs} />
                    ))}
                  </div>

                  {/* v2.6.0: شارات المواعيد المتقاطعة — أين يطابق هذا الأخصائي مواعيد العميل */}
                  {matching && (c.matchedSlots || []).length > 0 && (
                    <div className="rounded-xl bg-primary/5 border border-primary/20 px-3 py-2 space-y-1.5">
                      <span className="text-[10px] font-black text-primary flex items-center gap-1">
                        <BadgeCheck className="h-3 w-3" />
                        {t.client.matchedBadge}
                      </span>
                      {/* v2.7.0: كل المواعيد المتقاطعة تُعرض كاملة — بلا «+N» مخفية */}
                      <div className="flex flex-wrap gap-1.5">
                        {c.matchedSlots!.map((p) => (
                          <Badge key={`${p.date}-${p.slot}`} variant="secondary" className="text-[10px] font-bold gap-1">
                            {WEEKDAY_LABELS[lang][weekdayOfDate(p.date)]} · <span className="font-mono" dir="ltr">{p.slot}</span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* v2.14.0: زر التقييمات واضح وصريح في بطاقة المختص — من أول نظرة */}
                  <button
                    type="button"
                    onClick={() => openRatings(c.userId, c.fullName)}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-amber-400/50 bg-amber-400/[0.07] hover:bg-amber-400/[0.14] px-3 py-2 text-sm font-black text-amber-600 dark:text-amber-400 transition-colors"
                  >
                    <span className="flex items-center gap-0.5" dir="ltr" aria-hidden="true">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      ))}
                    </span>
                    {t.rating.cardBtn}
                    <span className="font-mono text-xs" dir="ltr">{(c.rating ?? 5).toFixed(1)}</span>
                  </button>

                  <div className="flex items-center justify-between pt-1">
                    <span className={`text-xs font-bold flex items-center gap-1.5 ${c.available ? "text-primary" : "text-muted-foreground"}`}>
                      <span className={`h-2 w-2 rounded-full ${c.available ? "bg-primary animate-pulse" : "bg-muted-foreground/40"}`} />
                      {c.available ? t.client.availableNow : t.client.away}
                    </span>
                    {/* v1.3.0: سعر الجلسة بعملة عرض العميل المختارة — بلا أي تحويل */}
                    <span className="text-xs font-black text-primary rounded-full bg-primary/12 px-2.5 py-0.5" dir="ltr">
                      {fmtMoney(
                        priceForCurrency(c.sessionPrices, currency as CurrencyCode, c.sessionPrice),
                        currency as CurrencyCode,
                        lang
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      {/* v1.5.0: زر واتساب مباشر في بطاقة الأخصائي (طلب المستخدم) */}
                      {waLink((c as { whatsapp?: string | null }).whatsapp, t.directory.waIntro.replace("{counselor}", c.fullName)) && (
                        <a
                          href={waLink((c as { whatsapp?: string | null }).whatsapp, t.directory.waIntro.replace("{counselor}", c.fullName)) || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={t.directory.waCard}
                          aria-label={t.directory.waCard}
                          className="flex items-center justify-center gap-1.5 rounded-lg bg-[#25D366] hover:bg-[#1fb857] text-white px-3 h-8 text-xs font-black shadow-sm transition-all"
                        >
                          <WhatsAppGlyph className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">WhatsApp</span>
                        </a>
                      )}
                      {/* v2.8.0: تواصل قبل طلب الجلسة — محادثة مباشرة مع الأخصائي */}
                      {(!user || user.role === "VICTIM") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-lg font-bold border-primary/40 text-primary"
                          title={t.dm.contactBtn}
                          onClick={() => {
                            if (!user) {
                              setView("client-start");
                              return;
                            }
                            openDm(c.userId, c.fullName);
                          }}
                        >
                          <MessageCircle className="h-4 w-4" />
                          <span className="hidden sm:inline">{t.dm.contactBtn}</span>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className="gradient-primary text-white font-bold rounded-lg"
                        disabled={!c.available}
                        onClick={() => {
                          if (!user) {
                            setView("client-start");
                            return;
                          }
                          window.dispatchEvent(new CustomEvent("open-booking", { detail: c }));
                        }}
                      >
                        <CalendarClock className="h-4 w-4" />
                        {t.client.bookBtn}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <BookingDialog
        counselors={counselors}
        onBooked={() => {
          if (matching) setDraft({ preferredSlots: [] });
          setView("client-sessions");
        }}
        highlightSlots={matching ? prefs : undefined}
      />
    </div>
  );
}

export function BookingDialog({
  counselors,
  onBooked,
  highlightSlots,
}: {
  counselors: CounselorCard[];
  onBooked: () => void;
  /* v2.6.0: مواعيد المطابقة — تُبرز وتُعبّئ الحجز تلقائياً (الخيار الأول) */
  highlightSlots?: SlotPick[];
}) {
  const { t, lang } = useI18n();
  const { user, clientDraft, setDraft, currency } = useApp();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<CounselorCard | null>(null);
  /* v1.5.0: طرق الاستشارة صوتية أو مرئية فقط — الافتراضي الصوتي */
  const [mode, setMode] = useState<SessionMode>("VOICE");
  /* تاريخ الجلسة — اليوم افتراضياً (أو الغد إن كانت كل مواعيد اليوم قد فاتت) */
  const [date, setDate] = useState<string>("");
  const [slot, setSlot] = useState<string>(SLOT_TIMES[0]);
  const [busy, setBusy] = useState(false);
  /* مؤشر زمني حيّ: يعيد الحسابة كل 30 ثانية فتُعطّل مواعيد اليوم التي انقضت
     حتى لو بقيت النافذة مفتوحة عبر منتصف الدقيقة/الليل */
  const [, setTick] = useState(0);
  const [pastErr, setPastErr] = useState(false);
  const [slotErr, setSlotErr] = useState(false);
  /* v2.8.0: المواعيد المحجوزة من عميلين آخرين + أخطاء التوزيع العادل */
  const [taken, setTaken] = useState<Record<string, string[]>>({});
  const [dayLimitErr, setDayLimitErr] = useState(false);
  const [dayFullErr, setDayFullErr] = useState(false);
  /* v2.9.0: الحجز مغلق — الحساب بانتظار توثيق التضرر من الحرائق */
  /* v1.0.0 (طمأنينة): رصيد غير كافٍ — {needed, balance} للعرض في النافذة */

  /* جدول توفر الأخصائي المستهدف — null = غير مخصّص = كل الأوقات (كما في v2.5) */
  const availability: WeeklyAvailability | null = target?.weeklyAvailability ?? null;

  useEffect(() => {
    if (!open) return;
    const i = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(i);
  }, [open]);

  const todayStr = localDateStr();
  const isToday = date === todayStr;
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  /* الموعد الماضي اليوم = معطّل، ويُختار أول موعد متاح افتراضياً */
  const slotPassed = (s: string) => {
    if (!isToday) return false;
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m <= nowMinutes;
  };

  /* v2.6.0: هل يوفر هذا الأخصائي الساعة في يوم التاريخ المختار؟ */
  const daySlots = date ? slotsForDay(availability, weekdayOfDate(date)) : [...SLOT_TIMES];
  const slotEnabled = (s: string) => daySlots.includes(s);
  const hasAnySlot = daySlots.length > 0;
  /* v2.8.0: هل حجز عميل آخر هذا الموعد؟ */
  const slotTakenByOther = (s: string) => (taken[date] || []).includes(s);

  /* مواعيد المطابقة القابلة للحجز مع هذا الأخصائي (تاريخ محدد + ساعة) */
  const highlightForTarget = (highlightSlots || []).filter((p) => slotEnabled(p.slot));

  useEffect(() => {
    const handler = (e: Event) => {
      const c = (e as CustomEvent).detail as CounselorCard;
      setTarget(c);
      setOpen(true);
    };
    window.addEventListener("open-booking", handler);
    return () => window.removeEventListener("open-booking", handler);
  }, []);

  /* عند فتح النافذة: 
     - مع مواعيد مطابقة: أول موعد مطابق صالح (تاريخه وساعته في المستقبل)
     - وإلا: اليوم أو أقرب يوم لاحق، وأول موعد متاح */
  /* v2.8.0: جلب المواعيد المحجوزة لهذا الأخصائي عند فتح النافذة —
     الموعد الذي اختاره أي عميل آخر يُعرض معطّلاً منذ البداية */
  useEffect(() => {
    if (!open || !target) return;
    setTaken({});
    fetch(`/api/taken-slots?counselorId=${target.userId}&days=21`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setTaken(d?.taken || {}))
      .catch(() => {});
  }, [open, target?.userId]);

  useEffect(() => {
    if (!open || !target) return;
    setPastErr(false);
    setSlotErr(false);
    setDayLimitErr(false);
    setDayFullErr(false);

    const d = new Date();
    if (d.getHours() * 60 + d.getMinutes() >= 21 * 60) {
      d.setDate(d.getDate() + 1);
    }
    let dateValue = localDateStr(d);
    let slotValue = "";

    if (highlightForTarget.length > 0) {
      /* وضع المطابقة: رتّب المواعيد زمنياً واختر أول واحد لم ينقضِ */
      const sorted = [...highlightForTarget].sort((a, b) => (a.date + a.slot).localeCompare(b.date + b.slot));
      const now = Date.now();
      const valid = sorted.find((p) => {
        const [h, m] = p.slot.split(":").map(Number);
        const dt = new Date(`${p.date}T00:00:00`);
        dt.setHours(h, m, 0, 0);
        return dt.getTime() > now;
      });
      if (valid) {
        dateValue = valid.date;
        slotValue = valid.slot;
      }
    }

    if (!slotValue) {
      const wd = weekdayOfDate(dateValue);
      const slots = slotsForDay(availability, wd);
      const nowM = d.getHours() * 60 + d.getMinutes();
      /* v2.10.0: أول موعد حر = ضمن الجدول + غير فائت + غير محجوز من عميل آخر */
      const firstFree =
        dateValue === localDateStr()
          ? slots.find((s) => {
              if (slots.length === 0) return false;
              if ((taken[dateValue] || []).includes(s)) return false;
              const [h, m] = s.split(":").map(Number);
              return h * 60 + m > nowM;
            })
          : slots.find((s) => !(taken[dateValue] || []).includes(s)) || slots[0];
      if (firstFree) {
        slotValue = firstFree;
      } else {
        /* اليوم بلا مواعيد متاحة (أو كلها فاتت) — ابحث في الأيام الـ 14 القادمة */
        for (let i = 1; i <= 14 && !slotValue; i++) {
          const nd = new Date(d);
          nd.setDate(d.getDate() + i);
          const ndStr = localDateStr(nd);
          const ndSlots = slotsForDay(availability, nd.getDay());
          if (ndSlots.length > 0) {
            dateValue = ndStr;
            slotValue = ndSlots[0];
          }
        }
      }
      if (!slotValue) slotValue = SLOT_TIMES[0];
    }

    setDate(dateValue);
    setSlot(slotValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target?.id]);

  /* عند تغيير التاريخ يدوياً: إن كانت الساعة الحالية غير متوفرة في اليوم الجديد،
     انتقل لأول ساعة متاحة فيه */
  const changeDate = (v: string) => {
    const nv = v || todayStr;
    setDate(nv);
    const slots = slotsForDay(availability, weekdayOfDate(nv));
    if (slots.length && !slots.includes(slot)) setSlot(slots[0]);
    setPastErr(false);
    setSlotErr(false);
  };

  const confirm = async () => {
    if (!user || !target) return;
    const [h, m] = slot.split(":").map(Number);
    const scheduledAt = new Date(`${date}T00:00:00`);
    scheduledAt.setHours(h, m, 0, 0);

    /* تحقق لحظي عند التأكيد (لا اعتماد على قيم محسوبة سابقاً):
       الموعد الفائت مرفوض — ومنعُه مضمون في الخادم أيضاً */
    if (scheduledAt.getTime() <= Date.now()) {
      setPastErr(true);
      return;
    }
    /* v2.6.0: تحقق لحظي من جدول الأخصائي — الساعة غير متوفرة عنده */
    if (!slotEnabled(slot)) {
      setSlotErr(true);
      return;
    }
    setPastErr(false);
    setSlotErr(false);

    setBusy(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          victimId: user.id,
          counselorId: target.userId,
          topic: clientDraft.topic || "other",
          mode,
          scheduledAt: scheduledAt.toISOString(),
          date,
          slot,
          /* v1.3.0: عملة عرض العميل — يُثبّت سعر هذه العملة على الجلسة */
          currency,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setOpen(false);
        /* ═ v1.10.0: العقد جاهز لحظة الحجز (بإمضاء الأخصائي المسبق) ═
           إشعار عام يفتح النافذة المنبثقة فوراً فوق أي صفحة يتّجه إليها
           العميل — دون انتظار نافذة الاطمئنان أو دورة الاستقصاء */
        if (data.contract?.id) {
          try {
            window.dispatchEvent(new CustomEvent(CONTRACT_ARRIVED_EVENT, { detail: { number: data.contract.number || null } }));
          } catch {
            /* تجاهل */
          }
        }
        onBooked();
      } else if (data.error === "PAST_DATE") {
        /* رفض الخادم (سباق زمني نادر): نبهرّ الحالة ونطلب موعداً آخر */
        setPastErr(true);
        setDate(localDateStr());
        setSlot(SLOT_TIMES.find((s) => !slotPassed(s) && slotEnabled(s)) || daySlots[0] || SLOT_TIMES[0]);
      } else if (data.error === "SLOT_UNAVAILABLE") {
        setSlotErr(true);
      } else if (data.error === "SLOT_TAKEN") {
        /* v2.8.0: سبق عميل آخر لنفس الموعد — علّمه محجوزاً محلياً واطلب موعداً آخر */
        setTaken((cur) => ({ ...cur, [date]: [...(cur[date] || []), slot] }));
        setSlotErr(false);
        setDayLimitErr(false);
        setDayFullErr(false);
      } else if (data.error === "INSUFFICIENT_BALANCE") {
        /* v1.1.0: لم يعد له معنى — بلا محفظة (يُتجاهل) */
      } else if (data.error === "VICTIM_DAY_LIMIT") {
        setDayLimitErr(true);
      } else if (data.error === "COUNSELOR_DAY_FULL") {
        setDayFullErr(true);
      }
    } finally {
      setBusy(false);
    }
  };

  /* v1.5.0: لا نص في طرق الاستشارة — صوتية أو مرئية فقط (طلب المستخدم)،
     والدردشة النصية تبقى أداة تواصل مساندة داخل الغرفة وزر «تواصل» */
  const modes: { key: SessionMode; icon: React.ElementType }[] = [
    { key: "VOICE", icon: MicIcon },
    { key: "VIDEO", icon: VideoIcon },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-start">
            {t.client.bookingTitle} <span className="text-primary">{target?.fullName}</span>
          </DialogTitle>
          <DialogDescription className="text-start">
            {clientDraft.topic ? t.client.topics[clientDraft.topic] : ""} ·{" "}
            {user?.wilaya ? WILAYA_LABELS[user.wilaya]?.[lang] ?? "" : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <span className="text-sm font-bold">{t.client.bookingModeLabel}</span>
            <div className="grid grid-cols-2 gap-2">
              {modes.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMode(m.key)}
                  className={`rounded-xl border-2 p-3 flex flex-col items-center gap-1.5 transition-all ${
                    mode === m.key
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <m.icon className="h-5 w-5" />
                  <span className="text-xs font-bold">{t.session.modes[m.key]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-bold flex items-center gap-1.5">
              <CalendarClock className="h-4 w-4" /> {t.client.bookingDateLabel}
            </span>
            <input
              type="date"
              dir="ltr"
              value={date}
              min={todayStr}
              onChange={(e) => changeDate(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm"
            />
          </div>

          <div className="space-y-2">
            <span className="text-sm font-bold flex items-center gap-1.5">
              <Clock className="h-4 w-4" /> {t.client.bookingSlotLabel}
            </span>
            {/* v2.10.0: تُعرض الساعات التي يسمح بها جدول هذا الأخصائي فقط
                (وكل الساعات إن لم يخصص جدولاً) — المتاح أخضر واضح،
                المحجوز مشطوب بشارة حمراء، وفائت اليوم مشطوب رمادياً */}
            {hasAnySlot ? (
              <div className="grid grid-cols-4 gap-2">
                {SLOT_TIMES.filter((s) => slotEnabled(s)).map((s) => {
                  const passed = slotPassed(s);
                  const takenByOther = slotTakenByOther(s);
                  const disabled = passed || takenByOther;
                  const isHighlight = highlightForTarget.some((p) => p.date === date && p.slot === s);
                  return (
                    <button
                      key={s}
                      disabled={disabled}
                      onClick={() => {
                        setSlot(s);
                        setSlotErr(false);
                        setDayLimitErr(false);
                        setDayFullErr(false);
                      }}
                      title={takenByOther ? t.client.bookedSlotTaken : passed ? t.client.bookingPastError : t.client.slotFreeLegend}
                      className={`rounded-lg border py-1 text-xs font-bold font-mono transition-all flex flex-col items-center ${
                        slot === s
                          ? "border-primary bg-primary text-white shadow-sm"
                          : takenByOther
                            ? "border-destructive/40 bg-destructive/10 text-destructive/60 cursor-not-allowed"
                            : passed
                              ? "border-border/50 text-muted-foreground/40 line-through cursor-not-allowed"
                              : isHighlight
                                ? "border-primary bg-primary/20 text-primary ring-2 ring-primary/30"
                                : "border-primary/50 bg-primary/10 text-primary hover:bg-primary/25 hover:shadow-sm"
                      }`}
                    >
                      <span className={takenByOther ? "line-through" : ""}>{s}</span>
                      {takenByOther && (
                        <span className="text-[8px] font-black not-italic tracking-wide">{t.client.slotTakenBadge}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-bold px-3 py-2.5 text-center">
                {t.client.bookingNoSlotsDay}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground font-semibold">{t.client.bookingSlotHint}</p>
            {/* v2.10.0: مفتاح مزدوج واضح — الأخضر متاح، والأحمر المشطوب محجوز */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <p className="text-[10px] font-bold text-primary flex items-center gap-1.5">
                <span className="inline-block rounded border border-primary/50 bg-primary/15 px-1 text-[8px]">✓</span>
                {t.client.slotFreeLegend}
              </p>
              <p className="text-[10px] font-bold text-destructive/80 flex items-center gap-1.5">
                <span className="inline-block rounded border border-destructive/40 bg-destructive/10 px-1 text-[8px]">X</span>
                {t.client.bookedSlotTaken}
              </p>
            </div>
          </div>

          {pastErr && (
            <p className="text-xs font-bold text-destructive text-center" role="alert">
              {t.client.bookingPastError}
            </p>
          )}
          {slotErr && (
            <p className="text-xs font-bold text-destructive text-center" role="alert">
              {t.client.bookingSlotErr}
            </p>
          )}
          {dayLimitErr && (
            <p className="text-xs font-bold text-destructive text-center" role="alert">
              {t.client.dayLimitError}
            </p>
          )}
          {dayFullErr && (
            <p className="text-xs font-bold text-amber-600 dark:text-amber-400 text-center" role="alert">
              {t.client.counselorDayFull}
            </p>
          )}
          {/* v1.1.0 (طمأنينة): سعر الجلسة بالدينار الجزائري — واضح وإلزامي قبل تأكيد الحجز */}
          {target && (
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 px-4 py-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-bold text-muted-foreground">{t.client.sessionPriceLabel}</div>
                <div className="font-black text-primary text-xl" dir="ltr">
                  {/* v1.3.0: سعر عملة العرض المختارة تحديداً — بلا أي تحويل */}
                  {fmtMoney(
                    priceForCurrency(target.sessionPrices, currency as CurrencyCode, target.sessionPrice),
                    currency as CurrencyCode,
                    lang
                  )}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground font-semibold leading-relaxed">{t.client.payNote}</p>
            </div>
          )}
          <Button
            className="w-full gradient-primary text-white font-black rounded-xl h-12"
            disabled={busy || slotPassed(slot) || !slotEnabled(slot) || slotTakenByOther(slot)}
            onClick={confirm}
          >
            {busy ? t.common.loading : t.client.bookingConfirm}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
