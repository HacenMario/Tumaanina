"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Heart, Send, Target, Eye, Gem, ShieldCheck, Mail } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "@/hooks/use-toast";
import { BackButton } from "@/components/shared/back-button";
import { WhatsAppGlyph } from "@/components/session/whatsapp-panel";

const CONTACT_EMAIL = "stevenhacen@gmail.com";
const CONTACT_WHATSAPP_LOCAL = "0542163526";
const CONTACT_WHATSAPP_INTL = "213542163526";

export function AboutView() {
  const { t } = useI18n();
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 md:py-14">
      <BackButton />
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <h1 className="text-3xl font-black text-center text-gradient">{t.info.aboutTitle}</h1>
        <Card className="border-border/70">
          <CardContent className="p-7 space-y-5 text-[15px] leading-loose text-foreground/85">
            <p>{t.info.aboutP1}</p>
            <p>{t.info.aboutP2}</p>
            <p>{t.info.aboutP3}</p>
          </CardContent>
        </Card>
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-6 space-y-2.5">
              <Target className="h-6 w-6 text-primary" />
              <h3 className="font-black">{t.info.missionTitle}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{t.info.missionText}</p>
            </CardContent>
          </Card>
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-6 space-y-2.5">
              <Eye className="h-6 w-6 text-primary" />
              <h3 className="font-black">{t.info.visionTitle}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{t.info.visionText}</p>
            </CardContent>
          </Card>
        </div>
        <Card className="border-border/70">
          <CardContent className="p-6 space-y-4">
            <h3 className="font-black flex items-center gap-2">
              <Gem className="h-5 w-5 text-primary" />
              {t.info.valuesTitle}
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {[t.info.value1, t.info.value2, t.info.value3, t.info.value4].map((v) => (
                <div key={v} className="flex items-center gap-2.5 rounded-xl bg-muted/50 px-4 py-3">
                  <Heart className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm font-bold">{v}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

export function FaqView() {
  const { t } = useI18n();
  /* v2.14.0: الأسئلة محدَّثة حسب النسخة الجديدة — تقييمات الأخصائيين وتمارين التهدئة */
  const faqs = [
    { q: t.info.faq1Q, a: t.info.faq1A },
    { q: t.info.faq2Q, a: t.info.faq2A },
    { q: t.info.faq3Q, a: t.info.faq3A },
    { q: t.info.faq4Q, a: t.info.faq4A },
    { q: t.info.faq5Q, a: t.info.faq5A },
    { q: t.info.faq6Q, a: t.info.faq6A },
    { q: t.info.faq7Q, a: t.info.faq7A },
    { q: t.info.faq8Q, a: t.info.faq8A },
  ];
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 md:py-14">
      <BackButton />
      <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="text-3xl font-black text-center mb-8 text-gradient">
        {t.info.faqTitle}
      </motion.h1>
      <Accordion type="single" collapsible className="space-y-3">
        {faqs.map((f, i) => (
          <AccordionItem key={i} value={`item-${i}`} className="border-border/70 rounded-2xl border bg-card px-5">
            <AccordionTrigger className="font-bold text-start text-[15px] hover:no-underline">{f.q}</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">{f.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

export function PrivacyView() {
  const { t } = useI18n();
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 md:py-14">
      <BackButton />
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
        <h1 className="text-3xl font-black text-center text-gradient">{t.info.privacyTitle}</h1>
        <Card className="border-border/70">
          <CardContent className="p-7 space-y-5 text-[15px] leading-loose text-foreground/85">
            <p>{t.info.privacyP1}</p>
            <p>{t.info.privacyP2}</p>
            <p>{t.info.privacyP3}</p>
            <p>{t.info.privacyP4}</p>
          </CardContent>
        </Card>
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" />
          {t.info.value1}
        </div>
      </motion.div>
    </div>
  );
}

export function TermsView() {
  const { t } = useI18n();
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 md:py-14">
      <BackButton />
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
        <h1 className="text-3xl font-black text-center text-gradient">{t.info.termsTitle}</h1>
        <Card className="border-border/70">
          <CardContent className="p-7 space-y-5 text-[15px] leading-loose text-foreground/85">
            <p>{t.info.termsP1}</p>
            <p>{t.info.termsP2}</p>
            <p>{t.info.termsP3}</p>
            <p>{t.info.termsP4}</p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

export function ContactView() {
  const { t } = useI18n();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  /* الرسالة تُحفظ في قاعدة البيانات وتظهر للإدارة مع الملاحظات */
  const send = async () => {
    if (message.trim().length < 3) return;
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "contact", subject: subject.trim(), message: message.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setSent(true);
        toast({ title: t.info.sent });
      }
    } catch {
      /* تجاهل */
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-12 md:py-14">
      <BackButton />
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-black text-gradient">{t.info.contactTitle}</h1>
          <p className="text-sm text-muted-foreground">{t.info.contactDesc}</p>
        </div>
        <Card className="border-border/70">
          <CardContent className="p-6 space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="flex items-center gap-3 rounded-xl bg-muted/50 px-4 py-3 hover:bg-primary/10 transition-colors"
              >
                <Mail className="h-5 w-5 text-primary shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[10px] font-bold text-muted-foreground">{t.info.contactEmail}</span>
                  <span className="block text-xs font-mono font-bold truncate" dir="ltr">{CONTACT_EMAIL}</span>
                </span>
              </a>
              <a
                href={`https://wa.me/${CONTACT_WHATSAPP_INTL}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl bg-muted/50 px-4 py-3 hover:bg-[#25D366]/10 transition-colors"
              >
                <span className="shrink-0">
                  <WhatsAppGlyph className="h-5 w-5 text-[#128C4A]" />
                </span>
                <span>
                  <span className="block text-[10px] font-bold text-muted-foreground">{t.info.contactWhatsapp}</span>
                  <span className="block text-xs font-mono font-bold" dir="ltr">{CONTACT_WHATSAPP_LOCAL}</span>
                </span>
              </a>
            </div>
            {!sent ? (
              <>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t.info.contactPartnership} className="rounded-xl bg-card" />
                <Textarea value={message} onChange={(e) => setMessage(e.target.value)} className="rounded-xl min-h-28" dir="auto" />
                <Button className="w-full gradient-primary text-white font-black rounded-xl h-12" onClick={send}>
                  <Send className="h-4 w-4" />
                  {t.common.send}
                </Button>
              </>
            ) : (
              <div className="rounded-xl bg-primary/10 text-primary font-bold text-sm px-4 py-4 text-center">
                {t.info.sent}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
