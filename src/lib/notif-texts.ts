/**
 * v1.6.0 — قوالب الإشعارات المشتركة (الخادم + الجرس في العميل).
 * ─────────────────────────────────────────────────────────────
 * طلب المستخدم: «الإشعارات لا تترجم للغات الأخرى — يجب ضمان ترجمة كل
 * الإشعارات للغات الست». الحل: الإشعار الداخلي يُخزَّن بمفتاحه ومتغيراته
 * (vars) كما هو، وعند العرض يُعاد توليد النص بلغة واجهة المستخدم الحالية
 * من هذه الوحدة — فتُترجم الإشعارات فوراً عند تبديل اللغة ولو أُرسلت
 * قبلها بلغة أخرى. الإشعارات المخصصة (رسائل الأدمين الجماعية بلا مفتاح)
 * تُعرض بالنص المخزّن كما هو.
 */
export type NotifKey =
  | "booked"
  | "accepted"
  | "started"
  | "declined"
  | "feedback"
  | "followUp"
  | "treatmentEnded"
  | "message"
  | "rescheduled"
  | "declinedReason"
  | "dm"
  | "adminChat"
  | "bulk"
  | "victimChallenge"
  | "completed"
  | "cancelledByVictim"
  | "socialLike"
  | "socialComment"
  | "newFollower"
  | "ratingReceived"
  | "counselorVerified"
  | "counselorRejected"
  | "contractAwaiting"
  | "contractSigned"
  | "reminder"
  | "challengeWon"
  | /* v1.14.0: منظومة العيادات */ "clinicSuggested"
  | "clinicBookingNew"
  | "clinicBookingConfirmed"
  | "clinicBookingCancelled"
  | "clinicBookingCancelledByClient"
  | "clinicVisitCompleted"
  | "clinicAdApproved"
  | "clinicAdRejected"
  | /* v1.15.0: مستحقات الإعلان */ "clinicAdDues"
  | "clinicAdPaidConfirmed"
  | "test";

export type NotifLang = "ar" | "fr" | "en" | "tr" | "ru" | "zh";

export const TEXTS: Record<NotifKey, Record<NotifLang, { title: string; body: string }>> = {
  booked: {
    ar: { title: "🔔 طلب استشارة جديد", body: "العميل {name} يطلب جلسة استشارة — راجع لوحتك للقبول أو تغيير الموعد" },
    fr: { title: "🔔 Nouvelle demande de consultation", body: "Le client {name} demande une séance — acceptez ou proposez un autre horaire depuis votre tableau de bord" },
    en: { title: "🔔 New consultation request", body: "Client {name} requests a session — accept or reschedule from your dashboard" },
    tr: { title: "🔔 Yeni danışmanlık talebi", body: "{name} adlı müşteri bir seans talep ediyor — panonuzdan kabul edin veya saati değiştirin" },
    ru: { title: "🔔 Новый запрос на консультацию", body: "Клиент {name} запрашивает сессию — примите или измените время в вашей панели" },
    zh: { title: "🔔 新的咨询请求", body: "客户 {name} 请求预约会话——请在控制面板接受或改期" },
  },
  accepted: {
    ar: { title: "✅ تأكيد حجز استشارتك", body: "الأخصائي {name} قبل موعدك — موعد الجلسة: {when} — تفاصيل الغرفة في «جلستي»" },
    fr: { title: "✅ Consultation confirmée", body: "Le professionnel {name} a confirmé votre rendez-vous — horaire : {when} — détails dans Mes séances" },
    en: { title: "✅ Consultation confirmed", body: "Specialist {name} confirmed your booking — session time: {when} — details in My sessions" },
    tr: { title: "✅ Danışmanlık randevunuz onaylandı", body: "Uzman {name} randevunuzu onayladı — seans saati: {when} — ayrıntılar Seanslarım'da" },
    ru: { title: "✅ Консультация подтверждена", body: "Специалист {name} подтвердил вашу запись — время: {when} — подробности в Моих сессиях" },
    zh: { title: "✅ 咨询预约已确认", body: "专家 {name} 已确认您的预约——会话时间：{when}——详情见「我的会话」" },
  },
  started: {
    ar: { title: "🟢 جلستك بدأت الآن", body: "الأخصائي {name} في انتظارك داخل غرفة الجلسة" },
    fr: { title: "🟢 Votre séance commence", body: "Le professionnel {name} vous attend dans la salle de séance" },
    en: { title: "🟢 Your session is starting", body: "Specialist {name} is waiting for you in the session room" },
    tr: { title: "🟢 Seansınız başlıyor", body: "Uzman {name} seans odasında sizi bekliyor" },
    ru: { title: "🟢 Ваша сессия начинается", body: "Специалист {name} ждёт вас в комнате сессии" },
    zh: { title: "🟢 您的会话即将开始", body: "专家 {name} 正在会话房间中等候您" },
  },
  declined: {
    ar: { title: "ℹ️ بخصوص طلب استشارتك", body: "الأخصائي {name} غير متاح في الموعد المطلوب — يمكنك الحجز معه لاحقاً أو مع أخصائي آخر الآن" },
    fr: { title: "ℹ️ Concernant votre demande", body: "Le professionnel {name} n'est pas disponible à ce créneau — réservez plus tard avec lui ou avec un autre maintenant" },
    en: { title: "ℹ️ About your request", body: "Specialist {name} is unavailable at this time — book with him later or with another specialist now" },
    tr: { title: "ℹ️ Talebiniz hakkında", body: "Uzman {name} bu saatte müsait değil — daha sonra onunla veya şimdi başka bir uzmanla randevu alabilirsiniz" },
    ru: { title: "ℹ️ О вашем запросе", body: "Специалист {name} недоступен в это время — запишитесь к нему позже или к другому специалисту сейчас" },
    zh: { title: "ℹ️ 关于您的请求", body: "专家 {name} 在该时段暂无空档——您可以稍后与他预约，或现在预约其他专家" },
  },
  feedback: {
    ar: { title: "💚 متابعة أسبوعية", body: "كيف تشعر هذا الأسبوع؟ سجل تقييمك السريع" },
    fr: { title: "💚 Suivi hebdomadaire", body: "Comment vous sentez-vous cette semaine ?" },
    en: { title: "💚 Weekly follow-up", body: "How are you feeling this week? Quick check-in" },
    tr: { title: "💚 Haftalık takip", body: "Bu hafta kendinizi nasıl hissediyorsunuz? Hızlı değerlendirme" },
    ru: { title: "💚 Еженедельная связь", body: "Как вы себя чувствуете на этой неделе? Быстрая оценка" },
    zh: { title: "💚 每周回访", body: "本周您感觉如何？请快速记录您的状态" },
  },
  followUp: {
    ar: { title: "📅 جلسة متابعة مبرمجة", body: "حدّد لك الأخصائي {name} جلسة المتابعة القادمة — الموعد: {when} — راجع «جلستي»" },
    fr: { title: "📅 Séance de suivi programmée", body: "Le professionnel {name} a planifié votre prochaine séance — horaire : {when} — voir Mes séances" },
    en: { title: "📅 Follow-up scheduled", body: "Specialist {name} scheduled your next session — time: {when} — see My sessions" },
    tr: { title: "📅 Takip seansı planlandı", body: "Uzman {name} bir sonraki seansınızı planladı — saat: {when} — Seanslarım'a bakın" },
    ru: { title: "📅 Запланирована сессия продолжения", body: "Специалист {name} назначил вашу следующую сессию — время: {when} — см. Мои сессии" },
    zh: { title: "📅 已安排后续会话", body: "专家 {name} 已为您安排下一次会话——时间：{when}——请查看「我的会话」" },
  },
  treatmentEnded: {
    ar: { title: "🌿 اكتمال خطة المتابعة", body: "أنهى الأخصائي {name} خطة المتابعة النفسية — يمكنك حجز استشارة جديدة في أي وقت" },
    fr: { title: "🌿 Plan de suivi terminé", body: "Le professionnel {name} a clôturé votre plan de suivi psychologique — réservez une nouvelle consultation à tout moment" },
    en: { title: "🌿 Follow-up plan completed", body: "Specialist {name} closed your psychological follow-up plan — you can book a new consultation anytime" },
    tr: { title: "🌿 Takip planı tamamlandı", body: "Uzman {name} psikolojik takip planınızı tamamladı — istediğiniz zaman yeni bir danışmanlık rezerve edebilirsiniz" },
    ru: { title: "🌿 План сопровождения завершён", body: "Специалист {name} завершил ваш план психологического сопровождения — вы можете записаться на новую консультацию в любое время" },
    zh: { title: "🌿 随访计划已完成", body: "专家 {name} 已结束您的心理随访计划——您可以随时预约新的咨询" },
  },
  message: {
    ar: { title: "💬 رسالة جديدة في غرفة الجلسة", body: "{name}: {excerpt}" },
    fr: { title: "💬 Nouveau message dans la salle", body: "{name} : {excerpt}" },
    en: { title: "💬 New message in the session room", body: "{name}: {excerpt}" },
    tr: { title: "💬 Seans odasında yeni mesaj", body: "{name}: {excerpt}" },
    ru: { title: "💬 Новое сообщение в комнате сессии", body: "{name}: {excerpt}" },
    zh: { title: "💬 会话房间有新消息", body: "{name}：{excerpt}" },
  },
  /* v2.8.0 + v2.12.0: تغيير موعد الجلسة — إشعار للطرف الآخر بالتفاصيل
     كاملة: الموعد القديم والموعد الجديد معاً */
  rescheduled: {
    ar: { title: "🔁 تغيير موعد الاستشارة", body: "قام {name} بتغيير الموعد من {old} إلى {when} — راجع «جلستي»" },
    fr: { title: "🔁 Horaire de consultation modifié", body: "{name} a modifié le rendez-vous : de {old} à {when} — voir Mes séances" },
    en: { title: "🔁 Consultation time changed", body: "{name} changed the appointment from {old} to {when} — see My sessions" },
    tr: { title: "🔁 Danışmanlık saati değişti", body: "{name} randevuyu {old} saatinden {when} saatine değiştirdi — Seanslarım'a bakın" },
    ru: { title: "🔁 Время консультации изменено", body: "{name} изменил(а) время с {old} на {when} — см. Мои сессии" },
    zh: { title: "🔁 咨询时间已变更", body: "{name} 已将预约从 {old} 改为 {when}——请查看「我的会话」" },
  },
  /* v2.8.0: رفض الطلب بسبب مذكور — يصل للعميل مع السبب نفسه */
  declinedReason: {
    ar: { title: "ℹ️ اعتذار عن طلب الاستشارة", body: "الأخصائي {name} يعتذر — السبب: {reason} — يمكنك الحجز مع أخصائي آخر فوراً" },
    fr: { title: "ℹ️ Demande refusée", body: "Le professionnel {name} se désole — motif : {reason} — vous pouvez réserver avec un autre professionnel" },
    en: { title: "ℹ️ Request declined", body: "Specialist {name} sends apologies — reason: {reason} — you can book with another specialist anytime" },
    tr: { title: "ℹ️ Talep reddedildi", body: "Uzman {name} özür diliyor — gerekçe: {reason} — istediğiniz zaman başka bir uzmanla randevu alabilirsiniz" },
    ru: { title: "ℹ️ Запрос отклонён", body: "Специалист {name} приносит извинения — причина: {reason} — вы можете записаться к другому специалисту" },
    zh: { title: "ℹ️ 请求已被婉拒", body: "专家 {name} 深表歉意——原因：{reason}——您可以随时预约其他专家" },
  },
  /* v2.8.0: رسالة في محادثة ما قبل الجلسة (خيوط DM) — فقط للطرف الغائب */
  dm: {
    ar: { title: "💬 رسالة جديدة", body: "{name}: {excerpt}" },
    fr: { title: "💬 Nouveau message", body: "{name} : {excerpt}" },
    en: { title: "💬 New message", body: "{name}: {excerpt}" },
    tr: { title: "💬 Yeni mesaj", body: "{name}: {excerpt}" },
    ru: { title: "💬 Новое сообщение", body: "{name}: {excerpt}" },
    zh: { title: "💬 新消息", body: "{name}：{excerpt}" },
  },
  /* v2.10.0: رسالة في محادثة المختص مع الإدارة — للطرف الغائب فقط */
  adminChat: {
    ar: { title: "🛡️ رسالة في محادثة الإدارة", body: "{name}: {excerpt}" },
    fr: { title: "🛡️ Message du support administration", body: "{name} : {excerpt}" },
    en: { title: "🛡️ Administration chat message", body: "{name}: {excerpt}" },
    tr: { title: "🛡️ Yönetim sohbeti mesajı", body: "{name}: {excerpt}" },
    ru: { title: "🛡️ Сообщение в чате администрации", body: "{name}: {excerpt}" },
    zh: { title: "🛡️ 管理员聊天新消息", body: "{name}：{excerpt}" },
  },
  /* v2.8.0: الإشعار الجماعي من الإدارة */
  bulk: {
    ar: { title: "📣 إشعار من إدارة المنصة", body: "{text}" },
    fr: { title: "📣 Annonce de l'administration", body: "{text}" },
    en: { title: "📣 Platform administration notice", body: "{text}" },
    tr: { title: "📣 Platform yönetimi duyurusu", body: "{text}" },
    ru: { title: "📣 Объявление администрации", body: "{text}" },
    zh: { title: "📣 平台管理通知", body: "{text}" },
  },
  /* v2.9.0: فائز تحدي الالتزام للعميلين */
  victimChallenge: {
    ar: { title: "👑 فائز جديد في تحدي الالتزام!", body: "أول من التزم بـ4 مواعيد متتالية: {name} — راجع لوحة الإدارة" },
    fr: { title: "👑 Nouveau gagnant du défi d'assiduité !", body: "Premier à respecter 4 rendez-vous consécutifs : {name} — consultez le panneau d'administration" },
    en: { title: "👑 New commitment challenge winner!", body: "First to keep 4 consecutive appointments: {name} — check the admin panel" },
    tr: { title: "👑 Yeni bağlılık mücadelesi kazananı!", body: "Üst üste 4 randevuya uyan ilk kişi: {name} — yönetim paneline bakın" },
    ru: { title: "👑 Новый победитель челленджа дисциплины!", body: "Первый, кто посетил 4 встречи подряд: {name} — проверьте панель администратора" },
    zh: { title: "👑 新的坚持挑战获胜者！", body: "首个连续赴约4次的人：{name} —— 请查看管理面板" },
  },
  /* v2.12.0: اكتمال الجلسة بلا متابعة مرتبطة — إشعار للعميل بالنتيجة */
  completed: {
    ar: { title: "🏁 اكتملت استشارتك", body: "أتم الأخصائي {name} جلستكما — كيف تشعر الآن؟ قيّم تجربتك من «جلستي»" },
    fr: { title: "🏁 Consultation terminée", body: "Le professionnel {name} a terminé votre séance — comment vous sentez-vous ? Évaluez depuis Mes séances" },
    en: { title: "🏁 Consultation completed", body: "Specialist {name} completed your session — how do you feel now? Rate it from My sessions" },
    tr: { title: "🏁 Danışmanlık tamamlandı", body: "Uzman {name} seansınızı tamamladı — şimdi nasıl hissediyorsunuz? Seanslarım'dan değerlendirin" },
    ru: { title: "🏁 Консультация завершена", body: "Специалист {name} завершил(а) вашу сессию — как вы себя чувствуете? Оцените в Моих сессиях" },
    zh: { title: "🏁 咨询已完成", body: "专家 {name} 已完成您的会话——您现在感觉如何？请在「我的会话」中评价" },
  },
  /* إلغاء العميل لطلبه — إشعار للأخصائي بالموعد الذي تحرّر */
  cancelledByVictim: {
    ar: { title: "ℹ️ ألغى العميل موعده", body: "العميل {name} ألغى طلب موعد {when} — صار الوقت متاحاً لعميل آخر" },
    fr: { title: "ℹ️ Rendez-vous annulé par le client", body: "Le client {name} a annulé la demande du {when} — le créneau est de nouveau disponible" },
    en: { title: "ℹ️ Client cancelled the appointment", body: "Client {name} cancelled the request for {when} — the slot is available again" },
    tr: { title: "ℹ️ Müşteri randevuyu iptal etti", body: "{name} adlı müşteri {when} tarihli talebi iptal etti — saat artık müsait" },
    ru: { title: "ℹ️ Клиент отменил запись", body: "Клиент {name} отменил запрос на {when} — время снова доступно" },
    zh: { title: "ℹ️ 客户已取消预约", body: "客户 {name} 取消了 {when} 的请求——该时段重新可用" },
  },
  /* v2.13.0: منشور جديد من أخصائي يتابعه المستخدم — القيمة الفعلية للمتابعة */
  /* v2.14.0: تفاعلات المجتمع + المتابعة + التقييمات — كل حالة لها إشعار */
  socialLike: {
    ar: { title: "❤️ إعجاب جديد بمنشورك", body: "أعجب {name} بمنشورك في المجتمع" },
    fr: { title: "❤️ Nouveau j'aime sur votre post", body: "{name} a aimé votre publication" },
    en: { title: "❤️ New like on your post", body: "{name} liked your post" },
    tr: { title: "❤️ Gönderinize yeni beğeni", body: "{name} gönderinizi beğendi" },
    ru: { title: "❤️ Новый лайк на вашем посте", body: "{name} оценил ваш пост" },
    zh: { title: "❤️ 您的帖子获得了新点赞", body: "{name} 赞了您的帖子" },
  },
  socialComment: {
    ar: { title: "💬 تعليق جديد على منشورك", body: "{name} علّق: {excerpt}" },
    fr: { title: "💬 Nouveau commentaire sur votre post", body: "{name} a commenté : {excerpt}" },
    en: { title: "💬 New comment on your post", body: "{name} commented: {excerpt}" },
    tr: { title: "💬 Gönderinize yeni yorum", body: "{name} yorum yaptı: {excerpt}" },
    ru: { title: "💬 Новый комментарий к вашему посту", body: "{name} прокомментировал: {excerpt}" },
    zh: { title: "💬 您的帖子收到了新评论", body: "{name} 评论：{excerpt}" },
  },
  newFollower: {
    ar: { title: "👥 متابع جديد", body: "بدأ {name} بمتابعة حسابك في المجتمع" },
    fr: { title: "👥 Nouvel abonné", body: "{name} a commencé à suivre votre profil" },
    en: { title: "👥 New follower", body: "{name} started following you" },
    tr: { title: "👥 Yeni takipçi", body: "{name} sizi takip etmeye başladı" },
    ru: { title: "👥 Новый подписчик", body: "{name} подписался на вас" },
    zh: { title: "👥 新的关注者", body: "{name} 开始关注您了" },
  },
  /* v1.5.0: إشعار التقييم يذكر اسم العميل صراحة (طلب المستخدم) */
  ratingReceived: {
    ar: { title: "⭐ تقييم جديد من عميل", body: "العميل {name} قيّمك بـ{stars} من 5 نجوم — شكراً لالتزامك" },
    fr: { title: "⭐ Nouvelle évaluation d'un client", body: "Le client {name} vous a donné {stars} étoiles sur 5 — merci pour votre engagement" },
    en: { title: "⭐ New rating from a client", body: "Client {name} rated you {stars} out of 5 stars — thank you for your commitment" },
    tr: { title: "⭐ Bir danışandan yeni değerlendirme", body: "{name} adlı müşteri size 5 üzerinden {stars} yıldız verdi — bağlılığınız için teşekkürler" },
    ru: { title: "⭐ Новый рейтинг от клиента", body: "Клиент {name} оценил вас на {stars} из 5 звёзд — спасибо за вашу преданность" },
    zh: { title: "⭐ 来自客户的新评分", body: "客户{name}给您评了5星中的{stars}星——感谢您的付出" },
  },
  /* v1.5.0: نتيجة توثيق الأخصائي من الإدارة تصل إشعاراً فورياً */
  counselorVerified: {
    ar: { title: "✅ تم توثيق حسابك المهني", body: "أكّدت إدارة منصة «طمأنينة» ملفك المهني — أصبحت ظاهراً للعميلين في دليل الأخصائيين جاهزاً لاستقبال الحجوزات" },
    fr: { title: "✅ Votre compte professionnel est vérifié", body: "L'administration de Tuma'anina a validé votre profil — vous êtes désormais visible dans l'annuaire et prêt à recevoir des réservations" },
    en: { title: "✅ Your professional account is verified", body: "The Tuma'anina administration approved your profile — you are now visible in the specialists directory and ready to receive bookings" },
    tr: { title: "✅ Profesyonel hesabınız doğrulandı", body: "Tuma'anina yönetimi profilinizi onayladı — artık uzman rehberinde görünüyorsunuz ve randevu almaya hazırsınız" },
    ru: { title: "✅ Ваш профессиональный аккаунт подтверждён", body: "Администрация Tuma'anina подтвердила ваш профиль — вы теперь видны в справочнике специалистов и готовы принимать записи" },
    zh: { title: "✅ 您的专业账号已通过认证", body: "Tuma'anina 管理团队已审核通过您的档案——您现已出现在专家目录中，可以接受预约" },
  },
  counselorRejected: {
    ar: { title: "ℹ️ بخصوص توثيق ملفك المهني", body: "لم تتم الموافقة على توثيق ملفك حالياً — راجع بيانات شهادتك من إعداداتك أو تواصل مع إدارة المنصة لإعادة الطلب" },
    fr: { title: "ℹ️ Concernant la vérification de votre profil", body: "Votre demande de vérification n'a pas été approuvée pour le moment — vérifiez votre diplôme dans vos paramètres ou contactez l'administration" },
    en: { title: "ℹ️ About your profile verification", body: "Your verification was not approved at this time — review your diploma details in settings or contact platform administration to reapply" },
    tr: { title: "ℹ️ Profil doğrulamanız hakkında", body: "Doğrulama talebiniz şu anda onaylanmadı — ayarlarınızdan diploma bilgilerinizi kontrol edin veya yeniden başvuru için yönetimle iletişime geçin" },
    ru: { title: "ℹ️ О проверке вашего профиля", body: "Ваша заявка на подтверждение пока не одобрена — проверьте данные диплома в настройках или свяжитесь с администрацией для повторной подачи" },
    zh: { title: "ℹ️ 关于您的档案认证", body: "您的认证申请暂时未获批准——请在设置中检查您的证书信息，或联系平台管理团队重新申请" },
  },
  /* v1.9.0: العقد العلاجي — إشعار للعميل عند القبول وإشعار للأخصائي عند الإمضاء */
  contractAwaiting: {
    ar: { title: "📜 عقد علاجي بانتظار إمضائك", body: "الأخصائي {name} قبل جلسك — يرجى قراءة العقد العلاجي وامضاؤه والضغط على «أقبل»" },
    fr: { title: "📜 Contrat thérapeutique à signer", body: "Le professionnel {name} a accepté votre séance — veuillez lire le contrat, le signer et appuyer sur « J'accepte »" },
    en: { title: "📜 Therapy contract awaiting your signature", body: "Specialist {name} accepted your session — please read the contract, sign it and press “I accept”" },
    tr: { title: "📜 Terapik sözleşme imzanızı bekliyor", body: "Uzman {name} seansınızı kabul etti — lütfen sözleşmeyi okuyun, imzalayın ve «Kabul ediyorum»a basın" },
    ru: { title: "📜 Терапевтический договор ждёт подписи", body: "Специалист {name} принял вашу сессию — прочитайте договор, подпишите и нажмите «Принимаю»" },
    zh: { title: "📜 治疗合同等待您的签署", body: "专家 {name} 已接受您的会话——请阅读合同、签名并点击「我接受」" },
  },
  contractSigned: {
    ar: { title: "📜 عقد علاجي موقّع من الطرفين", body: "العميل {name} امضى العقد العلاجي — النسخة النهائية محفوظة في إعداداتك" },
    fr: { title: "📜 Contrat signé par les deux parties", body: "Le client {name} a signé le contrat thérapeutique — la version finale est dans vos paramètres" },
    en: { title: "📜 Contract signed by both parties", body: "Client {name} signed the therapy contract — the final version is saved in your settings" },
    tr: { title: "📜 Sözleşme iki tarafça imzalandı", body: "Müşteri {name} terapik sözleşmeyi imzaladı — nihai sürüm ayarlarınızda kayıtlı" },
    ru: { title: "📜 Договор подписан обеими сторонами", body: "Клиент {name} подписал терапевтический договор — итоговая версия сохранена в ваших настройках" },
    zh: { title: "📜 双方已签署合同", body: "客户 {name} 已签署治疗合同——最终版本已保存在您的设置中" },
  },
  /* v1.6.0: تذكير ما قبل الجلسة بساعة — يُنشأ في server.js وreminders.ts
     ويعاد توليده هنا بلغة واجهة المستخدم الحالية في جرس الإشعارات */
  reminder: {
    ar: { title: "⏰ تذكير: جلستك بعد ساعة", body: "جلستك في «طمأنينة» بعد ساعة تقريباً — الغرفة تنتظركما" },
    fr: { title: "⏰ Rappel : votre séance dans une heure", body: "Votre séance sur Tumaanina commence dans une heure — la salle vous attend" },
    en: { title: "⏰ Reminder: your session in one hour", body: "Your Tumaanina session starts in about an hour — the room is waiting for you" },
    tr: { title: "⏰ Hatırlatma: seansınız bir saat sonra", body: "Tumaanina seansınız bir saat içinde başlıyor — oda sizi bekliyor" },
    ru: { title: "⏰ Напоминание: сессия через час", body: "Ваша сессия Tumaanina начнётся примерно через час — комната ждёт вас" },
    zh: { title: "⏰ 提醒：您的会话将在一小时后开始", body: "您的「心灵伴侣」会话约一小时后开始——房间正在等候二位" },
  },
  /* v1.6.0: فوز تحدي المختصين — يُعاد توليده بالغات الست في الجرس أيضاً */
  challengeWon: {
    ar: { title: "👑 فائز جديد في تحدي المنصة!", body: "أول فائز بالتحدي السري: {name} — راجع لوحة الإدارة للتفاصيل" },
    fr: { title: "👑 Nouveau gagnant du défi !", body: "Premier gagnant du défi secret : {name} — consultez le panneau d'administration" },
    en: { title: "👑 New challenge winner!", body: "First winner of the secret challenge: {name} — check the admin panel" },
    tr: { title: "👑 Yeni yarışma kazananı!", body: "Gizli yarışmanın ilk kazananı: {name} — ayrıntılar için yönetim paneline bakın" },
    ru: { title: "👑 Новый победитель испытания!", body: "Первый победитель секретного испытания: {name} — подробности в панели администрирования" },
    zh: { title: "👑 挑战新冠军诞生！", body: "秘密挑战的首位获胜者：{name} — 详情请查看管理面板" },
  },
  /* ═ v1.14.0: منظومة العيادات — اقتراح المختص، الحجز الحضوري، الإعلانات ═ */
  clinicSuggested: {
    ar: { title: "🧭 اقترح لك مختصك عيادة", body: "«{clinic}» في {wilaya} — التخصصات: {specs} — سنوات الخبرة: {years} — ملاحظة المختص: {note} — اضغط لعرض العيادة والحجز الحضوري" },
    fr: { title: "🧭 Votre spécialiste vous suggère une clinique", body: "« {clinic} » à {wilaya} — spécialités : {specs} — années d'expérience : {years} — note : {note} — touchez pour voir la clinique et réserver" },
    en: { title: "🧭 Your specialist suggests a clinic", body: "“{clinic}” in {wilaya} — specialties: {specs} — years of experience: {years} — note: {note} — tap to view the clinic and book" },
    tr: { title: "🧭 Uzmanınız size bir klinik önerdi", body: "“{clinic}” — {wilaya} — uzmanlıklar: {specs} — deneyim: {years} yıl — not: {note} — kliniği görmek ve randevu almak için dokunun" },
    ru: { title: "🧭 Ваш специалист предлагает клинику", body: "«{clinic}» в {wilaya} — специализации: {specs} — опыт: {years} лет — заметка: {note} — нажмите, чтобы открыть клинику и записаться" },
    zh: { title: "🧭 您的专家为您推荐了一家诊所", body: "「{clinic}」位于{wilaya}——专长：{specs}——经验：{years} 年——备注：{note}——点击查看诊所并预约" },
  },
  clinicBookingNew: {
    ar: { title: "📅 طلب حجز حضوري جديد", body: "العميل {name} يطلب موعداً حضورياً في «{clinic}» بتاريخ {when} — راجع لوحة عيادتك للتأكيد أو الإلغاء" },
    fr: { title: "📅 Nouvelle demande de rendez-vous", body: "Le client {name} demande une consultation présentielle à « {clinic} » le {when} — confirmez ou annulez depuis votre tableau de bord" },
    en: { title: "📅 New in-person booking request", body: "Client {name} requests an in-person visit at “{clinic}” on {when} — confirm or cancel from your dashboard" },
    tr: { title: "📅 Yeni yüz yüze randevu talebi", body: "Müşteri {name}, «{clinic}» kliniğinde {when} tarihli yüz yüze randevu istiyor — panonuzdan onaylayın veya iptal edin" },
    ru: { title: "📅 Новая заявка на очный приём", body: "Клиент {name} просит очный приём в «{clinic}» на {when} — подтвердите или отмените в вашей панели" },
    zh: { title: "📅 新的线下预约请求", body: "客户{name}申请在「{clinic}」于{when}进行线下就诊——请在您的面板确认或取消" },
  },
  clinicBookingConfirmed: {
    ar: { title: "✅ تأكيد حجزك الحضوري", body: "العيادة «{clinic}» أكدت موعدك الحضوري: {when} — العنوان: {address} — راجع صفحة العيادة لأي تواصل" },
    fr: { title: "✅ Votre rendez-vous est confirmé", body: "La clinique « {clinic} » a confirmé votre visite : {when} — adresse : {address} — consultez la page de la clinique pour tout contact" },
    en: { title: "✅ Your booking is confirmed", body: "“{clinic}” confirmed your in-person visit: {when} — address: {address} — see the clinic page for contact details" },
    tr: { title: "✅ Randevunuz onaylandı", body: "“{clinic}” kliniği yüz yüze randevunuzu onayladı: {when} — adres: {address} — iletişim için kliniğin sayfasına bakın" },
    ru: { title: "✅ Ваша запись подтверждена", body: "Клиника «{clinic}» подтвердила ваш очный приём: {when} — адрес: {address} — контактные данные на странице клиники" },
    zh: { title: "✅ 您的预约已确认", body: "「{clinic}」已确认您的线下就诊：{when}——地址：{address}——联系方式请查看诊所页面" },
  },
  clinicBookingCancelled: {
    ar: { title: "ℹ️ إلغاء حجز حضوري", body: "العيادة «{clinic}» ألغت موعدك: {when} — السبب: {reason} — يمكنك حجز موعد آخر من صفحة العيادة" },
    fr: { title: "ℹ️ Rendez-vous annulé", body: "La clinique « {clinic} » a annulé votre rendez-vous du {when} — motif : {reason} — vous pouvez réserver un autre créneau depuis la page de la clinique" },
    en: { title: "ℹ️ Booking cancelled", body: "“{clinic}” cancelled your appointment on {when} — reason: {reason} — you can book another slot from the clinic page" },
    tr: { title: "ℹ️ Randevu iptal edildi", body: "“{clinic}” kliniği {when} tarihli randevunuzu iptal etti — gerekçe: {reason} — kliniğin sayfasından yeni bir saat seçebilirsiniz" },
    ru: { title: "ℹ️ Приём отменён", body: "Клиника «{clinic}» отменила ваш приём {when} — причина: {reason} — выберите другое время на странице клиники" },
    zh: { title: "ℹ️ 预约已取消", body: "「{clinic}」取消了您在{when}的预约——原因：{reason}——您可以在诊所页面重新预约" },
  },
  clinicBookingCancelledByClient: {
    ar: { title: "ℹ️ العميل ألغى حجزه الحضوري", body: "العميل {name} ألغى موعد {when} في «{clinic}» — الوقت متاح الآن لعميل آخر" },
    fr: { title: "ℹ️ Le client a annulé son rendez-vous", body: "Le client {name} a annulé le rendez-vous du {when} à « {clinic} » — le créneau est de nouveau disponible" },
    en: { title: "ℹ️ Client cancelled the booking", body: "Client {name} cancelled the appointment on {when} at “{clinic}” — the slot is available again" },
    tr: { title: "ℹ️ Müşteri randevusunu iptal etti", body: "Müşteri {name}, «{clinic}» kliniğindeki {when} randevusunu iptal etti — saat yeniden müsait" },
    ru: { title: "ℹ️ Клиент отменил запись", body: "Клиент {name} отменил приём {when} в «{clinic}» — время снова свободно" },
    zh: { title: "ℹ️ 客户取消了预约", body: "客户{name}取消了{when}在「{clinic}」的预约——该时段重新可用" },
  },
  clinicVisitCompleted: {
    ar: { title: "🏁 اكتملت زيارتك الحضورية", body: "أنهت العيادة «{clinic}» موعدك — كيف كانت تجربتك؟ قيّم العيادة من صفحتها" },
    fr: { title: "🏁 Votre visite est terminée", body: "La clinique « {clinic} » a clôturé votre rendez-vous — comment s'est passée votre expérience ? Évaluez la clinique depuis sa page" },
    en: { title: "🏁 Your visit is completed", body: "“{clinic}” closed your appointment — how was your experience? Rate the clinic from its page" },
    tr: { title: "🏁 Ziyaretiniz tamamlandı", body: "“{clinic}” kliniği randevunuzu tamamladı — deneyiminiz nasıldı? Kliniği kendi sayfasından değerlendirin" },
    ru: { title: "🏁 Ваш визит завершён", body: "Клиника «{clinic}» закрыла ваш приём — как всё прошло? Оцените клинику на её странице" },
    zh: { title: "🏁 您的就诊已完成", body: "「{clinic}」已完成您的预约——体验如何？请在诊所页面进行评价" },
  },
  clinicAdDues: {
    ar: { title: "💳 مستحقات نشر إعلانك", body: "حددت الإدارة مستحقات نشر إعلانك «{title}» بمبلغ {amount} دج — تواصلي مع الإدارة لسدادها وتأكيد نشر إعلانك" },
    fr: { title: "💳 Frais de publication de votre annonce", body: "L'administration a fixé les frais de votre annonce « {title} » à {amount} DZD — contactez l'administration pour les régler et confirmer la publication" },
    en: { title: "💳 Ad publication fees due", body: "Administration set the publication fee for your ad “{title}” at {amount} DZD — contact administration to pay and confirm publication" },
    tr: { title: "💳 İlan yayınlama ücreti", body: "Yönetim “{title}” ilanınız için {amount} DZD ücret belirledi — yayını onaylamak için yönetimle iletişime geçin" },
    ru: { title: "💳 Оплата за публикацию объявления", body: "Администрация установила оплату за объявление «{title}» в размере {amount} DZD — свяжитесь с администрацией для оплаты и подтверждения публикации" },
    zh: { title: "💳 广告发布费用", body: "管理员已将您的广告「{title}」发布费用定为 {amount} DZD——请联系管理员付款以确认发布" },
  },
  clinicAdPaidConfirmed: {
    ar: { title: "✅ تم تأكيد سداد المستحقات", body: "أكدت الإدارة سداد مستحقات إعلانك «{title}» — سيتم نشر إعلانك قريباً إن لم يُنشَر بعد" },
    fr: { title: "✅ Paiement confirmé", body: "L'administration a confirmé le règlement des frais de votre annonce « {title} » — votre annonce sera publiée prochainement" },
    en: { title: "✅ Payment confirmed", body: "Administration confirmed the fees payment for your ad “{title}” — your ad will be published soon" },
    tr: { title: "✅ Ödeme onaylandı", body: "Yönetim “{title}” ilanınızın ücretinin ödendiğini onayladı — ilanınız yakında yayınlanacak" },
    ru: { title: "✅ Оплата подтверждена", body: "Администрация подтвердила оплату за объявление «{title}» — оно будет опубликовано в ближайшее время" },
    zh: { title: "✅ 付款已确认", body: "管理员已确认您的广告「{title}」的费用已付——您的广告即将发布" },
  },
  clinicAdApproved: {
    ar: { title: "✅ نُشر إعلان عيادتك", body: "«{title}» — أُكد نشر الإعلان بعد التأكد من السداد، وهو الآن ظاهر للجمهور في صفحة الإعلانات" },
    fr: { title: "✅ Votre annonce est publiée", body: "« {title} » — publication confirmée après vérification du paiement ; l'annonce est visible par le public" },
    en: { title: "✅ Your clinic ad is live", body: "“{title}” — publication confirmed after payment verification; the ad is now visible to the public" },
    tr: { title: "✅ Klinik ilanınız yayınlandı", body: "“{title}” — ödeme doğrulandıktan sonra yayın onaylandı; ilan artık herkese görünür" },
    ru: { title: "✅ Объявление клиники опубликовано", body: "«{title}» — публикация подтверждена после проверки оплаты; объявление теперь видно всем" },
    zh: { title: "✅ 您的诊所广告已发布", body: "「{title}」——已确认付款并发布；广告现已向公众展示" },
  },
  clinicAdRejected: {
    ar: { title: "ℹ️ بخصوص إعلان عيادتك", body: "«{title}» — لم تتم الموافقة على النشر حالياً — السبب: {reason} — راجع لوحة عيادتك لتعديل الإعلان" },
    fr: { title: "ℹ️ Concernant votre annonce", body: "« {title} » — publication non approuvée pour le moment — motif : {reason} — modifiez l'annonce depuis votre tableau de bord" },
    en: { title: "ℹ️ About your clinic ad", body: "“{title}” — the ad was not approved at this time — reason: {reason} — edit the ad from your dashboard" },
    tr: { title: "ℹ️ Klinik ilanınız hakkında", body: "“{title}” — ilan şu anda onaylanmadı — gerekçe: {reason} — ilanı panonuzdan düzenleyin" },
    ru: { title: "ℹ️ О вашем объявлении", body: "«{title}» — публикация пока не одобрена — причина: {reason} — отредактируйте объявление в вашей панели" },
    zh: { title: "ℹ️ 关于您的诊所广告", body: "「{title}」——该广告暂未获批——原因：{reason}——请在您的面板中修改" },
  },
  test: {
    ar: { title: "مرحباً بك في طمأنينة 💜", body: "الإشعارات تعمل بنجاح — أنت في أيدٍ أمينة" },
    fr: { title: "Bienvenue sur Tumaanina 💜", body: "Les notifications fonctionnent — vous êtes entre de bonnes mains" },
    en: { title: "Welcome to Tumaanina 💜", body: "Notifications work perfectly — you're in good hands" },
    tr: { title: "Tumaanina'ya hoş geldiniz 💜", body: "Bildirimler sorunsuz çalışıyor — güvenli ellerdesiniz" },
    ru: { title: "Добро пожаловать в Tumaanina 💜", body: "Уведомления работают отлично — вы в надёжных руках" },
    zh: { title: "欢迎来到 Tumaanina 💜", body: "通知功能运行正常——您在值得信赖的陪伴中" },
  },
};

/**
 * ملء المتغيرات {name} {when} {reason} {excerpt}… داخل نص الإشعار
 */
export function fill(tpl: string, vars?: Record<string, string> | null): string {
  if (!vars) return tpl;
  let out = tpl;
  for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v ?? ""));
  return out;
}
