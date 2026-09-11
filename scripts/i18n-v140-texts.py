#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tumaanina v1.4.0 — تحديثات نصية شاملة ×6:
   1) اسم المطوّر لاتينياً ثابتاً (MADOUNINE Hacene) في كل اللغات
   2) عبارة الهبوط: تواصل واتساب + «استشارة» بدل «محادثة» + مفاهيم علم النفس
   3) محو لغة الدعم/التطوع نحو نبرة تجارية احترافية
   4) مفاتيح الإشعارات المحلية (push.*) موائمة للقوالب الخلفية الجديدة"""

import io, re, sys

ROOT = "/home/z/my-project/tumaanina/src/lib/i18n"

def sub_file(path, pairs, add_keys=None):
    s = io.open(path, encoding="utf-8").read()
    miss = []
    for old, new in pairs:
        if old in s:
            s = s.replace(old, new, 1)
        else:
            miss.append(old[:40])
    if add_keys:
        for section, key, val in add_keys:
            sec_pat = re.compile(rf'(\n  {re.escape(section)}: \{{\n)')
            m = sec_pat.search(s)
            if m and not re.search(rf'\n    {re.escape(key)}: "', s[m.end():m.end()+6000]):
                s = s[:m.end(1)] + f'    {key}: "{val}",\n' + s[m.end(1):]
            else:
                miss.append(f"+{section}.{key}")
    io.open(path, "w", encoding="utf-8").write(s)
    return miss

fails = []

# ═══ العربية ═══
fails += sub_file(f"{ROOT}/ar.ts", [
  # اسم المطوّر لاتينياً
  ('byline: "من إنجاز مادونين حسان"', 'byline: "من إنجاز MADOUNINE Hacene"'),
  # الهبوط: واتساب + استشارة بدل محادثة + مفاهيم علم النفس
  ('heroSubtitle: "منصة تجمعك بأخصائيين نفسيين مرخّصين عبر محادثة نصية أو صوتية أو مرئية — بأسعار واضحة بالدينار الجزائري وسرّية تامة. كل ما تحتاجه هو الرغبة في التجاوز."',
   'heroSubtitle: "منصة استشارات نفسية تجمعك بأخصائيين مرخّصين — جلسة استشارة نصية أو صوتية أو مرئية، وتواصل مباشر عبر واتساب في كل مرحلة. بأسعار واضحة وسرّية مهنية تامة."'),
  # نبرة تجارية بدل الدعم/التطوع
  ('findHelp: "اطلب الدعم"', 'findHelp: "احجز استشارتك"'),
  ('statsSessions: "جلسة دعم"', 'statsSessions: "جلسة استشارة"'),
  ('children: "أحتاج دعماً لطفلي"', 'children: "متابعة نفسية لطفلي"'),
  ('children: "دعم الأطفال والمراهقين"', 'children: "علاج نفسي للأطفال والمراهقين"'),
  ('waIntro: "مرحباً {counselor}، أنا {victim} من منصة «طمأنينة». حجزت جلسة دعم ({mode}) بموضوع «{topic}» في الموعد {slot}. هل أنت متاح؟"',
   'waIntro: "مرحباً {counselor}، أنا {client} من منصة «طمأنينة». حجزت جلسة استشارة ({mode}) بموضوع «{topic}» في الموعد {slot}. هل أنت متاح؟"'),
  ('infoLine3: "مع هدية مقدمة من الإدارة تقديراً لتفانيه في دعم العملاء"', 'infoLine3: "مع رصيد تقديري من الإدارة تقديراً لالتزامه المهني مع عملائه"'),
  ('subjectPlaceholder: "مثال: إضافة دعم اللغة الأمازيغية..."', 'subjectPlaceholder: "مثال: إضافة اللغة الأمازيغية إلى واجهة المنصة..."'),
  ('"طمأنينة منصة دعم نفسي وقائي، وليست بديلاً عن الطوارئ الطبية. في حالة خطر مباشر على الحياة، اتصل فوراً بخدمات الطوارئ (الدفاع المدني 14)."',
   '"طمأنينة منصة استشارات نفسية عبر الإنترنت، وليست بديلاً عن التدخل الطبي الطارئ. في حالة خطر مباشر على الحياة، اتصل فوراً بخدمات الطوارئ (الدفاع المدني 14)."'),
  ('desc: "منشورات الأخصائيين النفسانيين: نصائح وتوعية ودعم مفتوح للجميع — تابع حسابات من تثق بهم وأبدِ رأيك بحرية"',
   'desc: "مقالات ونصائح نفسية من أخصائيين موثّقين — تابع حسابات من تثق بهم واستفد من خبرتهم المهنية"'),
  ('subtitle: "شرح مبسّط لرحلتك في طمأنينة — من أول زيارة إلى غرفة الدعم الآمنة"',
   'subtitle: "شرح مبسّط لرحلتك في طمأنينة — من أول زيارة إلى غرفة الجلسة الآمنة"'),
  # الإشعارات المحلية (push.*) موائمة للقوالب الجديدة
  ('bookedTitle: "🔔 طلب جلسة جديد"', 'bookedTitle: "🔔 طلب استشارة جديد"'),
  ('bookedBody: "عميل جديد يطلب جلسة دعم — راجع لوحتك"', 'bookedBody: "العميل {name} يطلب جلسة استشارة — راجع لوحتك"'),
  ('acceptedTitle: "✅ قُبلت جلسة الدعم"', 'acceptedTitle: "✅ تأكيد حجز استشارتك"'),
  ('acceptedBody: "أكّد الأخصائي حجزك — ستصلك تفاصيل الغرفة الآمنة"', 'acceptedBody: "الأخصائي {name} قبل موعدك — تفاصيل الغرفة في «جلستي»"'),
  ('startedBody: "الأخصائي في انتظارك داخل الغرفة الآمنة"', 'startedBody: "الأخصائي {name} في انتظارك داخل غرفة الجلسة"'),
  ('declinedBody: "اعتذر الأخصائي — يمكنك حجز جلسة مع أخصائي آخر فوراً"', 'declinedBody: "الأخصائي {name} غير متاح — يمكنك الحجز مع أخصائي آخر فوراً"'),
  ('treatmentEndedTitle: "🌿 اكتمال مسار المتابعة"', 'treatmentEndedTitle: "🌿 اكتمال خطة المتابعة"'),
  ('treatmentEndedBody: "أنهى أخصائيك مسار الدعم — أنت لست وحدك، يمكنك الحجز مجدداً في أي وقت"',
   'treatmentEndedBody: "أنهى الأخصائي {name} خطة المتابعة النفسية — يمكنك حجز استشارة جديدة في أي وقت"'),
  ('messageBody: "لديك رسالة جديدة من {name} — افتح الغرفة الآمنة للرد"', 'messageBody: "لديك رسالة جديدة من {name} — افتح غرفة الجلسة للرد"'),
  ('reminderBody: "جلستك في «طمأنينة» بعد ساعة تقريباً — الغرفة تنتظركما"', 'reminderBody: "جلستك مع أخصائيك بعد ساعة تقريباً — غرفة الجلسة تنتظركما"'),
  # أسئلة/شروط قد تحمل لغة الدعم
  ('contactVolunteers: "الأخصائيون المختصون"', 'contactSpecialists: "الأخصائيون المرخّصون"'),
])

# ═══ الفرنسية ═══
fails += sub_file(f"{ROOT}/fr.ts", [
  ('byline: "par Madounine Hacene"', 'byline: "par MADOUNINE Hacene"'),
  ('heroSubtitle: "Une plateforme entièrement confidentielle qui vous met en relation avec des psychologues agréés — par texte, voix ou vidéo. Des prix clairs en dinar algérien ; il vous suffit de vouloir avancer."',
   'heroSubtitle: "Une plateforme de consultations psychologiques qui vous relie à des spécialistes agréés — séance par écrit, en audio ou en vidéo, et contact direct via WhatsApp à chaque étape. Des tarifs clairs et une confidentialité professionnelle totale."'),
  ('desc: "Publications des psychologues : conseils, sensibilisation et soutien ouvert à tous — suivez les comptes en qui vous avez confiance et donnez votre avis librement"',
   'desc: "Articles et conseils psychologiques de spécialistes vérifiés — suivez les comptes en qui vous avez confiance et bénéficiez de leur expertise"'),
], [("push", "bookedBody", "Le client {name} demande une séance — consultez votre tableau de bord"),
    ("push", "acceptedBody", "Le professionnel {name} a confirmé votre rendez-vous — détails dans Mes séances"),
    ("push", "startedBody", "Le professionnel {name} vous attend dans la salle de séance"),
    ("push", "declinedBody", "Le professionnel {name} est indisponible — réservez avec un autre spécialiste"),
    ("push", "treatmentEndedBody", "Le professionnel {name} a clôturé votre plan de suivi — réservez à tout moment")])

# ═══ الإنجليزية ═══
fails += sub_file(f"{ROOT}/en.ts", [
  ('byline: "by Madounine Hacene"', 'byline: "by MADOUNINE Hacene"'),
  ('heroSubtitle: "A fully confidential platform connecting you with licensed psychologists — by text, voice or video. Clear prices in Algerian dinar; all you need is the will to move forward."',
   'heroSubtitle: "A psychological consultation platform connecting you with licensed specialists — written, audio or video sessions, plus direct WhatsApp contact at every step. Clear pricing and full professional confidentiality."'),
  ('desc: "Posts from licensed psychologists: tips, awareness and open support for everyone — follow the accounts you trust and share your thoughts freely"',
   'desc: "Psychology articles and tips from verified specialists — follow the accounts you trust and benefit from their professional expertise"'),
], [("push", "bookedBody", "Client {name} requests a session — check your dashboard"),
    ("push", "acceptedBody", "Specialist {name} confirmed your booking — details in My sessions"),
    ("push", "startedBody", "Specialist {name} is waiting in the session room"),
    ("push", "declinedBody", "Specialist {name} is unavailable — book with another specialist"),
    ("push", "treatmentEndedBody", "Specialist {name} closed your follow-up plan — book anytime")])

# ═══ التركية ═══
fails += sub_file(f"{ROOT}/tr.ts", [
  ('byline: "Geliştirici Hacen Mâaddoun\'un eseri"', 'byline: "MADOUNINE Hacene tarafından geliştirildi"'),
  ('heroSubtitle: "Ruhsatlı psikologlarla tam gizlilik içinde buluşan bir platform — yazılı sohbet, sesli veya görüntülü görüşme ile. Cezayir dinarında net fiyatlar; tek ihtiyacınız olan iyileşme isteği."',
   'heroSubtitle: "Ruhsatlı uzmanlarla psikolojik danışmanlık platformu — yazılı, sesli veya görüntülü seans ve her aşamada doğrudan WhatsApp iletişimi. Net fiyatlar ve tam mesleki gizlilik."'),
  ('desc: "Psikologların paylaşımları: ipuçları, farkındalık ve herkese açık destek — güvendiğiniz hesapları takip edin ve görüşlerinizi özgürce paylaşın"',
   'desc: "Doğrulanmış uzmanlardan psikoloji yazıları ve ipuçları — güvendiğiniz hesapları takip edin, mesleki birikimlerinden yararlanın"'),
], [("push", "bookedBody", "{name} adlı müşteri bir seans talep ediyor — panonuzu kontrol edin"),
    ("push", "acceptedBody", "Uzman {name} randevunuzu onayladı — ayrıntılar Seanslarım'da"),
    ("push", "startedBody", "Uzman {name} seans odasında sizi bekliyor"),
    ("push", "declinedBody", "Uzman {name} müsait değil — başka bir uzmanla randevu alabilirsiniz"),
    ("push", "treatmentEndedBody", "Uzman {name} takip planınızı tamamladı — istediğiniz zaman rezerve edin")])

# ═══ الروسية ═══
fails += sub_file(f"{ROOT}/ru.ts", [
  ('byline: "Создано разработчиком Хасеном Маадуном"', 'byline: "Разработано MADOUNINE Hacene"'),
  ('heroSubtitle: "Полностью конфиденциальная платформа, соединяющая вас с дипломированными психологами — текстовый чат, аудио- или видеозвонок. Понятные цены в алжирских динарах; нужно лишь желание двигаться вперёд."',
   'heroSubtitle: "Платформа психологических консультаций с дипломированными специалистами — сессии в тексте, аудио или видео и прямой контакт через WhatsApp на каждом этапе. Понятные цены и полная профессиональная конфиденциальность."'),
  ('desc: "Публикации психологов: советы, просвещение и открытая поддержка для всех — подписывайтесь на тех, кому доверяете, и свободно делитесь мнением"',
   'desc: "Статьи и советы психологов от проверенных специалистов — подписывайтесь на тех, кому доверяете, и пользуйтесь их профессиональным опытом"'),
], [("push", "bookedBody", "Клиент {name} запрашивает сессию — проверьте вашу панель"),
    ("push", "acceptedBody", "Специалист {name} подтвердил вашу запись — подробности в Моих сессиях"),
    ("push", "startedBody", "Специалист {name} ждёт вас в комнате сессии"),
    ("push", "declinedBody", "Специалист {name} недоступен — запишитесь к другому специалисту"),
    ("push", "treatmentEndedBody", "Специалист {name} завершил ваш план сопровождения — записывайтесь в любое время")])

# ═══ الصينية ═══
fails += sub_file(f"{ROOT}/zh.ts", [
  ('byline: "由开发者哈森·马阿敦倾力打造"', 'byline: "由 MADOUNINE Hacene 开发打造"'),
  ('heroSubtitle: "完全保密的平台，将您与持证心理专家连接起来——文字、语音或视频咨询皆有。价格以阿尔及利亚第纳尔清晰标示；您只需要一颗想要好起来的心。"',
   'heroSubtitle: "专业心理咨询平台，连接持证咨询师——文字、语音或视频会话，并在每个环节支持 WhatsApp 直接联系。价格透明，严守职业保密。"'),
  ('desc: "心理学家的分享：建议、科普与对所有人开放的支持——关注您信任的账号，自由表达您的想法"',
   'desc: "认证专家的心理学文章与建议——关注您信任的账号，汲取他们的专业经验"'),
], [("push", "bookedBody", "客户 {name} 请求预约会话——请查看您的控制面板"),
    ("push", "acceptedBody", "专家 {name} 已确认您的预约——详情见「我的会话」"),
    ("push", "startedBody", "专家 {name} 正在会话房间中等候您"),
    ("push", "declinedBody", "专家 {name} 暂无空档——您可以预约其他专家"),
    ("push", "treatmentEndedBody", "专家 {name} 已结束您的随访计划——您可以随时预约")])

print("MISSES:", fails if fails else "none")
sys.exit(1 if fails else 0)
