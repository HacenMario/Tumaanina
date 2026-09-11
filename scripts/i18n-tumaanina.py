# -*- coding: utf-8 -*-
"""
i18n طمأنينة v1.0.0 — تحويل قواميس رفيقي النفسي إلى النسخة التجارية
- حذف مفاتيح الحرائق/التوثيق/المجانية
- استبدال المفردات (متضرر→عميل، حريق→أزمة، مجاني→آمن...)
- إعادة كتابة صريحة لمفاتيح الهوية والهبوط والشهادة
- إضافة مفاتيح المحفظة والدفع في الست لغات
"""
import re, sys, io

DICTS = {
    "ar": {"file": "src/lib/i18n/ar.ts"},
    "fr": {"file": "src/lib/i18n/fr.ts"},
    "en": {"file": "src/lib/i18n/en.ts"},
    "tr": {"file": "src/lib/i18n/tr.ts"},
    "ru": {"file": "src/lib/i18n/ru.ts"},
    "zh": {"file": "src/lib/i18n/zh.ts"},
}

# مفاتيح تُحذف نهائياً (ميزة أُزيلت أو مُستبدلت)
DELETE_KEYS = {
    # إثبات التضرر من الحرائق
    "fireTitle", "fireDesc", "fireYes", "fireNo", "fireCommune", "fireCommunePlaceholder",
    "fireDate", "fireDatePlaceholder", "fireDescLabel", "fireDescPlaceholder",
    "fireNote", "fireRequired", "firePendingBanner", "fireRejectedBanner",
    # تبويب توثيق المتضررين (يبقى vvContact لأنه يُستعمل في المدفوعات)
    "vvTitle", "vvDesc", "vvCommune", "vvDate", "vvDescLabel", "vvApprove", "vvReject",
    "vvApprovedOk", "vvRejectedOk", "vvEmpty", "vvNotDeclared", "vvNotDeclaredDesc", "vvReviewedBadge",
    # شارات توثيق العملاء + بطاقة الإحصاء
    "victimVerifiedBadge", "victimPendingBadge", "victimRejectedBadge", "dashFirePending",
    # مواضيع/تخصصات مرتبطة بالكوارث
    "homeLoss", "safety", "childSupport", "helperBurnout", "mediaTrauma", "displacementSupport", "ptsd",
}

# مفاتيح تُكتب قيمها صراحة — (القسم, المفتاح) → قيمة جديدة لكل لغة
EXPLICIT = {
    "common": {
        "appName": {"ar": "طمأنينة", "fr": "Tumaanina", "en": "Tumaanina", "tr": "Tumaanina", "ru": "Tumaanina", "zh": "Tumaanina"},
        "brandSub": {
            "ar": "استشارات نفسية احترافية عبر الإنترنت — بخصوصية تامة",
            "fr": "Consultations psychologiques professionnelles en ligne — en toute confidentialité",
            "en": "Professional online psychological consultations — fully confidential",
            "tr": "Çevrimiçi profesyonel psikolojik danışmanlık — tam gizlilikle",
            "ru": "Профессиональные онлайн-психологические консультации — полная конфиденциальность",
            "zh": "专业在线心理咨询——完全私密",
        },
    },
    "landing": {
        "badge": {
            "ar": "استشارات نفسية احترافية عبر الإنترنت مع أخصائيين موثّقين",
            "fr": "Consultations psychologiques en ligne avec des professionnels vérifiés",
            "en": "Online psychological consultations with verified professionals",
            "tr": "Doğrulanmış uzmanlarla çevrimiçi psikolojik danışmanlık",
            "ru": "Онлайн-консультации с проверенными специалистами",
            "zh": "与认证专家在线心理咨询",
        },
        "heroTitle1": {
            "ar": "ما تمرّ به ليس سهلاً…", "fr": "Ce que vous traversez n'est pas facile…",
            "en": "What you're going through isn't easy…", "tr": "Yaşadıklarınız kolay değil…",
            "ru": "То, что вы переживаете, непросто…", "zh": "你所经历的一切并不轻松……",
        },
        "heroTitle2": {
            "ar": "لا تحمل همّك وحدك", "fr": "Ne portez pas ce poids seul",
            "en": "You don't have to carry it alone", "tr": "Bu yükü tek başına taşmayın",
            "ru": "Не несите этот груз в одиночку", "zh": "你不必独自承受",
        },
        "heroSubtitle": {
            "ar": "منصة تجمعك بأخصائيين نفسيين مرخّصين في جلسات مدفوعة آمنة، عبر محادثة نصية أو صوتية أو مرئية — حجز فوري، محفظة سهلة، وسرّية تامة.",
            "fr": "Une plateforme qui vous met en relation avec des psychologues diplômés pour des séances sécurisées et payantes — texte, voix ou vidéo — réservation instantanée, portefeuille simple, confidentialité totale.",
            "en": "A platform connecting you with licensed psychologists in secure paid sessions — text, voice or video — instant booking, easy wallet, full confidentiality.",
            "tr": "Lisanslı psikologlarla güvenli ücretli seanslar sunan platform — metin, ses veya video — anında rezervasyon, kolay cüzdan, tam gizlilik.",
            "ru": "Платформа, соединяющая вас с дипломированными психологами в безопасных платных сессиях — текст, голос или видео — мгновенное бронирование, удобный кошелёк, полная конфиденциальность.",
            "zh": "平台将您与持证心理咨询师连接，提供安全的付费会话——文字、语音或视频——即时预约，便捷钱包，完全私密。",
        },
        "ctaSecondary": {
            "ar": "أنا أخصائي نفسي — انضم إلينا", "fr": "Je suis psychologue — rejoignez-nous",
            "en": "I'm a psychologist — join us", "tr": "Ben psikologum — bize katılın",
            "ru": "Я психолог — присоединяйтесь", "zh": "我是心理咨询师——加入我们",
        },
        "trustFree": {
            "ar": "دفع آمن 100%", "fr": "Paiement 100% sécurisé", "en": "100% secure payment",
            "tr": "%100 güvenli ödeme", "ru": "100% безопасная оплата", "zh": "100% 安全支付",
        },
        "statsVictims": {
            "ar": "عميل مسجّل", "fr": "Clients inscrits", "en": "Registered clients",
            "tr": "Kayıtlı danışan", "ru": "Зарегистрированных клиентов", "zh": "注册用户",
        },
        "featuresTitle": {
            "ar": "لماذا طمأنينة؟", "fr": "Pourquoi Tumaanina ?", "en": "Why Tumaanina?",
            "tr": "Neden Tumaanina?", "ru": "Почему Tumaanina?", "zh": "为什么选择 Tumaanina？",
        },
        "finalText": {
            "ar": "خطوة واحدة تفصلك عن راحة البال — احجز جلستك الأولى اليوم.",
            "fr": "À un pas de votre sérénité — réservez votre première séance aujourd'hui.",
            "en": "One step away from peace of mind — book your first session today.",
            "tr": "Huzura bir adım kaldı — ilk seansınızı bugün ayırtın.",
            "ru": "Один шаг до душевного спокойствия — запишитесь на первую сессию сегодня.",
            "zh": "距内心安宁只有一步之遥——今天就预约您的第一次会话。",
        },
        "finalCta": {
            "ar": "احجز جلستك الأولى الآن", "fr": "Réservez votre première séance",
            "en": "Book your first session now", "tr": "İlk seansınızı ayırtın",
            "ru": "Запишитесь на первую сессию", "zh": "立即预约您的首次会话",
        },
    },
    "roles": {
        "victimTitle": {
            "ar": "أنا عميل", "fr": "Je suis client", "en": "I'm a client",
            "tr": "Ben danışanım", "ru": "Я клиент", "zh": "我是来访者",
        },
        "victimDesc": {
            "ar": "أبحث عن استشارة نفسية محترفة — تسجيل سريع وحساب دائم باسم مستعار",
            "fr": "Je cherche une consultation psychologique professionnelle — inscription rapide et compte permanent sous pseudonyme",
            "en": "I'm looking for professional psychological consultation — quick signup with a permanent pseudonym account",
            "tr": "Profesyonel psikolojik danışmanlık arıyorum — hızlı kayıt ve takma adla kalıcı hesap",
            "ru": "Ищу профессиональную психологическую консультацию — быстрая регистрация и постоянный аккаунт под псевдонимом",
            "zh": "我在寻找专业心理咨询——快速注册，化名账户永久有效",
        },
        "counselorDesc": {
            "ar": "قدّم استشارات مدفوعة بأرباح تُحوّل لك — انضم بعد التحقق من شهادتك",
            "fr": "Offrez des consultations rémunérées avec des gains reversés — rejoignez-nous après vérification de votre diplôme",
            "en": "Provide paid consultations with earnings paid out to you — join after your diploma is verified",
            "tr": "Kazançları size aktarılan ücretli danışmanlık sunun — diplomınız doğrulandıktan sonra katılın",
            "ru": "Проводите платные консультации с выплатой заработка — присоединяйтесь после проверки диплома",
            "zh": "提供付费咨询，收益转给您——文凭验证通过后加入",
        },
    },
    "victim": {
        "findDesc": {
            "ar": "أخصائيون موثّقون من الإدارة — اختر من يناسبك بلغته وتخصصه وسعره",
            "fr": "Des professionnels vérifiés par l'administration — choisissez celui qui vous convient par langue, spécialité et tarif",
            "en": "Professionals verified by the administration — choose by language, specialty and price",
            "tr": "Yönetim tarafından doğrulanmış uzmanlar — dil, uzmanlık ve fiyata göre seçin",
            "ru": "Специалисты, проверенные администрацией — выбирайте по языку, специализации и цене",
            "zh": "经平台认证的专业人士——按语言、专长和价格选择",
        },
        "startDesc": {
            "ar": "لن نطلب منك اسمك أبداً. اختر اسماً مستعاراً يعجبك — وابدأ حجز جلستك الأولى مباشرة.",
            "fr": "Nous ne vous demanderons jamais votre nom. Choisissez un pseudonyme qui vous plaît — et réservez votre première séance directement.",
            "en": "We never ask for your real name. Pick a pseudonym you like — and book your first session right away.",
            "tr": "Gerçek adınızı asla istemiyoruz. Size uygun bir takma ad seçin — ve ilk seansınızı hemen ayırtın.",
            "ru": "Мы никогда не спрашиваем ваше настоящее имя. Выберите псевдоним — и сразу записывайтесь на первую сессию.",
            "zh": "我们绝不询问您的真实姓名。选一个您喜欢的化名——直接预约您的首次会话。",
        },
    },
    "info": {
        "aboutTitle": {
            "ar": "عن طمأنينة", "fr": "À propos de Tumaanina", "en": "About Tumaanina",
            "tr": "Tumaanina hakkında", "ru": "О Tumaanina", "zh": "关于 Tumaanina",
        },
        "aboutP1": {
            "ar": "وُلدت طمأنينة من قناعة بسيطة: الصحة النفسية حق للجميع، والحصول على مختص مؤهَّل يجب أن يكون سهلاً وآمناً ومتاحاً في أي وقت — دون انتظار طويل ودون وصمة عار.",
            "fr": "Tumaanina est née d'une conviction simple : la santé mentale est un droit pour tous, et consulter un professionnel qualifié doit être simple, sûr et disponible à tout moment — sans longue attente ni stigmatisation.",
            "en": "Tumaanina was born from a simple conviction: mental health is a right for everyone, and access to a qualified professional should be easy, safe and available anytime — without long waits or stigma.",
            "tr": "Tumaanina basit bir inançla doğdu: ruh sağlığı herkesin hakkıdır ve nitelikli bir uzmana ulaşmak kolay, güvenli ve her an erişilebilir olmalıdır — uzun bekleme ve damgalanma olmadan.",
            "ru": "Tumaanina родилась из простого убеждения: психическое здоровье — право каждого, а доступ к квалифицированному специалисту должен быть простым, безопасным и доступным в любое время — без долгих ожиданий и стигмы.",
            "zh": "Tumaanina 源于一个朴素的信念：心理健康是每个人的权利，获得合格专业帮助应当简单、安全、随时可得——无需漫长等待，没有病耻感。",
        },
        "aboutP2": {
            "ar": "الجسد يُعالج في العيادات، أما الروح فتحتاج من تسمعها. لذلك بنينا جسراً آمناً يربطك بأخصائيين نفسيين موثّقين — عبر محادثة نصية أو صوتية أو مرئية، بأسعار عادلة ومحفظة سهلة وسرّية تامة.",
            "fr": "Le corps se soigne en clinique, mais l'âme a besoin d'être écoutée. Nous avons donc bâti un pont sûr vers des psychologues vérifiés — par texte, voix ou vidéo, à prix justes, avec un portefeuille simple et une confidentialité totale.",
            "en": "The body is treated in clinics, but the soul needs to be heard. So we built a safe bridge to verified psychologists — via text, voice or video, at fair prices, with an easy wallet and full confidentiality.",
            "tr": "Vücut kliniklerde tedavi edilir ama ruh dinlenilmeyi bekler. Bu yüzden doğrulanmış psikologlara güvenli bir köprü kurduk — metin, ses veya videoyla, adil fiyatlarla, kolay cüzdan ve tam gizlilikle.",
            "ru": "Тело лечат в клиниках, а душе нужно, чтобы её выслушали. Поэтому мы построили безопасный мост к проверенным психологам — текст, голос или видео, по справедливым ценам, с удобным кошельком и полной конфиденциальностью.",
            "zh": "身体在诊所治疗，而心灵需要被倾听。因此我们搭建了一座通往认证心理咨询师的安全桥梁——文字、语音或视频，价格公道，钱包便捷，完全私密。",
        },
        "aboutP3": {
            "ar": "كل أخصائي على المنصة يخضع لمراجعة شهادته وترخيصه من فريق الإدارة قبل ظهوره — ثقتك تستحق ذلك، وخصوصيتك خط أحمر.",
            "fr": "Chaque professionnel de la plateforme voit son diplôme et son autorisation vérifiés par l'équipe d'administration avant d'apparaître — votre confiance le mérite, et votre vie privée est une ligne rouge.",
            "en": "Every professional on the platform has their diploma and license reviewed by the administration team before appearing — your trust deserves it, and your privacy is a red line.",
            "tr": "Platformdaki her uzman, görünmeden önce diploması ve ruhsatı yönetim ekibi tarafından incelenir — güveninizi hak eder, gizliliğiniz kırmızı çizgimizdir.",
            "ru": "Каждый специалист платформы проходит проверку диплома и лицензии командой администрации перед публикацией — ваше доверие этого достойно, а приватность — наш красная линия.",
            "zh": "平台上的每位专业人士在上线前都由管理团队审核文凭与执照——您的信任值得如此，隐私是我们的红线。",
        },
        "missionText": {
            "ar": "أن يجد كل من يحتاج إلى استشارة نفسية أذناً مطيّعة وقلباً مختصاً خلال 24 ساعة من طلبه.",
            "fr": "Que toute personne cherchant une consultation trouve une oreille attentive et un cœur professionnel dans les 24 heures.",
            "en": "That anyone seeking a consultation finds an attentive ear and a professional heart within 24 hours.",
            "tr": "Danışmanlık arayan herkes 24 saat içinde duyan bir kulak ve profesyonel bir yürek bulsun.",
            "ru": "Чтобы каждый, кому нужна консультация, находил внимательное ухо и профессиональное сердце в течение 24 часов.",
            "zh": "让每一位寻求咨询的人在24小时内找到愿意倾听的专业之心。",
        },
        "visionText": {
            "ar": "مرجعك الأول للاستشارة النفسية عبر الإنترنت — جلسات آمنة وموثوقة في أي وقت.",
            "fr": "Votre référence de la consultation psychologique en ligne — des séances sûres et fiables à tout moment.",
            "en": "Your first reference for online psychological consultation — safe and reliable sessions anytime.",
            "tr": "Çevrimiçi psikolojik danışmanlıkta ilk referansınız — her an güvenli ve güvenilir seanslar.",
            "ru": "Ваш главный ориентир в онлайн-психологической консультации — безопасные и надёжные сессии в любое время.",
            "zh": "您在线心理咨询的首选——随时提供安全可靠的会话。",
        },
        "value3": {
            "ar": "محفظة سهلة ودفع آمن", "fr": "Portefeuille simple et paiement sécurisé",
            "en": "Easy wallet and secure payment", "tr": "Kolay cüzdan ve güvenli ödeme",
            "ru": "Удобный кошелёк и безопасная оплата", "zh": "便捷钱包与安全支付",
        },
        "termsP4": {
            "ar": "الجلسات مدفوعة مسبقاً عبر المحفظة الداخلية — تُسترد أموالك تلقائياً لأي جلسة ملغاة، وتُخصم عمولة المنصة (20%) من نصيب الأخصائي بعد اكتمال الجلسة.",
            "fr": "Les séances sont payées d'avance via le portefeuille interne — vos fonds sont remboursés automatiquement pour toute séance annulée, et la commission de la plateforme (20%) est déduite de la part du professionnel après chaque séance terminée.",
            "en": "Sessions are prepaid via the internal wallet — your funds are automatically refunded for any cancelled session, and the platform fee (20%) is deducted from the professional's share after each completed session.",
            "tr": "Seanslar dahili cüzdandan ön ödemeli yapılır — iptal edilen her seans için ücretiniz otomatik iade edilir ve tamamlanan her seans sonrası platform komisyonu (%20) uzmanın payından düşülür.",
            "ru": "Сессии оплачиваются заранее через внутренний кошелёк — средства автоматически возвращаются за любую отменённую сессию, а комиссия платформы (20%) удерживается из доли специалиста после завершения сессии.",
            "zh": "会话通过内部钱包预付——任何取消的会话将自动退款，平台佣金（20%）在每次会话完成后从专家份额中扣除。",
        },
        "faq1Q": {
            "ar": "كيف يعمل الدفع؟", "fr": "Comment fonctionne le paiement ?", "en": "How does payment work?",
            "tr": "Ödeme nasıl işler?", "ru": "Как работает оплата?", "zh": "支付如何运作？",
        },
        "faq1A": {
            "ar": "تشحن محفظتك ببطاقة بنكية (فوراً) أو حوالة تتحقق منها الإدارة، ثم يدفع ثمن كل جلسة من رصيدك عند الحجز — ويُسترد تلقائياً عند أي إلغاء.",
            "fr": "Vous rechargez votre portefeuille par carte (instantané) ou par virement vérifié par l'administration, puis chaque séance est payée depuis votre solde à la réservation — et remboursée automatiquement en cas d'annulation.",
            "en": "You top up your wallet by card (instant) or bank transfer verified by the administration, then each session is paid from your balance at booking — and automatically refunded on any cancellation.",
            "tr": "Cüzdanınızı kartla (anında) veya yönetim tarafından doğrulanan havaleyle yüklersiniz, ardından her seans rezervasyonda bakiyenizden ödenir — iptal durumunda otomatik iade edilir.",
            "ru": "Вы пополняете кошелёк картой (мгновенно) или банковским переводом, проверенным администрацией, затем каждая сессия оплачивается с баланса при бронировании — и автоматически возвращается при отмене.",
            "zh": "您可以通过银行卡（即时到账）或经平台核验的银行转账为钱包充值，然后每次会话在预约时从余额扣款——取消时自动退款。",
        },
        "faq3A": {
            "ar": "أطباء نفسيون وأخصائيون مرخّصون، تُراجَع شهاداتهم من طرف فريق الإدارة قبل ظهورهم في الدليل.",
            "fr": "Des médecins et psychologues diplômés dont les diplômes sont vérifiés par l'équipe d'administration avant leur apparition dans l'annuaire.",
            "en": "Licensed doctors and psychologists whose credentials are reviewed by the administration team before appearing in the directory.",
            "tr": "Diplomaları, dizinde görünmeden önce yönetim ekibi tarafından incelenen lisanslı doktor ve psikologlar.",
            "ru": "Дипломированные врачи и психологи, чьи документы проверяются командой администрации до появления в каталоге.",
            "zh": "持证医生与心理咨询师，其资质在进入目录前由管理团队审核。",
        },
    },
    "footer": {
        "tagline": {
            "ar": "لأن الروح تُعالج كالجسد — استشارات نفسية احترافية آمنة في أي وقت",
            "fr": "Parce que l'âme se soigne comme le corps — des consultations professionnelles et sûres à tout moment",
            "en": "Because the soul heals like the body — professional, safe consultation anytime",
            "tr": "Çünkü ruh da beden gibi iyileşir — her an profesyonel ve güvenli danışmanlık",
            "ru": "Потому что душа лечится как тело — профессиональная и безопасная консультация в любое время",
            "zh": "因为心灵与身体一样需要疗愈——随时提供专业安全的心理咨询",
        },
        "rights": {
            "ar": "طمأنينة — راحة البال أقرب مما تظن 💜", "fr": "Tumaanina — la sérénité est plus proche que vous ne le pensez 💜",
            "en": "Tumaanina — peace of mind is closer than you think 💜", "tr": "Tumaanina — huzur sandığınızdan yakın 💜",
            "ru": "Tumaanina — спокойствие ближе, чем вы думаете 💜", "zh": "Tumaanina——内心的平静比想象中更近 💜",
        },
    },
    "certificate": {
        "orgSub": {
            "ar": "منصة الاستشارات النفسية عبر الإنترنت", "fr": "Plateforme de consultation psychologique en ligne",
            "en": "Online psychological consultation platform", "tr": "Çevrimiçi psikolojik danışmanlık platformu",
            "ru": "Платформа онлайн-психологических консультаций", "zh": "在线心理咨询平台",
        },
        "docTitle": {
            "ar": "شهادة اعتماد وتوثيق", "fr": "Certificat d'accréditation", "en": "Accreditation certificate",
            "tr": "Akreditasyon sertifikası", "ru": "Сертификат аккредитации", "zh": "认证证书",
        },
        "line2": {
            "ar": "نظير التميز والالتزام المهني في تقديم جلسات استشارة نفسية عبر منصة طمأنينة، بمجموع",
            "fr": "Pour l'excellence et l'engagement professionnel dans les consultations psychologiques sur la plateforme Tumaanina, totalisant",
            "en": "For excellence and professional commitment in psychological consultations on the Tumaanina platform, totaling",
            "tr": "Tumaanina platformundaki psikolojik danışmanlıklardaki mükemmellik ve profesyonel bağlılığından dolayı, toplam",
            "ru": "За превосходство и профессиональную преданность в психологических консультациях на платформе Tumaanina, всего",
            "zh": "因其在 Tumaanina 平台心理咨询服务中的卓越表现与专业投入，累计完成",
        },
        "sessionsWord": {
            "ar": "جلسة استشارة مكتملة حتى تاريخ إصدار هذه الشهادة", "fr": "consultations terminées à la date d'émission de ce certificat",
            "en": "completed consultations as of the issue date of this certificate", "tr": "bu sertifikanın düzenlendiği tarihe kadar tamamlanan danışmanlık",
            "ru": "завершённых консультаций на дату выдачи этого сертификата", "zh": "次已完成的咨询（截至本证书签发日期）",
        },
        "signTitle": {
            "ar": "إدارة منصة طمأنينة", "fr": "L'équipe Tumaanina", "en": "Tumaanina administration",
            "tr": "Tumaanina yönetimi", "ru": "Администрация Tumaanina", "zh": "Tumaanina 管理团队",
        },
        "signRole": {
            "ar": "خدمة العملاء", "fr": "Support client", "en": "Customer support",
            "tr": "Müşteri desteği", "ru": "Поддержка клиентов", "zh": "客户支持",
        },
    },
    "how": {
        "s2Desc": {
            "ar": "أنشئ حسابك بالاسم المستعار ورقمك — التسجيل سريع بلا أي توثيق، وحمّل محفظتك متى أردت.",
            "fr": "Créez votre compte avec un pseudonyme et votre numéro — inscription rapide sans aucune vérification, et rechargez votre portefeuille quand vous voulez.",
            "en": "Create your account with a pseudonym and your number — quick signup with no verification, and top up your wallet anytime.",
            "tr": "Takma ad ve numaranızla hesabınızı oluşturun — doğrulama gerektirmeyen hızlı kayıt, cüzdanınızı istediğiniz zaman yükleyin.",
            "ru": "Создайте аккаунт под псевдонимом со своим номером — быстрая регистрация без проверок, пополняйте кошелёк когда угодно.",
            "zh": "用化名和您的号码创建账户——快速注册无需任何验证，随时为钱包充值。",
        },
        "s4Desc": {
            "ar": "تصفّح دليل الأخصائيين الموثّقين (شهاداتهم مُراجَعة من الإدارة) واختر من يناسبك بلغته وتخصصه وسعره.",
            "fr": "Parcourez l'annuaire des professionnels vérifiés (diplômes contrôlés par l'administration) et choisissez par langue, spécialité et prix.",
            "en": "Browse the verified professionals directory (credentials reviewed by the administration) and choose by language, specialty and price.",
            "tr": "Doğrulanmış uzmanlar dizinine göz atın (diplomalar yönetim tarafından incelenir) ve dil, uzmanlık ve fiyata göre seçin.",
            "ru": "Просмотрите каталог проверенных специалистов (документы проверены администрацией) и выберите по языку, специализации и цене.",
            "zh": "浏览经过认证的专业人士目录（资质由管理团队审核），按语言、专长和价格选择。",
        },
        "s6Desc": {
            "ar": "بعد الجلسة سجّل شعورك وخطّط للمتابعة، وتابع منشورات الأخصائيين في مجتمع طمأنينة — أنت لست وحدك.",
            "fr": "Après la séance, notez votre ressenti et planifiez la suite, et suivez les publications des professionnels dans la communauté Tumaanina — vous n'êtes pas seul.",
            "en": "After the session, log how you feel and plan your follow-up, and follow professionals' posts in the Tumaanina community — you're not alone.",
            "tr": "Seans sonrası duygularınızı kaydedin ve devamı planlayın, Tumaanina topluluğunda uzmanların paylaşımlarını takip edin — yalnız değilsiniz.",
            "ru": "После сессии отмечайте своё состояние и планируйте продолжение, следите за публикациями специалистов в сообществе Tumaanina — вы не одни.",
            "zh": "会话结束后记录您的感受并规划后续，关注 Tumaanina 社区中专家的动态——你并不孤单。",
        },
        "v1": {
            "ar": "تسجيل فوري", "fr": "Inscription instantanée", "en": "Instant signup",
            "tr": "Anında kayıt", "ru": "Мгновенная регистрация", "zh": "即时注册",
        },
        "v1Desc": {
            "ar": "بلا توثيق ولا انتظار — حسابك جاهز خلال دقيقة",
            "fr": "Sans vérification ni attente — votre compte est prêt en une minute",
            "en": "No verification, no waiting — your account is ready in a minute",
            "tr": "Doğrulama ve bekleme yok — hesabınız bir dakikada hazır",
            "ru": "Без проверок и ожидания — аккаунт готов за минуту",
            "zh": "无需验证，无需等待——一分钟创建账户",
        },
        "v3": {
            "ar": "أسعار واضحة", "fr": "Tarifs transparents", "en": "Transparent pricing",
            "tr": "Şeffaf fiyatlar", "ru": "Прозрачные цены", "zh": "价格透明",
        },
        "v3Desc": {
            "ar": "سعر كل أخصائي معروض أمامك — تدفع من محفظتك وتسترد عند الإلغاء",
            "fr": "Le tarif de chaque professionnel est affiché — payez depuis votre portefeuille et soyez remboursé en cas d'annulation",
            "en": "Each professional's price is displayed — pay from your wallet and get refunded on cancellation",
            "tr": "Her uzmanın ücreti görünür — cüzdanınızdan ödeyin, iptalde iade alın",
            "ru": "Цена каждого специалиста указана открыто — платите из кошелька, при отмене возвращаем",
            "zh": "每位专家的价格公开显示——从钱包支付，取消即退款",
        },
    },
    "directory": {
        "freeNote": {
            "ar": "الأخصائيون موثّقون بعد التحقق من شهاداتهم", "fr": "Des professionnels vérifiés après contrôle de leurs diplômes",
            "en": "Professionals verified after credential review", "tr": "Diplomaları incelendikten sonra doğrulanan uzmanlar",
            "ru": "Специалисты проверены после изучения их дипломов", "zh": "专业人士经资质审核后认证",
        },
    },
    "push": {
        "reminderBody": {
            "ar": "جلستك في «طمأنينة» بعد ساعة تقريباً — الغرفة تنتظركما",
            "fr": "Votre séance sur « Tumaanina » dans environ une heure — la salle vous attend",
            "en": "Your Tumaanina session starts in about an hour — the room awaits you",
            "tr": "Tumaanina seansınız yaklaşık bir saat sonra — oda sizi bekliyor",
            "ru": "Ваша сессия в «Tumaanina» примерно через час — комната ждёт вас",
            "zh": "您的 Tumaanina 会话约一小时后开始——房间正在等候您",
        },
        "testTitle": {
            "ar": "مرحباً بك في طمأنينة 💜", "fr": "Bienvenue sur Tumaanina 💜", "en": "Welcome to Tumaanina 💜",
            "tr": "Tumaanina'ya hoş geldiniz 💜", "ru": "Добро пожаловать в Tumaanina 💜", "zh": "欢迎来到 Tumaanina 💜",
        },
    },
}

# استبدالات عامة على القيم (بعد الحذف، قبل الصريح)
GLOBALS = {
    "ar": [
        ("رفيقي النفسي", "طمأنينة"), ("رفيقي", "طمأنينة"),
        ("المتضررين", "العملاء"), ("المتضرر", "العميل"), ("متضررين", "عملاء"),
        ("متضرراً", "عميلاً"), ("متضرّر", "عميل"), ("متضررة", "عميلة"), ("متضرر", "عميل"),
        ("الحرائق", "الأزمات"), ("حريق", "أزمة"), ("الكوارث", "الأزمات"), ("كوارث", "أزمات"),
        ("الكارثة", "الأزمة"), ("كارثة", "أزمة"),
        ("مجاناً", "بسهولة"), ("مجانية", "متاحة"), ("مجاني", "متاح"), ("مجانا", "بسهولة"), ("المجانية", "تسهيل الدفع"),
        ("متطوعين", "مختصين"), ("متطوعون", "مختصون"), ("متطوعة", "مختصة"), ("متطوع", "مختص"), ("تتطوع", "تعمل"),
        ("مجتمع رفيقي", "مجتمع طمأنينة"),
    ],
    "fr": [
        ("Rafiqi Annafsi", "Tumaanina"), ("Rafiqi", "Tumaanina"),
        ("victimes", "clients"), ("victime", "client"), ("sinistrés", "clients"), ("sinistré", "client"),
        ("des incendies", "psychologiques"), ("incendies", "crises"), ("incendie", "crise"),
        ("catastrophes", "crises"), ("catastrophe", "crise"), ("de catastrophe", "de crise"),
        ("gratuitement", "en toute confidentialité"), ("gratuites", "confidentielles"),
        ("gratuite", "confidentielle"), ("gratuit", "confidentiel"), ("gratuits", "confidentiels"),
        ("bénévoles", "professionnels"), ("bénévole", "professionnel"),
        ("communauté Rafiqi", "communauté Tumaanina"),
    ],
    "en": [
        ("Rafiqi Annafsi", "Tumaanina"), ("Rafiqi", "Tumaanina"),
        ("fire victims", "clients"), ("victims", "clients"), ("victim", "client"),
        ("fires", "crises"), ("fire", "crisis"), ("disasters", "crises"), ("disaster", "crisis"),
        ("volunteers", "professionals"), ("volunteer", "professional"),
        ("free of charge", "in full confidentiality"), ("100% free", "100% private"),
        ("completely free", "completely private"), ("for free", "securely"),
        ("Rafiqi community", "Tumaanina community"),
    ],
    "tr": [
        ("Rafiqi Annafsi", "Tumaanina"), ("Rafiqi", "Tumaanina"),
        ("mağdurların", "danışanların"), ("mağduru", "danışanı"), ("mağdur", "danışan"),
        ("yangın", "kriz"), ("yangınlar", "krizler"), ("felaket", "kriz"), ("felaketler", "krizler"),
        ("ücretsiz", "güvenli"), ("gönüllü", "profesyonel"), ("gönüllüler", "profesyoneller"),
    ],
    "ru": [
        ("Rafiqi Annafsi", "Tumaanina"), ("Rafiqi", "Tumaanina"),
        ("пострадавших", "клиентов"), ("пострадавший", "клиент"), ("пострадавшая", "клиентка"),
        ("пожаров", "кризисов"), ("пожара", "кризиса"), ("пожар", "кризис"),
        ("бедствий", "кризисов"), ("бедствие", "кризис"), ("катастроф", "кризисов"),
        ("бесплатно", "конфиденциально"), ("бесплатный", "конфиденциальный"),
        ("бесплатная", "конфиденциальная"), ("бесплатные", "конфиденциальные"),
        ("волонтёров", "специалистов"), ("волонтёр", "специалист"), ("волонтеров", "специалистов"), ("волонтер", "специалист"),
        ("сообщество Rafiqi", "сообщество Tumaanina"),
    ],
    "zh": [
        ("Rafiqi Annafsi", "Tumaanina"), ("Rafiqi", "Tumaanina"),
        ("受害者", "来访者"), ("火灾", "危机"), ("灾难", "危机"), ("灾害", "危机"),
        ("免费", "私密"), ("志愿", "专业"),
    ],
}

# ═══ مفاتيح جديدة تُدرج (القسم → مفتاح مرساة → أسطر جديدة) ═══

def L(ar, fr, en, tr, ru, zh):
    return {"ar": ar, "fr": fr, "en": en, "tr": tr, "ru": ru, "zh": zh}

NAV_WALLET = L("المحفظة", "Portefeuille", "Wallet", "Cüzdan", "Кошелёк", "钱包")

WALLET_SECTION = {
    "title": L("المحفظة", "Portefeuille", "Wallet", "Cüzdan", "Кошелёк", "钱包"),
    "subtitle": L(
        "اشحن رصيدك وادفع جلساتك بأمان — وأرباحك متاحة للسحب في أي وقت",
        "Rechargez votre solde et payez vos séances en toute sécurité — vos gains sont retirables à tout moment",
        "Top up your balance and pay for sessions securely — earnings withdrawable anytime",
        "Bakiyenizi güvenle yükleyin ve seanslarınızı ödeyin — kazançlarınız istediğiniz an çekilebilir",
        "Пополняйте баланс и безопасно оплачивайте сессии — заработок можно вывести в любой момент",
        "安全充值并支付会话费用——收益可随时提现"),
    "balanceLabel": L("الرصيد الحالي", "Solde actuel", "Current balance", "Mevcut bakiye", "Текущий баланс", "当前余额"),
    "balanceHint": L("بالدولار الأمريكي — تُستخدم في كل الجلسات", "En dollars américains — utilisés pour toutes les séances", "In US Dollars — used for all sessions", "Amerikan doları — tüm seanslar için", "В долларах США — для всех сессий", "以美元计——用于所有会话"),
    "tabCard": L("شحن ببطاقة", "Par carte", "By card", "Kartla", "Картой", "银行卡充值"),
    "tabTransfer": L("حوالة", "Virement", "Transfer", "Havale", "Перевод", "转账充值"),
    "tabWithdraw": L("سحب", "Retrait", "Withdraw", "Çekim", "Вывод", "提现"),
    "amountLabel": L("المبلغ", "Montant", "Amount", "Tutar", "Сумма", "金额"),
    "cardIntro": L("أدخل بيانات بطاقتك البنكية (Visa / Mastercard / CIB / Edahabia) — يُضاف الرصيد فوراً بعد التحقق.", "Saisissez les données de votre carte (Visa / Mastercard / CIB / Edahabia) — le solde est ajouté immédiatement après vérification.", "Enter your bank card details (Visa / Mastercard / CIB / Edahabia) — the balance is added instantly after verification.", "Banka kartı bilgilerinizi girin (Visa / Mastercard / CIB / Edahabia) — doğrulama sonrası bakiye anında eklenir.", "Введите данные банковской карты (Visa / Mastercard / CIB / Edahabia) — баланс добавляется мгновенно после проверки.", "输入您的银行卡信息（Visa / 万事达 / CIB / Edahabia）——验证后余额即时到账。"),
    "cardName": L("اسم حامل البطاقة", "Nom du titulaire", "Cardholder name", "Kart sahibinin adı", "Имя владельца карты", "持卡人姓名"),
    "cardNumber": L("رقم البطاقة", "Numéro de carte", "Card number", "Kart numarası", "Номер карты", "卡号"),
    "cardExpiry": L("تاريخ الانتهاء", "Expiration", "Expiry", "Son kullanma", "Срок действия", "有效期"),
    "cardCvc": L("رمز الأمان CVC", "Code CVC", "CVC", "CVC kodu", "Код CVC", "安全码 CVC"),
    "payBtn": L("ادفع الآن", "Payer maintenant", "Pay now", "Şimdi öde", "Оплатить сейчас", "立即支付"),
    "cardDemoNote": L("بوابة دفع تجريبية آمنة — للتجربة استخدم بطاقة اختبار مثل 4242 4242 4242 4242 — جاهزة لربط Stripe أو Paymob في التشغيل الفعلي.", "Passerelle de démonstration sécurisée — pour tester, utilisez une carte comme 4242 4242 4242 4242 — prête à connecter Stripe ou Paymob en production.", "Secure demo payment gateway — for testing use a card like 4242 4242 4242 4242 — ready to connect Stripe or Paymob in production.", "Güvenli demo ödeme altyapısı — test için 4242 4242 4242 4242 gibi bir kart kullanın — üretimde Stripe veya Paymob bağlanmaya hazır.", "Демонстрационный платёжный шлюз — для теста используйте карту 4242 4242 4242 4242 — готово к подключению Stripe или Paymob.", "安全演示支付网关——测试可使用 4242 4242 4242 4242 测试卡——生产环境可接入 Stripe 或 Paymob。"),
    "transferIntro": L("حوّل المبلغ إلى الحساب الرسمي أدناه ثم أدخل مرجع الحوالة — تراجعها الإدارة وتُضاف إلى رصيدك مباشرة بعد الموافقة.", "Virez le montant vers le compte officiel ci-dessous puis saisissez la référence du virement — l'administration la vérifie et le solde est crédité dès l'approbation.", "Transfer the amount to the official account below then enter the transfer reference — the administration verifies it and your balance is credited upon approval.", "Miktarı aşağıdaki resmi hesaba havale edin ve referansı girin — yönetim doğrular ve onay sonrası bakiyenize eklenir.", "Переведите сумму на официальный счёт ниже и введите референс перевода — администрация проверит его, и баланс будет зачислен после подтверждения.", "将金额转入下方官方账户并输入转账参考号——管理团队核验后，余额将立即到账。"),
    "bankHolder": L("المستفيد", "Bénéficiaire", "Beneficiary", "Alıcı", "Получатель", "收款人"),
    "bankName": L("البنك", "Banque", "Bank", "Banka", "Банк", "银行"),
    "baridimob": L("بريدي موب", "BaridiMob", "BaridiMob", "BaridiMob", "BaridiMob", "BaridiMob"),
    "copyDetails": L("نسخ البيانات", "Copier les coordonnées", "Copy details", "Bilgileri kopyala", "Копировать данные", "复制信息"),
    "copied": L("تم النسخ ✓", "Copié ✓", "Copied ✓", "Kopyalandı ✓", "Скопировано ✓", "已复制 ✓"),
    "transferRef": L("مرجع الحوالة", "Référence du virement", "Transfer reference", "Havale referansı", "Референс перевода", "转账参考号"),
    "transferRefHint": L("رقم العملية من إيصال التحويل", "Le numéro figurant sur votre reçu", "The number on your transfer receipt", "Dekontunuzdaki işlem numarası", "Номер операции из вашей квитанции", "转账回单上的交易号"),
    "transferBtn": L("أرسل طلب الشحن", "Envoyer la demande", "Submit top-up request", "Yükleme talebi gönder", "Отправить запрос на пополнение", "提交充值请求"),
    "transferNote": L("تُراجع الحوالة من الإدارة قبل إضافة الرصيد — سيصلك إشعار بالنتيجة.", "Le virement est vérifié par l'administration avant l'ajout du solde — vous recevrez une notification du résultat.", "The transfer is reviewed by the administration before the balance is added — you'll receive a notification with the result.", "Bakiye eklenmeden önce havale yönetim tarafından incelenir — sonuç hakkında bildirim alacaksınız.", "Перевод проверяется администрацией до зачисления — вы получите уведомление о результате.", "余额到账前管理团队会核验转账——核验结果将通知您。"),
    "transferSent": L("تم إرسال طلب الشحن — سيُضاف الرصيد بعد موافقة الإدارة", "Demande envoyée — le solde sera ajouté après approbation de l'administration", "Top-up request submitted — the balance will be added after administration approval", "Talep gönderildi — bakiye yönetim onayından sonra eklenecek", "Запрос отправлен — баланс будет зачислен после одобрения администрацией", "充值请求已提交——经管理团队批准后余额到账"),
    "withdrawIntro": L("اطلب تحويل أرباحك إلى حسابك البنكي أو بريدي موب — يُخصم المبلغ من محفظتك فور الطلب ويُنفّذ التحويل من الإدارة.", "Demandez le virement de vos gains vers votre compte bancaire ou BaridiMob — le montant est déduit de votre portefeuille dès la demande et le virement est exécuté par l'administration.", "Request your earnings to be transferred to your bank account or BaridiMob — the amount is deducted from your wallet upon request and the transfer is executed by the administration.", "Kazançlarınızın banka hesabınıza veya BaridiMob'a aktarılmasını isteyin — tutar talep anında cüzdanınızdan düşülür ve aktarım yönetim tarafından yapılır.", "Запросите перевод заработка на банковский счёт или BaridiMob — сумма списывается с кошелька сразу, перевод выполняет администрация.", "申请将收益转入您的银行账户或 BaridiMob——申请时金额即从钱包扣除，转账由管理团队执行。"),
    "withdrawBtn": L("اطلب السحب", "Demander le retrait", "Request withdrawal", "Çekim talebi gönder", "Запросить вывод", "申请提现"),
    "withdrawNote": L("أدنى مبلغ للسحب 10$ — يصلك إشعار عند تنفيذ التحويل أو رفض الطلب.", "Le retrait minimum est de 10$ — vous serez notifié lors de l'exécution ou du refus.", "Minimum withdrawal is $10 — you'll be notified when it's executed or rejected.", "Minimum çekim 10$ — işlem yapıldığında veya reddedildiğinde bildirim alırsınız.", "Минимальный вывод — $10 — вы получите уведомление о выполнении или отклонении.", "最低提现 $10——执行或拒绝时将通知您。"),
    "withdrawSent": L("تم إرسال طلب السحب — سيصلك إشعار عند التنفيذ", "Demande de retrait envoyée — notification à l'exécution", "Withdrawal request submitted — you'll be notified upon execution", "Çekim talebi gönderildi — işlemde bildirim alacaksınız", "Заявка на вывод отправлена — уведомим при выполнении", "提现申请已提交——执行时将通知您"),
    "historyTitle": L("سجل الحركات", "Historique des transactions", "Transaction history", "İşlem geçmişi", "История операций", "交易记录"),
    "emptyHistory": L("لا حركات مالية بعد", "Aucune transaction pour l'instant", "No transactions yet", "Henüz işlem yok", "Пока нет операций", "暂无交易记录"),
    "statusPending": L("بانتظار المراجعة", "En attente", "Pending", "Beklemede", "В ожидании", "待审核"),
    "statusCompleted": L("منفّذة", "Effectuée", "Completed", "Tamamlandı", "Выполнено", "已完成"),
    "statusRejected": L("مرفوضة", "Rejetée", "Rejected", "Reddedildi", "Отклонено", "已拒绝"),
    "topupDone": L("تم شحن محفظتك بنجاح", "Portefeuille rechargé avec succès", "Wallet topped up successfully", "Cüzdan başarıyla yüklendi", "Кошелёк успешно пополнен", "钱包充值成功"),
    "transferError": L("تعذر إرسال الطلب — تحقق من المبلغ والمرجع", "Échec de l'envoi — vérifiez le montant et la référence", "Failed to submit — check the amount and reference", "Gönderilemedi — tutar ve referansı kontrol edin", "Не удалось отправить — проверьте сумму и референс", "提交失败——请检查金额与参考号"),
    "withdrawError": L("تعذر إرسال طلب السحب — تحقق من رصيدك", "Échec de la demande de retrait — vérifiez votre solde", "Withdrawal failed — check your balance", "Çekim talebi başarısız — bakiyenizi kontrol edin", "Не удалось отправить заявку — проверьте баланс", "提现失败——请检查余额"),
}

WALLET_TX_TYPES = {
    "TOPUP_CARD": L("شحن ببطاقة", "Recharge par carte", "Card top-up", "Kartla yükleme", "Пополнение картой", "银行卡充值"),
    "TOPUP_TRANSFER": L("حوالة شحن", "Virement de recharge", "Transfer top-up", "Havale ile yükleme", "Пополнение переводом", "转账充值"),
    "SESSION_PAYMENT": L("دفع جلسة", "Paiement de séance", "Session payment", "Seans ödemesi", "Оплата сессии", "会话支付"),
    "EARNING": L("أرباح جلسة", "Gains de séance", "Session earnings", "Seans kazancı", "Заработок с сессии", "会话收益"),
    "WITHDRAWAL": L("طلب سحب", "Demande de retrait", "Withdrawal", "Para çekme", "Вывод средств", "提现"),
    "REFUND": L("استرداد", "Remboursement", "Refund", "İade", "Возврат", "退款"),
}

WALLET_CARD_ERRORS = {
    "INVALID_AMOUNT": L("المبلغ خارج الحدود المسموحة", "Montant hors limites autorisées", "Amount outside allowed limits", "Tutar izin verilen sınırların dışında", "Сумма вне допустимых пределов", "金额超出允许范围"),
    "INVALID_CARD_NAME": L("اسم حامل البطاقة مطلوب", "Nom du titulaire requis", "Cardholder name required", "Kart sahibinin adı gerekli", "Требуется имя владельца карты", "需要持卡人姓名"),
    "INVALID_CARD": L("رقم البطاقة غير صالح", "Numéro de carte invalide", "Invalid card number", "Geçersiz kart numarası", "Неверный номер карты", "卡号无效"),
    "CARD_NOT_SUPPORTED": L("لم تُدعم هذه البطاقة — استخدم Visa أو Mastercard", "Carte non prise en charge — utilisez Visa ou Mastercard", "Card not supported — use Visa or Mastercard", "Kart desteklenmiyor — Visa veya Mastercard kullanın", "Карта не поддерживается — используйте Visa или Mastercard", "不支持该卡——请使用 Visa 或万事达"),
    "INVALID_EXPIRY": L("تاريخ الانتهاء غير صالح", "Date d'expiration invalide", "Invalid expiry date", "Geçersiz son kullanma tarihi", "Неверный срок действия", "有效期无效"),
    "INVALID_CVC": L("رمز الأمان غير صالح", "Code CVC invalide", "Invalid CVC", "Geçersiz CVC", "Неверный CVC", "安全码无效"),
    "generic": L("فشلت عملية الدفع — تحقق من بيانات البطاقة", "Paiement échoué — vérifiez les données de la carte", "Payment failed — check your card details", "Ödeme başarısız — kart bilgilerini kontrol edin", "Платёж не удался — проверьте данные карты", "支付失败——请检查银行卡信息"),
}

VICTIM_NEW = {
    "sessionPriceLabel": L("سعر الجلسة", "Prix de la séance", "Session price", "Seans ücreti", "Стоимость сессии", "会话价格"),
    "yourBalance": L("رصيدك", "Votre solde", "Your balance", "Bakiyeniz", "Ваш баланс", "您的余额"),
    "insufficientBalance": L("الرصيد غير كافٍ — هذه الجلسة {needed}$ ورصيدك {balance}$ — اشحن محفظتك وأكمل الحجز", "Solde insuffisant — cette séance coûte {needed}$ et votre solde est {balance}$ — rechargez votre portefeuille", "Insufficient balance — this session costs {needed}$ and your balance is {balance}$ — top up your wallet", "Yetersiz bakiye — bu seans {needed}$, bakiyeniz {balance}$ — cüzdanınızı yükleyin", "Недостаточно средств — сессия стоит {needed}$, ваш баланс {balance}$ — пополните кошелёк", "余额不足——本次会话需 {needed}$，当前余额 {balance}$——请先充值"),
    "goToWallet": L("اشحن محفظتك", "Recharger le portefeuille", "Top up wallet", "Cüzdanı yükle", "Пополнить кошелёк", "前往充值"),
    "unpaidBadge": L("بانتظار الدفع", "En attente de paiement", "Awaiting payment", "Ödeme bekliyor", "Ожидает оплаты", "待支付"),
    "paidBadge": L("مدفوعة", "Payée", "Paid", "Ödendi", "Оплачено", "已支付"),
    "refundedBadge": L("استُرد الثمن", "Remboursée", "Refunded", "İade edildi", "Возвращено", "已退款"),
    "payNowBtn": L("ادفع الآن", "Payer", "Pay now", "Öde", "Оплатить", "立即支付"),
}

COUNSELOR_NEW = {
    "sessionPriceLabel": L("سعر الجلسة (USD) *", "Prix de la séance (USD) *", "Session price (USD) *", "Seans ücreti (USD) *", "Цена сессии (USD) *", "会话价格 (USD) *"),
    "sessionPriceHint": L("تظهر للعميل في بطاقتك — تُخصم 20% عمولة المنصة ويصلك 80% بعد كل جلسة مكتملة", "Affiché aux clients sur votre carte — 20% de commission plateforme, vous recevez 80% après chaque séance terminée", "Shown to clients on your card — 20% platform fee, you receive 80% after each completed session", "Kartınızda danışanlara görünür — %20 platform komisyonu, her tamamlanan seans sonrası %80 alırsınız", "Отображается клиентам в вашей карточке — комиссия платформы 20%, вы получаете 80% после каждой завершённой сессии", "显示在您的卡片上——平台佣金20%，每次会话完成后您获得80%"),
}

SETTINGS_NEW = {
    "walletCardTitle": L("المحفظة", "Portefeuille", "Wallet", "Cüzdan", "Кошелёк", "钱包"),
    "walletCardBalance": L("الرصيد", "Solde", "Balance", "Bakiye", "Баланс", "余额"),
    "walletCardBtn": L("إدارة المحفظة", "Gérer le portefeuille", "Manage wallet", "Cüzdanı yönet", "Управлять кошельком", "管理钱包"),
    "priceTitle": L("سعر جلستك", "Tarif de votre séance", "Your session price", "Seans ücretiniz", "Ваша цена сессии", "您的会话价格"),
    "priceHint": L("يدفع العميل هذا السعر من محفظته عند الحجز — يصلك 80% بعد اكتمال الجلسة", "Le client paie ce tarif depuis son portefeuille à la réservation — vous recevez 80% après l'achèvement", "The client pays this price from their wallet at booking — you receive 80% after completion", "Danışan rezervasyonda bu ücreti cüzdanından öder — tamamlanma sonrası %80 alırsınız", "Клиент оплачивает эту цену из кошелька при бронировании — вы получаете 80% после завершения", "客户预约时从钱包支付此价格——完成后您获得80%"),
}

ADMIN_NEW = {
    "tabPayments": L("المدفوعات", "Paiements", "Payments", "Ödemeler", "Платежи", "支付管理"),
    "payApprovedOk": L("تمت الموافقة ونُفّذت العملية بنجاح", "Approuvé et exécuté avec succès", "Approved and executed successfully", "Onaylandı ve başarıyla uygulandı", "Одобрено и успешно выполнено", "已批准并成功执行"),
    "payRejectedOk": L("تم الرفض — أُعيد المبلغ لمحفظة صاحبه إن كان سحباً", "Rejeté — le montant a été recrédité s'il s'agissait d'un retrait", "Rejected — the amount was refunded if it was a withdrawal", "Reddedildi — çekimse tutar iade edildi", "Отклонено — сумма возвращена, если это был вывод", "已拒绝——如为提现，金额已退回"),
    "payTransfersTitle": L("الحوالات البنكية", "Virements bancaires", "Bank transfers", "Banka havaleleri", "Банковские переводы", "银行转账"),
    "payWithdrawalsTitle": L("طلبات السحب", "Demandes de retrait", "Withdrawal requests", "Para çekme talepleri", "Заявки на вывод", "提现申请"),
    "payTransfersDesc": L("حوالات شحن المحافظ — الموافقة تُضيف الرصيد فوراً ويصلك العميل إشعاراً", "Virements de recharge — l'approbation crédite le solde immédiatement et notifie le client", "Wallet top-up transfers — approval credits the balance instantly and notifies the client", "Cüzdan yükleme havaleleri — onay bakiyeyi anında ekler ve danışanı bilgilendirir", "Переводы пополнения — одобрение мгновенно зачисляет баланс и уведомляет клиента", "钱包充值转账——批准后余额即时到账并通知用户"),
    "payWithdrawalsDesc": L("أرباح الأخصائيين — الموافقة تعليم الطلب منفّذاً، والرفض يرد المبلغ لمحفظته", "Gains des professionnels — l'approbation marque la demande comme payée, le rejet recrédite le portefeuille", "Professional earnings — approval marks the request as paid, rejection refunds the wallet", "Uzman kazançları — onay talebi ödendi işaretler, red cüzdana iade eder", "Заработок специалистов — одобрение отмечает заявку оплаченной, отклонение возвращает в кошелёк", "专家收益——批准即标记为已付款，拒绝则退回钱包"),
    "payTypeTransfers": L("حوالات شحن", "Recharges", "Top-ups", "Yüklemeler", "Пополнения", "充值"),
    "payTypeWithdrawals": L("طلبات سحب", "Retraits", "Withdrawals", "Çekimler", "Выводы", "提现"),
    "payRefLabel": L("مرجع الحوالة", "Référence du virement", "Transfer reference", "Havale referansı", "Референс перевода", "转账参考号"),
    "payMethodLabel": L("طريقة السحب", "Méthode de retrait", "Withdrawal method", "Çekim yöntemi", "Способ вывода", "提现方式"),
    "payDateLabel": L("التاريخ", "Date", "Date", "Tarih", "Дата", "日期"),
    "payApprove": L("موافقة وإضافة", "Approuver et créditer", "Approve & credit", "Onayla ve ekle", "Одобрить и зачислить", "批准并到账"),
    "payReject": L("رفض", "Rejeter", "Reject", "Reddet", "Отклонить", "拒绝"),
    "payMarkPaid": L("تم التحويل", "Marquer payé", "Mark as paid", "Ödendi işaretle", "Отметить оплаченным", "标记已付款"),
    "payRefuseWithdraw": L("رفض ورد المبلغ", "Refuser et rembourser", "Reject & refund", "Reddet ve iade et", "Отклонить и вернуть", "拒绝并退款"),
    "payEmpty": L("لا طلبات في هذه القائمة", "Aucune demande dans cette liste", "Nothing in this list", "Bu listede kayıt yok", "В этом списке ничего нет", "列表暂无记录"),
    "dashGross": L("إجمالي المدفوعات", "Total encaissé", "Gross collected", "Toplam tahsilat", "Всего собрано", "总收入"),
    "dashPaidOut": L("مصروف للأخصائيين", "Versé aux professionnels", "Paid to counselors", "Uzmanlara ödenen", "Выплачено специалистам", "已支付给专家"),
    "dashRevenue": L("إيراد المنصة", "Revenu de la plateforme", "Platform revenue", "Platform geliri", "Доход платформы", "平台收入"),
    "dashPaymentsPending": L("عمليات مالية معلّقة", "Opérations en attente", "Pending operations", "Bekleyen işlemler", "Ожидающие операции", "待处理操作"),
    "dashAcceptedSessions": L("جلسات مقبولة", "Séances acceptées", "Accepted sessions", "Kabul edilen seanslar", "Принятые сессии", "已接受的会话"),
}

TOPIC_NEW = {
    "depression": L("حزن مستمر أو اكتئاب", "Tristesse persistante ou dépression", "Persistent sadness or depression", "Sürekli üzüntü veya depresyon", "Постоянная грусть или депрессия", "持续悲伤或抑郁"),
    "relationships": L("مشاكل عائلية أو عاطفية", "Problèmes familiaux ou amoureux", "Family or relationship problems", "Aile veya ilişki sorunları", "Семейные проблемы или отношения", "家庭或感情问题"),
    "workStress": L("ضغط عمل أو دراسة", "Pression au travail ou aux études", "Work or study stress", "İş veya okul stresi", "Стресс на работе или учёбе", "工作或学习压力"),
    "selfConfidence": L("ثقة بالنفس وتقدير للذات", "Confiance et estime de soi", "Self-confidence and self-esteem", "Özgüven ve benlik saygısı", "Уверенность и самооценка", "自信与自尊"),
    "children": L("أحتاج دعماً لطفلي", "J'ai besoin d'un soutien pour mon enfant", "I need support for my child", "Çocuğum için desteğe ihtiyacım var", "Нужна поддержка для моего ребёнка", "我需要为我的孩子寻求支持"),
}

TOPIC_GRIEF = L("أعيش حزناً أو فقداناً لعزيز", "Je vis un deuil ou la perte d'un proche", "I'm grieving or lost a loved one", "Bir kayıp ya da yas yaşıyorum", "Я переживаю утрату близкого", "我正在经历丧失与哀伤")

SPECIALTY_NEW = {
    "couples": L("العلاقات الزوجية", "Thérapie de couple", "Couples therapy", "Çift terapisi", "Парная терапия", "伴侣关系"),
    "sleep": L("اضطرابات النوم", "Troubles du sommeil", "Sleep disorders", "Uyku bozuklukları", "Расстройства сна", "睡眠障碍"),
    "addiction": L("الإدمان السلوكي", "Addictions comportementales", "Behavioral addictions", "Davranışsal bağımlılıklar", "Поведенческие зависимости", "行为成瘾"),
}

SPECIALTY_UPDATE = {
    "trauma": L("الصدمات النفسية", "Traumatisme psychologique", "Psychological trauma", "Psikolojik travma", "Психологическая травма", "心理创伤"),
    "burnout": L("الاحتراق الوظيفي والإرهاق", "Épuisement professionnel et burn-out", "Burnout and exhaustion", "Tükenmişlik ve yorgunluk", "Выгорание и истощение", "职业倦怠与疲惫"),
}

def fmt(section_indent, key, val):
    return f'{section_indent}{key}: "{val}",'

def build_lines(dict_key, data, indent):
    out = []
    for k, m in data.items():
        out.append(fmt(indent, k, m[dict_key]))
    return out

def process(dict_key):
    path = DICTS[dict_key]["file"]
    with io.open(path, encoding="utf-8") as f:
        lines = f.read().split("\n")

    section = None
    subsection = None
    out = []
    deleted = 0
    explicit_hits = set()

    top_re = re.compile(r'^  ([A-Za-z0-9_]+): \{')
    sub_re = re.compile(r'^      ([A-Za-z0-9_]+): \{')
    kv_re = re.compile(r'^(\s+)([A-Za-z0-9_]+):\s*"(.*)",?\s*$')

    for line in lines:
        mtop = top_re.match(line)
        msub = sub_re.match(line)
        if mtop:
            section = mtop.group(1); subsection = None
            out.append(line); continue
        if msub and section:
            subsection = msub.group(1)
            out.append(line); continue
        if re.match(r'^  \},?\s*$', line):
            subsection = None
        m = kv_re.match(line)
        if m:
            indent, key, val = m.group(1), m.group(2), m.group(3)
            if key in DELETE_KEYS and (subsection is None or key in ("homeLoss", "safety", "childSupport", "helperBurnout", "mediaTrauma", "displacementSupport", "ptsd")):
                deleted += 1
                continue
            # استبدالات عامة
            for a, b in GLOBALS[dict_key]:
                val = val.replace(a, b)
            # استبدال صريح (قسم + مفتاح)
            sect_map = EXPLICIT.get(section, {})
            if key in sect_map and subsection is None:
                val = sect_map[key][dict_key]
                explicit_hits.add((section, key))
            out.append(f'{indent}{key}: "{val}",')
            continue
        out.append(line)

    text = "\n".join(out)

    # ═══ إدراج المفاتيح الجديدة ═══
    # 1) قسم المحفظة كاملاً قبل نهاية القاموس
    wallet_lines = ["  wallet: {"]
    for k, m in WALLET_SECTION.items():
        wallet_lines.append(fmt("    ", k, m[dict_key]))
    wallet_lines.append("    txTypes: {")
    for k, m in WALLET_TX_TYPES.items():
        wallet_lines.append(fmt("      ", k, m[dict_key]))
    wallet_lines.append("    },")
    wallet_lines.append("    cardError: {")
    for k, m in WALLET_CARD_ERRORS.items():
        wallet_lines.append(fmt("      ", k, m[dict_key]))
    wallet_lines.append("    },")
    wallet_lines.append("  },")
    wallet_block = "\n".join(wallet_lines)

    # إدراج قبل آخر سطر "};"
    idx = text.rfind("\n};")
    if idx == -1:
        print(f"[{dict_key}] ERROR: no closing }}; found"); sys.exit(1)
    text = text[:idx] + "\n" + wallet_block + text[idx:]

    # 2) nav.wallet بعد nav.logout
    def insert_after_key(anchor_key, new_pairs, max_depth=None):
        nonlocal text
        pass

    nav_re = re.compile(r'(\n    logout: "[^"]*",)')
    m = nav_re.search(text)
    if m:
        text = text[:m.end(1)] + '\n    wallet: "' + NAV_WALLET[dict_key] + '",' + text[m.end(1):]
    else:
        print(f"[{dict_key}] WARN: nav.logout anchor not found")

    # 3) victim keys بعد bookLimitNote
    vm = re.search(r'(\n    bookLimitNote: "[^"]*",)', text)
    if vm:
        block = "\n".join(build_lines(dict_key, VICTIM_NEW, "    "))
        text = text[:vm.end(1)] + "\n" + block + text[vm.end(1):]
    else:
        print(f"[{dict_key}] WARN: victim.bookLimitNote anchor not found")

    # 4) counselor keys بعد whatsappHint (أول ظهور داخل قسم counselor)
    cm = re.search(r'(\n    whatsappHint: "[^"]*",)', text)
    if cm:
        block = "\n".join(build_lines(dict_key, COUNSELOR_NEW, "    "))
        text = text[:cm.end(1)] + "\n" + block + text[cm.end(1):]
    else:
        print(f"[{dict_key}] WARN: counselor.whatsappHint anchor not found")

    # 5) settings keys بعد socialHint
    sm = re.search(r'(\n    socialHint: "[^"]*",)', text)
    if sm:
        block = "\n".join(build_lines(dict_key, SETTINGS_NEW, "    "))
        text = text[:sm.end(1)] + "\n" + block + text[sm.end(1):]
    else:
        print(f"[{dict_key}] WARN: settings.socialHint anchor not found")

    # 6) admin keys بعد dashMessages
    am = re.search(r'(\n    dashMessages: "[^"]*",)', text)
    if am:
        block = "\n".join(build_lines(dict_key, ADMIN_NEW, "    "))
        text = text[:am.end(1)] + "\n" + block + text[am.end(1):]
    else:
        print(f"[{dict_key}] WARN: admin.dashMessages anchor not found")

    # 7) topics جديدة: تحديث grief ثم إدراج الجديدة بعده
    tg = re.search(r'(\n      grief: ")[^"]*(")', text)
    if tg:
        text = text[:tg.start()] + '\n      grief: "' + TOPIC_GRIEF[dict_key] + '",' + text[tg.end():]
        block = "\n".join(build_lines(dict_key, TOPIC_NEW, "      "))
        tg2 = re.search(r'(\n      grief: "[^"]*",)', text)
        text = text[:tg2.end(1)] + "\n" + block + text[tg2.end(1):]
    else:
        print(f"[{dict_key}] WARN: topics.grief anchor not found")

    # 8) specialties: تحديث trauma/burnout + إدراج الجديدة بعد crisisIntervention
    for skey, sval in SPECIALTY_UPDATE.items():
        pat = re.compile(r'(\n      ' + skey + r': ")[^"]*(")')
        smp = pat.search(text)
        if smp:
            text = text[:smp.start()] + '\n      ' + skey + ': "' + sval[dict_key] + '",' + text[smp.end():]
    sp = re.search(r'(\n      crisisIntervention: "[^"]*",)', text)
    if sp:
        block = "\n".join(build_lines(dict_key, SPECIALTY_NEW, "      "))
        text = text[:sp.end(1)] + "\n" + block + text[sp.end(1):]
    else:
        print(f"[{dict_key}] WARN: specialties.crisisIntervention anchor not found")

    with io.open(path, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"[{dict_key}] deleted={deleted} explicit={len(explicit_hits)} OK")

for dk in ["ar", "fr", "en", "tr", "ru", "zh"]:
    process(dk)

# فحص المفاتيح الصريحة غير الموجودة (لا يجب أن تظهر)
missing_report = []
print("DONE")
