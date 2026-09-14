"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, ArrowLeft, ArrowRight, MapPin, UsersRound, LogIn, UserPlus, KeyRound, Phone } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { WILAYAS, WILAYA_LABELS, AGE_GROUPS, AGE_LABELS } from "@/lib/constants";
import type { AppLang } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BackButton } from "@/components/shared/back-button";
import { showAppToast } from "@/components/shared/app-toast";

type Mode = "register" | "login" | "forgot";

export function ClientStartView() {
  const { t, lang, setLang } = useI18n();
  const { setView, setUser, clientDraft } = useApp();
  const [mode, setMode] = useState<Mode>("register");
  /* الاسم المستعار حر — يكتبه المستخدم بنفسه بأي نص يشاء */
  const [pseudonym, setPseudonym] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryPhrase, setRecoveryPhrase] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [wilaya, setWilaya] = useState<string>(clientDraft.wilaya || "");
  const [ageGroup, setAgeGroup] = useState<string>(clientDraft.ageGroup || "");
  /* الجنس — ذكر أو أنثى فقط، مطلوب عند إنشاء حساب جديد */
  const [gender, setGender] = useState<"male" | "female" | "">("");
  /* v2.7.0: رقم الهاتف — اختياري، لا يظهر إلا للأخصائي الذي يحجزه ليتواصل معه عبر واتساب */
  const [phone, setPhone] = useState<string>("");
  const [prefLang, setPrefLang] = useState<string>(clientDraft.prefLang || lang);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const Arrow = lang === "ar" ? ArrowLeft : ArrowRight;

  const errorText = (code: string) => {
    switch (code) {
      case "PSEUDONYM_TAKEN":
        return t.client.pseudonymTaken;
      case "PSEUDONYM_REQUIRED":
        return t.client.pseudonymRequired;
      case "WEAK_PASSWORD":
        return t.client.weakPassword;
      case "WEAK_RECOVERY":
        return t.client.weakRecovery;
      case "INVALID":
        return t.client.loginError;
      case "RECOVERY_INVALID":
        return t.client.recoveryInvalid;
      case "INVALID_PHONE":
        /* v2.7.0: رقم هاتف غير صالح */
        return t.client.phoneInvalid;
      case "PHONE_REQUIRED":
        /* v2.12.0: رقم الهاتف إلزامي */
        return t.client.phoneRequired;
      case "GENDER_NOT_ACCEPTED":
        return t.client.counselorDayFull;
      case "SUSPENDED":
        /* v2.6.0: الحساب معطّل من الإدارة */
        return t.client.accountSuspended;
      case "DB_UNAVAILABLE":
        return t.common.errorDb;
      case "SERVER_ERROR":
        return t.common.errorServer;
      default:
        return t.common.error;
    }
  };

  const call = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(errorText(data.error || ""));
        return null;
      }
      return data;
    } finally {
      setBusy(false);
    }
  };

  const afterAuth = (user: { id: string; pseudonym: string; wilaya?: string; ageGroup?: string; language?: string; gender?: string; phone?: string | null }) => {
    setUser({
      id: user.id,
      role: "VICTIM",
      pseudonym: user.pseudonym,
      wilaya: user.wilaya,
      ageGroup: user.ageGroup,
      gender: user.gender === "male" || user.gender === "female" ? user.gender : null,
      phone: user.phone ?? null,
      language: (["fr", "en", "tr", "ru", "zh"].includes(user.language || "") ? user.language : "ar") as AppLang,
    });
    /* v1.16.0: قادم من نافذة حجز عيادة (حجز → إنشاء حساب → دخول تلقائي
       → عودة لنفس نافذة الحجز بكل البيانات المدخلة محفوظة) — المسودة تُقرأ
       وتُستعاد داخل clinic-page عند تحميل ملف العيادة */
    try {
      if (sessionStorage.getItem("tumaanina-clinic-booking-draft")) {
        const d = JSON.parse(sessionStorage.getItem("tumaanina-clinic-booking-draft") || "{}") as { clinicKey?: string };
        useApp.getState().setActiveClinic(d.clinicKey || null);
        setView("clinic-page");
        return;
      }
    } catch {
      /* تجاهل */
    }
    /* v2.12.0: قادم من الرابط العام لأخصائي (؟book=) — الانتقال مباشرة
       للحجز مع نفس الأخصائي بدل بداية مسار الحجز من أول خطوة */
    let directBook = false;
    try {
      directBook = !!sessionStorage.getItem("tumaanina-pending-book");
    } catch {
      /* تجاهل */
    }
    setView(directBook ? "client-find" : "client-topics");
  };

  const register = async () => {
    if (!gender) {
      setError(t.client.genderRequired);
      return;
    }
    /* v2.12.0: رقم الهاتف المرتبط بواتساب صار إلزامياً — الأخصائي
       يحتاجه للتواصل مع العميل عند قبول الجلسة (يبقى مخفياً عن الجميع
       سواه، نفس منطق الخصوصية السابق) */
    if (!phone.trim()) {
      setError(t.client.phoneRequired);
      return;
    }
    const data = await call({
      action: "register",
      pseudonym,
      password,
      recoveryPhrase,
      language: prefLang,
      wilaya,
      ageGroup,
      gender,
      phone: phone.trim(),
    });
    if (data) {
      afterAuth(data.user);
      /* v2.12.0: تأكيد نجاح إنشاء الحساب — لم يكن هناك أي إشعار سابقاً */
      showAppToast(t.toast.registerSuccess, t.toast.welcomeSub);
    }
  };

  const login = async () => {
    const data = await call({ action: "login", pseudonym, password });
    if (data) {
      afterAuth(data.user);
      /* v2.12.0: تأكيد نجاح تسجيل الدخول */
      showAppToast(t.toast.loginSuccess, `${t.toast.welcomeBack} ${data.user.pseudonym || ""}`.trim());
    }
  };

  const forgot = async () => {
    const data = await call({ action: "forgot", pseudonym, recoveryPhrase, newPassword });
    if (data) {
      setMode("login");
      setNotice(t.client.passwordResetOk);
      setNewPassword("");
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 md:py-16">
      <BackButton />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl md:text-3xl font-black">{t.client.startTitle}</h1>
          <p className="text-muted-foreground leading-relaxed">{t.client.startDesc}</p>
        </div>

        {/* تبويبات: حساب جديد / دخول */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => { setMode("register"); setError(""); setNotice(""); }}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-black transition-all ${
              mode !== "login" ? "gradient-primary text-white shadow" : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            <UserPlus className="h-4 w-4" />
            {t.client.tabNewAccount}
          </button>
          <button
            onClick={() => { setMode("login"); setError(""); setNotice(""); }}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-black transition-all ${
              mode === "login" ? "gradient-primary text-white shadow" : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            <LogIn className="h-4 w-4" />
            {t.client.tabLogin}
          </button>
        </div>

        <Card className="border-primary/30 shadow-lg shadow-primary/5">
          <CardContent className="p-6 sm:p-8 space-y-6">
            {/* الاسم المستعار — نص حر يكتبه المستخدم بنفسه */}
            <div className="space-y-3">
              <label className="text-sm font-bold text-muted-foreground">{t.client.yourPseudonym}</label>
              <Input
                value={pseudonym}
                onChange={(e) => setPseudonym(e.target.value)}
                placeholder={t.client.pseudonymPlaceholder}
                className="text-center text-lg font-black text-primary border-2 border-primary/30 bg-primary/5 rounded-xl h-12"
                dir="auto"
                maxLength={40}
              />
              {mode === "register" && (
                <p className="text-[11px] text-muted-foreground font-semibold">{t.client.pseudonymUnique}</p>
              )}
            </div>

            {/* كلمة المرور */}
            {mode !== "forgot" && (
              <div className="space-y-1.5">
                <Label className="font-bold">{t.client.passwordLabel} *</Label>
                <Input
                  type="password"
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-xl bg-card"
                  onKeyDown={(e) => e.key === "Enter" && (mode === "register" ? register() : login())}
                />
                {mode === "register" && (
                  <p className="text-[11px] text-muted-foreground font-semibold">{t.client.passwordHint}</p>
                )}
              </div>
            )}

            {/* عبارة الاسترجاع — إلزامية عند إنشاء حساب جديد (تُطلب عند نسيان كلمة المرور) */}
            {mode === "register" && (
              <div className="space-y-1.5">
                <Label className="font-bold">{t.client.recoveryPhraseLabel} *</Label>
                <Input
                  value={recoveryPhrase}
                  onChange={(e) => setRecoveryPhrase(e.target.value)}
                  className="rounded-xl bg-card"
                  dir="auto"
                />
                <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold flex items-start gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {t.client.recoveryExplain}
                </p>
              </div>
            )}

            {/* نسيان كلمة المرور: العبارة الاسترجاعية + كلمة مرور جديدة */}
            {mode === "forgot" && (
              <>
                <div className="rounded-xl bg-primary/5 border border-primary/20 px-4 py-3 text-xs font-semibold text-muted-foreground leading-relaxed flex items-start gap-2">
                  <KeyRound className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  {t.client.recoveryExplain}
                </div>
                <div className="space-y-1.5">
                  <Label className="font-bold">{t.client.recoveryPhraseLabel} *</Label>
                  <Input
                    value={recoveryPhrase}
                    onChange={(e) => setRecoveryPhrase(e.target.value)}
                    className="rounded-xl bg-card"
                    dir="auto"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-bold">{t.client.newPasswordLabel} *</Label>
                  <Input
                    type="password"
                    dir="ltr"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="rounded-xl bg-card"
                    onKeyDown={(e) => e.key === "Enter" && forgot()}
                  />
                </div>
              </>
            )}

            {/* معلومات اختيارية عند إنشاء حساب جديد */}
            {mode === "register" && (
              <div className="pt-1 space-y-3">
                <label className="text-sm font-bold text-muted-foreground">{t.client.aboutYou}</label>
                {/* الجنس — ذكر أو أنثى فقط */}
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">{t.client.genderLabel} *</span>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { v: "male" as const, label: t.client.genderMale },
                      { v: "female" as const, label: t.client.genderFemale },
                    ]).map((g) => (
                      <button
                        key={g.v}
                        type="button"
                        onClick={() => setGender(g.v)}
                        className={`rounded-xl border-2 py-2.5 text-sm font-bold transition-all ${
                          gender === g.v
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:border-primary/40"
                        }`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* v2.12.0: رقم الهاتف المرتبط بواتساب — إلزامي ليتمكن الأخصائي المختار
                    من التواصل معه، ويبقى مخفياً عن كل المستخدمين سواه */}
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" /> {t.client.phoneLabel} *
                  </span>
                  <Input
                    type="tel"
                    dir="ltr"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0555123456"
                    className="rounded-xl bg-card font-mono"
                    maxLength={20}
                  />
                  <p className="text-[11px] text-muted-foreground font-semibold flex items-start gap-1.5">
                    <Phone className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
                    {t.client.phoneHint}
                  </p>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" /> {t.client.wilayaLabel}
                    </span>
                    <Select value={wilaya} onValueChange={setWilaya} dir={lang === "ar" ? "rtl" : "ltr"}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {WILAYAS.map((w) => (
                          <SelectItem key={w} value={w}>
                            {WILAYA_LABELS[w]?.[lang] ?? w}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                      <UsersRound className="h-3.5 w-3.5" /> {t.client.ageGroupLabel}
                    </span>
                    <Select value={ageGroup} onValueChange={setAgeGroup} dir={lang === "ar" ? "rtl" : "ltr"}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {AGE_GROUPS.map((a) => (
                          <SelectItem key={a} value={a}>
                            {AGE_LABELS[a]?.[lang] ?? a}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">💬 {t.client.langPrefLabel}</span>
                  <div className="flex gap-2 flex-wrap">
                    {(["ar", "fr", "en", "tr", "ru", "zh"] as const).map((l) => (
                      <Button
                        key={l}
                        type="button"
                        variant={prefLang === l ? "default" : "outline"}
                        size="sm"
                        className={`rounded-full font-bold ${prefLang === l ? "gradient-primary text-white" : ""}`}
                        onClick={() => setPrefLang(l)}
                      >
                        {l === "ar" ? "العربية" : l === "fr" ? "Français" : l === "en" ? "English" : l === "tr" ? "Türkçe" : l === "ru" ? "Русский" : "中文"}
                      </Button>
                    ))}
                  </div>
                </div>
                {prefLang !== lang && (
                  <Button variant="link" size="sm" className="p-0 h-auto text-primary" onClick={() => setLang(prefLang as never)}>
                    {t.settings.languageLabel} → {prefLang === "ar" ? "العربية" : prefLang === "fr" ? "Français" : prefLang === "en" ? "English" : prefLang === "tr" ? "Türkçe" : prefLang === "ru" ? "Русский" : "中文"}
                  </Button>
                )}
              </div>
            )}

            {error && <div className="rounded-xl bg-destructive/10 text-destructive text-sm font-bold px-4 py-3">{error}</div>}
            {notice && <div className="rounded-xl bg-primary/10 text-primary text-sm font-bold px-4 py-3">{notice}</div>}

            <Button
              size="lg"
              className="w-full gradient-primary text-white font-black text-base rounded-xl h-13"
              disabled={busy}
              onClick={mode === "register" ? register : mode === "login" ? login : forgot}
            >
              {busy ? t.common.loading : mode === "register" ? t.client.startBtn : mode === "login" ? t.client.tabLogin : t.client.resetPasswordBtn}
              {mode !== "forgot" && <Arrow className="h-5 w-5" />}
            </Button>

            {mode !== "forgot" ? (
              <button
                className="w-full text-center text-xs font-bold text-muted-foreground hover:text-primary transition-colors"
                onClick={() => { setMode("forgot"); setError(""); setNotice(""); }}
              >
                {t.client.forgotPassword}
              </button>
            ) : (
              <button
                className="w-full text-center text-xs font-bold text-muted-foreground hover:text-primary transition-colors"
                onClick={() => { setMode("login"); setError(""); setNotice(""); }}
              >
                {t.client.backToLogin}
              </button>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
