/**
 * طمأنينة — مخططات MongoDB (mongoose)
 * ─────────────────────────────────────────────────────────────────
 * المجموعات (Collections):
 *   users               → العملاء والأخصائيون (حسابات) + المحفظة
 *   counselors          → ملفات الأخصائيين المهنية (توثيق، تخصصات، سعر الجلسة، واتساب)
 *   sessions            → جلسات الاستشارة المدفوعة
 *   messages            → رسائل المحادثة النصية داخل الجلسات
 *   push_subscriptions  → اشتراكات الإشعارات الفورية (Web Push)
 *   crisis_logs         → سجل عبارات الأزمة المكتشفة
 *   notifications       → إشعارات داخل الموقع (جرس الإشعارات)
 *   feedbacks           → اقتراحات التطوير وبلاغات المشاكل
 *
 * ملاحظة للإدارة اليدوية للبيانات:
 *   - specialties و languages مصفوفات نصية مباشرة (وليست JSON نصي)
 *   - whatsapp يُخزَّن بالصيغة الدولية أرقام فقط: 213XXXXXXXXX
 */
import mongoose, { Schema } from "mongoose";

/* فشل سريع للاستعلامات المُخزّنة مؤقتاً — بدل تعليق 10 ثوانٍ يقتل
   دوال Vercel serverless ويُظهر استجابة فارغة للمتصفح */
mongoose.set("bufferTimeoutMS", 5000);

/* ─── User ─── */
const UserSchema = new Schema(
  {
    pseudonym: { type: String, default: null, trim: true },
    role: {
      type: String,
      /* v1.14.0: CLINIC — حساب عيادة نفسية (دليل العيادات + الجلسات الحضورية + الإعلانات) */
      enum: ["VICTIM", "COUNSELOR", "ADMIN", "CLINIC"],
      required: true,
    },
    /* v1.3.0: كل لغات المنصة الست — كان التعداد الثلاثي يُفشل تسجيل/حفظ حساب
       مستخدم واجهته التركية/الروسية/الصينية (خطأ تحقق صامت) */
    language: { type: String, enum: ["ar", "fr", "en", "tr", "ru", "zh"], default: "ar" },
    wilaya: { type: String, default: null },
    ageGroup: { type: String, default: null },
    /* الجنس — للعميلين: ذكر أو أنثى فقط (يُحدّد عند التسجيل) */
    gender: { type: String, enum: ["male", "female", null], default: null },
    /* v2.7.0: رقم هاتف العميل (اختياري، يُخزَّن بالصيغة الدولية 213XXXXXXXXX)
       لا يظهر أبداً في القوائم — يُرسَل فقط لأخصائي الجلسة التي اختارها هذا
       العميل بنفسه، ليتمكن من التواصل معه عبر واتساب */
    phone: { type: String, default: null, trim: true },
    email: {
      type: String,
      default: undefined, // غائب تماماً عند غيابه — يمنع تصادم null في الفهرس الفريد sparse
      trim: true,
      lowercase: true,
      sparse: true, // unique فقط للقيم الموجودة فعلاً
      unique: true,
    },
    /* مصادقة ذاتية: كلمة مرور + عبارة استرجاع (تُطلب عند نسيان كلمة المرور) */
    passwordHash: { type: String, default: null },
    passwordSalt: { type: String, default: null },
    recoveryHash: { type: String, default: null },
    recoverySalt: { type: String, default: null },
    /* v2.6.0: تعطيل الحساب من الإدارة — يمنع الولوج ويُخفي الأخصائي من القوائم
       (يُفعَّل تلقائياً بعد 3 تأخرات في قبول الطلبات، ويُعاد يدوياً من الأدمين) */
    suspended: { type: Boolean, default: false },
    /* v2.8.0: نبض الحضور العام — يُحدَّث مع كل فحص للجرس (كل 12 ثانية).
       يُستعمل لإرسال إشعار الرسائل الجديدة فقط عندما يكون المستخدم غائباً عن المنصة */
    lastSeenAt: { type: Date, default: null },
    /* v2.8.0: الإخفاء السريع محفوظ مع الحساب — يتبع المستخدم عبر الأجهزة
       وينجو من مسح بيانات المتصفح (localStorage يبقى احتياطاً للأجهزة غير المسجّلة) */
    quickHideEnabled: { type: Boolean, default: false },
    quickHideHash: { type: String, default: null },
    /* v2.9.0: تفضيل الأخصائي بشأن جنس العميلين الذين يقبل التعامل معهم —
       ["male","female"] افتراضياً (لا قيد) — يُفلتر به قوائم الحجز والمطابقة */
    acceptedGenders: { type: [String], default: ["male", "female"] },
    /* v1.15.0: رفض الإعلانات المدفوعة — حق العميل من إعداداته: نافذة
       الإعلان العائم لا تظهر له إطلاقاً — v1.17.0: يشمل أيضاً البانر
       الإعلاني أعلى الصفحات (يخفى عن الرافض تماماً) */
    adsOptOut: { type: Boolean, default: false },
    /* ═ v1.17.0: العيادة التابع لها الأخصائي (اختياري عند التسجيل) ═
       يختار الأخصائي عيادة من الدليل عند إنشاء حسابه فيظهر في صفحة
       تلك العيادة ضمن قائمة أخصائييها بكل تفاصيله */
    clinicId: { type: Schema.Types.ObjectId, ref: "Clinic", default: null, index: true },
    /* ═ v1.4.0: حسابات فريق الإدارة ═
       لحسابات role=ADMIN فقط: المالك SUPER (يدير الفريق)، مدير المنصة ADMIN
       (كل الإدارة عدا الفريق)، المسير MANAGER (قراءة ومحتوى وإشعارات فقط).
       دخولهم بالبريد وكلمة مرور — ورمز البيئة MASTER يبقى للمالك */
    staffRole: { type: String, enum: ["SUPER", "ADMIN", "MANAGER", null], default: null },
    staffName: { type: String, default: null, trim: true },
  },
  { timestamps: true, collection: "users" }
);

/* ─── CounselorProfile ─── */
const CounselorProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    fullName: { type: String, required: true, trim: true },
    /* v2.5.5: الاسم في الرابط — /counselor/{slug} بدل معرّف قاعدة البيانات
       مثال: "Dr Test" → drtest — يُولَّد عند التسجيل وتُرحَّل الحسابات القديمة
       تلقائياً عند أول زيارة، والوصول بمعرّف قاعدة البيانات ما زال صالحاً */
    slug: { type: String, default: null, index: true },
    specialties: { type: [String], default: [] },
    /* تخصصات خاصة يُدخلها الأخصائي بنفسه (خارج القائمة الجاهزة) — تُعرض كما هي */
    customSpecialties: { type: [String], default: [] },
    languages: { type: [String], default: [] },
    bio: { type: String, default: null },
    whatsapp: { type: String, default: null, trim: true },
    yearsExperience: { type: Number, default: 0 },
    /* صورة الشهادة/الترخيص base64 (data URL) — الإدارة تتحقق منها بصرياً */
    diplomaImage: { type: String, default: null },
    /* الصورة الشخصية base64 (data URL) — اختيارية، تظهر للعميل في اختيار المختص والدليل */
    photo: { type: String, default: null },
    verificationStatus: {
      type: String,
      enum: ["PENDING", "VERIFIED", "REJECTED"],
      default: "PENDING",
    },
    available: { type: Boolean, default: true },
    rating: { type: Number, default: 5.0 },
    sessionsCount: { type: Number, default: 0 },
    /* v2.6.0: جدول التوفر الأسبوعي — المفتاح رقم اليوم (0=الأحد … 6=السبت)
       والقيمة مصفوفة الساعات المتاحة من SLOT_TIMES.
       null/غائب = غير مخصّص → كل الأوقات متاحة (سلوك v2.5 backward-compatible) */
    weeklyAvailability: { type: Schema.Types.Mixed, default: null },
    /* v2.6.0: عدد مرات التأخر في قبول الطلبات أكثر من 36 ساعة —
       3 تأخرات = تعليق تلقائي للحساب حتى يفعّله الأدمين يدوياً */
    lateCount: { type: Number, default: 0 },
    /* v2.9.0: روابط التواصل الاجتماعي للأخصائي — تظهر بأيقوناتها الحقيقية
       في بطاقته بدليل الأخصائيين وفي ملفه العام */
    socials: {
      facebook: { type: String, default: null, trim: true },
      instagram: { type: String, default: null, trim: true },
      tiktok: { type: String, default: null, trim: true },
    },
    /* v1.1.0 (طمأنينة): سعر الجلسة الواحدة بالدينار الجزائري — يُبقى للتوافق مع
       السجلات القديمة وكأساس للترحيل؛ العرض الفعلي يقرأ من sessionPrices */
    sessionPrice: { type: Number, default: 2500, min: 200, max: 20000 },
    /* v1.3.0: أسعار الجلسة الثلاثة المستقلة — الأخصائي يحدد سعر كل عملة بنفسه
       من إعداداته، والعميل يرى سعر العملة التي اختارها فقط (بلا أي تحويل) */
    sessionPrices: {
      type: Schema.Types.Mixed,
      default: null, /* null = سجل قديم — يُرحَّل تلقائياً من sessionPrice عند القراءة */
    },
    /* ═ v1.9.0: العقد العلاجي — قالب يكتبه الأخصائي من إعداداته ويمضيه رقمياً ═
       يُستنسخ نصه وإمضاؤه في عقد مستقل لكل عميل عند قبول أول جلسة،
       والعقود الممضاة تُحفظ كاملة في حساب الأخصائي */
    contractText: { type: String, default: null, maxlength: 15000 },
    contractSignature: { type: String, default: null }, /* صورة الإمضاء dataURL */
    contractSignedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "counselors" }
);

/* ─── SupportSession ─── */
const SupportSessionSchema = new Schema(
  {
    victimId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    counselorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    topic: { type: String, required: true },
    mode: { type: String, enum: ["TEXT", "VOICE", "VIDEO"], default: "TEXT" },
    scheduledAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "ACTIVE", "COMPLETED", "CANCELLED"],
      default: "PENDING",
    },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    /* خطة ما بعد الجلسة: موعد الجلسة التالية أو إنهاء العلاج تماماً (يقرره الأخصائي) */
    followUpAt: { type: Date, default: null },
    treatmentEnded: { type: Boolean, default: false },
    /* مصدر إنشاء الجلسة: FOLLOW_UP = أُنشئت تلقائياً من موعد متابعة */
    source: { type: String, default: null },
    /* تذكير ما قبل الموعد بساعة — timestamp آخر إرسال لمنع التكرار */
    reminderSentAt: { type: Date, default: null },
    /* نبض الحضور: آخر ظهور لكل طرف داخل غرفة الجلسة (تحديث كل 10 ثوانٍ) */
    victimLastSeenAt: { type: Date, default: null },
    counselorLastSeenAt: { type: Date, default: null },
    /* v1.6.0: أول لحظة دخول العميل الغرفة (تُضبط مرة واحدة عند أول نبض له) —
       أساس احتساب الالتزام في تحدّي العملاء: الاعتماد على «آخر نبض» كان
       يُفشل أي جلسة تتجاوز 10 دقائق فبقى العداد 0/4 دائماً */
    victimFirstSeenAt: { type: Date, default: null },
    /* v2.6.0: وُشِر هذا الطلب كـ«تأخر عن القبول +36 ساعة» وأُضيف لعدّاد الأخصائي
       — يمنع احتساب نفس الطلب أكثر من مرة في المسح الدوري */
    lateFlagged: { type: Boolean, default: false },
    moodBefore: { type: Number, default: null },
    moodAfter: { type: Number, default: null },
    notes: { type: String, default: null },
    crisisFlag: { type: Boolean, default: false },
    /* v2.8.0: مدة الجلسة بالدقائق — يختارها الأخصائي عند قبول الطلب ليراها العميل.
       الجلسة لا تُغلق تلقائياً بعد انقضاء المدة — الإنهاء قرار الأخصائي دائماً */
    durationMinutes: { type: Number, default: null },
    /* v2.8.0: سبب التعذّر عند رفض الأخصائي للطلب (إلزامي عند الرفض)
       + من قام بالإلغاء: COUNSELOR | VICTIM | ADMIN */
    cancelReason: { type: String, default: null, trim: true },
    cancelledBy: { type: String, default: null },
    /* v2.8.0: تغيير الموعد قبل القبول — عدّاد + آخر تغيير (للأرشفة) */
    rescheduleCount: { type: Number, default: 0 },
    lastRescheduledAt: { type: Date, default: null },
    /* v1.1.0 (طمأنينة): سعر الجلسة مثبّتاً لحظة الحجز — للعرض فقط، فالمنصة
       لا تجري أي مدفوعات إلكترونية (الدفع مباشرة مع المختص) */
    price: { type: Number, default: null },
    /* v1.3.0: عملة هذا السعر (DZD/EUR/USD) — السعر الذي رآه العميل عند الحجز
       بنفس عملة عرضه بلا أي تحويل. الجلسات القديمة تُقرأ DZD افتراضياً */
    currency: { type: String, enum: ["DZD", "EUR", "USD"], default: "DZD" },
  },
  { timestamps: true, collection: "sessions" }
);

/* ═ v1.11.0: TherapyContract — العقد العلاجي المستقل لكل جلسة ═
   v1.10.0 كانت قاعدة «عقد واحد لكل زوج (أخصائي × عميل)» — بعد إمضاء العميل
   الأول لم يُنشأ له عقدٌ أبداً في الحجوزات التالية فتوقفت النافذة المنبثقة
   (بلاغ المستخدم: «تظهر فقط في المرة الأولى»). الإصلاح: كل جلسة محجوزة
   تُنشئ عقدها المستقل برقمه التسلسلي ولقطة نص الأخصائي وإمضائه — فتظهر
   النافذة المنبثقة بعد كل حجز مهما تكرر، وسجل العقود الممضية كامل لدى
   الطرفين. كل عقد يحمل رقماً تسلسلياً فريداً (TC-YYYY-00001) يُولّد ذرياً
   من عدّاد مركزي فلا تكرار، ولغة مستند معتمدة عند الطباعة/الحفظ PDF. */
const TherapyContractSchema = new Schema(
  {
    /* v1.10.0: الرقم التسلسلي الرسمي للعقد — فريد (يُولَّد من العدّاد الذرّي) */
    number: { type: String, unique: true, sparse: true },
    counselorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    clientUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    /* v1.11.0: الجلسة صاحبة هذا العقد — كل جلسة لعقدها المستقل */
    sessionId: { type: Schema.Types.ObjectId, ref: "SupportSession", default: null },
    /* لقطة نص العقد لحظة الإنشاء — لا تُحدَّث بعد توقيع الطرفين */
    contractText: { type: String, required: true },
    counselorName: { type: String, default: null },
    counselorSignature: { type: String, default: null },
    counselorSignedAt: { type: Date, default: null },
    clientName: { type: String, default: null }, /* الاسم/الاسم المستعار للعرض */
    clientSignature: { type: String, default: null },
    clientSignedName: { type: String, default: null }, /* الاسم الكامل الذي كتبه العميل عند الإمضاء */
    clientSignedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["AWAITING_CLIENT", "SIGNED"],
      default: "AWAITING_CLIENT",
    },
    /* v1.10.0: لغة المستند المعتمدة عند الطباعة/الحفظ PDF (ar/fr/en/tr/ru/zh)
       — تُختار قبل الطباعة وتُحفظ مع العقد */
    lang: { type: String, default: "ar" },
  },
  { timestamps: true, collection: "therapy_contracts" }
);

/* ═ v1.12.0: عقد المنصة الواحد — مستند مفرد (singleton) يمثل المنصة كاملة ═
   عقد علاجي واحد لكل المستخدمين، نصه تديره الإدارة حصراً من لوحة الأدمين،
   ولا يمكن لأي أخصائي أو عميل إنشاء عقد خاص أو تعديل نصه — الأخصائي
   يكتفي بالإمضاء عليه، والعقد يُنسخ كلقطة محمية إلى كل جلسة محجوزة. */
const PlatformContractSchema = new Schema(
  {
    /* مستند مفرد دائماً بمعرّف ثابت "platform" */
    _id: { type: String, default: "platform" },
    text: { type: String, required: true },
    updatedBy: { type: String, default: null }, /* اسم من عدّل من فريق الإدارة */
  },
  { timestamps: true, collection: "platform_contract" }
);

/* ═ v1.10.0: عدّاد ذرّي لأرقام العقود — findOneAndUpdate مع $inc ذرّية
   فلا يمكن أن يحصل عقدان على نفس الرقم حتى مع تزامن كامل ═ */
const ContractCounterSchema = new Schema(
  {
    _id: { type: String, default: "therapy" },
    seq: { type: Number, default: 0 },
  },
  { collection: "contract_counters" }
);
/* v1.11.0: فهرس استعلام للثلاثية (أخصائي × عميل × جلسة) — عقد مستقل لكل جلسة.
   ملاحظة: الفهرس الفريد القديم على الزوج (v1.10.0) يُسقَط تلقائياً عند
   الإقلاع عبر ensureContractIndexes() في lib/server/contract.ts — وإلا
   لمنع إنشاء عقد ثانٍ لنفس الزوج بعد إمضاء الأول فتتوقف النافذة مجدداً. */
TherapyContractSchema.index({ counselorId: 1, clientUserId: 1, sessionId: 1 });

/* ─── Message ─── */
const MessageSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: "SupportSession", default: null, index: true },
    /* v2.8.0: خيوط التواصل قبل الجلسة بين عميل وأخصائي —
       threadKey = dm:{victimId}:{counselorId} — sessionId يبقى null في هذه الخيوط */
    threadKey: { type: String, default: null, index: true },
    senderRole: { type: String, default: "SYSTEM" }, // VICTIM | COUNSELOR | SYSTEM
    senderName: { type: String, default: null },
    /* v1.5.0: معرّف المرسل — يُخزَّن مع كل رسالة جديدة ليُصرَّح به فقط
       لصاحبها بتعديلها أو حذفها (الرسائل القديمة بلا معرّف تبقى للقراءة فقط) */
    senderId: { type: String, default: null, index: true },
    /* v1.5.0: نوع الرسالة — text (افتراضي) أو voice (رسالة صوتية base64) */
    type: { type: String, enum: ["text", "voice"], default: "text" },
    content: { type: String, required: true },
    /* v1.5.0: تعديل/حذف ناعم — deleted تبقى الرسالة مخزّنة وتُعرض
       بحالة «حُذفت» لدى الطرفين، وeditedAt يبرز أن النص عُدّل */
    editedAt: { type: Date, default: null },
    deleted: { type: Boolean, default: false },
    /* v1.6.0: مدة الرسالة الصوتية بالثواني — تُعرض في فقاعة المشغّل
       (ملفات webm المسجّلة بلا مدة مضمّنة فكانت تظهر 0:00 دائماً) */
    seconds: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "messages" }
);

/* ─── PushSubscription ─── */
const PushSubscriptionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: { type: String, default: "VICTIM" },
    endpoint: { type: String, required: true, unique: true },
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "push_subscriptions" }
);

/* ─── InAppNotification (جرس الإشعارات داخل الموقع) ─── */
const InAppNotificationSchema = new Schema(
  {
    /* ObjectId لمستخدم حقيقي… أو النص "admin" لحساب الأدمين الاصطناعي
       (التثبيتات التي تعمل برمز ADMIN_PASSCODE دون مستند User للأدمين)
       — v2.7.0: إشعار فائز التحدي يصل للأدمين في كل الحالات */
    userId: { type: Schema.Types.Mixed, required: true, index: true },
    /* مفتاح الترجمة: booked/accepted/started/declined/feedback/followUp/treatmentEnded/test/null */
    key: { type: String, default: null },
    title: { type: String, default: "" },
    body: { type: String, default: "" },
    url: { type: String, default: "/" },
    read: { type: Boolean, default: false },
    /* v1.6.0: متغيرات القالب {name}/{when}/{reason}… تُخزَّن مع المفتاح كي
       يُعاد توليد نص الإشعار بلغة واجهة المستخدم الحالية عند العرض —
       فتُترجم الإشعارات فعلياً للغات الست مهما كانت لغة لحظة الإرسال */
    vars: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "notifications" }
);

/* ─── Feedback (اقتراحات التطوير وبلاغات المشاكل) ─── */
const FeedbackSchema = new Schema(
  {
    /* suggestion | bug | other | contact */
    type: { type: String, default: "other" },
    subject: { type: String, default: "" },
    message: { type: String, required: true },
    contact: { type: String, default: null },
    handled: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "feedbacks" }
);

/* ─── CrisisLog ─── */
const CrisisLogSchema = new Schema(
  {
    sessionId: { type: String, default: null },
    source: { type: String, default: "CLIENT" }, // CLIENT | REST_API | CHAT_SERVER
    phrase: { type: String, required: true },
    action: { type: String, default: "CRISIS_BANNER_SHOWN" },
    /* من كتب العبارة: VICTIM | COUNSELOR — null للسجلات القديمة */
    saidBy: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "crisis_logs" }
);

/* ─── UpliftQuote (عبارات الاطمئنان المنبثقة عند الولوج) ───
   v2.10.0: سداسية اللغات (ar/fr/en + tr/ru/zh) — العربية إلزامية
   والبقية اختيارية للتوافق مع السجلات القديمة (احتياطاً تُعرض العربية) */
const UpliftQuoteSchema = new Schema(
  {
    textAr: { type: String, required: true },
    textFr: { type: String, required: true },
    textEn: { type: String, required: true },
    textTr: { type: String, default: null },
    textRu: { type: String, default: null },
    textZh: { type: String, default: null },
    author: { type: String, default: null }, /* مصدر العبارة: سورة/حديث/مثل/اسم صاحبها */
    /* religious | social | wisdom */
    category: { type: String, default: "wisdom" },
    active: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: true, updatedAt: true }, collection: "uplift_quotes" }
);

/* ─── GratitudeContent (صفحة الشكر والعرفان — سجل مفرد يعدّله الأدمين) ───
   نص ثلاثي اللغات + نوع الرموز الزخرفية التي تطفو في الخلفية */
const GratitudeContentSchema = new Schema(
  {
    textAr: { type: String, required: true },
    textFr: { type: String, required: true },
    textEn: { type: String, required: true },
    /* رمز الخلفية: ❤️ 💛 🌹 🕊️ 💐 … — يحرّره الأدمين */
    symbol: { type: String, default: "❤️" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "gratitude_content" }
);

/* ─── ChallengeState (v2.7.0: تحدي المنصة السري — فائز واحد فقط) ───
   مستند مفرد بمعرّف ثابت "challenge" — أول من يبلغ العدد المطلوب
   من الضغطات على علم الجزائر يُكتب هنا ذرياً ( findOneAndUpdate مع
   winnerUserId: null) فلا يمكن أن يفوز اثنان في اللحظة نفسها */
const ChallengeStateSchema = new Schema(
  {
    _id: { type: String, default: "challenge" },
    winnerUserId: { type: String, default: null },
    winnerName: { type: String, default: null },
    winnerProfileId: { type: String, default: null },
    wonAt: { type: Date, default: null },
  },
  { collection: "challenge_state" }
);

/* ─── ChallengeProgress (v2.7.0: ضغطات كل أخصائي في كل يوم) ───
   العدد المطلوب يتغير يومياً (أيام الشهر - رقم اليوم) لذا يُحسب
   التقدم لكل يوم على حدة بمفتاح فريد (userId + day) */
const ChallengeProgressSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    day: { type: String, required: true }, // YYYY-MM-DD بتوقيت الجزائر
    clicks: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: true }, collection: "challenge_progress" }
);
ChallengeProgressSchema.index({ userId: 1, day: 1 }, { unique: true });

/* ─── FoundersContent (صفحة المؤسسين — سجل مفرد يعدّله الأدمين) ───
   نص تعريفي ثلاثي اللغات + اسم المطوّر + قائمة الأخصائيين النفسانيين المشاركين */
const FoundersContentSchema = new Schema(
  {
    key: { type: String, default: "founders", unique: true },
    textAr: { type: String, default: "" },
    textFr: { type: String, default: "" },
    textEn: { type: String, default: "" },
    developerName: { type: String, default: "" },
    developerRole: { type: String, default: "" },
    /* قائمة الأخصائيين: [{ name, role }] — يحرّرها الأدمين حراً */
    members: { type: Array, default: [] },
  },
  { timestamps: true, collection: "founders_content" }
);

/* ─── VictimChallengeState (v2.9.0: تحدي الالتزام للعميلين — فائز واحد) ───
   الفائز الأول الذي يحترم 4 مواعيد متتالية مع المختصين بتأخير لا يتجاوز
   10 دقائق. مستند مفرد بمعرّف ثابت — الحسم ذري عبر findOneAndUpdate */
const VictimChallengeStateSchema = new Schema(
  {
    _id: { type: String, default: "victim-challenge" },
    winnerUserId: { type: String, default: null },
    winnerName: { type: String, default: null },
    wonAt: { type: Date, default: null },
  },
  { collection: "victim_challenge_state" }
);

/* ─── ChallengeConfig (v1.6.0: تحكّم الإدارة في التحديين) ───
   مستند لكل تحدي بمعرّف ثابت "counselor" أو "victim":
   • enabled: تشغيل/إيقاف فوري من لوحة الإدارة (الإيقاف يخفي نافذة التحدي للجميع)
   • durationDays: مدة الصلاحية بالأيام من لحظة التفعيل — 0 = بلا حد
   • startedAt: لحظة آخر تفعيل/إعادة تشغيل — تُقاس منها مدة الصلاحية
   • الفوز يُعطّل التحدي تلقائياً (حالة الفائز في ChallengeState/VictimChallengeState) */
const ChallengeConfigSchema = new Schema(
  {
    _id: { type: String }, // "counselor" | "victim"
    enabled: { type: Boolean, default: true },
    durationDays: { type: Number, default: 0 },
    startedAt: { type: Date, default: null },
  },
  { collection: "challenge_configs" }
);

/* ─── SocialPost (v2.12.0: منشورات المجتمع — فكرة إنستغرام داخل المنصة) ───
   الأخصائيون فقط ينشرون (نص + صورة اختيارية) — المنشور يراه كل المستخدمين،
   والإعجاب والتعليق ومتابعة الأخصائي متاحة لكل مستخدم مسجّل (عميل أو أخصائي) */
const SocialPostSchema = new Schema(
  {
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    text: { type: String, default: "", trim: true, maxlength: 3000 },
    /* الصورة base64 (data URL) — اختيارية، تُضغط في المتصفح قبل الإرسال */
    image: { type: String, default: null },
    /* معرّفات المستخدمين الذين أعجبهم المنشور (إعجاب واحد لكل مستخدم) */
    likes: { type: [Schema.Types.ObjectId], default: [] },
    /* التعليقات الكتابية — بحد أقصى 100 تعليق لكل منشور */
    comments: [
      {
        authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        text: { type: String, required: true, trim: true, maxlength: 1000 },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true, collection: "social_posts" }
);
SocialPostSchema.index({ createdAt: -1 });

/* ─── SocialFollow (v2.12.0: متابعة حسابات الأخصائيين) ───
   عميل أو أخصائي يتابع أخصائياً — العلاقة فريدة (متابعة واحدة لكل ثنائي) */
const SocialFollowSchema = new Schema(
  {
    followerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    followingId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  },
  { timestamps: true, collection: "social_follows" }
);
SocialFollowSchema.index({ followerId: 1, followingId: 1 }, { unique: true });

/* ─── CounselorRating (v2.14.0: تقييم المختص من طرف العميل 1-5 نجوم) ───
   تقييم واحد لكل (مختص + عميل + جلسة) — rateKey مفتاح فريد يمنع التكرار
   الذري. التقييم بلا جلسة يُخزَّن بمعرّف "direct". متوسط النجوم يُحسب
   لحظياً ويُحدَّث في ملف المختص (CounselorProfile.rating) بعد كل تقييم. */
const CounselorRatingSchema = new Schema(
  {
    rateKey: { type: String, required: true, unique: true },
    counselorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    victimId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sessionId: { type: String, default: null },
    stars: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: null, trim: true, maxlength: 500 },
  },
  { timestamps: true, collection: "counselor_ratings" }
);

/* ─── Exercise (v2.14.0: تمارين التهدئة — مدمجة أو يضيفها المختص/الأدمين) ───
   التمارين المدمجة تُعرَّف في الكود بـ slug ثابت، والتمارين المضافة تُخزَّن
   هنا بنص منشئها وصور توضيحية مضغوطة base64 لخطوات التنفيذ. */
const ExerciseSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: "", trim: true, maxlength: 1200 },
    /* الخطوات — كل سطر خطوة (حد أقصى 12 خطوة) */
    steps: { type: [String], default: [] },
    /* صور توضيحية base64 (data URL) — بحد 4 صور مضغوطة في المتصفح */
    images: { type: [String], default: [] },
    durationMinutes: { type: Number, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    createdByRole: { type: String, default: "COUNSELOR" }, // COUNSELOR | ADMIN
    creatorName: { type: String, default: null },
  },
  { timestamps: true, collection: "exercises" }
);
ExerciseSchema.index({ createdAt: -1 });

export const User =
  (mongoose.models.User as mongoose.Model<any>) || mongoose.model("User", UserSchema);

export const CounselorProfile =
  (mongoose.models.CounselorProfile as mongoose.Model<any>) || mongoose.model("CounselorProfile", CounselorProfileSchema);

export const SupportSession =
  (mongoose.models.SupportSession as mongoose.Model<any>) || mongoose.model("SupportSession", SupportSessionSchema);

export const Message =
  (mongoose.models.Message as mongoose.Model<any>) || mongoose.model("Message", MessageSchema);

export const PushSubscription =
  (mongoose.models.PushSubscription as mongoose.Model<any>) || mongoose.model("PushSubscription", PushSubscriptionSchema);

export const CrisisLog =
  (mongoose.models.CrisisLog as mongoose.Model<any>) || mongoose.model("CrisisLog", CrisisLogSchema);

export const InAppNotification =
  (mongoose.models.InAppNotification as mongoose.Model<any>) ||
  mongoose.model("InAppNotification", InAppNotificationSchema);

export const Feedback =
  (mongoose.models.Feedback as mongoose.Model<any>) || mongoose.model("Feedback", FeedbackSchema);

export const UpliftQuote =
  (mongoose.models.UpliftQuote as mongoose.Model<any>) || mongoose.model("UpliftQuote", UpliftQuoteSchema);

export const FoundersContent =
  (mongoose.models.FoundersContent as mongoose.Model<any>) ||
  mongoose.model("FoundersContent", FoundersContentSchema);

export const GratitudeContent =
  (mongoose.models.GratitudeContent as mongoose.Model<any>) ||
  mongoose.model("GratitudeContent", GratitudeContentSchema);

export const ChallengeState =
  (mongoose.models.ChallengeState as mongoose.Model<any>) ||
  mongoose.model("ChallengeState", ChallengeStateSchema);

export const ChallengeProgress =
  (mongoose.models.ChallengeProgress as mongoose.Model<any>) ||
  mongoose.model("ChallengeProgress", ChallengeProgressSchema);

export const VictimChallengeState =
  (mongoose.models.VictimChallengeState as mongoose.Model<any>) ||
  mongoose.model("VictimChallengeState", VictimChallengeStateSchema);

export const ChallengeConfig =
  (mongoose.models.ChallengeConfig as mongoose.Model<any>) ||
  mongoose.model("ChallengeConfig", ChallengeConfigSchema);

export const SocialPost =
  (mongoose.models.SocialPost as mongoose.Model<any>) ||
  mongoose.model("SocialPost", SocialPostSchema);

export const SocialFollow =
  (mongoose.models.SocialFollow as mongoose.Model<any>) ||
  mongoose.model("SocialFollow", SocialFollowSchema);

export const CounselorRating =
  (mongoose.models.CounselorRating as mongoose.Model<any>) ||
  mongoose.model("CounselorRating", CounselorRatingSchema);

export const Exercise =
  (mongoose.models.Exercise as mongoose.Model<any>) ||
  mongoose.model("Exercise", ExerciseSchema);

/* ═ v1.14.0: Clinic — عيادة نفسية مسجّلة في الدليل ═
   حساب مستقل (دخول عيادة) يملؤه صاحب العيادة من لوحته: الاسم، سنة الإنشاء،
   التخصصات، العنوان (ولاية/بلدية/تفصيلي)، الهواتف، التواصل الاجتماعي،
   الموقع الإلكتروني، الشعار، ساعات العمل… وتظهر للعموم في /clinic/{slug}
   مع حجز جلسات حضورية وتقييم العيادة. الحساب المعطّل (isActive=false)
   يختفي من الدليل وصفحته العامة تصبح غير متاحة. */
const ClinicSchema = new Schema(
  {
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    /* رابط الصفحة العامة: /clinic/{slug} — يُولَّد من الاسم مرة واحدة ويُحدَّث عند تغييره */
    slug: { type: String, default: null, index: true },
    /* سنة إنشاء العيادة (1950..السنة الحالية) — سنوات الخبرة تُشتق منها */
    foundedYear: { type: Number, default: null, min: 1950, max: 2100 },
    specialties: { type: [String], default: [] },
    customSpecialties: { type: [String], default: [] },
    about: { type: String, default: null, maxlength: 4000 },
    /* الموقع: ولاية (مفتاح WILAYAS) + بلدية/مدينة + عنوان تفصيلي */
    wilaya: { type: String, default: null },
    city: { type: String, default: null, trim: true, maxlength: 80 },
    address: { type: String, default: null, trim: true, maxlength: 300 },
    /* أرقام الهواتف للاتصال (رقم أو أكثر) — أرقام فقط بالصيغة الدولية 213XXXXXXXXX */
    phones: { type: [String], default: [] },
    /* واتساب العيادة — زر التواصل المباشر في صفحتها وفي اقتراح المختص */
    whatsapp: { type: String, default: null, trim: true },
    contactEmail: { type: String, default: null, trim: true, lowercase: true },
    website: { type: String, default: null, trim: true, maxlength: 300 },
    socials: {
      facebook: { type: String, default: null, trim: true },
      instagram: { type: String, default: null, trim: true },
      tiktok: { type: String, default: null, trim: true },
    },
    /* شعار العيادة base64 (data URL) — يُقدَّم عبر /api/clinics/{id}/logo */
    logo: { type: String, default: null },
    /* ساعات العمل + ملاحظة الأسعار + مرجع ترخيص (تفاصيل مهمة لكل عيادة) */
    workingHours: { type: String, default: null, trim: true, maxlength: 400 },
    priceNote: { type: String, default: null, trim: true, maxlength: 400 },
    licenseNumber: { type: String, default: null, trim: true, maxlength: 80 },
    /* تعطيل من الإدارة — يخفي العيادة من الدليل ويعطّل صفحتها وحجزها */
    isActive: { type: Boolean, default: true },
    /* التقييم: متوسط النجوم + عدد المقيّمين + عدد الحجوزات المكتملة */
    rating: { type: Number, default: 5.0 },
    ratingsCount: { type: Number, default: 0 },
    bookingsCount: { type: Number, default: 0 },

    /* ══ v1.15.0 ══ */
    /* هل يوجد شعار؟ — يُحفظ كحقل فعلي لأن الاستعلامات التي تستبعد
       الحقل الثقيل (logo) لا تستطيع اشتقاقه منها (علّة ظهور الشعار في الدليل) */
    hasLogo: { type: Boolean, default: false },
    /* مواعيد الحجز التي تحددها العيادة بنفسها (HH:MM) — تظهر للعميل
       في نافذة الحجز الحضوري؛ فارغة = المواعيد الافتراضية للمنصة */
    slots: { type: [String], default: [] },
    /* معرض صور العيادة — حتى 8 صور (data URLs مصغّرة من لوحتها) */
    gallery: { type: [String], default: [] },
    /* موقع العيادة على الخريطة — يحدده صاحبها بدقة من لوحته (GPS)
       وزر «الموقع على الخريطة» في صفحتها يفتح Google Maps للتوجيه */
    location: {
      lat: { type: Number, default: null, min: -90, max: 90 },
      lng: { type: Number, default: null, min: -180, max: 180 },
      _id: false,
    },

    /* ══ v1.16.0 ══ */
    /* سعر الجلسة الحضورية بالدينار (DZD) — يحدده صاحب العيادة ويظهر في
       بطاقة الدليل وصفحة العيادة ونافذة الحجز؛ null = لم يحدّد سعراً بعد
       v1.18.0: EUR/USD صارا سعرين مستقلين تحددهما العيادة نفسها (اختياري)
       — لا يوجد أي تحويل عملات في المنصة، ومن لم يحدّد سعر عملة لا يُعرض
       له الزائر بعملته شيئاً ويكفيه السعر الرسمي بالدينار */
    sessionPrice: { type: Number, default: null, min: 0, max: 10000000 },
    priceEur: { type: Number, default: null, min: 0, max: 100000 },
    priceUsd: { type: Number, default: null, min: 0, max: 100000 },
    /* باقات الجلسات الحضورية (Packs) — يصوغها صاحب العيادة بحرية:
       اسم الباقة + عدد الجلسات + سعرها + ملاحظة اختيارية */
    packs: {
      type: [
        {
          name: { type: String, required: true, trim: true, maxlength: 80 },
          sessions: { type: Number, required: true, min: 1, max: 200 },
          price: { type: Number, required: true, min: 0, max: 100000000 },
          /* v1.19.0: سعران اختياريان تحددهما العيادة نفسها — يظهران بجانب الدينار */
          priceEur: { type: Number, default: null, min: 0, max: 100000 },
          priceUsd: { type: Number, default: null, min: 0, max: 100000 },
          note: { type: String, default: null, trim: true, maxlength: 200 },
          _id: false,
        },
      ],
      default: [],
      validate: {
        validator: (v: unknown[]) => Array.isArray(v) && v.length <= 12,
        message: "MAX_12_PACKS",
      },
    },
    /* ═ v1.18.0: فيديوهات المعرض — مراجع GridFS بلا حد للحجم ═
       كل عنصر «/api/media/{fileId}» — يُرفع عبر /api/media بتقطيع chunks
       ثم يُجمَّع في GridFS (bucket «media»). الفيديوهات القديمة (data URLs
       في مجموعة clinic_gallery_media) تُرحَّل تلقائياً إلى GridFS عند أول
       حفظ للفيديوهات من لوحة العيادة. فيديو أو اثنان لكل عيادة. */
    galleryVideoRefs: { type: [String], default: [] },
  },
  { timestamps: true, collection: "clinics" }
);

/* ═ v1.14.0: ClinicAd — إعلان عيادة (لا يُنشر قبل موافقة الإدارة) ═
   العيادة تصيغ إعلانها من لوحتها، فيبقى «بانتظار المراجعة» حتى يؤكّد
   الأدمين نشره بعد التواصل مع العيادة والتأكد من سداد مستحقات الإعلان —
   عندها فقط يظهر في صفحة الإعلانات العمومية. الرفض يصل للعيادة بسببه. */
const ClinicAdSchema = new Schema(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: "Clinic", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, required: true, trim: true, maxlength: 1200 },
    /* صورة الإعلان base64 (data URL) — اختيارية (توافق قديم — الجديد في media) */
    image: { type: String, default: null },

    /* ══ v1.15.0 ══ */
    /* وسائط الإعلان: حتى 5 صور + فيديو واحد (data URLs) — تُعرض
       بنافذة سحب يمين/يسار في صفحة الإعلانات والإعلان العائم */
    media: {
      type: [{ type: String }],
      default: [],
      validate: {
        validator: (v: unknown[]) => Array.isArray(v) && v.length <= 6,
        message: "MAX_6_MEDIA",
      },
    },
    /* الإعلان العائم: يظهر تلقائياً في صفحات المنصة للعملاء والمختصين
       (لا يظهر للعيادات الأخرى ولا لمن رفض الإعلانات من إعداداته) */
    float: { type: Boolean, default: false },
    /* كم مرة يظهر الإعلان العائم لكل مستخدم (حد يمنع الإزعاج) */
    floatPerUser: { type: Number, default: 3, min: 1, max: 20 },
    /* مدة صلاحية العرض بالأيام من لحظة النشر — بعدها يختفي تلقائياً */
    floatDays: { type: Number, default: 7, min: 1, max: 365 },
    /* ينتهي عند: يُحسب عند الموافقة = reviewedAt + floatDays */
    expiresAt: { type: Date, default: null, index: true },
    /* مستحقات الإعلان: يحدّدها الأدمين وتُدار سدادها مع الإدارة —
       بيانات سرّية بين العيادة والإدارة ولا تُرسَل للعموم أبداً */
    amountDue: { type: Number, default: 0, min: 0 },
    paid: { type: Boolean, default: false },
    paidAt: { type: Date, default: null },
    /* تفاعلات الجمهور: مشاهدات فريدة + إعجابات + تعليقات (مع حجب ورد) */
    views: { type: Number, default: 0 },
    viewers: { type: [Schema.Types.ObjectId], default: [] },
    likes: { type: [Schema.Types.ObjectId], default: [] },
    comments: {
      type: [
        {
          userId: { type: Schema.Types.ObjectId, ref: "User" },
          name: { type: String, default: "—", maxlength: 80 },
          text: { type: String, required: true, maxlength: 300 },
          /* حجب التعليق من صاحب العيادة — يختفي من العرض العمومي */
          hidden: { type: Boolean, default: false },
          /* رد العيادة على التعليق */
          reply: {
            text: { type: String, default: null, maxlength: 300 },
            at: { type: Date, default: null },
            _id: false,
          },
          createdAt: { type: Date, default: Date.now },
          _id: false,
        },
      ],
      default: [],
    },
    /* عدّاد مرات الظهور لكل مستخدم (حد الإزعاج للإعلان العائم) */
    impressions: {
      type: [{ userId: { type: Schema.Types.ObjectId }, count: { type: Number, default: 0 } }],
      default: [],
      _id: false,
    },
    /* PENDING = بانتظار مراجعة الإدارة | APPROVED = منشور | REJECTED = مرفوض */
    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING", index: true },
    /* مرجع سداد مستحقات الإعلان الذي أكده الأدمين عند الموافقة */
    paymentNote: { type: String, default: null, trim: true, maxlength: 200 },
    /* سبب الرفض / ملاحظة الإدارة — يصل لصاحب العيادة */
    adminNote: { type: String, default: null, trim: true, maxlength: 400 },
    reviewedBy: { type: String, default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "clinic_ads" }
);
ClinicAdSchema.index({ status: 1, reviewedAt: -1 });
ClinicAdSchema.index({ clinicId: 1, createdAt: -1 });

/* ═ v1.14.0: ClinicBooking — حجز جلسة حضورية في العيادة ═
   العميل (بحساب VICTIM) يحجز موعداً حضورياً من صفحة العيادة: تاريخ + ساعة
   + اسم + هاتف + سبب مختصر. العيادة تدير الحجوزات من لوحتها (تأكيد/إلغاء/
   إتمام) ويصل العميل إشعار فوري عند كل تغيير حالة. موعد واحد لكل
   (عيادة + تاريخ + ساعة) يمنع التصادم ذرياً بفهرس فريد جزئي. */
const ClinicBookingSchema = new Schema(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: "Clinic", required: true, index: true },
    clientUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    /* نسخة اسم وهاتف العميل لحظة الحجز — تُعرض للعيادة حصراً */
    clientName: { type: String, required: true, trim: true, maxlength: 120 },
    clientPhone: { type: String, required: true, trim: true, maxlength: 20 },
    date: { type: String, required: true }, /* YYYY-MM-DD */
    slot: { type: String, required: true }, /* HH:MM من SLOT_TIMES */
    reason: { type: String, default: null, trim: true, maxlength: 600 },
    status: {
      type: String,
      enum: ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"],
      default: "PENDING",
      index: true,
    },
    /* من ألغى: CLIENT | CLINIC — مع ملاحظة العيادة التي تصل للعميل */
    cancelledBy: { type: String, default: null },
    clinicNote: { type: String, default: null, trim: true, maxlength: 400 },
    /* ═ v1.17.0: الباقة المختارة عند الحجز (اختياري) ═
       نسخة لحظة الحجز من باقة العيادة: الاسم + عدد الجلسات + السعر بالدينار
       — يختارها العميل من نافذة الحجز وتظهر للعيادة في بطاقة الحجز */
    packName: { type: String, default: null, trim: true, maxlength: 80 },
    packSessions: { type: Number, default: null, min: 1, max: 200 },
    packPrice: { type: Number, default: null, min: 0, max: 100000000 },
  },
  { timestamps: true, collection: "clinic_bookings" }
);
ClinicBookingSchema.index({ clinicId: 1, date: 1, slot: 1 });
ClinicBookingSchema.index({ clientUserId: 1, createdAt: -1 });

/* ═ v1.18.0: MediaUpload + MediaChunk — رفع الفيديوهات الكبيرة بتقطيع ═
   الفيديو بلا حد للحجم لا يمكن أن يمرّ طلباً واحداً (حدود الجسم والذاكرة)،
   لذا يُرفع على دفعات ~3.5MB: جلسة رفع في media_uploads وكل دفعة وثيقة
   في media_chunks، وعند الاكتمال تُجمَّع الدفعات في GridFS (bucket «media»)
   وتُحذف الجلسة ودفعاتها. الجلسات المهجورة تنتهي تلقائياً بعد 24 ساعة. */
const MediaUploadSchema = new Schema(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: "Clinic", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    mime: { type: String, default: "video/mp4" },
    name: { type: String, default: "", maxlength: 200 },
    size: { type: Number, default: 0, min: 0 },
    chunkSize: { type: Number, default: 3_500_000 },
    received: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now, expires: "24h" },
  },
  { collection: "media_uploads" }
);

const MediaChunkSchema = new Schema(
  {
    uploadId: { type: Schema.Types.ObjectId, required: true, index: true },
    idx: { type: Number, required: true, min: 0 },
    data: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: "24h" },
  },
  { collection: "media_chunks" }
);
MediaChunkSchema.index({ uploadId: 1, idx: 1 }, { unique: true });

/* ═ v1.17.0: ClinicGalleryMedia — فيديوهات معرض العيادة ═
   الفيديو كبير الحجم على حد BSON، لذا يُخزَّن في مجموعة مستقلة عن وثيقة
   العيادة (فيديو أو اثنان لكل عيادة) — يُقدَّم عبر المسار
   /api/clinics/{id}/gallery/media/{idx} بدعم Range لتمرير المشغّل،
   ويُستبدل دفعة واحدة حين تعدّل العيادة فيديوهات معرضها من لوحتها.
   v1.18.0: صارت مرجعاً قديماً — الجديد يُخزَّن في GridFS عبر /api/media،
   والمجموعة تبقى لقراءة فيديوهات ما قبل الترحيل حتى أول حفظ جديد. */
const ClinicGalleryMediaSchema = new Schema(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: "Clinic", required: true, index: true },
    mime: { type: String, required: true },
    data: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "clinic_gallery_media" }
);

/* ═ v1.14.0: ClinicSuggestion — اقتراح عيادة من المختص للعميل في غرفة الجلسة ═
   يُنشأ لحظة ضغط المختص «اقترح هذه العيادة» — يصل للعميل إشعار فوري بكامل
   تفاصيل العيادة يوجهه لصفحتها، ويُعرض أيضاً في شريط «العيادات المقترحة»
   داخل غرفة الجلسة. اقتراح واحد لكل (جلسة × عيادة) بلا تكرار. */
const ClinicSuggestionSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: "SupportSession", required: true, index: true },
    clinicId: { type: Schema.Types.ObjectId, ref: "Clinic", required: true },
    counselorUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    clientUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    /* ملاحظة المختص المرفقة بالاقتراح (لماذا تقترح هذه العيادة) */
    note: { type: String, default: null, trim: true, maxlength: 400 },
  },
  { timestamps: true, collection: "clinic_suggestions" }
);
ClinicSuggestionSchema.index({ sessionId: 1, clinicId: 1 }, { unique: true });

/* ═ v1.14.0: ClinicRating — تقييم العيادة من العميل (1–5 نجوم) ═
   تقييم واحد لكل (عميل × عيادة) — إعادة الإرسال تُحدّث النجوم،
   والمتوسط يُحدَّث لحظياً في ملف العيادة. */
const ClinicRatingSchema = new Schema(
  {
    rateKey: { type: String, required: true, unique: true },
    clinicId: { type: Schema.Types.ObjectId, ref: "Clinic", required: true, index: true },
    clientUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    stars: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: null, trim: true, maxlength: 500 },
  },
  { timestamps: true, collection: "clinic_ratings" }
);

export const TherapyContract =
  (mongoose.models.TherapyContract as mongoose.Model<any>) ||
  mongoose.model("TherapyContract", TherapyContractSchema);

/* v1.12.0: عقد المنصة الواحد — تديره الإدارة حصراً */
export const PlatformContract =
  (mongoose.models.PlatformContract as mongoose.Model<any>) ||
  mongoose.model("PlatformContract", PlatformContractSchema);

/* v1.10.0: عدّاد أرقام العقود الذرّي */
export const ContractCounter =
  (mongoose.models.ContractCounter as mongoose.Model<any>) ||
  mongoose.model("ContractCounter", ContractCounterSchema);

/* v1.14.0: منظومة العيادات النفسية */
export const Clinic =
  (mongoose.models.Clinic as mongoose.Model<any>) || mongoose.model("Clinic", ClinicSchema);

export const ClinicAd =
  (mongoose.models.ClinicAd as mongoose.Model<any>) || mongoose.model("ClinicAd", ClinicAdSchema);

export const ClinicBooking =
  (mongoose.models.ClinicBooking as mongoose.Model<any>) ||
  mongoose.model("ClinicBooking", ClinicBookingSchema);

export const ClinicRating =
  (mongoose.models.ClinicRating as mongoose.Model<any>) ||
  mongoose.model("ClinicRating", ClinicRatingSchema);

export const ClinicSuggestion =
  (mongoose.models.ClinicSuggestion as mongoose.Model<any>) ||
  mongoose.model("ClinicSuggestion", ClinicSuggestionSchema);

/* v1.17.0: فيديوهات معرض العيادة */
export const ClinicGalleryMedia =
  (mongoose.models.ClinicGalleryMedia as mongoose.Model<any>) ||
  mongoose.model("ClinicGalleryMedia", ClinicGalleryMediaSchema);

/* v1.18.0: جلسات ودفعات رفع الفيديو الكبير */
export const MediaUpload =
  (mongoose.models.MediaUpload as mongoose.Model<any>) ||
  mongoose.model("MediaUpload", MediaUploadSchema);

export const MediaChunk =
  (mongoose.models.MediaChunk as mongoose.Model<any>) ||
  mongoose.model("MediaChunk", MediaChunkSchema);


/* ═ v1.19.0 — الدورات الأونلاين ═
   الأخصائي ينشئ دورة في موضوع يختاره مقابل مبلغ وعدد مقاعد يحددهما.
   عدد المقاعد المشغولة = الملتحقون بحالة pending أو confirmed (يُحسب
   لحظياً من مجموعة التسجيلات — بلا عدّاد مخزّن ينجرف). */
const CourseSchema = new Schema(
  {
    specialistId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, default: "", trim: true, maxlength: 2000 },
    price: { type: Number, required: true, min: 0, max: 100000000 },
    capacity: { type: Number, required: true, min: 1, max: 10000 },
    startsAt: { type: Date, default: null },
    status: { type: String, enum: ["open", "closed"], default: "open", index: true },
  },
  { timestamps: true }
);

/* تسجيل مقعد في دورة — الحجز يبدأ pending ويحرر مقعده عند الرفض/الإلغاء */
const CourseEnrollmentSchema = new Schema(
  {
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    clientId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    clientName: { type: String, default: null, trim: true, maxlength: 80 },
    /* v1.21.0: contact details the registrant leaves at booking time —
       shown to the course owner only, via the registrants list popup */
    contactPhone: { type: String, default: null, trim: true, maxlength: 40 },
    contactEmail: { type: String, default: null, trim: true, maxlength: 160 },
    contactNote: { type: String, default: null, trim: true, maxlength: 500 },
    price: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ["pending", "confirmed", "rejected", "cancelled"], default: "pending", index: true },
    rejectReason: { type: String, default: null, trim: true, maxlength: 300 },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
CourseEnrollmentSchema.index({ courseId: 1, clientId: 1 });


/* v1.19.0: الدورات الأونلاين */
export const Course =
  (mongoose.models.Course as mongoose.Model<any>) ||
  mongoose.model("Course", CourseSchema);

export const CourseEnrollment =
  (mongoose.models.CourseEnrollment as mongoose.Model<any>) ||
  mongoose.model("CourseEnrollment", CourseEnrollmentSchema);

/* أنواع مساعدة خفيفة */
export type UserDoc = mongoose.InferSchemaType<typeof UserSchema>;
export type CounselorProfileDoc = mongoose.InferSchemaType<typeof CounselorProfileSchema>;
export type SupportSessionDoc = mongoose.InferSchemaType<typeof SupportSessionSchema>;
export type MessageDoc = mongoose.InferSchemaType<typeof MessageSchema>;
