"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Building2, SearchX, ChevronLeft, ChevronRight, MapPin, CalendarCheck2, Star, SlidersHorizontal, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { WILAYA_LIST, SPECIALTIES, type SpecialtyKey } from "@/lib/constants";
import { LogoMark } from "@/lib/logo";
import { WhatsAppGlyph } from "@/components/session/whatsapp-panel";
import { waLink } from "@/lib/whatsapp";
import { fmtApproxFromDzd } from "@/lib/money";
import { openClinicRatings } from "@/components/shared/clinic-ratings-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BackButton } from "@/components/shared/back-button";
import { FloatingAdPopup } from "@/components/shared/floating-ad";
import { FacebookGlyph, InstagramGlyph, TikTokGlyph } from "@/components/shared/social-glyphs";

/* ═ v1.14.0 — دليل العيادات النفسية ═
   صفحة عامة تشبه دليل الأخصائيين: بطاقات العيادات النشطة (شعارها،
   تخصصاتها، ولايتها/مدينتها، سنوات خبرتها المحسوبة من سنة الإنشاء،
   تقييمها) مع فلاتر (ولاية/مدينة/تخصص/خبرة/بحث) — «عرض العيادة»
   يفتح صفحتها الكاملة فيها الحجز الحضوري والتقييم وواتساب. */

export interface ClinicCard {
  id: string;
  name: string;
  slug: string | null;
  foundedYear: number | null;
  yearsExperience: number;
  specialties: string[];
  customSpecialties: string[];
  wilaya: string | null;
  city: string | null;
  address: string | null;
  phones: string[];
  whatsapp: string | null;
  website: string | null;
  socials: { facebook?: string | null; instagram?: string | null; tiktok?: string | null };
  about: string | null;
  workingHours: string | null;
  priceNote: string | null;
  rating: number;
  ratingsCount: number;
  bookingsCount: number;
  logoUrl: string;
  hasLogo: boolean;
  /* v1.16.0: سعر الجلسة الحضورية + باقات الجلسات (Packs) */
  sessionPrice: number | null;
  packs: { name: string; sessions: number; price: number; note: string | null }[];
}

export function openClinicPage(slug: string | null, id: string, autoBook = false) {
  const st = useApp.getState();
  if (autoBook) {
    try {
      sessionStorage.setItem("tumaanina-clinic-book", "1");
    } catch {
      /* تجاهل */
    }
  }
  st.setActiveClinic(slug || id);
  st.setView("clinic-page");
}

export function ClinicsDirectoryView() {
  const { t, lang } = useI18n();
  const { setView, currency } = useApp();
  const [clinics, setClinics] = useState<ClinicCard[]>([]);
  const [loading, setLoading] = useState(true);
  /* v1.15.0: ترقيم الصفحات من الخادم — تُحمَّل 8 عيادات فقط لكل صفحة */
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  /* الفلاتر */
  const [fWilaya, setFWilaya] = useState("all");
  const [fCity, setFCity] = useState("");
  const [fSpecialty, setFSpecialty] = useState("all");
  const [fMinYears, setFMinYears] = useState("0");
  const [fQuery, setFQuery] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      if (fWilaya !== "all") params.set("wilaya", fWilaya);
      if (fCity.trim()) params.set("city", fCity.trim());
      if (fSpecialty !== "all") params.set("specialty", fSpecialty);
      if (Number(fMinYears) > 0) params.set("minYears", fMinYears);
      if (fQuery.trim()) params.set("q", fQuery.trim());
      const res = await fetch(`/api/clinics?${params.toString()}`);
      const data = await res.json();
      setClinics(data.clinics || []);
      setPages(data.pages || 1);
      setTotal(data.total || 0);
    } catch {
      setClinics([]);
      setPages(1);
    } finally {
      setLoading(false);
    }
  }, [fWilaya, fCity, fSpecialty, fMinYears, fQuery, page]);

  useEffect(() => {
    const timer = setTimeout(() => load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  const safePage = Math.min(page, pages);
  const visible = clinics;

  const gridRef = useRef<HTMLDivElement>(null);
  const firstPage = useRef(true);
  useEffect(() => {
    if (firstPage.current) {
      firstPage.current = false;
      return;
    }
    requestAnimationFrame(() => gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [safePage]);

  const Arrow = lang === "ar" ? ChevronLeft : ChevronRight;
  const ArrowBack = lang === "ar" ? ChevronRight : ChevronLeft;
  const activeFilters = fWilaya !== "all" || fCity.trim() || fSpecialty !== "all" || Number(fMinYears) > 0 || fQuery.trim();

  const resetFilters = () => {
    setFWilaya("all");
    setFCity("");
    setFSpecialty("all");
    setFMinYears("0");
    setFQuery("");
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 md:py-14">
      {/* v1.16.0: نافذة الإعلان العائم — انتقلت من الصفحة الرئيسية إلى داخل صفحة العيادات
          (طلب المستخدم): مدة 20 ثانية + إغلاق يدوي + «لا تظهر مجدداً» */}
      <FloatingAdPopup />
      <BackButton />
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-2 mb-6">
        <div className="flex items-center gap-3">
          {/* v1.15.1: شعار المنصة (زهرة اللوتس) في رأس الدليل — كان غائباً */}
          <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <LogoMark size={34} />
          </div>
          <h1 className="text-2xl md:text-3xl font-black">{t.clinics.dirTitle}</h1>
        </div>
        <p className="text-muted-foreground">{t.clinics.dirDesc}</p>
      </motion.div>

      {/* شريط الفلاتر */}
      <div className="mb-6 space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className={`rounded-xl font-bold gap-2 ${showFilters ? "border-primary/50 text-primary" : ""}`} onClick={() => setShowFilters((v) => !v)}>
            <SlidersHorizontal className="h-4 w-4" />
            {t.clinics.filters}
            {activeFilters ? <span className="h-2 w-2 rounded-full bg-primary shrink-0" /> : null}
          </Button>
          {activeFilters ? (
            <Button variant="ghost" size="sm" className="rounded-xl font-bold text-muted-foreground gap-1.5" onClick={resetFilters}>
              <X className="h-3.5 w-3.5" />
              {t.clinics.clearFilters}
            </Button>
          ) : null}
        </div>
        {showFilters ? (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-2.5 overflow-hidden">
            {/* v1.16.0: الفلاتر الثلاثة في سطر واحد أفقي دائماً (حتى الهاتف)
                — كانت تتكدس عمودياً فتطيل الصفحة (طلب المستخدم) */}
            <div className="grid grid-cols-3 gap-2">
              <Select value={fWilaya} onValueChange={(v) => { setFWilaya(v); setPage(1); }}>
                <SelectTrigger className="rounded-xl bg-card font-semibold text-xs sm:text-sm px-2.5"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="all">{t.clinics.allWilayas}</SelectItem>
                  {WILAYA_LIST.map((w) => (
                    <SelectItem key={w.key} value={w.key}>{lang === "ar" ? w.ar : lang === "fr" ? w.fr : w.en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={fSpecialty} onValueChange={(v) => { setFSpecialty(v); setPage(1); }}>
                <SelectTrigger className="rounded-xl bg-card font-semibold text-xs sm:text-sm px-2.5"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="all">{t.clinics.allSpecialties}</SelectItem>
                  {SPECIALTIES.map((s) => (
                    <SelectItem key={s} value={s}>{t.client.specialties[s as SpecialtyKey]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={fMinYears} onValueChange={(v) => { setFMinYears(v); setPage(1); }}>
                <SelectTrigger className="rounded-xl bg-card font-semibold text-xs sm:text-sm px-2.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">{t.clinics.anyExperience}</SelectItem>
                  {["3", "5", "10", "15", "20"].map((y) => (
                    <SelectItem key={y} value={y}>{t.clinics.minYears.replace("{n}", y)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* البحث والمدينة في سطر ثانٍ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input placeholder={t.clinics.cityPlaceholder} value={fCity} onChange={(e) => { setFCity(e.target.value); setPage(1); }} className="rounded-xl bg-card font-semibold" />
              <Input placeholder={t.clinics.searchPlaceholder} value={fQuery} onChange={(e) => { setFQuery(e.target.value); setPage(1); }} className="rounded-xl bg-card font-semibold" />
            </div>
          </motion.div>
        ) : null}
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="h-48 animate-pulse bg-muted/50 border-border/50" />
          ))}
        </div>
      ) : clinics.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center space-y-3 text-muted-foreground">
            <SearchX className="h-10 w-10 mx-auto opacity-40" />
            <p className="font-semibold">{activeFilters ? t.clinics.emptyFiltered : t.clinics.dirEmpty}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div ref={gridRef} className="grid sm:grid-cols-2 gap-4 scroll-mt-24">
            {visible.map((c, i) => (
              <motion.div key={c.id} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                <Card className="h-full transition-all hover:shadow-lg border-primary/20 border-border/70">
                  <CardContent className="p-5 space-y-3.5">
                    <div className="flex items-start gap-4">
                      <Avatar className="h-20 w-20 rounded-2xl shrink-0 border border-border/60 bg-card">
                        {c.hasLogo ? (
                          <AvatarImage src={c.logoUrl} alt={c.name} loading="lazy" className="rounded-2xl object-contain p-1.5" />
                        ) : null}
                        <AvatarFallback className="gradient-primary text-white rounded-2xl font-black text-2xl">
                          {c.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0 space-y-1">
                        <span className="font-black leading-tight block">{c.name}</span>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground font-semibold">
                          {c.wilaya ? (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {(() => {
                                const w = WILAYA_LIST.find((x) => x.key === c.wilaya);
                                return w ? (lang === "ar" ? w.ar : lang === "fr" ? w.fr : w.en) : c.wilaya;
                              })()}{c.city ? ` · ${c.city}` : ""}
                            </span>
                          ) : null}
                          {c.yearsExperience > 0 ? (
                            <span>{c.yearsExperience} {t.clinics.yearsExp}</span>
                          ) : null}
                          <span>{c.bookingsCount} {t.clinics.bookingsDone}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-black text-xs" dir="ltr">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                          {c.rating.toFixed(1)}
                          <span className="text-muted-foreground font-semibold">({c.ratingsCount})</span>
                        </div>
                        {/* v1.16.0: سعر الجلسة الحضورية يظهر في البطاقة مباشرة */}
                        {c.sessionPrice !== null && c.sessionPrice > 0 ? (
                          <div className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/25 px-2 py-0.5 text-[11px] font-black text-primary w-fit" dir="ltr">
                            {c.sessionPrice.toLocaleString("en-US")} DZD
                            <span className="text-[10px] font-bold text-muted-foreground">/ {t.clinics.sessionShort}</span>
                            {/* v1.17.0: تقدير تقريبي بعملة العرض إن لم تكن الدينار */}
                            {currency !== "DZD" ? (
                              <span className="text-[10px] font-bold text-muted-foreground">{fmtApproxFromDzd(c.sessionPrice, currency, lang)}</span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {c.about ? <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{c.about}</p> : null}

                    {(() => {
                      const so = c.socials;
                      if (!so || (!so.facebook && !so.instagram && !so.tiktok)) return null;
                      return (
                        <div className="flex items-center gap-2">
                          {so.facebook ? (
                            <a href={so.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" title="Facebook" className="h-8 w-8 rounded-lg bg-[#1877F2]/10 hover:bg-[#1877F2]/20 text-[#1877F2] flex items-center justify-center transition-all">
                              <FacebookGlyph className="h-4 w-4" />
                            </a>
                          ) : null}
                          {so.instagram ? (
                            <a href={so.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" title="Instagram" className="h-8 w-8 rounded-lg bg-[#E4405F]/10 hover:bg-[#E4405F]/20 text-[#E4405F] flex items-center justify-center transition-all">
                              <InstagramGlyph className="h-4 w-4" />
                            </a>
                          ) : null}
                          {so.tiktok ? (
                            <a href={so.tiktok} target="_blank" rel="noopener noreferrer" aria-label="TikTok" title="TikTok" className="h-8 w-8 rounded-lg bg-foreground/10 hover:bg-foreground/20 text-foreground flex items-center justify-center transition-all">
                              <TikTokGlyph className="h-4 w-4" />
                            </a>
                          ) : null}
                        </div>
                      );
                    })()}

                    <div className="flex flex-wrap gap-1.5">
                      {c.specialties.slice(0, 3).map((s) => (
                        <Badge key={s} variant="secondary" className="text-[11px] font-semibold">
                          {t.client.specialties[s as SpecialtyKey] ?? s}
                        </Badge>
                      ))}
                      {c.customSpecialties.slice(0, 2).map((cs) => (
                        <Badge key={`c-${cs}`} variant="secondary" className="text-[11px] font-semibold">{cs}</Badge>
                      ))}
                      {c.specialties.length + c.customSpecialties.length > 5 ? (
                        <Badge variant="secondary" className="text-[11px] font-semibold text-muted-foreground">+{c.specialties.length + c.customSpecialties.length - 5}</Badge>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      {(() => {
                        const wa = waLink(c.whatsapp, t.clinics.waIntro.replace("{clinic}", c.name));
                        if (!wa) return null;
                        return (
                          <a href={wa} target="_blank" rel="noopener noreferrer" title={t.clinics.waBtn} aria-label={t.clinics.waBtn} className="flex items-center justify-center rounded-lg bg-[#25D366] hover:bg-[#1fb857] text-white px-3 py-2 text-xs font-black shadow-sm transition-all">
                            <WhatsAppGlyph className="h-4 w-4" />
                          </a>
                        );
                      })()}
                      {/* v1.15.0: زر التقييمات — نافذة تقييمات العيادة بنمط الأخصائيين */}
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg font-bold border-amber-400/50 text-amber-600 dark:text-amber-400 gap-1.5 shrink-0"
                        title={t.clinics.ratingsBtn}
                        onClick={() => openClinicRatings(c.id, c.name)}
                      >
                        <Star className="h-4 w-4" />
                        <span className="hidden sm:inline">{t.clinics.ratingsBtn}</span>
                      </Button>
                      <Button size="sm" className="gradient-primary text-white font-bold rounded-lg flex-1 justify-center" onClick={() => openClinicPage(c.slug, c.id)}>
                        <Building2 className="h-4 w-4" />
                        {t.clinics.viewClinic}
                      </Button>
                    </div>
                    {/* v1.15.0: زر «احجز الآن جلسة حضورية» بجانب زر عرض العيادة */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full rounded-lg font-black border-primary/50 text-primary justify-center gap-1.5"
                      onClick={() => openClinicPage(c.slug, c.id, true)}
                    >
                      <CalendarCheck2 className="h-4 w-4" />
                      {t.clinics.bookNow}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {pages > 1 ? (
            <div className="flex items-center justify-center gap-3 mt-8">
              <Button variant="outline" size="sm" className="rounded-lg font-bold" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
                <ArrowBack className="h-4 w-4" />
                {t.directory.prev}
              </Button>
              <span className="text-xs font-bold text-muted-foreground font-mono px-2">{t.directory.pageInfo.replace("{p}", String(safePage)).replace("{n}", String(pages))}</span>
              <Button variant="outline" size="sm" className="rounded-lg font-bold" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)}>
                {t.directory.next}
                <Arrow className="h-4 w-4" />
              </Button>
            </div>
          ) : null}

          {/* دعوة تسجيل عيادة — التسجيل متاح من الدليل مباشرة */}
          <div className="mt-10 rounded-2xl border border-primary/25 bg-primary/5 p-5 flex flex-col sm:flex-row items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <Building2 className="h-5.5 w-5.5 text-primary" />
            </div>
            <p className="text-sm font-bold text-muted-foreground flex-1 text-center sm:text-start leading-relaxed">{t.clinics.registerInvite}</p>
            <Button variant="outline" className="rounded-xl font-black border-primary/50 text-primary shrink-0" onClick={() => setView("clinic-auth")}>
              <CalendarCheck2 className="h-4 w-4" />
              {t.clinics.registerCta}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
