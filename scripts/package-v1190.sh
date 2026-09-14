#!/bin/bash
# حزم طمأنينة v1.19.0 — نفس بنية v1.18.0 الموثقة:
# مجلد جذر Tumaanina-main + بناء إنتاجي جاهز (.next بلا cache) + scripts
# بلا: node_modules / .env / data-test / .git / tool-results / download / staging
set -e
SRC=/home/z/my-project/tumaanina/Tumaanina-main
STG=$SRC/scripts/staging-v1190
ROOT="$STG/Tumaanina-main"
OUT=/home/z/my-project/download/Tumaanina-v1.19.0.zip

rm -rf "$STG" "$OUT"
mkdir -p "$ROOT"

cd "$SRC"
rsync -a \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude '.next/cache' \
  --exclude 'db' \
  --exclude 'data' \
  --exclude 'data-test' \
  --exclude 'screens' \
  --exclude 'screenshots' \
  --exclude 'download' \
  --exclude 'tool-results' \
  --exclude 'skills' \
  --exclude 'examples' \
  --exclude 'tests' \
  --exclude 'upload' \
  --exclude '*.log' \
  --exclude '.git' \
  --exclude 'scripts/staging-*' \
  --exclude 'tsconfig.tsbuildinfo' \
  --exclude 'Caddyfile' \
  "$SRC/" "$ROOT/"

echo "── فحص الحزمة ──"
[ -f "$ROOT/.next/BUILD_ID" ] && echo "✓ .next بناء إنتاجي جاهز ($(cat "$ROOT/.next/BUILD_ID"))"
[ -f "$ROOT/server.js" ] && echo "✓ server.js"
grep -q '"version": "1.19.0"' "$ROOT/package.json" && echo "✓ package.json v1.19.0"
grep -q '"1.19.0"' "$ROOT/src/app/api/health/route.ts" && echo "✓ /api/health يقول 1.19.0"
[ -f "$ROOT/تشغيل-سريع.txt" ] && echo "✓ تشغيل-سريع.txt"
[ -f "$ROOT/public/sw.js" ] && echo "✓ public/sw.js موجود"
[ ! -d "$ROOT/.next/cache" ] && echo "✓ .next بلا cache"
[ ! -f "$ROOT/.env" ] && echo "✓ بلا .env"
[ ! -d "$ROOT/node_modules" ] && echo "✓ بلا node_modules"
[ ! -d "$ROOT/data-test" ] && echo "✓ بلا data-test"
[ -f "$ROOT/src/components/views/courses.tsx" ] && echo "✓ صفحة الدورات موجودة"
[ -f "$ROOT/src/components/views/counselor-courses.tsx" ] && echo "✓ تبويب دورات الأخصائي موجود"
[ -f "$ROOT/src/app/api/courses/route.ts" ] && echo "✓ API الدورات موجود"

cd "$STG"
zip -qr "$OUT" Tumaanina-main
cd "$SRC"
echo "── الحزمة ──"
ls -la "$OUT"
md5sum "$OUT"
FILES=$(unzip -l "$OUT" | tail -1 | awk '{print $2}')
echo "عدد الملفات: $FILES"
