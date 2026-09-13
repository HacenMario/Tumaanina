"use client";

import { useRef } from "react";
import { useTheme } from "next-themes";
import { Globe, Palette, Menu, LogOut, LogIn, UserRound, Stethoscope, TriangleAlert, House, CircleHelp, HeartHandshake, Stethoscope as StethoscopeIcon, Users, CalendarDays, LayoutDashboard, MessageSquare, Shield, Settings, Heart, Info, MessagesSquare, Lock, FileText, Mail, UsersRound, Sparkles, Waves, GraduationCap, Coins, Check, BarChart3, Building2, Megaphone } from "lucide-react";
import { useState } from "react";
import { useI18n, LANG_META } from "@/lib/i18n";
import { useApp, type ViewName } from "@/lib/store";
import { LogoFull } from "@/lib/logo";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NotificationsBell } from "@/components/shared/notifications-bell";
import { BreathingTriggerButton } from "@/components/shared/breathing-exercise";
import { openThemeStudio } from "@/components/shared/theme-studio";
import { triggerQuickHideIfEnabled } from "@/lib/quick-hide";
import { showAppToast } from "@/components/shared/app-toast";
import { cn } from "@/lib/utils";
import type { AppLang, CurrencyCode } from "@/lib/constants";
import { CURRENCIES, CURRENCY_CODES } from "@/lib/constants";
import type { LucideIcon } from "lucide-react";

/* v2.14.0: أيقونة معبّرة قبل اسم كل صفحة في القائمة الجانبية (طلب المستخدم) */
const VIEW_ICONS: Partial<Record<ViewName, LucideIcon | "🤲">> = {
  landing: House,
  how: CircleHelp,
  roles: HeartHandshake,
  "counselors-directory": StethoscopeIcon,
  "clinics-directory": Building2,
  "clinic-page": Building2,
  "clinic-auth": Building2,
  "clinic-dashboard": LayoutDashboard,
  ads: Megaphone,
  community: Users,
  "client-sessions": CalendarDays,
  "counselor-dashboard": LayoutDashboard,
  "counselor-stats": BarChart3,
  "admin-chat": MessagesSquare,
  "admin-panel": Shield,
  "admin-login": Lock,
  settings: Settings,
  gratitude: Heart,
  about: Info,
  faq: CircleHelp,
  feedback: MessagesSquare,
  privacy: Lock,
  terms: FileText,
  contact: Mail,
  founders: UsersRound,
  dua: "🤲",
  exercises: Waves,
  "client-start": UserRound,
  "counselor-login": Stethoscope,
  "counselor-auth": Stethoscope,
  "counselor-register": GraduationCap,
  "client-topics": HeartHandshake,
  "client-slots": CalendarDays,
  "client-find": Sparkles,
  "session-room": UsersRound,
};

function ViewIcon({ view, className }: { view: ViewName; className?: string }) {
  const icon = VIEW_ICONS[view];
  if (!icon) return null;
  if (icon === "🤲") {
    return <span className={cn("shrink-0 text-base leading-none", className)} aria-hidden="true">🤲</span>;
  }
  const Icon = icon;
  return <Icon className={cn("h-4 w-4 shrink-0 text-primary", className)} aria-hidden="true" />;
}

export function AppHeader() {
  const { t, lang, setLang } = useI18n();
  const { currency, setCurrency } = useApp();
  const { user, view, setView, logout } = useApp();
  const [open, setOpen] = useState(false);
  /* v2.8.0: نافذة «هام جدا - اقرأني» — إرشادات التثبيت وتفعيل الإشعارات */
  const [importantOpen, setImportantOpen] = useState(false);

  /* الإخفاء السريع (v2.5.3): 3 ضغطات سريعة على الشعار = اختباء فوري خلف حاسبة.
     الضغطة المنفردة تبقى تنقلاً عادياً للرئيسية — لا تغيير يُلاحظ */
  const tapTimesRef = useRef<number[]>([]);
  const onLogoTap = () => {
    setView("landing");
    const now = Date.now();
    const times = [...tapTimesRef.current, now].filter((t) => now - t < 800);
    tapTimesRef.current = times;
    if (times.length >= 3) {
      tapTimesRef.current = [];
      triggerQuickHideIfEnabled();
    }
  };

  const role = user?.role;
  /* wide: روابط ثانوية تظهر فقط على الشاشات العريضة (≥1536px) — بالفرنسية والإنجليزية
     تستهلك مساحة كبيرة وتضغط القائمة، وهي متوفرة في قائمة الهاتف والفوتر دائماً */
  const navItems: { label: string; view: ViewName; show: boolean; wide?: boolean }[] = [
    { label: t.nav.home, view: "landing", show: true },
    { label: t.nav.how, view: "how", show: true, wide: true },
    { label: t.nav.findHelp, view: "roles", show: !role || role === "VICTIM" },
    { label: t.nav.counselors, view: "counselors-directory", show: true, wide: true },
    { label: t.nav.clinics, view: "clinics-directory", show: true },
    { label: t.nav.ads, view: "ads", show: true, wide: true },
    { label: t.nav.community, view: "community", show: true },
    { label: t.nav.exercises, view: "exercises", show: true, wide: true },
    { label: t.nav.sessions, view: "client-sessions", show: role === "VICTIM" },
    { label: t.nav.dashboard, view: "counselor-dashboard", show: role === "COUNSELOR" },
    { label: t.nav.myStats, view: "counselor-stats", show: role === "COUNSELOR" },
    { label: t.nav.adminChat, view: "admin-chat", show: role === "COUNSELOR" },
    { label: t.nav.clinicDash, view: "clinic-dashboard", show: role === "CLINIC" },
    { label: t.nav.admin, view: "admin-panel", show: role === "ADMIN" },
    { label: t.nav.settings, view: "settings", show: true },
    { label: t.nav.thanks, view: "gratitude", show: true, wide: true },
    { label: t.nav.about, view: "about", show: true, wide: true },
    { label: t.nav.faq, view: "faq", show: true, wide: true },
    { label: t.nav.feedback, view: "feedback", show: true, wide: true },
  ];
  /* روابط إضافية في قائمة الهاتف — نستبعد ما ظهر فعلاً في القائمة الرئيسية
     (الأخصائيون/الشكر مثلاً) حتى لا تتكرر الصفحة نفسها مرتين في sidebar */
  const shownViews = new Set(navItems.filter((n) => n.show).map((n) => n.view));
  const secondaryItems: { label: string; view: ViewName }[] = (
    [
      /* v2.13.0: صفحة كيف تعمل المنصة — في قائمة الهاتف دائماً */
      { label: t.nav.how, view: "how" as ViewName },
      { label: t.nav.counselors, view: "counselors-directory" as ViewName },
      { label: t.nav.clinics, view: "clinics-directory" as ViewName },
      { label: t.nav.ads, view: "ads" as ViewName },
      { label: t.nav.thanks, view: "gratitude" as ViewName },
      { label: t.nav.privacy, view: "privacy" as ViewName },
      { label: t.nav.terms, view: "terms" as ViewName },
      { label: t.nav.contact, view: "contact" as ViewName },
      /* v2.8.0: صفحة المؤسسين */
      { label: t.founders.title, view: "founders" as ViewName },
      /* v2.9.0: صفحة الدعاء */
      { label: t.dua.title, view: "dua" as ViewName },
      /* دخول الإدارة — في أسفل القائمة بعيداً عن مسارات المستخدمين */
      { label: t.nav.adminLogin, view: "admin-login" as ViewName },
    ]
  ).filter((n) => !shownViews.has(n.view));

  const doLogout = () => {
    setOpen(false);
    logout();
    setView("landing");
    /* v2.12.0: تأكيد نجاح تسجيل الخروج — لم يكن هناك أي إشعار سابقاً */
    showAppToast(t.toast.logoutSuccess, t.toast.logoutSub);
  };

  return (
    <header className="sticky top-0 z-50 glass border-b border-border/60">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 h-16 flex items-center justify-between gap-1.5 sm:gap-2">
        <button
          onClick={onLogoTap}
          className="flex items-center rounded-xl focus-visible:ring-2 ring-ring outline-none"
          aria-label={t.common.appName}
        >
          <LogoFull lang={lang} compact={false} />
        </button>

        {/* Desktop nav — الروابط الثانوية فقط على الشاشات العريضة (≥1536px)
            حتى لا تضغط النصوص الفرنسية/الإنجليزية الطويلة، وهي متوفرة دائماً
            في قائمة الهاتف والفوتر */}
        <nav className="hidden lg:flex items-center gap-0.5 xl:gap-1 min-w-0" aria-label="main">
          {navItems
            .filter((n) => n.show)
            .map((n) => (
              <Button
                key={n.view}
                variant={view === n.view ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "text-sm font-semibold px-2.5 xl:px-3 whitespace-nowrap",
                  n.wide && "hidden 2xl:inline-flex"
                )}
                onClick={() => setView(n.view)}
              >
                {n.label}
              </Button>
            ))}
        </nav>

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* v2.9.0: زر تمرين تهدئة النفس — متاح في كل الصفحات */}
          <BreathingTriggerButton className="hidden sm:inline-flex" />

          {/* v2.8.0: زر «هام جدا - اقرأني» بلون يلفت الانتباه — إرشادات التثبيت والإشعارات */}
          <Button
            size="sm"
            className="gradient-primary text-white font-black rounded-lg px-1.5 sm:px-3 h-9 animate-pulse shadow-md shadow-amber-500/20 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
            onClick={() => setImportantOpen(true)}
            title={t.nav.important}
          >
            <TriangleAlert className="h-4 w-4 shrink-0" />
            <span className="hidden md:inline text-[11px] whitespace-nowrap">{t.nav.important}</span>
          </Button>

          {/* Notifications bell */}
          <span className="shrink-0"><NotificationsBell /></span>

          {/* v2.14.0: اللغة — زر كرة أرضية واضح، وفي القائمة مفتاح On/Off أنيق
              يقابل كل لغة (طلب المستخدم) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t.settings.languageLabel} className="h-8 w-8 sm:h-9 sm:w-9">
                <Globe className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-1.5">
              {(Object.keys(LANG_META) as AppLang[]).map((l) => {
                const active = lang === l;
                return (
                  <DropdownMenuItem
                    key={l}
                    onClick={() => setLang(l)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer",
                      active && "bg-primary/10"
                    )}
                  >
                    <span className="text-base leading-none shrink-0">{LANG_META[l].flag}</span>
                    <span className="font-semibold flex-1 min-w-0 truncate">{LANG_META[l].label}</span>
                    {/* مفتاح On/Off — يعكس لغة المنصة الحالية */}
                    <Switch
                      checked={active}
                      onClick={(e) => {
                        e.stopPropagation();
                        setLang(l);
                      }}
                      aria-label={`${LANG_META[l].label} — ${active ? "On" : "Off"}`}
                      className="shrink-0"
                    />
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* v1.2.0: عملة عرض الأسعار — DZD افتراضياً وEUR/USD بضغطة */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" aria-label={t.settings.currencyLabel} className="h-8 sm:h-9 px-2.5 font-black text-xs gap-1">
                <Coins className="h-4 w-4" />
                <span dir="ltr">{currency}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 p-1.5">
              {CURRENCY_CODES.map((c) => {
                const active = currency === c;
                return (
                  <DropdownMenuItem
                    key={c}
                    onClick={() => setCurrency(c as CurrencyCode)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer",
                      active && "bg-primary/10"
                    )}
                  >
                    <span className="font-black w-9 shrink-0" dir="ltr">{c}</span>
                    <span className="font-semibold flex-1 min-w-0 truncate">{t.settings.currencyNames[c]}</span>
                    {active && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* v2.14.0: زر المظهر والثيمات — يفتح نافذة الثيمات (لوحات ألوان + نهاري/ليلي)
              بدل تبديل الوضع فقط — الثيم الحقيقي كما طلب المستخدم */}
          <Button variant="ghost" size="icon" onClick={openThemeStudio} aria-label={t.themes.title} className="h-8 w-8 sm:h-9 sm:w-9">
            <Palette className="h-5 w-5" />
          </Button>

          {/* Logout (desktop) */}
          {user && (
            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:inline-flex text-destructive"
              onClick={doLogout}
              aria-label={t.nav.logout}
              title={t.nav.logout}
            >
              <LogOut className="h-5 w-5" />
            </Button>
          )}

          {/* Mobile menu */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8 sm:h-9 sm:w-9" aria-label={t.nav.menu}>
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side={lang === "ar" ? "right" : "left"} className="w-72 flex flex-col">
              <SheetHeader className="p-4">
                <SheetTitle>
                  <LogoFull lang={lang} compact />
                </SheetTitle>
              </SheetHeader>
              <nav className="flex-1 flex flex-col gap-2 px-3 overflow-y-auto" aria-label="mobile">
                {/* v2.12.0: تسجيل الدخول مباشرة من الشريط الجانبي — للعميل وللمختص
                    (طلب المستخدم: صفحة دخول مباشرة في side bar لكلا الدورين) */}
                {!user && (
                  <div className="space-y-2 pb-2 mb-1 border-b border-border">
                    <p className="text-[10px] font-black text-muted-foreground px-1 pt-1">{t.nav.loginTitle}</p>
                    <Button
                      className="w-full justify-start font-black gradient-primary text-white rounded-xl"
                      onClick={() => {
                        setView("client-start");
                        setOpen(false);
                      }}
                    >
                      <UserRound className="h-4 w-4" />
                      {t.nav.victimLogin}
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start font-black rounded-xl border-primary/40 text-primary"
                      onClick={() => {
                        setView("counselor-login");
                        setOpen(false);
                      }}
                    >
                      <Stethoscope className="h-4 w-4" />
                      {t.nav.counselorLogin}
                    </Button>
                    {/* v1.14.0: دخول العيادة من القائمة الجانبية مباشرة */}
                    <Button
                      variant="outline"
                      className="w-full justify-start font-black rounded-xl border-primary/40 text-primary"
                      onClick={() => {
                        setView("clinic-auth");
                        setOpen(false);
                      }}
                    >
                      <Building2 className="h-4 w-4" />
                      {t.nav.clinicLogin}
                    </Button>
                  </div>
                )}
                {navItems
                  .filter((n) => n.show)
                  .map((n) => (
                    <Button
                      key={n.view}
                      variant={view === n.view ? "secondary" : "ghost"}
                      className={cn(
                        "justify-start font-semibold gap-2.5 rounded-xl py-6 min-h-11",
                        /* v1.5.0: إطار لكل صفحة + مساحة لمس مريحة على الهاتف (طلب المستخدم) */
                        view === n.view
                          ? "border-2 border-primary bg-primary/10 text-primary"
                          : "border border-border/70 bg-card hover:border-primary/40"
                      )}
                      onClick={() => {
                        setView(n.view);
                        setOpen(false);
                      }}
                    >
                      <ViewIcon view={n.view} />
                      {n.label}
                    </Button>
                  ))}

                <div className="h-px bg-border my-2" />

                {/* الصفحات الثانوية — كل الصفحات المناسبة في قائمة الهاتف */}
                {secondaryItems.map((n) => (
                  <Button
                    key={n.view}
                    variant={view === n.view ? "secondary" : "ghost"}
                    className={cn(
                      "justify-start font-semibold text-muted-foreground gap-2.5 rounded-xl py-6 min-h-11",
                      /* v1.5.0: إطار لكل صفحة + مساحة لمس مريحة على الهاتف */
                      view === n.view
                        ? "border-2 border-primary bg-primary/10 text-primary"
                        : "border border-border/70 bg-card hover:border-primary/40"
                    )}
                    onClick={() => {
                      setView(n.view);
                      setOpen(false);
                    }}
                  >
                    <ViewIcon view={n.view} />
                    {n.label}
                  </Button>
                ))}
              </nav>

              {/* v1.2.0: عملة عرض الأسعار — للجوال في القائمة الجانبية */}
              <div className="px-3 pb-2 sm:hidden">
                <p className="text-[10px] font-black text-muted-foreground px-1 pb-1.5">{t.settings.currencyLabel}</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {CURRENCY_CODES.map((c) => (
                    <Button
                      key={c}
                      size="sm"
                      variant={currency === c ? "default" : "outline"}
                      className={cn("h-8 font-black text-xs rounded-lg", currency === c && "gradient-primary text-white")}
                      onClick={() => setCurrency(c as CurrencyCode)}
                      dir="ltr"
                    >
                      {c}
                    </Button>
                  ))}
                </div>
              </div>

              {/* v2.14.0: زر المظهر والثيمات في القائمة الجانبية — واحد فقط يفتح
                  نافذة الثيمات (نُزع زر «المظهر» القديم ليلا نهاري — كان مكرراً) */}
              <div className="p-3 border-t border-border sm:hidden">
                <Button variant="outline" className="w-full justify-start font-bold gap-2.5" onClick={() => { setOpen(false); openThemeStudio(); }}>
                  <Palette className="h-4 w-4 text-primary" />
                  {t.themes.sidebarBtn}
                </Button>
              </div>

              {/* هوية المستخدم + تسجيل الخروج */}
              {user && (
                <div className="p-3 pt-0 border-t-0 border-border space-y-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground">
                    <UserRound className="h-4 w-4" />
                    <span className="truncate font-semibold">
                      {user.role === "COUNSELOR"
                        ? user.fullName || "—"
                        : user.role === "CLINIC"
                          ? user.clinicName || "—"
                          : user.role === "VICTIM"
                            ? user.pseudonym
                            : t.roles.adminTitle}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full justify-start font-bold text-destructive border-destructive/40"
                    onClick={doLogout}
                  >
                    <LogOut className="h-4 w-4" />
                    {t.nav.logout}
                  </Button>
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* v2.8.0: نافذة الإرشادات — تُترجم حسب لغة المستخدم */}
      <Dialog open={importantOpen} onOpenChange={setImportantOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-start flex items-center gap-2 text-base">
              <TriangleAlert className="h-5 w-5 text-amber-500 shrink-0" />
              {t.important.title}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs font-bold text-muted-foreground -mt-1">{t.important.subtitle}</p>
          <div className="space-y-2.5">
            {[t.important.step1, t.important.step2, t.important.step3, t.important.step4].map((line, i) => (
              <div key={i} className="flex items-start gap-2.5 rounded-xl border border-border/70 bg-muted/30 px-3.5 py-2.5">
                <span className="text-[11px] font-black text-primary font-mono shrink-0 mt-0.5">{i + 1}</span>
                <p className="text-xs font-semibold leading-relaxed flex-1">{line}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl bg-primary/5 border border-primary/20 px-3.5 py-3 space-y-1.5">
            <p className="text-xs font-black text-primary flex items-center gap-1.5">
              <TriangleAlert className="h-3.5 w-3.5" />
              {t.important.notifTitle}
            </p>
            {[t.important.notifStep1, t.important.notifStep2, t.important.notifStep3].map((line, i) => (
              <p key={i} className="text-[11px] font-semibold text-muted-foreground leading-relaxed">
                • {line}
              </p>
            ))}
          </div>
          <div className="space-y-2">
            <Button
              className="w-full gradient-primary text-white font-black rounded-xl h-11"
              onClick={() => {
                setImportantOpen(false);
                setView("settings");
              }}
            >
              {t.important.openSettings}
            </Button>
            <Button variant="outline" className="w-full rounded-xl font-bold" onClick={() => setImportantOpen(false)}>
              {t.common.close}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
