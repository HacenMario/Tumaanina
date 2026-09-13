"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Building2, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { WILAYA_LIST } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BackButton } from "@/components/shared/back-button";
import { showAppToast } from "@/components/shared/app-toast";

/* ═ v1.14.0 — تسجيل عيادة جديدة (حساب عيادة) ═
   الحد الأدنى للتسجيل: اسم العيادة + بريد + كلمة مرور + عبارة استرجاع
   + الولاية — العيادة تظهر في الدليل فور التسجيل، وتُكمل بقية الملف
   (سنة الإنشاء، التخصصات، العنوان، الهواتف، الشعار…) من لوحتها. */

export function ClinicRegisterView({ embedded = false }: { embedded?: boolean }) {
  const { t, lang } = useI18n();
  const { setUser, setView } = useApp();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryPhrase, setRecoveryPhrase] = useState("");
  const [wilaya, setWilaya] = useState<string>("all");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    if (!name.trim() || !email.trim()) {
      setError(t.clinicAuth.missingFields);
      return;
    }
    if (password.length < 8) {
      setError(t.client.weakPassword);
      return;
    }
    if (recoveryPhrase.trim().length < 6) {
      setError(t.client.weakRecovery);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/clinic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          name: name.trim(),
          email,
          password,
          recoveryPhrase: recoveryPhrase.trim(),
          wilaya: wilaya === "all" ? undefined : wilaya,
          language: lang,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setUser({
          id: data.userId,
          role: "CLINIC",
          clinicName: name.trim(),
          clinicSlug: data.slug || undefined,
          clinicId: data.userId,
          email: email.trim(),
        });
        setView("clinic-dashboard");
        showAppToast(t.clinicAuth.registered, t.clinicAuth.registeredSub);
      } else if (data.error === "EMAIL_EXISTS") {
        setError(t.clinicAuth.emailExists);
      } else if (data.error === "DB_UNAVAILABLE") {
        setError(t.common.errorDb);
      } else {
        setError(t.common.errorServer);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={embedded ? "max-w-md mx-auto" : "max-w-md mx-auto px-4 py-14 md:py-20"}>
      {!embedded && <BackButton />}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="border-border/70 shadow-lg">
          <CardContent className="p-7 space-y-5">
            <div className="text-center space-y-2">
              <div className="w-13 h-13 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center p-3">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-xl font-black">{t.clinicAuth.registerTitle}</h1>
              <p className="text-xs text-muted-foreground leading-relaxed">{t.clinicAuth.registerDesc}</p>
            </div>

            <div className="space-y-1.5">
              <Label className="font-bold">{t.clinicAuth.clinicName} *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl bg-card" maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold">{t.counselor.email} *</Label>
              <Input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-xl bg-card" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold">{t.client.passwordLabel} *</Label>
              <Input type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-xl bg-card" />
              <p className="text-[10px] text-muted-foreground font-semibold">{t.client.passwordHint}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold">{t.client.recoveryPhraseLabel} *</Label>
              <Input value={recoveryPhrase} onChange={(e) => setRecoveryPhrase(e.target.value)} className="rounded-xl bg-card" dir="auto" />
              <p className="text-[10px] text-muted-foreground font-semibold">{t.client.recoveryHint}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold">{t.clinicAuth.wilayaLabel}</Label>
              <Select value={wilaya} onValueChange={setWilaya}>
                <SelectTrigger className="rounded-xl bg-card font-semibold"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="all">{t.clinicAuth.noWilaya}</SelectItem>
                  {WILAYA_LIST.map((w) => (
                    <SelectItem key={w.key} value={w.key}>{lang === "ar" ? w.ar : lang === "fr" ? w.fr : w.en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error && <div className="rounded-xl bg-destructive/10 text-destructive text-sm font-bold px-4 py-3">{error}</div>}

            <Button className="w-full gradient-primary text-white font-black rounded-xl h-12" disabled={busy} onClick={submit}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
              {t.clinicAuth.registerSubmit}
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
