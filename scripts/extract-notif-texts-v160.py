#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
v1.6.0 — استخراج TEXTS من notify.ts إلى وحدة مشتركة src/lib/notif-texts.ts
(مصدر واحد للخادم والعميل: الجرس يعيد توليد نص الإشعار بلغة واجهة المستخدم
الحالية، والخادم يبني نصوص الإشعارات من نفس الوحدة — صفر ازدواجية)
"""
import re, io, sys

SRC = "/home/z/my-project/tumaanina/src/lib/server/notify.ts"
DST = "/home/z/my-project/tumaanina/src/lib/notif-texts.ts"

with io.open(SRC, "r", encoding="utf-8") as f:
    src = f.read()

# استخراج كتلة TEXTS كاملة (من السطر الذي يبدأ بـ const TEXTS حتى };
# الأول بعد موازنة الأقواس)
start = src.index("const TEXTS: Record<NotifKey")
eq = src.index("=", start)
i = src.index("{", eq)
depth = 0
j = i
while True:
    ch = src[j]
    if ch == "{":
        depth += 1
    elif ch == "}":
        depth -= 1
        if depth == 0:
            break
    j += 1
texts_block = src[start:j+1] + ";"

# استخراج تعريف NotifKey من notify.ts
m = re.search(r"type NotifKey =([\s\S]*?);", src)
notifkey_block = "export type NotifKey =" + m.group(1) + ";"

# مفتاح التذكير المسبق (نفس نصوص server.js REMINDER_TEXTS) — يُعاد توليده
# في الجرس بلغة واجهة المستخدم أيضاً
reminder_block = '''
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
'''

fill_block = '''
/**
 * ملء المتغيرات {name} {when} {reason} {excerpt}… داخل نص الإشعار
 */
export function fill(tpl: string, vars?: Record<string, string> | null): string {
  if (!vars) return tpl;
  let out = tpl;
  for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v ?? ""));
  return out;
}
'''

header = '''/**
 * v1.6.0 — قوالب الإشعارات المشتركة (الخادم + الجرس في العميل).
 * ─────────────────────────────────────────────────────────────
 * طلب المستخدم: «الإشعارات لا تترجم للغات الأخرى — يجب ضمان ترجمة كل
 * الإشعارات للغات الست». الحل: الإشعار الداخلي يُخزَّن بمفتاحه ومتغيراته
 * (vars) كما هو، وعند العرض يُعاد توليد النص بلغة واجهة المستخدم الحالية
 * من هذه الوحدة — فتُترجم الإشعارات فوراً عند تبديل اللغة ولو أُرسلت
 * قبلها بلغة أخرى. الإشعارات المخصصة (رسائل الأدمين الجماعية بلا مفتاح)
 * تُعرض بالنص المخزّن كما هو.
 */
'''

out = header + notifkey_block + "\n\nexport type NotifLang = \"ar\" | \"fr\" | \"en\" | \"tr\" | \"ru\" | \"zh\";\n\n"
# حقن مفتاح reminder قبل إغلاق القوس الأخير من TEXTS
texts_block_injected = texts_block.replace("  test: {", reminder_block.strip("\n") + "\n  test: {")
out += texts_block_injected + "\n" + fill_block

with io.open(DST, "w", encoding="utf-8") as f:
    f.write(out)

print("WROTE", DST, len(out), "chars")

# تحقق سريع: موازنة الأقواس للكتلة المستخرجة
assert texts_block.count("{") == texts_block.count("}"), "unbalanced TEXTS"
print("OK: balanced TEXTS block,", texts_block.count("ar:") * "ar" if False else "keys:", len(re.findall(r"^\\s{2}\\w+:\\s*{", texts_block, re.M)))
