#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
v1.6.0 — إضافة 24 عبارة اطمئنان جديدة بأسلوب «ما تمرّ به ليس سهلاً…»
(طلب المستخدم: المزيد من العبارات المتعاطفة في الصفحة الرئيسية، تظهر
واحدة تلو الأخرى بلا تكرار حتى تظهر كلها — والدورة بلا تكرار موجودة،
والأدمين يديرها من تبويب «العبارات»).
تُزرع تلقائياً في القواعد القديمة عبر البذر التزايدي في /api/quotes.
"""
import json, io

PATH = "/home/z/my-project/tumaanina/shared/uplift-quotes.json"

NEW = [
    {
        "cat": "social", "au": "طمأنينة",
        "ar": "ما تمرّ به ليس سهلاً… لا تحمل همّك وحدك",
        "fr": "Ce que tu traverses n'est pas facile… ne porte pas ton fardeau seul(e)",
        "en": "What you're going through isn't easy… don't carry your burden alone",
        "tr": "Yaşadığın kolay değil… yükünü tek başına taşıma",
        "ru": "То, что ты переживаешь, непросто… не неси свой груз в одиночку",
        "zh": "你正在经历的不容易……别独自扛着你的重担",
    },
    {
        "cat": "social", "au": "طمأنينة",
        "ar": "من يوم لآخر، الشعور يتغيّر… وأنت تستحق وقتاً حتى تتعافى",
        "fr": "Jour après jour, les sentiments changent… tu mérites du temps pour guérir",
        "en": "Day by day, feelings change… you deserve time to heal",
        "tr": "Gün gün duygular değişir… iyileşmek için zamana ihtiyacın var",
        "ru": "День за днём чувства меняются… ты заслуживаешь времени, чтобы исцелиться",
        "zh": "日子一天天过去，感受也会变化……你值得有时间去愈合",
    },
    {
        "cat": "social", "au": "طمأنينة",
        "ar": "تقبّل شعورك اليوم كما هو… حتى الحزن ممرّ وليس عنواناً",
        "fr": "Accepte ton émotion d'aujourd'hui telle qu'elle est… même la tristesse est un passage, pas une adresse",
        "en": "Accept today's feeling as it is… even sadness is a passage, not a home",
        "tr": "Bugünkü duygunu olduğu gibi kabul et… hüzün bile bir geçit, adres değil",
        "ru": "Прими сегодняшнее чувство таким, каково оно есть… даже печаль — это переход, а не дом",
        "zh": "接纳你今天的情绪……即使悲伤也只是过客，不是归宿",
    },
    {
        "cat": "social", "au": "طمأنينة",
        "ar": "خطوة صغيرة اليوم خير من خطة كبيرة مؤجَّلة… ابدأ بنَفَس عميق",
        "fr": "Un petit pas aujourd'hui vaut mieux qu'un grand plan repoussé… commence par une respiration profonde",
        "en": "A small step today beats a big postponed plan… start with a deep breath",
        "tr": "Bugün atılan küçük bir adım, ertelenen büyük plandan iyidir… derin bir nefesle başla",
        "ru": "Маленький шаг сегодня лучше большого отложенного плана… начни с глубокого вдоха",
        "zh": "今天迈出的一小步胜过被推迟的大计划……从深呼吸开始",
    },
    {
        "cat": "social", "au": "طمأنينة",
        "ar": "طلب المساعدة ليس ضعفاً… إنه أولى خطوات الشجاعة",
        "fr": "Demander de l'aide n'est pas une faiblesse… c'est le premier pas du courage",
        "en": "Asking for help is not weakness… it's the first step of courage",
        "tr": "Yardım istemek zayıflık değil… cesaretin ilk adımıdır",
        "ru": "Просить о помощи — не слабость… это первый шаг смелости",
        "zh": "求助不是软弱……而是勇敢的第一步",
    },
    {
        "cat": "religious", "au": "طمأنينة",
        "ar": "أيقظتَ اليوم؟ هذه بداية جديدة… ورب جديد في كل يوم",
        "fr": "Tu es réveillé(e) aujourd'hui ? C'est un nouveau départ… et un nouveau commencement chaque jour",
        "en": "You woke up today? That's a fresh start… and a new beginning every day",
        "tr": "Bugün uyandın mı? İşte yeni bir başlangıç… her gün yeni bir başlangıçtır",
        "ru": "Ты проснулся сегодня? Это новое начало… и каждый день — новое начало",
        "zh": "你今天醒来了吗？这就是新的开始……每天都有新的开始",
    },
    {
        "cat": "religious", "au": "الحديث الشريف",
        "ar": "«إن الله يحب من إذا عمل عملاً أتقنه» — الشفاء يأتي بالصبر خطوة خطوة",
        "fr": "« Allah aime celui qui excelle dans son travail » — la guérison vient avec la patience, pas à pas",
        "en": "\"Allah loves whoever does a deed with excellence\" — healing comes with patience, step by step",
        "tr": "\"Allah, bir işi mükemmel yapanı sever\" — şifa sabırla, adım adım gelir",
        "ru": "«Аллах любит тех, кто делает дело наилучшим образом» — исцеление приходит с терпением, шаг за шагом",
        "zh": "「真主喜爱把事情做到最好的人」——治愈随耐心而来，一步一个脚印",
    },
    {
        "cat": "religious", "au": "القرآن الكريم",
        "ar": "«ولنبلونّكم بشيء من الخوف والجوع» — بعد الامتحان يأتي الرفقُ والعافية",
        "fr": "« Nous vous éprouverons par la peur et la faim » — après l'épreuve viennent la douceur et le mieux-être",
        "en": "\"We will surely test you with fear and hunger\" — after the trial come relief and wellness",
        "tr": "\"Sizi korku ve açlıkla imtihan edeceğiz\" — imtihandan sonra rahmet ve afiyet gelir",
        "ru": "«Мы непременно испытаем вас страхом и голодом» — после испытания приходят милосердие и благополучие",
        "zh": "「我必以些微的恐怖和饥馑考验你们」——考验之后是慈悯与安康",
    },
    {
        "cat": "wisdom", "au": "طمأنينة",
        "ar": "أنت لست نفسك في يومك الأسوأ… لا تحكم على طريقك من أخطر نقاطه",
        "fr": "Tu n'es pas la personne de ton pire jour… ne juge pas ta route par ses points les plus sombres",
        "en": "You are not your worst-day self… don't judge your road by its darkest points",
        "tr": "En kötü günündeki kişi değilsin… yolunu en karanlık noktalarından yargılama",
        "ru": "Ты — не тот человек из худшего дня… не суди свою дорогу по её тёмным точкам",
        "zh": "你并不是最糟糕那天的自己……别用最黑暗的片段评判你的路",
    },
    {
        "cat": "wisdom", "au": "طمأنينة",
        "ar": "الدموع ليست سقوطاً… إنها طريقة القلب في التخفيف عن نفسه",
        "fr": "Les larmes ne sont pas une chute… c'est la façon du cœur de se soulager",
        "en": "Tears are not a fall… they are the heart's way of easing itself",
        "tr": "Gözyaşları düşüş değil… kalbin kendini hafifletme yoludur",
        "ru": "Слёзы — не падение… так сердце облегчает себя",
        "zh": "流泪不是跌倒……那是心脏给自己减压的方式",
    },
    {
        "cat": "social", "au": "طمأنينة",
        "ar": "قل لنفسك اليوم كلمة طيبة… أنت من يستحق أن يسمعها أولاً",
        "fr": "Dis-toi aujourd'hui un mot doux… c'est toi qui mérites de l'entendre en premier",
        "en": "Say a kind word to yourself today… you're the one who deserves to hear it first",
        "tr": "Bugün kendine güzel bir söz söyle… önce onu duymayı hak eden sensin",
        "ru": "Скажи себе сегодня доброе слово… именно ты заслуживаешь услышать его первым",
        "zh": "今天对自己说句温柔的话……最值得先听到它的人就是你",
    },
    {
        "cat": "social", "au": "طمأنينة",
        "ar": "لا تقارن مشوارك بأحد… أنت تعرف جبالك، ولا يعرفها أحد سواك",
        "fr": "Ne compare pas ton parcours à celui des autres… toi seul connais tes montagnes",
        "en": "Don't compare your journey to anyone's… only you know your mountains",
        "tr": "Yolunu kimseyle karşılaştırma… dağlarını yalnızca sen bilirsin",
        "ru": "Не сравнивай свой путь с чужим… только ты знаешь свои горы",
        "zh": "别拿你的路和别人比较……只有你自己知道你翻过的山",
    },
    {
        "cat": "religious", "au": "طّمأنينة",
        "ar": "ادعُ بقلبك وإن خطر على لسانك… فالقولون الأعمق أقرب للإجابة",
        "fr": "Prie avec ton cœur même si les mots peinent… la supplication la plus profonde est la plus proche de la réponse",
        "en": "Pray with your heart even when words struggle… the deepest plea is closest to being answered",
        "tr": "Kelimeler zorlansa bile kalbinle dua et… en derin yalvarış cevaba en yakındır",
        "ru": "Молись сердцем, даже когда слова не идут… глубочайшая мольба ближе всего к ответу",
        "zh": "即使词不达意，也用你的心祈祷……最深的恳求离应答最近",
    },
    {
        "cat": "social", "au": "طمأنينة",
        "ar": "قلقك يدل على أنك تهتم… علّمه أن يستريح بين يديك أنت",
        "fr": "Ton anxiété montre que tu tiens à la vie… apprends-lui à se reposer entre tes mains",
        "en": "Your worry shows you care… teach it to rest in your hands",
        "tr": "Endişen önemsediğini gösterir… ona ellerinin arasında dinlenmeyi öğret",
        "ru": "Твоя тревога показывает, что тебе не всё равно… научи её отдыхать в твоих руках",
        "zh": "你的焦虑说明你在乎……教会它在你手中安歇",
    },
    {
        "cat": "wisdom", "au": "طمأنينة",
        "ar": "كل يوم لا تنهار فيه… هو انتصار صغير يستحق أن تلاحظه",
        "fr": "Chaque jour où tu tiens bon… est une petite victoire qui mérite d'être remarquée",
        "en": "Every day you hold on… is a small victory worth noticing",
        "tr": "Ayakta kaldığın her gün… fark edilmeyi hak eden küçük bir zaferdir",
        "ru": "Каждый день, когда ты держишься… — маленькая победа, которую стоит заметить",
        "zh": "你坚持下来的每一天……都是值得看见的小胜利",
    },
    {
        "cat": "social", "au": "طمأنينة",
        "ar": "النوم الجيد ليس ترفاً… إنه صيانة لقلبك وعقلك، ابدأ الليلة",
        "fr": "Bien dormir n'est pas un luxe… c'est l'entretien de ton cœur et ta tête, commence ce soir",
        "en": "Good sleep isn't a luxury… it's maintenance for your heart and mind, start tonight",
        "tr": "İyi uyku lüks değil… kalbinin ve zihninin bakımıdır, bu gece başla",
        "ru": "Хороший сон — не роскошь… это обслуживание сердца и разума, начни сегодня вечером",
        "zh": "睡个好觉不是奢侈……这是对心与脑的保养，今晚就开始",
    },
    {
        "cat": "wisdom", "au": "طمأنينة",
        "ar": "التعب الذي تشعر به ليس دليل فشل… إنه أثر الشخص الذي يواصل المحاولة",
        "fr": "La fatigue que tu ressens n'est pas un échec… c'est la trace de quelqu'un qui continue d'essayer",
        "en": "The tiredness you feel isn't failure… it's the mark of someone who keeps trying",
        "tr": "Hissettiğin yorgunluk başarısızlık değil… denemeye devam edenin izidir",
        "ru": "Усталость, которую ты чувствуешь, — не провал… это след человека, который продолжает пытаться",
        "zh": "你感到的疲惫不是失败……那是仍在努力的人留下的痕迹",
    },
    {
        "cat": "religious", "au": "القرآن الكريم",
        "ar": "«إن مع العسر يسراً» — وعود الله لا تتأخر، بل تزن وتُقاس",
        "fr": "« Avec la difficulté vient la facilité » — la promesse de Dieu ne tarde pas, elle se pèse et s'accomplit",
        "en": "\"Indeed, with hardship comes ease\" — God's promise is never late; it is measured and arrives",
        "tr": "\"Şüphesiz güçlükle beraber kolaylık vardır\" — Allah'ın vaadi gecikmez; tartılır ve gelir",
        "ru": "«Поистине, за тягостью — облегчение» — обещание Аллаха не опаздывает, оно выверено и приходит",
        "zh": "「与艰难相伴的，确是容易」——真主的应许从不迟到，它有分寸且必到来",
    },
    {
        "cat": "social", "au": "طمأنينة",
        "ar": "الجلسة القادمة ليست مجرد موعد… إنها مساحة صغيرة لأجل أنت",
        "fr": "La prochaine séance n'est pas un simple rendez-vous… c'est un petit espace rien que pour toi",
        "en": "Your next session isn't just an appointment… it's a small space reserved just for you",
        "tr": "Sonraki seans sadece bir randevu değil… sadece sana ayrılmış küçük bir alan",
        "ru": "Следующая сессия — не просто встреча… это маленькое пространство только для тебя",
        "zh": "下一次会谈不只是预约……那是专属于你的小小空间",
    },
    {
        "cat": "wisdom", "au": "طمأنينة",
        "ar": "التقدّم في الطريق الصعب لا يُقاس بالسرعة… بل بأنك ما زلت تمشي",
        "fr": "Sur une route difficile, le progrès ne se mesure pas à la vitesse… mais au fait que tu marches encore",
        "en": "On a hard road, progress isn't measured by speed… but by the fact you're still walking",
        "tr": "Zor bir yolda ilerleme hızla ölçülmez… hâlâ yürümenle ölçülür",
        "ru": "На трудной дороге прогресс измеряется не скоростью… а тем, что ты всё ещё идёшь",
        "zh": "在艰难的路上，进步不用速度衡量……而在于你仍在前行",
    },
    {
        "cat": "social", "au": "طمأنينة",
        "ar": "أن تظهر في يومك الصعب… شجاعة لا يراها الجميع",
        "fr": "Se montrer dans ses jours difficiles… c'est un courage que tout le monde ne voit pas",
        "en": "Showing up on your hard days… is a courage not everyone sees",
        "tr": "Zor günlerinde de ortaya çıkmak… herkesin görmediği bir cesarettir",
        "ru": "Появляться в свои трудные дни… это смелость, которую не все видят",
        "zh": "在最难的日子里依然出现……这是一种不被所有人看见的勇敢",
    },
    {
        "cat": "religious", "au": "طّمأنينة",
        "ar": "ثلاث تُريح القلب: الوضوء، والسجود، وثقة عميقة أن الله كفاك",
        "fr": "Trois choses apaisent le cœur : les ablutions, la prosternation, et la confiance profonde qu'Allah te suffit",
        "en": "Three things soothe the heart: ablution, prostration, and deep trust that Allah suffices you",
        "tr": "Kalbe üç şey rahatlık verir: abdest, secde ve \"Allah yeter\" derin güveni",
        "ru": "Три вещи успокаивают сердце: омовение, земной поклон и глубокая уверенность, что Аллах достаточен",
        "zh": "三件事抚慰心灵：小净、叩首，以及深信真主已使你满足",
    },
    {
        "cat": "wisdom", "au": "طمأنينة",
        "ar": "لا تحزم كل حزنك في جيبك… الحكي يُخفّف، والمكتوب يُفرَّغ",
        "fr": "Ne garde pas toute ta tristesse dans ta poche… parler allège, écrire libère",
        "en": "Don't pocket all your sadness… talking lightens, writing releases",
        "tr": "Hüzneni cebine sıkıştırma… konuşmak hafifletir, yazmak boşaltır",
        "ru": "Не носи всю свою грусть в кармане… разговор облегчает, письмо освобождает",
        "zh": "别把所有悲伤都揣在口袋里……倾诉使人轻松，书写使人释放",
    },
]

with io.open(PATH, "r", encoding="utf-8") as f:
    quotes = json.load(f)

existing = {q["ar"].strip() for q in quotes}
added = 0
for q in NEW:
    if q["ar"].strip() not in existing:
        quotes.append(q)
        added += 1

with io.open(PATH, "w", encoding="utf-8") as f:
    json.dump(quotes, f, ensure_ascii=False, indent=2)

print(f"ADDED {added} — TOTAL {len(quotes)}")
