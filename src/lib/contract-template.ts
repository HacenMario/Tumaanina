/**
 * v1.10.0 — حزمة العقد العلاجي الاحترافي سداسي اللغات.
 * ─────────────────────────────────────────────────────────────────
 * ① نصوص هيكل المستند الرسمي (العنوان، رقم العقد، الأطراف، الإقرار، التذييل)
 *    بالست لغات — تُستعمل عند العرض والطباعة/الحفظ PDF حسب اللغة المختارة
 *    قبل الطباعة (طلب المستخدم: اختيار لغة العقد قبل ظهوره للطباعة).
 * ② v1.11.0: نُزع «النموذج المقترح» نهائياً — لا عقد بلا نص الأخصائي نفسه.
 * ملاحظة القانونية: نص العقد المعتمد هو لقطة الأخصائي نفسه (حماية الطرفين)،
 * وهيكل المستند يُترجم حسب اللغة المختارة عند الطباعة.
 */

export const CONTRACT_LANGS = ["ar", "fr", "en", "tr", "ru", "zh"] as const;
export type ContractLang = (typeof CONTRACT_LANGS)[number];

export const CONTRACT_LANG_LABELS: Record<ContractLang, string> = {
  ar: "العربية",
  fr: "Français",
  en: "English",
  tr: "Türkçe",
  ru: "Русский",
  zh: "中文",
};

export interface ContractDocTexts {
  /** عنوان الوثيقة */
  title: string;
  /** رقم العقد */
  docNo: string;
  /** تاريخ الإبرام */
  issuedOn: string;
  /** سطر التمهيد قبل الأطراف — {date} يُستبدل بالتاريخ */
  intro: string;
  /** الطرف الأول (المختص/المعالج) */
  party1: string;
  /** الطرف الثاني (العميل) */
  party2: string;
  /** عنوان البنود */
  clausesTitle: string;
  /** عنوان الإقرار والتوقيع */
  declarationTitle: string;
  /** نص الإقرار فوق التوقيعات */
  declaration: string;
  /** توقيع الأخصائي (الطرف الأول) */
  signCounselor: string;
  /** توقيع العميل (الطرف الثاني) */
  signClient: string;
  /** كلمة التاريخ تحت كل توقيع */
  dateLabel: string;
  /** اسم المنصة في الترويسة */
  platform: string;
  /** تذييل الوثيقة */
  footer: string;
  /** حالة: بانتظار إمضاء العميل */
  awaiting: string;
  /** حالة: موقّع من الطرفين */
  signedByBoth: string;
}

export const CONTRACT_DOC_TEXTS: Record<ContractLang, ContractDocTexts> = {
  ar: {
    title: "وثيقة عقد استشارة نفسية (اتفاقية العقد العلاجي)",
    docNo: "رقم العقد",
    issuedOn: "تاريخ الإبرام",
    intro: "تم إبرام هذا العقد إلكترونياً عبر منصة طمأنينة بتاريخ {date} بين كل من:",
    party1: "الطرف الأول (المختص/المعالج)",
    party2: "الطرف الثاني (العميل)",
    clausesTitle: "بنود العقد",
    declarationTitle: "إقرار وتوقيع الأطراف",
    declaration:
      "يُقرّ كل طرف بأنه قرأ كافة بنود هذا العقد، وفهم شروطه وسياسة السرية والإلغاء، ووافق عليها طواعية؛ ويُعتبر التوقيع الإلكتروني المسجّل على منصة طمأنينة حجة نافذة بين الطرفين بتاريخ تسجيله.",
    signCounselor: "توقيع الأخصائي (الطرف الأول)",
    signClient: "توقيع العميل (الطرف الثاني)",
    dateLabel: "التاريخ",
    platform: "منصة طمأنينة",
    footer:
      "وثيقة صادرة إلكترونياً من منصة طمأنينة — تحمل رقم العقد أعلاه وتوقيعي الطرفين المسجّلين في المنصة، ولا تعتبر صحيحة إن غيّر نصّها أو رقمها.",
    awaiting: "بانتظار الإمضاء",
    signedByBoth: "موقّع من الطرفين",
  },
  fr: {
    title: "Contrat de consultation psychologique (accord thérapeutique)",
    docNo: "N° du contrat",
    issuedOn: "Date de conclusion",
    intro: "Le présent contrat est conclu électroniquement via la plateforme Tumaanina en date du {date} entre :",
    party1: "Partie I (le spécialiste / thérapeute)",
    party2: "Partie II (le client)",
    clausesTitle: "Clauses du contrat",
    declarationTitle: "Déclaration et signatures des parties",
    declaration:
      "Chaque partie déclare avoir lu l'ensemble des clauses du présent contrat, en avoir compris les conditions, la politique de confidentialité et d'annulation, et y adhérer volontairement ; la signature électronique enregistrée sur la plateforme Tumaanina fait foi entre les parties à la date de son enregistrement.",
    signCounselor: "Signature du spécialiste (Partie I)",
    signClient: "Signature du client (Partie II)",
    dateLabel: "Date",
    platform: "Plateforme Tumaanina",
    footer:
      "Document généré électroniquement par la plateforme Tumaanina — porte le numéro de contrat ci-dessus et les signatures enregistrées des deux parties ; toute altération du texte ou du numéro le rend invalide.",
    awaiting: "En attente de signature",
    signedByBoth: "Signé par les deux parties",
  },
  en: {
    title: "Psychological Consultation Contract (Therapeutic Agreement)",
    docNo: "Contract No.",
    issuedOn: "Date of conclusion",
    intro: "This contract is concluded electronically via the Tumaanina platform on {date} between:",
    party1: "Party I (the specialist / therapist)",
    party2: "Party II (the client)",
    clausesTitle: "Contract clauses",
    declarationTitle: "Declaration and signatures of the parties",
    declaration:
      "Each party declares having read all the clauses of this contract, understood its terms, confidentiality and cancellation policy, and voluntarily agrees to them; the electronic signature recorded on the Tumaanina platform shall be binding evidence between the parties as of its recording date.",
    signCounselor: "Specialist's signature (Party I)",
    signClient: "Client's signature (Party II)",
    dateLabel: "Date",
    platform: "Tumaanina Platform",
    footer:
      "Electronically issued document from the Tumaanina platform — bears the contract number above and the recorded signatures of both parties; any alteration of its text or number renders it invalid.",
    awaiting: "Awaiting signature",
    signedByBoth: "Signed by both parties",
  },
  tr: {
    title: "Psikolojik Danışma Sözleşmesi (Terapötik Anlaşma)",
    docNo: "Sözleşme No.",
    issuedOn: "Düzenlenme tarihi",
    intro: "İşbu sözleşme, Tumaanina platformu üzerinden elektronik olarak {date} tarihinde aşağıdaki taraflar arasında akdedilmiştir:",
    party1: "Birinci Taraf (Uzman / Terapist)",
    party2: "İkinci Taraf (Danışan)",
    clausesTitle: "Sözleşme maddeleri",
    declarationTitle: "Tarafların beyanı ve imzaları",
    declaration:
      "Her taraf, işbu sözleşmenin tüm maddelerini okuduğunu, koşullarını, gizlilik ve iptal politikasını anladığını ve bunlara özgürce onay verdiğini beyan eder; Tumaanina platformuna kaydedilen elektronik imza, kayıt tarihi itibarıyla taraflar arasında kesin delil sayılır.",
    signCounselor: "Uzmanın imzası (Birinci Taraf)",
    signClient: "Danışanın imzası (İkinci Taraf)",
    dateLabel: "Tarih",
    platform: "Tumaanina Platformu",
    footer:
      "Tumaanina platformu tarafından elektronik olarak oluşturulan belge — yukarıdaki sözleşme numarasını ve tarafların kayıtlı imzalarını taşır; metninin veya numarasının değiştirilmesi geçersiz kılar.",
    awaiting: "İmza bekleniyor",
    signedByBoth: "Her iki tarafça imzalandı",
  },
  ru: {
    title: "Договор о психологической консультации (терапевтическое соглашение)",
    docNo: "№ договора",
    issuedOn: "Дата заключения",
    intro: "Настоящий договор заключён в электронной форме через платформу Tumaanina {date} между:",
    party1: "Сторона I (специалист / терапевт)",
    party2: "Сторона II (клиент)",
    clausesTitle: "Положения договора",
    declarationTitle: "Заявление и подписи сторон",
    declaration:
      "Каждая сторона заявляет, что прочитала все положения настоящего договора, поняла его условия, политику конфиденциальности и отмены, и добровольно с ними соглашается; электронная подпись, зарегистрированная на платформе Tumaanina, является доказательством между сторонами с даты её регистрации.",
    signCounselor: "Подпись специалиста (Сторона I)",
    signClient: "Подпись клиента (Сторона II)",
    dateLabel: "Дата",
    platform: "Платформа Tumaanina",
    footer:
      "Документ, выпущенный в электронной форме платформой Tumaanina — содержит указанный выше номер договора и зарегистрированные подписи обеих сторон; любое изменение текста или номера делает его недействительным.",
    awaiting: "Ожидает подписи",
    signedByBoth: "Подписано обеими сторонами",
  },
  zh: {
    title: "心理咨询协议（治疗合同）",
    docNo: "合同编号",
    issuedOn: "签订日期",
    intro: "本合同于{date}通过 Tumaanina（طمأنينة）平台以电子方式签订，双方为：",
    party1: "第一方（专业人员/治疗师）",
    party2: "第二方（来访者）",
    clausesTitle: "合同条款",
    declarationTitle: "双方声明与签署",
    declaration:
      "各方声明已阅读本合同全部条款，理解其条件、保密与取消政策，并自愿同意；在 Tumaanina 平台记录的电子签名自记录之日起对双方具有约束力。",
    signCounselor: "专业人员签名（第一方）",
    signClient: "来访者签名（第二方）",
    dateLabel: "日期",
    platform: "Tumaanina 平台",
    footer:
      "本文件由 Tumaanina 平台电子生成 — 载有上述合同编号及双方登记的签名；任何对文本或编号的更改均使其无效。",
    awaiting: "等待签署",
    signedByBoth: "双方已签署",
  },
};

/* v1.12.0: العقد عقدٌ واحد للمنصة كاملة — نصه تديره الإدارة حصراً من لوحة
   الأدمين (DEFAULT_PLATFORM_CONTRACT زرعٌ أولي احتياطي)، والأخصائي يمضي
   العقد المعتمد فقط دون أي تعديل، والمنصة توفّر هيكل الوثيقة الرسمي
   (الترويسة والأرقام والإقرار والتذييل أعلاه) الذي يُترجم حسب لغة العرض. */

/* ═ v1.12.0: نص عقد المنصة الافتراضي — يُزرع تلقائياً عند أول تشغيل ═
   عقد علاجي واحد لكل المستخدمين يمثل المنصة، تدير نصه الإدارة حصراً من
   لوحة الأدمين (زرعه أولي احتياطي من الوثيقة المرجعية المعتمدة)، ولا
   يمكن لأي أخصائي أو عميل تعديله — الأخصائي يمضي العقد المعتمد فقط. */
export const DEFAULT_PLATFORM_CONTRACT = `تم إبرام هذا العقد إلكترونياً عبر منصة طمأنينة بين كل من:

الطرف الأول (المختص/المعالج): الأخصائي الموثّق صاحب الجلسة.

الطرف الثاني (العميل): المستفيد الحاصل للخدمة عبر المنصة.

بند 1: أهداف وضوابط العملية العلاجية

يلتزم الطرف الأول بتقديم الدعم النفسي والاستشاري القائم على المدارس العلمية المعتمدة والأخلاقيات المهنية.

يقر الطرف الثاني برغبته الحرة في تلقي الاستشارة، ويلتزم بالتعاون مع المعالج وتنفيذ الأنشطة المتفق عليها ضمن الخطة العلاجية.

بند 2: السرية والخصوصية

كافة المعلومات والأفكار الخاصة بالعميل تُعامل بسرية تامة ومطلقة.

تُرفع السرية قانوناً في الحالات الاستثنائية التالية فقط:

وجود خطر حقيقي يهدد حياة العميل (كأفكار جدية لإيذاء الذات أو الانتحار).

وجود خطر مباشر يهدد حياة الآخرين أو يمس بالأمن العام.

صدور أمر قضائي رسمي أو طلب خطي ومباشر من المحكمة.

بند 3: المواعيد، الإلغاء، والغياب

مدة الجلسة: حسب المدة المتفق عليها عند الحجز وتظهر في تفاصيل الجلسة.

سياسة الإلغاء: يجب على العميل إخطار المختص برغبته في تأجيل أو إلغاء الموعد قبل 24 ساعة على الأقل من موعد الجلسة.

الغياب المفاجئ: في حال عدم الحضور دون إشعار مسبق ضمن المدة المحددة، يحق للمختص احتساب رسوم الجلسة كاملة وغير مستردة.

بند 4: الرسوم والتعاملات المادية

حددت قيمة الجلسة الواحدة بالمبلغ الظاهر في تفاصيل الحجز حسب العملة المختارة.

يتم دفع الرسوم مسبقاً قبل الجلسة عبر وسائل الدفع المتفق عليها بين الطرفين، والمنصة وسيط تقني لا يمسك أي أموال.

بند 5: التواصل خارج الجلسات وحالات الطوارئ

يقتصر التواصل مع المختص خارج الجلسات على الأمور التنسيقية والإدارية فقط (تعديل موعد، اعتذار).

هذا العقد لا يوفر خدمة الدعم الطارئ على مدار 24 ساعة. في حالات الطوارئ النفسية الحادة، يتعين على العميل التوجه فوراً لأقرب مستشفى أو الاتصال بأرقام الطوارئ الوطنية.

بند 6: إنهاء العلاج النفسي

يحق للطرفين إنهاء الجلسات في أي وقت، ويفضل أن يتم ذلك بناءً على نقاش مشترك في جلسة ختامية لضمان الإنهاء الآمن للعملية العلاجية.`;

/* جلب نصوص الهيكل حسب اللغة مع سقوط آمن إلى العربية */
export function docTexts(lang: string | null | undefined): ContractDocTexts {
  return CONTRACT_DOC_TEXTS[(lang as ContractLang) || "ar"] || CONTRACT_DOC_TEXTS.ar;
}

/* اتجاه لغة المستند — العربية RTL والبقية LTR */
export function docDir(lang: string | null | undefined): "rtl" | "ltr" {
  return (lang || "ar") === "ar" ? "rtl" : "ltr";
}

/* تنسيق التاريخ حسب لغة المستند — {date} في intro */
export function docDate(iso: string | null | undefined, lang: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(
      lang === "ar" ? "ar-DZ" : lang === "fr" ? "fr-FR" : lang === "tr" ? "tr-TR" : lang === "ru" ? "ru-RU" : lang === "zh" ? "zh-CN" : "en-GB",
      { year: "numeric", month: "long", day: "numeric" }
    ).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}
