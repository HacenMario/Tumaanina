#!/bin/bash
# حزم طمأنينة v1.21.0 — جذر مسطح (كما في v1.17/v1.18 وبمطابقة قيد المستخدم):
# بناء إنتاجي جاهز (.next بلا cache) + scripts
# بلا: node_modules / .env / data-test / .git / tool-results / download / staging
set -e
SRC=/home/z/my-project/tumaanina/Tumaanina-main
STG=$SRC/scripts/staging-v1210
OUT=/home/z/my-project/download/Tumaanina-v1.21.0.zip

rm -rf "$STG" "$OUT"
mkdir -p "$STG"

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
  "$SRC/" "$STG/"

echo "── فحص الحزمة ──"
[ -f "$STG/.next/BUILD_ID" ] && echo "✓ .next بناء إنتاجي جاهز ($(cat "$STG/.next/BUILD_ID"))"
[ -f "$STG/server.js" ] && echo "✓ server.js"
grep -q '"version": "1.21.0"' "$STG/package.json" && echo "✓ package.json v1.21.0"
grep -q '"1.21.0"' "$STG/src/app/api/health/route.ts" && echo "✓ /api/health يقول 1.21.0"
[ -f "$STG/public/sw.js" ] && echo "✓ public/sw.js موجود"
[ ! -d "$STG/.next/cache" ] && echo "✓ .next بلا cache"
[ ! -f "$STG/.env" ] && echo "✓ بلا .env"
[ ! -d "$STG/node_modules" ] && echo "✓ بلا node_modules"
[ ! -d "$STG/data-test" ] && echo "✓ بلا data-test"
[ ! -f "$STG/src/lib/media-upload.ts" ] && echo "✓ مكتبة رفع الفيديو أُزيلة"
[ -f "$STG/src/components/shared/safe-video.tsx" ] && echo "✓ مشغّل الفيديو للقديم موجود"
[ -f "$STG/src/components/views/courses.tsx" ] && echo "✓ صفحة الدورات موجودة"

cd "$STG"
zip -qr "$OUT" .
cd "$SRC"
rm -rf "$STG"
echo "── الحزمة ──"
ls -la "$OUT"
md5sum "$OUT"
FILES=$(unzip -l "$OUT" | tail -1 | awk '{print $2}')
echo "عدد الملفات: $FILES"
