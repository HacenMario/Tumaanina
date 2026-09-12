"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { useApp } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { playSound, initGlobalSounds } from "@/lib/sounds";
import { syncPushSubscription } from "@/lib/push-client";
import { AppHeader } from "@/components/shared/header";
import { AppFooter } from "@/components/shared/footer";
import { BackToTop } from "@/components/shared/back-to-top";
import { WelcomeQuote } from "@/components/shared/welcome-quote";
import { ViewSkeleton } from "@/components/shared/algeria-skeleton";

/* ═══ v1.13.0 — تسريع الإقلاع: تقسيم الحزمة (Code Splitting) ═══
   كل الصفحات كانت تُحمَّل دفعة واحدة في الحزمة الأولى فتبطّئ أول ولوج —
   الآن: الصفحات الحرجة (الهبوط + بوابة الأدوار + مدخل العميل ووجهته
   المباشرة) تبقى فورية، والبقية تُحمَّل عند الطلب فقط (chunk لكل صفحة)
   — نفس المنطق تماماً، وحجم الجافاسكريبت الأولي أصغر بكثير، وسكيلتون
   التحميل (420ms) يغطي جلب أي chunk أثناء التنقّل. */

const ClientSlotsView = dynamic(() => import("@/components/views/client-slots").then((m) => m.ClientSlotsView), { loading: () => null });
const ClientFindView = dynamic(() => import("@/components/views/client-find").then((m) => m.ClientFindView), { loading: () => null });
const ClientSessionsView = dynamic(() => import("@/components/views/client-sessions").then((m) => m.ClientSessionsView), { loading: () => null });
const SessionRoomView = dynamic(() => import("@/components/session/session-room").then((m) => m.SessionRoomView), { loading: () => null });
const CounselorRegisterView = dynamic(() => import("@/components/views/counselor-register").then((m) => m.CounselorRegisterView), { loading: () => null });
const CounselorLoginView = dynamic(() => import("@/components/views/counselor-login").then((m) => m.CounselorLoginView), { loading: () => null });
const CounselorAuthView = dynamic(() => import("@/components/views/counselor-auth").then((m) => m.CounselorAuthView), { loading: () => null });
const CounselorsDirectoryView = dynamic(() => import("@/components/views/counselors-directory").then((m) => m.CounselorsDirectoryView), { loading: () => null });
const CommunityView = dynamic(() => import("@/components/views/community").then((m) => m.CommunityView), { loading: () => null });
const CounselorDashboardView = dynamic(() => import("@/components/views/counselor-dashboard").then((m) => m.CounselorDashboardView), { loading: () => null });
const CounselorStats = dynamic(() => import("@/components/views/counselor-stats").then((m) => m.CounselorStats), { loading: () => null });
const AdminLoginView = dynamic(() => import("@/components/views/admin").then((m) => m.AdminLoginView), { loading: () => null });
const AdminPanelView = dynamic(() => import("@/components/views/admin").then((m) => m.AdminPanelView), { loading: () => null });
const SettingsView = dynamic(() => import("@/components/views/settings").then((m) => m.SettingsView), { loading: () => null });
const FeedbackView = dynamic(() => import("@/components/views/feedback").then((m) => m.FeedbackView), { loading: () => null });
const AboutView = dynamic(() => import("@/components/views/info-pages").then((m) => m.AboutView), { loading: () => null });
const FaqView = dynamic(() => import("@/components/views/info-pages").then((m) => m.FaqView), { loading: () => null });
const PrivacyView = dynamic(() => import("@/components/views/info-pages").then((m) => m.PrivacyView), { loading: () => null });
const TermsView = dynamic(() => import("@/components/views/info-pages").then((m) => m.TermsView), { loading: () => null });
const ContactView = dynamic(() => import("@/components/views/info-pages").then((m) => m.ContactView), { loading: () => null });
const GratitudeView = dynamic(() => import("@/components/views/gratitude").then((m) => m.GratitudeView), { loading: () => null });
const FoundersView = dynamic(() => import("@/components/views/founders").then((m) => m.FoundersView), { loading: () => null });
const DuaView = dynamic(() => import("@/components/views/dua").then((m) => m.DuaView), { loading: () => null });
const HowItWorksView = dynamic(() => import("@/components/views/how-it-works").then((m) => m.HowItWorksView), { loading: () => null });
const AdminChatView = dynamic(() => import("@/components/views/admin-chat").then((m) => m.AdminChatView), { loading: () => null });
const ExercisesView = dynamic(() => import("@/components/views/exercises").then((m) => m.ExercisesView), { loading: () => null });
import { LandingView } from "@/components/views/landing";
import { RolesView } from "@/components/views/roles";
import { ClientStartView } from "@/components/views/client-start";
import { ClientTopicsView } from "@/components/views/client-topics";
import { DmDialog } from "@/components/shared/dm-dialog";
import { ThemeStudio } from "@/components/shared/theme-studio";
import { RatingsDialog } from "@/components/shared/ratings-dialog";
import { AppToast } from "@/components/shared/app-toast";
import { BookingPopups } from "@/components/shared/booking-popup";
import { FollowUpPopup } from "@/components/shared/followup-popup";
import { ContractPopup } from "@/components/shared/contract-popup";

const VIEWS: Record<string, React.ComponentType> = {
  landing: LandingView,
  roles: RolesView,
  "client-start": ClientStartView,
  "client-topics": ClientTopicsView,
  "client-slots": ClientSlotsView,
  "client-find": ClientFindView,
  "client-sessions": ClientSessionsView,
  "session-room": SessionRoomView,
  "counselor-auth": CounselorAuthView,
  "counselor-register": CounselorRegisterView,
  "counselor-login": CounselorLoginView,
  "counselor-dashboard": CounselorDashboardView,
  "counselor-stats": CounselorStats,
  "admin-chat": AdminChatView,
  "counselors-directory": CounselorsDirectoryView,
  community: CommunityView,
  "admin-login": AdminLoginView,
  "admin-panel": AdminPanelView,
  settings: SettingsView,
  feedback: FeedbackView,
  about: AboutView,
  faq: FaqView,
  privacy: PrivacyView,
  terms: TermsView,
  contact: ContactView,
  gratitude: GratitudeView,
  founders: FoundersView,
  dua: DuaView,
  how: HowItWorksView,
  exercises: ExercisesView,
};

const SKELETON_MS = 420;

export default function Home() {
  const view = useApp((s) => s.view);
  const fontScale = useApp((s) => s.fontScale);
  const [booting, setBooting] = useState(true);
  /* v2.8.0: مع استعادة الصفحة المحفوظة بعد F5 — غرفة الجلسة بلا جلسة نشطة تعود للرئيسية
     v2.12.0: عند غلق الموقع ثم الولوج إليه مجدداً تُفتح الصفحة الرئيسية دائماً
     (وليس آخر صفحة كانت مفتوحة) — التمييز بين التحديث F5 والفتحة الجديدة
     يتم عبر sessionStorage الذي يمحو المتصفح عند إغلاق التبويب ويُبقيه عند التحديث.
     روابط الربط العميق (?book / ?session / ?dm) مستثناة لأنها تحدد وجهتها بنفسها. */
  useEffect(() => {
    try {
      const ALIVE = "tumaanina-session-alive";
      const fresh = !sessionStorage.getItem(ALIVE);
      sessionStorage.setItem(ALIVE, "1");
      const st = useApp.getState();
      if (st.view === "session-room" && !st.activeSessionId) {
        useApp.setState({ view: "landing" });
        return;
      }
      if (!fresh) return;
      const sp = new URLSearchParams(window.location.search);
      const hasDeepLink =
        !!sp.get("book") ||
        !!sp.get("session") ||
        !!sp.get("dm") ||
        !!sp.get("admin-chat") ||
        !!sp.get("view") ||
        !!sessionStorage.getItem("tumaanina-pending-book") ||
        !!sessionStorage.getItem("tumaanina-open-session") ||
        !!sessionStorage.getItem("tumaanina-open-dm");
      if (!hasDeepLink && st.view !== "landing") {
        useApp.setState({ view: "landing", history: [] });
      }
    } catch {
      /* تجاهل — الميزة تحسينية */
    }
  }, []);
  const CurrentView = VIEWS[view] ?? LandingView;
  const fullBleed = view === "session-room";

  /* حجم الخط العام (إمكانية الوصول) — كل مقاسات Tailwind rem تتّبع نسبة html
     v1.4.0: سقف ذكي للهواتف — تكبير 140% على شاشة 360px كان يكسر التخطيط؛
     الآن الشاشات الضيقة تُسقّف التكبير فعلياً (115%) مع بقاء الاختيار محفوظاً،
     وتتّسع السقوف تدريجياً مع عرض الشاشة — بلا أي تشوّه في العناصر */
  useEffect(() => {
    const apply = () => {
      const w = window.innerWidth;
      const cap = w < 400 ? 115 : w < 640 ? 125 : w < 1024 ? 135 : 140;
      const eff = Math.min(fontScale, cap);
      document.documentElement.style.fontSize = `${eff}%`;
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [fontScale]);

  /* نقرة عامة على كل الأزرار + هيكل تحميل بعلم الجزائر عند كل تنقّل أو تحميل */
  useEffect(() => {
    initGlobalSounds();
  }, []);

  /* 🔄 مزامنة صامتة لاشتراك الإشعارات عند كل ولوج: إن تغيّر مفتاح الخادم
     (تحديث/نشر جديد) يُجدّد اشتراك من فعّل الإشعارات سابقاً تلقائياً —
     بلا أي رسالة أو تدخل (جزء من الحل النهائي لإشعارات الهاتف) */
  useEffect(() => {
    const u = useApp.getState().user;
    if (u?.id && u.role !== "ADMIN") {
      void syncPushSubscription(u.id, u.role).catch(() => {});
    }
  }, []);

  /* v2.5.5: ربط عميق من الملف العام للأخصائي —
     /?book={userId}&lang=ar يفتح المنصة ويبدأ عملية حجز جلسة مع
     الأخصائي المعني مباشرة: موثّق → نافذة الحجز في دليل الأخصائيين،
     غير موثّق → مسار التسجيل كعميل ثم تُفتح نافذة الحجز تلقائياً.
     كما يُطبّق لغة الزائر (?lang=) المختارة من صفحة الملف العام. */
  const setLang = useI18n().setLang;
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const l = sp.get("lang");
      if (l === "ar" || l === "fr" || l === "en") setLang(l);
      const book = sp.get("book");
      if (book) {
        sessionStorage.setItem("tumaanina-pending-book", book.slice(0, 120));
        const u = useApp.getState().user;
        useApp.getState().setView(u?.role === "VICTIM" ? "client-find" : "client-start");
        sp.delete("book");
        sp.delete("lang");
        const qs = sp.toString();
        window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
      }
      /* ─── v2.13.0: رابط صفحة عامة من إشعارات المنشورات (?view=community)
         — الضغط على إشعار «منشور جديد من أخصائي تتابعه» على الهاتف يفتح
         المنصة ثم صفحة المجتمع مباشرة ─── */
      const viewParam = sp.get("view");
      if (viewParam && VIEWS[viewParam]) {
        useApp.getState().setView(viewParam as never);
        sp.delete("view");
        const qs = sp.toString();
        window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
      }
      /* ─── v2.9.0: روابط الإشعارات (?session= / ?dm=) — الضغط على إشعار الهاتف
         عند إغلاق المنصة يفتح المنصة ثم الغرفة أو المحادثة مباشرة ─── */
      const notifSession = sp.get("session");
      const notifDm = sp.get("dm");
      /* v2.10.0: رابط إشعار محادثة الإدارة — يفتح الصفحة مباشرة للمختص */
      const notifAdminChat = sp.get("admin-chat");
      if (notifSession || notifDm || notifAdminChat) {
        if (notifSession) sessionStorage.setItem("tumaanina-open-session", notifSession.slice(0, 80));
        if (notifDm) sessionStorage.setItem("tumaanina-open-dm", notifDm.slice(0, 80));
        if (notifAdminChat) sessionStorage.setItem("tumaanina-open-admin-chat", "1");
        sp.delete("session");
        sp.delete("dm");
        sp.delete("admin-chat");
        const qs = sp.toString();
        window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
      }
    } catch {
      /* تجاهل أي فشل — الربط العميق ميزة إضافية */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setBooting(true);
    const t = setTimeout(() => setBooting(false), SKELETON_MS);
    return () => clearTimeout(t);
  }, [view]);

  /* ─── v2.9.0: تنفيذ روابط الإشعارات بعد استقرار الجلسة والمستخدم ───
     ?session={id} يفتح غرفة الجلسة مباشرة، و?dm={peerId} يفتح المحادثة
     مع الطرف المرسل — مع جلب اسمه من الخادم. */
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const sid = sessionStorage.getItem("tumaanina-open-session");
        const dmid = sessionStorage.getItem("tumaanina-open-dm");
        const st = useApp.getState();
        if (sid && st.user && st.user.role !== "ADMIN") {
          sessionStorage.removeItem("tumaanina-open-session");
          st.setActiveSession(sid);
          st.setView("session-room");
          return;
        }
        if (dmid && st.user) {
          sessionStorage.removeItem("tumaanina-open-dm");
          fetch(`/api/dm-peer?id=${encodeURIComponent(dmid)}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
              window.dispatchEvent(new CustomEvent("open-dm", { detail: { id: dmid, name: d?.name || "—" } }));
            })
            .catch(() => {
              window.dispatchEvent(new CustomEvent("open-dm", { detail: { id: dmid, name: "—" } }));
            });
        }
        /* v2.10.0: محادثة الإدارة — للمختص فقط */
        const adminChat = sessionStorage.getItem("tumaanina-open-admin-chat");
        if (adminChat && st.user && st.user.role === "COUNSELOR") {
          sessionStorage.removeItem("tumaanina-open-admin-chat");
          st.setView("admin-chat");
          return;
        }
        if (adminChat) sessionStorage.removeItem("tumaanina-open-admin-chat");
      } catch {
        /* تجاهل */
      }
    }, 700);
    return () => clearTimeout(timer);
  }, []);

  /* نغمة التنقّل — صامتة قبل أول تفاعل (سياسة المتصفحات) */
  const firstRenderRef = useRef(true);
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    playSound("navigate");
  }, [view]);

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <AppHeader />
      <main className="flex-1 flex flex-col">
        <AnimatePresence mode="wait">
          {booting ? (
            <motion.div
              key={`skeleton-${view}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col"
            >
              <ViewSkeleton />
            </motion.div>
          ) : (
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="flex-1 flex flex-col"
            >
              <CurrentView />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      {!fullBleed && <AppFooter />}
      <BackToTop />
      {/* v1.5.0: نافذة الحجوزات المنبثقة — عالمية في كل الصفحات (طلب المستخدم):
          تظهر للأخصائي فور وصول طلب جديد أينما كان، وبعد ولوجه مباشرة
          إن كان خارج المنصة، وبعد نافذة الاطمئنان إن كان مسجّلاً مسبقاً */}
      <BookingPopups />
      {/* v1.5.0: نافذة «الجلسة التالية + المزاج» للعميل — تظهر فور جدولة
          الجلسة التالية من الأخصائي مهما كانت صفحة العميل */}
      <FollowUpPopup />
      {/* v1.9.0: نافذة العقد العلاجي الإلزامية للعميل — بعد إغلاق نافذة الاطمئنان
          مباشرة إن قبول الأخصائي جلسة ووُجد عقد بانتظار إمضاء العميل */}
      <ContractPopup />
      {/* v2.8.0: محادثة ما قبل الجلسة — تُفتح من زر «تواصل» في أي صفحة */}
      <DmDialog />
      {/* v2.14.0: نافذة المظهر والثيمات — تُفتح من زر الهيدر والقائمة الجانبية */}
      <ThemeStudio />
      {/* v2.14.0: نافذة التقييمات — تُفتح من زر «التقييمات» في بطاقات المختصين وجلساتي */}
      <RatingsDialog />
      {/* v2.12.0: إشعار نجاح العمليات (تسجيل الدخول/الخروج) */}
      <AppToast />
      {/* نافذة «لحظة اطمئنان» — تظهر عند كل ولوج للموقع وتختفي تلقائياً بعد 7 ثوانٍ */}
      <WelcomeQuote />
    </div>
  );
}
