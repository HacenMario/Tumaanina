"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Building2, CalendarClock, Loader2, Plus, Trash2, MapPin, Globe,
  Clock, Wallet, FileCheck2, Upload, X, Check, Ban, RefreshCw, Star, Users, Images,
  Navigation, CalendarClock as SlotIcon, List, LocateFixed,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { WILAYA_LIST, SPECIALTIES, SLOT_TIMES, type SpecialtyKey } from "@/lib/constants";
import { ClinicAdsTab, ClinicDuesTab } from "./clinic-dashboard-ads";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { BackButton } from "@/components/shared/back-button";
import { showAppToast } from "@/components/shared/app-toast";

/* ═ v1.14.0 — لوحة العيادة (دخول عيادة) ═
   أربعة تبويبات:
   • معلومات العيادة — كل حقول الملف + مواعيد الحجز + معرض الصور + الموقع على الخريطة
   • الحجوزات — بانتظار التأكيد أولاً (5 تظهر والباقي بنافذة)
   • إعلاناتي — صياغة إعلان بوسائط (5 صور + فيديو) وتتبعه وإحصاءاته
   • المستحقات — ما دفعته العيادة للإدارة مقابل الإعلانات بفلاتر زمنية */

const MAX_LOGO_B64 = 1_400_000;
const MAX_ADIMG_B64 = 3_400_000;

async function compressImage(file: File, maxSide = 900, limit = MAX_LOGO_B64): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("READ_FAILED"));
    reader.readAsDataURL(file);
  });
  if (file.size <= 300 * 1024 && file.type !== "image/heic" && file.type !== "image/heif") {
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
    for (const q of [0.85, 0.75, 0.6, 0.45]) {
      const out = canvas.toDataURL("image/jpeg", q);
      if (out.length <= limit) return out;
    }
    return canvas.toDataURL("image/jpeg", 0.35);
  } catch {
    if (dataUrl.length <= limit) return dataUrl;
    throw new Error("TOO_BIG");
  }
}

interface ClinicProfile {
  id: string;
  name: string;
  slug: string | null;
  foundedYear: number | null;
  specialties: string[];
  customSpecialties: string[];
  about: string | null;
  wilaya: string | null;
  city: string | null;
  address: string | null;
  phones: string[];
  whatsapp: string | null;
  contactEmail: string | null;
  accountEmail: string | null;
  website: string | null;
  socials: { facebook?: string | null; instagram?: string | null; tiktok?: string | null };
  logoUrl: string;
  hasLogo: boolean;
  workingHours: string | null;
  priceNote: string | null;
  licenseNumber: string | null;
  isActive: boolean;
  rating: number;
  ratingsCount: number;
  bookingsCount: number;
  /* v1.15.0 */
  slots: string[];
  gallery: string[];
  location: { lat: number | null; lng: number | null };
  /* v1.16.0: سعر الجلسة الحضورية + الباقات */
  sessionPrice: number | null;
  packs: { name: string; sessions: number; price: number; note: string | null }[];
}

interface BookingRow {
  id: string;
  clientName: string;
  clientPhone: string | null;
  date: string;
  slot: string;
  reason: string | null;
  status: string;
  clinicNote: string | null;
  cancelledBy: string | null;
}

export function ClinicDashboardView() {
  const { t, lang } = useI18n();
  const { user, setUser, setView } = useApp();
  const [tab, setTab] = useState<"info" | "bookings" | "ads" | "dues">("info");

  /* ─── الملف ─── */
  const [clinic, setClinic] = useState<ClinicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /* حقول النموذج */
  const [fName, setFName] = useState("");
  const [fYear, setFYear] = useState("");
  const [fSpecs, setFSpecs] = useState<string[]>([]);
  const [fCustom, setFCustom] = useState<string[]>([]);
  const [fCustomInput, setFCustomInput] = useState("");
  const [fAbout, setFAbout] = useState("");
  const [fWilaya, setFWilaya] = useState("all");
  const [fCity, setFCity] = useState("");
  const [fAddress, setFAddress] = useState("");
  const [fPhones, setFPhones] = useState<string[]>([""]);
  const [fWhatsapp, setFWhatsapp] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fWebsite, setFWebsite] = useState("");
  const [fFb, setFFb] = useState("");
  const [fIg, setFIg] = useState("");
  const [fTt, setFTt] = useState("");
  const [fLogo, setFLogo] = useState<string | null>(null); // null = دون تغيير
  const [logoDirty, setLogoDirty] = useState(false);
  const [fHours, setFHours] = useState("");
  const [fPriceNote, setFPriceNote] = useState("");
  const [fLicense, setFLicense] = useState("");

  /* ══ v1.16.0: سعر الجلسة الحضورية + الباقات ══ */
  const [fSessionPrice, setFSessionPrice] = useState("");
  const [fPacks, setFPacks] = useState<{ name: string; sessions: number; price: number; note: string | null }[]>([]);
  const [packsDirty, setPacksDirty] = useState(false);

  /* ══ v1.15.0: مواعيد الحجز + معرض الصور + الموقع ══ */
  const [fSlots, setFSlots] = useState<string[]>([]);          /* فارغة = الافتراضية */
  const [slotDirty, setSlotDirty] = useState(false);
  const [fGallery, setFGallery] = useState<string[]>([]);
  const [galleryDirty, setGalleryDirty] = useState(false);
  const [fLat, setFLat] = useState<number | null>(null);
  const [fLng, setFLng] = useState<number | null>(null);
  const [locDirty, setLocDirty] = useState(false);
  const [locBusy, setLocBusy] = useState(false);
  const [customSlot, setCustomSlot] = useState("");

  /* ─── الحجوزات ─── */
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [bookLoading, setBookLoading] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelNote, setCancelNote] = useState("");
  /* v1.15.0: نافذة «إظهار الباقي» — تظهر 5 فقط والباقي بنافذة منبثقة */
  const [showAllBookings, setShowAllBookings] = useState(false);

  const loadClinic = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/clinic?userId=${user.id}`);
      const data = await res.json();
      if (data.clinic) {
        const c = data.clinic as ClinicProfile;
        setClinic(c);
        setFName(c.name || "");
        setFYear(c.foundedYear ? String(c.foundedYear) : "");
        setFSpecs(c.specialties || []);
        setFCustom(c.customSpecialties || []);
        setFAbout(c.about || "");
        setFWilaya(c.wilaya || "all");
        setFCity(c.city || "");
        setFAddress(c.address || "");
        setFPhones(c.phones?.length ? [...c.phones] : [""]);
        setFWhatsapp(c.whatsapp || "");
        setFEmail(c.contactEmail || "");
        setFWebsite(c.website || "");
        setFFb(c.socials?.facebook || "");
        setFIg(c.socials?.instagram || "");
        setFTt(c.socials?.tiktok || "");
        setFLogo(null);
        setLogoDirty(false);
        setFHours(c.workingHours || "");
        setFPriceNote(c.priceNote || "");
        setFLicense(c.licenseNumber || "");
        /* v1.15.0 */
        setFSlots(c.slots || []);
        setSlotDirty(false);
        setFGallery(c.gallery || []);
        setGalleryDirty(false);
        setFLat(c.location?.lat ?? null);
        setFLng(c.location?.lng ?? null);
        setLocDirty(false);
        /* v1.16.0: السعر والباقات */
        setFSessionPrice(c.sessionPrice != null ? String(c.sessionPrice) : "");
        setFPacks((c.packs || []).map((p) => ({ ...p })));
        setPacksDirty(false);
      }
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const loadBookings = useCallback(async () => {
    if (!user?.id) return;
    setBookLoading(true);
    try {
      const res = await fetch(`/api/clinics/bookings?userId=${user.id}`);
      const data = await res.json();
      setBookings(data.bookings || []);
    } finally {
      setBookLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadClinic();
  }, [loadClinic]);

  useEffect(() => {
    if (tab === "bookings") loadBookings();
  }, [tab, loadBookings]);

  const saveProfile = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        action: "update-profile",
        userId: user.id,
        name: fName.trim(),
        foundedYear: fYear ? Number(fYear) : null,
        specialties: fSpecs,
        customSpecialties: fCustom,
        about: fAbout.trim() || null,
        wilaya: fWilaya === "all" ? null : fWilaya,
        city: fCity.trim() || null,
        address: fAddress.trim() || null,
        phones: fPhones.filter((p) => p.trim()),
        whatsapp: fWhatsapp.trim() || null,
        contactEmail: fEmail.trim() || null,
        website: fWebsite.trim() || null,
        socials: { facebook: fFb.trim() || null, instagram: fIg.trim() || null, tiktok: fTt.trim() || null },
        workingHours: fHours.trim() || null,
        priceNote: fPriceNote.trim() || null,
        licenseNumber: fLicense.trim() || null,
        /* v1.16.0: سعر الجلسة الحضورية + الباقات */
        sessionPrice: fSessionPrice.trim() === "" ? null : Number(fSessionPrice),
        packs: packsDirty ? fPacks : undefined,
      };
      if (logoDirty) payload.logo = fLogo;
      /* v1.15.0: المواعيد والمعرض والموقع — تُرسل فقط عند تغييرها */
      if (slotDirty) payload.slots = fSlots;
      if (galleryDirty) payload.gallery = fGallery;
      if (locDirty) payload.location = { lat: fLat, lng: fLng };
      const res = await fetch("/api/clinic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        showAppToast(t.common.saved, t.clinicDash.savedSub);
        if (data.slug) {
          setUser({ ...user, clinicSlug: data.slug, clinicName: data.name || fName.trim() });
        }
        loadClinic();
      } else if (data.error === "INVALID_WHATSAPP") {
        showAppToast(t.clinicDash.waInvalid, t.clinicDash.waInvalidSub);
      } else if (data.error === "INVALID_YEAR") {
        showAppToast(t.clinicDash.yearInvalid, "");
      } else if (data.error === "INVALID_LOGO") {
        showAppToast(t.clinicDash.logoTooBig, "");
      } else if (data.error === "INVALID_PRICE") {
        showAppToast(t.clinicDash.priceInvalid, "");
      } else if (data.error === "INVALID_PACK" || data.error === "MAX_12_PACKS") {
        showAppToast(t.clinicDash.packInvalid, "");
      } else {
        showAppToast(t.common.errorServer, "");
      }
    } finally {
      setSaving(false);
    }
  };

  const pickLogo = async (file: File | null) => {
    if (!file) return;
    try {
      const compressed = await compressImage(file, 700, MAX_LOGO_B64);
      setFLogo(compressed);
      setLogoDirty(true);
    } catch {
      showAppToast(t.clinicDash.logoTooBig, "");
    }
  };

  /* ══ v1.15.0 ══ */
  /* معرض الصور: رفع صور متعددة حتى 8 */
  const pickGallery = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = 8 - fGallery.length;
    const list = Array.from(files).slice(0, Math.max(0, room));
    if (list.length === 0) {
      showAppToast(t.clinicDash.galleryFull, "");
      return;
    }
    const added: string[] = [];
    for (const f of list) {
      try {
        added.push(await compressImage(f, 1000, MAX_LOGO_B64));
      } catch {
        showAppToast(t.clinicDash.logoTooBig, "");
      }
    }
    if (added.length) {
      setFGallery((p) => [...p, ...added]);
      setGalleryDirty(true);
    }
  };

  /* تحديد موقع العيادة بدقة — يطلب إذن الموقع ويحفظ الإحداثيات */
  const locateClinic = () => {
    if (!navigator.geolocation) {
      showAppToast(t.clinicDash.locUnsupported, "");
      return;
    }
    setLocBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFLat(Math.round(pos.coords.latitude * 1e6) / 1e6);
        setFLng(Math.round(pos.coords.longitude * 1e6) / 1e6);
        setLocDirty(true);
        setLocBusy(false);
        showAppToast(t.clinicDash.locSaved, t.clinicDash.locSavedSub);
      },
      () => {
        setLocBusy(false);
        showAppToast(t.clinicDash.locDenied, "");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  /* تبديل موعد من قائمة المواعيد */
  const toggleSlot = (s: string) => {
    setFSlots((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
    setSlotDirty(true);
  };
  const addCustomSlot = () => {
    const v = customSlot.trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) {
      showAppToast(t.clinicDash.slotInvalid, "");
      return;
    }
    if (!fSlots.includes(v) && fSlots.length < 24) setFSlots((p) => [...p, v].sort());
    setCustomSlot("");
    setSlotDirty(true);
  };

  const bookingAction = async (id: string, action: string, note?: string) => {
    if (!user?.id) return;
    const res = await fetch("/api/clinics/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, id, action, note }),
    });
    const data = await res.json();
    if (data.ok) {
      showAppToast(t.clinicDash.updated, "");
      setCancelId(null);
      setCancelNote("");
      loadBookings();
    } else {
      showAppToast(t.common.errorServer, "");
    }
  };

  if (!user || user.role !== "CLINIC") {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <Building2 className="h-12 w-12 mx-auto text-muted-foreground/40" />
        <h1 className="text-xl font-black">{t.clinicDash.needLogin}</h1>
        <Button className="gradient-primary text-white font-black rounded-xl" onClick={() => setView("clinic-auth")}>
          {t.clinicDash.loginCta}
        </Button>
      </div>
    );
  }

  const bookingBadge = (s: string) => {
    if (s === "CONFIRMED") return <Badge className="bg-primary/12 text-primary border-0">{t.clinicDash.bConfirmed}</Badge>;
    if (s === "COMPLETED") return <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0">{t.clinicDash.bCompleted}</Badge>;
    if (s === "CANCELLED") return <Badge className="bg-destructive/10 text-destructive border-0">{t.clinicDash.bCancelled}</Badge>;
    return <Badge className="bg-amber-400/12 text-amber-600 dark:text-amber-400 border-0">{t.clinicDash.bPending}</Badge>;
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 md:py-12">
      <BackButton />
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="mb-6 space-y-2">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <Building2 className="h-5.5 w-5.5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-black leading-tight truncate">{user.clinicName || t.clinicDash.title}</h1>
            {clinic ? (
              <p className="text-xs text-muted-foreground font-semibold">
                {clinic.rating.toFixed(1)} ★ · {clinic.ratingsCount} {t.clinics.bookingsDone} · {clinic.bookingsCount} {t.clinicDash.visitsDone}
              </p>
            ) : null}
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
        <button onClick={() => setTab("info")} className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs sm:text-sm font-black transition-all ${tab === "info" ? "gradient-primary text-white shadow" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
          <Building2 className="h-4 w-4 shrink-0" />
          <span className="truncate">{t.clinicDash.tabInfo}</span>
        </button>
        <button onClick={() => setTab("bookings")} className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs sm:text-sm font-black transition-all ${tab === "bookings" ? "gradient-primary text-white shadow" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
          <CalendarClock className="h-4 w-4 shrink-0" />
          <span className="truncate">{t.clinicDash.tabBookings}</span>
        </button>
        <button onClick={() => setTab("ads")} className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs sm:text-sm font-black transition-all ${tab === "ads" ? "gradient-primary text-white shadow" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
          <List className="h-4 w-4 shrink-0" />
          <span className="truncate">{t.clinicDash.tabAds}</span>
        </button>
        <button onClick={() => setTab("dues")} className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs sm:text-sm font-black transition-all ${tab === "dues" ? "gradient-primary text-white shadow" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
          <Wallet className="h-4 w-4 shrink-0" />
          <span className="truncate">{t.clinicDash.tabDues}</span>
        </button>
      </div>

      {/* ════ معلومات العيادة ════ */}
      {tab === "info" ? (
        loading || !clinic ? (
          <Card className="h-64 animate-pulse bg-muted/50 border-border/50" />
        ) : (
          <div className="space-y-5">
            {/* رابط الصفحة العامة */}
            {clinic.slug ? (
              <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 flex items-center gap-2 flex-wrap">
                <Globe className="h-4 w-4 text-primary shrink-0" />
                <span className="text-xs font-bold text-primary break-all flex-1 min-w-0" dir="ltr">/?clinic={clinic.slug}</span>
                <Button size="sm" variant="outline" className="rounded-lg font-bold border-primary/40 text-primary shrink-0" onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/?clinic=${clinic.slug}`).then(() => showAppToast(t.clinicDash.linkCopied, t.clinicDash.linkCopiedSub)).catch(() => {}); }}>
                  {t.clinicDash.copyLink}
                </Button>
              </div>
            ) : null}

            <Card className="border-border/70">
              <CardContent className="p-5 sm:p-6 space-y-5">
                {/* الشعار */}
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="h-20 w-20 rounded-2xl border border-border/60 bg-card overflow-hidden flex items-center justify-center shrink-0">
                    {logoDirty && fLogo ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={fLogo} alt="logo" className="h-full w-full object-contain p-1" />
                    ) : clinic.hasLogo ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={clinic.logoUrl} alt="logo" className="h-full w-full object-contain p-1" />
                    ) : (
                      <Building2 className="h-8 w-8 text-muted-foreground/30" />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="block text-xs font-black text-muted-foreground">{t.clinicDash.logoLabel}</Label>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" size="sm" className="rounded-lg font-bold gap-1.5" onClick={() => document.getElementById("clinic-logo-input")?.click()}>
                        <Upload className="h-3.5 w-3.5" />
                        {t.clinicDash.logoPick}
                      </Button>
                      {logoDirty ? (
                        <Button type="button" variant="ghost" size="sm" className="rounded-lg font-bold text-destructive gap-1" onClick={() => { setFLogo(null); setLogoDirty(true); }}>
                          <X className="h-3.5 w-3.5" />
                          {t.clinicDash.logoRemove}
                        </Button>
                      ) : null}
                    </div>
                    <input id="clinic-logo-input" type="file" accept="image/*" className="hidden" onChange={(e) => { pickLogo(e.target.files?.[0] || null); e.currentTarget.value = ""; }} />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="font-bold">{t.clinicAuth.clinicName} *</Label>
                    <Input value={fName} onChange={(e) => setFName(e.target.value)} className="rounded-xl bg-card" maxLength={120} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-bold">{t.clinicDash.foundedYear}</Label>
                    <Input type="number" dir="ltr" min={1950} max={new Date().getFullYear()} value={fYear} onChange={(e) => setFYear(e.target.value)} className="rounded-xl bg-card" placeholder="2005" />
                    <p className="text-[10px] text-muted-foreground font-semibold">{t.clinicDash.yearHint}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-bold">{t.clinicAuth.wilayaLabel}</Label>
                    <Select value={fWilaya} onValueChange={setFWilaya}>
                      <SelectTrigger className="rounded-xl bg-card font-semibold"><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-72">
                        <SelectItem value="all">{t.clinicAuth.noWilaya}</SelectItem>
                        {WILAYA_LIST.map((w) => (
                          <SelectItem key={w.key} value={w.key}>{lang === "ar" ? w.ar : lang === "fr" ? w.fr : w.en}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-bold">{t.clinicDash.city}</Label>
                    <Input value={fCity} onChange={(e) => setFCity(e.target.value)} className="rounded-xl bg-card" maxLength={80} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="font-bold">{t.clinicDash.address}</Label>
                    <Input value={fAddress} onChange={(e) => setFAddress(e.target.value)} className="rounded-xl bg-card" maxLength={300} placeholder={t.clinicDash.addressPh} />
                  </div>
                </div>

                {/* التخصصات */}
                <div className="space-y-2">
                  <Label className="font-bold">{t.clinicDash.specialties}</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {SPECIALTIES.map((s) => {
                      const on = fSpecs.includes(s);
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setFSpecs((prev) => (on ? prev.filter((x) => x !== s) : [...prev, s]))}
                          className={`rounded-full px-3 py-1.5 text-xs font-bold border transition-all ${on ? "gradient-primary text-white border-transparent shadow" : "bg-card border-border/70 text-muted-foreground hover:border-primary/40"}`}
                        >
                          {t.client.specialties[s as SpecialtyKey]}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {fCustom.map((cs) => (
                      <span key={cs} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-bold">
                        {cs}
                        <button type="button" onClick={() => setFCustom((prev) => prev.filter((x) => x !== cs))} aria-label="remove"><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={fCustomInput}
                      onChange={(e) => setFCustomInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && fCustomInput.trim()) {
                          e.preventDefault();
                          const v = fCustomInput.trim().slice(0, 50);
                          if (!fCustom.includes(v) && fCustom.length < 10) setFCustom((p) => [...p, v]);
                          setFCustomInput("");
                        }
                      }}
                      className="rounded-xl bg-card"
                      placeholder={t.clinicDash.customSpecPh}
                    />
                    <Button type="button" variant="outline" size="sm" className="rounded-lg font-black shrink-0" onClick={() => { const v = fCustomInput.trim().slice(0, 50); if (v && !fCustom.includes(v) && fCustom.length < 10) setFCustom((p) => [...p, v]); setFCustomInput(""); }}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="font-bold">{t.clinicDash.about}</Label>
                  <Textarea value={fAbout} onChange={(e) => setFAbout(e.target.value)} className="rounded-xl min-h-24" maxLength={4000} placeholder={t.clinicDash.aboutPh} />
                </div>

                {/* الهواتف */}
                <div className="space-y-2">
                  <Label className="font-bold">{t.clinicDash.phones}</Label>
                  {fPhones.map((p, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <Input
                        type="tel"
                        dir="ltr"
                        value={p}
                        onChange={(e) => setFPhones((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                        className="rounded-xl bg-card"
                        placeholder="0555123456"
                      />
                      {fPhones.length > 1 ? (
                        <Button type="button" variant="ghost" size="icon" className="shrink-0 text-destructive h-9 w-9" onClick={() => setFPhones((prev) => prev.filter((_, j) => j !== i))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  ))}
                  {fPhones.length < 4 ? (
                    <Button type="button" variant="outline" size="sm" className="rounded-lg font-bold gap-1.5" onClick={() => setFPhones((prev) => [...prev, ""])}>
                      <Plus className="h-3.5 w-3.5" />
                      {t.clinicDash.addPhone}
                    </Button>
                  ) : null}
                  <p className="text-[10px] text-muted-foreground font-semibold">{t.clinicDash.phonesHint}</p>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="font-bold">{t.clinicDash.whatsapp}</Label>
                    <Input type="tel" dir="ltr" value={fWhatsapp} onChange={(e) => setFWhatsapp(e.target.value)} className="rounded-xl bg-card" placeholder="0555123456" />
                    <p className="text-[10px] text-muted-foreground font-semibold">{t.clinicDash.waHint}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-bold">{t.clinicDash.contactEmail}</Label>
                    <Input type="email" dir="ltr" value={fEmail} onChange={(e) => setFEmail(e.target.value)} className="rounded-xl bg-card" placeholder="contact@clinic.com" />
                    <p className="text-[10px] text-muted-foreground font-semibold">{t.clinicDash.emailHint.replace("{email}", clinic.accountEmail || "—")}</p>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="font-bold">{t.clinics.website}</Label>
                    <Input dir="ltr" value={fWebsite} onChange={(e) => setFWebsite(e.target.value)} className="rounded-xl bg-card" placeholder="https://clinic.com" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-bold">Facebook</Label>
                    <Input dir="ltr" value={fFb} onChange={(e) => setFFb(e.target.value)} className="rounded-xl bg-card" placeholder="facebook.com/clinic" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-bold">Instagram</Label>
                    <Input dir="ltr" value={fIg} onChange={(e) => setFIg(e.target.value)} className="rounded-xl bg-card" placeholder="instagram.com/clinic" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-bold">TikTok</Label>
                    <Input dir="ltr" value={fTt} onChange={(e) => setFTt(e.target.value)} className="rounded-xl bg-card" placeholder="@clinic" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-bold">{t.clinics.workingHours}</Label>
                    <Input value={fHours} onChange={(e) => setFHours(e.target.value)} className="rounded-xl bg-card" maxLength={400} placeholder={t.clinicDash.hoursPh} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-bold">{t.clinics.priceNote}</Label>
                    <Input value={fPriceNote} onChange={(e) => setFPriceNote(e.target.value)} className="rounded-xl bg-card" maxLength={400} placeholder={t.clinicDash.pricePh} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-bold">{t.clinics.license}</Label>
                    <Input value={fLicense} onChange={(e) => setFLicense(e.target.value)} className="rounded-xl bg-card" maxLength={80} dir="auto" />
                  </div>
                  {/* v1.16.0: سعر الجلسة الحضورية — يظهر للجمهور في البطاقة والصفحة */}
                  <div className="space-y-1.5">
                    <Label className="font-bold">{t.clinicDash.sessionPriceLabel}</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        dir="ltr"
                        value={fSessionPrice}
                        onChange={(e) => setFSessionPrice(e.target.value)}
                        className="rounded-xl bg-card"
                        placeholder={t.clinicDash.sessionPricePh}
                      />
                      <span className="text-xs font-black text-muted-foreground shrink-0">DZD</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground font-semibold">{t.clinicDash.sessionPriceHint}</p>
                  </div>
                </div>

                {/* ══ v1.16.0: باقات الجلسات الحضورية (Packs) ══ */}
                <div className="space-y-2.5 rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-primary" />
                      <Label className="font-bold">{t.clinicDash.packsTitle}</Label>
                      <span className="text-[10px] font-black text-muted-foreground">({fPacks.length}/12)</span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-lg font-black gap-1.5 border-primary/40 text-primary"
                      disabled={fPacks.length >= 12}
                      onClick={() => {
                        setFPacks((p) => [...p, { name: "", sessions: 4, price: 0, note: null }]);
                        setPacksDirty(true);
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      {t.clinicDash.packAdd}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-semibold leading-relaxed">{t.clinicDash.packsHint}</p>
                  {fPacks.length === 0 ? (
                    <p className="text-[11px] font-bold text-muted-foreground/70">{t.clinicDash.packsEmpty}</p>
                  ) : (
                    <div className="space-y-2">
                      {fPacks.map((p, i) => (
                        <div key={i} className="rounded-xl border border-border/60 bg-card p-3 space-y-2">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div className="space-y-1 col-span-2 sm:col-span-1">
                              <Label className="text-[10px] font-black text-muted-foreground">{t.clinicDash.packName}</Label>
                              <Input
                                value={p.name}
                                maxLength={80}
                                onChange={(e) => {
                                  setFPacks((arr) => arr.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)));
                                  setPacksDirty(true);
                                }}
                                className="rounded-lg bg-card h-9 text-sm"
                                placeholder={t.clinicDash.packNamePh}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] font-black text-muted-foreground">{t.clinicDash.packSessions}</Label>
                              <Input
                                type="number"
                                min={1}
                                max={200}
                                dir="ltr"
                                value={String(p.sessions)}
                                onChange={(e) => {
                                  setFPacks((arr) => arr.map((x, j) => (j === i ? { ...x, sessions: Math.max(1, Math.round(Number(e.target.value) || 1)) } : x)));
                                  setPacksDirty(true);
                                }}
                                className="rounded-lg bg-card h-9 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] font-black text-muted-foreground">{t.clinicDash.packPrice}</Label>
                              <Input
                                type="number"
                                min={0}
                                dir="ltr"
                                value={String(p.price)}
                                onChange={(e) => {
                                  setFPacks((arr) => arr.map((x, j) => (j === i ? { ...x, price: Math.max(0, Math.round(Number(e.target.value) || 0)) } : x)));
                                  setPacksDirty(true);
                                }}
                                className="rounded-lg bg-card h-9 text-sm"
                                placeholder="DZD"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] font-black text-muted-foreground">{t.clinicDash.packNote}</Label>
                              <Input
                                value={p.note || ""}
                                maxLength={200}
                                onChange={(e) => {
                                  setFPacks((arr) => arr.map((x, j) => (j === i ? { ...x, note: e.target.value.trim() || null } : x)));
                                  setPacksDirty(true);
                                }}
                                className="rounded-lg bg-card h-9 text-sm"
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-[11px] font-black text-destructive hover:underline"
                            onClick={() => {
                              setFPacks((arr) => arr.filter((_, j) => j !== i));
                              setPacksDirty(true);
                            }}
                          >
                            <X className="h-3 w-3" />
                            {t.clinicDash.packRemove}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ══ v1.15.0: مواعيد الحجز ══ */}
                <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <div className="flex items-center gap-2">
                    <SlotIcon className="h-4 w-4 text-primary" />
                    <Label className="font-bold">{t.clinicDash.slotsTitle}</Label>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-semibold leading-relaxed">{t.clinicDash.slotsHint}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SLOT_TIMES.map((s) => {
                      const on = fSlots.includes(s);
                      return (
                        <button key={s} type="button" onClick={() => toggleSlot(s)} dir="ltr"
                          className={`rounded-lg px-2.5 py-1.5 text-xs font-black border transition-all ${on ? "gradient-primary text-white border-transparent shadow" : "bg-card border-border/70 text-muted-foreground hover:border-primary/40"}`}>
                          {s}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Input value={customSlot} onChange={(e) => setCustomSlot(e.target.value)} className="rounded-xl bg-card w-28" placeholder="08:30" dir="ltr" maxLength={5} />
                    <Button type="button" variant="outline" size="sm" className="rounded-lg font-black shrink-0" onClick={addCustomSlot}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {fSlots.length > 0 ? (
                    <div className="flex items-center flex-wrap gap-1.5">
                      {fSlots.filter((s) => !(SLOT_TIMES as readonly string[]).includes(s)).map((s) => (
                        <span key={s} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-bold" dir="ltr">
                          {s}
                          <button type="button" onClick={() => { setFSlots((p) => p.filter((x) => x !== s)); setSlotDirty(true); }} aria-label="remove"><X className="h-3 w-3" /></button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <p className="text-[10px] font-bold text-primary">{fSlots.length ? t.clinicDash.slotsCustom.replace("{n}", String(fSlots.length)) : t.clinicDash.slotsDefault}</p>
                </div>

                {/* ══ v1.15.0: معرض الصور ══ */}
                <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <div className="flex items-center gap-2">
                    <Images className="h-4 w-4 text-primary" />
                    <Label className="font-bold">{t.clinicDash.galleryTitle}</Label>
                    <span className="text-[10px] font-black text-muted-foreground">({fGallery.length}/8)</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-semibold">{t.clinicDash.galleryHint}</p>
                  {fGallery.length > 0 ? (
                    <div className="grid grid-cols-4 gap-2">
                      {fGallery.map((g, i) => (
                        <div key={i} className="relative rounded-lg overflow-hidden border border-border/60 aspect-square">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={g} alt={`gallery ${i + 1}`} className="h-full w-full object-cover" />
                          <button
                            type="button"
                            className="absolute top-1 end-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center"
                            onClick={() => { setFGallery((p) => p.filter((_, j) => j !== i)); setGalleryDirty(true); }}
                            aria-label="remove"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <Button type="button" variant="outline" size="sm" className="rounded-lg font-bold gap-1.5" disabled={fGallery.length >= 8} onClick={() => document.getElementById("clinic-gallery-input")?.click()}>
                    <Upload className="h-3.5 w-3.5" />
                    {t.clinicDash.galleryAdd}
                  </Button>
                  <input id="clinic-gallery-input" type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void pickGallery(e.target.files); e.currentTarget.value = ""; }} />
                </div>

                {/* ══ v1.15.0: الموقع على الخريطة ══ */}
                <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <Label className="font-bold">{t.clinicDash.locTitle}</Label>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-semibold leading-relaxed">{t.clinicDash.locHint}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button type="button" className="gradient-primary text-white font-black rounded-xl gap-1.5" disabled={locBusy} onClick={locateClinic}>
                      {locBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                      {t.clinicDash.locBtn}
                    </Button>
                    {fLat && fLng ? (
                      <Button type="button" variant="outline" className="rounded-xl font-bold text-destructive border-destructive/40" onClick={() => { setFLat(null); setFLng(null); setLocDirty(true); }}>
                        <X className="h-4 w-4" />
                        {t.clinicDash.locRemove}
                      </Button>
                    ) : null}
                  </div>
                  {fLat && fLng ? (
                    <div className="rounded-xl overflow-hidden border border-border/60">
                      <iframe
                        title="clinic-location"
                        src={`https://www.google.com/maps?q=${fLat},${fLng}&z=16&output=embed`}
                        className="w-full h-48 sm:h-56"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                      <p className="text-[10px] font-bold text-muted-foreground bg-card px-3 py-1.5" dir="ltr">
                        {fLat.toFixed(6)}, {fLng.toFixed(6)}
                      </p>
                    </div>
                  ) : (
                    <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400">{t.clinicDash.locNone}</p>
                  )}
                </div>

                <Button className="w-full gradient-primary text-white font-black rounded-xl h-12" disabled={saving} onClick={saveProfile}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {t.clinicDash.saveBtn}
                </Button>
              </CardContent>
            </Card>
          </div>
        )
      ) : null}

      {/* ════ الحجوزات ════ */}
      {tab === "bookings" ? (
        <div className="space-y-3">
          {bookLoading ? (
            <Card className="h-40 animate-pulse bg-muted/50 border-border/50" />
          ) : bookings.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-10 text-center space-y-3 text-muted-foreground">
                <CalendarClock className="h-10 w-10 mx-auto opacity-40" />
                <p className="font-semibold">{t.clinicDash.noBookings}</p>
                <p className="text-xs">{t.clinicDash.noBookingsSub}</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* v1.15.0: أول 5 حجوزات فقط — بانتظار التأكيد أولاً (الترتيب من الخادم) */}
              {bookings.slice(0, 5).map((b) => (
              <Card key={b.id} className="border-border/70">
                <CardContent className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-black text-sm">{b.clientName}</p>
                      {b.clientPhone ? (
                        <a href={`tel:${b.clientPhone}`} className="text-xs font-bold text-primary hover:underline" dir="ltr">{b.clientPhone}</a>
                      ) : null}
                    </div>
                    {bookingBadge(b.status)}
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground flex-wrap">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1" dir="ltr"><CalendarClock className="h-3 w-3" />{b.date.replaceAll("-", "/")} — {b.slot}</span>
                  </div>
                  {b.reason ? <p className="text-xs text-muted-foreground leading-relaxed bg-muted/40 rounded-lg px-3 py-2">{b.reason}</p> : null}
                  {b.status === "CANCELLED" && b.clinicNote ? (
                    <p className="text-xs text-destructive font-semibold">{t.clinicDash.cancelNoteLabel}: {b.clinicNote}</p>
                  ) : null}
                  {b.status === "PENDING" || b.status === "CONFIRMED" ? (
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      {b.status === "PENDING" ? (
                        <Button size="sm" className="gradient-primary text-white font-black rounded-lg" onClick={() => bookingAction(b.id, "confirm")}>
                          <Check className="h-3.5 w-3.5" />
                          {t.clinicDash.confirm}
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="rounded-lg font-black border-emerald-500/40 text-emerald-600 dark:text-emerald-400" onClick={() => bookingAction(b.id, "complete")}>
                          <Check className="h-3.5 w-3.5" />
                          {t.clinicDash.complete}
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="rounded-lg font-black text-destructive border-destructive/40" onClick={() => { setCancelId(b.id); setCancelNote(""); }}>
                        <Ban className="h-3.5 w-3.5" />
                        {t.clinicDash.cancel}
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))
            }
              {/* v1.15.0: زر «إظهار الباقي» — البقية بنافذة منبثقة */}
              {bookings.length > 5 ? (
                <Button variant="outline" className="w-full rounded-xl font-black gap-1.5" onClick={() => setShowAllBookings(true)}>
                  <List className="h-4 w-4" />
                  {t.clinicDash.showRest.replace("{n}", String(bookings.length - 5))}
                </Button>
              ) : null}
            </>
          )}
          {!bookLoading && bookings.length > 0 ? (
            <Button variant="outline" size="sm" className="rounded-lg font-bold gap-1.5" onClick={loadBookings}>
              <RefreshCw className="h-3.5 w-3.5" />
              {t.clinicDash.refresh}
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* ════ إعلاناتي ════ — v1.15.0: مكوّن مستقل بترقيم صفحات وإحصاءات وإدارة تعليقات */}
      {tab === "ads" && user ? <ClinicAdsTab userId={user.id} /> : null}

      {/* ════ المستحقات المدفوعة للمنصة مقابل الإعلانات ════ */}
      {tab === "dues" && user ? <ClinicDuesTab userId={user.id} /> : null}

      {/* نافذة إلغاء الحجز بسبب */}
      <Dialog open={!!cancelId} onOpenChange={(v) => { if (!v) setCancelId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-start text-base">{t.clinicDash.cancelTitle}</DialogTitle>
            <DialogDescription className="text-start text-xs leading-relaxed">{t.clinicDash.cancelDesc}</DialogDescription>
          </DialogHeader>
          <Textarea value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} className="rounded-xl min-h-20" maxLength={400} placeholder={t.clinicDash.cancelPh} />
          <div className="flex items-center gap-2">
            <Button variant="outline" className="flex-1 rounded-xl font-bold" onClick={() => setCancelId(null)}>{t.common.close}</Button>
            <Button variant="destructive" className="flex-1 rounded-xl font-black" onClick={() => cancelId && bookingAction(cancelId, "cancel", cancelNote.trim() || undefined)}>
              {t.clinicDash.cancelConfirm}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* v1.15.0: نافذة «إظهار الباقي» — كل الحجوزات المتبقية */}
      <Dialog open={showAllBookings} onOpenChange={setShowAllBookings}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-start text-base flex items-center gap-2">
              <CalendarClock className="h-4.5 w-4.5 text-primary" />
              {t.clinicDash.allBookingsTitle}
            </DialogTitle>
            <DialogDescription className="text-start text-xs leading-relaxed">{t.clinicDash.allBookingsDesc}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2.5">
            {bookings.map((b) => (
              <Card key={b.id} className="border-border/60">
                <CardContent className="p-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-black text-sm">{b.clientName}</p>
                      {b.clientPhone ? (
                        <a href={`tel:${b.clientPhone}`} className="text-xs font-bold text-primary hover:underline" dir="ltr">{b.clientPhone}</a>
                      ) : null}
                    </div>
                    {bookingBadge(b.status)}
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs font-bold" dir="ltr"><CalendarClock className="h-3 w-3" />{b.date.replaceAll("-", "/")} — {b.slot}</span>
                  {b.reason ? <p className="text-xs text-muted-foreground leading-relaxed bg-muted/40 rounded-lg px-3 py-2">{b.reason}</p> : null}
                  {b.status === "PENDING" || b.status === "CONFIRMED" ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      {b.status === "PENDING" ? (
                        <Button size="sm" className="gradient-primary text-white font-black rounded-lg" onClick={() => bookingAction(b.id, "confirm")}>
                          <Check className="h-3.5 w-3.5" />
                          {t.clinicDash.confirm}
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="rounded-lg font-black border-emerald-500/40 text-emerald-600 dark:text-emerald-400" onClick={() => bookingAction(b.id, "complete")}>
                          <Check className="h-3.5 w-3.5" />
                          {t.clinicDash.complete}
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="rounded-lg font-black text-destructive border-destructive/40" onClick={() => { setCancelId(b.id); setCancelNote(""); }}>
                        <Ban className="h-3.5 w-3.5" />
                        {t.clinicDash.cancel}
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
