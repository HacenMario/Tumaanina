"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Megaphone, SearchX, MapPin, Building2, RefreshCw } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { WILAYA_LIST } from "@/lib/constants";
import { WhatsAppGlyph } from "@/components/session/whatsapp-panel";
import { waLink } from "@/lib/whatsapp";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BackButton } from "@/components/shared/back-button";
import { openClinicPage } from "./clinics-directory";

/* ═ v1.14.0 — صفحة إعلانات العيادات (عامة) ═
   تعرض الإعلانات المعتمدة فقط — كل إعلان وصل هنا مرّ على موافقة
   الإدارة بعد التواصل مع العيادة والتأكد من سداد مستحقات النشر.
   بطاقة الإعلان: العنوان، النص، الصورة إن وُجدت، وبطاقة العيادة
   الناشرة (شعارها + موقعها + واتساب + زر صفحتها). */

interface AdItem {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  publishedAt: string;
  clinic: {
    id: string;
    name: string;
    slug: string | null;
    wilaya: string | null;
    city: string | null;
    address: string | null;
    phone: string | null;
    whatsapp: string | null;
    website: string | null;
    logoUrl: string;
  };
}

export function AdsView() {
  const { t, lang } = useI18n();
  const [ads, setAds] = useState<AdItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/ads");
      const data = await res.json();
      setAds(data.ads || []);
    } catch {
      setAds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const wilayaLabel = (w: string | null) => {
    if (!w) return "";
    const rec = WILAYA_LIST.find((x) => x.key === w);
    return rec ? (lang === "ar" ? rec.ar : lang === "fr" ? rec.fr : rec.en) : w;
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 md:py-14">
      <BackButton />
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-2 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <Megaphone className="h-5.5 w-5.5 text-primary" />
          </div>
          <h1 className="text-2xl md:text-3xl font-black">{t.ads.title}</h1>
        </div>
        <p className="text-muted-foreground leading-relaxed">{t.ads.desc}</p>
      </motion.div>

      {loading ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="h-56 animate-pulse bg-muted/50 border-border/50" />
          ))}
        </div>
      ) : ads.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center space-y-3 text-muted-foreground">
            <SearchX className="h-10 w-10 mx-auto opacity-40" />
            <p className="font-semibold">{t.ads.empty}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {ads.map((a, i) => (
            <motion.div key={a.id} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
              <Card className="h-full border-border/70 hover:shadow-lg transition-all">
                <CardContent className="p-5 space-y-3.5">
                  <h2 className="font-black text-lg leading-snug">{a.title}</h2>
                  {a.imageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={a.imageUrl} alt={a.title} loading="lazy" className="rounded-xl w-full max-h-56 object-cover border border-border/60" />
                  ) : null}
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{a.body}</p>

                  {/* العيادة الناشرة */}
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-2.5">
                    <button type="button" className="flex items-center gap-3 w-full text-start group" onClick={() => openClinicPage(a.clinic.slug, a.clinic.id)}>
                      <Avatar className="h-11 w-11 rounded-xl shrink-0 border border-border/60 bg-card">
                        <AvatarImage src={a.clinic.logoUrl} alt={a.clinic.name} loading="lazy" className="rounded-xl object-contain p-1" />
                        <AvatarFallback className="gradient-primary text-white rounded-xl font-black text-lg">{a.clinic.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="font-black text-sm truncate group-hover:text-primary transition-colors">{a.clinic.name}</p>
                        {(a.clinic.wilaya || a.clinic.city) ? (
                          <p className="text-[11px] text-muted-foreground font-semibold flex items-center gap-1 truncate">
                            <MapPin className="h-3 w-3 shrink-0" />
                            {wilayaLabel(a.clinic.wilaya)}{a.clinic.city ? ` · ${a.clinic.city}` : ""}
                          </p>
                        ) : null}
                      </div>
                      <Building2 className="h-4 w-4 text-primary shrink-0" />
                    </button>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" className="rounded-lg font-bold border-primary/40 text-primary flex-1 justify-center h-8" onClick={() => openClinicPage(a.clinic.slug, a.clinic.id)}>
                        {t.ads.visitClinic}
                      </Button>
                      {(() => {
                        const wa = waLink(a.clinic.whatsapp, t.clinics.waIntro.replace("{clinic}", a.clinic.name));
                        if (!wa) return null;
                        return (
                          <a href={wa} target="_blank" rel="noopener noreferrer" title={t.clinics.waBtn} aria-label={t.clinics.waBtn} className="flex items-center justify-center rounded-lg bg-[#25D366] hover:bg-[#1fb857] text-white px-3 h-8 text-xs font-black shadow-sm transition-all">
                            <WhatsAppGlyph className="h-3.5 w-3.5" />
                          </a>
                        );
                      })()}
                    </div>
                  </div>

                  <p className="text-[10px] text-muted-foreground/70 font-semibold">{t.ads.publishedOn} {new Date(a.publishedAt).toLocaleDateString(lang === "ar" ? "ar-DZ" : lang === "fr" ? "fr-FR" : "en-US")}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {!loading && ads.length > 0 ? (
        <div className="flex justify-center mt-6">
          <Button variant="outline" size="sm" className="rounded-lg font-bold gap-1.5" onClick={() => load()}>
            <RefreshCw className="h-3.5 w-3.5" />
            {t.clinicDash.refresh}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
