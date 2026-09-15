"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BadgeCheck, CalendarClock, Languages as LangIcon, SearchX, ChevronLeft, ChevronRight, Users, MessageCircle, Star } from "lucide-react";
import { openDm } from "@/components/shared/dm-dialog";
import { openRatings } from "@/components/shared/ratings-dialog";
import { useRef } from "react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { fmtMoney } from "@/lib/money";
import { priceForCurrency } from "@/lib/constants";
import { waLink } from "@/lib/whatsapp";
import { WhatsAppGlyph } from "@/components/session/whatsapp-panel";
import type { CurrencyCode } from "@/lib/constants";
import type { SpecialtyKey } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BackButton } from "@/components/shared/back-button";
import { RoyalCrown } from "@/components/shared/crown-badge";
import { FacebookGlyph, InstagramGlyph, TikTokGlyph } from "@/components/shared/social-glyphs";
import { BookingDialog, type CounselorCard } from "./client-find";

const PER_PAGE = 8;

/**
 * دليل الأخصائيين — صفحة عامة تُظهر كل الأخصائيين الموثّقين ببطاقات جميلة
 * (صورتهم إن وُجدت، تخصصاتهم، سنوات خبرتهم) مع pagination مناسبة،
 * وإمكانية حجز موعد مباشرة بحساب العميل — نفس نمط الحجز في «اختر مختصاً».
 */
export function CounselorsDirectoryView() {
  const { t, lang } = useI18n();
  const { user, setView, currency } = useApp();
  const [counselors, setCounselors] = useState<CounselorCard[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    /* silent: تحديث في الخلفية بلا هيكل تحميل ولا إعادة تحريك — لا يشعر به المستخدم */
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/counselors");
      const data = await res.json();
      setCounselors(data.counselors || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* v2.8.0: ترتيب الأخصائيين حسب الخبرة من الأكثر إلى الأقل */
  const sorted = [...counselors].sort((a, b) => (b.yearsExperience || 0) - (a.yearsExperience || 0));

  const pages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const safePage = Math.min(page, pages);
  const visible = sorted.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  /* v2.8.0: عند «التالي» يمرّر تلقائياً لأول بطاقة في الصفحة الجديدة —
     لا صعود ونزول يدوي في كل مرة */
  const gridRef = useRef<HTMLDivElement>(null);
  const firstPageRender = useRef(true);
  useEffect(() => {
    if (firstPageRender.current) {
      firstPageRender.current = false;
      return;
    }
    requestAnimationFrame(() => {
      gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [safePage]);
  const Arrow = lang === "ar" ? ChevronLeft : ChevronRight;
  const ArrowBack = lang === "ar" ? ChevronRight : ChevronLeft;
  const pageInfo = t.directory.pageInfo.replace("{p}", String(safePage)).replace("{n}", String(pages));
  /* تحديث صامت كل 5 دقائق (300000ms) — يجدد البيانات في الخلفية فقط:
     بلا هيكل تحميل وبلا إعادة تحريك البطاقات، المستخدم لا يلاحظ شيئاً */
  useEffect(() => {
    const i = setInterval(() => load(true), 5 * 60 * 1000);
    return () => clearInterval(i);
  }, [load]);

  const book = (c: CounselorCard) => {
    if (!user) {
      setView("client-start");
      return;
    }
    window.dispatchEvent(new CustomEvent("open-booking", { detail: c }));
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 md:py-14">
      <BackButton />
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-2 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <Users className="h-5.5 w-5.5 text-primary" />
          </div>
          <h1 className="text-2xl md:text-3xl font-black">{t.directory.title}</h1>
        </div>
        <p className="text-muted-foreground">{t.directory.desc}</p>
      </motion.div>

      {loading ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="h-48 animate-pulse bg-muted/50 border-border/50" />
          ))}
        </div>
      ) : counselors.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center space-y-3 text-muted-foreground">
            <SearchX className="h-10 w-10 mx-auto opacity-40" />
            <p className="font-semibold">{t.directory.empty}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div ref={gridRef} className="grid sm:grid-cols-2 gap-4 scroll-mt-24">
            {visible.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
              >
                <Card className={`card-aurora h-full transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 ${c.available ? "border-primary/30" : "opacity-75"} border-border/70`}>
                  <CardContent className="p-5 space-y-3.5">
                    <div className="flex items-start gap-4">
                      {/* v2.7.0: التاج الملكي فوق صورة فائز التحدي في الدليل أيضاً */}
                      <div className="relative shrink-0">
                        {c.challengeWinner && (
                          <div className="absolute -top-4 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 z-20 drop-shadow-md">
                            <RoyalCrown size={32} />
                          </div>
                        )}
                        <Avatar className="h-22 w-22 rounded-2xl shrink-0">
                          {c.photoUrl ? (
                            <AvatarImage src={c.photoUrl} alt={c.fullName} loading="lazy" className="rounded-2xl object-cover" />
                          ) : null}
                          <AvatarFallback className="gradient-primary text-white rounded-2xl font-black text-3xl">
                            {c.fullName.replace("د. ", "").charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black leading-tight">{c.fullName}</span>
                          <Badge className="bg-primary/12 text-primary border-0 hover:bg-primary/12 gap-1">
                            <BadgeCheck className="h-3 w-3" />
                            {t.client.verified}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground font-semibold">
                          <span>{c.yearsExperience} {t.client.yearsExp}</span>
                          <span>·</span>
                          <span>{c.sessionsCount} {t.client.sessionsDone}</span>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <LangIcon className="h-3 w-3" />
                            {c.languages.map((l) => (l === "ar" ? "ع" : l === "fr" ? "FR" : l === "en" ? "EN" : l === "tr" ? "TR" : l === "ru" ? "RU" : "中文")).join(" · ")}
                          </span>
                          {/* v1.3.0: سعر الجلسة بعملة عرض العميل — بلا أي تحويل */}
                          <span className="ms-auto rounded-full bg-primary/12 text-primary font-black px-2.5 py-0.5" dir="ltr">
                            {fmtMoney(
                              priceForCurrency((c as { sessionPrices?: unknown }).sessionPrices, currency as CurrencyCode, (c as { sessionPrice?: number }).sessionPrice),
                              currency as CurrencyCode,
                              lang
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* v2.10.0: النبذة التعريفية كاملة — بلا اختصار، العميل يقرأ كل ما كتبه الأخصائي */}
                    {c.bio && (
                      <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{c.bio}</p>
                    )}

                    {/* v2.9.0: أيقونات حقيقية لوسائل التواصل — تظهر فقط من أضاف روابطه */}
                    {(() => {
                      const so = c.socials as { facebook?: string | null; instagram?: string | null; tiktok?: string | null } | undefined;
                      if (!so || (!so.facebook && !so.instagram && !so.tiktok)) return null;
                      return (
                        <div className="flex items-center gap-2">
                          {so.facebook && (
                            <a href={so.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" title="Facebook"
                               className="h-8 w-8 rounded-lg bg-[#1877F2]/10 hover:bg-[#1877F2]/20 text-[#1877F2] flex items-center justify-center transition-all">
                              <FacebookGlyph className="h-4 w-4" />
                            </a>
                          )}
                          {so.instagram && (
                            <a href={so.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" title="Instagram"
                               className="h-8 w-8 rounded-lg bg-[#E4405F]/10 hover:bg-[#E4405F]/20 text-[#E4405F] flex items-center justify-center transition-all">
                              <InstagramGlyph className="h-4 w-4" />
                            </a>
                          )}
                          {so.tiktok && (
                            <a href={so.tiktok} target="_blank" rel="noopener noreferrer" aria-label="TikTok" title="TikTok"
                               className="h-8 w-8 rounded-lg bg-foreground/10 hover:bg-foreground/20 text-foreground flex items-center justify-center transition-all">
                              <TikTokGlyph className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      );
                    })()}

                    {/* كل التخصصات تُعرض كاملة — الجاهزة مترجمة والخاصة كما كتبها الأخصائي */}
                    <div className="flex flex-wrap gap-1.5">
                      {c.specialties.map((s) => (
                        <Badge key={s} variant="secondary" className="text-[11px] font-semibold">
                          {t.client.specialties[s as SpecialtyKey] ?? s}
                        </Badge>
                      ))}
                      {(c.customSpecialties || []).map((cs) => (
                        <Badge key={`c-${cs}`} variant="secondary" className="text-[11px] font-semibold">
                          {cs}
                        </Badge>
                      ))}
                    </div>

                    {/* v2.14.0: زر التقييمات واضح وصريح — نجوم كاملة + اسم مفهوم من أول نظرة
                        (طلب المستخدم) — يفتح نافذة المتوسط والتوزيع والتعليقات */}
                    <button
                      type="button"
                      onClick={() => openRatings(c.userId, c.fullName)}
                      className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-amber-400/50 bg-amber-400/[0.07] hover:bg-amber-400/[0.14] px-3 py-2 text-sm font-black text-amber-600 dark:text-amber-400 transition-colors"
                    >
                      <span className="flex items-center gap-0.5" dir="ltr" aria-hidden="true">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star key={s} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        ))}
                      </span>
                      {t.rating.cardBtn}
                      <span className="font-mono text-xs" dir="ltr">{(c.rating ?? 5).toFixed(1)}</span>
                    </button>

                    {/* عمودان على الهاتف (الحالة ثم الزر بعرض كامل) وسطر واحد على الشاشات الأكبر
                        — يمنع تراكب زر الحجز على النصوص مهما طال نصها (مثل الفرنسية) */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
                      <span className={`text-xs font-bold flex items-center gap-1.5 ${c.available ? "text-primary" : "text-muted-foreground"}`}>
                        <span className={`h-2 w-2 rounded-full shrink-0 ${c.available ? "bg-primary animate-pulse" : "bg-muted-foreground/40"}`} />
                        {c.available ? t.client.availableNow : t.client.away}
                      </span>
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        {/* v1.5.0: زر واتساب مباشر في بطاقة الأخصائي (طلب المستخدم) */}
                        {(() => {
                          const wa = waLink((c as { whatsapp?: string | null }).whatsapp, t.directory.waIntro.replace("{counselor}", c.fullName));
                          if (!wa) return null;
                          return (
                            <a
                              href={wa}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={t.directory.waCard}
                              aria-label={t.directory.waCard}
                              className="flex items-center justify-center gap-1.5 rounded-lg bg-[#25D366] hover:bg-[#1fb857] text-white px-3 py-1.5 text-xs font-black shadow-sm transition-all flex-1 sm:flex-none"
                            >
                              <WhatsAppGlyph className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">WhatsApp</span>
                            </a>
                          );
                        })()}
                        {/* v2.8.0: تواصل قبل طلب الجلسة */}
                        {(!user || user.role === "VICTIM") && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-lg font-bold border-primary/40 text-primary flex-1 sm:flex-none justify-center"
                            title={t.dm.contactBtn}
                            onClick={() => {
                              if (!user) {
                                setView("client-start");
                                return;
                              }
                              openDm(c.userId, c.fullName);
                            }}
                          >
                            <MessageCircle className="h-4 w-4" />
                            <span className="hidden sm:inline">{t.dm.contactBtn}</span>
                          </Button>
                        )}
                        {(!user || user.role === "VICTIM") && (
                          <Button
                            size="sm"
                            className="gradient-primary text-white font-bold rounded-lg flex-1 sm:flex-none justify-center"
                            disabled={!!user && !c.available}
                            onClick={() => book(c)}
                          >
                            <CalendarClock className="h-4 w-4" />
                            {user ? t.client.bookBtn : t.directory.loginToBook}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-8">
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg font-bold"
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
              >
                <ArrowBack className="h-4 w-4" />
                {t.directory.prev}
              </Button>
              <span className="text-xs font-bold text-muted-foreground font-mono px-2">{pageInfo}</span>
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg font-bold"
                disabled={safePage >= pages}
                onClick={() => setPage(safePage + 1)}
              >
                {t.directory.next}
                <Arrow className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      <BookingDialog counselors={counselors} onBooked={() => setView("client-sessions")} />
    </div>
  );
}
