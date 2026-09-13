"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { LogIn, KeyRound } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BackButton } from "@/components/shared/back-button";
import { showAppToast } from "@/components/shared/app-toast";

/* ═ v1.14.0 — دخول العيادة ═
   نمط مطابق لبوابة الأخصائيين: بريد + كلمة مرور + استرجاع بعبارة
   الاسترجاع. النجاح يوجّه إلى لوحة العيادة مباشرة. */

export function ClinicLoginView({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const { setUser, setView } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [showForgot, setShowForgot] = useState(false);
  const [recoveryPhrase, setRecoveryPhrase] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotOk, setForgotOk] = useState(false);

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/clinic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", email, password }),
      });
      const data = await res.json();
      if (data.ok) {
        setUser({
          id: data.user.id,
          role: "CLINIC",
          clinicName: data.user.clinicName || undefined,
          clinicSlug: data.user.clinicSlug || undefined,
          clinicId: data.user.clinicId || undefined,
          email,
        });
        setView("clinic-dashboard");
        showAppToast(t.toast.loginSuccess, `${t.toast.welcomeBack} ${data.user.clinicName || ""}`.trim());
      } else if (data.error === "DB_UNAVAILABLE") {
        setError(t.common.errorDb);
      } else if (data.error === "SERVER_ERROR") {
        setError(t.common.errorServer);
      } else if (data.error === "SUSPENDED") {
        setError(t.counselor.suspendedLogin);
      } else {
        setError(t.clinicAuth.loginError);
      }
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    setError("");
    setForgotBusy(true);
    try {
      const res = await fetch("/api/clinic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "forgot", email, recoveryPhrase: recoveryPhrase.trim(), newPassword }),
      });
      const data = await res.json();
      if (data.ok) {
        setForgotOk(true);
        setShowForgot(false);
        setError("");
      } else if (data.error === "WEAK_PASSWORD") {
        setError(t.client.weakPassword);
      } else {
        setError(t.client.recoveryInvalid);
      }
    } finally {
      setForgotBusy(false);
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
                <LogIn className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-xl font-black">{t.clinicAuth.loginTitle}</h1>
              <p className="text-xs text-muted-foreground">{t.clinicAuth.loginDesc}</p>
            </div>

            {showForgot ? (
              <>
                <div className="rounded-xl bg-primary/5 border border-primary/20 px-4 py-3 text-xs font-semibold text-muted-foreground leading-relaxed flex items-start gap-2">
                  <KeyRound className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  {t.client.recoveryExplain}
                </div>
                <div className="space-y-1.5">
                  <Label className="font-bold">{t.counselor.email}</Label>
                  <Input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-xl bg-card" />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-bold">{t.client.recoveryPhraseLabel} *</Label>
                  <Input value={recoveryPhrase} onChange={(e) => setRecoveryPhrase(e.target.value)} className="rounded-xl bg-card" dir="auto" />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-bold">{t.client.newPasswordLabel} *</Label>
                  <Input type="password" dir="ltr" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="rounded-xl bg-card" onKeyDown={(e) => e.key === "Enter" && forgot()} />
                </div>
                {error && <div className="rounded-xl bg-destructive/10 text-destructive text-sm font-bold px-4 py-3">{error}</div>}
                {forgotOk && <div className="rounded-xl bg-primary/10 text-primary text-sm font-bold px-4 py-3">{t.client.passwordResetOk}</div>}
                <Button className="w-full gradient-primary text-white font-black rounded-xl h-12" disabled={forgotBusy} onClick={forgot}>
                  {forgotBusy ? t.common.loading : t.client.resetPasswordBtn}
                </Button>
                <button className="w-full text-center text-xs font-bold text-muted-foreground hover:text-primary transition-colors" onClick={() => { setShowForgot(false); setForgotOk(false); setError(""); }}>
                  {t.client.backToLogin}
                </button>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="font-bold">{t.counselor.email}</Label>
                  <Input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-xl bg-card" />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-bold">{t.client.passwordLabel}</Label>
                  <Input type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-xl bg-card" onKeyDown={(e) => e.key === "Enter" && submit()} />
                </div>
                {error && <div className="rounded-xl bg-destructive/10 text-destructive text-sm font-bold px-4 py-3">{error}</div>}
                <Button className="w-full gradient-primary text-white font-black rounded-xl h-12" disabled={busy} onClick={submit}>
                  {busy ? t.common.loading : t.counselor.loginSubmit}
                </Button>
                <button className="w-full text-center text-xs font-bold text-muted-foreground hover:text-primary transition-colors" onClick={() => { setShowForgot(true); setError(""); }}>
                  {t.client.forgotPassword}
                </button>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
