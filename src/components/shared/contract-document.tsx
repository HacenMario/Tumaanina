"use client";

/**
 * v1.10.0 — مستند العقد العلاجي الاحترافي (WYSIWYG) + نظام الطباعة/حفظ PDF.
 * ─────────────────────────────────────────────────────────────────
 * • يُرسم المستند بهيكل وثيقة رسمية كاملة: ترويسة المنصة، رقم العقد
 *   التسلسلي، تاريخ الإبرام، الأطراف، البنود، الإقرار، توقيعا الطرفين
 *   بتاريخيهما، وتذييل التوثيق — بنفس الشكل تماماً على الشاشة وعلى الورق.
 * • اللغة تُختار قبل الطباعة من قائمة الست لغات فتتغير ترويسة المستند
 *   وبنيته لغوياً فوراً (معاينة حية قبل الطباعة).
 * • الطباعة تعزل المستند وحده في صفحة A4 بأسلوب مضغوط احترافي —
 *   يخرج في صفحة واحدة (أو حسب طول نص الأخصائي) بدل صفحات مبعثرة،
 *   عبر طبقة #tumaanina-contract-print وcss @media print في globals.css.
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

/* ═══ المستند نفسه — ألوان صريحة ثابتة ليطبع كما يُرى ═══ */
export function ContractDocument({ data, lang }: { data: ContractDocData; lang: string }) {
  const d = docTexts(lang);
  const dir = docDir(lang);
  const issued = docDate(data.createdAt || data.counselorSignedAt, lang);
  const blocks = blocksOf(data.text);
  const clientDisplayName = data.clientSignedName || data.clientName || "—";

  return (
    <div dir={dir} lang={lang} style={{ background: "#ffffff", color: "#141414", fontFamily: lang === "ar" ? "'Noto Naskh Arabic', 'Amiri', serif" : "Georgia, 'Times New Roman', serif" }}>
      {/* الترويسة */}
      <div style={{ textAlign: "center", borderBottom: "3px double #1a1a1a", paddingBottom: "8px", marginBottom: "10px" }}>
        <div style={{ fontSize: "9.5px", letterSpacing: "0.08em", color: "#3f6212", fontWeight: 700, marginBottom: "2px" }}>{d.platform}</div>
        <h1 style={{ fontSize: "15px", fontWeight: 800, lineHeight: 1.3, margin: 0 }}>{d.title}</h1>
      </div>

      {/* سطر البيانات: رقم العقد + تاريخ الإبرام + الحالة */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", justifyContent: "space-between", alignItems: "center", fontSize: "9.5px", background: "#f4f7ec", border: "1px solid #d9e3c8", borderRadius: "6px", padding: "5px 8px", marginBottom: "8px" }}>
        <span style={{ fontWeight: 800 }}>
          {d.docNo}: <span style={{ fontFamily: "monospace", fontSize: "10px", letterSpacing: "0.04em" }} dir="ltr">{data.number || "—"}</span>
        </span>
        <span style={{ fontWeight: 600 }}>
          {d.issuedOn}: <span dir="ltr">{issued}</span>
        </span>
        <span style={{ fontWeight: 800, color: data.status === "SIGNED" ? "#1a7f37" : "#9a6700" }}>
          {data.status === "SIGNED" ? `✓ ${d.signedByBoth}` : d.awaiting}
        </span>
      </div>

      {/* الأطراف */}
      <p style={{ fontSize: "10.5px", fontWeight: 600, margin: "0 0 6px" }}>{(d.intro || "").replace("{date}", issued)}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "8px" }}>
        <div style={{ border: "1px solid #cfd8c2", borderRadius: "6px", padding: "5px 8px", fontSize: "9.5px" }}>
          <div style={{ color: "#4b5563", fontSize: "8.5px", fontWeight: 700, marginBottom: "2px" }}>{d.party1}</div>
          <div style={{ fontWeight: 800, fontSize: "10.5px" }} dir="auto">{data.counselorName || "—"}</div>
        </div>
        <div style={{ border: "1px solid #cfd8c2", borderRadius: "6px", padding: "5px 8px", fontSize: "9.5px" }}>
          <div style={{ color: "#4b5563", fontSize: "8.5px", fontWeight: 700, marginBottom: "2px" }}>{d.party2}</div>
          <div style={{ fontWeight: 800, fontSize: "10.5px" }} dir="auto">{clientDisplayName}</div>
        </div>
      </div>

      {/* البنود */}
      <div style={{ fontSize: "10px", lineHeight: 1.42 }}>
        <h2 style={{ fontSize: "11.5px", fontWeight: 800, margin: "0 0 4px", borderBottom: "1px solid #d1d5db", paddingBottom: "2px" }}>{d.clausesTitle}</h2>
        {blocks.map((b, i) => (
          <div key={i} style={{ marginBottom: "5px" }}>
            {b.heading && <div style={{ fontWeight: 800, fontSize: "10px", marginBottom: "1px", color: "#27351a" }}>{b.heading}</div>}
            {b.body.map((line, j) => (
              <p key={j} style={{ margin: "0 0 2px", textAlign: "justify", whiteSpace: "pre-wrap" }}>{line}</p>
            ))}
          </div>
        ))}
      </div>

      {/* الإقرار والتوقيعات */}
      <div style={{ marginTop: "8px", borderTop: "1px solid #d1d5db", paddingTop: "6px" }}>
        <h2 style={{ fontSize: "11.5px", fontWeight: 800, margin: "0 0 3px" }}>{d.declarationTitle}</h2>
        <p style={{ fontSize: "9.5px", lineHeight: 1.45, margin: "0 0 8px", textAlign: "justify" }}>{d.declaration}</p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          {/* إمضاء الأخصائي */}
          <div style={{ border: "1px solid #cfd8c2", borderRadius: "6px", padding: "6px 8px" }}>
            <div style={{ fontSize: "8.5px", fontWeight: 800, color: "#4b5563", marginBottom: "3px" }}>{d.signCounselor}</div>
            <div style={{ height: "46px", display: "flex", alignItems: "center", justifyContent: "center", borderBottom: "1px solid #9ca3af", marginBottom: "3px" }}>
              {data.counselorSignature ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.counselorSignature} alt={d.signCounselor} style={{ maxHeight: "42px", maxWidth: "80%", objectFit: "contain" }} />
              ) : (
                <span style={{ fontSize: "8px", color: "#9ca3af" }}>—</span>
              )}
            </div>
            <div style={{ fontSize: "8.5px", display: "flex", justifyContent: "space-between", gap: "6px" }}>
              <span style={{ fontWeight: 700 }} dir="auto">{data.counselorName || "—"}</span>
              {data.counselorSignedAt && <span dir="ltr" style={{ color: "#4b5563" }}>{docDate(data.counselorSignedAt, lang)}</span>}
            </div>
          </div>
          {/* إمضاء العميل */}
          <div style={{ border: "1px solid #cfd8c2", borderRadius: "6px", padding: "6px 8px" }}>
            <div style={{ fontSize: "8.5px", fontWeight: 800, color: "#4b5563", marginBottom: "3px" }}>{d.signClient}</div>
            <div style={{ height: "46px", display: "flex", alignItems: "center", justifyContent: "center", borderBottom: "1px solid #9ca3af", marginBottom: "3px" }}>
              {data.clientSignature ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.clientSignature} alt={d.signClient} style={{ maxHeight: "42px", maxWidth: "80%", objectFit: "contain" }} />
              ) : (
                <span style={{ color: data.status === "SIGNED" ? "#9ca3af" : "#b45309", fontWeight: 700, fontSize: "8.5px" }}>{d.awaiting}</span>
              )}
            </div>
            <div style={{ fontSize: "8.5px", display: "flex", justifyContent: "space-between", gap: "6px" }}>
              <span style={{ fontWeight: 700 }} dir="auto">{clientDisplayName}</span>
              {data.clientSignedAt && <span dir="ltr" style={{ color: "#4b5563" }}>{docDate(data.clientSignedAt, lang)}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* التذييل */}
      <p style={{ marginTop: "8px", paddingTop: "4px", borderTop: "1px solid #e5e7eb", fontSize: "7.5px", color: "#6b7280", textAlign: "center", lineHeight: 1.4 }}>{d.footer}</p>
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

/* ═══ محرّك الطباعة — يعزل المستند وحده في طبقة مخصصة ثم يطبع A4 ═══
   ينتظر تحميل صور الإمضاء قبل فتح حوار الطباعة حتى تخرج كاملة في PDF */
export function printContractDocument(render: (lang: string) => React.ReactElement, lang: string) {
  if (typeof document === "undefined") return;
  const host = document.createElement("div");
  host.id = "tumaanina-contract-print";
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = "210mm";
  host.style.background = "#fff";
  document.body.appendChild(host);
  const root = createRoot(host);
  root.render(render(lang));

  let printed = false;
  const doPrint = () => {
    if (printed) return;
    printed = true;
    window.print();
    /* تنظيف بعد انتهاء الطباعة (afterprint لا يُطلق في كل المتصفحات) */
    setTimeout(() => {
      try {
        root.unmount();
      } catch {
        /* تجاهل */
      }
      host.remove();
    }, 800);
  };
  /* انتظار صور الإمضاء + إطارا رسم قبل الطباعة */
  setTimeout(() => {
    const imgs = Array.from(host.querySelectorAll("img"));
    const pending = imgs.filter((i) => !i.complete);
    if (pending.length === 0) {
      requestAnimationFrame(() => requestAnimationFrame(doPrint));
    } else {
      Promise.all(
        pending.map((i) => new Promise<void>((res) => { i.onload = () => res(); i.onerror = () => res(); }))
      ).then(() => requestAnimationFrame(() => requestAnimationFrame(doPrint)));
    }
  }, 150);
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
      (l) => (
        <div style={{ padding: "12mm 12mm 0" }}>
          <ContractDocument data={data} lang={l} />
        </div>
      ),
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
