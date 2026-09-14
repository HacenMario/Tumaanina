"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { motion } from "framer-motion";
import {
  Sun,
  Moon,
  MonitorSmartphone,
  BellRing,
  BellOff,
  Download,
  Trash2,
  Check,
  Globe,
  UserRound,
  KeyRound,
  Volume2,
  Save,
  ShieldCheck,
  Megaphone,
  ALargeSmall,
  ImagePlus,
  Plus,
  Stethoscope,
  EyeOff,
  CalendarClock,
  Eraser,
  Coins,
  FileSignature,
  Clock3,
  PenLine,
  Lock,
  Building2,
} from "lucide-react";
import { useI18n, LANG_META } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { pushSupported, enablePush, sendTestPush, diagnosePush, canInstall, promptInstall, registerServiceWorker, isIOS, iosPushBlocked, type PushDiagStep } from "@/lib/push-client";
import { isSoundOn, setSoundOn } from "@/lib/sounds";
import { getQuickHideConfig, saveQuickHideConfig, applyRemoteConfig, triggerQuickHideIfEnabled } from "@/lib/quick-hide";
import { RoyalCrown } from "@/components/shared/crown-badge";
import { BackButton } from "@/components/shared/back-button";
import { FacebookGlyph, InstagramGlyph, TikTokGlyph } from "@/components/shared/social-glyphs";
import { Share2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WILAYAS, WILAYA_LABELS, AGE_GROUPS, AGE_LABELS, SPECIALTIES, SLOT_TIMES, WEEKDAY_LABELS } from "@/lib/constants";
import { fullAvailability, type WeeklyAvailability } from "@/lib/availability";
import type { AppLang, CurrencyCode } from "@/lib/constants";
import { CURRENCIES, CURRENCY_CODES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { SignaturePad } from "@/components/shared/signature-pad";
import { ContractDocument, ContractPrintButton, type ContractDocData } from "@/components/shared/contract-document";
/* v1.12.0: نُزعت خاصية العقد الخاص نهائياً — عقد المنصة واحد يديره الأدمين */
import { formatDateTime } from "@/lib/utils";

const MAX_AVATAR_BYTES = 900_000;

/* ═ v1.9.0: أنواع العقد العلاجي في الإعدادات (أخصائي) ═
   v1.10.0: + number — الرقم التسلسلي الرسمي لكل عقد */
interface CContractRow {
  id: string;
  number: string | null;
  clientName: string | null;
  status: string;
  scheduledAt: string | null;
  counselorSignedAt: string | null;
  clientSignedAt: string | null;
  updatedAt: string | null;
}
interface CContractFull extends CContractRow {
  text: string;
  lang?: string | null;
  counselorName: string | null;
  counselorSignature: string | null;
  clientSignature: string | null;
  clientSignedName: string | null;
}

/* ─── v2.7.0: نافذة تفاصيل التحدي — تظهر عند ولوج الأخصائي للإعدادات ───
   3 مرات كحد أقصى لكل مستخدم، أو تعطيل نهائي بـ«لا تظهر مجدداً» —
   النص لا يكشف سرّ اللغز إطلاقاً */
const CH_INFO_SEEN_KEY = "tumaanina-challenge-info-seen";
const CH_INFO_OFF_KEY = "tumaanina-challenge-info-off";
const CH_INFO_MAX_SHOWS = 3;

function challengeInfoShouldShow(): boolean {
  try {
    if (localStorage.getItem(CH_INFO_OFF_KEY) === "1") return false;
    const seen = Number(localStorage.getItem(CH_INFO_SEEN_KEY) || "0");
    return seen < CH_INFO_MAX_SHOWS;
  } catch {
    return false;
  }
}

function markChallengeInfoSeen() {
  try {
    const seen = Number(localStorage.getItem(CH_INFO_SEEN_KEY) || "0");
    localStorage.setItem(CH_INFO_SEEN_KEY, String(seen + 1));
  } catch {
    /* تجاهل */
  }
}

function markChallengeInfoOff() {
  try {
    localStorage.setItem(CH_INFO_OFF_KEY, "1");
  } catch {
    /* تجاهل */
  }
}

/* ضغط الصورة الشخصية عبر Canvas — أقصى ضلع 700px بجودة تنازلية
   v1.3.0 إصلاح جذري لعدم ظهور الصورة: كل صورة تُعاد ترميزها عبر Canvas
   إلى JPEG قياسي — الصور الصغيرة (≤200KB) كانت تُمرَّر كما هي، فقد تصل
   بصيغة HEIC/WEBP/بصيغة بلا توافق، تُحفَظ في القاعدة لكنها لا تُعرَض
   في دليل الأخصائيين ولا في الملف العام (نقطة الصورة ترفضها المتصفحات) */
async function compressAvatar(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("READ_FAILED"));
    reader.readAsDataURL(file);
  });
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("DECODE_FAILED"));
      image.src = dataUrl;
    });
    const scale = Math.min(1, 700 / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    for (const q of [0.85, 0.75, 0.6, 0.45]) {
      const out = canvas.toDataURL("image/jpeg", q);
      if (out.length <= MAX_AVATAR_BYTES) return out;
    }
    return canvas.toDataURL("image/jpeg", 0.35);
  } catch {
    /* تعذر فك ترميز الصورة في المتصفح (HEIC مثلاً) — نرفضها بوضوح
       بدل حفظ صورة لن تظهر أبداً في القوائم والملف العام */
    if (file.type === "image/heic" || file.type === "image/heif" || /\.hei[cf]$/i.test(file.name)) {
      throw new Error("UNSUPPORTED_FORMAT");
    }
    if (dataUrl.length <= MAX_AVATAR_BYTES) return dataUrl;
    throw new Error("TOO_BIG");
  }
}

export function SettingsView() {
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const { user, setUser, reset, fontScale, setFontScale, setView } = useApp();
  const [pushOn, setPushOn] = useState(false);
  const [installable, setInstallable] = useState(false);
  /* v1.15.0: رفض الإعلانات المدفوعة — حق العميل */
  const [adsOptOut, setAdsOptOut] = useState(false);

  /* جلب حالة رفض الإعلانات عند الولوج */
  useEffect(() => {
    if (!user?.id || user.role !== "VICTIM") return;
    fetch(`/api/user-ads-status?userId=${user.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAdsOptOut(!!d?.adsOptOut))
      .catch(() => {});
  }, [user?.id, user?.role]);

  const saveAdsOptOut = async (v: boolean) => {
    if (!user?.id) return;
    setAdsOptOut(v);
    try {
      await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ads-optout", userId: user.id, optOut: v }),
      });
    } catch {
      setAdsOptOut(!v);
    }
  };
  /* v2.8.0: كشف التثبيت الحقيقي — وضع standalone فقط يعني أن التطبيق مثبّت فعلاً.
     العبارة «التطبيق مثبّت على جهازك» لا تظهر الآن إلا في هذه الحالة الوحيدة */
  const [standalone, setStandalone] = useState(false);
  /* v1.8.0: iOS — دليل التثبيت داخل بطاقة الإشعارات يظهر تلقائياً على
     الآيفون غير المثبّت، وأيضاً عند محاولة التفعيل قبل التثبيت */
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [iosDevice, setIosDevice] = useState(false);
  /* v2.14.0: الأصوات مطفأة افتراضياً — تُقرأ القيمة الحقيقية بعد الإقلاع */
  const [soundOn, setSoundOnState] = useState(false);
  /* نتائج الفحص التشخيصي للإشعارات */
  const [diag, setDiag] = useState<PushDiagStep[] | null>(null);
  const [diagBusy, setDiagBusy] = useState(false);

  /* معلومات الحساب */
  const [wilaya, setWilaya] = useState(user?.wilaya || "");
  const [ageGroup, setAgeGroup] = useState(user?.ageGroup || "");
  const [gender, setGender] = useState<"male" | "female" | "">((user?.gender as "male" | "female") || "");
  /* v2.7.0: هاتف العميل — تعديله من الإعدادات، يظهر حصراً لأخصائي الجلسة المختارة */
  const [victimPhone, setVictimPhone] = useState<string>(user?.phone || "");
  const [fullName, setFullName] = useState(user?.fullName || "");
  const [whatsapp, setWhatsapp] = useState("");
  const [bio, setBio] = useState("");
  /* إدارة التخصصات من الإعدادات (الجاهزة + الخاصة) */
  const [mySpecialties, setMySpecialties] = useState<string[]>([]);
  const [myCustom, setMyCustom] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState("");
  /* صورة المختص الشخصية */
  const [photo, setPhoto] = useState<string | null | undefined>(user?.photo ?? null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileErr, setProfileErr] = useState("");

  /* كلمة المرور */
  const [pwOld, setPwOld] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwErr, setPwErr] = useState("");
  const [pwOk, setPwOk] = useState("");

  /* الإخفاء السريع (v2.5.3) — متاح للجميع حتى بدون حساب */
  const [qhEnabled, setQhEnabled] = useState(false);
  const [qhPin1, setQhPin1] = useState("");
  const [qhPin2, setQhPin2] = useState("");
  const [qhBusy, setQhBusy] = useState(false);
  const [qhErr, setQhErr] = useState("");

  /* ─── v2.6.0: جدول التوفر الأسبوعي (أخصائي فقط) ───
     null في الحالة = لم يُحفظ جدول بعد → كل الأوقات متاحة افتراضياً */
  const [avail, setAvail] = useState<WeeklyAvailability | null>(null);
  const [availOriginal, setAvailOriginal] = useState<WeeklyAvailability | null>(null);
  const [availBusy, setAvailBusy] = useState(false);

  /* ─── v2.7.0: نافذة تفاصيل التحدي للأخصائي — عند ولوج الإعدادات (3 مرات كحد أقصى) ─── */
  const [challengeInfoOpen, setChallengeInfoOpen] = useState(false);

  /* ─── v2.9.0: روابط التواصل الاجتماعي + جنس العميلين المقبول (أخصائي فقط) ─── */
  const [socials, setSocials] = useState({ facebook: "", instagram: "", tiktok: "" });
  /* v1.18.0: الانتماء للعيادة قابل للتعديل — مستقل افتراضياً */
  const [myClinicId, setMyClinicId] = useState("none");
  const [clinicsList, setClinicsList] = useState<{ id: string; name: string }[]>([]);
  const [acceptedGenders, setAcceptedGenders] = useState<string[]>(["male", "female"]);
  /* v1.3.0 (طمأنينة): سعر الجلسة لكل عملة على حدة — الأخصائي يحدد
     سعر الدينار/اليورو/الدولار بنفسه، والعميل يرى سعر عملته فقط */
  const [sessionPrices, setSessionPrices] = useState<Record<CurrencyCode, string>>({ DZD: "2500", EUR: "17", USD: "19" });
  /* زر حفظ بطاقة الروابط/السعر/الجنس — حالة مستقلة ونتيجة صريحة */
  const [prefsBusy, setPrefsBusy] = useState(false);
  const [prefsMsg, setPrefsMsg] = useState("");
  const [prefsErr, setPrefsErr] = useState("");

  /* ═ v1.9.0: سنوات الخبرة (أخصائي) — يعدّلها من إعداداته ═ */
  const [yearsExp, setYearsExp] = useState<string>("0");

  /* ═ v1.12.0: عقد المنصة (أخصائي) — نص معتمد من الإدارة قراءةً فقط
     + إمضاء الأخصائي عليه + قائمة العقود الممضاة من الطرفين ═ */
  const [contractText, setContractText] = useState("");
  const [contractLocked, setContractLocked] = useState(true);
  const [contractPlatformAt, setContractPlatformAt] = useState<string | null>(null);
  const [contractSignature, setContractSignature] = useState<string | null>(null);
  const [contractSignedAt, setContractSignedAt] = useState<string | null>(null);
  const [contractBusy, setContractBusy] = useState(false);
  const [contractMsg, setContractMsg] = useState("");
  const [contractErr, setContractErr] = useState("");
  const [cContracts, setCContracts] = useState<CContractRow[]>([]);
  const [viewContract, setViewContract] = useState<CContractFull | null>(null);
  const [viewBusy, setViewBusy] = useState(false);

  const availDirty = () => {
    if (!avail) return false;
    return JSON.stringify(avail) !== JSON.stringify(availOriginal);
  };

  useEffect(() => {
    setQhEnabled(getQuickHideConfig().enabled);
  }, []);

  /* v2.8.0: الإخفاء السريع يتبع الحساب من قاعدة البيانات — لا إعادة ضبط بعد
     كل خروج وتسجيل دخول، ويعمل على أي جهاز بعد الولوج (localStorage احتياط) */
  useEffect(() => {
    if (!user?.id || user.role === "ADMIN") return;
    fetch(`/api/quickhide?userId=${user.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        if (d.enabled && d.hash) {
          applyRemoteConfig(true, d.hash);
          setQhEnabled(true);
        } else if (d.enabled === false && !getQuickHideConfig().enabled) {
          /* القاعدة تقول معطّل والمحلي لا شيء — لا تغيير */
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /* v2.7.0: نافذة التحدي — تفتح مرة عند ولوج أخصائي للإعدادات (حتى 3 مرات) */
  useEffect(() => {
    if (user?.role === "COUNSELOR" && challengeInfoShouldShow()) {
      markChallengeInfoSeen();
      setChallengeInfoOpen(true);
    }
  }, [user?.role]);

  useEffect(() => {
    registerServiceWorker();
    /* v2.8.0: فحص وضع التثبيت الفعلي + إعادة الفحص عند العودة للتبويب */
    const checkStandalone = () => {
      try {
        const sm = window.matchMedia?.("(display-mode: standalone)")?.matches;
        const ios = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
        setStandalone(!!(sm || ios));
      } catch {
        setStandalone(false);
      }
    };
    checkStandalone();
    setIosDevice(isIOS());
    window.addEventListener("focus", checkStandalone);
    const t1 = setTimeout(() => setInstallable(canInstall()), 0);
    const t3 = setTimeout(() => setSoundOnState(isSoundOn()), 0);
    const i = setInterval(() => setInstallable(canInstall()), 2000);
    setTimeout(() => clearInterval(i), 20000);
    return () => {
      clearTimeout(t1);
      clearInterval(t3);
      clearInterval(i);
      window.removeEventListener("focus", checkStandalone);
    };
  }, []);

  /* ═ v1.3.0 إصلاح «اشتراك هذا الجهاز ❌» ═
     1) مفتاح الإشعارات كان يُعرض مفعّلاً بمجرد إذن المتصفح (granted) حتى بلا
        أي اشتراك فعلي — الآن الحالة تُقرأ من اشتراك المتصفح الحقيقي.
     2) إصلاح ذاتي: مستخدم له إذن ممنوح لكن بلا اشتراك (فُقد بعد تحديث
        المتصفح/تغيير المفتاح) يُعاد اشتراكه وحفظه على الخادم تلقائياً هنا. */
  useEffect(() => {
    let cancelled = false;
    const reflect = async () => {
      try {
        if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
        if (Notification.permission !== "granted") {
          if (!cancelled) setPushOn(false);
          return;
        }
        const reg = await navigator.serviceWorker.getRegistration("/");
        const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
        if (cancelled) return;
        setPushOn(!!sub);
        /* الإصلاح الذاتي: إذن ممنوح + مستخدم مسجّل + لا اشتراك → اشتراك فوري صامت */
        if (!sub && user?.id && user.role !== "ADMIN") {
          const r = await enablePush(user.id, user.role);
          if (!cancelled) setPushOn(r.ok);
          if (r.ok) console.log("[PUSH] تم تجديد اشتراك الجهاز تلقائياً");
        }
      } catch {
        /* تجاهل */
      }
    };
    const t = setTimeout(reflect, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /* تحميل معلومات الأخصائي (واتساب/نبذة/صورة/تخصصات) من مساره الخفيف الخاص
     — v2.5.3: بدل سحب قائمة كل الأخصائيين بالصور الضخمة في كل زيارة للإعدادات */
  useEffect(() => {
    if (user?.role !== "COUNSELOR" || !user.id) return;
    fetch(`/api/counselor?userId=${user.id}`)
      .then((r) => r.json())
      .then((d) => {
        const me = d.profile;
        if (me) {
          setFullName(me.fullName || user.fullName || "");
          setWhatsapp(me.whatsapp || "");
          setBio(me.bio || "");
          setPhoto(me.photo || null);
          setMySpecialties(Array.isArray(me.specialties) ? me.specialties : []);
          setMyCustom(Array.isArray(me.customSpecialties) ? me.customSpecialties : []);
          /* v2.9.0: روابط التواصل + تفضيل الجنس */
          const so = me.socials || {};
          setSocials({ facebook: so.facebook || "", instagram: so.instagram || "", tiktok: so.tiktok || "" });
          setAcceptedGenders(Array.isArray(me.acceptedGenders) && me.acceptedGenders.length ? me.acceptedGenders : ["male", "female"]);
          /* v1.18.0: الانتماء الحالي للعيادة */
          setMyClinicId(me.clinicId || "none");
          /* v1.3.0: أسعار الجلسة الثلاثة (السجلات القديمة تُرحَّل تلقائياً) */
          const sp = me.sessionPrices || {};
          setSessionPrices({
            DZD: String(Math.round(Number(sp.DZD) || Number(me.sessionPrice) || 2500)),
            EUR: String(Number(sp.EUR) > 0 ? Number(sp.EUR) : 17),
            USD: String(Number(sp.USD) > 0 ? Number(sp.USD) : 19),
          });
          /* v2.6.0: الجدول المحفوظ — أو الشبكة الكاملة الافتراضية للعرض */
          const saved = me.weeklyAvailability as WeeklyAvailability | null | undefined;
          const grid = saved && typeof saved === "object" ? (saved as WeeklyAvailability) : fullAvailability();
          setAvail(grid);
          setAvailOriginal(saved && typeof saved === "object" ? (saved as WeeklyAvailability) : null);
          /* v1.9.0: سنوات الخبرة — قابلة للتعديل من الإعدادات */
          setYearsExp(String(Number(me.yearsExperience) || 0));
        }
      })
      .catch(() => {});
    /* v1.9.0: قالب العقد العلاجي + قائمة العقود الممضاة — مسار مستقل خفيف */
    /* v1.18.0: قائمة العيادات النشطة لاختيار الانتماء */
    fetch("/api/clinics?pageSize=200")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d?.clinics)) setClinicsList(d.clinics.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
      })
      .catch(() => {});
    fetch(`/api/contract?view=template&userId=${user.id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const tpl = d?.template;
        if (!tpl) return;
        setContractText(tpl.text || "");
        setContractLocked(tpl.locked !== false); /* v1.12.0: النص محمي دائماً — الإدارة وحدها تعدّله */
        setContractPlatformAt(tpl.platformUpdatedAt || null);
        setContractSignature(tpl.signature || null);
        setContractSignedAt(tpl.signedAt || null);
      })
      .catch(() => {});
    fetch(`/api/contract?view=list&userId=${user.id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d?.contracts)) setCContracts(d.contracts);
      })
      .catch(() => {});
  }, [user]);

  const togglePush = async (v: boolean) => {
    if (!v) {
      setPushOn(false);
      /* v1.3.0: الإطفاء يلغي اشتراك المتصفح فعلياً — كان يكتفي بإخفاء
         المفتاح بينما الاشتراك حيّ على الخادم */
      try {
        const reg = await navigator.serviceWorker.getRegistration("/");
        const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
        await sub?.unsubscribe().catch(() => {});
      } catch {}
      return;
    }
    if (!pushSupported()) {
      toast({ title: t.settings.pushUnsupported });
      return;
    }
    if (!user) {
      toast({ title: t.roles.victimDesc });
      return;
    }
    const result = await enablePush(user.id, user.role);
    if (result.ok) {
      setPushOn(true);
      toast({ title: t.settings.pushEnabled });
    } else {
      /* رسالة دقيقة لكل نوع فشل — لا نظهر «متصفحك لا يدعم» إلا فعلاً غير مدعوم */
      const map: Record<string, string> = {
        DENIED: t.settings.pushDenied,
        UNSUPPORTED: t.settings.pushUnsupported,
        SW_FAILED: t.settings.pushSwFailed,
        NO_KEY: t.settings.pushServerError,
        SAVE_FAILED: t.settings.pushServerError,
        SUBSCRIBE_FAILED: t.settings.pushSubscribeFailed,
        /* v1.8.0: الآيفون — الإشعارات تعمل من التطبيق المثبّت فقط */
        IOS_NEEDS_INSTALL: t.settings.pushIosNeedInstall,
      };
      toast({ title: map[result.error || ""] || t.settings.pushSubscribeFailed });
      if (result.error === "IOS_NEEDS_INSTALL") {
        /* v1.8.0: إبراز دليل تثبيت iOS داخل البطاقة فوراً */
        setShowIosGuide(true);
      } else if (result.error && result.error !== "DENIED") {
        console.error("[PUSH] enablePush error:", result.error);
      }
    }
  };

  const test = async () => {
    if (!user) return;
    const r = await sendTestPush(user.id, t.push.testTitle, t.push.testBody);
    if (r.ok) toast({ title: t.settings.pushTestSent });
    else if (r.error === "NO_SUBSCRIPTION") toast({ title: t.settings.pushNoSub });
    else toast({ title: t.settings.pushDenied });
  };

  /* 🔍 فحص شامل: يعرض نتيجة كل خطوة في سلسلة الإشعارات */
  const runDiag = async () => {
    setDiagBusy(true);
    setDiag(null);
    try {
      const steps = await diagnosePush(user?.id, user?.role);
      setDiag(steps);
    } finally {
      setDiagBusy(false);
    }
  };

  const diagLabel = (step: PushDiagStep["step"]) =>
    ({
      support: t.settings.diagSupport,
      sw: t.settings.diagSw,
      permission: t.settings.diagPermission,
      key: t.settings.diagKey,
      subscription: t.settings.diagSubscription,
      save: t.settings.diagSave,
    }[step]);

  const install = async () => {
    const outcome = await promptInstall();
    if (outcome === "accepted") {
      toast({ title: t.settings.installDone });
      setInstallable(false);
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    setProfileBusy(true);
    setProfileErr("");
    try {
      if (user.role === "VICTIM") {
        const res = await fetch("/api/client", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update-profile",
            userId: user.id,
            wilaya: wilaya === "none" ? "" : wilaya,
            ageGroup: ageGroup === "none" ? "" : ageGroup,
            gender: gender || undefined,
            language: lang,
            phone: victimPhone.trim(),
          }),
        });
        const data = await res.json();
        if (res.status === 401) {
          /* جلسة محلية قديمة (الحساب حُذف أو غُيّرت القاعدة) — خروج نظيف بدل أخطاء متكررة */
          toast({ title: t.settings.sessionExpired });
          reset();
          return;
        }
        if (data.ok) {
          setUser({ ...user, wilaya: data.user?.wilaya ?? undefined, ageGroup: data.user?.ageGroup ?? undefined, gender: gender || null, language: lang, phone: data.user?.phone ?? null });
          toast({ title: t.settings.profileSaved });
        } else if (data.error === "INVALID_PHONE") setProfileErr(t.client.phoneInvalid);
        else setProfileErr(t.common.error);
      } else if (user.role === "COUNSELOR") {
        const res = await fetch("/api/counselor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update-profile",
            userId: user.id,
            fullName,
            whatsapp,
            bio,
            specialties: mySpecialties,
            customSpecialties: myCustom,
            /* v2.9.0: روابط التواصل + جنس العملاء المقبول */
            socials,
            acceptedGenders,
            /* v1.9.0: سنوات الخبرة — قابلة للتعديل من الإعدادات */
            yearsExperience: Math.max(0, Math.min(70, Math.round(Number(yearsExp) || 0))),
            /* v1.18.0: الانتماء للعيادة أو الاستقلال */
            clinicId: myClinicId === "none" ? null : myClinicId,
            /* v1.3.0: أسعار الجلسة الثلاثة المستقلة */
            sessionPrices: {
              DZD: Math.round(Number(sessionPrices.DZD) || 0),
              EUR: Number(sessionPrices.EUR) || 0,
              USD: Number(sessionPrices.USD) || 0,
            },
          }),
        });
        const data = await res.json();
        if (res.status === 401) {
          toast({ title: t.settings.sessionExpired });
          reset();
          return;
        }
        if (data.ok) {
          setUser({ ...user, fullName });
          toast({ title: t.settings.profileSaved });
        } else if (data.error === "INVALID_WHATSAPP") setProfileErr(t.counselor.whatsappInvalid);
        else if (data.error === "INVALID_PRICE") setProfileErr(t.settings.priceInvalid);
        else setProfileErr(t.common.error);
      }
    } finally {
      setProfileBusy(false);
    }
  };

  /* ═ v1.3.0: حفظ مستقل لبطاقة الروابط/السعر/الجنس — زر صريح بنتيجة واضحة ═
     (كانت هذه الحقول تُحفَظ فقط بزر «الحساب» أعلى الصفحة، فبدت وكأنها
     بلا زر حفظ، وفشل السعر كان يُسقط كل شيء بصمت) */
  const savePrefs = async () => {
    if (!user || user.role !== "COUNSELOR") return;
    setPrefsBusy(true);
    setPrefsMsg("");
    setPrefsErr("");
    try {
      const res = await fetch("/api/counselor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-profile",
          userId: user.id,
          socials,
          acceptedGenders,
          clinicId: myClinicId === "none" ? null : myClinicId,
          sessionPrices: {
            DZD: Math.round(Number(sessionPrices.DZD) || 0),
            EUR: Number(sessionPrices.EUR) || 0,
            USD: Number(sessionPrices.USD) || 0,
          },
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setPrefsMsg(t.settings.profileSaved);
        toast({ title: t.settings.profileSaved });
      } else if (data.error === "INVALID_PRICE") setPrefsErr(t.settings.priceInvalid);
      else if (data.error === "INVALID_WHATSAPP") setPrefsErr(t.counselor.whatsappInvalid);
      else setPrefsErr(t.common.error);
    } catch {
      setPrefsErr(t.common.error);
    } finally {
      setPrefsBusy(false);
    }
  };

  /* ═ v1.12.0: إمضاء الأخصائي على عقد المنصة — النص معتمد من الإدارة
     ولا يقبل أي تعديل؛ الأخصائي يمضي فقط فتُنشأ عقود عملائه بلقطة النص ═ */
  const saveContract = async () => {
    if (!user || user.role !== "COUNSELOR") return;
    setContractErr("");
    setContractMsg("");
    if (!contractSignature) {
      setContractErr(t.contract.mustSign);
      return;
    }
    setContractBusy(true);
    try {
      const res = await fetch("/api/contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "counselor-sign",
          userId: user.id,
          signature: contractSignature,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setContractSignedAt(data.signedAt || new Date().toISOString());
        setContractMsg(t.contract.savedOk);
        toast({ title: t.contract.savedOk });
        /* تحديث قائمة العقود بعد الحفظ (تُنشأ عقود الجلسات الحية فوراً) */
        fetch(`/api/contract?view=list&userId=${user.id}`, { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (Array.isArray(d?.contracts)) setCContracts(d.contracts);
          })
          .catch(() => {});
      } else if (data.error === "SIGNATURE_REQUIRED") setContractErr(t.contract.mustSign);
      else setContractErr(t.common.error);
    } catch {
      setContractErr(t.common.error);
    } finally {
      setContractBusy(false);
    }
  };

  /* ═ v1.9.0: عرض عقد ممضى بالتفصيل (النسخة النهائية من الطرفين) ═ */
  const openContract = async (id: string) => {
    if (!user?.id || viewBusy) return;
    setViewBusy(true);
    try {
      const res = await fetch(`/api/contract?view=one&id=${id}&userId=${user.id}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.contract) setViewContract(data.contract);
    } catch {
      /* تجاهل */
    } finally {
      setViewBusy(false);
    }
  };

  const changePw = async () => {
    if (!user) return;
    setPwErr("");
    setPwOk("");
    if (!pwNew || pwNew.length < 8) {
      setPwErr(t.client.weakPassword);
      return;
    }
    setPwBusy(true);
    try {
      const endpoint = user.role === "VICTIM" ? "/api/client" : "/api/counselor";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "change-password", userId: user.id, oldPassword: pwOld, newPassword: pwNew }),
      });
      const data = await res.json();
      if (res.status === 401) {
        toast({ title: t.settings.sessionExpired });
        reset();
        return;
      }
      if (data.ok) {
        setPwOk(t.settings.pwChanged);
        setPwOld("");
        setPwNew("");
      } else if (data.error === "WEAK_PASSWORD") setPwErr(t.client.weakPassword);
      else setPwErr(t.settings.pwWrong);
    } finally {
      setPwBusy(false);
    }
  };

  /* ضغط صورة شخصية أخف (أقصى ضلع 700px) ثم حفظها فوراً */
  const savePhoto = async (dataUrl: string | null) => {
    if (!user) return;
    setPhotoBusy(true);
    try {
      const res = await fetch("/api/counselor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-profile", userId: user.id, photo: dataUrl }),
      });
      const data = await res.json();
      if (data.ok) {
        setPhoto(dataUrl);
        setUser({ ...user, photo: dataUrl || undefined });
        toast({ title: t.settings.photoSaved });
      } else {
        toast({ title: t.common.error });
      }
    } finally {
      setPhotoBusy(false);
    }
  };

  const pickPhoto = async (file: File | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    try {
      const dataUrl = await compressAvatar(file);
      await savePhoto(dataUrl);
    } catch (e) {
      /* v1.3.0: رسالة دقيقة — صيغة غير مدعومة (HEIC) أو حجم كبير */
      toast({ title: (e as Error)?.message === "UNSUPPORTED_FORMAT" ? t.settings.photoUnsupported : t.counselor.diplomaTooBig });
    }
  };

  /* إضافة تخصص خاص من الإعدادات (بحد أقصى 8) — يُحفظ مع «حفظ» الحساب */
  const addCustomHere = () => {
    const v = customInput.trim().slice(0, 50);
    if (!v || myCustom.includes(v) || myCustom.length >= 8) return;
    setMyCustom([...myCustom, v]);
    setCustomInput("");
  };

  /* ─── v2.6.0: عمليات شبكة جدول التوفر ─── */
  const toggleSlot = (day: number, slot: string) => {
    setAvail((cur) => {
      const base: WeeklyAvailability = cur ? { ...cur } : fullAvailability();
      const dayArr = Array.isArray(base[String(day)]) ? [...base[String(day)]] : [];
      const idx = dayArr.indexOf(slot);
      if (idx >= 0) dayArr.splice(idx, 1);
      else dayArr.push(slot);
      dayArr.sort();
      base[String(day)] = dayArr;
      return base;
    });
  };

  const setDayAll = (day: number) => {
    setAvail((cur) => {
      const base: WeeklyAvailability = cur ? { ...cur } : fullAvailability();
      base[String(day)] = [...SLOT_TIMES];
      return base;
    });
  };

  const setDayClear = (day: number) => {
    setAvail((cur) => {
      const base: WeeklyAvailability = cur ? { ...cur } : fullAvailability();
      base[String(day)] = [];
      return base;
    });
  };

  const saveAvail = async () => {
    if (!user || !avail) return;
    setAvailBusy(true);
    try {
      const res = await fetch("/api/counselor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-availability", userId: user.id, weeklyAvailability: avail }),
      });
      const data = await res.json();
      if (data.ok) {
        const saved = (data.weeklyAvailability ?? null) as WeeklyAvailability | null;
        setAvailOriginal(saved);
        setAvail(saved && typeof saved === "object" && Object.keys(saved).length ? saved : avail);
        toast({ title: t.settings.availSaved });
      } else {
        toast({ title: t.common.error });
      }
    } finally {
      setAvailBusy(false);
    }
  };

  /* ─── الإخفاء السريع: تفعيل/تعطيل ─── */
  const enableQuickHide = async () => {
    setQhErr("");
    if (!/^\d{4,8}$/.test(qhPin1)) {
      setQhErr(t.settings.qhPinShort);
      return;
    }
    if (qhPin1 !== qhPin2) {
      setQhErr(t.settings.qhPinMismatch);
      return;
    }
    setQhBusy(true);
    try {
      await saveQuickHideConfig(true, qhPin1);
      setQhEnabled(true);
      setQhPin1("");
      setQhPin2("");
      /* v2.8.0: احفظ التفعيل في الحساب — ينجو من الخروج ومسح المتصفح */
      if (user?.id) {
        const { hashPin } = await import("@/lib/quick-hide");
        const h = await hashPin(qhPin1 || "");
        void fetch("/api/quickhide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, enabled: true, hash: h }),
        }).catch(() => {});
      }
      toast({ title: t.settings.qhSaved });
    } catch {
      setQhErr(t.settings.qhPinShort);
    } finally {
      setQhBusy(false);
    }
  };

  const disableQuickHide = async () => {
    setQhErr("");
    /* التأكد من الرمز قبل التعطيل — حتى لا يعطّلها غيرك بسهولة */
    const cfg = getQuickHideConfig();
    if (cfg.hash && qhPin1) {
      try {
        const { hashPin } = await import("@/lib/quick-hide");
        const h = await hashPin(qhPin1);
        if (h !== cfg.hash) {
          setQhErr(t.settings.qhWrongPin);
          return;
        }
      } catch {
        /* نتابع التعطيل */
      }
    }
    await saveQuickHideConfig(false);
    setQhEnabled(false);
    setQhPin1("");
    setQhPin2("");
    /* v2.8.0: احفظ التعطيل في الحساب أيضاً */
    if (user?.id) {
      void fetch("/api/quickhide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, enabled: false }),
      }).catch(() => {});
    }
    toast({ title: t.settings.qhDisabled });
  };

  const themes = [
    { key: "light", icon: Sun, label: t.settings.themes.light },
    { key: "dark", icon: Moon, label: t.settings.themes.dark },
    { key: "system", icon: MonitorSmartphone, label: t.settings.themes.system },
  ];

  const isVictim = user?.role === "VICTIM";
  const isCounselor = user?.role === "COUNSELOR";

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 md:py-14 space-y-6">
      <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="text-2xl md:text-3xl font-black">
        {t.settings.title}
      </motion.h1>
      <BackButton />

      {/* ─── معلومات الحساب (لكل الأدوار) ─── */}
      {user && (isVictim || isCounselor) && (
        <Card className="border-border/70">
          <CardContent className="p-6 space-y-5">
            <h2 className="font-black flex items-center gap-2 pb-2">
              <UserRound className="h-4.5 w-4.5 text-primary" />
              {t.settings.sectionAccount}
            </h2>

            <div className="rounded-xl bg-muted/50 px-4 py-2.5 text-xs font-bold text-muted-foreground flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
              {isVictim
                ? `${t.settings.accountPseudonym}: ${user.pseudonym}`
                : `${t.settings.accountEmail}: ${user.email}`}
            </div>

            <div className="space-y-3">
              {isCounselor && (
                <>
                  <div className="space-y-1.5">
                    <Label className="font-bold">{t.settings.accountFullName}</Label>
                    <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="rounded-xl bg-card" dir="auto" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-bold">{t.settings.accountWhatsapp}</Label>
                    <Input
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      placeholder="0555123456"
                      className="rounded-xl bg-card font-mono"
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-bold">{t.settings.accountBio}</Label>
                    <Input value={bio} onChange={(e) => setBio(e.target.value)} className="rounded-xl bg-card" dir="auto" />
                  </div>
                  {/* ═ v1.9.0: سنوات الخبرة — يعدّلها الأخصائي من إعداداته ═ */}
                  {isCounselor && (
                    <div className="space-y-1.5">
                      <Label className="font-bold flex items-center gap-1.5">
                        <Clock3 className="h-3.5 w-3.5 text-primary" />
                        {t.settings.yearsExperienceLabel}
                      </Label>
                      <div className="flex items-center gap-3">
                        <Input
                          type="number"
                          min={0}
                          max={70}
                          step={1}
                          dir="ltr"
                          value={yearsExp}
                          onChange={(e) => setYearsExp(e.target.value)}
                          className="rounded-xl bg-card w-28"
                        />
                        <span className="text-xs font-bold text-muted-foreground">{t.client.yearsExp}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground font-semibold">{t.settings.yearsExperienceHint}</p>
                    </div>
                  )}
                  {/* إدارة التخصصات: الجاهزة (تعديل/إزالة) + الخاصة (إضافة/حذف) */}
                  <div className="space-y-2">
                    <Label className="font-bold">{t.settings.accountSpecialties}</Label>
                    <div className="flex flex-wrap gap-2">
                      {SPECIALTIES.map((s) => (
                        <label
                          key={s}
                          className={`cursor-pointer rounded-full border px-3 py-1 text-[11px] font-bold transition-all flex items-center gap-1.5 ${
                            mySpecialties.includes(s)
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border hover:border-primary/40"
                          }`}
                        >
                          <Checkbox
                            checked={mySpecialties.includes(s)}
                            onCheckedChange={() =>
                              setMySpecialties(mySpecialties.includes(s) ? mySpecialties.filter((x) => x !== s) : [...mySpecialties, s])
                            }
                            className="sr-only"
                          />
                          {mySpecialties.includes(s) && <Check className="h-3 w-3" />}
                          {t.client.specialties[s]}
                        </label>
                      ))}
                    </div>
                    {myCustom.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {myCustom.map((cs) => (
                          <Badge key={cs} variant="secondary" className="text-[11px] font-semibold gap-1">
                            {cs}
                            <button
                              type="button"
                              onClick={() => setMyCustom(myCustom.filter((x) => x !== cs))}
                              className="text-destructive hover:text-destructive/80"
                              aria-label={t.common.delete}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Input
                        value={customInput}
                        onChange={(e) => setCustomInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addCustomHere();
                          }
                        }}
                        placeholder={t.counselor.customSpecialtiesPlaceholder}
                        className="rounded-xl bg-card"
                        maxLength={50}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-xl font-bold shrink-0"
                        disabled={!customInput.trim() || myCustom.length >= 8}
                        onClick={addCustomHere}
                      >
                        <Plus className="h-4 w-4" />
                        {t.common.add}
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground font-semibold">{t.settings.accountSpecialtiesHint}</p>
                  </div>
                  {/* الصورة الشخصية — اختيارية: تغيير أو حذف فوري */}
                  <div className="space-y-2">
                    <Label className="font-bold">{t.settings.accountPhoto}</Label>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*,.heic,.heif"
                      className="hidden"
                      onChange={(e) => {
                        void pickPhoto(e.target.files?.[0] || null);
                        if (photoInputRef.current) photoInputRef.current.value = "";
                      }}
                    />
                    <div className="flex items-center gap-4">
                      {photo ? (
                        <div className="relative shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photo}
                            alt={t.settings.accountPhoto}
                            className="h-20 w-20 rounded-2xl object-cover border-2 border-primary/40"
                          />
                        </div>
                      ) : (
                        <div className="h-20 w-20 rounded-2xl bg-muted/60 border-2 border-dashed border-border flex items-center justify-center shrink-0">
                          <UserRound className="h-8 w-8 text-muted-foreground/50" />
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-lg font-bold"
                          disabled={photoBusy}
                          onClick={() => photoInputRef.current?.click()}
                        >
                          <ImagePlus className="h-4 w-4" />
                          {photo ? t.settings.photoChange : t.counselor.photoUploadBtn}
                        </Button>
                        {photo && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="rounded-lg font-bold text-destructive border-destructive/40"
                            disabled={photoBusy}
                            onClick={() => void savePhoto(null)}
                          >
                            <Trash2 className="h-4 w-4" />
                            {t.settings.photoRemove}
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground font-semibold">{t.settings.photoHint}</p>
                  </div>
                </>
              )}

              {isVictim && (
                <>
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-muted-foreground">{t.client.phoneLabel} — {t.common.optional}</span>
                    <Input
                      type="tel"
                      dir="ltr"
                      value={victimPhone}
                      onChange={(e) => setVictimPhone(e.target.value)}
                      placeholder="0555123456"
                      className="rounded-xl bg-card font-mono"
                      maxLength={20}
                    />
                    <p className="text-[11px] text-muted-foreground font-semibold">{t.client.phoneHint}</p>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                  {/* الجنس — ذكر أو أنثى فقط */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-muted-foreground">{t.client.genderLabel}</span>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { v: "male" as const, label: t.client.genderMale },
                        { v: "female" as const, label: t.client.genderFemale },
                      ]).map((g) => (
                        <button
                          key={g.v}
                          type="button"
                          onClick={() => setGender(g.v)}
                          className={`rounded-xl border-2 py-2.5 text-sm font-bold transition-all ${
                            gender === g.v
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border hover:border-primary/40"
                          }`}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-muted-foreground">{t.settings.accountWilaya}</span>
                    <Select value={wilaya} onValueChange={setWilaya} dir={lang === "ar" ? "rtl" : "ltr"}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        <SelectItem value="none">—</SelectItem>
                        {WILAYAS.map((w) => (
                          <SelectItem key={w} value={w}>
                            {WILAYA_LABELS[w]?.[lang] ?? w}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-muted-foreground">{t.settings.accountAgeGroup}</span>
                    <Select value={ageGroup} onValueChange={setAgeGroup} dir={lang === "ar" ? "rtl" : "ltr"}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {AGE_GROUPS.map((a) => (
                          <SelectItem key={a} value={a}>
                            {AGE_LABELS[a]?.[lang] ?? a}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                </>
              )}

              {profileErr && <div className="rounded-xl bg-destructive/10 text-destructive text-xs font-bold px-3 py-2">{profileErr}</div>}

              <Button size="sm" className="gradient-primary text-white font-bold rounded-lg" disabled={profileBusy} onClick={saveProfile}>
                <Save className="h-4 w-4" />
                {profileBusy ? t.common.loading : t.common.save}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── v2.6.0: جدول التوفر الأسبوعي (أخصائي فقط) ─── */}
      {isCounselor && avail && (
        <Card className="border-primary/30 bg-primary/[0.03]">
          <CardContent className="p-6 space-y-4">
            <h2 className="font-black flex items-center gap-2 pb-2">
              <CalendarClock className="h-4.5 w-4.5 text-primary" />
              {t.settings.availTitle}
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">{t.settings.availDesc}</p>

            {!availOriginal && (
              <div className="rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[11px] font-bold px-3 py-2">
                {t.settings.availDefaultHint}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg font-bold"
                onClick={() => setAvail(fullAvailability())}
              >
                <Check className="h-3.5 w-3.5 text-primary" />
                {t.settings.availSelectAll}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg font-bold"
                onClick={() => {
                  const empty: WeeklyAvailability = {};
                  for (let d = 0; d < 7; d++) empty[String(d)] = [];
                  setAvail(empty);
                }}
              >
                <Eraser className="h-3.5 w-3.5 text-destructive" />
                {t.settings.availClearAll}
              </Button>
            </div>

            <div className="space-y-2.5">
              {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                const dayArr = Array.isArray(avail[String(day)]) ? avail[String(day)] : [];
                return (
                  <div key={day} className="rounded-xl border border-border/70 bg-card/60 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-black">{WEEKDAY_LABELS[lang][day]}</span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDayAll(day)}
                          className="text-[10px] font-bold rounded-md border border-border px-2 py-0.5 hover:border-primary/50 hover:text-primary transition-colors"
                        >
                          {t.settings.availAllDay}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDayClear(day)}
                          className="text-[10px] font-bold rounded-md border border-border px-2 py-0.5 hover:border-destructive/50 hover:text-destructive transition-colors"
                        >
                          {t.settings.availClearDay}
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {SLOT_TIMES.map((s) => {
                        const on = dayArr.includes(s);
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => toggleSlot(day, s)}
                            aria-pressed={on}
                            className={`rounded-lg border py-1 px-2 text-[11px] font-bold font-mono transition-all ${
                              on
                                ? "border-primary bg-primary text-white shadow-sm"
                                : "border-border text-muted-foreground hover:border-primary/40"
                            }`}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <Button
              className="w-full gradient-primary text-white font-black rounded-xl h-11"
              disabled={availBusy || !availDirty()}
              onClick={saveAvail}
            >
              <Save className="h-4 w-4" />
              {availBusy ? t.common.loading : t.settings.availSave}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ─── v2.9.0: روابط التواصل الاجتماعي + تفضيل الجنس (أخصائي فقط) ─── */}
      {isCounselor && (
        <Card className="border-border/70">
          <CardContent className="p-6 space-y-5">
            <h2 className="font-black flex items-center gap-2 pb-2">
              <Share2 className="h-4.5 w-4.5 text-primary" />
              {t.settings.socialTitle}
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed -mt-2">{t.settings.socialHint}</p>
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="font-bold text-xs flex items-center gap-1.5">
                  <FacebookGlyph className="h-3.5 w-3.5 text-[#1877F2]" /> Facebook
                </Label>
                <Input dir="ltr" value={socials.facebook} onChange={(e) => setSocials({ ...socials, facebook: e.target.value })} placeholder="facebook.com/username" className="rounded-xl bg-card text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-xs flex items-center gap-1.5">
                  <InstagramGlyph className="h-3.5 w-3.5 text-[#E4405F]" /> Instagram
                </Label>
                <Input dir="ltr" value={socials.instagram} onChange={(e) => setSocials({ ...socials, instagram: e.target.value })} placeholder="@username" className="rounded-xl bg-card text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-xs flex items-center gap-1.5">
                  <TikTokGlyph className="h-3.5 w-3.5 text-foreground" /> TikTok
                </Label>
                <Input dir="ltr" value={socials.tiktok} onChange={(e) => setSocials({ ...socials, tiktok: e.target.value })} placeholder="@username" className="rounded-xl bg-card text-sm" />
              </div>
            </div>

            <div className="space-y-2 pt-1 border-t border-border/60">
              {/* v1.3.0: سعر الجلسة لكل عملة على حدة — الأخصائي يحدد سعر
                  الدينار/اليورو/الدولار بنفسه، والعميل يرى سعر عملته فقط */}
              <h3 className="font-bold text-xs pt-3">{t.settings.priceTitle}</h3>
              <p className="text-[11px] text-muted-foreground font-semibold">{t.settings.priceHint}</p>
              <div className="grid sm:grid-cols-3 gap-3">
                {CURRENCY_CODES.map((c) => (
                  <div key={c} className="space-y-1.5">
                    <Label className="font-bold text-xs flex items-center gap-1.5">
                      <Coins className="h-3.5 w-3.5 text-primary" />
                      {t.settings.currencyNames[c]}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={CURRENCIES[c].min}
                        max={CURRENCIES[c].max}
                        step={c === "DZD" ? "50" : "1"}
                        dir="ltr"
                        value={sessionPrices[c]}
                        onChange={(e) => {
                          setSessionPrices({ ...sessionPrices, [c]: e.target.value });
                          setPrefsErr("");
                          setPrefsMsg("");
                        }}
                        className="rounded-xl bg-card text-sm"
                      />
                      <span className="font-black text-primary text-sm shrink-0" dir="ltr">{c}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2 pt-1 border-t border-border/60">
              <h3 className="font-bold text-xs pt-3">{t.counselor.genderPrefTitle}</h3>
              <p className="text-[11px] text-muted-foreground font-semibold">{t.counselor.genderPrefHint}</p>
              <div className="flex flex-wrap gap-2">
                {([
                  { v: "male", label: t.client.genderMale },
                  { v: "female", label: t.client.genderFemale },
                ]).map((g) => {
                  const on = acceptedGenders.includes(g.v);
                  return (
                    <button
                      key={g.v}
                      type="button"
                      onClick={() =>
                        setAcceptedGenders((cur) => {
                          const next = on ? cur.filter((x) => x !== g.v) : [...cur, g.v];
                          return next.length ? next : cur; /* لا تُفرغ القائمة تماماً */
                        })
                      }
                      aria-pressed={on}
                      className={`rounded-xl border-2 px-5 py-2.5 text-sm font-bold transition-all ${
                        on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {g.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] font-bold text-muted-foreground">{t.admin.genderAllLabel}: {acceptedGenders.length === 2 ? "✓" : "—"}</p>
            </div>

            {/* v1.18.0: الانتماء للعيادة — قابل للتعديل من الإعدادات */}
            <div className="space-y-2 pt-1 border-t border-border/60">
              <h3 className="font-bold text-xs pt-3 flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-primary" />
                {t.counselor.clinicAffil}
              </h3>
              <p className="text-[11px] text-muted-foreground font-semibold">{t.counselor.clinicAffilHint}</p>
              <Select value={myClinicId} onValueChange={setMyClinicId}>
                <SelectTrigger className="rounded-xl bg-card font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="none">{t.counselor.clinicAffilNone}</SelectItem>
                  {clinicsList.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ═ v1.3.0: زر حفظ صريح لهذه البطاقة — بنتيجة نجاح/فشل واضحة ═
                (كانت الحقول تُحفَظ حصراً بزر بطاقة «الحساب» أعلى الصفحة) */}
            {prefsErr && <div className="rounded-xl bg-destructive/10 text-destructive text-xs font-bold px-3 py-2">{prefsErr}</div>}
            {prefsMsg && <div className="rounded-xl bg-primary/10 text-primary text-xs font-bold px-3 py-2 flex items-center gap-1.5"><Check className="h-4 w-4 shrink-0" />{prefsMsg}</div>}
            <Button size="sm" className="gradient-primary text-white font-bold rounded-lg w-full sm:w-auto" disabled={prefsBusy} onClick={savePrefs}>
              <Save className="h-4 w-4" />
              {prefsBusy ? t.common.loading : t.common.save}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ═══ v1.12.0: عقد المنصة العلاجي (أخصائي فقط) — عقد واحد لكل المستخدمين
          يمثل المنصة، نصه معتمد من الإدارة ومحمي من أي تعديل (قراءةً فقط)،
          والأخصائي يمضيه رقمياً هنا — لحظة حجز أي عميل جلسة معه يُنشأ له
          عقد مستقل برقم تسلسلي فوري بلقطة النص وإمضائه، وتُحفظ النسخة
          الموقّعة من الطرفين هنا في حسابه ═══ */}
      {isCounselor && (
        <Card className="border-primary/30 bg-primary/[0.03]">
          <CardContent className="p-6 space-y-5">
            <h2 className="font-black flex items-center gap-2 pb-2">
              <FileSignature className="h-4.5 w-4.5 text-primary" />
              {t.contract.settingsTitle}
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed -mt-2">{t.contract.settingsDesc}</p>

            {/* حالة الإمضاء + وسم الحماية */}
            <div className="flex flex-wrap items-center gap-2">
              {contractSignedAt ? (
                <Badge className="text-[11px] bg-primary/15 text-primary border-0 gap-1">
                  <Check className="h-3 w-3" />
                  {t.contract.signedBadge} · {formatDateTime(new Date(contractSignedAt))}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[11px] font-bold text-amber-600 dark:text-amber-400 border-amber-500/40">
                  {t.contract.notSignedBadge}
                </Badge>
              )}
              <Badge variant="outline" className="text-[11px] font-bold gap-1 border-primary/40 text-primary">
                <Lock className="h-3 w-3" />
                {t.contract.lockedBadge}
              </Badge>
            </div>

            {/* v1.12.0: نص عقد المنصة — قراءةً فقط، الإدارة وحدها تعدّله */}
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="font-bold text-xs">{t.contract.templateLabel}</Label>
                {contractPlatformAt && (
                  <span className="text-[10px] font-bold text-muted-foreground">
                    {t.contract.platformUpdatedAt}: {formatDateTime(new Date(contractPlatformAt))}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground font-semibold">{t.contract.templateHint}</p>
              <div
                dir="auto"
                className="rounded-xl border border-border bg-card text-sm leading-relaxed max-h-72 overflow-y-auto p-4 whitespace-pre-wrap select-text"
              >
                {contractText || t.contract.loadingText}
              </div>
            </div>

            {/* الإمضاء الرقمي على عقد المنصة — لا تعديل ولا عقد خاص */}
            <div className="space-y-1.5">
              <Label className="font-bold text-xs flex items-center gap-1.5">
                <PenLine className="h-3.5 w-3.5 text-primary" />
                {t.contract.signLabel}
              </Label>
              <p className="text-[11px] text-muted-foreground font-semibold">{t.contract.signHintLocked}</p>
              <SignaturePad
                onChange={setContractSignature}
                height={280} /* v1.10.0: مساحة امضاء أطول وأوسع — راحة كاملة في الرسم */
              />
              {contractSignature && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-muted-foreground">{t.contract.signaturePreview}</p>
                  <img src={contractSignature} alt={t.contract.signaturePreview} className="h-16 w-auto rounded-lg border border-border bg-white/60 dark:bg-white/10 p-1" />
                </div>
              )}
            </div>

            {contractErr && <div className="rounded-xl bg-destructive/10 text-destructive text-xs font-bold px-3 py-2">{contractErr}</div>}
            {contractMsg && <div className="rounded-xl bg-primary/10 text-primary text-xs font-bold px-3 py-2 flex items-center gap-1.5"><Check className="h-4 w-4 shrink-0" />{contractMsg}</div>}
            <Button size="sm" className="gradient-primary text-white font-bold rounded-lg w-full sm:w-auto" disabled={contractBusy} onClick={saveContract}>
              <Save className="h-4 w-4" />
              {contractBusy ? t.common.loading : t.contract.saveBtn}
            </Button>

            {/* قائمة العقود الموقّعة من الطرفين — محفوظة في حساب الأخصائي */}
            <div className="space-y-2 pt-3 border-t border-border/60">
              <h3 className="font-bold text-xs">{t.contract.listTitle}</h3>
              <p className="text-[11px] text-muted-foreground font-semibold">{t.contract.listHint}</p>
              {cContracts.length === 0 ? (
                <p className="text-xs text-muted-foreground font-semibold rounded-xl border border-dashed border-border px-4 py-5 text-center">
                  {t.contract.listEmpty}
                </p>
              ) : (
                <div className="space-y-2">
                  {cContracts.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3">
                      <div className="space-y-0.5 min-w-0">
                        <div className="font-bold text-sm truncate flex items-center gap-2" dir="auto">
                          {c.clientName || "—"}
                          {c.number && (
                            <span className="text-[10px] font-mono font-black text-muted-foreground bg-muted rounded px-1.5 py-0.5" dir="ltr">{c.number}</span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-semibold flex flex-wrap gap-x-3">
                          {c.scheduledAt && <span dir="auto">{formatDateTime(new Date(c.scheduledAt))}</span>}
                          {c.clientSignedAt && (
                            <span className="text-primary" dir="auto">
                              ✓ {t.contract.clientSignedOn} {formatDateTime(new Date(c.clientSignedAt))}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ms-auto">
                        <Badge className={`text-[10px] font-black border-0 ${c.status === "SIGNED" ? "bg-primary/15 text-primary" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"}`}>
                          {c.status === "SIGNED" ? t.contract.statusSigned : t.contract.statusAwaiting}
                        </Badge>
                        <Button size="sm" variant="outline" className="h-8 rounded-lg font-bold" disabled={viewBusy} onClick={() => void openContract(c.id)}>
                          <EyeOff className="h-3.5 w-3.5 rotate-180" />
                          {t.contract.viewBtn}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═ v1.10.0: نافذة عرض العقد كاملاً — مستند رسمي WYSIWYG + طباعة صفحة واحدة ═ */}
      <Dialog open={!!viewContract} onOpenChange={(o) => !o && setViewContract(null)}>
        <DialogContent className="sm:max-w-lg max-h-[92vh] p-0 gap-0 overflow-hidden">
          <DialogHeader className="gradient-primary text-white px-5 py-4">
            <DialogTitle className="text-white flex items-center gap-2 text-base">
              <FileSignature className="h-4.5 w-4.5" />
              {t.contract.viewTitle}
            </DialogTitle>
          </DialogHeader>
          {viewContract && (
            <div className="p-4 space-y-3 overflow-y-auto max-h-[calc(92vh-4.5rem)]">
              {/* المستند الرسمي — نفس شكل الطباعة تماماً */}
              <div className="rounded-xl border border-border overflow-hidden bg-white">
                <div className="max-h-[52vh] overflow-y-auto">
                  <div style={{ padding: "6mm 5mm 0" }}>
                    <ContractDocument
                      data={{
                        number: viewContract.number,
                        text: viewContract.text,
                        counselorName: viewContract.counselorName,
                        /* v1.13.0: الطرف الثاني في المستند هو الاسم الكامل القانوني
                           الذي كتبه العميل عند الإمضاء — والاسم المستعار احتياط فقط
                           للعقود غير الممضاة بعد */
                        clientName: viewContract.clientSignedName || viewContract.clientName,
                        clientSignedName: viewContract.clientSignedName,
                        counselorSignature: viewContract.counselorSignature,
                        clientSignature: viewContract.clientSignature,
                        counselorSignedAt: viewContract.counselorSignedAt,
                        clientSignedAt: viewContract.clientSignedAt,
                        scheduledAt: viewContract.scheduledAt,
                        createdAt: viewContract.counselorSignedAt || viewContract.updatedAt,
                        status: viewContract.status,
                      } as ContractDocData}
                      lang={viewContract.lang || lang}
                    />
                  </div>
                </div>
              </div>
              {/* اختيار لغة المستند قبل الطباعة + زر طباعة/حفظ PDF صفحة واحدة */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <ContractPrintButton
                  data={{
                    number: viewContract.number,
                    text: viewContract.text,
                    counselorName: viewContract.counselorName,
                    /* v1.13.0: نفس الأولوية — الاسم القانوني للطباعة */
                    clientName: viewContract.clientSignedName || viewContract.clientName,
                    clientSignedName: viewContract.clientSignedName,
                    counselorSignature: viewContract.counselorSignature,
                    clientSignature: viewContract.clientSignature,
                    counselorSignedAt: viewContract.counselorSignedAt,
                    clientSignedAt: viewContract.clientSignedAt,
                    scheduledAt: viewContract.scheduledAt,
                    createdAt: viewContract.counselorSignedAt || viewContract.updatedAt,
                    status: viewContract.status,
                  } as ContractDocData}
                  defaultLang={viewContract.lang || lang}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-lg font-bold text-muted-foreground"
                  onClick={() => setViewContract(null)}
                >
                  {t.common.close}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── كلمة المرور (عميل + أخصائي) ─── */}
      {user && (isVictim || isCounselor) && (
        <Card className="border-border/70">
          <CardContent className="p-6 space-y-5">
            <h2 className="font-black flex items-center gap-2 pb-2">
              <KeyRound className="h-4.5 w-4.5 text-primary" />
              {t.settings.changePwSection}
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-bold text-xs">{t.settings.currentPw}</Label>
                <Input type="password" dir="ltr" value={pwOld} onChange={(e) => setPwOld(e.target.value)} className="rounded-xl bg-card" />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-xs">{t.client.newPasswordLabel}</Label>
                <Input type="password" dir="ltr" value={pwNew} onChange={(e) => setPwNew(e.target.value)} className="rounded-xl bg-card" />
              </div>
            </div>
            {pwErr && <div className="rounded-xl bg-destructive/10 text-destructive text-xs font-bold px-3 py-2">{pwErr}</div>}
            {pwOk && <div className="rounded-xl bg-primary/10 text-primary text-xs font-bold px-3 py-2">{pwOk}</div>}
            <Button size="sm" className="gradient-primary text-white font-bold rounded-lg" disabled={pwBusy} onClick={changePw}>
              <KeyRound className="h-4 w-4" />
              {pwBusy ? t.common.loading : t.counselor.changePwBtn}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ─── الإخفاء السريع (v2.5.3) — للجميع حتى بدون حساب ─── */}
      <Card className="border-border/70">
        <CardContent className="p-6 space-y-5">
          <h2 className="font-black flex items-center gap-2 pb-2">
            <EyeOff className="h-4.5 w-4.5 text-primary" />
            {t.settings.qhTitle}
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">{t.settings.qhDesc}</p>

          {qhEnabled ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-primary/10 text-primary text-xs font-bold px-3 py-2.5 flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0" />
                {t.settings.qhActive}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{t.settings.qhHow}</p>
              <p className="text-[11px] text-muted-foreground/80 font-semibold">{t.settings.qhLocal}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="rounded-lg font-bold" onClick={() => triggerQuickHideIfEnabled()}>
                  <EyeOff className="h-4 w-4" />
                  {t.settings.qhTest}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg font-bold text-destructive border-destructive/40"
                  disabled={qhBusy}
                  onClick={() => void disableQuickHide()}
                >
                  {t.settings.qhDisable}
                </Button>
              </div>
              {/* لتأكيد الرمز عند التعطيل */}
              <Input
                type="password"
                inputMode="numeric"
                dir="ltr"
                value={qhPin1}
                onChange={(e) => setQhPin1(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder={t.settings.qhPinConfirmDisable}
                className="rounded-xl bg-card font-mono max-w-48"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="font-bold text-xs">{t.settings.qhPin}</Label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    dir="ltr"
                    value={qhPin1}
                    onChange={(e) => setQhPin1(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    placeholder="••••"
                    className="rounded-xl bg-card font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-bold text-xs">{t.settings.qhPinConfirm}</Label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    dir="ltr"
                    value={qhPin2}
                    onChange={(e) => setQhPin2(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    placeholder="••••"
                    className="rounded-xl bg-card font-mono"
                  />
                </div>
              </div>
              {qhErr && <div className="rounded-xl bg-destructive/10 text-destructive text-xs font-bold px-3 py-2">{qhErr}</div>}
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" className="gradient-primary text-white font-bold rounded-lg" disabled={qhBusy} onClick={() => void enableQuickHide()}>
                  <KeyRound className="h-4 w-4" />
                  {t.settings.qhEnable}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground/80 font-semibold">{t.settings.qhLocal}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── ملاحظة الإدارة ─── */}
      {user?.role === "ADMIN" && (
        <Card className="border-border/70">
          <CardContent className="p-6 flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <p className="text-xs font-semibold text-muted-foreground leading-relaxed">{t.settings.adminPassNote}</p>
          </CardContent>
        </Card>
      )}

      {/* Language & display */}
      <Card className="border-border/70">
        <CardContent className="p-6 space-y-5">
          <h2 className="font-black flex items-center gap-2 pb-2">
            <Globe className="h-4.5 w-4.5 text-primary" />
            {t.settings.sectionLanguage}
          </h2>
          <div className="space-y-2">
            <span className="text-sm font-bold text-muted-foreground">{t.settings.languageLabel}</span>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(LANG_META) as AppLang[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`rounded-xl border-2 px-4 py-2.5 text-sm font-bold transition-all flex items-center gap-2 ${
                    lang === l ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"
                  }`}
                >
                  <span>{LANG_META[l].flag}</span>
                  {LANG_META[l].label}
                  {lang === l && <Check className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <span className="text-sm font-bold text-muted-foreground">{t.settings.themeLabel}</span>
            <div className="grid grid-cols-3 gap-2">
              {themes.map((th) => (
                <button
                  key={th.key}
                  onClick={() => setTheme(th.key)}
                  className={`rounded-xl border-2 p-3 flex flex-col items-center gap-1.5 text-xs font-bold transition-all ${
                    theme === th.key ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"
                  }`}
                >
                  <th.icon className="h-5 w-5" />
                  {th.label}
                </button>
              ))}
            </div>
          </div>
          {/* حجم الخط — إمكانية الوصول لكل الفئات (يُحفظ مع بقية التفضيلات) */}
          <div className="space-y-2">
            <span className="text-sm font-bold text-muted-foreground flex items-center gap-1.5">
              <ALargeSmall className="h-4 w-4 text-primary" />
              {t.settings.fontLabel}
            </span>
            <div className="grid grid-cols-4 gap-2">
              {[
                { v: 87.5, label: t.settings.fontSmall, size: "text-sm" },
                { v: 100, label: t.settings.fontNormal, size: "text-base" },
                { v: 112.5, label: t.settings.fontLarge, size: "text-lg" },
                { v: 125, label: t.settings.fontXL, size: "text-xl" },
              ].map((f) => (
                <button
                  key={f.v}
                  onClick={() => setFontScale(f.v)}
                  className={`rounded-xl border-2 p-3 flex flex-col items-center gap-1 font-bold transition-all ${
                    fontScale === f.v ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"
                  }`}
                >
                  <span className={f.size}>أ</span>
                  <span className="text-[10px] font-semibold">{f.label}</span>
                  {fontScale === f.v && <Check className="h-3 w-3" />}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground font-semibold">{t.settings.fontHint}</p>
          </div>
        </CardContent>
      </Card>

      {/* ─── الأصوات ─── */}
      <Card className="border-border/70">
        <CardContent className="p-6 space-y-5">
          <h2 className="font-black flex items-center gap-2 pb-2">
            <Volume2 className="h-4.5 w-4.5 text-primary" />
            {t.settings.sectionSound}
          </h2>
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-sm font-bold">{t.settings.soundLabel}</span>
              <p className="text-xs text-muted-foreground">{t.settings.soundHint}</p>
            </div>
            <Switch
              checked={soundOn}
              onCheckedChange={(v) => {
                setSoundOn(v);
                setSoundOnState(v);
              }}
              aria-label={t.settings.soundLabel}
            />
          </div>
        </CardContent>
      </Card>

      {/* v1.15.0: الإعلانات المدفوعة — حق العميل في رفضها من إعداداته */}
      {isVictim && (
        <Card className="border-border/70">
          <CardContent className="p-6 space-y-5">
            <h2 className="font-black flex items-center gap-2 pb-2">
              <Megaphone className="h-4.5 w-4.5 text-primary" />
              {t.settings.adsSection}
            </h2>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-sm font-bold">{t.settings.adsOptOut}</span>
                <p className="text-xs text-muted-foreground leading-relaxed">{t.settings.adsOptOutHint}</p>
              </div>
              <Switch
                checked={adsOptOut}
                onCheckedChange={(v) => void saveAdsOptOut(v)}
                aria-label={t.settings.adsOptOut}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notifications */}
      <Card className="border-border/70">
        <CardContent className="p-6 space-y-5">
          <h2 className="font-black flex items-center gap-2 pb-2">
            {pushOn ? <BellRing className="h-4.5 w-4.5 text-primary" /> : <BellOff className="h-4.5 w-4.5 text-muted-foreground" />}
            {t.settings.sectionNotifications}
          </h2>
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-sm font-bold">{t.settings.pushEnable}</span>
              <p className="text-xs text-muted-foreground">{t.settings.pushHint}</p>
            </div>
            <Switch checked={pushOn} onCheckedChange={togglePush} aria-label={t.settings.pushEnable} />
          </div>
          {/* v1.8.0: دليل iOS — على الآيفون تُسلّم الإشعارات الخلفية من التطبيق
              المثبّت فقط (iOS 16.4+)، لذا نعرض الخطوات هنا مباشرة */}
          {((iosDevice && !standalone) || showIosGuide) && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 space-y-2">
              <p className="text-xs font-black flex items-center gap-1.5">
                <Download className="h-3.5 w-3.5 text-primary" />
                {t.settings.pushIosGuideTitle}
              </p>
              {[t.settings.pushIosStep1, t.settings.pushIosStep2].map((line, i) => (
                <p key={i} className="text-[11px] font-semibold text-muted-foreground leading-relaxed flex gap-2">
                  <span className="font-black text-primary font-mono shrink-0">{i + 1}.</span>
                  {line}
                </p>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {pushOn && (
              <Button variant="outline" className="rounded-xl font-bold" onClick={test}>
                <BellRing className="h-4 w-4" />
                {t.settings.pushTest}
              </Button>
            )}
            {/* الفحص التشخيصي مرئي دائماً — أهم فائدة له حين يفشل التفعيل نفسه */}
            <Button variant="outline" className="rounded-xl font-bold" disabled={diagBusy} onClick={runDiag}>
              <Stethoscope className="h-4 w-4" />
              {diagBusy ? t.common.loading : t.settings.pushDiagnose}
            </Button>
          </div>
          {diag && (
            <div className="rounded-xl bg-muted/50 border border-border p-3 space-y-1.5">
              <p className={`text-xs font-black ${diag.every((s) => s.ok) ? "text-primary" : "text-destructive"}`}>
                {diag.every((s) => s.ok) ? t.settings.pushDiagOk : t.settings.pushDiagFail}
              </p>
              {diag.map((s) => (
                <div key={s.step} className="flex items-center gap-2 text-[11px] font-semibold">
                  <span className={s.ok ? "text-primary" : "text-destructive"}>{s.ok ? "✅" : "❌"}</span>
                  <span className="text-foreground/80">{diagLabel(s.step)}</span>
                  {s.detail && <span className="text-muted-foreground font-mono" dir="ltr">({s.detail})</span>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Install */}
      <Card className="border-border/70">
        <CardContent className="p-6 space-y-5">
          <h2 className="font-black flex items-center gap-2 pb-2">
            <Download className="h-4.5 w-4.5 text-primary" />
            {t.settings.sectionInstall}
          </h2>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <span className="text-sm font-bold">{t.settings.installTitle}</span>
              <p className="text-xs text-muted-foreground">{t.settings.installDesc}</p>
            </div>
            {standalone ? (
              <Badge variant="secondary" className="shrink-0 text-[11px] font-semibold">
                {t.settings.installDone}
              </Badge>
            ) : installable ? (
              <Button className="gradient-primary text-white font-bold rounded-xl shrink-0" onClick={install}>
                <Download className="h-4 w-4" />
                {t.settings.installBtn}
              </Button>
            ) : null}
          </div>

          {/* v2.8.0: التطبيق غير مثبّت ولا يمكن إظهار نافذة التثبيت الآن —
              نعرض طريقة التثبيت اليدوية بدل عبارة «التطبيق مثبّت» الخاطئة */}
          {!standalone && (
            <div className="rounded-xl bg-muted/50 border border-border px-4 py-3 space-y-2">
              <p className="text-xs font-black flex items-center gap-1.5">
                <Download className="h-3.5 w-3.5 text-primary" />
                {t.settings.installHowTitle}
              </p>
              {[t.settings.installStep1, t.settings.installStep2, t.settings.installStep3, t.settings.installStep4].map((line, i) => (
                <p key={i} className="text-[11px] font-semibold text-muted-foreground leading-relaxed flex gap-2">
                  <span className="font-black text-primary font-mono shrink-0">{i + 1}.</span>
                  {line}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data */}
      <Card className="border-border/70">
        <CardContent className="p-6 space-y-5">
          <h2 className="font-black flex items-center gap-2 pb-2">
            <Trash2 className="h-4.5 w-4.5 text-primary" />
            {t.settings.sectionData}
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">{t.settings.aboutData}</p>
          <Button
            variant="outline"
            className="rounded-xl font-bold text-destructive border-destructive/40"
            onClick={() => {
              localStorage.removeItem("tumaanina-state");
              reset();
              toast({ title: t.settings.clearLocalDone });
            }}
          >
            {t.settings.clearLocal}
          </Button>
        </CardContent>
      </Card>

      {/* ─── v2.7.0: نافذة تفاصيل التحدي — للأخصائيين فقط، بلا كشف السر ─── */}
      <Dialog open={challengeInfoOpen} onOpenChange={(v) => !v && setChallengeInfoOpen(false)}>
        <DialogContent className="sm:max-w-sm overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-amber-400/20 to-transparent pointer-events-none" />
          <DialogHeader>
            <DialogTitle className="text-start flex items-center gap-2">
              <RoyalCrown size={30} />
              {t.challenge.infoTitle}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[11px] font-black px-3 py-2 text-center">
              {t.challenge.infoValidUntil}
            </div>
            <div className="space-y-2.5">
              {[
                t.challenge.infoLine1,
                t.challenge.infoLine2,
                t.challenge.infoLine3,
              ].map((line, i) => (
                <div key={i} className="flex items-start gap-2.5 rounded-xl border border-border/70 bg-muted/30 px-3.5 py-2.5">
                  <span className="text-[11px] font-black text-primary font-mono shrink-0 mt-0.5">{i + 1}</span>
                  <p className="text-xs font-semibold leading-relaxed flex-1">{line}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground font-bold text-center">{t.challenge.infoHint}</p>
          </div>
          <div className="space-y-2 pt-1">
            <Button
              className="w-full gradient-primary text-white font-black rounded-xl h-11"
              onClick={() => setChallengeInfoOpen(false)}
            >
              {t.common.close}
            </Button>
            <button
              className="w-full text-center text-xs font-bold text-muted-foreground hover:text-primary transition-colors"
              onClick={() => {
                markChallengeInfoOff();
                setChallengeInfoOpen(false);
              }}
            >
              {t.challenge.infoDontShow}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
