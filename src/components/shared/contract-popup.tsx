"use client";

/**
 * v1.9.0 — النافذة المنبثقة الإلزامية للعقد العلاجي (جهة العميل).
 *
 * المنطق الواقعي حمايةً للطرفين:
 * • عند قبول الأخصائي للجلسة (ولو كان للعميل عقد ممضى سابقاً فلن يظهر شيء)
 *   يُنسخ قالب الأخصائي الموقّع إلى عقد مستقل بانتظار إمضاء العميل.
 * • العميل المسجّل (حساب مسجل الدخول شرط) يرى النافذة مباشرة بعد إغلاق
 *   نافذة «لحظة اطمئنان» — استقصاء كل 12 ثانية + انتظار حدث الإغلاق.
 * • النافذة إلزامية (بلا إغلاق): قراءة العقد ← الامضاء بالرسم ← كتابة
 *   الاسم الكامل ← زر «أقبل» — فتُحفظ النسخة النهائية الممضاة من الطرفين
 *   في حساب الأخصائي، ولا يمكن إعادة التوقيع أو التعديل بعدها.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { FileSignature, PenLine } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SignaturePad } from "@/components/shared/signature-pad";
import { toast } from "@/hooks/use-toast";

interface PendingContract {
  id: string;
  text: string;
  counselorName: string | null;
  counselorSignedAt: string | null;
  scheduledAt: string | null;
}

/* احتياط إن فاتنا حدث إغلاق نافذة الاطمئنان (مدتها القصوى ~10.6 ثانية) */
const WELCOME_FALLBACK_MS = 12_000;
const POLL_MS = 12_000;

export function ContractPopup() {
  const { t } = useI18n();
  const { user } = useApp();
  const [contract, setContract] = useState<PendingContract | null>(null);
  const [armed, setArmed] = useState(false); /* هل أُغلقت نافذة الاطمئنان؟ */
  const [signature, setSignature] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const armedRef = useRef(false);
  const contractRef = useRef<PendingContract | null>(null);

  const maybeOpen = useCallback(() => {
    if (armedRef.current && contractRef.current) setContract(contractRef.current);
  }, []);

  /* ① انتظار إغلاق نافذة الاطمئنان (حدث + احتياط زمني) */
  useEffect(() => {
    const onClose = () => {
      armedRef.current = true;
      setArmed(true);
      maybeOpen();
    };
    window.addEventListener("tumaanina-welcome-closed", onClose);
    const fb = setTimeout(onClose, WELCOME_FALLBACK_MS);
    return () => {
      window.removeEventListener("tumaanina-welcome-closed", onClose);
      clearTimeout(fb);
    };
  }, [maybeOpen]);

  /* ② استقصاء عقد بانتظار التوقيع — للعملاء المسجّلين فقط */
  useEffect(() => {
    if (!user || user.role !== "VICTIM" || !user.id) return;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/contract?view=pending&userId=${user.id}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!alive) return;
        const c = (data.contract as PendingContract | null) ?? null;
        contractRef.current = c;
        maybeOpen();
      } catch {
        /* الشبكة متقطعة — الدورة القادمة تعيد المحاولة */
      }
    };
    load();
    const i = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(i);
    };
  }, [user, maybeOpen]);

  const sign = async () => {
    if (!contract || !user?.id || busy) return;
    setErr("");
    if (!signature) {
      setErr(t.contract.mustSign);
      return;
    }
    if (fullName.trim().length < 3) {
      setErr(t.contract.nameRequired);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "client-sign",
          userId: user.id,
          contractId: contract.id,
          signature,
          fullName: fullName.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setContract(null);
        contractRef.current = null;
        setSignature(null);
        setFullName("");
        toast({ title: t.contract.acceptSuccess, description: t.contract.acceptSuccessDesc });
      } else if (data.error === "NAME_REQUIRED") setErr(t.contract.nameRequired);
      else if (data.error === "SIGNATURE_REQUIRED") setErr(t.contract.mustSign);
      else setErr(t.common.error);
    } catch {
      setErr(t.common.error);
    } finally {
      setBusy(false);
    }
  };

  /* النافذة لا تُفتح إلا: عميل مسجّل + عقد بانتظار التوقيع + نافذة الاطمئنان أُغلقت */
  if (!contract || !user || user.role !== "VICTIM" || !armed) return null;

  return (
    <Dialog open={!!contract} onOpenChange={() => { /* إلزامية: لا إغلاق بالنقر خارجها أو Escape */ }}>
      <DialogContent
        className="sm:max-w-lg max-h-[92vh] overflow-hidden p-0 gap-0 [&>button]:hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="max-h-[92vh] overflow-y-auto"
        >
          {/* رأس متدرج */}
          <div className="gradient-primary text-white px-5 pt-5 pb-6 sticky top-0 z-10">
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-white flex items-center gap-2.5 text-base">
                <span className="h-9 w-9 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
                  <FileSignature className="h-4.5 w-4.5" />
                </span>
                {t.contract.popupTitle}
              </DialogTitle>
              <p className="text-[11px] text-white/85 font-semibold">{t.contract.popupIntro}</p>
            </DialogHeader>
          </div>

          <div className="px-5 py-5 space-y-4">
            {/* الأطراف والسياق */}
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs font-bold">
                <span className="text-muted-foreground">{t.contract.partyCounselor}</span>
                <span dir="auto">{contract.counselorName || "—"}</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs font-bold">
                <span className="text-muted-foreground">{t.contract.partyClient}</span>
                <span dir="auto">{user.fullName || user.pseudonym || "—"}</span>
              </div>
              {contract.scheduledAt && (
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs font-bold">
                  <span className="text-muted-foreground">{t.contract.sessionLabel}</span>
                  <span dir="auto">{formatDateTime(new Date(contract.scheduledAt))}</span>
                </div>
              )}
              {contract.counselorSignedAt && (
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] font-semibold text-muted-foreground">
                  <span>{t.contract.signedByCounselor}</span>
                  <span dir="auto">{formatDateTime(new Date(contract.counselorSignedAt))}</span>
                </div>
              )}
            </div>

            {/* نص العقد — لقطة ثابتة */}
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-[11px] font-black text-muted-foreground mb-2">{t.contract.templateLabel}</p>
              <div className="max-h-52 overflow-y-auto rounded-lg bg-muted/20 px-3 py-2.5" dir="auto">
                {contract.text.split("\n").filter((l) => l.trim()).map((line, i) => (
                  <p key={i} className="text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap">
                    {line}
                  </p>
                ))}
              </div>
            </div>

            {/* الامضاء الرقمي */}
            <div className="space-y-2.5">
              <Label>{t.contract.clientSignLabel}</Label>
              <SignaturePad onChange={setSignature} height={150} />
              <div className="space-y-1.5">
                <Label>{t.contract.fullNameLabel}</Label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t.contract.fullNamePlaceholder}
                  maxLength={80}
                  dir="auto"
                  className="h-10"
                />
              </div>
            </div>

            {err && <p className="text-xs font-bold text-destructive">{err}</p>}

            {/* زر «أقبل» — حفظ النسخة النهائية الممضاة من الطرفين */}
            <Button
              className="w-full h-12 gradient-primary text-white font-black rounded-xl text-base gap-2"
              disabled={busy || !signature || fullName.trim().length < 3}
              onClick={sign}
            >
              <PenLine className="h-5 w-5" />
              {busy ? t.common.loading : t.contract.acceptBtn}
            </Button>
            <p className="text-[10px] leading-relaxed text-muted-foreground font-semibold text-center">
              {t.contract.acceptNote}
            </p>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-black text-foreground block">{children}</span>;
}
