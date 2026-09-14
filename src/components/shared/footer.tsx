"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { useApp, type ViewName } from "@/lib/store";
import { LogoMark } from "@/lib/logo";
import { Mail, MessageCircle, HeartHandshake, Trophy } from "lucide-react";
import { WhatsAppGlyph } from "@/components/session/whatsapp-panel";
import { AlgeriaFlag } from "@/components/shared/algeria-flag";
import { RoyalCrown } from "@/components/shared/crown-badge";
import { playSound } from "@/lib/sounds";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const CONTACT_EMAIL = "stevenhacen@gmail.com";
const CONTACT_WHATSAPP_LOCAL = "0542163526";
const CONTACT_WHATSAPP_INTL = "213542163526";

/**
 * فوتر المنصة: هوية المطور + روابط منظمة + تواصل مباشر
 * صفان مريحان بلا تشويش — وكل عناصره مترجمة للغات الثلاث.
 *
 * v2.7.0 — التحدي الداخلي:
 * علم الجزائر أسفل الصفحة هو قلب اللغز السري الخاص بالمختصين.
 * الضغط عليه من حساب مختص مسجّل يُسجّل ضغطة في الخادم، ومن يبلغ
 * العدد السرّي أولاً يفوز فوراً بنافذة أنيقة + تاج ملكي فوق صورته.
 * اللغز لا يُكشف للآخرين: الضغط لبقية المستخدمين مجرد لمسة زخرفية.
 */
export function AppFooter() {
  const { t } = useI18n();
  const { setView } = useApp();
  const { user } = useApp();

  const [myClicks, setMyClicks] = useState(0);
  const [winOpen, setWinOpen] = useState(false);
  const [clickBusy, setClickBusy] = useState(false);
  /* v1.6.0: التحدي فعالاً؟ الفوز/التعطيل من الإدارة يطفئه فوراً —
     العلم يصبح زخرفياً والنافذة تختفي (طلب المستخدم الصريح) */
  const activeRef = useRef(true);
  const [floaters, setFloaters] = useState<{ id: number; dx: number }[]>([]);
  const floaterId = useRef(0);
  /* تحريك علمي لطيف عند الضغط — للجميع */
  const [flagWave, setFlagWave] = useState(0);

  /* قراءة تقدمي اليوم عند الولوج (أخصائي فقط) — يكفي عدد ضغطاتي بلا أي مؤشر للهدف */
  useEffect(() => {
    if (!user || user.role !== "COUNSELOR" || !user.id) return;
    fetch(`/api/challenge?userId=${user.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.ok) {
          setMyClicks(Number(d.myClicks) || 0);
          activeRef.current = d.active !== false;
        }
      })
      .catch(() => {});
  }, [user]);

  /* الضغطة على العلم: ضغطة حقيقية واحدة في الخادم لكل أخصائي مسجّل — لا شيء يُكشف */
  const onFlagClick = useCallback(async () => {
    setFlagWave((w) => w + 1);
    if (!user || user.role !== "COUNSELOR" || !user.id || clickBusy) {
      playSound("click");
      return;
    }
    /* v1.6.0: تحدٍّ منتهٍ (فوز سابق/تعطيل من الإدارة/انتهاء المدة) = زخرفة فقط */
    if (!activeRef.current) {
      playSound("click");
      return;
    }
    setClickBusy(true);
    try {
      const res = await fetch("/api/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await res.json();
      if (data?.ok) {
        setMyClicks(Number(data.clicks) || 0);
        if (data.won) {
          /* الفائز الأول: نافذة أنيقة فورية — والتحدي يُعطَّل فوراً بعد ذلك */
          activeRef.current = false;
          playSound("success");
          setWinOpen(true);
        } else {
          playSound("click");
          /* نقطة +1 طائرة صغيرة */
          const id = ++floaterId.current;
          setFloaters((f) => [...f.slice(-6), { id, dx: Math.round((Math.random() - 0.5) * 36) }]);
          setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 850);
        }
      } else {
        playSound("click");
      }
    } catch {
      playSound("click");
    } finally {
      setClickBusy(false);
    }
  }, [user, clickBusy]);

  const quickLinks: { label: string; view: ViewName }[] = [
    { label: t.nav.findHelp, view: "roles" },
    /* v2.13.0: صفحة كيف تعمل المنصة */
    { label: t.nav.how, view: "how" },
    { label: t.nav.counselors, view: "counselors-directory" },
    /* v1.16.0: العيادات النفسية + الإعلانات الممولة */
    { label: t.nav.clinics, view: "clinics-directory" },
    { label: t.nav.ads, view: "ads", },
    /* v2.14.0: صفحة تمارين التهدئة */
    { label: t.nav.exercises, view: "exercises" },
    { label: t.nav.sessions, view: "client-sessions" },
    { label: t.nav.thanks, view: "gratitude" },
    { label: t.nav.settings, view: "settings" },
    { label: t.nav.faq, view: "faq" },
    { label: t.nav.feedback, view: "feedback" },
  ];

  const legalLinks: { label: string; view: ViewName }[] = [
    { label: t.nav.about, view: "about" },
    /* v2.8.0: صفحة المؤسسين */
    { label: t.founders.title, view: "founders" },
    /* v2.9.0: صفحة الدعاء */
    { label: t.dua.title, view: "dua" },
    { label: t.nav.privacy, view: "privacy" },
    { label: t.nav.terms, view: "terms" },
    { label: t.nav.contact, view: "contact" },
    /* دخول الإدارة — صفحة خاصة منفصلة
       v1.16.0: يختفي كلياً عن أي مستخدم مسجّل الدخول (عميل/مختص/عيادة) */
    ...(user ? [] : [{ label: t.nav.adminLogin, view: "admin-login" as ViewName }]),
  ];

  return (
    <footer className="mt-auto bg-card border-t border-border">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* الصف الأول: الهوية + التواصل */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="space-y-2.5 max-w-sm">
            <div className="flex items-center gap-2.5">
              {/* v2.8.0: شعار الفوتر يفتح الصفحة الرئيسية */}
              <button onClick={() => setView("landing")} className="rounded-lg outline-none focus-visible:ring-2 ring-ring" aria-label={t.nav.home} title={t.nav.home}>
                <LogoMark size={34} />
              </button>
              <div className="leading-tight">
                <div className="font-black text-gradient text-sm flex items-center gap-1.5">
                  {t.common.appName}
                  {/* v1.16.0: علم الجزائر الرسمي بجانب اسم المنصة في كل مكان */}
                  <AlgeriaFlag size={18} className="shrink-0" />
                </div>
                <div className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                  <HeartHandshake className="h-3 w-3 text-primary" />
                  {t.footer.byline}
                </div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed font-semibold">
              {t.footer.tagline}
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-black text-foreground/80">{t.footer.contact}</h3>
            <div className="flex flex-col gap-2">
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-primary transition-colors w-fit"
                dir="ltr"
              >
                <span className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Mail className="h-3.5 w-3.5 text-primary" />
                </span>
                {CONTACT_EMAIL}
              </a>
              <a
                href={`https://wa.me/${CONTACT_WHATSAPP_INTL}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-[#128C4A] transition-colors w-fit"
              >
                <span className="h-7 w-7 rounded-lg bg-[#25D366]/15 flex items-center justify-center shrink-0">
                  <WhatsAppGlyph className="h-3.5 w-3.5 text-[#128C4A]" />
                </span>
                <span dir="ltr">{CONTACT_WHATSAPP_LOCAL}</span>
                <span className="text-[10px] font-semibold text-muted-foreground/70 flex items-center gap-1">
                  <MessageCircle className="h-3 w-3" />
                  {t.footer.whatsapp}
                </span>
              </a>
            </div>
          </div>
        </div>

        {/* الصف الثاني: الروابط */}
        <div className="pt-4 border-t border-border/60 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {quickLinks.map((l) => (
            <button
              key={l.view}
              className="text-[11px] font-semibold text-muted-foreground hover:text-primary transition-colors"
              onClick={() => setView(l.view)}
            >
              {l.label}
            </button>
          ))}
          <span className="text-border">|</span>
          {legalLinks.map((l) => (
            <button
              key={l.view}
              className="text-[11px] font-semibold text-muted-foreground hover:text-primary transition-colors"
              onClick={() => setView(l.view)}
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* حقوق النشر + علم الجزائر — قلب التحدي السري (v2.7.0) */}
        <div className="flex items-center justify-center gap-2.5">
          <div className="text-center text-[10px] text-muted-foreground/80 font-semibold">
            © 2026 {t.common.appName} — {t.footer.rights}
          </div>
          <button
            onClick={onFlagClick}
            aria-label="🇩🇿"
            title="🇩🇿"
            className="relative group outline-none"
          >
            <motion.span
              key={flagWave}
              initial={{ scale: 1 }}
              animate={{ scale: [1, 0.82, 1.08, 1] }}
              transition={{ duration: 0.35 }}
              className="block"
            >
              <AlgeriaFlag size={30} rounded={false} className="drop-shadow-sm opacity-90 group-hover:opacity-100 transition-opacity" />
            </motion.span>
            {/* عدّاد ضغطاتي اليوم — للأخصائي اللاعب فقط وبما التحدي فعالاً (v1.6.0):
                الفوز أو التعطيل يخفيه — «تختفي النافذة الخاصة به» */}
            {user?.role === "COUNSELOR" && activeRef.current && myClicks > 0 && (
              <span className="absolute -top-1.5 -end-1.5 rounded-full bg-amber-500 text-white text-[8px] font-black h-4 min-w-4 px-1 flex items-center justify-center shadow">
                {myClicks}
              </span>
            )}
            {/* +1 طائرة عند كل ضغطة صالحة */}
            <AnimatePresence>
              {floaters.map((f) => (
                <motion.span
                  key={f.id}
                  initial={{ opacity: 0.95, y: 0, x: f.dx, scale: 0.7 }}
                  animate={{ opacity: 0, y: -34, x: f.dx, scale: 1.15 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="absolute -top-1 left-1/2 -translate-x-1/2 text-[11px] font-black text-amber-500 pointer-events-none"
                >
                  +1
                </motion.span>
              ))}
            </AnimatePresence>
          </button>
        </div>
      </div>

      {/* نافذة الفوز — تظهر فوراً عند حسم اللغز لأول مرة (v2.7.0) */}
      <Dialog open={winOpen} onOpenChange={(v) => !v && setWinOpen(false)}>
        <DialogContent className="sm:max-w-sm overflow-hidden">
          {/* توهج ذهبي علوي */}
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-amber-400/25 to-transparent pointer-events-none" />
          <DialogHeader>
            <DialogTitle className="text-center pt-2">
              <div className="flex justify-center mb-3">
                <motion.div
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 14 }}
                >
                  <RoyalCrown size={72} />
                </motion.div>
              </div>
              <span className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-600">
                {t.challenge.wonTitle}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.15, type: "spring", stiffness: 200, damping: 12 }}
              className="mx-auto w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/40"
            >
              <Trophy className="h-7 w-7 text-white" />
            </motion.div>
            <p className="text-sm font-bold leading-relaxed">{t.challenge.wonDesc}</p>
            <p className="text-xs text-muted-foreground font-semibold leading-relaxed bg-amber-500/10 rounded-xl px-3 py-2.5">
              {t.challenge.wonContact}
            </p>
            <Button
              className="w-full gradient-primary text-white font-black rounded-xl h-11"
              onClick={() => {
                playSound("success");
                setWinOpen(false);
              }}
            >
              {t.challenge.wonClose}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </footer>
  );
}
