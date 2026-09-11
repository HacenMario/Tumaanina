#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v1.2.0 — i18n الست لغات:
ثلاث عملات + لوحة الأخصائي + عمولة 15% للمختص فقط + تصحيح الهاتف
+ نزع لغة التطوع + تصحيح قائمة الثيمات (الأخضر الأطلسي)
"""
import re

BASE = "/home/z/my-project/tumaanina/src/lib/i18n"

T = {
  "ar": {
    "myStats": "إحصائياتي",
    "currencyLabel": "عملة عرض الأسعار",
    "curDZD": "دينار جزائري", "curEUR": "يورو", "curUSD": "دولار أمريكي",
    "thAtlas": "بنفسجي طمأنينة", "thAtlasGreen": "الأخضر الأطلسي",
    "privacyP1": "نجمع أدنى قدر ممكن من البيانات: اسمك المستعار ورقم هاتفك المرتبط بواتساب (إلزامي للتواصل حول جلساتك — يظهر لمختص جلستك أنت فقط)، مع الولاية والعمر واللغة (اختيارية). لا نطلب أبداً الاسم الحقيقي أو البريد الإلكتروني.",
    "victimBtn": "احجز استشارتك",
    "victimBtnLoggedIn": "متابعة حجوزاتك",
    "infoHint": "استمر في زيارة المنصة — أشياء جميلة في الطريق 👀",
    "myCert": "شهادة الاعتماد PDF",
    "notVerified": "شهادة الاعتماد تُمنح حصراً للأخصائيين الموثّقين في المنصة",
    "priceHint": "السعر بالدينار الجزائري — يظهر للعميل بعملة عرضه المختارة. عند اكتمال كل جلسة تُحسب عمولة المنصة (15%) وتظهر لك في «إحصائياتي» ضمن مستحقاتك الشهرية.",
    "cPriceHint": "بالدينار الجزائري — يظهر للعميل بعملة عرضه، وتُحسب عمولة المنصة 15% عند اكتمال كل جلسة.",
    "cdash": {
      "title": "لوحة الأخصائي", "subtitle": "إحصائيات جلساتك المكتملة ومستحقاتك — تحديث لحظي",
      "daily": "يومي", "weekly": "أسبوعي", "monthly": "شهري",
      "completedSessions": "جلسات مكتملة", "gross": "إجمالي المبيعات", "commission": "عمولة المنصة", "net": "صافي أرباحك",
      "dueTitle": "المستحق للمنصة هذا الشهر", "dueHint": "15% من أسعار جلساتك المكتملة هذا الشهر — يُسدَّد وفق الترتيب مع الإدارة.",
      "chartTitle": "المبيعات حسب الفترة", "recentTitle": "آخر الجلسات المكتملة", "empty": "لا جلسات مكتملة بعد",
      "months": ["يناير", "فبراير", "مارس", "أبريل", "ماي", "يونيو", "يوليوز", "غشت", "شتنبر", "أكتوبر", "نونبر", "دجنبر"],
    },
  },
  "en": {
    "myStats": "My stats",
    "currencyLabel": "Price display currency",
    "curDZD": "Algerian dinar", "curEUR": "Euro", "curUSD": "US dollar",
    "thAtlas": "Tumaanina purple", "thAtlasGreen": "Atlas green",
    "privacyP1": "We collect the minimum possible: your pseudonym and your WhatsApp phone number (required to coordinate your sessions — visible only to the specialist of your session), plus optional wilaya, age and language. We never ask for your real name or email.",
    "victimBtn": "Book your consultation",
    "victimBtnLoggedIn": "Your bookings",
    "infoHint": "Keep visiting the platform — lovely things on the way 👀",
    "myCert": "Accreditation certificate (PDF)",
    "notVerified": "The accreditation certificate is awarded exclusively to verified specialists on the platform",
    "priceHint": "Price in Algerian dinar — shown to clients in their chosen display currency. When a session completes, the platform commission (15%) is calculated and shown to you in My stats as part of your monthly dues.",
    "cPriceHint": "In Algerian dinar — shown in the client's display currency; a 15% platform commission applies per completed session.",
    "cdash": {
      "title": "Specialist dashboard", "subtitle": "Your completed sessions, earnings and platform dues — live",
      "daily": "Daily", "weekly": "Weekly", "monthly": "Monthly",
      "completedSessions": "Completed sessions", "gross": "Gross revenue", "commission": "Platform commission", "net": "Your net earnings",
      "dueTitle": "Platform dues this month", "dueHint": "15% of your completed sessions' prices this month — settled as arranged with the administration.",
      "chartTitle": "Revenue by period", "recentTitle": "Recent completed sessions", "empty": "No completed sessions yet",
      "months": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    },
  },
  "fr": {
    "myStats": "Mes statistiques",
    "currencyLabel": "Devise d'affichage des prix",
    "curDZD": "Dinar algérien", "curEUR": "Euro", "curUSD": "Dollar américain",
    "thAtlas": "Violet Tumaanina", "thAtlasGreen": "Vert Atlas",
    "privacyP1": "Nous collectons le minimum : votre pseudonyme et votre numéro WhatsApp (obligatoire pour coordonner vos séances — visible uniquement par le spécialiste de votre séance), avec wilaya, âge et langue en option. Nous ne demandons jamais votre vrai nom ni votre e-mail.",
    "victimBtn": "Réservez votre consultation",
    "victimBtnLoggedIn": "Vos réservations",
    "infoHint": "Continuez à visiter la plateforme — de belles choses arrivent 👀",
    "myCert": "Certificat d'accréditation (PDF)",
    "notVerified": "Le certificat d'accréditation est exclusivement accordé aux spécialistes vérifiés de la plateforme",
    "priceHint": "Prix en dinar algérien — visible par les clients dans la devise d'affichage choisie. À la fin de chaque séance, la commission de la plateforme (15%) est calculée et affichée dans Mes statistiques parmi vos dus mensuels.",
    "cPriceHint": "En dinar algérien — affiché dans la devise du client ; une commission de 15% s'applique par séance terminée.",
    "cdash": {
      "title": "Tableau de bord", "subtitle": "Vos séances terminées, revenus et dus — en direct",
      "daily": "Journalier", "weekly": "Hebdomadaire", "monthly": "Mensuel",
      "completedSessions": "Séances terminées", "gross": "Revenu brut", "commission": "Commission de la plateforme", "net": "Votre revenu net",
      "dueTitle": "Dû à la plateforme ce mois", "dueHint": "15% des prix de vos séances terminées ce mois — réglé selon accord avec l'administration.",
      "chartTitle": "Revenus par période", "recentTitle": "Séances terminées récentes", "empty": "Aucune séance terminée",
      "months": ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"],
    },
  },
  "tr": {
    "myStats": "İstatistiklerim",
    "currencyLabel": "Fiyat gösterim para birimi",
    "curDZD": "Cezayir dinarı", "curEUR": "Euro", "curUSD": "ABD doları",
    "thAtlas": "Tumaanina moru", "thAtlasGreen": "Atlas yeşili",
    "privacyP1": "En azını toplarız: takma adınız ve WhatsApp telefon numaranız (seanslarınızı koordine etmek için gerekli — yalnızca seansınızın uzmanı tarafından görünür); il, yaş ve dil isteğe bağlıdır. Asla gerçek adınızı veya e-postanızı istemeyiz.",
    "victimBtn": "Danışmanlık randevunuzu alın",
    "victimBtnLoggedIn": "Rezervasyonlarınız",
    "infoHint": "Ziyaret etmeye devam edin — güzel şeyler yolda 👀",
    "myCert": "Akreditasyon sertifikası (PDF)",
    "notVerified": "Akreditasyon sertifikası yalnızca platformda doğrulanmış uzmanlara verilir",
    "priceHint": "Fiyat Cezayir dinarı cinsindendir — müşteriye seçtiği para birimiyle görünür. Her tamamlanan seansta platform komisyonu (%15) hesaplanır ve İstatistiklerim'de aylık borçlarınız arasında görünür.",
    "cPriceHint": "Cezayir dinarı cinsinden — müşterinin para birimiyle görünür; her tamamlanan seansta %15 platform komisyonu uygulanır.",
    "cdash": {
      "title": "Uzman panosu", "subtitle": "Tamamlanan seanslar, kazançlar ve ödemeler — canlı",
      "daily": "Günlük", "weekly": "Haftalık", "monthly": "Aylık",
      "completedSessions": "Tamamlanan seanslar", "gross": "Brüt gelir", "commission": "Platform komisyonu", "net": "Net kazancınız",
      "dueTitle": "Bu ay platforma ödenecek", "dueHint": "Bu ay tamamlanan seans ücretlerinin %15'i — yönetimle anlaşmaya göre ödenir.",
      "chartTitle": "Döneme göre gelir", "recentTitle": "Son tamamlanan seanslar", "empty": "Henüz tamamlanan seans yok",
      "months": ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"],
    },
  },
  "ru": {
    "myStats": "Моя статистика",
    "currencyLabel": "Валюта отображения цен",
    "curDZD": "Алжирский динар", "curEUR": "Евро", "curUSD": "Доллар США",
    "thAtlas": "Фиолетовый Tumaanina", "thAtlasGreen": "Атласский зелёный",
    "privacyP1": "Мы собираем минимум: ваш псевдоним и номер телефона WhatsApp (обязателен для координации сессий — виден только специалисту вашей сессии); вилайя, возраст и язык — по желанию. Мы никогда не спрашиваем настоящее имя или e-mail.",
    "victimBtn": "Запишитесь на консультацию",
    "victimBtnLoggedIn": "Ваши записи",
    "infoHint": "Заходите ещё — впереди приятное 👀",
    "myCert": "Сертификат специалиста (PDF)",
    "notVerified": "Сертификат выдаётся исключительно проверенным специалистам платформы",
    "priceHint": "Цена в алжирских динарах — клиент видит её в выбранной валюте. По завершении сессии рассчитывается комиссия платформы (15%) и отображается в «Моя статистика» в составе ежемесячных задолженностей.",
    "cPriceHint": "В алжирских динарах — отображается в валюте клиента; комиссия платформы 15% за каждую завершённую сессию.",
    "cdash": {
      "title": "Панель специалиста", "subtitle": "Ваши завершённые сессии, доходы и задолженности — в реальном времени",
      "daily": "По дням", "weekly": "По неделям", "monthly": "По месяцам",
      "completedSessions": "Завершённые сессии", "gross": "Общий доход", "commission": "Комиссия платформы", "net": "Ваш чистый доход",
      "dueTitle": "Долг платформе за этот месяц", "dueHint": "15% от цен завершённых сессий этого месяца — оплата по договорённости с администрацией.",
      "chartTitle": "Доход по периодам", "recentTitle": "Последние завершённые сессии", "empty": "Пока нет завершённых сессий",
      "months": ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"],
    },
  },
  "zh": {
    "myStats": "我的统计",
    "currencyLabel": "价格显示货币",
    "curDZD": "阿尔及利亚第纳尔", "curEUR": "欧元", "curUSD": "美元",
    "thAtlas": "Tumaanina 紫", "thAtlasGreen": "阿特拉斯绿",
    "privacyP1": "我们只收集最少的数据：您的化名和WhatsApp电话号码（用于协调您的咨询——仅对您的咨询专家可见），地区、年龄和语言为可选。我们绝不要求您的真名或电子邮件。",
    "victimBtn": "预约您的咨询",
    "victimBtnLoggedIn": "您的预约",
    "infoHint": "常来看看——惊喜在路上 👀",
    "myCert": "认证证书（PDF）",
    "notVerified": "认证证书仅授予平台上已认证的专家",
    "priceHint": "价格以阿尔及利亚第纳尔设定——客户按其选择的货币查看。每次咨询完成后，平台佣金（15%）会计算并显示在「我的统计」的月度应付款项中。",
    "cPriceHint": "以阿尔及利亚第纳尔设定——按客户所选货币显示；每次完成的咨询收取15%平台佣金。",
    "cdash": {
      "title": "专家控制台", "subtitle": "您已完成的咨询、收入与应付款项——实时更新",
      "daily": "每日", "weekly": "每周", "monthly": "每月",
      "completedSessions": "已完成咨询", "gross": "总收入", "commission": "平台佣金", "net": "您的净收入",
      "dueTitle": "本月应付平台款项", "dueHint": "本月已完成咨询价格的15%——与管理部门协商支付。",
      "chartTitle": "按期收入", "recentTitle": "最近完成的咨询", "empty": "暂无已完成的咨询",
      "months": ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"],
    },
  },
}

def section_span(s, name):
    m = re.search(rf"\n  {name}: \{{", s)
    if not m:
        return None
    return (m.start(), s.find("\n  },", m.end()))

def process(lang):
    p = f"{BASE}/{lang}.ts"
    s = open(p, encoding="utf-8").read()
    t = T[lang]
    n_changes = 0

    def set_in_section(sec, key, value, count=1):
        nonlocal s, n_changes
        span = section_span(s, sec)
        if not span:
            print(f"[{lang}] WARN no section {sec}")
            return
        a, b = span
        body = s[a:b]
        pat = re.compile(rf"(\n[ \t]*{key}:)[ \t]*\n?[ \t]*\"[^\"]*\"")
        new_body, n = pat.subn(rf'\1 "{value}"', body, count=count)
        if n == 0:
            print(f"[{lang}] WARN key {sec}.{key} not found")
            return
        s = s[:a] + new_body + s[b:]
        n_changes += n

    # 1) nav.myStats — بعد dashboard في nav
    def insert_in_section(sec, anchor_key, insertion):
        nonlocal s, n_changes
        span = section_span(s, sec)
        if not span:
            return
        a, b = span
        body = s[a:b]
        anchor = re.search(rf"\n[ \t]*{anchor_key}: [^\n]*", body)
        if not anchor:
            print(f"[{lang}] WARN anchor {sec}.{anchor_key}")
            return
        body = body[:anchor.end()] + insertion + body[anchor.end():]
        s = s[:a] + body + s[b:]
        n_changes += 1

    insert_in_section("nav", "dashboard", f'\n    myStats: "{t["myStats"]}",')

    # 2) settings: currencyLabel + currencyNames بعد languageLabel
    insert_in_section("settings", "languageLabel",
        f'\n    currencyLabel: "{t["currencyLabel"]}",\n    currencyNames: {{ DZD: "{t["curDZD"]}", EUR: "{t["curEUR"]}", USD: "{t["curUSD"]}" }},')

    # 3) themes.list: atlas → بنفسجي + atlasgreen جديد
    span = section_span(s, "themes")
    if span:
        a, b = span
        body = s[a:b]
        body, n = re.subn(r'(atlas: ")[^"]*(")', rf'\g<1>{t["thAtlas"]}\2', body, count=1)
        if "atlasgreen" not in body:
            body = body.replace(f'atlas: "{t["thAtlas"]}",', f'atlas: "{t["thAtlas"]}",\n      atlasgreen: "{t["thAtlasGreen"]}",', 1)
        s = s[:a] + body + s[b:]
        n_changes += 1

    # 4) استبدال القيم
    set_in_section("info", "privacyP1", t["privacyP1"])
    set_in_section("roles", "victimBtn", t["victimBtn"])
    set_in_section("roles", "victimBtnLoggedIn", t["victimBtnLoggedIn"])
    set_in_section("info", "infoHint", t["infoHint"])
    set_in_section("counselor", "myCertificate", t["myCert"])
    set_in_section("certificate", "notVerifiedDesc", t["notVerified"])
    set_in_section("settings", "priceHint", t["priceHint"])
    set_in_section("counselor", "sessionPriceHint", t["cPriceHint"])

    # 5) إزالة client.cur (استُبدلت بعملات العرض)
    span = section_span(s, "client")
    if span:
        a, b = span
        body = s[a:b]
        body2, n = re.subn(r'\n[ \t]*cur: "[^"]*",', "", body)
        s = s[:a] + body2 + s[b:]
        n_changes += n

    # 6) قسم cdash الجديد — قبل القسم الختامي themes أو قبل />;
    months = ", ".join(f'"{m}"' for m in t["cdash"]["months"])
    cd = t["cdash"]
    block = f"""
  cdash: {{
    title: "{cd['title']}",
    subtitle: "{cd['subtitle']}",
    daily: "{cd['daily']}",
    weekly: "{cd['weekly']}",
    monthly: "{cd['monthly']}",
    completedSessions: "{cd['completedSessions']}",
    gross: "{cd['gross']}",
    commission: "{cd['commission']}",
    net: "{cd['net']}",
    dueTitle: "{cd['dueTitle']}",
    dueHint: "{cd['dueHint']}",
    chartTitle: "{cd['chartTitle']}",
    recentTitle: "{cd['recentTitle']}",
    empty: "{cd['empty']}",
    monthNames: [{months}],
  }},
}};"""
    # أدرج قبل آخر };
    idx = s.rstrip().rfind("};")
    s = s[:idx] + block.lstrip("\n") + s[idx + len("};"):]
    n_changes += 1

    # 7) tr خاص: registerTitle بلا «Gönüllü»
    if lang == "tr":
        s = s.replace("Gönüllü uzman olarak katılın", "Uzman olarak katılın")
        n_changes += 1

    open(p, "w", encoding="utf-8").write(s)
    print(f"[{lang}] done — {n_changes} changes")

for lang in ["ar", "en", "fr", "tr", "ru", "zh"]:
    process(lang)
print("ALL DONE")
