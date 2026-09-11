# -*- coding: utf-8 -*-
# إعادة إدراج مقطعي admin/settings (chunk3) وبقية المقاطع (chunk4) في tr.ts
import io

chunk3 = io.open('scripts/tr-c3.txt', encoding='utf-8').read()
chunk4 = io.open('scripts/tr-c4.txt', encoding='utf-8').read()
p = 'src/lib/i18n/tr.ts'
s = io.open(p, encoding='utf-8').read()
if '__CHUNK3__' in s:
    s = s.replace('__CHUNK3__\n', chunk3)
if '__CHUNK4__' in s:
    s = s.replace('__CHUNK4__\n', chunk4)
s = s.replace('    title2: "",\n', '')
io.open(p, 'w', encoding='utf-8').write(s)
print('done, chunks left:', s.count('__CHUNK'))
