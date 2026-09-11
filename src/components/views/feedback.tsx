"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Lightbulb, Bug, MessageSquareHeart, Send, CheckCircle2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BackButton } from "@/components/shared/back-button";
import { playSound } from "@/lib/sounds";

type FeedbackType = "suggestion" | "bug" | "other";

const TYPE_META: { key: FeedbackType; icon: React.ElementType; color: string }[] = [
  { key: "suggestion", icon: Lightbulb, color: "text-amber-500" },
  { key: "bug", icon: Bug, color: "text-destructive" },
  { key: "other", icon: MessageSquareHeart, color: "text-primary" },
];

export function FeedbackView() {
  const { t } = useI18n();
  const [type, setType] = useState<FeedbackType>("suggestion");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const send = async () => {
    setError("");
    if (message.trim().length < 3) {
      setError(t.feedback.emptyMessage);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, subject: subject.trim(), message: message.trim(), contact: contact.trim() || null }),
      });
      const data = await res.json();
      if (data.ok) {
        setDone(true);
        playSound("success");
      } else {
        setError(t.common.error);
      }
    } catch {
      setError(t.common.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 md:py-14">
      <BackButton />
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div className="text-center space-y-2.5">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
            <MessageSquareHeart className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl md:text-3xl font-black">{t.feedback.title}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-lg mx-auto">{t.feedback.desc}</p>
        </div>

        <Card className="border-border/70 shadow-lg shadow-primary/5">
          <CardContent className="p-6 sm:p-8 space-y-5">
            {done ? (
              <div className="text-center space-y-4 py-6">
                <CheckCircle2 className="h-14 w-14 mx-auto text-primary" />
                <p className="font-black text-primary text-lg">{t.feedback.ok}</p>
                <Button
                  variant="outline"
                  className="rounded-xl font-bold"
                  onClick={() => {
                    setDone(false);
                    setSubject("");
                    setMessage("");
                    setContact("");
                    setType("suggestion");
                  }}
                >
                  {t.feedback.title}
                </Button>
              </div>
            ) : (
              <>
                {/* نوع الرسالة */}
                <div className="space-y-2">
                  <Label className="font-bold">{t.feedback.typeLabel}</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {TYPE_META.map((m) => (
                      <button
                        key={m.key}
                        onClick={() => setType(m.key)}
                        className={`rounded-xl border-2 p-3 flex flex-col items-center gap-1.5 text-[11px] font-bold transition-all ${
                          type === m.key
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:border-primary/40"
                        }`}
                      >
                        <m.icon className={`h-5 w-5 ${type === m.key ? "" : m.color}`} />
                        {t.feedback.types[m.key]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="font-bold">{t.feedback.subjectLabel}</Label>
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder={t.feedback.subjectPlaceholder}
                    className="rounded-xl bg-card"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="font-bold">{t.feedback.messageLabel} *</Label>
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={t.feedback.messagePlaceholder}
                    className="rounded-xl min-h-32"
                    dir="auto"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="font-bold">{t.feedback.contactLabel}</Label>
                  <Input
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    className="rounded-xl bg-card"
                    dir="auto"
                  />
                </div>

                {error && (
                  <div className="rounded-xl bg-destructive/10 text-destructive text-sm font-bold px-4 py-3">{error}</div>
                )}

                <Button className="w-full gradient-primary text-white font-black rounded-xl h-12" disabled={busy} onClick={send}>
                  <Send className="h-4 w-4" />
                  {busy ? t.common.loading : t.feedback.submit}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
