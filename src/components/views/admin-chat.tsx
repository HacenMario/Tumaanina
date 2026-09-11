"use client";

/**
 * v2.10.0 — صفحة «التواصل مع الإدارة» — للمختصين حصراً.
 * ─────────────────────────────────────────────────────────────
 * نفس منطق الدردشة بين المختص والعميل (خيوط رسائل + بث فوري عبر
 * socket.io + استقصاء كل 4 ثوانٍ + إشعارات للطرف الغائب) لكن الخيط
 * هنا ثابت لكل مختص: admin:{counselorId} — تردّ عليه الإدارة من
 * تبويب «رسائل المختصين» في لوحتها، ويصل المختص إشعار برابط يفتح
 * هذه الصفحة مباشرة.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Send, MessageCircle, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BackButton } from "@/components/shared/back-button";

interface AdminMsg {
  id: string;
  threadKey: string | null;
  senderRole: string;
  senderName: string | null;
  content: string;
  createdAt: string;
}

export function AdminChatView() {
  const { t, lang } = useI18n();
  const { user, setView } = useApp();
  const [messages, setMessages] = useState<AdminMsg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const lastAtRef = useRef<string | null>(null);

  /* حارس الدور: هذه الصفحة للمختصين حصراً */
  useEffect(() => {
    if (!user) {
      setView("landing");
      return;
    }
    if (user.role !== "COUNSELOR") setView("landing");
  }, [user, setView]);

  const threadKey = user && user.role === "COUNSELOR" ? `admin:${user.id}` : null;
  const myRole = "COUNSELOR";

  const load = useCallback(async () => {
    if (!threadKey) return;
    try {
      const qs = lastAtRef.current ? `&since=${encodeURIComponent(lastAtRef.current)}` : "";
      const res = await fetch(`/api/messages?threadKey=${encodeURIComponent(threadKey)}${qs}`);
      if (!res.ok) return;
      const data = await res.json();
      const incoming: AdminMsg[] = data.messages || [];
      if (incoming.length > 0) {
        lastAtRef.current = incoming[incoming.length - 1].createdAt;
        setMessages((cur) => {
          const seen = new Set(cur.map((m) => m.id));
          return [...cur, ...incoming.filter((m) => !seen.has(m.id))];
        });
      }
    } catch {
      /* أخطاء الشبكة المؤقتة — الاستقصاء القادم يعيد المحاولة */
    }
  }, [threadKey]);

  useEffect(() => {
    if (!threadKey) return;
    lastAtRef.current = null;
    setMessages([]);
    load();
    const i = setInterval(load, 4000);
    return () => clearInterval(i);
  }, [threadKey, load]);

  /* بث socket.io الحي — رسائل خيط الإدارة تصل فوراً */
  useEffect(() => {
    if (!threadKey) return;
    let socket: { off: (e: string, cb: (p: unknown) => void) => void; disconnect?: () => void } | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { io } = await import("socket.io-client");
        if (cancelled) return;
        const s = io({ path: "/socket.io", transports: ["websocket", "polling"] });
        socket = s as unknown as typeof socket;
        s.on("dm_message", (p: unknown) => {
          const msg = p as AdminMsg;
          if (!msg?.id || msg.threadKey !== threadKey) return;
          setMessages((cur) => (cur.some((m) => m.id === msg.id) ? cur : [...cur, msg]));
          lastAtRef.current = msg.createdAt;
        });
      } catch {
        /* الاستقصاء يغطي الحالة */
      }
    })();
    return () => {
      cancelled = true;
      if (socket) {
        socket.off("dm_message", () => {});
        socket.disconnect?.();
      }
    };
  }, [threadKey]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    const content = text.trim();
    if (!content || !threadKey || busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadKey,
          senderRole: myRole,
          senderId: user?.id,
          senderName: user?.fullName || "",
          content,
        }),
      });
      const data = await res.json();
      if (data.ok && data.message) {
        const msg = data.message as AdminMsg;
        setMessages((cur) => (cur.some((m) => m.id === msg.id) ? cur : [...cur, msg]));
        lastAtRef.current = msg.createdAt;
        setText("");
      } else if (data.error === "NOT_ALLOWED") {
        setErr(t.dm.notAllowed);
      } else {
        setErr(t.common.error);
      }
    } catch {
      setErr(t.common.error);
    } finally {
      setBusy(false);
    }
  };

  /* لم يستقر المستخدم بعد (حارس الدور يعمل) */
  if (!user || user.role !== "COUNSELOR") return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:py-10 w-full">
      <BackButton />
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        {/* الرأس */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5.5 w-5.5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-black leading-tight">{t.adminChat.title}</h1>
            <p className="text-[11px] md:text-xs text-muted-foreground leading-snug">{t.adminChat.subtitle}</p>
          </div>
        </div>

        {/* بطاقة المحادثة */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/40 flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary shrink-0" />
            <span className="text-xs font-black truncate">{t.adminChat.threadTitle}</span>
          </div>

          <div ref={listRef} className="h-[52vh] min-h-64 overflow-y-auto scrollbar-thin px-4 py-3 space-y-2 bg-background">
            {messages.length === 0 ? (
              <p className="text-center text-xs font-semibold text-muted-foreground py-10 leading-relaxed px-6">
                {t.adminChat.empty}
              </p>
            ) : (
              messages.map((m) => {
                const mine = m.senderRole === myRole;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                        mine ? "gradient-primary text-white rounded-ee-sm" : "bg-muted text-foreground rounded-es-sm"
                      }`}
                      dir="auto"
                    >
                      {!mine && (
                        <div className="text-[10px] font-black text-primary mb-0.5">{m.senderName || t.adminChat.adminName}</div>
                      )}
                      {m.content}
                      <div className={`text-[9px] font-bold mt-1 ${mine ? "text-white/70" : "text-muted-foreground"}`} dir="ltr">
                        {new Date(m.createdAt).toLocaleTimeString(lang === "ar" ? "ar-DZ" : lang === "fr" ? "fr-FR" : "en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {err && <p className="px-4 pb-2 text-[11px] font-bold text-destructive">{err}</p>}

          <div className="flex items-center gap-2 px-3 py-3 border-t border-border bg-muted/30">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={t.adminChat.placeholder}
              className="rounded-xl bg-card"
              dir="auto"
              maxLength={4000}
            />
            <Button
              size="icon"
              className="gradient-primary text-white rounded-xl shrink-0 h-10 w-10"
              disabled={busy || !text.trim()}
              onClick={() => void send()}
              aria-label={t.dm.send}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <p className="text-[11px] font-semibold text-muted-foreground text-center leading-relaxed">{t.adminChat.note}</p>

        <button
          onClick={() => setView("counselor-dashboard")}
          className="w-full py-1.5 text-center text-[11px] font-bold text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-1"
        >
          <X className="h-3 w-3" />
          {t.common.close}
        </button>
      </motion.div>
    </div>
  );
}
