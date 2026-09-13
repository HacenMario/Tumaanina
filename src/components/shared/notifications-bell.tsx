"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellRing, CheckCheck, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { playSound } from "@/lib/sounds";
import { openDm } from "@/components/shared/dm-dialog";
import { TEXTS as NOTIF_TEMPLATES, fill } from "@/lib/notif-texts";
import type { AppLang } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NotifItem {
  id: string;
  key: string | null;
  title: string;
  body: string;
  vars?: Record<string, string> | null;
  url: string;
  read: boolean;
  createdAt: string;
}

const PAGE = 5;

/**
 * v1.6.0 — إعادة توليد نص الإشعار بلغة واجهة المستخدم الحالية.
 * ─────────────────────────────────────────────────────────────
 * طلب المستخدم: «الإشعارات لا تترجم للغات الأخرى». كان النص يُبنى
 * مرة واحدة بلغة الحساب لحظة الإرسال ويُعرض مخزّناً كما هو فالأفات
 * تبقى بلغة قديمة. الآن: كل إشعار يحمل مفتاحه ومتغيراته (vars)،
 * وعند العرض يُبنى النص من القوالب المشتركة (notif-texts) باللغة
 * المعروضة الآن — الإشعارات تُترجم فور تبديل اللغة حتى لو أُرسلت
 * قبلها بلغة أخرى. الإشعارات المخصصة بلا مفتاح (رسائل الأدمين
 * الجماعية) تُعرض بالنص المخزّن كما هو.
 */
function useNotifText(lang: AppLang) {
  return useCallback(
    (n: NotifItem): { title: string; body: string } => {
      if (n.key) {
        const tpl = (NOTIF_TEMPLATES as Record<string, Record<string, { title: string; body: string }> | undefined>)[n.key];
        const t2 = tpl?.[lang] || tpl?.ar;
        if (t2) {
          return { title: fill(t2.title, n.vars), body: fill(t2.body, n.vars) };
        }
      }
      return { title: n.title, body: n.body };
    },
    [lang]
  );
}

function relativeTime(iso: string, t: { justNow: string; minAgo: string; hourAgo: string; dayAgo: string }): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return t.justNow;
  if (min < 60) return t.minAgo.replace("{n}", String(min));
  const h = Math.floor(min / 60);
  if (h < 24) return t.hourAgo.replace("{n}", String(h));
  return t.dayAgo.replace("{n}", String(Math.floor(h / 24)));
}

export function NotificationsBell() {
  const { t, lang } = useI18n();
  const { user } = useApp();
  const [items, setItems] = useState<NotifItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(false);
  const prevUnreadRef = useRef<number | null>(null);
  const translate = useNotifText(lang);

  const load = useCallback(async () => {
    /* v2.7.0: الجرس يعمل للأدمين أيضاً — يصل منه إشعار فائز التحدي */
    if (!user?.id) return;
    try {
      const res = await fetch(`/api/notifications?userId=${user.id}`);
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.notifications || []);
      setUnread(data.unread || 0);
    } catch {
      /* تجاهل أخطاء الشبكة المؤقتة */
    }
  }, [user]);

  useEffect(() => {
    if (!user?.id) return;
    load();
    const i = setInterval(load, 12000);
    return () => clearInterval(i);
  }, [user, load]);

  /* نغمة إشعار عند وصول إشعار جديد غير مقروء */
  useEffect(() => {
    if (prevUnreadRef.current !== null && unread > prevUnreadRef.current) {
      playSound("notify");
    }
    prevUnreadRef.current = unread;
  }, [unread]);

  const markAll = async () => {
    if (!user) return;
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read", userId: user.id }),
    });
    load();
  };

  const markOne = async (id: string) => {
    if (!user) return;
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read", userId: user.id, id }),
    });
    load();
  };

  const clearAll = async () => {
    if (!user) return;
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear", userId: user.id }),
    });
    setExpanded(false);
    load();
  };

  /* ─── v2.9.0: الضغط على الإشعار يفتح مقصده مباشرة ───
     إشعار رسالة غرفة الجلسة → يفتح الغرفة نفسها.
     إشعار محادثة قبل الجلسة → يفتح المحادثة مع المرسل. */
  const openTarget = useCallback(
    async (n: NotifItem) => {
      try {
        const url = new URL(n.url, window.location.origin);
        const sessionId = url.searchParams.get("session");
        const dmId = url.searchParams.get("dm");
        /* v1.14.0: إشعار اقتراح عيادة (وكل روابط ?clinic=) — الضغط يفتح
           صفحة العيادة المقترحة مباشرة: تصفح + حجز حضوري + تقييم */
        const clinicSlug = url.searchParams.get("clinic");
        if (clinicSlug) {
          useApp.getState().setActiveClinic(clinicSlug.slice(0, 120));
          useApp.getState().setView("clinic-page");
          setOpen(false);
          markOne(n.id);
          return;
        }
        /* v2.13.0: رابط صفحة عامة (?view=community مثلًا) — إشعار المنشور
           الجديد من أخصائي يتابعه المستخدم يفتح المجتمع مباشرة */
        const viewParam = url.searchParams.get("view");
        if (viewParam) {
          useApp.getState().setView(viewParam as never);
          setOpen(false);
          markOne(n.id);
          return;
        }
        /* v1.5.0: رابط محادثة الإدارة يفتح الصفحة مباشرة للمختص */
        const adminChat = url.searchParams.get("admin-chat");
        if (adminChat && useApp.getState().user?.role === "COUNSELOR") {
          useApp.getState().setView("admin-chat");
          setOpen(false);
          markOne(n.id);
          return;
        }
        if (sessionId) {
          useApp.getState().setActiveSession(sessionId);
          useApp.getState().setView("session-room");
          setOpen(false);
          markOne(n.id);
          return;
        }
        if (dmId) {
          const peer = await fetch(`/api/dm-peer?id=${encodeURIComponent(dmId)}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null);
          openDm(dmId, peer?.name || "—");
          setOpen(false);
          markOne(n.id);
          return;
        }
      } catch {
        /* رابط غير صالح — سلوك افتراضي */
      }
      markOne(n.id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user]
  );

  if (!user?.id) return null;

  const visible = expanded ? items : items.slice(0, PAGE);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8 sm:h-9 sm:w-9" aria-label={t.nav.notifications}>
          {unread > 0 ? (
            <BellRing className="h-5 w-5 text-primary" />
          ) : (
            <Bell className="h-5 w-5" />
          )}
          {unread > 0 && (
            <span className="absolute -top-0.5 -end-0.5 min-w-4.5 h-4.5 px-1 rounded-full bg-destructive text-white text-[10px] font-black flex items-center justify-center shadow">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-[min(22rem,calc(100vw-2rem))] p-0 overflow-hidden">
        {/* صف العنوان: زرا أيقونة فقط — النصوص الكاملة (خاصة بالفرنسية) لا تتسع
            في عرض القائمة فتتشوه؛ الأيقونات مع التلميحات تكفي ولا تتأثر باللغة */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-muted/40">
          <span className="font-black text-sm flex items-center gap-2 min-w-0">
            <Bell className="h-4 w-4 text-primary shrink-0" />
            <span className="truncate">{t.notif.title}</span>
            {unread > 0 && (
              <span className="rounded-full bg-destructive text-white text-[10px] font-black px-1.5 py-0.5 shrink-0">
                {unread}
              </span>
            )}
          </span>
          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-primary"
              onClick={markAll}
              disabled={unread === 0}
              aria-label={t.notif.markAll}
              title={t.notif.markAll}
            >
              <CheckCheck className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive"
              onClick={clearAll}
              disabled={items.length === 0}
              aria-label={t.notif.clearAll}
              title={t.notif.clearAll}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto scrollbar-thin">
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs font-semibold text-muted-foreground">
              {t.notif.empty}
            </p>
          ) : (
            visible.map((n) => {
              const txt = translate(n);
              return (
                <button
                  key={n.id}
                  onClick={() => openTarget(n)}
                  className={`w-full text-start px-4 py-3 border-b border-border/60 last:border-0 transition-colors hover:bg-muted/50 ${
                    n.read ? "" : "bg-primary/5"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {!n.read && <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0 animate-pulse" />}
                    <div className="min-w-0 flex-1">
                      <div className={`text-xs leading-snug break-words ${n.read ? "font-semibold text-muted-foreground" : "font-black text-foreground"}`}>
                        {txt.title}
                      </div>
                      <div className="text-[11px] text-muted-foreground leading-relaxed mt-0.5 break-words">{txt.body}</div>
                      <div className="text-[10px] text-muted-foreground/70 font-semibold mt-1">
                        {relativeTime(n.createdAt, t.time)}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {items.length > PAGE && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-full py-2.5 text-center text-[11px] font-black text-primary bg-muted/40 hover:bg-muted transition-colors flex items-center justify-center gap-1"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {expanded ? t.notif.showLess : t.notif.showMore}
          </button>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
