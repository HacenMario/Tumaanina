"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { HeartHandshake, Check, ImagePlus, Trash2, ShieldCheck, UserRound, Building2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { SPECIALTIES, CURRENCIES, CURRENCY_CODES } from "@/lib/constants";
import type { CurrencyCode } from "@/lib/constants";
import { normalizeWhatsapp } from "@/lib/whatsapp";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/shared/back-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MAX_RESULT_BYTES = 3_400_000; // بعد الضغط — حد الخادم ~3.3MB base64
const MAX_AVATAR_BYTES = 900_000; // الصورة الشخصية — أصغر حجمًا

/**
 * ضغط صورة الشهادة عبر Canvas قبل الإرسال:
 * يقبل أي صورة من أي جهاز (iPhone HEIC/JPEG بأحجام كبيرة، Android، ماسح ضوئي…)
 * ويصغّرها إلى أقصى ضلع 2200px بجودة 0.85 — النتيجة عادة أقل من 600KB.
 * الصور الصغيرة أصلًا (< 400KB) تمر كما هي دون أي فقدان.
 */
async function compressImage(file: File, maxSide = 2200, limit = MAX_RESULT_BYTES): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("READ_FAILED"));
    reader.readAsDataURL(file);
  });

  /* صورة صغيرة أصلًا — مررها دون ضغط */
  if (file.size <= 400 * 1024 && file.type !== "image/heic" && file.type !== "image/heif") {
    return dataUrl;
  }

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("DECODE_FAILED"));
      image.src = dataUrl;
    });

    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    /* جودة تنازلية حتى نلتزم بالحد */
    for (const q of [0.85, 0.75, 0.6, 0.45]) {
      const out = canvas.toDataURL("image/jpeg", q);
      if (out.length <= limit) return out;
    }
    return canvas.toDataURL("image/jpeg", 0.35);
  } catch {
    /* تعذر فك الترميز (HEIC غير مدعوم بالمتصفح) — مرر الأصل إن كان ضمن الحد */
    if (dataUrl.length <= limit) return dataUrl;
    throw new Error("TOO_BIG");
  }
}

export function CounselorRegisterView({ embedded = false }: { embedded?: boolean }) {
  const { t, lang } = useI18n();
  const { setUser, setView } = useApp();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryPhrase, setRecoveryPhrase] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  /* تخصصات خاصة يدخلها الأخصائي بنفسه — خارج القائمة الجاهزة */
  const [customSpecialties, setCustomSpecialties] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState("");
  const [languages, setLanguages] = useState<string[]>([lang]);
  const [bio, setBio] = useState("");
  const [years, setYears] = useState("");
  /* v1.3.0 (طمأنينة): سعر الجلسة لكل عملة — الدينار إلزامي، واليورو/الدولار
     مهيّآن بأسعار افتراضية قابلة للتعديل الآن ولاحقاً من الإعدادات */
  const [sessionPrices, setSessionPrices] = useState<Record<CurrencyCode, string>>({ DZD: "2500", EUR: "17", USD: "19" });
  const [diplomaImage, setDiplomaImage] = useState<string | null>(null);
  const [diplomaName, setDiplomaName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  /* الصورة الشخصية — اختيارية، تظهر للعميل في الدليل واختيار المختص */
  const [photo, setPhoto] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  /* v1.17.0: العيادة التابع لها الأخصائي — اختيارية من قائمة العيادات المسجلة */
  const [clinics, setClinics] = useState<{ id: string; name: string }[]>([]);
  const [clinicId, setClinicId] = useState("none");

  useEffect(() => {
    let alive = true;
    fetch("/api/clinics?pageSize=200")
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !Array.isArray(d?.clinics)) return;
        setClinics(
          d.clinics
            .filter((c: { id?: string; name?: string }) => c.id && c.name)
            .map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const toggle = (list: string[], setList: (v: string[]) => void, v: string) => {
    setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  };

  /* إضافة تخصص خاص (Enter أو زر +) — بحد أقصى 8 تخصصات */
  const addCustom = () => {
    const v = customInput.trim().slice(0, 50);
    if (!v || customSpecialties.includes(v) || customSpecialties.length >= 8) return;
    setCustomSpecialties([...customSpecialties, v]);
    setCustomInput("");
  };

  const pickDiploma = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif|bmp)$/i.test(file.name)) {
      setError(t.counselor.diplomaNotImage);
      return;
    }
    setError("");
    setDiplomaName(file.name);
    try {
      const compressed = await compressImage(file);
      setDiplomaImage(compressed);
    } catch {
      setError(t.counselor.diplomaTooBig);
    }
  };

  /* الصورة الشخصية: ضغط أخف (أقصى ضلع 700px) — اختيارية تماماً */
  const pickPhoto = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t.counselor.diplomaNotImage);
      return;
    }
    setError("");
    try {
      const compressed = await compressImage(file, 700, MAX_AVATAR_BYTES);
      setPhoto(compressed);
    } catch {
      setError(t.counselor.diplomaTooBig);
    }
  };

  const submit = async () => {
    setError("");
    if (!fullName.trim() || !email.trim() || specialties.length === 0 || languages.length === 0) {
      setError(t.common.requiredField);
      return;
    }
    if (!password || password.length < 8) {
      setError(t.client.weakPassword);
      return;
    }
    if (!recoveryPhrase || recoveryPhrase.trim().length < 6) {
      setError(t.client.weakRecovery);
      return;
    }
    if (!normalizeWhatsapp(whatsapp)) {
      setError(t.counselor.whatsappInvalid);
      return;
    }
    if (!diplomaImage) {
      setError(t.counselor.diplomaRequired);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/counselor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          fullName,
          email,
          whatsapp,
          password,
          recoveryPhrase: recoveryPhrase.trim(),
          specialties,
          customSpecialties,
          languages,
          bio,
          yearsExperience: Number(years) || 0,
          sessionPrice: Math.min(20000, Math.max(200, Math.round(Number(sessionPrices.DZD) || 2500))),
          sessionPrices: {
            DZD: Math.round(Number(sessionPrices.DZD) || 2500),
            EUR: Number(sessionPrices.EUR) || 17,
            USD: Number(sessionPrices.USD) || 19,
          },
          diplomaImage,
          photo,
          language: lang,
          /* v1.17.0: العيادة المختارة (اختيارية) */
          clinicId: clinicId === "none" ? null : clinicId,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setDone(true);
      } else if (data.error === "EMAIL_EXISTS") {
        setError("البريد مستخدم مسبقاً / Email déjà utilisé / Email already used");
      } else if (data.error === "INVALID_WHATSAPP") {
        setError(t.counselor.whatsappInvalid);
      } else if (data.error === "WEAK_PASSWORD") {
        setError(t.client.weakPassword);
      } else if (data.error === "WEAK_RECOVERY") {
        setError(t.client.weakRecovery);
      } else if (data.error === "INVALID_DIPLOMA") {
        setError(t.counselor.diplomaNotImage);
      } else {
        setError(t.common.error);
      }
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className={embedded ? "max-w-xl mx-auto" : "max-w-xl mx-auto px-4 py-14 md:py-20"}>
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
          <Card className="border-primary/40 shadow-xl shadow-primary/5">
            <CardContent className="p-8 space-y-6 text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center animate-breathe">
                <ShieldCheck className="h-8 w-8 text-primary" />
              </div>
              <div className="space-y-2">
                <h1 className="text-xl font-black">{t.counselor.registerSuccess}</h1>
                <p className="text-sm text-muted-foreground leading-relaxed">{t.counselor.pendingDesc}</p>
              </div>
              <div className="rounded-2xl bg-muted/60 px-5 py-4 text-xs font-semibold text-muted-foreground leading-relaxed text-start">
                {t.counselor.keepRecoveryHint}
              </div>
              <Button
                className="w-full gradient-primary text-white font-black rounded-xl h-12"
                onClick={() => {
                  setUser({ id: "", role: "COUNSELOR", fullName, email, verified: false });
                  setView("counselor-login");
                }}
              >
                {t.counselor.loginTitle}
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={embedded ? "max-w-2xl mx-auto" : "max-w-2xl mx-auto px-4 py-12 md:py-14"}>
      {!embedded && <BackButton />}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-7">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <HeartHandshake className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl md:text-3xl font-black">{t.counselor.registerTitle}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-lg mx-auto">{t.counselor.registerDesc}</p>
        </div>

        <Card>
          <CardContent className="p-6 sm:p-8 space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="font-bold">{t.counselor.fullName} *</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="rounded-xl bg-card" />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold">{t.counselor.email} *</Label>
                <Input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-xl bg-card" />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="font-bold">{t.client.passwordLabel} *</Label>
                <Input
                  type="password"
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-xl bg-card"
                />
                <p className="text-[11px] text-muted-foreground font-semibold">{t.client.passwordHint}</p>
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold">{t.client.recoveryPhraseLabel} *</Label>
                <Input
                  value={recoveryPhrase}
                  onChange={(e) => setRecoveryPhrase(e.target.value)}
                  className="rounded-xl bg-card"
                  dir="auto"
                />
                <p className="text-[11px] text-muted-foreground font-semibold">{t.counselor.recoveryHint}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-bold">{t.counselor.specialtiesLabel} *</Label>
              <div className="flex flex-wrap gap-2">
                {SPECIALTIES.map((s) => (
                  <label
                    key={s}
                    className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-bold transition-all flex items-center gap-2 ${
                      specialties.includes(s)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <Checkbox checked={specialties.includes(s)} onCheckedChange={() => toggle(specialties, setSpecialties, s)} className="sr-only" />
                    {specialties.includes(s) && <Check className="h-3 w-3" />}
                    {t.client.specialties[s]}
                  </label>
                ))}
              </div>

              {/* تخصصات خاصة — يكتبها الأخصائي بنفسه إن لم تجدها في القائمة */}
              <div className="space-y-1.5 pt-1">
                <Label className="text-xs font-bold text-muted-foreground">{t.counselor.customSpecialtiesLabel}</Label>
                {customSpecialties.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {customSpecialties.map((cs) => (
                      <Badge key={cs} variant="secondary" className="text-[11px] font-semibold gap-1">
                        {cs}
                        <button
                          type="button"
                          onClick={() => setCustomSpecialties(customSpecialties.filter((x) => x !== cs))}
                          className="text-destructive hover:text-destructive/80"
                          aria-label={t.common.delete}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustom();
                      }
                    }}
                    placeholder={t.counselor.customSpecialtiesPlaceholder}
                    className="rounded-xl bg-card"
                    maxLength={50}
                  />
                  <Button type="button" variant="outline" size="sm" className="rounded-xl font-bold shrink-0" disabled={!customInput.trim() || customSpecialties.length >= 8} onClick={addCustom}>
                    <Check className="h-4 w-4" />
                    {t.common.add}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground font-semibold">{t.counselor.customSpecialtiesHint}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-bold">{t.counselor.languagesLabel} *</Label>
              <div className="flex gap-2">
                {(["ar", "fr", "en"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => toggle(languages, setLanguages, l)}
                    className={`rounded-full border px-4 py-1.5 text-xs font-bold transition-all ${
                      languages.includes(l) ? "border-primary bg-primary/10 text-primary" : "border-border"
                    }`}
                  >
                    {l === "ar" ? "العربية" : l === "fr" ? "Français" : "English"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="font-bold">{t.counselor.bioLabel}</Label>
              <Textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder={t.counselor.bioPlaceholder} className="rounded-xl min-h-24" />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="font-bold">{t.counselor.yearsLabel}</Label>
                <Input type="number" min="0" dir="ltr" value={years} onChange={(e) => setYears(e.target.value)} placeholder="0" className="rounded-xl bg-card" />
              </div>
              {/* v1.0.0 (طمأنينة): سعر الجلسة — يتقاضاه الأخصائي من كل عميل بعد خصم عمولة المنصة */}
              {/* v1.3.0: سعر لكل عملة — الدينار إلزامي والبقية مهيّأة مسبقاً */}
              <div className="space-y-1.5">
                <Label className="font-bold">{t.counselor.sessionPriceLabel} *</Label>
                <div className="grid grid-cols-3 gap-2">
                  {CURRENCY_CODES.map((c) => (
                    <div key={c} className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={CURRENCIES[c].min}
                          max={CURRENCIES[c].max}
                          step={c === "DZD" ? "50" : "1"}
                          dir="ltr"
                          value={sessionPrices[c]}
                          onChange={(e) => setSessionPrices({ ...sessionPrices, [c]: e.target.value })}
                          className="rounded-xl bg-card"
                        />
                        <span className="font-black text-primary text-xs shrink-0" dir="ltr">{c}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground font-semibold">{t.counselor.sessionPriceHint}</p>
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold">{t.counselor.whatsappLabel} *</Label>
                <Input
                  type="tel"
                  dir="ltr"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="0555123456"
                  className="rounded-xl bg-card font-mono"
                />
                <p className="text-[11px] text-muted-foreground font-semibold">{t.counselor.whatsappHint}</p>
              </div>
            </div>

            {/* v1.17.0: العيادة التابع لها — اختيارية؛ عند اختيارها يظهر الأخصائي
                في صفحة تلك العيادة ضمن قائمة أخصائييها بكل تفاصيله */}
            <div className="space-y-1.5">
              <Label className="font-bold flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-primary" />
                {t.counselor.clinicAffil}
              </Label>
              <Select value={clinicId} onValueChange={setClinicId} dir={lang === "ar" ? "rtl" : "ltr"}>
                <SelectTrigger className="rounded-xl bg-card font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="none">{t.counselor.clinicAffilNone}</SelectItem>
                  {clinics.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground font-semibold">{t.counselor.clinicAffilHint}</p>
            </div>

            {/* الصورة الشخصية — اختيارية: تظهر للعميل في دليل الأخصائيين */}
            <div className="space-y-2">
              <Label className="font-bold">{t.counselor.photoLabel}</Label>
              <input
                ref={photoRef}
                type="file"
                accept="image/*,.heic,.heif"
                className="hidden"
                onChange={(e) => {
                  void pickPhoto(e.target.files?.[0] || null);
                }}
              />
              <div className="flex items-center gap-4">
                {photo ? (
                  <div className="relative shrink-0">
                    <img
                      src={photo}
                      alt={t.counselor.photoLabel}
                      className="h-20 w-20 rounded-2xl object-cover border-2 border-primary/40"
                    />
                    <button
                      type="button"
                      onClick={() => { setPhoto(null); if (photoRef.current) photoRef.current.value = ""; }}
                      className="absolute -top-2 -end-2 h-7 w-7 rounded-full bg-destructive text-white flex items-center justify-center shadow hover:bg-destructive/90 transition-colors"
                      aria-label={t.common.delete}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="h-20 w-20 rounded-2xl bg-muted/60 border-2 border-dashed border-border flex items-center justify-center shrink-0">
                    <UserRound className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                )}
                <div className="space-y-1.5 min-w-0">
                  <Button type="button" variant="outline" size="sm" className="rounded-lg font-bold" onClick={() => photoRef.current?.click()}>
                    <ImagePlus className="h-4 w-4" />
                    {photo ? t.settings.photoChange : t.counselor.photoUploadBtn}
                  </Button>
                  <p className="text-[11px] text-muted-foreground font-semibold leading-relaxed">{t.counselor.photoHint}</p>
                </div>
              </div>
            </div>

            {/* صورة الشهادة — تتحقق منها الإدارة بصرياً */}
            <div className="space-y-2">
              <Label className="font-bold">{t.counselor.diplomaImageLabel} *</Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.heic,.heif"
                className="hidden"
                onChange={(e) => {
                  void pickDiploma(e.target.files?.[0] || null);
                }}
              />
              {diplomaImage ? (
                <div className="rounded-xl border border-border overflow-hidden space-y-2">
                  <img src={diplomaImage} alt={t.counselor.diplomaImageLabel} className="w-full max-h-52 object-contain bg-muted/40" />
                  <div className="flex items-center justify-between px-3 py-2 bg-card">
                    <span className="text-xs font-semibold text-muted-foreground truncate max-w-[70%]" dir="ltr">{diplomaName}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive font-bold h-8"
                      onClick={() => { setDiplomaImage(null); setDiplomaName(""); if (fileRef.current) fileRef.current.value = ""; }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t.common.delete}
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full rounded-xl border-2 border-dashed border-border hover:border-primary/50 p-6 flex flex-col items-center gap-2 text-muted-foreground hover:text-primary transition-all"
                >
                  <ImagePlus className="h-7 w-7" />
                  <span className="text-sm font-bold">{t.counselor.diplomaUploadBtn}</span>
                  <span className="text-[11px] font-semibold">{t.counselor.diplomaUploadHint}</span>
                </button>
              )}
            </div>

            {error && (
              <div className="rounded-xl bg-destructive/10 text-destructive text-sm font-bold px-4 py-3">{error}</div>
            )}

            <Button className="w-full gradient-primary text-white font-black rounded-xl h-12" disabled={busy} onClick={submit}>
              {busy ? t.common.loading : t.counselor.registerSubmit}
            </Button>

            <div className="text-center space-y-2">
              <Badge variant="secondary" className="text-[11px]">
                {t.info.value2}
              </Badge>
              <div>
                <Button variant="link" className="text-primary font-bold text-sm h-auto p-0" onClick={() => setView("counselor-login")}>
                  {t.counselor.loginTitle} ←
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
