/**
 * v1.10.0 — حزمة العقد العلاجي الاحترافي سداسي اللغات.
 * ─────────────────────────────────────────────────────────────────
 * ① نصوص هيكل المستند الرسمي (العنوان، رقم العقد، الأطراف، الإقرار، التذييل)
 *    بالست لغات — تُستعمل عند العرض والطباعة/الحفظ PDF حسب اللغة المختارة
 *    قبل الطباعة (طلب المستخدم: اختيار لغة العقد قبل ظهوره للطباعة).
 * ② النموذج المقترح للأخصائي مبني على «وثيقة عقد استشارة نفسية (عقد علاجي)»
 *    المعتمدة مع تكييفها لمنصة طمأنينة — سداسي اللغات: يختار الأخصائي لغة
 *    القالب فيُعبّأ محرر نصه به فوراً.
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

/* ═══ النموذج المقترح — مبني على «وثيقة عقد استشارة نفسية (عقد علاجي)» ═══
   سداسي اللغات: يختار الأخصائي لغة القالب فيُعبّأ محرره فوراً. */
export const SUGGESTED_TEMPLATE: Record<ContractLang, string> = {
  ar: `وثيقة عقد استشارة نفسية (اتفاقية العقد العلاجي) — منصة طمأنينة

تم إبرام هذا العقد إلكترونياً عبر منصة طمأنينة بين كل من:
الطرف الأول (المختص/المعالج): الأخصائي المسجّل صاحب هذا الحساب.
الطرف الثاني (العميل): العميل المسجّل في المنصة الطالب للاستشارة.

بند 1 — أهداف وضوابط العملية العلاجية:
يلتزم الطرف الأول بتقديم الدعم النفسي والاستشاري القائم على المدارس العلمية المعتمدة والأخلاقيات المهنية، ويقر الطرف الثاني برغبته الحرة في تلقي الاستشارة، ويلتزم بالتعاون مع المختص وتنفيذ الأنشطة المتفق عليها ضمن الخطة العلاجية.

بند 2 — السرية والخصوصية:
كافة المعلومات والأفكار الخاصة بالعميل تُعامل بسرية تامة ومطلقة، وتُرفع السرية قانوناً في الحالات الاستثنائية التالية فقط: وجود خطر حقيقي يهدد حياة العميل (كأفكار جدية لإيذاء الذات أو الانتحار)، أو وجود خطر مباشر يهدد حياة الآخرين أو يمس بالأمن العام، أو صدور أمر قضائي رسمي أو طلب خطي ومباشر من المحكمة.

بند 3 — المواعيد والإلغاء والغياب:
تُحجز الجلسات عبر المنصة بالقناة المتفق عليها (نص أو صوت أو فيديو)، ويجب على العميل إخطار المختص برغبته في تأجيل أو إلغاء الموعد قبل 24 ساعة على الأقل من موعد الجلسة، وفي حال عدم الحضور دون إشعار مسبق ضمن المدة المحددة يحق للمختص احتساب الجلسة كمنعقدة وغير مستردة.

بند 4 — الرسوم والتعاملات المادية:
تُحدَّد قيمة الجلسة الواحدة بالمبلغ المعروض في صفحة الحجز على المنصة بعملة العميل المختارة، وتُدفع مباشرة بين الطرفين عبر وسائل الدفع المتفق عليها بينهما، والمنصة وسيط تقني لا يمسك أي أموال ولا يتوسط المدفوعات.

بند 5 — التواصل خارج الجلسات وحالات الطوارئ:
يقتصر التواصل مع المختص خارج الجلسات على الأمور التنسيقية والإدارية فقط (تعديل موعد، اعتذار)، وهذا العقد لا يوفر خدمة الدعم الطارئ على مدار 24 ساعة؛ في حالات الطوارئ النفسية الحادة يتعين على العميل التوجه فوراً لأقرب مستشفى أو الاتصال بأرقام الطوارئ الوطنية.

بند 6 — إنهاء العلاج النفسي:
يحق للطرفين إنهاء الجلسات في أي وقت، ويفضل أن يتم ذلك بنقاش مشترك في جلسة ختامية لضمان الإنهاء الآمن للعملية العلاجية، ويُحفظ سجل العقود والجلسات لدى الطرفين على المنصة.

إقرار وتوقيع الأطراف:
يُقرّ كل طرف بأنه قرأ كافة بنود هذا العقد، وفهم شروطه وسياسة السرية والإلغاء، ووافق عليها طواعية، ويُعتبر التوقيع الإلكتروني المسجّل على منصة طمأنينة حجة نافذة بين الطرفين بتاريخ تسجيله.`,

  fr: `Contrat de consultation psychologique (accord thérapeutique) — Plateforme Tumaanina

Le présent contrat est conclu électroniquement via la plateforme Tumaanina entre :
Partie I (le spécialiste/thérapeute) : le spécialiste titulaire de ce compte.
Partie II (le client) : le client inscrit sur la plateforme demandant la consultation.

Clause 1 — Objectifs et cadre du processus thérapeutique :
La Partie I s'engage à fournir un soutien psychologique et consultatif fondé sur les écoles scientifiques reconnues et la déontologie professionnelle ; la Partie II reconnaît sa libre volonté de recevoir la consultation et s'engage à coopérer avec le spécialiste et à réaliser les activités convenues dans le plan thérapeutique.

Clause 2 — Confidentialité et vie privée :
Toutes les informations et idées du client sont traitées en confidentialité absolue ; le secret ne peut être levé que dans les cas exceptionnels suivants : danger réel menaçant la vie du client (idées sérieuses d'auto-agression ou de suicide), danger direct menaçant la vie d'autrui ou la sécurité publique, ou ordonnance judiciaire officielle ou demande écrite et directe d'un tribunal.

Clause 3 — Rendez-vous, annulation et absence :
Les séances se réservent via la plateforme selon le canal convenu (texte, audio ou vidéo) ; le client doit notifier au spécialiste son souhait de reporter ou d'annuler le rendez-vous au moins 24 heures avant la séance ; en cas d'absence sans préavis dans le délai fixé, le spécialiste est en droit de considérer la séance comme tenue et non remboursable.

Clause 4 — Honoraires et transactions financières :
La valeur de chaque séance est celle affichée sur la page de réservation de la plateforme dans la devise choisie par le client ; elle est payée directement entre les parties selon les moyens de paiement convenus entre elles ; la plateforme reste un intermédiaire technique qui ne manipule aucun fonds.

Clause 5 — Communication hors séances et urgences :
La communication avec le spécialiste hors séances se limite aux questions de coordination et d'administration (report de rendez-vous, excuse) ; le présent contrat n'offre pas de service d'urgence 24h/24 ; en cas d'urgence psychologique aiguë, le client doit immédiatement se rendre à l'hôpital le plus proche ou appeler les numéros d'urgence nationaux.

Clause 6 — Fin de la prise en charge :
Les deux parties peuvent mettre fin aux séances à tout moment, de préférence après une discussion commune lors d'une séance de clôture afin d'assurer une fin sûre du processus thérapeutique ; le registre des contrats et des séances est conservé pour les deux parties sur la plateforme.

Déclaration et signatures :
Chaque partie déclare avoir lu toutes les clauses du présent contrat, compris ses conditions, sa politique de confidentialité et d'annulation, et y adhérer volontairement ; la signature électronique enregistrée sur la plateforme Tumaanina fait foi entre les parties à la date de son enregistrement.`,

  en: `Psychological Consultation Contract (Therapeutic Agreement) — Tumaanina Platform

This contract is concluded electronically via the Tumaanina platform between:
Party I (the specialist/therapist): the specialist holding this account.
Party II (the client): the client registered on the platform seeking the consultation.

Clause 1 — Goals and framework of the therapeutic process:
Party I commits to providing psychological support and counseling based on recognized scientific schools and professional ethics; Party II affirms their free will to receive the consultation and commits to cooperate with the specialist and carry out the activities agreed within the therapeutic plan.

Clause 2 — Confidentiality and privacy:
All client information and ideas are treated with complete and absolute confidentiality; the duty of confidence is lifted by law only in the following exceptional cases: a real threat to the client's life (serious thoughts of self-harm or suicide), a direct threat to the lives of others or to public safety, or an official court order or a written direct request from a court.

Clause 3 — Appointments, cancellation and no-show:
Sessions are booked through the platform via the agreed channel (text, voice or video); the client must notify the specialist of any wish to postpone or cancel the appointment at least 24 hours before the session; in case of absence without prior notice within the specified period, the specialist may count the session as delivered and non-refundable.

Clause 4 — Fees and financial dealings:
The value of each session is the amount displayed on the platform's booking page in the client's chosen currency; it is paid directly between the parties via the payment methods they agree upon; the platform is a technical intermediary that holds no funds and does not mediate payments.

Clause 5 — Communication outside sessions and emergencies:
Communication with the specialist outside sessions is limited to coordination and administrative matters only (rescheduling, apology); this contract does not provide 24/7 emergency support; in acute psychological emergencies the client must immediately go to the nearest hospital or call the national emergency numbers.

Clause 6 — Terminating the therapy:
Both parties may end the sessions at any time, preferably after a joint discussion in a closing session to ensure a safe end to the therapeutic process; the record of contracts and sessions is kept for both parties on the platform.

Declaration and signatures:
Each party declares having read all the clauses of this contract, understood its terms, confidentiality and cancellation policy, and voluntarily agrees to them; the electronic signature recorded on the Tumaanina platform shall be binding evidence between the parties as of its recording date.`,

  tr: `Psikolojik Danışma Sözleşmesi (Terapötik Anlaşma) — Tumaanina Platformu

İşbu sözleşme Tumaanina platformu üzerinden elektronik olarak akdedilmiştir:
Birinci Taraf (Uzman/Terapist): bu hesabın sahibi uzman.
İkinci Taraf (Danışan): platforma kayıtlı ve danışma talep eden danışan.

Madde 1 — Terapötik sürecin amaçları ve çerçevesi:
Birinci Taraf, tanınmış bilimsel ekollere ve meslek etiğine dayalı psikolojik destek ve danışmanlık sunmayı taahhüt eder; İkinci Taraf, danışmayı özgür iradesiyle aldığını beyan eder, uzmanla işbirliği yapmayı ve terapötik planda kararlaştırılan faaliyetleri yerine getirmeyi taahhüt eder.

Madde 2 — Gizlilik ve mahremiyet:
Danışana ait tüm bilgiler ve düşünceler tam ve mutlak gizlilik içinde ele alınır; gizlilik yalnızca şu istisnai hallerde kanunen kaldırılır: danışanın hayatına yönelik gerçek bir tehlike (kendine zarar verme veya intihar düşüncesi), başkalarının hayatına veya kamu güvenliğine yönelik doğrudan bir tehlike ya da mahkemenin resmi kararı veya yazılı doğrudan talebi.

Madde 3 — Randevular, iptal ve gelmeme:
Seanslar platform üzerinden anlaşılan kanalla (metin, ses veya video) rezerve edilir; danışan, randevuyu erteleme veya iptal etme isteğini seansdan en az 24 saat önce uzmana bildirmek zorundadır; belirlenen sürede önceden bildirim yapılmadan gelinmemesi halinde uzman, seansı gerçekleşmiş ve iade edilemez sayma hakkına sahiptir.

Madde 4 — Ücretler ve mali işlemler:
Her seansın değeri, platformun rezervasyon sayfasında danışanın seçtiği para birimiyle gösterilen tutardır; taraflar arasında aralarında kararlaştırdıkları ödeme yöntemleriyle doğrudan ödenir; platform hiçbir fonu elinde tutmayan teknik bir aracıdır.

Madde 5 — Seans dışı iletişim ve acil durumlar:
Seans dışında uzmanla iletişim yalnızca koordinasyon ve idari konularla sınırlıdır (randevu değişikliği, özür); işbu sözleşme 7/24 acil destek hizmeti sağlamaz; akut psikolojik acil durumlarda danışan derhal en yakın hastaneye gitmeli veya ulusal acil çağrı numaralarını aramalıdır.

Madde 6 — Terapinin sona erdirilmesi:
Taraflar seansları her zaman sona erdirebilir; terapötik sürecin güvenli bir şekilde sonlanması için tercihen kapanış seansında ortak bir görüşmeyle yapılır; sözleşme ve seans kayıtları her iki taraf için platformda saklanır.

Beyan ve imzalar:
Her taraf, işbu sözleşmenin tüm maddelerini okuduğunu, koşullarını, gizlilik ve iptal politikasını anladığını ve bunlara özgürce onay verdiğini beyan eder; Tumaanina platformuna kaydedilen elektronik imza, kayıt tarihi itibarıyla taraflar arasında kesin delil sayılır.`,

  ru: `Договор о психологической консультации (терапевтическое соглашение) — Платформа Tumaanina

Настоящий договор заключён в электронной форме через платформу Tumaanina между:
Сторона I (специалист/терапевт): специалист — владелец этого аккаунта.
Сторона II (клиент): клиент, зарегистрированный на платформе и обратившийся за консультацией.

Положение 1 — Цели и рамки терапевтического процесса:
Сторона I обязуется предоставлять психологическую поддержку и консультирование на основе признанных научных школ и профессиональной этики; Сторона II подтверждает свою свободную волю на получение консультации и обязуется сотрудничать со специалистом и выполнять согласованные мероприятия терапевтического плана.

Положение 2 — Конфиденциальность и приватность:
Вся информация и идеи клиента обрабатываются в условиях полной и абсолютной конфиденциальности; тайна снимается законом только в следующих исключительных случаях: реальная угроза жизни клиента (серьёзные мысли о самоповреждении или суициде), прямая угроза жизни других лиц или общественной безопасности, либо официальное судебное решение или письменный прямой запрос суда.

Положение 3 — Приёмы, отмена и неявка:
Сессии бронируются через платформу по согласованному каналу (текст, голос или видео); клиент обязан уведомить специалиста о желании перенести или отменить приём не менее чем за 24 часа до сессии; в случае неявки без предварительного уведомления в установленный срок специалист вправе считать сессию проведённой и не подлежащей возврату.

Положение 4 — Гонорары и финансовые расчёты:
Стоимость каждой сессии равна сумме, отображённой на странице бронирования платформы в валюте, выбранной клиентом; она оплачивается непосредственно между сторонами согласованными ими способами оплаты; платформа является техническим посредником и не удерживает никаких средств.

Положение 5 — Коммуникация вне сессий и экстренные случаи:
Общение со специалистом вне сессий ограничивается исключительно координационными и административными вопросами (перенос приёма, извинение); настоящий договор не предоставляет круглосуточную экстренную поддержку; при острой психологической неотложной ситуации клиент должен немедленно обратиться в ближайшую больницу или позвонить по национальным номерам экстренных служб.

Положение 6 — Прекращение терапии:
Стороны вправе прекратить сессии в любое время, желательно после совместного обсуждения на завершающей сессии для обеспечения безопасного окончания терапевтического процесса; учёт договоров и сессий сохраняется за обеими сторонами на платформе.

Заявление и подписи:
Каждая сторона заявляет, что прочитала все положения настоящего договора, поняла его условия, политику конфиденциальности и отмены, и добровольно с ними соглашается; электронная подпись, зарегистрированная на платформе Tumaanina, является доказательством между сторонами с даты её регистрации.`,

  zh: `心理咨询协议（治疗合同）— Tumaanina（طمأنينة）平台

本合同通过 Tumaanina 平台以电子方式签订，双方为：
第一方（专业人员/治疗师）：持有该账号的专业人员。
第二方（来访者）：在本平台注册并寻求咨询的来访者。

第 1 条 — 治疗过程的目标与框架：
第一方承诺基于公认的科学流派与职业伦理提供心理支持与咨询；第二方确认其自愿接受咨询，承诺与专业人员合作并执行治疗计划中商定的活动。

第 2 条 — 保密与隐私：
来访者的全部信息与想法均以完全、绝对的保密方式处理；仅在下列例外情形下依法解除保密：来访者生命面临真实危险（严重的自伤或自杀想法）、直接威胁他人生命或公共安全，或法院的正式命令或书面直接调取请求。

第 3 条 — 预约、取消与缺席：
 sessions 通过平台以约定渠道（文字、语音或视频）预约；来访者须在 session 开始前至少 24 小时通知专业人员其改期或取消的意愿；如在规定期限内未提前通知而缺席，专业人员有权将本次 session 视为已进行且不予退还。

第 4 条 — 费用与财务往来：
每次 session 的费用为平台预约页面以来访者所选货币显示的金额；由双方按彼此商定的支付方式直接支付；平台为技术中介，不持有任何资金，亦不经手付款。

第 5 条 — session 之外的沟通与紧急情况：
session 之外与专业人员的沟通仅限于协调与事务性事项（改期、致歉）；本合同不提供 7×24 小时紧急支持；在急性心理紧急情况下，来访者应立即前往最近的医院或拨打国家紧急救援电话。

第 6 条 — 治疗的终止：
双方可随时结束 session，最好通过结束 session 中的共同商谈以确保治疗过程安全收尾；合同与 session 记录由双方在平台留存。

声明与签署：
各方声明已阅读本合同全部条款，理解其条件、保密与取消政策，并自愿同意；在 Tumaanina 平台记录的电子签名自记录之日起对双方具有约束力。`,
};

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
