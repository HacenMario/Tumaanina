import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { connectDB } from "@/lib/db";
import { CounselorProfile, SupportSession } from "@/lib/models";
import { LogoMark } from "@/lib/logo";
import { BadgeCheck, GraduationCap, ShieldCheck, CalendarClock, Trophy, Share2 } from "lucide-react";
import { formatYearMonth } from "@/lib/utils";
import { ensureCounselorSlug } from "@/lib/server/slug";
import { getChallengeWinner } from "@/lib/server/challenge";
import { RoyalCrown } from "@/components/shared/crown-badge";
import { FacebookGlyph, InstagramGlyph, TikTokGlyph } from "@/components/shared/social-glyphs";
import { ar } from "@/lib/i18n/ar";
import { fr } from "@/lib/i18n/fr";
import { en } from "@/lib/i18n/en";
import { tr } from "@/lib/i18n/tr";
import { ru } from "@/lib/i18n/ru";
import { zh } from "@/lib/i18n/zh";
import { es } from "@/lib/i18n/es";
import { de } from "@/lib/i18n/de";
import { it } from "@/lib/i18n/it";
import type { AppLang, CurrencyCode } from "@/lib/constants";
import { CURRENCY_CODES, buildSessionPrices } from "@/lib/constants";
import { ShareButton } from "./share-button";

export const dynamic = "force-dynamic";

/* ─── الملف العام للأخصائي — v2.5.5 ───
   صفحة عمومية قابلة للمشاركة (سيرة ذاتية، واتساب، LinkedIn).
   الرابط بالاسم الكامل بلا مسافات: /counselor/drtest — وقبلها كان
   بمعرّف قاعدة البيانات (ما زال صالحاً ويُحوَّل تلقائياً إلى الرابط الجديد).
   زر «احجز جلستك الآن» يفتح المنصة ويبدأ الحجز مع هذا الأخصائي مباشرة
   عبر /?book={userId}. تُعرض فقط بيانات آمنة للنشر — لا واتساب ولا
   شهادات ولا هوية أخصائية سرية. */

type Dict = typeof ar;
/* v2.11.0: الصفحة العمومية بست لغات كاملة — كانت التركية/الروسية/الصينية
   تعرض الإنجليزية احتياطاً */
const DICTS: Partial<Record<AppLang, Dict>> = { ar, fr, en, tr, ru, zh, es, de, it };

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string }>;
}

const OBJECT_ID = /^[0-9a-f]{24}$/i;

/* فكّ ترميز الرابط إن وُجد — App Router يمرّر معاملات المسار مُرمَّزة
   (percent-encoded) ولا يفكّها تلقائياً، والأسماء العربية تحتاج فكّاً صريحاً */
function decodeParam(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/* حلّ المعامل: معرّف قاعدة البيانات أو الاسم في الرابط (slug) */
async function resolveProfile(idParam: string): Promise<Record<string, unknown> | null> {
  const decoded = decodeParam(idParam);
  if (OBJECT_ID.test(decoded)) {
    const byId = (await CounselorProfile.findById(decoded).lean()) as Record<string, unknown> | null;
    if (byId) return byId;
  }
  const bySlug = (await CounselorProfile.findOne({ slug: decoded.toLowerCase() }).lean()) as Record<string, unknown> | null;
  if (bySlug) return bySlug;
  /* احتياط: البحث بالقيمة الخام كما وردت */
  if (decoded !== idParam) {
    const byRaw = (await CounselorProfile.findOne({ slug: idParam.toLowerCase() }).lean()) as Record<string, unknown> | null;
    if (byRaw) return byRaw;
  }
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    await connectDB();
    const p = await resolveProfile(id);
    if (p) {
      const name = (p as { fullName?: string }).fullName || "";
      const bio = (p as { bio?: string | null }).bio || "";
      return {
        title: `${name} — طمأنينة`,
        description: bio || `الملف المهني للأخصائي ${name} على منصة طمأنينة — استشارات نفسية احترافية وسرّية عبر الإنترنت في الجزائر`,
      };
    }
  } catch {
    /* قاعدة البيانات غير متاحة — تعود الميتاداتا الافتراضية */
  }
  return { title: "طمأنينة — ملف أخصائي" };
}

export default async function PublicCounselorPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { lang: langParam } = await searchParams;
  const lang: AppLang =
    langParam === "fr" || langParam === "en" || langParam === "tr" || langParam === "ru" || langParam === "zh" ||
    langParam === "es" || langParam === "de" || langParam === "it"
      ? langParam
      : "ar";
  const t = DICTS[lang] ?? DICTS.ar!;
  const dir = lang === "ar" ? "rtl" : "ltr";

  await connectDB();
  const p = await resolveProfile(id);

  if (!p) notFound();

  /* v2.5.5: الرابط القياسي هو اسم الأخصائي (slug) — الوصول بمعرّف قاعدة
     البيانات (أو بأي شكل آخر) يُحوَّل تلقائياً إلى /counselor/{slug}.
     ملاحظة: encodeURIComponent إلزامي للأسماء العربية — ترويسة Location
     في HTTP يجب أن تكون ASCII وإلا فشل التحويل بخطأ 500 */
  const slug = await ensureCounselorSlug(p);
  const slugEnc = encodeURIComponent(slug);
  if (!slug || decodeParam(id) !== slug) {
    redirect(`/counselor/${slugEnc}${langParam ? `?lang=${langParam}` : ""}`);
  }

  const verified = p.verificationStatus === "VERIFIED";

  /* عدد الجلسات المكتملة — لحظي من قاعدة البيانات */
  const sessionsCount = verified
    ? await SupportSession.countDocuments({ counselorId: p.userId, status: "COMPLETED" })
    : 0;

  const fullName = String(p.fullName || "");
  const bio = (p.bio as string | null) || null;
  const specialties = (p.specialties as string[]) || [];
  const customSpecialties = (p.customSpecialties as string[]) || [];
  const languages = (p.languages as string[]) || [];
  const yearsExperience = Number(p.yearsExperience) || 0;
  const available = !!p.available;
  const createdAt = p.createdAt ? new Date(p.createdAt as string) : null;
  /* «عضو منذ» بصيغة YYYY/MM — موحّد مع الشهادة وكل المنصة */
  const memberSince = createdAt ? formatYearMonth(createdAt) : null;
  /* الصورة تُقدَّم بمعرّف الملف المهني الحقيقي — لا تعتمد على معامل الرابط (قد يكون slug)
     v1.3.0: ?v= وقت آخر تحديث — يكسر ذاكرة المتصفح فور تغيير الصورة
     (كانت الترويسة تُخبّئ الصورة أسبوعاً كاملاً فلا تظهر الجديدة أبداً) */
  const photoVersion = p.updatedAt ? String(new Date(p.updatedAt as string).getTime() || 0) : "0";
  const photoUrl = p.photo ? `/api/counselors/${String(p._id)}/photo?v=${photoVersion}` : null;
  /* v1.3.0: أسعار الجلسة الثلاثة — تظهر كل العملات المتوفرة في الملف العام */
  const prices = buildSessionPrices((p.sessionPrices as never) ?? null, p.sessionPrice as number | undefined);
  /* v2.7.0: هل هذا الأخصائي هو فائز التحدي؟ التاج يظهر لكل الزوار */
  const winner = await getChallengeWinner();
  const challengeWinner = !!winner && winner.userId === String(p.userId);
  /* v2.5.5: الحجز من الصفحة العمومية يبدأ عملية حجز حقيقية مع هذا الأخصائي */
  const bookHref = `/?book=${String(p.userId)}${langParam ? `&lang=${langParam}` : ""}`;

  /* v2.11.0: روابط التواصل الاجتماعي — تُعرض فقط ما عبّأه الأخصائي في
     إعداداته، وتُبنى الروابط الكاملة من المعرّف إن أدخل @user فقط */
  const socialsRaw = (p.socials as { facebook?: string | null; instagram?: string | null; tiktok?: string | null } | null) || {};
  const socialUrl = (v: string | null | undefined, base: string): string | null => {
    const s = String(v || "").trim();
    if (!s) return null;
    if (/^https?:\/\//i.test(s)) return s;
    const handle = s.replace(/^@/, "").replace(/\/$/, "");
    if (!handle || handle.includes(" ")) return null;
    /* تيكتوك: المعرف الأساسي ينتهي بـ@ — يُلحق المعرّف مباشرة بلا شرطة */
    const joiner = base.endsWith("@") ? "" : "/";
    return `${base}${joiner}${encodeURIComponent(handle)}`;
  };
  const socialLinks = (
    [
      { key: "facebook", url: socialUrl(socialsRaw.facebook, "https://www.facebook.com") || undefined, label: "Facebook" },
      { key: "instagram", url: socialUrl(socialsRaw.instagram, "https://www.instagram.com") || undefined, label: "Instagram" },
      /* تيكتوك: روابط الحسابات بصيغة tiktok.com/@user — لذا المعرف الأساسي يحمل @ */
      { key: "tiktok", url: socialUrl(socialsRaw.tiktok, "https://www.tiktok.com/@") || undefined, label: "TikTok" },
    ] as const
  ).filter((s) => !!s.url);

  /* ─── غير موثّق: رسالة لطيفة بدل التفاصيل ─── */
  if (!verified) {
    return (
      <main dir={dir} className="min-h-dvh bg-gradient-to-b from-teal-50 to-white dark:from-neutral-950 dark:to-neutral-900 flex items-center justify-center px-4 py-16">
        <div className="max-w-md w-full text-center space-y-4 rounded-3xl border border-border bg-card p-10 shadow-lg">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-xl font-black">{t.publicProfile.notAvailable}</h1>
          <p className="text-sm text-muted-foreground font-semibold">{t.publicProfile.notAvailableDesc}</p>
          <a
            href="/"
            className="inline-block rounded-xl bg-primary text-white px-6 py-3 text-sm font-black hover:opacity-90 transition-opacity"
          >
            {t.publicProfile.backHome}
          </a>
        </div>
      </main>
    );
  }

  return (
    <main dir={dir} className="min-h-dvh bg-gradient-to-b from-teal-50 to-white dark:from-neutral-950 dark:to-neutral-900">
      <div className="max-w-2xl mx-auto px-4 py-10 md:py-14">
        {/* رأس المنصة — v2.9.0: الضغط على الشعار يفتح الصفحة الرئيسة للمنصة */}
        <a href="/" className="flex items-center justify-center gap-3 mb-4 rounded-xl hover:opacity-80 transition-opacity" aria-label={t.publicProfile.backHome}>
          <LogoMark size={44} />
          <div className="text-center">
            <p className="font-black text-lg leading-tight">{t.common.appName}</p>
            <p className="text-[11px] text-muted-foreground font-semibold">{t.common.brandSub}</p>
          </div>
        </a>

        {/* مبدّل لغة الصفحة — v2.11.0: ست لغات كاملة بدل ثلاث */}
        <div className="flex items-center justify-center gap-1.5 mb-8 flex-wrap" dir="ltr">
          {(["ar", "fr", "en", "tr", "ru", "zh", "es", "de", "it"] as AppLang[]).map((l) => (
            <a
              key={l}
              href={`/counselor/${encodeURIComponent(slug)}?lang=${l}`}
              className={`rounded-full px-3.5 py-1.5 text-xs font-black transition-colors ${
                l === lang
                  ? "bg-primary text-white shadow"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
              }`}
            >
              {l === "ar" ? "العربية" : l === "fr" ? "Français" : l === "en" ? "English" : l === "tr" ? "Türkçe" : l === "ru" ? "Русский" : l === "zh" ? "中文" : l === "es" ? "Español" : l === "de" ? "Deutsch" : "Italiano"}
            </a>
          ))}
        </div>

        {/* بطاقة الأخصائي */}
        <div className="rounded-3xl border border-border bg-card shadow-xl shadow-primary/5 overflow-hidden">
          {/* رأس البطاقة */}
          <div className="gradient-primary px-6 pt-8 pb-14 text-center relative">
            <div className="absolute inset-x-0 bottom-0 h-10 bg-card" style={{ borderRadius: "50% 50% 0 0 / 100% 100% 0 0" }} />
          </div>
          <div className="px-6 -mt-8 pb-6 text-center space-y-4">
            {/* الصورة أو الحرف الأول — v2.5.5: نُنزِل الصورة قليلاً لتظهر تحت
                الشريط الأخضر (كانت -mt-12 تغرقها فيه)، مع relative+z
                لإبقائها فوق شريط الانحناء */}
            <div className="inline-block relative z-10 mt-3">
              {/* v2.7.0: التاج الملكي فوق صورة فائز التحدي — يظهر لكل الزوار */}
              {challengeWinner && (
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-20 drop-shadow-md">
                  <RoyalCrown size={44} />
                </div>
              )}
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoUrl}
                  alt={fullName}
                  className={`h-24 w-24 rounded-2xl object-cover border-4 border-card shadow-lg mx-auto ${challengeWinner ? "ring-4 ring-amber-400/70" : ""}`}
                />
              ) : (
                <div className={`h-24 w-24 rounded-2xl gradient-primary text-white flex items-center justify-center text-4xl font-black border-4 border-card shadow-lg mx-auto ${challengeWinner ? "ring-4 ring-amber-400/70" : ""}`}>
                  {fullName.replace("د. ", "").charAt(0)}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <h1 className="text-2xl font-black flex items-center justify-center gap-2 flex-wrap" dir="auto">
                {fullName}
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 text-primary px-3 py-1 text-[11px] font-black">
                  <BadgeCheck className="h-3.5 w-3.5" />
                  {t.client.verified}
                </span>
              </h1>
              {/* v2.7.0: شارة فائز التحدي — تحت الاسم مباشرة */}
              {challengeWinner && (
                <p className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-white px-3.5 py-1 text-[11px] font-black shadow shadow-amber-500/30">
                  <Trophy className="h-3.5 w-3.5" />
                  {t.publicProfile.winnerBadge}
                </p>
              )}
              <p className="text-xs font-bold text-muted-foreground flex items-center justify-center gap-2 flex-wrap">
                <span className={`flex items-center gap-1.5 ${available ? "text-primary" : ""}`}>
                  <span className={`h-2 w-2 rounded-full ${available ? "bg-primary animate-pulse" : "bg-muted-foreground/40"}`} />
                  {available ? t.client.availableNow : t.client.away}
                </span>
                {memberSince && (
                  <>
                    <span>·</span>
                    <span className="font-mono" dir="ltr">{t.publicProfile.memberSince.replace("{n}", memberSince)}</span>
                  </>
                )}
              </p>
            </div>

            {/* أرقام سريعة */}
            <div className="grid grid-cols-3 gap-2 max-w-sm mx-auto">
              <div className="rounded-2xl bg-muted/60 py-3 px-2 space-y-0.5">
                <div className="text-xl font-black font-mono">{yearsExperience}</div>
                <div className="text-[10px] font-bold text-muted-foreground">{t.client.yearsExp}</div>
              </div>
              <div className="rounded-2xl bg-muted/60 py-3 px-2 space-y-0.5">
                <div className="text-xl font-black font-mono">{sessionsCount}</div>
                <div className="text-[10px] font-bold text-muted-foreground">{t.publicProfile.sessionsLabel}</div>
              </div>
              <div className="rounded-2xl bg-muted/60 py-3 px-2 space-y-0.5">
                <div className="text-xl font-black font-mono flex items-center justify-center gap-0.5">
                  {languages.map((l) => (l === "ar" ? "ع" : l === "fr" ? "FR" : "EN")).join("·")}
                </div>
                <div className="text-[10px] font-bold text-muted-foreground">{t.publicProfile.languagesLabel}</div>
              </div>
            </div>

            {/* النبذة */}
            {bio && (
              <div className="text-start space-y-1.5 pt-1">
                <h2 className="text-xs font-black text-muted-foreground flex items-center gap-1.5">
                  <GraduationCap className="h-3.5 w-3.5 text-primary" />
                  {t.publicProfile.about}
                </h2>
                <p className="text-sm leading-relaxed text-foreground/85" dir="auto">{bio}</p>
              </div>
            )}

            {/* v2.11.0: روابط التواصل الاجتماعي للأخصائي — بأيقوناتها الحقيقية
                وألوانها المعتارة، تظهر فقط ما عبّأه، وتلتفّ بأمان على الهاتف */}
            {socialLinks.length > 0 && (
              <div className="text-start space-y-2 pt-1">
                <h2 className="text-xs font-black text-muted-foreground flex items-center gap-1.5">
                  <Share2 className="h-3.5 w-3.5 text-primary" />
                  {t.publicProfile.socialsTitle}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {socialLinks.map((s) => (
                    <a
                      key={s.key}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[11px] font-black text-white transition-opacity hover:opacity-85 ${
                        s.key === "facebook"
                          ? "bg-[#1877F2]"
                          : s.key === "instagram"
                            ? "bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF]"
                            : "bg-[#010101] dark:bg-[#2a2a2a]"
                      }`}
                    >
                      {s.key === "facebook" ? (
                        <FacebookGlyph className="h-3.5 w-3.5" />
                      ) : s.key === "instagram" ? (
                        <InstagramGlyph className="h-3.5 w-3.5" />
                      ) : (
                        <TikTokGlyph className="h-3.5 w-3.5" />
                      )}
                      {s.label}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* التخصصات */}
            {(specialties.length > 0 || customSpecialties.length > 0) && (
              <div className="text-start space-y-2 pt-1">
                <h2 className="text-xs font-black text-muted-foreground">{t.publicProfile.specialtiesLabel}</h2>
                <div className="flex flex-wrap gap-1.5">
                  {specialties.map((s) => (
                    <span key={s} className="rounded-full border border-border bg-muted/50 px-3 py-1 text-[11px] font-bold">
                      {t.client.specialties[s as keyof typeof t.client.specialties] ?? s}
                    </span>
                  ))}
                  {customSpecialties.map((cs) => (
                    <span key={`c-${cs}`} className="rounded-full border border-border bg-muted/50 px-3 py-1 text-[11px] font-bold" dir="auto">
                      {cs}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* v1.3.0: سعر الجلسة بكل العملات المتوفرة — طلب المستخدم صراحة */}
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {CURRENCY_CODES.map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-primary/10 text-primary font-black px-3 py-1 text-xs border border-primary/20"
                  dir="ltr"
                >
                  {prices[c as CurrencyCode].toLocaleString("fr-FR")} {c === "DZD" ? (lang === "ar" ? "دج" : "DZD") : c === "EUR" ? "€" : "$"}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground font-semibold">{t.publicProfile.priceNote}</p>

            {/* أزرار العمل */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-3">
              <a
                href={bookHref}
                className="inline-flex items-center gap-2 rounded-xl bg-primary text-white px-6 py-2.5 text-sm font-black hover:opacity-90 transition-opacity"
              >
                <CalendarClock className="h-4 w-4" />
                {t.publicProfile.bookCta}
              </a>
              <ShareButton label={t.publicProfile.share} copiedLabel={t.publicProfile.copied} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
