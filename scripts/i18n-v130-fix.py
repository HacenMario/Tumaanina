#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tumaanina v1.3.0 — إصلاح تسريب المفاتيح المتشابهة بين الأقسام في i18n:
   1) استعادة client.sessionPriceLabel الأصلي (تسرّب نص الأخصائي إليه)
   2) استعادة counselor.rescheduleTitle الأصلي (تسرّب نص العميل إليه)
   3) تحديث counselor.sessionPriceLabel/Hint فعلياً (كان أول تطابق يقع في client)
   4) إضافة client.rescheduleTitle داخل قسم client حصراً"""

import io, re, sys

ROOT = "/home/z/my-project/tumaanina/src/lib/i18n"

RESTORE_CLIENT_SPL = {
  "ar": "سعر الجلسة",
  "en": "Session price",
  "fr": "Prix de la séance",
  "tr": "Seans ücreti",
  "ru": "Стоимость сессии",
  "zh": "会话价格",
}
RESTORE_COUNSELOR_RESCHED = {
  "ar": "تغيير موعد الجلسة قبل القبول",
  "en": "Change the session time before accepting",
  "fr": "Modifier l'horaire avant d'accepter",
  "tr": "Kabulden önce randevuyu değiştir",
  "ru": "Изменить время сессии до принятия",
  "zh": "接受前更改会话时间",
}
COUNSELOR_SPL = {
  "ar": "أسعار الجلسة لكل عملة *",
  "en": "Session price per currency *",
  "fr": "Prix de la séance par devise *",
  "tr": "Para birimi başına seans ücreti *",
  "ru": "Цена сессии по каждой валюте *",
  "zh": "每种货币的咨询价格 *",
}
CLIENT_RESCHED = {
  "ar": "تغيير موعد جلستك",
  "en": "Reschedule your session",
  "fr": "Modifier l'horaire de votre séance",
  "tr": "Seans saatinizi değiştirin",
  "ru": "Изменить время сессии",
  "zh": "更改咨询时间",
}

def replace_within_section(text, section, key, new_value):
    """استبدال key داخل قسم section فقط (من بداية القسم إلى القسم التالي بعمق 2)"""
    # موضع بداية القسم
    sec_m = re.search(rf'\n  {re.escape(section)}: \{{\n', text)
    if not sec_m:
        return text, False
    start = sec_m.end()
    # القسم التالي بنفس المستوى (سطر '  name: {')
    nxt = re.search(r'\n  [a-zA-Z_]+: \{\n', text[start:])
    end = start + nxt.start() if nxt else len(text)
    seg = text[start:end]
    pat = re.compile(rf'({re.escape(key)}: ")([^"]*)(")')
    m = pat.search(seg)
    if not m:
        return text, False
    seg2 = pat.sub(lambda mm: mm.group(1) + new_value + mm.group(3), seg, count=1)
    return text[:start] + seg2 + text[end:], True

def add_to_section(text, section, key, new_value):
    sec_m = re.search(rf'\n  {re.escape(section)}: \{{\n', text)
    if not sec_m:
        return text, False
    insert = sec_m.end()
    if re.search(rf'\n    {re.escape(key)}: "', text[insert:insert + 4000]):
        return text, True  # موجود مسبقاً
    add = f'    {key}: "{new_value}",\n'
    return text[:insert] + add + text[insert:], True

fail = []
for lang in ["ar", "en", "fr", "tr", "ru", "zh"]:
    path = f"{ROOT}/{lang}.ts"
    src = io.open(path, encoding="utf-8").read()
    src, ok1 = replace_within_section(src, "client", "sessionPriceLabel", RESTORE_CLIENT_SPL[lang])
    src, ok2 = replace_within_section(src, "counselor", "rescheduleTitle", RESTORE_COUNSELOR_RESCHED[lang])
    src, ok3 = replace_within_section(src, "counselor", "sessionPriceLabel", COUNSELOR_SPL[lang])
    src, ok4 = add_to_section(src, "client", "rescheduleTitle", CLIENT_RESCHED[lang])
    io.open(path, "w", encoding="utf-8").write(src)
    print(lang, ok1, ok2, ok3, ok4)
    if not all([ok1, ok2, ok3, ok4]):
        fail.append(lang)

if fail:
    print("FAILED:", fail); sys.exit(1)
print("Section-scoped i18n fixes applied.")
