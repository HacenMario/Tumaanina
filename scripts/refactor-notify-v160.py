#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
v1.6.0 — إعادة توجيه notify.ts إلى الوحدة المشتركة notif-texts.ts:
يحذف تعريفات NotifKey/NotifLang/TEXTS/fill المحلية ويستوردها من
src/lib/notif-texts.ts — مصدر واحد للنصوص بين الخادم والعميل.
"""
import io, re

SRC = "/home/z/my-project/tumaanina/src/lib/server/notify.ts"
with io.open(SRC, "r", encoding="utf-8") as f:
    src = f.read()

# 1) حذف كتلة type NotifKey = ... ;
m = re.search(r"type NotifKey =[\s\S]*?;\n", src)
assert m, "NotifKey not found"
src = src[:m.start()] + src[m.end():]

# 2) حذف سطر type NotifLang
m = re.search(r'type NotifLang = "ar" \| "fr" \| "en" \| "tr" \| "ru" \| "zh";\n', src)
assert m, "NotifLang not found"
src = src[:m.start()] + src[m.end():]

# 3) حذف كتلة const TEXTS = {...}; (موازنة الأقواس من قوس الكائن بعد =)
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
# يشمل الفاصلة المنقوطة التالية
end = src.index(";", j) + 1
src = src[:start] + src[end:]

# 4) حذف الدالة المحلية fill
m = re.search(r"/\*\* ملء المتغيرات[\s\S]*?\n\}\n", src)
assert m, "fill not found"
src = src[:m.start()] + src[m.end():]

# 5) استيراد من الوحدة المشتركة
anchor = 'import { sendPushToUser } from "@/lib/server/push";'
assert anchor in src
src = src.replace(anchor, anchor + '\nimport { TEXTS, fill, type NotifKey, type NotifLang } from "@/lib/notif-texts";', 1)

with io.open(SRC, "w", encoding="utf-8") as f:
    f.write(src)

print("OK notify.ts refactored, size:", len(src))
print("TEXTS local?", "const TEXTS" in src, "| fill local?", "function fill(" in src)
