"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, MapPin, Star, Search, Loader2, Check, Send, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { WILAYA_LIST, SPECIALTIES, type SpecialtyKey } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { showAppToast } from "@/components/shared/app-toast";

/* ═ v1.14.0 — اقتراح عيادة (من المختص في غرفة الجلسة) ═
   نافذة بفلترة: الولاية، المدينة/البلدية، التخصصات، سنوات الخبرة
   الأدنى (تُشتق من سنة الإنشاء) + بحث — ثم «اقترح» يرسل إشعاراً
   فورياً للعميل بكامل التفاصيل يوجهه لصفحة العيادة. */

interface SuggestClinic {
  id: string;
  name: string;
  slug: string | null;
  yearsExperience: number;
  specialties: string[];
  customSpecialties: string[];
  wilaya: string | null;
  city: string | null;
  rating: number;
}

export function ClinicSuggestDialog({
  open,
  onOpenChange,
  sessionId,
  suggestedIds,
  onSuggested,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sessionId: string;
  suggestedIds: string[];
  onSuggested: () => void;
}) {
  const { t, lang } = useI18n();
  const { user } = useApp();
  const [clinics, setClinics] = useState<SuggestClinic[]>([]);
  const [loading, setLoading] = useState(false);

  const [fWilaya, setFWilaya] = useState("all");
  const [fCity, setFCity] = useState("");
  const [fSpec, setFSpec] = useState("all");
  const [fMinYears, setFMinYears] = useState("0");
  const [fQuery, setFQuery] = useState("");

  /* تأكيد الاقتراح مع ملاحظة اختيارية */
  const [picking, setPicking] = useState<SuggestClinic | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fWilaya !== "all") params.set("wilaya", fWilaya);
      if (fCity.trim()) params.set("city", fCity.trim());
      if (fSpec !== "all") params.set("specialty", fSpec);
      if (Number(fMinYears) > 0) params.set("minYears", fMinYears);
      if (fQuery.trim()) params.set("q", fQuery.trim());
      const res = await fetch(`/api/clinics?${params.toString()}`);
      const data = await res.json();
      setClinics(data.clinics || []);
    } catch {
      setClinics([]);
    } finally {
      setLoading(false);
    }
  }, [fWilaya, fCity, fSpec, fMinYears, fQuery]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => load(), 200);
    return () => clearTimeout(timer);
  }, [open, load]);

  const send = async () => {
    if (!picking || !user?.id) return;
    setBusy(true);
    try {
      const res = await fetch("/api/clinic-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counselorUserId: user.id, sessionId, clinicId: picking.id, note: note.trim() || undefined }),
      });
      const data = await res.json();
      if (data.ok) {
        showAppToast(t.suggest.sent, t.suggest.sentSub.replace("{clinic}", picking.name));
        setPicking(null);
        setNote("");
        onOpenChange(false);
        onSuggested();
      } else {
        showAppToast(t.common.errorServer, "");
      }
    } finally {
      setBusy(false);
    }
  };

  const wilayaLabel = (w: string | null) => {
    if (!w) return "";
    const rec = WILAYA_LIST.find((x) => x.key === w);
    return rec ? (lang === "ar" ? rec.ar : lang === "fr" ? w && rec.fr : rec.en) : w;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-start flex items-center gap-2 text-base">
            <Building2 className="h-4.5 w-4.5 text-primary" />
            {t.suggest.title}
          </DialogTitle>
          <DialogDescription className="text-start text-xs leading-relaxed">{t.suggest.desc}</DialogDescription>
        </DialogHeader>

        {/* الفلاتر */}
        <div className="grid grid-cols-2 gap-2">
          <Select value={fWilaya} onValueChange={setFWilaya}>
            <SelectTrigger className="rounded-xl bg-card font-semibold text-xs"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-60">
              <SelectItem value="all">{t.clinics.allWilayas}</SelectItem>
              {WILAYA_LIST.map((w) => (
                <SelectItem key={w.key} value={w.key}>{lang === "ar" ? w.ar : lang === "fr" ? w.fr : w.en}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={fSpec} onValueChange={setFSpec}>
            <SelectTrigger className="rounded-xl bg-card font-semibold text-xs"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-60">
              <SelectItem value="all">{t.clinics.allSpecialties}</SelectItem>
              {SPECIALTIES.map((s) => (
                <SelectItem key={s} value={s}>{t.client.specialties[s as SpecialtyKey]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={fMinYears} onValueChange={setFMinYears}>
            <SelectTrigger className="rounded-xl bg-card font-semibold text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">{t.clinics.anyExperience}</SelectItem>
              {["3", "5", "10", "15", "20"].map((y) => (
                <SelectItem key={y} value={y}>{t.clinics.minYears.replace("{n}", y)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder={t.clinics.cityPlaceholder} value={fCity} onChange={(e) => setFCity(e.target.value)} className="rounded-xl bg-card font-semibold text-xs" />
          <div className="relative col-span-2">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder={t.suggest.searchPh} value={fQuery} onChange={(e) => setFQuery(e.target.value)} className="rounded-xl bg-card font-semibold text-xs ps-9" />
          </div>
        </div>

        {/* النتائج */}
        <div className="space-y-2 min-h-24">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : clinics.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground font-semibold py-8">{t.suggest.noResults}</p>
          ) : (
            clinics.slice(0, 12).map((c) => {
              const already = suggestedIds.includes(c.id);
              return (
                <div key={c.id} className={`rounded-xl border px-3.5 py-3 space-y-1.5 ${already ? "border-primary/40 bg-primary/5" : "border-border/70 bg-card"}`}>
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-sm truncate">{c.name}</p>
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground font-semibold">
                        {(c.wilaya || c.city) ? (
                          <span className="flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0" />{wilayaLabel(c.wilaya)}{c.city ? ` · ${c.city}` : ""}</span>
                        ) : null}
                        {c.yearsExperience > 0 ? <span>{c.yearsExperience} {t.clinics.yearsExp}</span> : null}
                        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-black" dir="ltr"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{c.rating.toFixed(1)}</span>
                      </div>
                    </div>
                    {already ? (
                      <Badge className="bg-primary/12 text-primary border-0 gap-1 shrink-0"><Check className="h-3 w-3" />{t.suggest.alreadySent}</Badge>
                    ) : (
                      <Button size="sm" className="gradient-primary text-white font-black rounded-lg shrink-0" onClick={() => { setPicking(c); setNote(""); }}>
                        <Send className="h-3.5 w-3.5" />
                        {t.suggest.suggestBtn}
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {[...c.specialties, ...c.customSpecialties].slice(0, 3).map((s) => (
                      <Badge key={s} variant="secondary" className="text-[10px] font-semibold">{t.client.specialties[s as SpecialtyKey] ?? s}</Badge>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* تأكيد الاقتراح مع ملاحظة */}
        {picking ? (
          <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-black">{t.suggest.confirmTitle.replace("{clinic}", picking.name)}</p>
              <button type="button" onClick={() => setPicking(null)} aria-label="close"><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="rounded-xl min-h-16 bg-card" maxLength={400} placeholder={t.suggest.notePh} />
            <Button className="w-full gradient-primary text-white font-black rounded-xl" disabled={busy} onClick={send}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {t.suggest.sendBtn}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
