"use client";

/**
 * v2.8.0 — محادثة ما قبل الجلسة (DM) بين العميل والأخصائي.
 * ─────────────────────────────────────────────────────────────
 * زر «تواصل» يتيح للعميل مراسلة الأخصائي حتى قبل طلب جلسة،
 * وللأخصائي مراسلة العميل قبل قبول طلبه.
 *
 * تُفتح النافذة عبر حدث عام من أي صفحة:
 *   window.dispatchEvent(new CustomEvent("open-dm", {
 *     detail: { peerId, peerName }   // معرّف الطرف الآخر واسمه
 *   }))
 *
 * الخيط مشترك ثابت: dm:{victimId}:{counselorId} — الرسائل تُخزَّن في
 * مجموعة messages بلا sessionId، ويصل إشعار للطرف الغائب فقط
 * (آخر نبض عام له أقدم من نافذة الحضور) مع اقتباس من الرسالة.
 * تُركَّب مرة واحدة في page.tsx فتعمل من كل صفحات المنصة.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Send, MessageCircle, X, Trash2, Mic, Square, Check } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VoiceRecorder } from "@/lib/voice-recorder";
import { VoiceBubble } from "@/components/shared/voice-bubble";
import { useLongPress, MessageActionMenu } from "@/components/shared/message-actions";
import { formatDateTime } from "@/lib/utils";

interface DmMessage {
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

export function DmDialog() {
  const { t, lang } = useI18n();
  const { user } = useApp();
  const [open, setOpen] = useState(false);
  const [peer, setPeer] = useState<{ id: string; name: string } | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  /* v2.14.0: مسح المحادثة — متاح للطرفين (طلب المستخدم) */
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const lastAtRef = useRef<string | null>(null);
  /* ─── v1.5.0: تعديل/حذف رسالة فردية + الرسائل الصوتية ─── */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  /* ─── v1.6.0: قائمة الضغطة الطويلة (3 ثوانٍ) → تعديل/حذف ─── */
  const [menuFor, setMenuFor] = useState<{ id: string; x: number; y: number } | null>(null);
  const pressMsgRef = useRef<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* threadKey ثابت: العميل دائماً أول معرّف */
  const threadKey =
    user && peer
      ? user.role === "VICTIM"
        ? `dm:${user.id}:${peer.id}`
        : `dm:${peer.id}:${user.id}`
      : null;

  const myRole = user?.role === "COUNSELOR" ? "COUNSELOR" : "VICTIM";
  const myName = user?.role === "COUNSELOR" ? user.fullName || "" : user?.pseudonym || "";

  const load = useCallback(async () => {
    if (!threadKey) return;
    try {
      /* v1.5.0: full=1 — السجل الكامل كل دورة لالتقاط التعديلات والحذف أيضاً */
      const res = await fetch(`/api/messages?threadKey=${encodeURIComponent(threadKey)}&full=1`);
      if (!res.ok) return;
      const data = await res.json();
      const incoming: DmMessage[] = data.messages || [];
      if (incoming.length > 0) {
        lastAtRef.current = incoming[incoming.length - 1].createdAt;
        setMessages((cur) => {
          /* نفس المعرّف → تحديث نسخة قائمة (تعديل/حذف)، غير الموجود → إضافة */
          const byId = new Map(cur.map((m) => [m.id, m]));
          for (const m of incoming) {
            /* v1.21.1: القائمة تعيد content فارغاً لرسائل voice — نحافظ على
               بيانات الصوت الجاهزة في الذاكرة (رسالتي المرسلة للتو) */
            const old = byId.get(m.id);
            if (old && old.type === "voice" && old.content && !m.content) byId.set(m.id, { ...m, content: old.content });
            else byId.set(m.id, m);
          }
          return [...byId.values()].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        });
      }
    } catch {
      /* أخطاء الشبكة المؤقتة — الاستقصاء القادم يعيد المحاولة */
    }
  }, [threadKey]);

  /* فتح عبر الحدث العام + إعادة ضبط الخيط */
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail as { id: string; name: string };
      if (!d?.id) return;
      setPeer({ id: d.id, name: d.name || "—" });
      setMessages([]);
      lastAtRef.current = null;
      setErr("");
      setOpen(true);
    };
    window.addEventListener("open-dm", handler);
    return () => window.removeEventListener("open-dm", handler);
  }, []);

  /* استقصاء كل 4 ثوانٍ + بث فوري عبر جسر socket.io عندما يكون نشطاً */
  useEffect(() => {
    if (!open || !threadKey) return;
    load();
    const i = setInterval(load, 4000);
    const bridge = (globalThis as { __tumaaninaDmSub?: boolean }).__tumaaninaDmSub;
    void bridge;
    return () => clearInterval(i);
  }, [open, threadKey, load]);

  /* بث socket.io الحي: رسائل dm_message تصل فوراً (الخادم الموحّد فقط) */
  useEffect(() => {
    if (!open || !threadKey) return;
    let socket: { on: (e: string, cb: (p: unknown) => void) => void; off: (e: string, cb: (p: unknown) => void) => void } | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { io } = await import("socket.io-client");
        if (cancelled) return;
        const s = io({ path: "/socket.io", transports: ["websocket", "polling"] });
        socket = s as unknown as typeof socket;
        s.on("dm_message", (p: unknown) => {
          const msg = p as DmMessage;
          if (!msg?.id) return;
          setMessages((cur) => (cur.some((m) => m.id === msg.id) ? cur : [...cur, msg]));
          lastAtRef.current = msg.createdAt;
        });
      } catch {
        /* الاستقصاء يغطي الحالة — البث ميزة إضافية */
      }
    })();
    return () => {
      cancelled = true;
      if (socket) {
        socket.off("dm_message", () => {});
        (socket as unknown as { disconnect?: () => void }).disconnect?.();
      }
    };
  }, [open, threadKey]);

  /* تمرير تلقائي لآخر رسالة */
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  /* ─── v2.14.0: مسح المحادثة كاملة — متاح لكل طرف من الطرفين ─── */
  const clearThread = async () => {
    if (!threadKey || !user || clearing) return;
    setClearing(true);
    try {
      const res = await fetch("/api/messages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadKey, userId: user.id }),
      });
      if (res.ok) {
        setMessages([]);
        lastAtRef.current = null;
      } else {
        setErr(t.common.error);
      }
    } catch {
      setErr(t.common.error);
    } finally {
      setClearing(false);
      setConfirmClear(false);
    }
  };

  const send = async () => {
    const content = text.trim();
    if (!content || !threadKey || busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadKey, senderRole: myRole, senderId: user?.id, senderName: myName, content }),
      });
      const data = await res.json();
      if (data.ok && data.message) {
        const msg = data.message as DmMessage;
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

  /* ─── v1.5.0: إرسال رسالة صوتية في المحادثة ─── */
  const sendVoice = async (dataUrl: string, seconds: number) => {
    if (!threadKey || busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadKey, senderRole: myRole, senderId: user?.id, senderName: myName, content: dataUrl, type: "voice", seconds }),
      });
      const data = await res.json();
      if (data.ok && data.message) {
        const msg = data.message as DmMessage;
        setMessages((cur) => (cur.some((m) => m.id === msg.id) ? cur : [...cur, msg]));
        lastAtRef.current = msg.createdAt;
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

  /* ─── v1.5.0: حفظ التعديل / حذف رسالة فردية ─── */
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
        const msg = d.message as DmMessage;
        setMessages((cur) => cur.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)));
      }
    } catch {
      /* تجاهل */
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
        const msg = d.message as DmMessage;
        setMessages((cur) => cur.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)));
      }
    } catch {
      /* تجاهل */
    }
  };

  /* ─── v1.6.0: ضغطة مستمرة 3 ثوانٍ → قائمة تعديل/حذف (نصية وصوتية) ─── */
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const canActOf = (m: DmMessage) => !!user?.id && !!m.senderId && m.senderId === user.id && !m.deleted && !m.id.startsWith("tmp-");
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
    <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden gap-0">
        {/* v2.11.0: رأس متجاوب — الاسم المستعار الطويل يُقطَّع بعلامة … ولا
            يتداخل مع زر الإغلاق الدائري (مساحة pe-7 محفوظة له)، والعنوان
            ثابت لا ينضغط مهما طال الاسم */}
        <DialogHeader className="px-5 py-4 border-b border-border bg-muted/40">
          <DialogTitle className="text-start flex items-center gap-2 text-base pe-7">
            <MessageCircle className="h-4.5 w-4.5 text-primary shrink-0" />
            <span className="truncate shrink-0">{t.dm.title}</span>
            <span className="text-primary flex-1 min-w-0 truncate text-end">{peer?.name}</span>
            {/* v2.14.0: مسح المحادثة — أي طرف يستطيع مسح كل الرسائل */}
            {messages.length > 0 && (
              <button
                onClick={() => setConfirmClear(true)}
                className="shrink-0 rounded-lg p-1.5 text-destructive hover:bg-destructive/10 transition-colors"
                aria-label={t.dm.clearBtn}
                title={t.dm.clearBtn}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </DialogTitle>
        </DialogHeader>

        <div ref={listRef} className="h-[48vh] min-h-52 sm:h-[45vh] overflow-y-auto scrollbar-thin px-4 py-3 space-y-2 bg-background">
          {messages.length === 0 ? (
            <p className="text-center text-xs font-semibold text-muted-foreground py-10">{t.dm.empty}</p>
          ) : (
            messages.map((m) => {
              const mine = m.senderRole === myRole;
              const canAct = canActOf(m);
              return (
                <div key={m.id} className={`group flex flex-col ${mine ? "items-end" : "items-start"}`}>
                  <div
                    {...pressHandlers(m.id)}
                    className={`max-w-[85%] sm:max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] select-none ${
                      mine ? "gradient-primary-deep text-white rounded-ee-sm" : "bg-muted text-foreground rounded-es-sm"
                    }`}
                    dir="auto"
                  >
                    {m.deleted ? (
                      <span className="italic opacity-70 flex items-center gap-1.5">
                        <Trash2 className="h-3.5 w-3.5" />
                        {t.session.deletedMsg}
                      </span>
                    ) : m.type === "voice" ? (
                      /* v1.6.0: مشغّل مخصّص — المدة حقيقية والتشغيل موثوق على الهاتف */
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
                      {formatDateTime(m.createdAt)}
                    </div>
                  </div>
                  {/* v1.6.0: التعديل/الحذف عبر ضغطة مستمرة 3 ثوانٍ على الفقاعة */}
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

        {err && <p className="px-5 pb-2 text-[11px] font-bold text-destructive">{err}</p>}

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
          /* شريط التسجيل الجاري — v1.5.0 */
          <div className="flex items-center gap-2 mx-4 mb-3 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2">
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
          <div className="flex items-center gap-2 px-4 py-3 border-t border-border bg-muted/30">
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
              placeholder={t.dm.placeholder}
              className="rounded-xl bg-card"
              dir="auto"
              maxLength={4000}
            />
            <Button size="icon" className="gradient-primary text-white rounded-xl shrink-0 h-10 w-10" disabled={busy || !text.trim()} onClick={() => void send()} aria-label={t.dm.send}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        )}

        <button
          onClick={() => setOpen(false)}
          className="w-full py-2 text-center text-[11px] font-bold text-muted-foreground hover:text-primary transition-colors border-t border-border flex items-center justify-center gap-1"
        >
          <X className="h-3 w-3" />
          {t.common.close}
        </button>

        {/* v2.14.0: تأكيد مسح المحادثة — العملية تحذف الرسائل للطرفين معاً */}
        <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-start">{t.dm.clearTitle}</AlertDialogTitle>
              <AlertDialogDescription className="text-start">{t.dm.clearDesc}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel className="rounded-xl font-bold">{t.common.cancel}</AlertDialogCancel>
              <AlertDialogAction
                className="rounded-xl font-bold bg-destructive text-white hover:bg-destructive/90"
                onClick={(e) => {
                  e.preventDefault();
                  void clearThread();
                }}
              >
                <Trash2 className="h-4 w-4" />
                {clearing ? t.common.loading : t.dm.clearConfirm}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

/** أداة صغيرة لفتح المحادثة من أي مكان — زر «تواصل» */
export function openDm(peerId: string, peerName: string) {
  window.dispatchEvent(new CustomEvent("open-dm", { detail: { id: peerId, name: peerName } }));
}
