"use client";

/**
 * v2.9.0 — فضاء الأخصائيين: دردشة جماعية خاصة بالمختصين فقط.
 * ─────────────────────────────────────────────────────────────
 * خيط ثابت threadKey = "counselors" في نفس مجموعة messages،
 * الإرسال للأخصائيين حصراً (يتحقق الخادم)، والبث الفوري عبر جسر
 * socket.io عند توفره + استقصاء REST كشبكة أمان.
 * تُركَّب داخل لوحة الأخصائي (نافذة أو بطاقة موسّعة).
 *
 * v1.6.0 — طلب المستخدم الصريح: تطبيق مبدأ الرسائل الصوتية نفسه هنا
 *  • زر ميكروفون: تسجيل بحد 60 ثانية مع عدّاد حي وإرسال/إلغاء
 *  • فقاعة مشغّل مخصّصة (زر تشغيل + شريط تقدّم + المدة الحقيقية المخزّنة)
 *    بدل عرض الـ data URL نصاً طويلاً كان يشوّه التجاوب في الهاتف
 *  • ضغطة مستمرة 3 ثوانٍ على رسالتي → قائمة تعديل/حذف (النصية) أو حذف (الصوتية)
 *  • الاستقصاء بـ full=1 مع دمج بالمعرّف — التعديل/الحذف يظهران فوراً للجميع
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Send, UsersRound, Mic, Square, X, Check, Trash2, MessageCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { VoiceRecorder } from "@/lib/voice-recorder";
import { VoiceBubble } from "@/components/shared/voice-bubble";
import { useLongPress, MessageActionMenu } from "@/components/shared/message-actions";

interface GroupMessage {
  id: string;
  senderRole: string;
  senderName: string | null;
  senderId?: string | null;
  type?: "text" | "voice";
  content: string;
  seconds?: number;
  audioReady?: boolean;
  editedAt?: string | null;
  deleted?: boolean;
  createdAt: string;
}

export function CounselorsChat() {
  const { t, lang } = useI18n();
  const { user } = useApp();
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const lastAtRef = useRef<string | null>(null);
  /* ─── v1.6.0: التسجيل الصوتي + الضغطة الطويلة ─── */
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [menuFor, setMenuFor] = useState<{ id: string; x: number; y: number } | null>(null);
  const pressMsgRef = useRef<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const load = useCallback(async () => {
    try {
      /* v1.6.0: full=1 + دمج بالمعرّف — التعديل/الحذف يصلان لكل الأعضاء */
      const res = await fetch(`/api/messages?threadKey=counselors&full=1`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const incoming: GroupMessage[] = data.messages || [];
      if (incoming.length > 0) {
        lastAtRef.current = incoming[incoming.length - 1].createdAt;
        setMessages((cur) => {
          const byId = new Map(cur.map((m) => [m.id, m]));
          for (const m of incoming) byId.set(m.id, m);
          return [...byId.values()].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        });
      }
    } catch {
      /* الاستقصاء القادم يعيد المحاولة */
    }
  }, []);

  useEffect(() => {
    lastAtRef.current = null;
    setMessages([]);
    load();
    const i = setInterval(load, 4000);
    return () => clearInterval(i);
  }, [load]);

  /* تمرير تلقائي لآخر رسالة */
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    const content = text.trim();
    if (!content || busy || user?.role !== "COUNSELOR") return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadKey: "counselors",
          senderRole: "COUNSELOR",
          senderId: user.id,
          senderName: user.fullName || "",
          content,
        }),
      });
      const data = await res.json();
      if (data.ok && data.message) {
        const msg = data.message as GroupMessage;
        setMessages((cur) => (cur.some((m) => m.id === msg.id) ? cur : [...cur, msg]));
        lastAtRef.current = msg.createdAt;
        setText("");
      } else {
        setErr(t.common.error);
      }
    } catch {
      setErr(t.common.error);
    } finally {
      setBusy(false);
    }
  };

  /* ─── v1.6.0: إرسال رسالة صوتية في فضاء الأخصائيين ─── */
  const sendVoice = async (dataUrl: string, seconds: number) => {
    if (busy || user?.role !== "COUNSELOR") return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadKey: "counselors",
          senderRole: "COUNSELOR",
          senderId: user.id,
          senderName: user.fullName || "",
          content: dataUrl,
          type: "voice",
          seconds,
        }),
      });
      const data = await res.json();
      if (data.ok && data.message) {
        const msg = data.message as GroupMessage;
        setMessages((cur) => (cur.some((m) => m.id === msg.id) ? cur : [...cur, msg]));
        lastAtRef.current = msg.createdAt;
      } else {
        setErr(t.common.error);
      }
    } catch {
      setErr(t.common.error);
    } finally {
      setBusy(false);
    }
  };

  const startRecording = async () => {
    if (voiceBusy || recording) return;
    setVoiceBusy(true);
    setErr("");
    try {
      const rec = new VoiceRecorder();
      await rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setRecSeconds(0);
      tickRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    } catch {
      setErr(t.session.voiceDenied);
    } finally {
      setVoiceBusy(false);
    }
  };

  const stopRecording = async (sendIt: boolean) => {
    const rec = recorderRef.current;
    if (!rec) return;
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    setRecording(false);
    setVoiceBusy(true);
    try {
      if (sendIt) {
        const result = await rec.stop();
        if (result) await sendVoice(result.dataUrl, result.seconds);
      } else {
        rec.cancel();
      }
    } catch {
      setErr(t.common.error);
    } finally {
      recorderRef.current = null;
      setRecSeconds(0);
      setVoiceBusy(false);
    }
  };

  /* ─── v1.6.0: حفظ التعديل / حذف رسالة فردية (نفس واجهة الرسائل الموحّدة) ─── */
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
      if (r.ok && d.ok && d.message) {
        const msg = d.message as GroupMessage;
        setMessages((cur) => cur.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)));
      }
    } catch {
      /* الاستقصاء القادم يجلب الحالة */
    }
  };

  const deleteOne = async (id: string) => {
    if (!user?.id) return;
    try {
      const r = await fetch(`/api/messages/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      const d = await r.json();
      if (r.ok && d.ok && d.message) {
        const msg = d.message as GroupMessage;
        setMessages((cur) => cur.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)));
      }
    } catch {
      /* تجاهل */
    }
  };

  /* صاحب الرسالة فقط — النصية تُعدَّل وتُحذف، والصوتية تُحذف حصراً */
  const canActOf = (m: GroupMessage) =>
    !!user?.id && !!m.senderId && m.senderId === user.id && !m.deleted && !m.id.startsWith("tmp-");

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const longPress = useLongPress((x: number, y: number) => {
    const id = pressMsgRef.current;
    if (!id) return;
    const m = messagesRef.current.find((v) => v.id === id);
    if (m && canActOf(m)) setMenuFor({ id, x, y });
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
  const menuTarget = menuFor ? messages.find((m) => m.id === menuFor.id) : null;

  return (
    <div className="flex flex-col h-[55vh] min-h-72">
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-3 py-3 space-y-2 bg-background rounded-t-xl border border-border">
        {messages.length === 0 ? (
          <p className="text-center text-xs font-semibold text-muted-foreground py-10">{t.counselor.groupChatEmpty}</p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId ? m.senderId === user?.id : !!(m.senderName && user?.fullName && m.senderName === user.fullName);
            return (
              <div key={m.id} className={`group flex flex-col ${mine ? "items-end" : "items-start"}`}>
                <div
                  {...pressHandlers(m.id)}
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap [overflow-wrap:anywhere] select-none ${
                    /* v2.13.0: تدرّج أغمق لرسائل المرسِل — الأبيض على الأخضر الفاتح
                       السابق كان صعب القراءة على العين (طلب المستخدم) */
                    mine ? "gradient-primary-deep text-white rounded-ee-sm" : "bg-muted text-foreground rounded-es-sm"
                  }`}
                  dir="auto"
                >
                  {!mine && m.senderName && (
                    <div className="text-[10px] font-black text-primary mb-0.5" dir="auto">
                      {m.senderName}
                    </div>
                  )}
                  {m.deleted ? (
                    <span className="italic opacity-70 flex items-center gap-1.5">
                      <Trash2 className="h-3.5 w-3.5" />
                      {t.session.deletedMsg}
                    </span>
                  ) : m.type === "voice" ? (
                    /* v1.6.0: فقاعة مشغّل صوتي — بدل نص الـ data URL الطويل الذي
                       كان يشوّه التجاوب في الهاتف (طلب المستخدم الصريح) */
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
                  <div className={`text-[9px] font-bold mt-1 ${mine ? "text-white/70" : "text-muted-foreground"}`} dir="ltr">
                    {new Date(m.createdAt).toLocaleTimeString(lang === "ar" ? "ar-DZ" : lang === "fr" ? "fr-FR" : "en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                {editingId === m.id && (
                  <div className="w-full max-w-xs mt-1 space-y-1.5">
                    <Input
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void saveEdit();
                        }
                      }}
                      dir="auto"
                      maxLength={4000}
                      className="rounded-xl bg-card"
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
          })
        )}
      </div>
      {err && <p className="px-3 py-1 text-[11px] font-bold text-destructive">{err}</p>}

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
          onDelete={() => void deleteOne(menuFor.id)}
          labels={{ edit: t.session.editMsg, delete: t.session.deleteMsg }}
          onClose={() => setMenuFor(null)}
        />
      )}

      {recording ? (
        /* شريط التسجيل الجاري — عدّاد حي + إرسال/إلغاء */
        <div className="flex items-center gap-2 mx-3 mb-2 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive animate-pulse shrink-0" />
          <span className="text-xs font-black text-destructive font-mono" dir="ltr">
            {String(Math.floor(recSeconds / 60)).padStart(2, "0")}:{String(recSeconds % 60).padStart(2, "0")}
          </span>
          <span className="text-[11px] font-semibold text-muted-foreground flex-1 min-w-0 truncate">{t.session.recordingHint}</span>
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-muted-foreground" disabled={voiceBusy} onClick={() => void stopRecording(false)} aria-label={t.session.recCancel}>
            <X className="h-4 w-4" />
          </Button>
          <Button size="icon" className="h-8 w-8 shrink-0 gradient-primary text-white rounded-lg" disabled={voiceBusy} onClick={() => void stopRecording(true)} aria-label={t.dm.send}>
            <Square className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-3 border border-t-0 border-border rounded-b-xl bg-muted/30">
          <Button
            size="icon"
            variant="outline"
            className="rounded-xl shrink-0 h-10 w-10 text-primary border-primary/40"
            disabled={busy || voiceBusy}
            onClick={() => void startRecording()}
            aria-label={t.session.voiceHint}
            title={t.session.voiceHint}
          >
            <Mic className="h-4 w-4" />
          </Button>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={t.counselor.groupChatPlaceholder}
            className="rounded-xl bg-card"
            dir="auto"
            maxLength={2000}
          />
          <Button size="icon" className="gradient-primary text-white rounded-xl shrink-0 h-10 w-10" disabled={busy || !text.trim()} onClick={() => void send()} aria-label={t.dm.send}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      )}
      {/* v1.6.0: تلميح ثابت — الضغطة الطويلة تفتح قائمة تعديل/حذف رسالتي */}
      <p className="px-3 pt-1.5 pb-0.5 text-[10px] text-muted-foreground/70 font-semibold flex items-center gap-1">
        <MessageCircle className="h-3 w-3" />
        {t.counselor.groupChatHint}
      </p>
    </div>
  );
}

/** بطاقة فضاء الأخصائيين داخل اللوحة — مفتوحة/مطوية */
export function CounselorsChatCard() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <Card className="border-primary/25 bg-primary/[0.04]">
      <CardContent className="p-4 space-y-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="w-full flex items-center justify-between gap-2 text-start"
        >
          <span className="font-bold text-sm flex items-center gap-2">
            <UsersRound className="h-4 w-4 text-primary" />
            <span className="min-w-0">
              {t.counselor.groupChatTitle}
              <span className="block text-[11px] font-semibold text-muted-foreground">{t.counselor.groupChatDesc}</span>
            </span>
          </span>
          <span className="flex items-center gap-2 shrink-0">
            {!open && <span className="text-[11px] font-black text-primary">{t.counselor.groupChatOpen}</span>}
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`} />
          </span>
        </button>
        {open && <CounselorsChat />}
      </CardContent>
    </Card>
  );
}
