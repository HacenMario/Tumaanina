"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { SendHorizonal, Eraser, Mic, Square, Trash2, X, Check } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { playSound } from "@/lib/sounds";
import { VoiceRecorder } from "@/lib/voice-recorder";
import { VoiceBubble } from "@/components/shared/voice-bubble";
import { useLongPress, MessageActionMenu } from "@/components/shared/message-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import CRISIS_KEYWORDS from "../../../shared/crisis-keywords.json";

export interface ChatMessage {
  id: string;
  sessionId: string;
  senderRole: "VICTIM" | "COUNSELOR" | "SYSTEM";
  senderName?: string;
  senderId?: string | null;
  type?: "text" | "voice";
  content: string;
  seconds?: number;
  audioReady?: boolean;
  editedAt?: string | null;
  deleted?: boolean;
  createdAt: string;
}

interface ChatPanelProps {
  sessionId: string;
  myRole: "VICTIM" | "COUNSELOR";
  myName: string;
  active: boolean;
  /* saidBy: دور كاتب العبارة الخطرة — يُسجّل في سجل الأزمات (للأدمين) */
  onCrisis: (phrase: string, saidBy?: string | null) => void;
  onPartnerPresence: (present: boolean, name?: string) => void;
}

/* فاصل استقصاء REST عند غياب Socket.io (مثل Vercel serverless) */
const POLL_INTERVAL_MS = 4000;

/* كشف عبور الخط الأحمر محلياً (يستخدم في وضع الاستقصاء حيث لا يوجد بث فوري) */
function detectCrisisLocal(content: string): string | null {
  const lower = String(content).toLowerCase();
  for (const kw of CRISIS_KEYWORDS as string[]) {
    if (lower.includes(String(kw).toLowerCase())) return kw;
  }
  return null;
}

export function ChatPanel({ sessionId, myRole, myName, active, onCrisis, onPartnerPresence }: ChatPanelProps) {
  const { t, lang } = useI18n();
  const { user } = useApp();
  const socketRef = useRef<Socket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastAtRef = useRef<string>("");
  const sendingRef = useRef(false);
  const onCrisisRef = useRef(onCrisis);
  onCrisisRef.current = onCrisis;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [realtime, setRealtime] = useState(false);   /* Socket.io متصل */
  const [reachable, setReachable] = useState(false); /* REST API يستجيب */
  const [partnerTyping, setPartnerTyping] = useState(false);
  /* المسح محلي فقط: الرسائل تبقى محفوظة في الخادم للطرف الآخر */
  const clearKey = `tumaanina-chat-cleared-${sessionId}`;
  const [clearedAt, setClearedAt] = useState<string | null>(null);

  /* ─── v1.5.0: تعديل رسالة قائمة ─── */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  /* ─── v1.6.0: قائمة الضغطة الطويلة (3 ثوانٍ) → تعديل/حذف ─── */
  const [menuFor, setMenuFor] = useState<{ id: string; x: number; y: number } | null>(null);
  const pressMsgRef = useRef<string | null>(null);
  /* ─── v1.5.0: التسجيل الصوتي ─── */
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setClearedAt(localStorage.getItem(clearKey));
  }, [clearKey]);

  const clearLocal = () => {
    const now = new Date().toISOString();
    localStorage.setItem(clearKey, now);
    setClearedAt(now);
  };

  const visibleMessages = clearedAt
    ? messages.filter((m) => new Date(m.createdAt) > new Date(clearedAt))
    : messages;

  /* دمج الرسائل الواردة — v1.5.0: نفس المعرّف يعني تحديثاً (تعديل/حذف) فتُستبدل النسخة */
  const mergeIncoming = useCallback(
    (incoming: ChatMessage[]) => {
      if (!incoming.length) return;
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        let next = prev;
        let changed = false;
        for (const m of incoming) {
          const arr = [...next];
          const idx = arr.findIndex((x) => x.id === m.id);
          if (idx >= 0) {
            /* تحديث نسخة قائمة (تعديل نص/حذف/استبدال المؤقتة) */
            const old = arr[idx];
            /* v1.21.1: القائمة تعيد content فارغاً لرسائل voice — نحافظ على
               بيانات الصوت الجاهزة في الذاكرة (رسالتي المرسلة للتو) */
            const merged = old.type === "voice" && old.content && !m.content ? { ...m, content: old.content } : m;
            if (
              old.content !== merged.content ||
              old.deleted !== merged.deleted ||
              (old.editedAt || null) !== (merged.editedAt || null) ||
              old.id.startsWith("tmp-")
            ) {
              arr[idx] = merged;
              changed = true;
            }
          } else {
            /* رسالة جديدة — استبدال المؤقتة المماثلة إن وجدت */
            const tmpIdx = arr.findIndex(
              (x) => x.id.startsWith("tmp-") && x.senderRole === m.senderRole && x.content === m.content
            );
            if (tmpIdx >= 0) arr[tmpIdx] = m;
            else arr.push(m);
            known.add(m.id);
            changed = true;
            if (m.senderRole !== myRole) {
              playSound("message");
              /* في وضع الاستقصاء لا يوجد حدث crisis_alert — نكتشف العبارة محلياً
                 ونعرف كاتبها: صاحب الرسالة الواردة (الطرف الآخر) */
              const phrase = detectCrisisLocal(m.content);
              if (phrase) setTimeout(() => onCrisisRef.current(phrase, m.senderRole), 0);
            }
          }
          next = arr;
        }
        if (!changed) return prev;
        next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return next;
      });
      const lastIncoming = incoming[incoming.length - 1];
      if (!lastAtRef.current || new Date(lastIncoming.createdAt) > new Date(lastAtRef.current)) {
        lastAtRef.current = lastIncoming.createdAt;
      }
    },
    [myRole]
  );

  /* ─── سجل المحادثة عبر REST (يعمل على كل المنصات) ─── */
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/messages?sessionId=${sessionId}&full=1`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (cancelled) return;
        const msgs: ChatMessage[] = d.messages || [];
        setMessages(msgs);
        if (msgs.length) lastAtRef.current = msgs[msgs.length - 1].createdAt;
        setReachable(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  /* ─── وضع الاستقصاء: شبكة أمان عندما لا يتوفر Socket.io ───
     v1.5.0: full=1 — السجل الكامل كل دورة، فتصل التعديلات والحذف
     كما تصل الرسائل الجديدة حتى بلا بث فوري */
  useEffect(() => {
    if (realtime) return; /* البث الفوري يعمل — لا حاجة للاستقصاء */
    let busy = false;
    const poll = async () => {
      if (busy) return;
      busy = true;
      try {
        const r = await fetch(`/api/messages?sessionId=${sessionId}&full=1`, { cache: "no-store" });
        if (r.ok) {
          const d = await r.json();
          mergeIncoming(d.messages || []);
          setReachable(true);
        }
      } catch {
        /* الشبكة متقطعة — نعيد المحاولة في الدورة التالية */
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    poll();
    return () => clearInterval(timer);
  }, [sessionId, realtime, mergeIncoming]);

  /* ─── Socket.io: بث فوري "أفضل جهد" ───
     يعمل مباشرة على Railway (الخادم الموحّد server.js)، وعلى أي منصة
     يُوجَّه إليها العميل عبر NEXT_PUBLIC_SOCKET_URL. عند تعذر الاتصال
     (مثل Vercel) تتولى دورة الاستقصاء أعلاه استلام الرسائل تلقائياً. */
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL || undefined;
    const s = io(url, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 4, /* محدودة كي لا تُغرق الكونسول بأخطاء على Vercel */
      reconnectionDelay: 1500,
      timeout: 10000,
    });
    socketRef.current = s;

    s.on("connect", () => {
      setRealtime(true);
      s.emit("join_session", { sessionId, role: myRole, name: myName });
    });

    s.on("disconnect", () => setRealtime(false));
    s.on("reconnect_failed", () => setRealtime(false));
    s.io.on("reconnect_failed", () => setRealtime(false));

    s.on("text_message", (msg: ChatMessage) => {
      mergeIncoming([msg]);
    });

    s.on("typing", (data: { role: string; typing: boolean }) => {
      if (data.role !== myRole) setPartnerTyping(data.typing);
    });

    s.on("crisis_alert", (data: { phrase: string }) => {
      onCrisisRef.current(data.phrase);
    });

    s.on("presence", (data: { members: { role: string; name: string }[]; joined?: { role: string }; left?: { role: string } }) => {
      const partner = data.members?.filter((m) => m.role !== myRole) || [];
      onPartnerPresence(partner.length > 0, partner[0]?.name);
    });

    return () => {
      s.disconnect();
      socketRef.current = null;
      setRealtime(false);
      setPartnerTyping(false);
    };
  }, [sessionId, myRole, myName, mergeIncoming]);

  // Auto scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, partnerTyping]);

  /* ─── الإرسال عبر REST دائماً — مضمون على Railway وVercel معاً ───
     على الخادم الموحّد (Railway) تنشر واجهة REST الرسالة فوراً لغرفة
     Socket.io عبر جسر نفس العملية، فيصلها الطرف الآخر لحظياً. */
  const send = async () => {
    const content = input.trim();
    if (!content || sendingRef.current) return;
    sendingRef.current = true;
    setInput("");
    socketRef.current?.emit("typing", { sessionId, role: myRole, typing: false });

    /* عرض فوري تفاؤلي ثم استبداله بالنسخة المحفوظة من الخادم */
    const temp: ChatMessage = {
      id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      senderRole: myRole,
      senderName: myName,
      senderId: user?.id || null,
      type: "text",
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, temp]);

    try {
      const r = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, senderRole: myRole, senderId: user?.id, senderName: myName, content }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok || !d.message) throw new Error(d.error || "send failed");
      mergeIncoming([d.message]);
      if (d.crisis) onCrisisRef.current(d.crisis, myRole);
    } catch {
      /* فشل الإرسال: أزل المؤقتة وأعد النص للحفظ */
      setMessages((prev) => prev.filter((m) => m.id !== temp.id));
      setInput(content);
    } finally {
      sendingRef.current = false;
    }
  };

  /* ─── v1.5.0: إرسال رسالة صوتية ─── */
  const sendVoice = async (dataUrl: string, seconds: number) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    const temp: ChatMessage = {
      id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      senderRole: myRole,
      senderName: myName,
      senderId: user?.id || null,
      type: "voice",
      content: dataUrl,
      seconds,
      audioReady: true,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, temp]);
    try {
      const r = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, senderRole: myRole, senderId: user?.id, senderName: myName, content: dataUrl, type: "voice", seconds }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok || !d.message) throw new Error(d.error || "send failed");
      mergeIncoming([d.message]);
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== temp.id));
    } finally {
      sendingRef.current = false;
    }
  };

  const startRecording = async () => {
    if (voiceBusy || recording) return;
    setVoiceBusy(true);
    try {
      const rec = new VoiceRecorder();
      await rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setRecSeconds(0);
      tickRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    } catch {
      /* رفض الميكروفون أو عدم الدعم — رسالة مختصرة */
      alert(t.session.voiceDenied);
    } finally {
      setVoiceBusy(false);
    }
  };

  const stopRecording = async (send: boolean) => {
    const rec = recorderRef.current;
    if (!rec) return;
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    setRecording(false);
    setVoiceBusy(true);
    try {
      if (send) {
        const result = await rec.stop();
        if (result) await sendVoice(result.dataUrl, result.seconds);
      } else {
        rec.cancel();
      }
    } catch {
      /* تجاهل — تسجيل فاشل لا يعطل الدردشة */
    } finally {
      recorderRef.current = null;
      setRecSeconds(0);
      setVoiceBusy(false);
    }
  };

  /* ─── v1.5.0: تعديل/حذف رسالتي ─── */
  const saveEdit = async () => {
    const id = editingId;
    const content = editText.trim();
    if (!id || !content || !user?.id) return;
    setEditingId(null);
    try {
      const r = await fetch(`/api/messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, content }),
      });
      const d = await r.json();
      if (r.ok && d.ok && d.message) mergeIncoming([d.message]);
    } catch {
      /* الشبكة — الاستقصاء القادم يجلب الحالة */
    }
  };

  const deleteMsg = async (id: string) => {
    if (!user?.id) return;
    try {
      const r = await fetch(`/api/messages/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      const d = await r.json();
      if (r.ok && d.ok && d.message) mergeIncoming([d.message]);
    } catch {
      /* تجاهل */
    }
  };

  const onInput = (value: string) => {
    setInput(value);
    socketRef.current?.emit("typing", { sessionId, role: myRole, typing: value.length > 0 });
  };

  /* صاحب الرسالة فقط — النصية تُعدَّل وتُحذف، والصوتية تُحذف حصراً (v1.6.0) */
  const canAct = (m: ChatMessage) => !!user?.id && !!m.senderId && m.senderId === user.id && !m.deleted && !m.id.startsWith("tmp-");

  /* v1.6.0: ضغطة مستمرة 3 ثوانٍ على أي فقاعة رسالة → قائمة تعديل/حذف */
  const visibleMessagesRef = useRef(visibleMessages);
  visibleMessagesRef.current = visibleMessages;
  const longPress = useLongPress((x: number, y: number) => {
    const id = pressMsgRef.current;
    if (!id) return;
    const m = visibleMessagesRef.current.find((v) => v.id === id);
    if (m && canAct(m)) setMenuFor({ id, x, y });
  });
  const pressHandlers = (id: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      pressMsgRef.current = id;
      longPress.handlers.onPointerDown(e);
    },
    onPointerMove: longPress.handlers.onPointerMove,
    onPointerUp: longPress.handlers.onPointerUp,
    onPointerLeave: longPress.handlers.onPointerLeave,
    onPointerCancel: longPress.handlers.onPointerCancel,
  });
  const menuTarget = menuFor ? visibleMessages.find((m) => m.id === menuFor.id) : null;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-4 py-4 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-block text-[11px] text-muted-foreground bg-muted rounded-full px-3 py-1 font-semibold">
            {t.session.chatEmpty}
          </span>
          {messages.length > 0 && (
            <button
              onClick={clearLocal}
              title={t.session.chatClear}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground hover:text-destructive transition-colors shrink-0"
            >
              <Eraser className="h-3.5 w-3.5" />
              {t.session.chatClear}
            </button>
          )}
        </div>
        {visibleMessages.map((m) => {
          if (m.senderRole === "SYSTEM") {
            return (
              <div key={m.id} className="text-center">
                <span className="text-[11px] text-muted-foreground bg-muted rounded-full px-3 py-1 font-semibold">
                  {m.content}
                </span>
              </div>
            );
          }
          const mine = m.senderRole === myRole;
          return (
            <div key={m.id} className={`group flex flex-col ${mine ? "items-end" : "items-start"}`}>
              <div
                {...pressHandlers(m.id)}
                className={`max-w-[85%] sm:max-w-[72%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm break-words whitespace-pre-wrap [overflow-wrap:anywhere] select-none ${
                  mine
                    ? "gradient-primary-deep text-white rounded-ee-sm"
                    : "bg-card border border-border rounded-es-sm"
                } ${m.id.startsWith("tmp-") ? "opacity-70" : ""}`}
                dir="auto"
              >
                {m.deleted ? (
                  <span className="italic opacity-70 flex items-center gap-1.5">
                    <Trash2 className="h-3.5 w-3.5" />
                    {t.session.deletedMsg}
                  </span>
                ) : m.type === "voice" ? (
                  /* v1.6.0: مشغّل مخصّص — المدة من seconds المخزّنة والتشغيل عند الطلب
                     (كان المشغّل الأصلي يظهر 0:00 ولا يستجيب على الهاتف) */
                  <VoiceBubble
                    id={m.id}
                    seconds={m.seconds || 0}
                    mine={mine}
                    userId={user?.id || null}
                    dataUrl={m.content || null}
                  />
                ) : (
                  m.content
                )}
                {!m.deleted && m.editedAt && (
                  <span className={`block text-[9px] font-bold mt-0.5 ${mine ? "text-white/70" : "text-muted-foreground"}`}>
                    ✎ {t.session.editedLabel}
                  </span>
                )}
              </div>
              {/* v1.6.0: التعديل/الحذف عبر ضغطة مستمرة 3 ثوانٍ على الفقاعة */}
              {editingId === m.id && (
                <div className="w-full max-w-sm mt-1 space-y-1.5">
                  <Textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void saveEdit();
                      }
                    }}
                    rows={2}
                    dir="auto"
                    className="rounded-xl bg-card min-h-0 py-2 text-sm"
                    autoFocus
                  />
                  <div className="flex items-center gap-1.5 justify-end">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)} aria-label={t.common.cancel}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" className="h-7 w-7 gradient-primary text-white rounded-lg" onClick={() => void saveEdit()} aria-label={t.common.save}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {/* v1.6.0: قائمة الضغطة الطويلة — تعديل (نصية) / حذف (نصية وصوتية) */}
        {menuFor && menuTarget && (
          <MessageActionMenu
            x={menuFor.x}
            y={menuFor.y}
            canEdit={menuTarget.type !== "voice"}
            onEdit={() => {
              setEditingId(menuFor.id);
              setEditText(menuTarget.content);
            }}
            onDelete={() => void deleteMsg(menuFor.id)}
            labels={{ edit: t.session.editMsg, delete: t.session.deleteMsg }}
            onClose={() => setMenuFor(null)}
          />
        )}
        {partnerTyping && (
          <div className="flex justify-start">
            <div className="bg-card border border-border rounded-2xl rounded-es-sm px-4 py-2.5 flex gap-1 items-center">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
              <span className="text-[11px] text-muted-foreground font-semibold ms-1">{t.session.chatTyping}</span>
            </div>
          </div>
        )}
      </div>

      {/* Input — منطقة كتابة مريحة متعددة الأسطر:
          Enter يرسل، Shift+Enter سطر جديد، وتنمو تلقائياً حتى 5 أسطر */}
      <div className="border-t border-border p-3">
        {recording ? (
          /* شريط التسجيل الجاري — إيقاف للإرسال أو إلغاء */
          <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-destructive animate-pulse shrink-0" />
            <span className="text-xs font-black text-destructive font-mono" dir="ltr">
              {String(Math.floor(recSeconds / 60)).padStart(2, "0")}:{String(recSeconds % 60).padStart(2, "0")}
            </span>
            <span className="text-[11px] font-semibold text-muted-foreground flex-1 min-w-0 truncate">{t.session.recordingHint}</span>
            <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0 text-muted-foreground" disabled={voiceBusy} onClick={() => void stopRecording(false)} aria-label={t.session.recCancel}>
              <X className="h-4 w-4" />
            </Button>
            <Button size="icon" className="h-9 w-9 shrink-0 gradient-primary text-white rounded-xl" disabled={voiceBusy} onClick={() => void stopRecording(true)} aria-label={t.common.send}>
              <Square className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex gap-2 items-end">
            <Button
              size="icon"
              variant="outline"
              className="rounded-xl shrink-0 h-11 w-11 text-primary border-primary/40"
              disabled={!active || voiceBusy}
              onClick={() => void startRecording()}
              aria-label={t.session.voiceHint}
              title={t.session.voiceHint}
            >
              <Mic className="h-4.5 w-4.5" />
            </Button>
            <Textarea
              value={input}
              onChange={(e) => onInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={t.session.chatPlaceholder}
              disabled={!active}
              rows={1}
              className="rounded-xl bg-card min-h-11 max-h-32 resize-none py-2.5 leading-relaxed"
              dir="auto"
              aria-label={t.session.chatPlaceholder}
            />
            <Button
              size="icon"
              className="gradient-primary text-white rounded-xl shrink-0 h-11 w-11"
              onClick={send}
              disabled={!active || !input.trim()}
              aria-label={t.common.send}
            >
              <SendHorizonal className={`h-4 w-4 ${lang === "ar" ? "-scale-x-100" : ""}`} />
            </Button>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground/70 font-semibold mt-1.5 px-1">
          {t.session.chatSendHint}
        </p>
      </div>

      {/* connection indicator */}
      <div className="px-3 pb-2">
        {!reachable ? (
          <span className="text-[10px] text-amber-600 font-semibold">{t.session.connecting}</span>
        ) : !realtime ? (
          <span className="text-[10px] text-sky-600 dark:text-sky-400 font-semibold">{t.session.syncMode}</span>
        ) : null}
      </div>
    </div>
  );
}
