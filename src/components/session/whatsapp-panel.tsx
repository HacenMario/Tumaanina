"use client";

/**
 * لوحة واتساب للجلسات — بديل Jitsi Meet
 * ─────────────────────────────────────────────────────────────────
 * زر واحد يفتح محادثة واتساب مع الأخصائي (رسالة تعريفية جاهزة)،
 * مع خطوات واضحة لإتمام الاتصال الصوتي 📞 أو المرئي 🎥 من داخل واتساب.
 */
import { useState } from "react";
import { Copy, Mic, PhoneCall, Video } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { formatWhatsapp, normalizeWhatsapp } from "@/lib/whatsapp";
import type { SessionMode } from "@/lib/constants";

export function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export function WhatsAppPanel({
  mode,
  whatsapp,
  counselorName,
  victimPseudonym,
  topicLabel,
  slot,
  active,
}: {
  mode: SessionMode;
  whatsapp: string | null;
  counselorName: string;
  victimPseudonym?: string;
  topicLabel?: string;
  slot?: string;
  active: boolean;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const digits = normalizeWhatsapp(whatsapp);

  const steps =
    mode === "VIDEO"
      ? [t.session.waStepOpen, t.session.waStepVideo]
      : [t.session.waStepOpen, t.session.waStepCall];

  const copyNumber = async () => {
    if (!digits) return;
    try {
      await navigator.clipboard.writeText(digits);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* المتصفح قد يمنع النسخ */
    }
  };


  return (
    <div className="h-full overflow-y-auto bg-muted/40 rounded-b-xl">
      <div className="max-w-md mx-auto px-4 py-8 space-y-5">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#25D366]/15 flex items-center justify-center">
            <WhatsAppGlyph className="h-8 w-8 text-[#128C4A]" />
          </div>
          <h2 className="font-black text-lg">{t.session.waTitle}</h2>
          <p className="text-xs text-muted-foreground font-semibold">{counselorName}</p>
        </div>

        {!active ? (
          <div className="rounded-2xl border border-border bg-card p-5 text-center space-y-2">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              {mode === "VIDEO" ? <Video className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              <span className="text-sm font-bold">{t.session.waWaiting}</span>
            </div>
          </div>
        ) : !digits ? (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 text-center space-y-2">
            <span className="text-sm font-bold text-amber-700 dark:text-amber-400">{t.session.waMissingNumber}</span>
          </div>
        ) : (
          <>
            {/* v2.9.0: لا زر هنا — زر واتساب واحد فقط في رأس الغرفة يفعل المطلوب.
                هذه اللوحة للخطوات ونسخ الرقم فقط */}
            <div className="rounded-2xl border border-[#25D366]/40 bg-[#25D366]/10 p-4 text-center">
              <p className="text-xs font-black text-[#128C4A] flex items-center justify-center gap-1.5">
                <WhatsAppGlyph className="h-4 w-4" />
                {t.session.waPanelHint}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <p className="text-xs font-black text-muted-foreground">{t.session.waHowTitle}</p>
              {steps.map((s, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="shrink-0 h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-black flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="text-sm leading-relaxed font-semibold">{s}</span>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground font-semibold flex items-center gap-1.5 pt-1 border-t border-border">
                <PhoneCall className="h-3 w-3" />
                {t.session.waDesktopHint}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={copyNumber}
                className="flex-1 rounded-xl border border-border hover:border-primary/40 px-4 py-2.5 text-xs font-bold flex items-center justify-center gap-2 transition-all"
              >
                <Copy className="h-3.5 w-3.5" />
                {copied ? t.session.waCopied : t.session.waCopy}
              </button>
              <span dir="ltr" className="text-xs font-mono text-muted-foreground">
                {digits ? formatWhatsapp(digits) : ""}
              </span>
            </div>

            <p className="text-center text-[11px] text-muted-foreground font-semibold">{t.session.waPrivacy}</p>
          </>
        )}
      </div>
    </div>
  );
}
