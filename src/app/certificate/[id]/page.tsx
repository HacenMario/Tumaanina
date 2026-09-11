import { notFound } from "next/navigation";
import { createHash } from "crypto";
import { headers } from "next/headers";
import { connectDB } from "@/lib/db";
import { CounselorProfile, SupportSession, User } from "@/lib/models";
import { LogoMark } from "@/lib/logo";
import { ar } from "@/lib/i18n/ar";
import { fr } from "@/lib/i18n/fr";
import { en } from "@/lib/i18n/en";
import type { AppLang } from "@/lib/constants";
import { PrintButton } from "./print-button";
import { formatYearMonth, formatDateYMD } from "@/lib/utils";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";

/* ─── شهادة اعتماد وتوثيق — v2.5.5 ───
   شهادة إلكترونية أنيقة لكل أخصائي موثّق، تُقرأ بياناتها مباشرة
   من قاعدة البيانات لحظة العرض: عدد الجلسات المكتملة يتبع الواقع
   ويُحدَّث تلقائياً بعد كل جلسة (بدون أي خطوة يدوية).
   v2.5.5:
   - زر التحميل يُنتج ملف PDF حقيقي يُنزَّل مباشرة (مع احتياط الطباعة).
   - نص رابط التحقق استُبدل برمز QR يمثل الرابط الكامل للشهادة
     (يتغير تلقائياً حسب نطاق النشر ومعرّف الأخصائي).
   - تاريخ الإصدار بصيغة موحّدة YYYY/MM/DD في كل اللغات.
   الرابط: /certificate/{userId} — يفتحها الأخصائي من لوحته
   أو الإدارة من تبويب الحسابات، ويجوز للأخصائي مشاركتها عمومياً. */

type Dict = typeof ar;
const DICTS: Partial<Record<AppLang, Dict>> = { ar, fr, en, tr: en, ru: en, zh: en };

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string }>;
}

export default async function CertificatePage({ params, searchParams }: Props) {
  const { id } = await params;
  const { lang: langParam } = await searchParams;
  const lang: AppLang = langParam === "fr" || langParam === "en" ? langParam : "ar";
  const t = DICTS[lang] ?? DICTS.ar!;
  const dir = lang === "ar" ? "rtl" : "ltr";

  await connectDB();

  const user = (await User.findById(id).select("role").lean()) as { role?: string } | null;
  if (!user || user.role !== "COUNSELOR") notFound();

  const p = (await CounselorProfile.findOne({ userId: id }).lean()) as Record<string, unknown> | null;
  if (!p) notFound();

  const fullName = String(p.fullName || "");
  const verified = p.verificationStatus === "VERIFIED";

  /* ─── حساب غير موثّق: الشهادة حصراً للموثّقين ─── */
  if (!verified) {
    return (
      <main dir={dir} className="min-h-dvh bg-neutral-100 flex items-center justify-center px-4 py-16">
        <div className="max-w-md w-full text-center space-y-3 rounded-3xl bg-white p-10 shadow-lg border border-neutral-200">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-teal-50 flex items-center justify-center">
            <LogoMark size={30} />
          </div>
          <h1 className="text-xl font-black text-neutral-900">{t.certificate.notVerifiedTitle}</h1>
          <p className="text-sm text-neutral-500 font-semibold">{t.certificate.notVerifiedDesc}</p>
        </div>
      </main>
    );
  }

  /* عدد الجلسات المكتملة — لحظي من قاعدة البيانات في كل عرض */
  const sessionsCount = await SupportSession.countDocuments({ counselorId: id, status: "COMPLETED" });

  const createdAt = p.createdAt ? new Date(p.createdAt as string) : null;
  /* «عضو منذ» بصيغة YYYY/MM — موحّد مع الملف العام وكل المنصة */
  const memberSince = createdAt ? formatYearMonth(createdAt) : null;

  /* رقم تسلسلي ثابت مشتق من معرّف الحساب — للتحقق من صحة الشهادة
     v1.3.0: البادئة TMN (طمأنينة) بدل RFQ — بقايا المنصة الأصلية */
  const serial = `TMN-${new Date().getFullYear()}-${createHash("md5").update(String(id)).digest("hex").slice(0, 8).toUpperCase()}`;
  /* v2.5.5: تاريخ الإصدار بصيغة YYYY/MM/DD الرقمية الموحّدة في كل اللغات
     (بدل Intl المحلي الذي كان يشوّه التاريخ في النسخة العربية) */
  const issuedOn = formatDateYMD(new Date());

  /* v2.5.5: رمز QR — يمثل الرابط الكامل للشهادة كما يظهر في شريط المتصفح
     (النطاق يُقرأ من ترويسات الطلب فيتغيّر تلقائياً حسب معرّف الأخصائي
     ونطاق النشر: vercel أو غيره) */
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const certUrl = `${proto}://${host}/certificate/${id}`;
  const qrDataUrl = await QRCode.toDataURL(certUrl, {
    margin: 1,
    width: 260,
    errorCorrectionLevel: "M",
    color: { dark: "#115e59", light: "#ffffff" },
  });

  return (
    <main dir={dir} className="min-h-dvh bg-neutral-200 dark:bg-neutral-900 py-8 md:py-12 px-3 print:bg-white print:py-0 print:px-0">
      {/* زر الطباعة/تحميل PDF — يختفي عند الطباعة */}
      <PrintButton label={t.certificate.downloadBtn} />

      {/* ورقة الشهادة — ألوان ثابتة (لا تتبع المظهر الداكن) لضمان طباعة مثالية */}
      <div className="certificate-sheet mx-auto max-w-4xl bg-[#FFFDF6] text-neutral-900 rounded-lg shadow-2xl print:shadow-none print:rounded-none">
        <div className="p-[10px]">
          <div className="border-[3px] border-amber-600 p-[5px]">
            <div className="border border-amber-500/70 px-8 md:px-14 py-10 md:py-12 relative overflow-hidden">
              {/* زخرفة خلفية خفيفة */}
              <div
                aria-hidden
                className="absolute inset-0 opacity-[0.05] pointer-events-none"
                style={{
                  backgroundImage: "radial-gradient(circle at 20% 30%, #047857 0, transparent 40%), radial-gradient(circle at 80% 70%, #b45309 0, transparent 40%)",
                }}
              />

              <div className="relative space-y-6 md:space-y-7 text-center">
                {/* الشعار واسم المنصة */}
                <div className="flex items-center justify-center gap-3">
                  <LogoMark size={54} />
                  <div className={dir === "rtl" ? "text-right" : "text-left"}>
                    <p className="font-black text-xl leading-tight">{t.certificate.orgName}</p>
                    <p className="text-[10px] font-bold text-neutral-500">{t.certificate.orgSub}</p>
                  </div>
                </div>

                {/* خط زخرفي */}
                <div className="flex items-center justify-center gap-2" aria-hidden>
                  <span className="h-px w-20 bg-amber-600/60" />
                  <span className="h-1.5 w-1.5 rotate-45 bg-amber-600" />
                  <span className="h-px w-20 bg-amber-600/60" />
                </div>

                {/* العنوان */}
                <h1 className="text-3xl md:text-4xl font-black tracking-wide text-teal-900">
                  {t.certificate.docTitle}
                </h1>

                {/* المُنال */}
                <div className="space-y-2.5">
                  <p className="text-sm font-bold text-neutral-500">{t.certificate.line1}</p>
                  <p className="text-3xl md:text-4xl font-black text-neutral-900 border-b-2 border-amber-500/70 inline-block pb-1 px-4" dir="auto">
                    {fullName}
                  </p>
                </div>

                {/* المتن */}
                <p className="text-sm md:text-base leading-loose text-neutral-700 max-w-xl mx-auto" dir="auto">
                  {t.certificate.line2}{" "}
                  <span className="inline-block mx-1 text-3xl md:text-4xl font-black text-teal-800 align-middle font-mono">
                    {sessionsCount}
                  </span>{" "}
                  {t.certificate.sessionsWord}
                </p>

                {/* بيانات الشهادة */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 max-w-2xl mx-auto pt-2">
                  {memberSince && (
                    <div className="rounded-xl bg-amber-50 border border-amber-200/70 px-3 py-2.5">
                      <p className="text-[9px] font-black text-neutral-500 uppercase tracking-wider">{t.certificate.memberSince}</p>
                      <p className="text-sm font-black font-mono text-neutral-800">{memberSince}</p>
                    </div>
                  )}
                  <div className="rounded-xl bg-amber-50 border border-amber-200/70 px-3 py-2.5">
                    <p className="text-[9px] font-black text-neutral-500 uppercase tracking-wider">{t.certificate.serial}</p>
                    <p className="text-sm font-black font-mono text-neutral-800" dir="ltr">{serial}</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 border border-amber-200/70 px-3 py-2.5">
                    <p className="text-[9px] font-black text-neutral-500 uppercase tracking-wider">{t.certificate.issuedOn}</p>
                    <p className="text-sm font-black text-neutral-800">{issuedOn}</p>
                  </div>
                </div>

                {/* التوقيع + رمز التحقق */}
                <div className="flex items-end justify-between max-w-2xl mx-auto pt-4 gap-4">
                  {/* v2.5.5: رمز QR بدل نص رابط التحقق — يمثل الرابط الكامل للشهادة */}
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrDataUrl}
                      alt={t.certificate.qrScan}
                      className="h-[76px] w-[76px] rounded-md border border-neutral-200 bg-white"
                    />
                    <p className="text-[8px] font-bold text-neutral-400 max-w-24 leading-snug text-center">
                      {t.certificate.qrScan}
                    </p>
                  </div>
                  <div className="text-center space-y-1">
                    <p className="font-black text-sm text-neutral-800">{t.certificate.signTitle}</p>
                    <div className="h-px w-36 bg-neutral-400" />
                    <p className="text-[9px] font-bold text-neutral-400">{t.certificate.signRole}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* أنماط الطباعة: ورقة أفقية A4 دون أي عناصر خارجية — وسم عادي صالح في مكوّن خادمي */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page {
                size: A4 landscape;
                margin: 0;
              }
              body {
                background: white !important;
              }
              .no-print {
                display: none !important;
              }
              .certificate-sheet {
                max-width: none !important;
                border-radius: 0 !important;
                width: 100vw;
                height: 100vh;
              }
            }
          `,
        }}
      />
    </main>
  );
}
