"use client";

/**
 * v1.11.0 — مستند العقد العلاجي الاحترافي (WYSIWYG) + نظام الطباعة/حفظ PDF.
 * ─────────────────────────────────────────────────────────────────
 * • يُرسم المستند بهيكل وثيقة رسمية كاملة: ترويسة المنصة، رقم العقد
 *   التسلسلي، تاريخ الإبرام، الأطراف، البنود، الإقرار، توقيعا الطرفين
 *   بتاريخيهما، وتذييل التوثيق — بنفس الشكل تماماً على الشاشة وعلى الورق.
 * • اللغة تُختار قبل الطباعة من قائمة الست لغات فتتغير ترويسة المستند
 *   وبنيته لغوياً فوراً (معاينة حية قبل الطباعة).
 * • v1.11.0 — مستويان للرسم:
 *   variant="screen" للمعاينة داخل النوافذ (خطوط صغيرة مضغوطة)،
 *   variant="print" للطباعة بخطوط مضبوطة لصفحة A4 فتمتلئ الصفحة
 *   بمقاس مريح للمطالعة — والمستند يخرج بصفحة واحدة أو بعدد صفحات
 *   نص العقد الحقيقي فقط، بلا أي صفحات فارغة (إصلاح بلاغ المستخدم).
 */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Globe, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONTRACT_LANGS, CONTRACT_LANG_LABELS, docDir, docDate, docTexts } from "@/lib/contract-template";
import { useI18n } from "@/lib/i18n";
import type { AppLang } from "@/lib/constants";

/* ═══ بيانات المستند — موحّدة بين النافذة المنبثقة ونافذة العرض ═══ */
export interface ContractDocData {
  number?: string | null;
  text: string;
  counselorName?: string | null;
  clientName?: string | null; // الاسم المعروض (المستعار أو الكامل عند الإمضاء)
  clientSignedName?: string | null;
  counselorSignature?: string | null;
  clientSignature?: string | null;
  counselorSignedAt?: string | null;
  clientSignedAt?: string | null;
  scheduledAt?: string | null;
  createdAt?: string | null;
  status?: string | null;
}

/* تقسيم نص العقد إلى كتل (بنود) بحسب الأسطر الفارغة —
   السطر الأول القصير من كل كتلة يُعامل كعنوان بند تلقائياً */
function blocksOf(text: string): { heading: string | null; body: string[] }[] {
  const raw = (text || "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return raw.map((block) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const first = lines[0] || "";
    const isHeading =
      lines.length > 1 && first.length <= 120 && (/^(بند|المادة|إقرار|مقدمة|تمهيد|أولاً|ثانياً|ثالثاً)/.test(first) || /^\d+[\.\-\)]\s*/.test(first) || /^(Clause|Article|Section|Madde|Положение|第)/i.test(first) || first.endsWith("：") || first.endsWith(":"));
    return { heading: isHeading ? first : null, body: isHeading ? lines.slice(1) : lines };
  });
}

/* ═══ v1.12.0: مقاسا الرسم — شاشة (معاينة مضغوطة) وطباعة (A4 مريح) ═══
   طباعة: خط أساس 13px ≈ 9.8pt على عرض محتوى A4 (حوالي 184مم) — مقاس
   وثيقة رسمية مريح للمطالعة، والمحتوى يتدفق طبيعياً على عدد صفحات
   نص العقد الحقيقي فقط بلا أي صفحات فارغة (إصلاح بلاغ المستخدم). */
const SIZES = {
  screen: {
    platform: 9.5, title: 15, meta: 9.5, intro: 10.5, partyLabel: 8.5, partyName: 10.5,
    clauseBody: 10, clauseHead: 10, clauseLine: 1.42, sectionTitle: 11.5,
    declText: 9.5, sigLabel: 8.5, sigName: 8.5, sigBox: 46, sigImg: 42, footer: 7.5,
  },
  print: {
    platform: 11, title: 19, meta: 11.5, intro: 12.5, partyLabel: 10, partyName: 12.5,
    clauseBody: 13, clauseHead: 13, clauseLine: 1.6, sectionTitle: 14,
    declText: 12.5, sigLabel: 10, sigName: 11.5, sigBox: 64, sigImg: 56, footer: 9,
  },
} as const;

/* ═══ المستند نفسه — ألوان صريحة ثابتة ليطبع كما يُرى ═══ */
export function ContractDocument({ data, lang, variant = "screen" }: { data: ContractDocData; lang: string; variant?: "screen" | "print" }) {
  const d = docTexts(lang);
  const dir = docDir(lang);
  const S = SIZES[variant];
  const issued = docDate(data.createdAt || data.counselorSignedAt, lang);
  const blocks = blocksOf(data.text);
  const clientDisplayName = data.clientSignedName || data.clientName || "—";

  return (
    <div dir={dir} lang={lang} style={{ background: "#ffffff", color: "#141414", fontFamily: lang === "ar" ? "'Noto Naskh Arabic', 'Amiri', serif" : "Georgia, 'Times New Roman', serif" }}>
      {/* الترويسة */}
      <div data-nosplit="true" style={{ textAlign: "center", borderBottom: "3px double #1a1a1a", paddingBottom: "8px", marginBottom: "12px" }}>
        <div style={{ fontSize: `${S.platform}px`, letterSpacing: "0.1em", color: "#3f6212", fontWeight: 700, marginBottom: "3px" }}>{d.platform}</div>
        <h1 style={{ fontSize: `${S.title}px`, fontWeight: 800, lineHeight: 1.3, margin: 0 }}>{d.title}</h1>
      </div>

      {/* سطر البيانات: رقم العقد + تاريخ الإبرام + الحالة */}
      <div data-nosplit="true" style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", justifyContent: "space-between", alignItems: "center", fontSize: `${S.meta}px`, background: "#f4f7ec", border: "1px solid #d9e3c8", borderRadius: "6px", padding: "6px 10px", marginBottom: "10px" }}>
        <span style={{ fontWeight: 800 }}>
          {d.docNo}: <span style={{ fontFamily: "monospace", fontSize: `${S.meta + 0.5}px`, letterSpacing: "0.04em" }} dir="ltr">{data.number || "—"}</span>
        </span>
        <span style={{ fontWeight: 600 }}>
          {d.issuedOn}: <span dir="ltr">{issued}</span>
        </span>
        <span style={{ fontWeight: 800, color: data.status === "SIGNED" ? "#1a7f37" : "#9a6700" }}>
          {data.status === "SIGNED" ? `✓ ${d.signedByBoth}` : d.awaiting}
        </span>
      </div>

      {/* الأطراف */}
      <p data-nosplit="true" style={{ fontSize: `${S.intro}px`, fontWeight: 600, margin: "0 0 7px", lineHeight: 1.55 }}>{(d.intro || "").replace("{date}", issued)}</p>
      <div data-nosplit="true" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "10px" }}>
        <div style={{ border: "1px solid #cfd8c2", borderRadius: "6px", padding: "6px 10px", fontSize: `${S.partyLabel}px` }}>
          <div style={{ color: "#4b5563", fontSize: `${S.partyLabel}px`, fontWeight: 700, marginBottom: "3px" }}>{d.party1}</div>
          <div style={{ fontWeight: 800, fontSize: `${S.partyName}px` }} dir="auto">{data.counselorName || "—"}</div>
        </div>
        <div style={{ border: "1px solid #cfd8c2", borderRadius: "6px", padding: "6px 10px", fontSize: `${S.partyLabel}px` }}>
          <div style={{ color: "#4b5563", fontSize: `${S.partyLabel}px`, fontWeight: 700, marginBottom: "3px" }}>{d.party2}</div>
          <div style={{ fontWeight: 800, fontSize: `${S.partyName}px` }} dir="auto">{clientDisplayName}</div>
        </div>
      </div>

      {/* البنود */}
      <div style={{ fontSize: `${S.clauseBody}px`, lineHeight: S.clauseLine }}>
        <h2 style={{ fontSize: `${S.sectionTitle}px`, fontWeight: 800, margin: "0 0 6px", borderBottom: "1px solid #d1d5db", paddingBottom: "3px" }}>{d.clausesTitle}</h2>
        {blocks.map((b, i) => (
          <div key={i} style={{ marginBottom: "7px" }}>
            {b.heading && <div style={{ fontWeight: 800, fontSize: `${S.clauseHead}px`, marginBottom: "2px", color: "#27351a" }}>{b.heading}</div>}
            {b.body.map((line, j) => (
              <p key={j} style={{ margin: "0 0 3px", textAlign: "justify", whiteSpace: "pre-wrap" }}>{line}</p>
            ))}
          </div>
        ))}
      </div>

      {/* الإقرار والتوقيعات — اللوحة كاملة لا تنقسم بين صفحتين */}
      <div data-nosplit="true" style={{ marginTop: "10px", borderTop: "1px solid #d1d5db", paddingTop: "8px" }}>
        <h2 style={{ fontSize: `${S.sectionTitle}px`, fontWeight: 800, margin: "0 0 4px" }}>{d.declarationTitle}</h2>
        <p style={{ fontSize: `${S.declText}px`, lineHeight: 1.55, margin: "0 0 10px", textAlign: "justify" }}>{d.declaration}</p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          {/* إمضاء الأخصائي */}
          <div style={{ border: "1px solid #cfd8c2", borderRadius: "6px", padding: "8px 10px" }}>
            <div style={{ fontSize: `${S.sigLabel}px`, fontWeight: 800, color: "#4b5563", marginBottom: "4px" }}>{d.signCounselor}</div>
            <div style={{ height: `${S.sigBox}px`, display: "flex", alignItems: "center", justifyContent: "center", borderBottom: "1px solid #9ca3af", marginBottom: "4px" }}>
              {data.counselorSignature ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.counselorSignature} alt={d.signCounselor} style={{ maxHeight: `${S.sigImg}px`, maxWidth: "80%", objectFit: "contain" }} />
              ) : (
                <span style={{ fontSize: "8px", color: "#9ca3af" }}>—</span>
              )}
            </div>
            <div style={{ fontSize: `${S.sigName}px`, display: "flex", justifyContent: "space-between", gap: "6px" }}>
              <span style={{ fontWeight: 700 }} dir="auto">{data.counselorName || "—"}</span>
              {data.counselorSignedAt && <span dir="ltr" style={{ color: "#4b5563" }}>{docDate(data.counselorSignedAt, lang)}</span>}
            </div>
          </div>
          {/* إمضاء العميل */}
          <div style={{ border: "1px solid #cfd8c2", borderRadius: "6px", padding: "8px 10px" }}>
            <div style={{ fontSize: `${S.sigLabel}px`, fontWeight: 800, color: "#4b5563", marginBottom: "4px" }}>{d.signClient}</div>
            <div style={{ height: `${S.sigBox}px`, display: "flex", alignItems: "center", justifyContent: "center", borderBottom: "1px solid #9ca3af", marginBottom: "4px" }}>
              {data.clientSignature ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.clientSignature} alt={d.signClient} style={{ maxHeight: `${S.sigImg}px`, maxWidth: "80%", objectFit: "contain" }} />
              ) : (
                <span style={{ color: data.status === "SIGNED" ? "#9ca3af" : "#b45309", fontWeight: 700, fontSize: `${S.sigLabel}px` }}>{d.awaiting}</span>
              )}
            </div>
            <div style={{ fontSize: `${S.sigName}px`, display: "flex", justifyContent: "space-between", gap: "6px" }}>
              <span style={{ fontWeight: 700 }} dir="auto">{clientDisplayName}</span>
              {data.clientSignedAt && <span dir="ltr" style={{ color: "#4b5563" }}>{docDate(data.clientSignedAt, lang)}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* التذييل */}
      <p style={{ marginTop: "10px", paddingTop: "5px", borderTop: "1px solid #e5e7eb", fontSize: `${S.footer}px`, color: "#6b7280", textAlign: "center", lineHeight: 1.5 }}>{d.footer}</p>
    </div>
  );
}

/* ═══ محدّد لغة المستند قبل الطباعة ═══ */
export function ContractLangSelect({ value, onChange, compact }: { value: string; onChange: (l: string) => void; compact?: boolean }) {
  const { t } = useI18n();
  return (
    <div className={`flex items-center gap-2 ${compact ? "" : "flex-1 min-w-40"}`}>
      <Globe className="h-4 w-4 text-primary shrink-0" />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={`rounded-lg font-bold ${compact ? "h-8 text-[11px] w-28" : "h-9 text-xs"}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CONTRACT_LANGS.map((l) => (
            <SelectItem key={l} value={l}>
              {CONTRACT_LANG_LABELS[l]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-[10px] font-bold text-muted-foreground hidden sm:inline">{t.contract.docLangLabel}</span>
    </div>
  );
}

/* ═══ محرّك الطباعة v1.12.0 — iframe معزول يحمل المستند وحده ═══
   الجذر السابق للأخطاء (بلاغ المستخدم: صفحة أولى مضغوطة بفراغ سفلي كبير
   + 6 صفحات فارغة): طباعة الصفحة الحية نفسها تخلط تخطيط المنصة بتخطيط
   المستند مهما عزلنا بالـ CSS — قواعد الشاشة المتبقية (ارتفاعات شاشة
   كاملة، طبقات ثابتة، تحجيمات) تولّد صفحات فارغة وفراغاً في الأسفل.
   الحل الجذري: مستند مستقل نظيف داخل iframe مخفي يحمل المستند وحده
   بقواعد ‎@page A4 الخاصة به — التخطيط للورق حصراً، المحتوى يتدفق
   طبيعياً على عدد صفحات نص العقد الحقيقي فقط: لا فراغ سفلي ولا صفحات
   فارغة إطلاقاً، وحجم الخط مضبوط للصفحة (نفس آلية طباعة الشهادات
   المجرّبة في المنصة). */
export function printContractDocument(render: (lang: string) => React.ReactElement, lang: string) {
  if (typeof document === "undefined") return;
  const dir = docDir(lang);
  let frame: HTMLIFrameElement | null = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    frame = null;
    return;
  }
  doc.open();
  /* مستند نظيف بلا أي CSS من المنصة — هوامش الورق من @page مباشرة */
  doc.write(
    `<!DOCTYPE html><html dir="${dir}" lang="${lang}"><head><meta charset="utf-8"><style>` +
      `@page{size:A4 portrait;margin:14mm 13mm}` +
      `html,body{margin:0;padding:0;background:#fff}` +
      `body{-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
      `img{max-height:56px}` +
      `</style></head><body></body></html>`
  );
  doc.close();

  const root = createRoot(doc.body);
  root.render(render(lang));

  let printed = false;
  const cleanup = () => {
    try {
      root.unmount();
    } catch {
      /* تجاهل */
    }
    frame?.remove();
    frame = null;
  };
  const go = () => {
    if (printed) return;
    printed = true;
    try {
      frame?.contentWindow?.focus();
      frame?.contentWindow?.print(); /* ← حوار الطباعة القياسي — الورق A4 حصراً */
    } catch {
      /* المتصفح منع الطباعة من الإطار — ننظف فقط */
    }
    setTimeout(cleanup, 1500);
  };
  /* انتظار صور الإمضاء + إطارا رسم قبل فتح حوار الطباعة،
     واحتياط زمني يضمن عدم العلقة إن تعذّر تحميل صورة */
  setTimeout(() => {
    const imgs = Array.from(doc.querySelectorAll("img"));
    const pending = imgs.filter((i) => !i.complete);
    const start = () => requestAnimationFrame(() => requestAnimationFrame(go));
    if (pending.length === 0) start();
    else
      Promise.all(
        pending.map((i) => new Promise<void>((res) => { i.onload = () => res(); i.onerror = () => res(); }))
      ).then(start);
  }, 150);
  setTimeout(go, 2500); /* شبكة أمان — لا انسداد أبداً */
}

/* زر الطباعة جاهز الاستعمال — معاينة + اختيار اللغة ثم طباعة صفحة واحدة */
export function ContractPrintButton({ data, defaultLang }: { data: ContractDocData; defaultLang?: string | null }) {
  const { t, lang: uiLang } = useI18n();
  const [docLang, setDocLang] = useState<string>(defaultLang || uiLang || "ar");
  /* اللغة الافتراضية تتبع لغة الواجهة إن لم تُحدد لغة محفوظة للعقد */
  useEffect(() => {
    if (!defaultLang) setDocLang(uiLang);
  }, [uiLang, defaultLang]);

  const print = () =>
    printContractDocument(
      (l) => <ContractDocument data={data} lang={l} variant="print" />,
      docLang
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ContractLangSelect value={docLang} onChange={setDocLang} compact />
      <Button size="sm" variant="outline" className="rounded-lg font-bold h-8" onClick={print}>
        <Printer className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{t.contract.printBtn}</span>
        <span className="sm:hidden">{t.contract.printBtnShort}</span>
      </Button>
    </div>
  );
}
