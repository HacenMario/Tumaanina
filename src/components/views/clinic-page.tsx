"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Building2, MapPin, Phone, Globe, Clock, Wallet, FileCheck2, Star, CalendarClock,
  BadgeCheck, MessageSquareHeart, Send, Loader2, LogIn, Users, Info, Images, Navigation, X,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { WILAYA_LIST, SLOT_TIMES, SPECIALTIES, type SpecialtyKey } from "@/lib/constants";
import { WhatsAppGlyph } from "@/components/session/whatsapp-panel";
import { waLink, formatWhatsapp } from "@/lib/whatsapp";
import { openClinicRatings } from "@/components/shared/clinic-ratings-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { BackButton } from "@/components/shared/back-button";
import { formatDateTime } from "@/lib/utils";
import { FacebookGlyph, InstagramGlyph, TikTokGlyph } from "@/components/shared/social-glyphs";
import { showAppToast } from "@/components/shared/app-toast";
import { openClinicPage } from "./clinics-directory";

/* ═ v1.14.0 — صفحة العيادة العامة ═
   كل ما أدخلته العيادة في لوحتها يظهر هنا: الشعار، الاسم، سنة الإنشاء
   وسنوات الخبرة المحسوبة منها، التخصصات، النبذة، العنوان الكامل،
   ساعات العمل، ملاحظة الأسعار، أرقام الاتصال، واتساب، الموقع،
   السوشيال، التقييمات (عرض + إضافة لمن حجز)، والحجز الحضوري:
   تاريخ (اليوم→+60) + ساعة من SLOT_TIMES + اسم وهاتف وسبب. */

interface ClinicProfile {
  id: string;
  name: string;
  slug: string | null;
  foundedYear: number | null;
  yearsExperience: number | null;
  specialties: string[];
  customSpecialties: string[];
  about: string | null;
  wilaya: string | null;
  city: string | null;
  address: string | null;
  phones: string[];
  whatsapp: string | null;
  contactEmail: string | null;
  website: string | null;
  socials: { facebook?: string | null; instagram?: string | null; tiktok?: string | null };
  logoUrl: string;
  hasLogo: boolean;
  workingHours: string | null;
  priceNote: string | null;
  licenseNumber: string | null;
  rating: number;
  ratingsCount: number;
  bookingsCount: number;
  /* v1.15.0: مواعيد العيادة + المعرض + الموقع على الخريطة */
  slots: string[];
  galleryCount: number;
  location: { lat: number | null; lng: number | null };
  /* v1.16.0: سعر الجلسة الحضورية + باقات الجلسات (Packs) */
  sessionPrice: number | null;
  packs: { name: string; sessions: number; price: number; note: string | null }[];
}

interface ReviewItem {
  id: string;
  stars: number;
  comment: string | null;
  clientName: string;
  createdAt: string;
}

function localDateStr2(offsetDays = 0): string {
  const d = new Date(Date.now() + 60 * 60 * 1000 + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}

function Stars({ n, size = "h-4 w-4" }: { n: number; size?: string }) {
  return (
    <span className="flex items-center gap-0.5" dir="ltr" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} className={`${size} ${s <= Math.round(n) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
      ))}
    </span>
  );
}

export function ClinicPageView() {
  const { t, lang } = useI18n();
  const { user, activeClinicSlug, setView } = useApp();
  const [clinic, setClinic] = useState<ClinicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  /* التقييمات */
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [revTotal, setRevTotal] = useState(0);
  const [revPage, setRevPage] = useState(1);
  const [revPages, setRevPages] = useState(1);
  const [myStars, setMyStars] = useState(0);
  const [myComment, setMyComment] = useState("");
  const [ratingBusy, setRatingBusy] = useState(false);
  const [myRatingSent, setMyRatingSent] = useState(false);

  /* الحجز */
  const [bookOpen, setBookOpen] = useState(false);
  const [bDate, setBDate] = useState(localDateStr2());
  const [bSlot, setBSlot] = useState("");
  const [bTaken, setBTaken] = useState<string[]>([]);
  const [bName, setBName] = useState("");
  const [bPhone, setBPhone] = useState("");
  const [bReason, setBReason] = useState("");
  const [bBusy, setBBusy] = useState(false);
  const [bError, setBError] = useState("");

  /* v1.15.0: معرض الصور — يُجلب عند فتح النافذة */
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const loadClinic = useCallback(async () => {
    if (!activeClinicSlug) {
      setMissing(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setMissing(false);
    try {
      const res = await fetch(`/api/clinics/${encodeURIComponent(activeClinicSlug)}`);
      if (!res.ok) {
        setMissing(true);
        setClinic(null);
        return;
      }
      const data = await res.json();
      setClinic(data.clinic || null);
    } catch {
      setMissing(true);
    } finally {
      setLoading(false);
    }
  }, [activeClinicSlug]);

  const loadReviews = useCallback(async (page = 1) => {
    if (!activeClinicSlug) return;
    try {
      const res = await fetch(`/api/clinics/${encodeURIComponent(activeClinicSlug)}/reviews?page=${page}`);
      if (!res.ok) return;
      const data = await res.json();
      setReviews(data.reviews || []);
      setRevTotal(data.total || 0);
      setRevPages(data.pages || 1);
      setRevPage(page);
    } catch {
      /* تجاهل */
    }
  }, [activeClinicSlug]);

  useEffect(() => {
    loadClinic();
    loadReviews(1);
  }, [loadClinic, loadReviews]);

  /* v1.15.0: «احجز الآن» من بطاقة العيادة بالدليل يفتح نافذة الحجز فور وصول الملف
     v1.16.0: استعادة مسودة الحجز المحفوظة قبل التسجيل (تدفق: حجز → إنشاء حساب
     → دخول تلقائي → العودة لنفس النافذة بكل البيانات المدخلة محفوظة) */
  useEffect(() => {
    try {
      const draftRaw = sessionStorage.getItem("tumaanina-clinic-booking-draft");
      const wantsBook = sessionStorage.getItem("tumaanina-clinic-book") === "1" || !!draftRaw;
      if (clinic && wantsBook) {
        sessionStorage.removeItem("tumaanina-clinic-book");
        if (draftRaw) {
          sessionStorage.removeItem("tumaanina-clinic-booking-draft");
          const d = JSON.parse(draftRaw) as { clinicKey?: string; date?: string; slot?: string; name?: string; phone?: string; reason?: string };
          /* تُستعاد المسودة فقط إن كانت لنفس العيادة المعروضة */
          if (!d.clinicKey || d.clinicKey === activeClinicSlug) {
            if (d.date && /^\d{4}-\d{2}-\d{2}$/.test(d.date)) setBDate(d.date);
            if (d.slot) setBSlot(d.slot);
            if (d.name) setBName(d.name);
            if (d.phone) setBPhone(d.phone);
            if (d.reason) setBReason(d.reason);
          }
        } else {
          /* عميل مسجّل: نملأ مسبقاً بما نعرفه عنه */
          if (user?.pseudonym && !bName) setBName(user.pseudonym);
          if (user?.phone && !bPhone) setBPhone(user.phone);
        }
        setBookOpen(true);
      }
    } catch {
      /* تجاهل */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic]);

  /* مواعيد الحجز: مواعيد العيادة نفسها إن عرّفت — وإلا الافتراضية */
  const bookingSlots = clinic?.slots?.length ? clinic.slots : SLOT_TIMES;

  const openGallery = async () => {
    setGalleryOpen(true);
    setGalleryLoading(true);
    try {
      const res = await fetch(`/api/clinics/${clinic?.id}/gallery`);
      const data = await res.json();
      setGalleryImages(data.images || []);
    } catch {
      setGalleryImages([]);
    } finally {
      setGalleryLoading(false);
    }
  };

  /* ساعات اليوم المختار المحجوزة */
  useEffect(() => {
    if (!bookOpen || !clinic) return;
    setBSlot("");
    fetch(`/api/clinics/${clinic.id}/book?date=${bDate}`)
      .then((r) => (r.ok ? r.json() : { taken: [] }))
      .then((d) => setBTaken(d.taken || []))
      .catch(() => setBTaken([]));
  }, [bookOpen, bDate, clinic]);

  const wilayaLabel = (w: string | null) => {
    if (!w) return "";
    const rec = WILAYA_LIST.find((x) => x.key === w);
    return rec ? (lang === "ar" ? rec.ar : lang === "fr" ? rec.fr : rec.en) : w;
  };

  /* v1.15.0: زر الموقع على الخريطة — v1.16.0: رابط <a> حقيقي يعمل دائماً
     في كل المتصفحات (بدل window.open القابل للحجب)، بالإحداثيات إن وُجدت
     وإلا بالعنوان النصي في Google Maps */
  const mapsHref = (() => {
    const loc = clinic?.location;
    const hasCoords = loc?.lat != null && loc?.lng != null;
    const addr = [clinic?.address, clinic?.city, wilayaLabel(clinic?.wilaya ?? null)].filter(Boolean).join("، ");
    const query = hasCoords ? `${loc!.lat},${loc!.lng}` : addr;
    if (!query) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  })();

  const submitRating = async () => {
    if (!user) {
      setView("client-start");
      return;
    }
    if (!myStars) return;
    setRatingBusy(true);
    try {
      const res = await fetch(`/api/clinics/${clinic?.id}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, stars: myStars, comment: myComment.trim() || undefined }),
      });
      const data = await res.json();
      if (data.ok) {
        setMyRatingSent(true);
        setClinic((c) => (c ? { ...c, rating: data.rating, ratingsCount: data.ratingsCount } : c));
        loadReviews(1);
        showAppToast(t.clinics.ratingThanks, t.clinics.ratingThanksSub);
      } else if (data.error === "BOOKING_REQUIRED") {
        showAppToast(t.clinics.ratingNeedBooking, t.clinics.ratingNeedBookingSub);
      }
    } finally {
      setRatingBusy(false);
    }
  };

  const submitBooking = async () => {
    if (!user) {
      /* v1.16.0: غير مسجّل — نحفظ كل ما أدخله (التاريخ/الساعة/الاسم/الهاتف/السبب)
          + مفتاح العيادة، ثم نوجهه لإنشاء الحساب؛ بعد التسجيل يعود تلقائياً
          لنفس نافذة الحجز بنفس البيانات (يضغط تأكيد فقط) */
      try {
        sessionStorage.setItem(
          "tumaanina-clinic-booking-draft",
          JSON.stringify({ clinicKey: activeClinicSlug, date: bDate, slot: bSlot, name: bName.trim(), phone: bPhone.trim(), reason: bReason.trim() })
        );
      } catch {
        /* تجاهل */
      }
      setView("client-start");
      return;
    }
    if (!bSlot) {
      setBError(t.clinics.pickSlot);
      return;
    }
    if (!bName.trim() || bPhone.replace(/\D/g, "").length < 7) {
      setBError(t.clinics.bookingMissing);
      return;
    }
    setBError("");
    setBBusy(true);
    try {
      const res = await fetch(`/api/clinics/${clinic?.id}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, name: bName.trim(), phone: bPhone.replace(/\D/g, ""), date: bDate, slot: bSlot, reason: bReason.trim() || undefined }),
      });
      const data = await res.json();
      if (data.ok) {
        setBookOpen(false);
        setBReason("");
        showAppToast(t.clinics.bookingSent, t.clinics.bookingSentSub);
      } else if (data.error === "SLOT_TAKEN") {
        setBError(t.clinics.slotTaken);
        setBTaken((prev) => (prev.includes(bSlot) ? prev : [...prev, bSlot]));
      } else if (data.error === "SLOT_PAST") {
        /* v1.16.0: موعد فائت — منع الخادم الجديد */
        setBError(t.clinics.slotPast);
        setBTaken((prev) => (prev.includes(bSlot) ? prev : [...prev, bSlot]));
      } else if (data.error === "ALREADY_BOOKED") {
        /* v1.16.0: له حجزاً حياً بنفس العيادة */
        setBError(t.clinics.alreadyBooked);
      } else if (data.error === "BAD_DATE") {
        setBError(t.clinics.badDate);
      } else {
        setBError(t.common.errorServer);
      }
    } finally {
      setBBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Card className="h-64 animate-pulse bg-muted/50 border-border/50" />
      </div>
    );
  }

  if (missing || !clinic) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <Info className="h-12 w-12 mx-auto text-muted-foreground/40" />
        <h1 className="text-xl font-black">{t.clinics.notFound}</h1>
        <p className="text-sm text-muted-foreground">{t.clinics.notFoundDesc}</p>
        <Button className="gradient-primary text-white font-black rounded-xl" onClick={() => setView("clinics-directory")}>
          {t.clinics.backToDir}
        </Button>
      </div>
    );
  }

  const fullAddress = [clinic.address, clinic.city, wilayaLabel(clinic.wilaya)].filter(Boolean).join("، ");

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 md:py-14">
      <BackButton />

      {/* رأس الملف */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="border-primary/25 shadow-lg overflow-hidden">
          <CardContent className="p-6 sm:p-7 space-y-5">
            <div className="flex flex-col sm:flex-row items-start gap-5">
              <Avatar className="h-24 w-24 rounded-3xl shrink-0 border border-border/60 bg-card">
                {clinic.hasLogo ? <AvatarImage src={clinic.logoUrl} alt={clinic.name} className="rounded-3xl object-contain p-1.5" /> : null}
                <AvatarFallback className="gradient-primary text-white rounded-3xl font-black text-4xl">{clinic.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-black leading-tight">{clinic.name}</h1>
                  <Badge className="bg-primary/12 text-primary border-0 hover:bg-primary/12 gap-1">
                    <BadgeCheck className="h-3 w-3" />
                    {t.clinics.activeBadge}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground font-semibold">
                  {clinic.foundedYear ? (
                    <span>
                      {t.clinics.foundedIn} {clinic.foundedYear}
                      {clinic.yearsExperience ? ` · ${clinic.yearsExperience} ${t.clinics.yearsExp}` : ""}
                    </span>
                  ) : null}
                  <span>{clinic.bookingsCount} {t.clinics.bookingsDone}</span>
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-black" dir="ltr">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    {clinic.rating.toFixed(1)} <span className="text-muted-foreground font-semibold">({clinic.ratingsCount})</span>
                  </span>
                </div>
                {fullAddress ? (
                  <p className="text-sm font-bold flex items-start gap-1.5 leading-relaxed">
                    <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    {fullAddress}
                  </p>
                ) : null}
                {/* v1.16.0: سعر الجلسة الحضورية يظهر بوضوح في صفحة العيادة */}
                {clinic.sessionPrice !== null && clinic.sessionPrice > 0 ? (
                  <div className="inline-flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/25 px-3.5 py-2 w-fit" dir="ltr">
                    <Wallet className="h-4 w-4 text-primary" />
                    <span className="text-base font-black text-primary">{clinic.sessionPrice.toLocaleString("en-US")} DZD</span>
                    <span className="text-[11px] font-bold text-muted-foreground">/ {t.clinics.sessionShort}</span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* التخصصات */}
            {clinic.specialties.length || clinic.customSpecialties.length ? (
              <div className="flex flex-wrap gap-1.5">
                {clinic.specialties.map((s) => (
                  <Badge key={s} variant="secondary" className="font-semibold">{t.client.specialties[s as SpecialtyKey] ?? s}</Badge>
                ))}
                {clinic.customSpecialties.map((cs) => (
                  <Badge key={`c-${cs}`} variant="secondary" className="font-semibold">{cs}</Badge>
                ))}
              </div>
            ) : null}

            {/* v1.16.0: باقات الجلسات الحضورية (Packs) — يصوغها صاحب العيادة بحرية */}
            {clinic.packs && clinic.packs.length > 0 ? (
              <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 space-y-2.5">
                <p className="text-sm font-black flex items-center gap-1.5 text-primary">
                  <Wallet className="h-4 w-4" />
                  {t.clinics.packsTitle}
                </p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {clinic.packs.map((p, i) => (
                    <div key={i} className="rounded-xl border border-border/70 bg-card px-3.5 py-2.5 space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-black text-sm">{p.name}</span>
                        <span className="text-sm font-black text-primary" dir="ltr">{p.price.toLocaleString("en-US")} DZD</span>
                      </div>
                      <p className="text-[11px] font-bold text-muted-foreground">
                        {t.clinics.packsSessions.replace("{n}", String(p.sessions))}
                        {p.note ? ` · ${p.note}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* النبذة */}
            {clinic.about ? <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{clinic.about}</p> : null}

            {/* تفاصيل العمل */}
            <div className="grid sm:grid-cols-2 gap-3">
              {clinic.workingHours ? (
                <div className="rounded-xl border border-border/70 bg-muted/30 px-3.5 py-3 flex items-start gap-2.5">
                  <Clock className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-muted-foreground">{t.clinics.workingHours}</p>
                    <p className="text-sm font-bold break-words">{clinic.workingHours}</p>
                  </div>
                </div>
              ) : null}
              {clinic.priceNote ? (
                <div className="rounded-xl border border-border/70 bg-muted/30 px-3.5 py-3 flex items-start gap-2.5">
                  <Wallet className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-muted-foreground">{t.clinics.priceNote}</p>
                    <p className="text-sm font-bold break-words">{clinic.priceNote}</p>
                  </div>
                </div>
              ) : null}
              {clinic.licenseNumber ? (
                <div className="rounded-xl border border-border/70 bg-muted/30 px-3.5 py-3 flex items-start gap-2.5">
                  <FileCheck2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-muted-foreground">{t.clinics.license}</p>
                    <p className="text-sm font-bold break-words" dir="ltr">{clinic.licenseNumber}</p>
                  </div>
                </div>
              ) : null}
              {clinic.website ? (
                <div className="rounded-xl border border-border/70 bg-muted/30 px-3.5 py-3 flex items-start gap-2.5">
                  <Globe className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-muted-foreground">{t.clinics.website}</p>
                    <a href={clinic.website} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-primary hover:underline break-all" dir="ltr">
                      {clinic.website.replace(/^https?:\/\//i, "")}
                    </a>
                  </div>
                </div>
              ) : null}
            </div>

            {/* الاتصال: هواتف + واتساب + بريد */}
            <div className="flex flex-wrap items-center gap-2">
              {clinic.phones.map((p) => (
                <a key={p} href={`tel:${p}`} className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary px-3.5 py-2 text-sm font-black transition-colors" dir="ltr">
                  <Phone className="h-4 w-4" />
                  {formatWhatsapp(p)}
                </a>
              ))}
              {(() => {
                const wa = waLink(clinic.whatsapp, t.clinics.waIntro.replace("{clinic}", clinic.name));
                if (!wa) return null;
                return (
                  <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-[#25D366] hover:bg-[#1fb857] text-white px-4 py-2 text-sm font-black shadow-sm transition-all">
                    <WhatsAppGlyph className="h-4 w-4" />
                    WhatsApp
                  </a>
                );
              })()}
              {clinic.contactEmail ? (
                <a href={`mailto:${clinic.contactEmail}`} className="inline-flex items-center gap-1.5 rounded-xl border border-border text-muted-foreground hover:text-primary px-3.5 py-2 text-xs font-bold transition-colors" dir="ltr">
                  {clinic.contactEmail}
                </a>
              ) : null}
              {(() => {
                const so = clinic.socials;
                if (!so || (!so.facebook && !so.instagram && !so.tiktok)) return null;
                return (
                  <div className="flex items-center gap-1.5">
                    {so.facebook ? (
                      <a href={so.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="h-9 w-9 rounded-lg bg-[#1877F2]/10 hover:bg-[#1877F2]/20 text-[#1877F2] flex items-center justify-center transition-all"><FacebookGlyph className="h-4 w-4" /></a>
                    ) : null}
                    {so.instagram ? (
                      <a href={so.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="h-9 w-9 rounded-lg bg-[#E4405F]/10 hover:bg-[#E4405F]/20 text-[#E4405F] flex items-center justify-center transition-all"><InstagramGlyph className="h-4 w-4" /></a>
                    ) : null}
                    {so.tiktok ? (
                      <a href={so.tiktok} target="_blank" rel="noopener noreferrer" aria-label="TikTok" className="h-9 w-9 rounded-lg bg-foreground/10 hover:bg-foreground/20 text-foreground flex items-center justify-center transition-all"><TikTokGlyph className="h-4 w-4" /></a>
                    ) : null}
                  </div>
                );
              })()}
            </div>

            {/* v1.15.0: أزرار المعرض والخريطة والتقييمات
                v1.16.0: زر الموقع رابط حقيقي يعمل دائماً — بالإحداثيات إن وُجدت
                وإلا بالعنوان النصي (كان window.open قابل الحجب ولا يعمل) */}
            <div className="flex flex-wrap items-center gap-2">
              {clinic.galleryCount > 0 ? (
                <Button size="sm" variant="outline" className="rounded-xl font-bold gap-1.5 border-primary/40 text-primary" onClick={() => void openGallery()}>
                  <Images className="h-4 w-4" />
                  {t.clinics.galleryBtn}
                  <span className="text-[10px] font-black text-muted-foreground">({clinic.galleryCount})</span>
                </Button>
              ) : null}
              {mapsHref ? (
                <a
                  href={mapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md border border-emerald-500/40 text-sm font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                >
                  <Navigation className="h-4 w-4" />
                  {t.clinics.mapBtn}
                </a>
              ) : null}
              <Button size="sm" variant="outline" className="rounded-xl font-bold gap-1.5 border-amber-400/50 text-amber-600 dark:text-amber-400" onClick={() => openClinicRatings(clinic.id, clinic.name)}>
                <Star className="h-4 w-4" />
                {t.clinics.ratingsBtn}
              </Button>
            </div>

            {/* زر الحجز الحضوري */}
            {(!user || user.role === "VICTIM") ? (
              <Button
                size="lg"
                className="w-full gradient-primary text-white font-black rounded-2xl h-12 shadow-lg shadow-primary/25"
                onClick={() => {
                  if (!user) {
                    /* v1.16.0: نحفظ ما أدخله إن وُجد ثم التسجيل — وبعده العودة لنفس النافذة */
                    try {
                      sessionStorage.setItem(
                        "tumaanina-clinic-booking-draft",
                        JSON.stringify({ clinicKey: activeClinicSlug, date: bDate, slot: bSlot, name: bName.trim(), phone: bPhone.trim(), reason: bReason.trim() })
                      );
                    } catch {
                      /* تجاهل */
                    }
                    setView("client-start");
                    return;
                  }
                  setBookOpen(true);
                }}
              >
                <CalendarClock className="h-5 w-5" />
                {user ? t.clinics.bookBtn : t.clinics.loginToBook}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </motion.div>

      {/* التقييمات */}
      <div className="mt-8 space-y-4">
        <h2 className="text-lg font-black flex items-center gap-2">
          <MessageSquareHeart className="h-5 w-5 text-primary" />
          {t.clinics.reviewsTitle}
          <span className="text-xs font-bold text-muted-foreground">({revTotal})</span>
        </h2>

        {/* نموذج تقييم — لمن يملك حجزاً في العيادة */}
        {(!user || user.role === "VICTIM") ? (
          <Card className="border-border/70">
            <CardContent className="p-5 space-y-3">
              {myRatingSent ? (
                <p className="text-sm font-bold text-primary flex items-center gap-2"><BadgeCheck className="h-4 w-4" />{t.clinics.ratingSaved}</p>
              ) : (
                <>
                  <p className="text-sm font-bold">{t.clinics.rateThis}</p>
                  <div className="flex items-center gap-1.5" dir="ltr">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button key={s} type="button" onClick={() => setMyStars(s)} aria-label={`${s} / 5`}>
                        <Star className={`h-7 w-7 transition-all ${s <= myStars ? "fill-amber-400 text-amber-400 scale-110" : "text-muted-foreground/30 hover:text-amber-300"}`} />
                      </button>
                    ))}
                  </div>
                  <Textarea placeholder={t.clinics.rateComment} value={myComment} onChange={(e) => setMyComment(e.target.value)} className="rounded-xl min-h-20" maxLength={500} />
                  <Button className="gradient-primary text-white font-black rounded-xl" disabled={!myStars || ratingBusy} onClick={submitRating}>
                    {ratingBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {t.clinics.rateSubmit}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        ) : null}

        {reviews.length === 0 ? null : (
          <div className="space-y-3">
            {reviews.map((r) => (
              <Card key={r.id} className="border-border/60">
                <CardContent className="p-4 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-black text-sm">{r.clientName}</span>
                    <Stars n={r.stars} size="h-3.5 w-3.5" />
                  </div>
                  {r.comment ? <p className="text-xs text-muted-foreground leading-relaxed">{r.comment}</p> : null}
                  <p className="text-[10px] text-muted-foreground/70 font-semibold" dir="ltr">{formatDateTime(r.createdAt)}</p>
                </CardContent>
              </Card>
            ))}
            {revPages > 1 ? (
              <div className="flex items-center justify-center gap-2">
                <Button variant="outline" size="sm" className="rounded-lg font-bold" disabled={revPage <= 1} onClick={() => loadReviews(revPage - 1)}>{t.directory.prev}</Button>
                <span className="text-xs font-bold text-muted-foreground font-mono px-1">{revPage} / {revPages}</span>
                <Button variant="outline" size="sm" className="rounded-lg font-bold" disabled={revPage >= revPages} onClick={() => loadReviews(revPage + 1)}>{t.directory.next}</Button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* v1.15.0: نافذة معرض الصور */}
      <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-start flex items-center gap-2 text-base">
              <Images className="h-4.5 w-4.5 text-primary" />
              {t.clinics.galleryTitle.replace("{clinic}", clinic.name)}
            </DialogTitle>
          </DialogHeader>
          {galleryLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : galleryImages.length === 0 ? (
            <p className="text-center text-sm font-bold text-muted-foreground py-8">{t.clinics.galleryEmpty}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {galleryImages.map((src, i) => (
                <button key={i} type="button" className="group relative rounded-xl overflow-hidden border border-border/60 aspect-square" onClick={() => setLightbox(i)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`${clinic.name} ${i + 1}`} loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* v1.15.0: عارض الصورة الكاملة (Lightbox) */}
      {lightbox !== null && galleryImages[lightbox] ? (
        <div className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button type="button" className="absolute top-4 end-4 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center" onClick={() => setLightbox(null)} aria-label={t.common.close}>
            <X className="h-5 w-5" />
          </button>
          {lightbox > 0 ? (
            <button type="button" className="absolute start-3 h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-2xl font-black" onClick={(e) => { e.stopPropagation(); setLightbox(lightbox - 1); }} aria-label="prev">
              {lang === "ar" ? "›" : "‹"}
            </button>
          ) : null}
          {lightbox < galleryImages.length - 1 ? (
            <button type="button" className="absolute end-3 h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-2xl font-black" onClick={(e) => { e.stopPropagation(); setLightbox(lightbox + 1); }} aria-label="next">
              {lang === "ar" ? "‹" : "›"}
            </button>
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={galleryImages[lightbox]} alt={`${clinic.name} ${lightbox + 1}`} className="max-h-[85vh] max-w-full object-contain rounded-xl" onClick={(e) => e.stopPropagation()} />
        </div>
      ) : null}

      {/* نافذة الحجز الحضوري */}
      <Dialog open={bookOpen} onOpenChange={setBookOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-start flex items-center gap-2 text-base">
              <CalendarClock className="h-4.5 w-4.5 text-primary" />
              {t.clinics.bookTitle.replace("{clinic}", clinic.name)}
            </DialogTitle>
            <DialogDescription className="text-start text-xs leading-relaxed">{t.clinics.bookDesc}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* v1.16.0: تذكير بالسعر داخل نافذة الحجز */}
            {clinic.sessionPrice !== null && clinic.sessionPrice > 0 ? (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-primary/5 border border-primary/20 px-3.5 py-2.5" dir="ltr">
                <span className="text-xs font-bold text-muted-foreground">{t.clinics.sessionShort}</span>
                <span className="text-sm font-black text-primary">{clinic.sessionPrice.toLocaleString("en-US")} DZD</span>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label className="font-bold">{t.clinics.bookDate} *</Label>
              <Input type="date" min={localDateStr2()} max={localDateStr2(60)} value={bDate} onChange={(e) => setBDate(e.target.value)} className="rounded-xl bg-card" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold">{t.clinics.pickSlotLabel} *</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {bookingSlots.map((s: string) => {
                  const taken = bTaken.includes(s);
                  /* v1.16.0: الساعات الفائتة من يوم اليوم معطّلة بصرياً —
                     تطابق منع الخادم للحجز في موعد ماضٍ (توقيت الجزائر) */
                  const isToday = bDate === localDateStr2();
                  const nowHHMM = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(11, 16);
                  const past = isToday && s <= nowHHMM;
                  return (
                    <button
                      key={s}
                      type="button"
                      disabled={taken || past}
                      onClick={() => setBSlot(s)}
                      className={`rounded-lg py-2 text-xs font-black transition-all border ${
                        taken || past
                          ? "border-border/40 bg-muted/40 text-muted-foreground/40 line-through cursor-not-allowed"
                          : bSlot === s
                            ? "gradient-primary text-white border-transparent shadow"
                            : "border-border/70 bg-card hover:border-primary/40"
                      }`}
                      dir="ltr"
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1"><Users className="h-3 w-3" />{t.clinics.slotHint}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold">{t.clinics.yourName} *</Label>
              <Input value={bName} onChange={(e) => setBName(e.target.value)} className="rounded-xl bg-card" placeholder={t.clinics.yourNamePh} />
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold">{t.clinics.yourPhone} *</Label>
              <Input type="tel" dir="ltr" value={bPhone} onChange={(e) => setBPhone(e.target.value)} className="rounded-xl bg-card" placeholder="05XXXXXXXX" />
              <p className="text-[10px] text-muted-foreground font-semibold">{t.clinics.phoneHint}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold">{t.clinics.reasonLabel}</Label>
              <Textarea value={bReason} onChange={(e) => setBReason(e.target.value)} className="rounded-xl min-h-16" maxLength={600} placeholder={t.clinics.reasonPh} />
            </div>
            {bError ? <div className="rounded-xl bg-destructive/10 text-destructive text-sm font-bold px-4 py-3">{bError}</div> : null}
            <Button className="w-full gradient-primary text-white font-black rounded-xl h-12" disabled={bBusy} onClick={submitBooking}>
              {bBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
              {t.clinics.bookSubmit}
            </Button>
            <p className="text-[11px] text-muted-foreground font-semibold leading-relaxed flex items-start gap-1.5">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {t.clinics.bookNotice}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
