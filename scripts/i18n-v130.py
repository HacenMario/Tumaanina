#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tumaanina v1.3.0 — تحديث الترجمات الست لكل مفاتيح الجولة:
   أسعار ثلاث عملات، إشعار بالاسم/البريد، إلغاء/تغيير موعد للعميل، زر الطباعة."""

import io, re, sys

ROOT = "/home/z/my-project/tumaanina/src/lib/i18n"

# (المفتاح، القيمة) لكل لغة — إضافة أو استبدال حسب وجود المفتاح
REPL = {
"ar": [
  ("settings.priceHint", "حدّد سعر جلستك لكل عملة على حدة — يرى العميل سعر العملة التي يختارها فقط (بلا أي تحويل). عند اكتمال كل جلسة تُحسب عمولة المنصة (15%) وتظهر لك في «إحصائياتي»."),
  ("settings.priceInvalid", "قيمة سعر غير صالحة — حدود كل عملة: الدينار 200–20000، اليورو والدولار 2–150."),
  ("settings.photoUnsupported", "صيغة الصورة غير مدعومة — استخدم صورة JPEG أو PNG."),
  ("publicProfile.priceNote", "سعر الجلسة — الدفع مباشرة مع المختص دون أي وسيط إلكتروني."),
  ("admin.bulkUserLabel", "الاسم المستعار أو البريد الإلكتروني للمستخدم"),
  ("admin.bulkUserPlaceholder", "اسم مستعار أو بريد إلكتروني"),
  ("admin.bulkUserNotFound", "لا يوجد مستخدم بهذا الاسم المستعار أو البريد الإلكتروني"),
  ("client.cancelConfirmTitle", "إلغاء طلب الجلسة؟"),
  ("client.cancelConfirmDesc", "سيُبلَّغ المختص بإلغائك فوراً، ويتحرر الموعد لعميل آخر."),
  ("client.confirmCancel", "نعم، إلغاء الجلسة"),
  ("client.rescheduleTitle", "تغيير موعد جلستك"),
  ("client.rescheduleHint", "سيصل المختص إشعاراً بالموعد الجديد فور إرساله."),
  ("counselor.sessionPriceLabel", "أسعار الجلسة لكل عملة *"),
  ("counselor.sessionPriceHint", "حدد السعر بكل عملة — العميل يرى سعر عملته فقط، وتُحسب عمولة المنصة 15% عند اكتمال كل جلسة."),
  ("certificate.downloadBtn", "طباعة الشهادة / حفظ PDF"),
],
"fr": [
  ("settings.priceHint", "Définissez le prix de votre séance pour chaque devise — le client ne voit que le prix de la devise qu'il choisit (aucune conversion). À la fin de chaque séance, la commission de la plateforme (15%) est calculée et affichée dans Mes statistiques."),
  ("settings.priceInvalid", "Valeur de prix invalide — limites par devise : dinar 200–20000, euro et dollar 2–150."),
  ("settings.photoUnsupported", "Format d'image non pris en charge — utilisez un JPEG ou un PNG."),
  ("publicProfile.priceNote", "Prix de la séance — paiement direct avec le spécialiste, sans intermédiaire électronique."),
  ("admin.bulkUserLabel", "Pseudonyme ou adresse e-mail de l'utilisateur"),
  ("admin.bulkUserPlaceholder", "Pseudonyme ou e-mail"),
  ("admin.bulkUserNotFound", "Aucun utilisateur avec ce pseudonyme ou cet e-mail"),
  ("client.cancelConfirmTitle", "Annuler la demande de séance ?"),
  ("client.cancelConfirmDesc", "Le spécialiste sera immédiatement informé de votre annulation et le créneau sera libéré."),
  ("client.confirmCancel", "Oui, annuler la séance"),
  ("client.rescheduleTitle", "Modifier l'horaire de votre séance"),
  ("client.rescheduleHint", "Le spécialiste recevra une notification avec le nouvel horaire dès l'envoi."),
  ("counselor.sessionPriceLabel", "Prix de la séance par devise *"),
  ("counselor.sessionPriceHint", "Définissez le prix dans chaque devise — le client voit celui de sa devise ; une commission de 15% s'applique par séance terminée."),
  ("certificate.downloadBtn", "Imprimer le certificat / Enregistrer en PDF"),
],
"en": [
  ("settings.priceHint", "Set your session price per currency — clients see only the price of the currency they choose (no conversion). When a session completes, the platform commission (15%) is shown to you in My stats."),
  ("settings.priceInvalid", "Invalid price value — per-currency limits: dinar 200–20000, euro and dollar 2–150."),
  ("settings.photoUnsupported", "Unsupported image format — please use JPEG or PNG."),
  ("publicProfile.priceNote", "Session price — paid directly to the specialist, with no electronic intermediary."),
  ("admin.bulkUserLabel", "User pseudonym or email address"),
  ("admin.bulkUserPlaceholder", "Pseudonym or email"),
  ("admin.bulkUserNotFound", "No user found with that pseudonym or email"),
  ("client.cancelConfirmTitle", "Cancel this session request?"),
  ("client.cancelConfirmDesc", "The specialist will be notified immediately and the slot will be freed for others."),
  ("client.confirmCancel", "Yes, cancel the session"),
  ("client.rescheduleTitle", "Reschedule your session"),
  ("client.rescheduleHint", "The specialist receives a notification with the new time as soon as you send it."),
  ("counselor.sessionPriceLabel", "Session price per currency *"),
  ("counselor.sessionPriceHint", "Set the price in each currency — clients see their chosen currency only; a 15% platform commission applies per completed session."),
  ("certificate.downloadBtn", "Print certificate / Save PDF"),
],
"tr": [
  ("settings.priceHint", "Seans ücretinizi her para birimi için ayrı ayrı belirleyin — müşteri yalnızca seçtiği para biriminin fiyatını görür (dönüşüm yok). Her tamamlanan seansta platform komisyonu (%15) İstatistiklerim'de gösterilir."),
  ("settings.priceInvalid", "Geçersiz fiyat — para birimi sınırları: dinar 200–20000, euro ve dolar 2–150."),
  ("settings.photoUnsupported", "Desteklenmeyen resim biçimi — JPEG veya PNG kullanın."),
  ("publicProfile.priceNote", "Seans ücreti — doğrudan uzmana ödenir, elektronik aracı yoktur."),
  ("admin.bulkUserLabel", "Kullanıcının takma adı veya e-posta adresi"),
  ("admin.bulkUserPlaceholder", "Takma ad veya e-posta"),
  ("admin.bulkUserNotFound", "Bu takma ad veya e-posta ile kullanıcı bulunamadı"),
  ("client.cancelConfirmTitle", "Seans talebi iptal edilsin mi?"),
  ("client.cancelConfirmDesc", "Uzman iptalinden anında haberdar olur ve saat diğer müşteriler için boşalır."),
  ("client.confirmCancel", "Evet, seansı iptal et"),
  ("client.rescheduleTitle", "Seans saatinizi değiştirin"),
  ("client.rescheduleHint", "Gönderdiğinizde uzman yeni saatle ilgili bir bildirim alır."),
  ("counselor.sessionPriceLabel", "Para birimi başına seans ücreti *"),
  ("counselor.sessionPriceHint", "Her para birimi için fiyat belirleyin — müşteri yalnızca kendi para birimini görür; her tamamlanan seansta %15 platform komisyonu uygulanır."),
  ("certificate.downloadBtn", "Sertifikayı yazdır / PDF kaydet"),
],
"ru": [
  ("settings.priceHint", "Задайте цену сессии для каждой валюты отдельно — клиент видит только цену выбранной им валюты (без конвертации). По завершении сессии комиссия платформы (15%) отображается в «Моя статистика»."),
  ("settings.priceInvalid", "Недопустимое значение цены — лимиты по валютам: динар 200–20000, евро и доллар 2–150."),
  ("settings.photoUnsupported", "Неподдерживаемый формат изображения — используйте JPEG или PNG."),
  ("publicProfile.priceNote", "Стоимость сессии — оплата напрямую специалисту, без электронного посредника."),
  ("admin.bulkUserLabel", "Псевдоним или e-mail пользователя"),
  ("admin.bulkUserPlaceholder", "Псевдоним или e-mail"),
  ("admin.bulkUserNotFound", "Пользователь с таким псевдонимом или e-mail не найден"),
  ("client.cancelConfirmTitle", "Отменить запрос сессии?"),
  ("client.cancelConfirmDesc", "Специалист будет немедленно уведомлён об отмене, а слот освободится."),
  ("client.confirmCancel", "Да, отменить сессию"),
  ("client.rescheduleTitle", "Изменить время сессии"),
  ("client.rescheduleHint", "Специалист получит уведомление с новым временем сразу после отправки."),
  ("counselor.sessionPriceLabel", "Цена сессии по каждой валюте *"),
  ("counselor.sessionPriceHint", "Укажите цену в каждой валюте — клиент видит только свою валюту; комиссия платформы 15% за каждую завершённую сессию."),
  ("certificate.downloadBtn", "Печать сертификата / Сохранить PDF"),
],
"zh": [
  ("settings.priceHint", "请为每种货币分别设定咨询价格——客户只看到自己所选货币的价格（无任何换算）。每次咨询完成后，平台佣金（15%）会显示在「我的统计」中。"),
  ("settings.priceInvalid", "价格数值无效——各货币限制：第纳尔 200–20000，欧元与美元 2–150。"),
  ("settings.photoUnsupported", "不支持的图片格式——请使用 JPEG 或 PNG。"),
  ("publicProfile.priceNote", "咨询价格——直接支付给咨询师，无任何电子中介。"),
  ("admin.bulkUserLabel", "用户的昵称或电子邮箱"),
  ("admin.bulkUserPlaceholder", "昵称或电子邮箱"),
  ("admin.bulkUserNotFound", "没有找到该昵称或邮箱对应的用户"),
  ("client.cancelConfirmTitle", "取消此咨询请求？"),
  ("client.cancelConfirmDesc", "咨询师将立即收到取消通知，该时段将释放给其他客户。"),
  ("client.confirmCancel", "是的，取消咨询"),
  ("client.rescheduleTitle", "更改咨询时间"),
  ("client.rescheduleHint", "发送后咨询师会立即收到包含新时间的通知。"),
  ("counselor.sessionPriceLabel", "每种货币的咨询价格 *"),
  ("counselor.sessionPriceHint", "请分别设定每种货币的价格——客户只看到自己货币的价格；每次完成的咨询收取15%平台佣金。"),
  ("certificate.downloadBtn", "打印证书 / 保存 PDF"),
],
}

def set_nested(text, dotted, new_value):
    """استبدال قيمة مفتاح موجود أو إضافته داخل الكائن الأب المناسب"""
    parts = dotted.split(".")
    section, key = parts[0], parts[1]
    # استبدال موجود: key: "..."  (سطر واحد)
    pat = re.compile(rf'(\n    {re.escape(key)}: ")([^"]*)(")')
    m = pat.search(text)
    if m:
        return text[:m.start()] + m.group(1) + new_value + m.group(3) + text[m.end():], "replaced"
    # إضافة بعد بداية القسم: section: {
    sec_pat = re.compile(rf'(\n  {re.escape(section)}: \{{\n)')
    m2 = sec_pat.search(text)
    if m2:
        insert = m2.end(1)
        add = f"    {key}: \"{new_value}\",\n"
        return text[:insert] + add + text[insert:], "added"
    return text, "MISSING_SECTION"

failures = []
for lang, items in REPL.items():
    path = f"{ROOT}/{lang}.ts"
    src = io.open(path, encoding="utf-8").read()
    for dotted, val in items:
        src, status = set_nested(src, dotted, val)
        if status == "MISSING_SECTION":
            failures.append((lang, dotted))
    io.open(path, "w", encoding="utf-8").write(src)
    print(f"{lang}: OK")

if failures:
    print("FAILURES:", failures)
    sys.exit(1)
print("All i18n updates applied.")
