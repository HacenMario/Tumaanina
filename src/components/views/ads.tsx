"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Megaphone, SearchX, MapPin, Building2, RefreshCw, ChevronLeft, ChevronRight, Heart, MessageCircle, Send, Loader2, BadgeDollarSign } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { WILAYA_LIST } from "@/lib/constants";
import { WhatsAppGlyph } from "@/components/session/whatsapp-panel";
import { waLink } from "@/lib/whatsapp";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { BackButton } from "@/components/shared/back-button";
import { showAppToast } from "@/components/shared/app-toast";
import { openClinicPage } from "./clinics-directory";
import { cn , formatDateTime} from "@/lib/utils";

/* ═ v1.15.0 — صفحة إعلانات العيادات (عامة) ═
   تعرض الإعلانات المعتمدة فقط، بترقيم صفحات من الخادم (8 لكل صفحة).
   كل إعلان: سلايدر وسائط (حتى 5 صور + فيديو) بالسحب يمين/يسار،
   شارة «إعلان مدفوع»، إعجاب وتعليق للعميل والمختص، وبطاقة العيادة
   الناشرة. لا شيء في هذه الصفحة يدل على مستحقات أو مدفوعات إدارية. */

interface PublicComment {
  name: string;
  text: string;
  /* v1.17.0: الرد يحمل اسم العيادة صاحبة الإعلان */
  reply: { text: string | null; name: string | null } | null;
  createdAt: string | null;
}

interface AdItem {
  id: string;
  title: string;
  body: string;
  mediaUrls: string[];
  imageUrl: string | null;
  publishedAt: string;
  likesCount: number;
  likedByMe: boolean;
  commentsCount: number;
  comments: PublicComment[];
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
    hasLogo: boolean;
    logoUrl: string;
  };
}

function isVideo(url: string) {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

export function AdsView() {
  const { t, lang } = useI18n();
  const user = useApp((s) => s.user);
  const [ads, setAds] = useState<AdItem[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  /* التعليق المفتوح لكل إعلان + نصه */
  const [commentOpen, setCommentOpen] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  /* v1.17.0: سحب باللمس يمين/يسار على البطاقة = التنقل بين الإعلانات */
  const cardTouchX = useRef<number | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page) });
      if (user?.id) qs.set("viewerId", user.id);
      const res = await fetch(`/api/ads?${qs.toString()}`);
      const data = await res.json();
      setAds(data.ads || []);
      setPages(data.pages || 1);
      setTotal(data.total || 0);
    } catch {
      setAds([]);
      setPages(1);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleLike = async (adId: string) => {
    if (!user) {
      showAppToast(t.ads.loginToReact, "");
      return;
    }
    setBusy(adId);
    try {
      const res = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "like", userId: user.id, id: adId }),
      });
      const data = await res.json();
      if (data.ok) {
        setAds((prev) =>
          prev.map((a) =>
            a.id === adId ? { ...a, likedByMe: data.likedByMe, likesCount: data.likesCount } : a
          )
        );
      }
    } finally {
      setBusy(null);
    }
  };

  const submitComment = async (adId: string) => {
    if (!user) {
      showAppToast(t.ads.loginToReact, "");
      return;
    }
    const text = commentText.trim();
    if (!text) return;
    setBusy(adId);
    try {
      const res = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "comment", userId: user.id, id: adId, text }),
      });
      if (res.ok) {
        setCommentText("");
        setCommentOpen(null);
        load(true);
        showAppToast(t.ads.commentSent, "");
      }
    } finally {
      setBusy(null);
    }
  };

  const wilayaLabel = (w: string | null) => {
    if (!w) return "";
    const rec = WILAYA_LIST.find((x) => x.key === w);
    return rec ? (lang === "ar" ? rec.ar : lang === "fr" ? rec.fr : rec.en) : w;
  };

  /* v1.16.0: التنسيق الموحد YYYY/MM/DD HH:MM:SS في كل مكان */
  const fmtDate = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return formatDateTime(d);
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
        <Card className="h-96 animate-pulse bg-muted/50 border-border/50 max-w-full" />
      ) : ads.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center space-y-3 text-muted-foreground">
            <SearchX className="h-10 w-10 mx-auto opacity-40" />
            <p className="font-semibold">{t.ads.empty}</p>
          </CardContent>
        </Card>
      ) : (
        <div
          className="w-full max-w-full overflow-x-hidden"
          onTouchStart={(e) => {
            cardTouchX.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            if (cardTouchX.current === null) return;
            const dx = (e.changedTouches[0]?.clientX ?? 0) - cardTouchX.current;
            cardTouchX.current = null;
            if (Math.abs(dx) < 60) return;
            if (dx < 0 && page < pages) setPage(page + 1);
            else if (dx > 0 && page > 1) setPage(page - 1);
          }}
        >
          {ads.map((a, i) => (
            <motion.div key={a.id} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: (i % 8) * 0.05 }}>
              <Card className="w-full max-w-full border-border/70 hover:shadow-lg transition-all">
                <CardContent className="p-5 space-y-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-black text-lg leading-snug min-w-0">{a.title}</h2>
                    {/* شارة «إعلان مدفوع» — إفصاح قياسي دون أي تفاصيل مالية */}
                    <span className="inline-flex items-center gap-1 shrink-0 rounded-full bg-amber-400/12 text-amber-600 dark:text-amber-400 text-[10px] font-black px-2.5 py-1">
                      <BadgeDollarSign className="h-3 w-3" />
                      {t.floatingAd.badge}
                    </span>
                  </div>

                  {/* سلايدر الوسائط — حتى 5 صور + فيديو، بالسحب يمين/يسار */}
                  {a.mediaUrls.length > 0 ? (
                    <AdMediaCarousel urls={a.mediaUrls} title={a.title} />
                  ) : null}

                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{a.body}</p>

                  {/* الإعجاب والتعليق — للعملاء والمختصين */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busy === a.id}
                      onClick={() => void toggleLike(a.id)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-black transition-all",
                        a.likedByMe
                          ? "border-rose-400/50 bg-rose-500/10 text-rose-500"
                          : "border-border/70 bg-card text-muted-foreground hover:border-rose-400/40 hover:text-rose-500"
                      )}
                    >
                      <Heart className={cn("h-3.5 w-3.5", a.likedByMe && "fill-rose-500")} />
                      {a.likesCount}
                    </button>
                    {/* v1.15.1: زر التعليقات يعرض العدد فقط — القائمة تُفتح بالنقر عليه */}
                    <button
                      type="button"
                      onClick={() => { setCommentOpen(commentOpen === a.id ? null : a.id); setCommentText(""); }}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-black transition-all",
                        commentOpen === a.id
                          ? "border-primary/50 bg-primary/10 text-primary"
                          : "border-border/70 bg-card text-muted-foreground hover:border-primary/40 hover:text-primary"
                      )}
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      {t.ads.showComments}
                      <span className="rounded-full bg-muted px-1.5 font-mono text-[10px]">{a.commentsCount}</span>
                    </button>
                  </div>

                  {/* v1.15.1: التعليقات لا تظهر إلا بعد الضغط على الزر — تفادي طول الصفحة */}
                  {commentOpen === a.id ? (
                    <div className="space-y-2">
                      {a.comments.length > 0 ? (
                        <div className="max-h-72 overflow-y-auto space-y-1.5 rounded-xl border border-border/60 bg-muted/20 p-2">
                          {a.comments.map((c, ci) => (
                            <div key={ci} className="rounded-xl bg-muted/40 px-3 py-2 space-y-1">
                              <p className="text-[11px] font-black">{c.name}</p>
                              <p className="text-xs text-muted-foreground leading-relaxed" dir="auto">{c.text}</p>
                              {c.reply?.text ? (
                                <div className="rounded-lg bg-primary/5 border border-primary/20 px-2.5 py-1.5">
                                  {/* v1.17.0: اسم العيادة صاحبة الرد — يأتي من الخادم */}
                                  <p className="text-[10px] font-black text-primary">{c.reply.name || t.ads.clinicReply}</p>
                                  <p className="text-xs font-semibold leading-relaxed" dir="auto">{c.reply.text}</p>
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] font-bold text-muted-foreground px-1">{t.ads.noCommentsYet}</p>
                      )}
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          className="rounded-xl bg-card h-10 text-sm"
                          maxLength={300}
                          placeholder={t.ads.commentPh}
                        />
                        <Button size="sm" className="gradient-primary text-white font-black rounded-xl h-10 shrink-0" disabled={!commentText.trim() || busy === a.id} onClick={() => void submitComment(a.id)}>
                          {busy === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {/* العيادة الناشرة */}
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-2.5">
                    <button type="button" className="flex items-center gap-3 w-full text-start group" onClick={() => openClinicPage(a.clinic.slug, a.clinic.id)}>
                      <Avatar className="h-11 w-11 rounded-xl shrink-0 border border-border/60 bg-card">
                        {a.clinic.hasLogo ? (
                          <AvatarImage src={a.clinic.logoUrl} alt={a.clinic.name} loading="lazy" className="rounded-xl object-contain p-1" />
                        ) : null}
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

                  <p className="text-[10px] text-muted-foreground/70 font-semibold">{t.ads.publishedOn} {fmtDate(a.publishedAt)}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* v1.17.0: أزرار التنقل بين الإعلانات + العدّاد — إعلان واحد لكل صفحة */}
      {pages > 1 ? (
        <div className="flex items-center justify-center gap-3 mt-8">
          <Button variant="outline" size="sm" className="rounded-lg font-bold" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            {t.directory.prev}
          </Button>
          <span className="text-xs font-bold text-muted-foreground font-mono px-2">{t.directory.pageInfo.replace("{p}", String(page)).replace("{n}", String(pages))}</span>
          <Button variant="outline" size="sm" className="rounded-lg font-bold" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            {t.directory.next}
          </Button>
        </div>
      ) : null}

      {!loading && ads.length > 0 && pages <= 1 ? (
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

/* سلايدر وسائط الإعلان — سحب يمين/يسار + أسهم */
function AdMediaCarousel({ urls, title }: { urls: string[]; title: string }) {
  const [slide, setSlide] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const safe = Math.min(slide, urls.length - 1);

  const next = () => setSlide((s) => (s < urls.length - 1 ? s + 1 : 0));
  const prev = () => setSlide((s) => (s > 0 ? s - 1 : urls.length - 1));

  return (
    <div
      className="relative rounded-xl overflow-hidden border border-border/60 aspect-[16/10] bg-muted/40 select-none max-w-full"
      onTouchStart={(e) => {
        /* v1.17.0: نوقف انتقال اللمس للبطاقة حتى لا يقلب سحب الوسائط الإعلان نفسه */
        e.stopPropagation();
        touchStartX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        e.stopPropagation();
        if (touchStartX.current === null) return;
        const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
        if (Math.abs(dx) > 40) {
          if (dx < 0) next();
          else prev();
        }
        touchStartX.current = null;
      }}
    >
      {isVideo(urls[safe]) ? (
        <video key={urls[safe]} src={urls[safe]} className="h-full w-full object-contain" controls playsInline muted />
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        /* v1.15.1: object-contain — الصورة كاملة داخل إطارها بلا قصّ، بأي أبعاد كانت */
        <img src={urls[safe]} alt={title} loading="lazy" className="h-full w-full object-contain" draggable={false} />
      )}
      {urls.length > 1 ? (
        <>
          <button type="button" onClick={prev} aria-label="prev" className="absolute start-1.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center">
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
          </button>
          <button type="button" onClick={next} aria-label="next" className="absolute end-1.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center">
            <ChevronRight className="h-4 w-4 rtl:rotate-180" />
          </button>
          <div className="absolute bottom-1.5 inset-x-0 flex items-center justify-center gap-1">
            {urls.map((_, i) => (
              <span key={i} className={cn("h-1.5 rounded-full transition-all", i === safe ? "w-4 bg-white" : "w-1.5 bg-white/50")} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
