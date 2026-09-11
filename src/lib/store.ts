"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SessionMode, TopicKey, AppLang, CurrencyCode } from "@/lib/constants";

export type ViewName =
  | "landing"
  | "roles"
  | "client-start"
  | "client-topics"
  | "client-slots"
  | "client-find"
  | "client-sessions"
  | "session-room"
  | "counselor-auth"
  | "counselor-register"
  | "counselor-login"
  | "counselor-dashboard"
  | "counselor-stats"
  | "admin-chat"
  | "counselors-directory"
  | "community"
  | "admin-login"
  | "admin-panel"
  | "settings"
  | "feedback"
  | "about"
  | "faq"
  | "privacy"
  | "terms"
  | "contact"
  | "gratitude"
  | "founders"
  | "dua"
  | "how"
  | "exercises";

export interface AuthUser {
  id: string;
  role: "VICTIM" | "COUNSELOR" | "ADMIN";
  pseudonym?: string;
  fullName?: string;
  email?: string;
  language?: AppLang;
  wilaya?: string;
  ageGroup?: string;
  gender?: "male" | "female" | null;
  /* هاتف العميل (بياناته الخاصة) — يظهر للأخصائي المختار في جلسة فقط */
  phone?: string | null;
  /* v1.4.0: دور عضو فريق الإدارة (المالك/أدمين/مسير) لحسابات role=ADMIN */
  staffRole?: "SUPER" | "ADMIN" | "MANAGER";
  /* الأخصائي: حالة توثيق حسابه المهني من الإدارة — إلزامي قبل الظهور والحجز */
  verified?: boolean;
  verificationStatus?: "PENDING" | "VERIFIED" | "REJECTED";
  photo?: string;
}

interface ClientDraft {
  topic?: TopicKey;
  wilaya?: string;
  ageGroup?: string;
  prefLang?: AppLang;
  /* v2.6.0 — الخيار الأول: المواعيد التي اختارها العميل قبل ظهور القائمة
     [{ date: "YYYY-MM-DD", slot: "HH:MM" }] — فارغة = تخطّى الخطوة
     أو جاء من مسار لا يفرض اختيار المواعيد */
  preferredSlots?: { date: string; slot: string }[];
}

interface AppState {
  view: ViewName;
  history: ViewName[];
  user: AuthUser | null;
  clientDraft: ClientDraft;
  activeSessionId: string | null;
  /* حجم خط عام قابل للتكبير/التصغير (نسبة %) — لإمكانية الوصول لكل الفئات */
  fontScale: number;
  setFontScale: (n: number) => void;
  /* v1.2.0: عملة عرض الأسعار — DZD افتراضياً، وتحوّل كل الأسعار فوراً */
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;
  setView: (v: ViewName) => void;
  goBack: () => void;
  setUser: (u: AuthUser | null) => void;
  setDraft: (d: Partial<ClientDraft>) => void;
  setActiveSession: (id: string | null) => void;
  logout: () => void;
  reset: () => void;
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      view: "landing",
      history: [],
      user: null,
      clientDraft: {},
      activeSessionId: null,
      fontScale: 100,
      setFontScale: (n) => set({ fontScale: Math.min(140, Math.max(85, n)) }),
      currency: "DZD",
      setCurrency: (c) => set({ currency: c }),
      setView: (v) => {
        const cur = get().view;
        if (cur === v) return;
        set({ view: v, history: [...get().history, cur].slice(-20) });
        if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      },
      goBack: () => {
        const h = [...get().history];
        const prev = h.pop() ?? "landing";
        set({ view: prev, history: h });
      },
      setUser: (u) => set({ user: u }),
      setDraft: (d) => set({ clientDraft: { ...get().clientDraft, ...d } }),
      setActiveSession: (id) => set({ activeSessionId: id }),
      /* تسجيل الخروج لكل الأدوار: ينظّف الجلسة النشطة ويُبقي مسودة العميل */
      logout: () => set({ user: null, activeSessionId: null, view: "landing" }),
      reset: () => set({ view: "landing", history: [], user: null, clientDraft: {}, activeSessionId: null }),
    }),
    {
      name: "tumaanina-state",
      /* v2.8.0: الصفحة الحالية تُحفَظ — تحديث الصفحة (F5) يبقي المستخدم مكانه
         بدل إعادته دائماً للصفحة الرئيسية */
      partialize: (s) => ({ user: s.user, clientDraft: s.clientDraft, fontScale: s.fontScale, currency: s.currency, view: s.view }) as unknown as AppState,
    }
  )
);
