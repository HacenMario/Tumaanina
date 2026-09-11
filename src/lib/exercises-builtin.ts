/**
 * v2.14.0 — تمارين التهدئة المدمجة (طلب المستخدم).
 * تمرين 5-4-3-2-1 والمكان الآمن بنص المستخدم الكامل مترجمين إلى اللغات الست،
 * مع تمرين التنفس التفاعلي الموجود أصلاً في المنصة.
 * التمارين التي يضيفها المختصون/الأدمين تُخزَّن في قاعدة البيانات.
 */
export type ExerciseLang = "ar" | "fr" | "en" | "tr" | "ru" | "zh";

export interface BuiltinExercise {
  slug: "breathing" | "54321" | "safe-place";
  icon: string;
  minutes: number;
  interactive?: boolean;
  t: Record<ExerciseLang, { title: string; description: string; steps: string[] }>;
}

export const BUILTIN_EXERCISES: BuiltinExercise[] = [
  {
    slug: "breathing",
    icon: "🌬️",
    minutes: 3,
    interactive: true,
    t: {
      ar: {
        title: "تمرين التنفس الهادئ",
        description: "تمرين تنفّس موجَّه متحرك — اتبع الدائرة وهي تتمدد وتنكمش مع أنفاسك لتهدئة جهازك العصبي.",
        steps: [
          "اجلس بظهر مستقيم وارخِ كتفيك",
          "شهيق من الأنف مع تمدّد الدائرة",
          "احبس أنفاسك لحظة قصيرة",
          "زفير بطيء من الفم مع انكماش الدائرة",
          "كرّر بهدوء حتى تهدأ أفكارك",
        ],
      },
      fr: {
        title: "Respiration apaisante",
        description: "Exercice de respiration guidé animé — suivez le cercle qui se dilate et se contracte avec votre souffle pour apaiser votre système nerveux.",
        steps: [
          "Asseyez-vous le dos droit, relâchez les épaules",
          "Inspirez par le nez pendant que le cercle s'agrandit",
          "Retenez votre souffle un court instant",
          "Expirez lentement par la bouche pendant que le cercle rétrécit",
          "Répétez calmement jusqu'à ce que les pensées s'apaisent",
        ],
      },
      en: {
        title: "Calm Breathing",
        description: "Animated guided breathing — follow the circle as it expands and contracts with your breath to calm your nervous system.",
        steps: [
          "Sit with a straight back and relax your shoulders",
          "Inhale through your nose as the circle expands",
          "Hold your breath for a brief moment",
          "Exhale slowly through your mouth as the circle shrinks",
          "Repeat calmly until your thoughts settle",
        ],
      },
      tr: {
        title: "Sakinleştırıcı Nefes",
        description: "Animasyonlu rehberli nefes egzersizi — sinir sisteminizi sakinleştirmek için nefesinizle birlikte genişleyip daralan daireyi takip edin.",
        steps: [
          "Sırtınız dik olacak şekilde oturun, omuzlarınızı gevşetin",
          "Daire genişlerken burnunuzdan nefes alın",
          "Kısa bir an nefesinizi tutun",
          "Daire daralırken ağzınızdan yavaşça nefes verin",
          "Düşünceleriniz yatışıncaya kadar sakince tekrarlayın",
        ],
      },
      ru: {
        title: "Спокойное дыхание",
        description: "Анимированное управляемое дыхание — следите за кругом, который расширяется и сжимается вместе с вашим дыханием, успокаивая нервную систему.",
        steps: [
          "Сядьте с прямой спиной, расслабьте плечи",
          "Вдохните через нос, когда круг расширяется",
          "Задержите дыхание на короткий момент",
          "Медленно выдохните через рот, когда круг сжимается",
          "Повторяйте спокойно, пока мысли не утихнут",
        ],
      },
      zh: {
        title: "平静呼吸练习",
        description: "动画引导呼吸——跟随随呼吸扩张与收缩的圆圈，让神经系统平静下来。",
        steps: [
          "坐直身体，放松双肩",
          "圆圈扩张时用鼻子吸气",
          "短暂屏住呼吸",
          "圆圈收缩时用嘴缓慢呼气",
          "平静地重复，直到思绪安宁",
        ],
      },
    },
  },
  {
    slug: "54321",
    icon: "🖐️",
    minutes: 5,
    t: {
      ar: {
        title: "تمرين 5-4-3-2-1",
        description:
          "تمرين تأريض يعيدك إلى اللحظة الحاضرة عبر حواسّك الخمس — بعد أخذ نفس عميق وبطيء، سمِّ ما يلي بهدوء:",
        steps: [
          "5 أشياء تستطيع رؤيتها (قلم، مصباح، نافذة…)",
          "4 أشياء تستطيع لمسها والشعور بها (قماش ملابسك، الطاولة، جسم قريب…)",
          "3 أصوات تستطيع سماعها بوضوح (صوت مكيّف، مرور سيارات من النافذة…)",
          "رائحتان تستطيع شمّهما (عطر، قهوة أو هواء نقي…)",
          "شيء واحد تستطيع تذوّقه (طرف ماء أو طعم متبقٍ في فمك…)",
        ],
      },
      fr: {
        title: "Exercice 5-4-3-2-1",
        description:
          "Un exercice d'ancrage qui vous ramène à l'instant présent à travers vos cinq sens — après une respiration profonde et lente, nommez calmement :",
        steps: [
          "5 choses que vous pouvez voir (un stylo, une lampe, une fenêtre…)",
          "4 choses que vous pouvez toucher et sentir (le tissu de vos vêtements, la table, un objet proche…)",
          "3 sons que vous pouvez entendre clairement (la climatisation, les voitures dehors…)",
          "2 odeurs que vous pouvez sentir (un parfum, du café ou l'air frais…)",
          "1 chose que vous pouvez goûter (une goutte d'eau ou un goût résiduel dans la bouche…)",
        ],
      },
      en: {
        title: "5-4-3-2-1 Exercise",
        description:
          "A grounding exercise that brings you back to the present moment through your five senses — after a deep, slow breath, quietly name:",
        steps: [
          "5 things you can see (a pen, a lamp, a window…)",
          "4 things you can touch and feel (your clothing fabric, the table, a nearby object…)",
          "3 sounds you can hear clearly (air conditioning, traffic outside the window…)",
          "2 scents you can smell (perfume, coffee or fresh air…)",
          "1 thing you can taste (a sip of water or a lingering taste in your mouth…)",
        ],
      },
      tr: {
        title: "5-4-3-2-1 Egzersizi",
        description:
          "Beş duyunuz aracılığıyla sizi şimdiki ana geri getiren bir temellenme egzersizi — derin ve yavaş bir nefes aldıktan sonra sakince söyleyin:",
        steps: [
          "Görebildiğiniz 5 şey (kalem, lamba, pencere…)",
          "Dokunup hissedebildiğiniz 4 şey (kıyafetinizin kumaşı, masa, yakın bir nesne…)",
          "Net duyabildiğiniz 3 ses (klima, pencereden geçen arabalar…)",
          "Koklayabildiğiniz 2 koku (parfüm, kahve veya temiz hava…)",
          "Tadabildiğiniz 1 şey (bir yudum su veya ağzınızdaki kalıntı tat…)",
        ],
      },
      ru: {
        title: "Упражнение 5-4-3-2-1",
        description:
          "Упражнение на заземление, которое возвращает вас в настоящий момент через пять органов чувств — после глубокого медленного вдоха спокойно назовите:",
        steps: [
          "5 вещей, которые вы можете видеть (ручку, лампу, окно…)",
          "4 вещи, которые вы можете потрогать и почувствовать (ткань одежды, стол, близкий предмет…)",
          "3 звука, которые вы можете ясно слышать (кондиционер, машины за окном…)",
          "2 запаха, которые вы можете почувствовать (духи, кофе или свежий воздух…)",
          "1 вещь, которую вы можете попробовать на вкус (каплю воды или послевкусие во рту…)",
        ],
      },
      zh: {
        title: "5-4-3-2-1 练习",
        description: "一种通过五感将你带回当下的着陆练习——在深慢呼吸之后，平静地说出：",
        steps: [
          "5 样你能看见的东西（笔、灯、窗户…）",
          "4 样你能触摸感受的东西（衣服布料、桌子、近处物件…）",
          "3 种你能清楚听见的声音（空调声、窗外车流…）",
          "2 种你能闻到的气味（香水、咖啡或新鲜空气…）",
          "1 样你能尝到的东西（一滴水的味道或口中余味…）",
        ],
      },
    },
  },
  {
    slug: "safe-place",
    icon: "🏝️",
    minutes: 5,
    t: {
      ar: {
        title: "المكان الآمن (الملاذ الذهني)",
        description:
          "تخيّل مكاناً يمنحك شعوراً كاملاً بالأمان والراحة — ملاذك الذهني الذي تعود إليه متى شعرت بالضيق.",
        steps: [
          "أغمض عينيك وخذ نفساً عميقاً بطيئاً",
          "تخيّل مكاناً يمنحك شعوراً كاملاً بالأمان والراحة (شاطئ، غابة، غرفة دافئة…)",
          "ركّز على تفاصيله: الألوان، الروائح، الأصوات الهادئة",
          "لاحظ السكينة تنتشر في جسدك شيئاً فشيئاً",
          "ابقَ في مكانك الآمن حوالي 5 دقائق ثم افتح عينيك بهدوء",
        ],
      },
      fr: {
        title: "Le lieu sûr (le refuge mental)",
        description:
          "Imaginez un lieu qui vous procure un sentiment complet de sécurité et de confort — votre refuge mental où retourner dès que vous vous sentez mal.",
        steps: [
          "Fermez les yeux et prenez une profonde respiration lente",
          "Imaginez un lieu qui vous procure un sentiment complet de sécurité (plage, forêt, pièce chaleureuse…)",
          "Concentrez-vous sur ses détails : les couleurs, les odeurs, les sons paisibles",
          "Remarquez la sérénité se répandre dans votre corps peu à peu",
          "Restez dans votre lieu sûr environ 5 minutes puis ouvrez les yeux en douceur",
        ],
      },
      en: {
        title: "The Safe Place (Mental Sanctuary)",
        description:
          "Imagine a place that gives you a complete feeling of safety and comfort — your mental sanctuary to return to whenever you feel distressed.",
        steps: [
          "Close your eyes and take a deep, slow breath",
          "Imagine a place that gives you complete safety and comfort (a beach, a forest, a warm room…)",
          "Focus on its details: colors, scents, peaceful sounds",
          "Notice the serenity spreading through your body little by little",
          "Stay in your safe place for about 5 minutes, then gently open your eyes",
        ],
      },
      tr: {
        title: "Güvenli Yer (Zihinsel Sığınak)",
        description:
          "Size tam bir güvenlik ve huzur duygusu veren bir yeri hayal edin — sıkıntı hissettiğinizde geri dönebileceğiniz zihinsel sığınağınız.",
        steps: [
          "Gözlerinizi kapatın ve derin, yavaş bir nefes alın",
          "Size tam güvenlik ve rahatlık hissi veren bir yeri hayal edin (plaj, orman, sıcak bir oda…)",
          "Detaylarına odaklanın: renkler, kokular, huzurlu sesler",
          "Huzurun bedeninize yavaş yavaş yayıldığını fark edin",
          "Güvenli yerinizde yaklaşık 5 dakika kalın, sonra gözlerinizi yavaşça açın",
        ],
      },
      ru: {
        title: "Безопасное место (мысленное убежище)",
        description:
          "Представьте место, которое дарит вам полное чувство безопасности и комфорта — ваше мысленное убежище, куда можно возвращаться при тревоге.",
        steps: [
          "Закройте глаза и сделайте глубокий медленный вдох",
          "Представьте место полного покоя и безопасности (пляж, лес, тёплая комната…)",
          "Сосредоточьтесь на деталях: цвета, запахи, спокойные звуки",
          "Заметьте, как безмятежность постепенно разливается по телу",
          "Оставайтесь в безопасном месте около 5 минут, затем спокойно откройте глаза",
        ],
      },
      zh: {
        title: "安全之地（心灵避风港）",
        description: "想象一个给你完全安全与舒适感的地方——每当你感到不安时都可以回归的心灵避风港。",
        steps: [
          "闭上眼睛，做一次深慢呼吸",
          "想象一个给你完全安适的地方（海滩、森林、温暖的房间…）",
          "聚焦它的细节：颜色、气味、宁静的声音",
          "留意安宁一点点扩散到全身",
          "在你的安全之地停留约 5 分钟，然后缓缓睁开眼睛",
        ],
      },
    },
  },
];
