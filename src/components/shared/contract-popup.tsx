"use client";

/**
 * v1.12.0 — النافذة المنبثقة الإلزامية للعقد العلاجي (جهة العميل).
 *
 * المنطق (عقد المنصة الواحد):
 * • عقد المنصة واحد لكل المستخدمين (تديره الإدارة) — الأخصائي يمضيه،
 *   ولحظة حجز العميل جلسة معه يُنشأ للجلسة عقد مستقل برقم تسلسلي فريد
 *   فيظهر للعميل مباشرة بعد الحجز في نفس الصفحة عبر حدث
 *   tumaanina-contract-arrived، أو على أي صفحة أخرى مفتوحة عبر استقصاء
 *   كل 6 ثوانٍ — دون إعادة فتح المنصة أو التطبيق إطلاقاً.
 * • v1.12.0 (إصلاح «تظهر مرة واحدة فقط»): الحالة مربوطة بمعرّف العقد
 *   لا بعَلَم عام — كل عقد بانتظار جديد (حجز جديد لأي جلسة) يفتح النافذة
 *   من جديد ويُصفّر الإمضاء والاسم، بغض النظر عن أي عقد سابق مُمضى.
 * • النافذة إلزامية (بلا إغلاق): قراءة المستند الرسمي برقمه التسلسلي ←
 *   اختيار لغة المستند ← الامضاء بلوحة واسعة ← كتابة الاسم الكامل ←
 *   زر «أقبل» — فتُحفظ النسخة الموقّعة من الطرفين في حساب الأخصائي.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { FileSignature, Hash, PenLine } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SignaturePad } from "@/components/shared/signature-pad";
import { ContractDocument, ContractLangSelect, type ContractDocData } from "@/components/shared/contract-document";
import { toast } from "@/hooks/use-toast";

interface PendingContract {
  id: string;
  number: string | null;
  text: string;
  counselorName: string | null;
  counselorSignature: string | null;
  counselorSignedAt: string | null;
  scheduledAt: string | null;
  createdAt: string | null;
}

/* احتياط إن فاتنا حدث إغلاق نافذة الاطمئنان (مدتها القصوى ~10.6 ثانية) */
const WELCOME_FALLBACK_MS = 12_000;
/* استقصاء سريع (6 ثوانٍ) + فحص فوري عند الحجز وعند العودة إلى الصفحة —
   يظهر العقد شبه فورياً على أي صفحة فاتحها العميل دون إعادة الفتح */
const POLL_MS = 6_000;
/* حدث وصول العقد بعد الحجز مباشرة — يفتح النافذة فوراً بلا انتظار */
export const CONTRACT_ARRIVED_EVENT = "tumaanina-contract-arrived";

export function ContractPopup() {
  const { t, lang: uiLang } = useI18n();
  const { user } = useApp();
  const [contract, setContract] = useState<PendingContract | null>(null);
  const [armed, setArmed] = useState(false); /* هل أُغلقت نافذة الاطمئنان (أو وصل عقد حي)؟ */
  const [signature, setSignature] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [docLang, setDocLang] = useState<string>(uiLang);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const armedRef = useRef(false);
  const contractRef = useRef<PendingContract | null>(null);
  const loadRef = useRef<(() => void) | null>(null);
  const busyRef = useRef(false);
  const lastOpenedIdRef = useRef<string | null>(null); /* آخر عقد فُتحت له النافذة */

  /* v1.12.0: الافتتاح مربوط بمعرّف العقد — كل عقد بانتظار جديد (معرّف
     مختلف عن آخر عقد فُتحت له النافذة) يفتح النافذة من جديد ويصفّر
     خطوات الامضاء — فهذا هو إصلاح «تظهر فقط في المرة الأولى»: لا عَلَم
     عام يُطفئ النافذة بعد أول عرض، والاستقصاء مستمر طالما العميل مسجّل */
  const maybeOpen = useCallback(() => {
    const c = contractRef.current;
    if (!armedRef.current || !c) return;
    if (lastOpenedIdRef.current !== c.id) {
      /* عقد جديد — تصفير كامل لخطوات الامضاء قبل العرض */
      setSignature(null);
      setFullName("");
      setErr("");
      lastOpenedIdRef.current = c.id;
    }
    setContract(c);
  }, []);

  const arm = useCallback(() => {
    if (!armedRef.current) {
      armedRef.current = true;
      setArmed(true);
    }
  }, []);

  /* ① انتظار إغلاق نافذة الاطمئنان (حدث + احتياط زمني) —
     عند الإغلاق يُجرى فحص فوري للعقد وليس انتظار الدورة القادمة */
  useEffect(() => {
    const onClose = () => {
      arm();
      loadRef.current?.();
      maybeOpen();
    };
    window.addEventListener("tumaanina-welcome-closed", onClose);
    const fb = setTimeout(onClose, WELCOME_FALLBACK_MS);
    return () => {
      window.removeEventListener("tumaanina-welcome-closed", onClose);
      clearTimeout(fb);
    };
  }, [maybeOpen, arm]);

  /* ② استقصاء عقد بانتظار التوقيع — للعملاء المسجّلين فقط
     فحص فوري عند العودة إلى التبويب أو تركيز النافذة —
     العقد يصل العميل أينما كان في المنصة دون إعادة فتحها */
  useEffect(() => {
    if (!user || user.role !== "VICTIM" || !user.id) return;
    let alive = true;
    const load = async () => {
      if (busyRef.current) return; /* أثناء الامضاء لا نُحدث الحالة */
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
    loadRef.current = load;
    load();
    const i = setInterval(load, POLL_MS);
    const onWake = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("pageshow", onWake);
    return () => {
      alive = false;
      loadRef.current = null;
      clearInterval(i);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("pageshow", onWake);
    };
  }, [user, maybeOpen]);

  /* ③ v1.10.0: فتح فوري لحظة الحجز — واجهة الحجز تشعِر النافذة
     بحدث CONTRACT_ARRIVED فتُجري فحصاً فورياً وتفتح بلا انتظار
     نافذة الاطمئنان ولا الدورة القادمة (المستخدم حاجز الآن فعلاً) */
  useEffect(() => {
    if (!user || user.role !== "VICTIM" || !user.id) return;
    const onArrived = () => {
      arm();
      loadRef.current?.();
    };
    window.addEventListener(CONTRACT_ARRIVED_EVENT, onArrived);
    return () => window.removeEventListener(CONTRACT_ARRIVED_EVENT, onArrived);
  }, [user, arm]);

  /* لغة المستند الافتراضية تتبع لغة واجهة العميل */
  useEffect(() => {
    if (!contract) setDocLang(uiLang);
  }, [uiLang, contract]);

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
    busyRef.current = true;
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
          lang: docLang, /* v1.10.0: لغة المستند المعتمدة تُحفظ مع العقد */
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setContract(null);
        contractRef.current = null;
        setSignature(null);
        setFullName("");
        lastOpenedIdRef.current = null; /* الحجز القادم (عقد جديد) يفتح النافذة من جديد */
        toast({ title: t.contract.acceptSuccess, description: t.contract.acceptSuccessDesc });
      } else if (data.error === "NAME_REQUIRED") setErr(t.contract.nameRequired);
      else if (data.error === "SIGNATURE_REQUIRED") setErr(t.contract.mustSign);
      else setErr(t.common.error);
    } catch {
      setErr(t.common.error);
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  };

  /* النافذة لا تُفتح إلا: عميل مسجّل + عقد بانتظار التوقيع + (نافذة الاطمئنان أُغلقت أو وصل عقد حي) */
  if (!contract || !user || user.role !== "VICTIM" || !armed) return null;

  const docData: ContractDocData = {
    number: contract.number,
    text: contract.text,
    counselorName: contract.counselorName,
    clientName: user.fullName || user.pseudonym || "—",
    counselorSignature: contract.counselorSignature, /* إمضاء الأخصائي المسبق يظهر في المستند */
    clientSignature: null,
    counselorSignedAt: contract.counselorSignedAt,
    clientSignedAt: null,
    scheduledAt: contract.scheduledAt,
    createdAt: contract.createdAt,
    status: "AWAITING_CLIENT",
  };

  return (
    <Dialog open={!!contract} onOpenChange={() => { /* إلزامية: لا إغلاق بالنقر خارجها أو Escape */ }}>
      <DialogContent
        className="sm:max-w-lg max-h-[93vh] overflow-hidden p-0 gap-0 [&>button]:hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="max-h-[93vh] overflow-y-auto"
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
              {contract.number && (
                <p className="text-[11px] text-white/95 font-black flex items-center gap-1.5 mt-1">
                  <Hash className="h-3.5 w-3.5" />
                  <span className="font-mono tracking-wide" dir="ltr">{contract.number}</span>
                </p>
              )}
            </DialogHeader>
          </div>

          <div className="px-4 sm:px-5 py-5 space-y-4">
            {/* المستند الرسمي — معاينة WYSIWYG بلغة مختارة (نفس شكل الطباعة) */}
            <div className="rounded-xl border border-border overflow-hidden bg-white">
              <div className="max-h-64 overflow-y-auto">
                <div className="origin-top" style={{ padding: "6mm 5mm 0" }}>
                  <ContractDocument data={docData} lang={docLang} />
                </div>
              </div>
            </div>

            {/* لغة المستند — تُختار قبل الإقرار وتُحفظ مع العقد وتُستعمل عند الطباعة */}
            <div className="rounded-xl border border-border bg-muted/30 px-3 py-2.5">
              <ContractLangSelect value={docLang} onChange={setDocLang} />
            </div>

            {/* الامضاء الرقمي — v1.10.0: مساحة امضاء أوسع وأطول (300px) لراحة كاملة */}
            <div className="space-y-2.5">
              <Label>{t.contract.clientSignLabel}</Label>
              <SignaturePad onChange={setSignature} height={300} />
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
