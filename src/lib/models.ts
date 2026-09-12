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
      enum: ["VICTIM", "COUNSELOR", "ADMIN"],
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

/* ═ v1.9.0: TherapyContract — العقد العلاجي المستقل لكل (أخصائي × عميل) ═
   يُنشأ عند قبول الأخصائي لجلسة العميل (إن لم يوجد) وللقطة نص القالب
   وإمضاء الأخصائي لحظة الإنشاء — فبقاؤه ثابتاً ولو عدّل الأخصائي قالبَه
   لاحقاً (حماية الطرفين: ما تم ضيّعه لا يتغير خلف ظهورهم). ثم يمضيه
   العميل من نافذة منبثقة إلزامية فتحفظ النسخة الموقّعة من الطرفين. */
const TherapyContractSchema = new Schema(
  {
    counselorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    clientUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    /* الجلسة التي ولّدت العقد / آخر جلسة مرتبطة به */
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
  },
  { timestamps: true, collection: "therapy_contracts" }
);
/* عقد واحد فقط لكل زوج (أخصائي × عميل) */
TherapyContractSchema.index({ counselorId: 1, clientUserId: 1 }, { unique: true });

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

export const TherapyContract =
  (mongoose.models.TherapyContract as mongoose.Model<any>) ||
  mongoose.model("TherapyContract", TherapyContractSchema);

/* أنواع مساعدة خفيفة */
export type UserDoc = mongoose.InferSchemaType<typeof UserSchema>;
export type CounselorProfileDoc = mongoose.InferSchemaType<typeof CounselorProfileSchema>;
export type SupportSessionDoc = mongoose.InferSchemaType<typeof SupportSessionSchema>;
export type MessageDoc = mongoose.InferSchemaType<typeof MessageSchema>;
