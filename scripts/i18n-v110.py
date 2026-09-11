#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v1.1.0 — i18n الست لغات:
نزع كل ذكر للمحفظة والدفع الإلكتروني والمجان + الشعار الجديد + الدينار الجزائري
"""
import re

BASE = "/home/z/my-project/tumaanina/src/lib/i18n"

# ─── مفاتيح تُحذف سطراً كاملاً (بالاسم داخل أي قسم) ───
REMOVE_KEYS = [
    # nav
    "wallet",
    # client
    "yourBalance", "insufficientBalance", "goToWallet",
    "unpaidBadge", "paidBadge", "refundedBadge", "payNowBtn",
    # admin (لوحة المدفوعات أُزيلت كلياً)
    "tabPayments", "payApprovedOk", "payRejectedOk", "payTransfersTitle", "payWithdrawalsTitle",
    "payTransfersDesc", "payWithdrawalsDesc", "payTypeTransfers", "payTypeWithdrawals",
    "payRefLabel", "payMethodLabel", "payDateLabel", "payApprove", "payReject",
    "payMarkPaid", "payRefuseWithdraw", "payEmpty",
    "dashGross", "dashPaidOut", "dashRevenue", "dashPaymentsPending",
    # settings
    "walletCardTitle", "walletCardBalance", "walletCardBtn",
]

# ─── نصوص جديدة لكل لغة ───
T = {
  "ar": {
    "heroSubtitle": "منصة تجمعك بأخصائيين نفسيين مرخّصين عبر محادثة نصية أو صوتية أو مرئية — بأسعار واضحة بالدينار الجزائري وسرّية تامة. كل ما تحتاجه هو الرغبة في التجاوز.",
    "trustFree": "أسعار واضحة ومعلنة",
    "counselorDesc": "قدّم استشاراتك بسعر تحدده أنت بالدينار الجزائري — انضم بعد التحقق من شهادتك",
    "priceHint": "السعر بالدينار الجزائري — يظهر للعميل في بطاقتك وفي كل خطوات الحجز، ويُدفع مباشرة وفق اتفاقكما.",
    "aboutP2": "الجسد يُعالج في العيادات، أما الروح فتحتاج من تسمعها. لذلك بنينا جسراً آمناً يربطك بأخصائيين نفسيين موثّقين — عبر محادثة نصية أو صوتية أو مرئية، بأسعار واضحة وسرّية تامة.",
    "value3": "أسعار واضحة بالدينار الجزائري",
    "termsP4": "أسعار الجلسات معلنة بالدينار الجزائري على بطاقة كل أخصائي — يُدفع ثمن الجلسة مباشرة وفق اتفاق العميل مع المختص، والمنصة لا تجري أي مدفوعات إلكترونية ولا تمسك أي أموال.",
    "faq1Q": "كيف أدفع ثمن الجلسة؟",
    "faq1A": "سعر كل أخصائي معروض بالدينار الجزائري في بطاقته وفي كل خطوات الحجز — يُدفع مباشرة وفق ما تتفقان عليه (نقداً أو تحويلاً)، والمنصة لا تستخدم محافظ إلكترونية.",
    "tagline": "استشارات نفسية احترافية وسرّية — لتعود طمأنينتك",
    "s2Desc": "أنشئ حسابك بالاسم المستعار ورقمك — التسجيل سريع بلا أي توثيق.",
    "v3Desc": "سعر كل أخصائي معروض بالدينار الجزائري أمامك — تدفع مباشرة وفق اتفاقكما",
    "cSessionPriceLabel": "سعر الجلسة (دج) *",
    "cSessionPriceHint": "تظهر للعميل في بطاقتك وفي كل خطوات الحجز بالدينار الجزائري — بلا أي عمولة على المنصة.",
    "cur": "دج",
    "payNote": "الدفع يتم مباشرة مع المختص وفق ما تتفقان عليه (نقداً أو تحويلاً) — المنصة لا تجري أي مدفوعات إلكترونية.",
  },
  "en": {
    "heroSubtitle": "A fully confidential platform connecting you with licensed psychologists — by text, voice or video. Clear prices in Algerian dinar; all you need is the will to move forward.",
    "trustFree": "Clear, upfront pricing",
    "counselorDesc": "Offer consultations at your own price in Algerian dinar — join after credential verification",
    "priceHint": "Price in Algerian dinar — shown to clients on your card and throughout booking; paid directly as you both agree.",
    "aboutP2": "The body is treated in clinics; the soul needs someone to listen. So we built a safe bridge connecting you with verified psychologists — by text, voice or video, with clear prices and full confidentiality.",
    "value3": "Clear prices in Algerian dinar",
    "termsP4": "Session prices are listed in Algerian dinar on each specialist's card — payment is made directly as the client and specialist agree; the platform processes no electronic payments and holds no funds.",
    "faq1Q": "How do I pay for a session?",
    "faq1A": "Each specialist's price is shown in Algerian dinar on their card and at every booking step — you pay directly as you both agree (cash or transfer); the platform uses no electronic wallets.",
    "tagline": "Professional, confidential consultation — let your peace of mind return",
    "s2Desc": "Create your account with a pseudonym and phone number — quick signup, no verification needed.",
    "v3Desc": "Each specialist's price is shown in Algerian dinar — you pay directly as you agree",
    "cSessionPriceLabel": "Session price (DZD) *",
    "cSessionPriceHint": "Shown to clients on your card and at every booking step in Algerian dinar — no platform commission.",
    "cur": "DZD",
    "payNote": "Payment is made directly with the specialist as you agree (cash or transfer) — the platform processes no electronic payments.",
  },
  "fr": {
    "heroSubtitle": "Une plateforme entièrement confidentielle qui vous met en relation avec des psychologues agréés — par texte, voix ou vidéo. Des prix clairs en dinar algérien ; il vous suffit de vouloir avancer.",
    "trustFree": "Tarifs clairs et annoncés",
    "counselorDesc": "Proposez des consultations au prix que vous fixez, en dinar algérien — rejoignez-nous après vérification de vos diplômes",
    "priceHint": "Prix en dinar algérien — visible par les clients sur votre fiche et à chaque étape de réservation ; payé directement selon votre accord.",
    "aboutP2": "Le corps se soigne dans les cliniques ; l'âme, elle, a besoin d'être écoutée. Nous avons donc bâti un pont sûr vers des psychologues vérifiés — par texte, voix ou vidéo, avec des prix clairs et une confidentialité totale.",
    "value3": "Des prix clairs en dinar algérien",
    "termsP4": "Les prix des séances sont indiqués en dinar algérien sur la fiche de chaque spécialiste — le paiement se fait directement selon l'accord entre le client et le spécialiste ; la plateforme ne traite aucun paiement électronique et ne détient aucun fonds.",
    "faq1Q": "Comment payer la séance ?",
    "faq1A": "Le prix de chaque spécialiste est affiché en dinar algérien sur sa fiche et à chaque étape de réservation — vous payez directement selon votre accord (espèces ou virement) ; la plateforme n'utilise aucun portefeuille électronique.",
    "tagline": "Des consultations professionnelles et confidentielles — retrouvez votre sérénité",
    "s2Desc": "Créez votre compte avec un pseudonyme et votre numéro — inscription rapide, sans aucune vérification.",
    "v3Desc": "Le prix de chaque spécialiste est affiché en dinar algérien — vous payez directement selon votre accord",
    "cSessionPriceLabel": "Prix de la séance (DZD) *",
    "cSessionPriceHint": "Visible par les clients sur votre fiche et à chaque étape de réservation, en dinar algérien — aucune commission de la plateforme.",
    "cur": "DZD",
    "payNote": "Le paiement se fait directement avec le spécialiste comme convenu (espèces ou virement) — la plateforme ne traite aucun paiement électronique.",
  },
  "tr": {
    "heroSubtitle": "Ruhsatlı psikologlarla tam gizlilik içinde buluşan bir platform — yazılı sohbet, sesli veya görüntülü görüşme ile. Cezayir dinarında net fiyatlar; tek ihtiyacınız olan iyileşme isteği.",
    "trustFree": "Net ve önceden belirlenmiş fiyatlar",
    "counselorDesc": "Danışmanlıkları Cezayir dinarı cinsinden kendinizin belirlediği fiyatla sunun — diploma doğrulamasından sonra katılın",
    "priceHint": "Fiyat Cezayir dinarı cinsindendir — kartınızda ve rezervasyonun her adımında müşteriye görünür; anlaşmanıza göre doğrudan ödenir.",
    "aboutP2": "Beden kliniklerde tedavi edilir; ruh ise dinleyen birine ihtiyaç duyar. Bu yüzden doğrulanmış psikologlara güvenli bir köprü kurduk — yazılı, sesli veya görüntülü, net fiyatlar ve tam gizlilikle.",
    "value3": "Cezayir dinarıyla net fiyatlar",
    "termsP4": "Seans ücretleri, her uzmanın kartında Cezayir dinarı cinsinden belirtilir — ödeme, müşteri ile uzmanın anlaşmasına göre doğrudan yapılır; platform elektronik ödeme işlemaz ve hiçbir fon tutmaz.",
    "faq1Q": "Seans ücretini nasıl öderim?",
    "faq1A": "Her uzmanın fiyatı kartında ve rezervasyonun her adımında Cezayir dinarı olarak görünür — anlaşmanıza göre doğrudan ödersiniz (nakit veya havale); platform elektronik cüzdan kullanmaz.",
    "tagline": "Profesyonel ve gizli danışmanlık — huzurunuza kavuşun",
    "s2Desc": "Takma ad ve telefon numaranızla hesabınızı oluşturun — hızlı kayıt, doğrulama yok.",
    "v3Desc": "Her uzmanın fiyatı Cezayir dinarı olarak görünür — anlaşmanıza göre doğrudan ödersiniz",
    "cSessionPriceLabel": "Seans ücreti (DZD) *",
    "cSessionPriceHint": "Müşteriye kartınızda ve rezervasyonun her adımında Cezayir dinarı olarak görünür — platform komisyonu yok.",
    "cur": "DZD",
    "payNote": "Ödeme, anlaştığınız şekilde doğrudan uzmana yapılır (nakit veya havale) — platform elektronik ödeme işlemiyor.",
  },
  "ru": {
    "heroSubtitle": "Полностью конфиденциальная платформа, соединяющая вас с дипломированными психологами — текстовый чат, аудио- или видеозвонок. Понятные цены в алжирских динарах; нужно лишь желание двигаться вперёд.",
    "trustFree": "Понятные и открытые цены",
    "counselorDesc": "Проводите консультации по цене, которую вы устанавливаете сами, в алжирских динарах — присоединяйтесь после проверки дипломов",
    "priceHint": "Цена в алжирских динарах — видна клиентам в вашей карточке и на каждом шаге бронирования; оплачивается напрямую по договорённости.",
    "aboutP2": "Тело лечат в клиниках, а душе нужно, чтобы её выслушали. Поэтому мы построили безопасный мост к проверенным психологам — текст, голос или видео, с понятными ценами и полной конфиденциальностью.",
    "value3": "Понятные цены в алжирских динарах",
    "termsP4": "Цены на сессии указаны в алжирских динарах в карточке каждого специалиста — оплата производится напрямую по договорённости клиента и специалиста; платформа не проводит электронных платежей и не хранит средств.",
    "faq1Q": "Как оплатить сессию?",
    "faq1A": "Цена каждого специалиста указана в алжирских динарах в его карточке и на каждом шаге бронирования — вы платите напрямую по договорённости (наличными или переводом); платформа не использует электронные кошельки.",
    "tagline": "Профессиональные конфиденциальные консультации — пусть вернётся ваше спокойствие",
    "s2Desc": "Создайте аккаунт под псевдонимом с вашим номером — быстрая регистрация без проверок.",
    "v3Desc": "Цена каждого специалиста показана в алжирских динарах — вы платите напрямую по договорённости",
    "cSessionPriceLabel": "Цена сессии (DZD) *",
    "cSessionPriceHint": "Видна клиентам в вашей карточке и на каждом шаге бронирования в алжирских динарах — без комиссии платформы.",
    "cur": "DZD",
    "payNote": "Оплата производится напрямую со специалистом по договорённости (наличными или переводом) — платформа не проводит электронных платежей.",
  },
  "zh": {
    "heroSubtitle": "完全保密的平台，将您与持证心理专家连接起来——文字、语音或视频咨询皆有。价格以阿尔及利亚第纳尔清晰标示；您只需要一颗想要好起来的心。",
    "trustFree": "价格清晰透明",
    "counselorDesc": "以您自定、以阿尔及利亚第纳尔计的价格提供咨询——通过学历验证后即可加入",
    "priceHint": "价格以阿尔及利亚第纳尔显示——客户在您的卡片和预订每一步都能看到；按双方约定直接支付。",
    "aboutP2": "身体在医院治疗，而心灵需要被倾听。因此我们搭建了一座通往认证心理专家的安全桥梁——文字、语音或视频，价格清晰，完全保密。",
    "value3": "以阿尔及利亚第纳尔清晰定价",
    "termsP4": "每次咨询的价格以阿尔及利亚第纳尔标示在每位专家的卡片上——费用按客户与专家的约定直接支付；平台不进行任何电子支付，也不经手任何资金。",
    "faq1Q": "如何支付咨询费用？",
    "faq1A": "每位专家的价格在其卡片上及预订的每一步都以阿尔及利亚第纳尔显示——按双方约定直接支付（现金或转账）；平台不使用任何电子钱包。",
    "tagline": "专业而保密的心理咨询——愿您重拾内心安宁",
    "s2Desc": "用化名和电话号码创建账户——注册快捷，无需任何验证。",
    "v3Desc": "每位专家的价格以阿尔及利亚第纳尔明示——按约定直接支付",
    "cSessionPriceLabel": "咨询价格 (DZD) *",
    "cSessionPriceHint": "以阿尔及利亚第纳尔显示在您的卡片和预订每一步——平台不收取任何佣金。",
    "cur": "DZD",
    "payNote": "费用按双方约定直接支付给专家（现金或转账）——平台不进行任何电子支付。",
  },
}

def section_span(s, name):
    """يعيد (بداية، نهاية) لقسم المستوى الثاني باسم name"""
    m = re.search(rf"\n  {name}: \{{", s)
    if not m:
        return None
    start = m.start()
    end = s.find("\n  },", m.end())
    return (start, end)

def process(lang):
    p = f"{BASE}/{lang}.ts"
    s = open(p, encoding="utf-8").read()
    t = T[lang]
    changes = 0

    # 1) حذف المفاتيح عديمة الاستخدام (سطر كامل، في أي قسم)
    for key in REMOVE_KEYS:
        pat = re.compile(rf"^[ \t]*{key}: [^\n]*\n", re.M)
        s, n = pat.subn("", s)
        changes += n

    # 2) حذف قسم المحفظة كاملاً
    m = re.search(r"\n  wallet: \{.*?\n  \},", s, re.S)
    if m:
        s = s[:m.start()] + s[m.end():]
        changes += 1

    # 3) استبدال القيم حسب القسم
    def set_in_section(sec, key, value):
        nonlocal s, changes
        span = section_span(s, sec)
        if not span:
            print(f"[{lang}] WARN section {sec} missing")
            return
        a, b = span
        body = s[a:b]
        # قيمة بسطر واحد أو على سطر تالٍ
        pat = re.compile(rf"(\n[ \t]*{key}:)[ \t]*\n?[ \t]*\"[^\"]*\"")
        new_body, n = pat.subn(rf'\1 "{value}"', body, count=1)
        if n == 0:
            print(f"[{lang}] WARN key {sec}.{key} not found")
            return
        s = s[:a] + new_body + s[b:]
        changes += n

    set_in_section("landing", "heroSubtitle", t["heroSubtitle"])
    set_in_section("landing", "trustFree", t["trustFree"])
    set_in_section("roles", "counselorDesc", t["counselorDesc"])
    set_in_section("settings", "priceHint", t["priceHint"])
    set_in_section("info", "aboutP2", t["aboutP2"])
    set_in_section("info", "value3", t["value3"])
    set_in_section("info", "termsP4", t["termsP4"])
    set_in_section("info", "faq1Q", t["faq1Q"])
    set_in_section("info", "faq1A", t["faq1A"])
    set_in_section("footer", "tagline", t["tagline"])
    set_in_section("how", "s2Desc", t["s2Desc"])
    set_in_section("how", "v3Desc", t["v3Desc"])
    set_in_section("counselor", "sessionPriceLabel", t["cSessionPriceLabel"])
    set_in_section("counselor", "sessionPriceHint", t["cSessionPriceHint"])

    # 4) إضافة cur + payNote بعد sessionPriceLabel في قسم client
    span = section_span(s, "client")
    if span:
        a, b = span
        body = s[a:b]
        anchor = re.search(r"\n[ \t]*sessionPriceLabel: [^\n]*", body)
        if anchor:
            ins = f'\n    cur: "{t["cur"]}",\n    payNote: "{t["payNote"]}",'
            body = body[:anchor.end()] + ins + body[anchor.end():]
            s = s[:a] + body + s[b:]
            changes += 1
        else:
            print(f"[{lang}] WARN client.sessionPriceLabel missing")

    open(p, "w", encoding="utf-8").write(s)
    print(f"[{lang}] done — {changes} changes")

for lang in ["ar", "en", "fr", "tr", "ru", "zh"]:
    process(lang)
print("\nALL i18n DONE")
