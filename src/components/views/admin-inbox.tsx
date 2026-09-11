"use client";

/**
 * v2.10.0 — تبويب «رسائل المختصين» في لوحة الإدارة.
 * قائمة محادثات admin:{counselorId} مع نافذة رد مباشرة:
 * استقصاء كل 4 ثوانٍ + بث فوري عبر socket.io (نفس منطق الدردشة).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Inbox, Send, ChevronRight, ChevronLeft, ArrowRight, RefreshCw } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

/* v1.4.0: رمز الإدارة — يُرفق مع كل نداءات اللوحة (بوابة خادمية إلزامية) */
function adminHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-admin-token": (typeof window !== "undefined" && localStorage.getItem("tumaanina-admin-token")) || "",
  };
}

interface AdminThread {
  key: string;
  counselorId: string;
  counselorName: string;
  lastAt: string;
  count: number;
  lastRole: string;
  lastContent: string;
  lastSender: string;
}

interface AdminMsg {
  id: string;
  threadKey: string | null;
  senderRole: string;
  senderName: string | null;
  content: string;
  createdAt: string;
}

export function AdminInboxTab() {
  const { t, lang } = useI18n();
  const [threads, setThreads] = useState<AdminThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<AdminThread | null>(null);
  const [messages, setMessages] = useState<AdminMsg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const lastAtRef = useRef<string | null>(null);

  const loadThreads = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ action: "admin-threads" }),
      });
      const data = await res.json();
      setThreads(data.threads || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  /* ─── المحادثة المفتوحة ─── */
  const loadMsgs = useCallback(async () => {
    if (!active) return;
    try {
      const qs = lastAtRef.current ? `&since=${encodeURIComponent(lastAtRef.current)}` : "";
      const res = await fetch(`/api/messages?threadKey=${encodeURIComponent(active.key)}${qs}`);
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
      /* تجاهل */
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    lastAtRef.current = null;
    setMessages([]);
    loadMsgs();
    const i = setInterval(loadMsgs, 4000);
    return () => clearInterval(i);
  }, [active, loadMsgs]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    const content = text.trim();
    if (!content || !active || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({
          threadKey: active.key,
          senderRole: "ADMIN",
          senderName: t.adminChat.adminName,
          content,
        }),
      });
      const data = await res.json();
      if (data.ok && data.message) {
        const msg = data.message as AdminMsg;
        setMessages((cur) => (cur.some((m) => m.id === msg.id) ? cur : [...cur, msg]));
        lastAtRef.current = msg.createdAt;
        setText("");
        loadThreads(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const timeOf = (iso: string) =>
    new Date(iso).toLocaleString(lang === "ar" ? "ar-DZ" : lang === "fr" ? "fr-FR" : "en-GB", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  /* ─── نافذة المحادثة المفتوحة ─── */
  if (active) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" className="rounded-lg font-bold" onClick={() => setActive(null)}>
            {lang === "ar" ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            {t.admin.backToList}
          </Button>
          <span className="font-black text-sm truncate">{active.counselorName}</span>
        </div>

        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div ref={listRef} className="h-[48vh] min-h-56 overflow-y-auto scrollbar-thin px-4 py-3 space-y-2 bg-background">
              {messages.length === 0 ? (
                <p className="text-center text-xs font-semibold text-muted-foreground py-10">{t.admin.noMessages}</p>
              ) : (
                messages.map((m) => {
                  const mine = m.senderRole === "ADMIN";
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                          mine ? "gradient-primary text-white rounded-ee-sm" : "bg-muted text-foreground rounded-es-sm"
                        }`}
                        dir="auto"
                      >
                        {!mine && <div className="text-[10px] font-black text-primary mb-0.5">{m.senderName || "—"}</div>}
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
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ─── قائمة المحادثات ─── */
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground leading-relaxed flex-1">{t.adminChat.adminInboxDesc}</p>
        <Button variant="outline" size="sm" className="rounded-lg font-bold shrink-0" onClick={() => loadThreads()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="h-16 animate-pulse bg-muted/50 border-border/50" />
          ))}
        </div>
      ) : threads.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center space-y-2 text-muted-foreground">
            <Inbox className="h-10 w-10 mx-auto opacity-40" />
            <p className="font-semibold text-sm">{t.adminChat.adminEmpty}</p>
          </CardContent>
        </Card>
      ) : (
        threads.map((th) => (
          <button key={th.key} onClick={() => setActive(th)} className="w-full text-start">
            <Card className="hover:border-primary/40 hover:shadow-sm transition-all">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Inbox className="h-4.5 w-4.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-sm truncate">{th.counselorName}</span>
                    <span className="text-[10px] font-bold text-muted-foreground shrink-0 font-mono">{timeOf(th.lastAt)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground font-semibold truncate mt-0.5" dir="auto">
                    {th.lastRole === "ADMIN" ? `${t.adminChat.adminName}: ` : ""}
                    {th.lastContent}
                  </p>
                </div>
                {th.count > 1 && (
                  <Badge variant="secondary" className="shrink-0 text-[10px] font-black">
                    {th.count}
                  </Badge>
                )}
                {lang === "ar" ? <ChevronLeft className="h-4 w-4 text-muted-foreground shrink-0" /> : <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />}
              </CardContent>
            </Card>
          </button>
        ))
      )}
    </div>
  );
}
