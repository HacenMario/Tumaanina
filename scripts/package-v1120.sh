#!/bin/bash
# حزمة طمأنينة v1.12.0 — كود مصدري كامل + بناء إنتاجي جاهز (.next)
# يعمل npm install ثم npm start مباشرة بلا خطوة build
set -e
PROJ=/home/z/my-project/tumaanina/Tumaanina-main
STG=/home/z/my-project/tumaanina/scripts/staging-v1120
ROOT="$STG/Tumaanina-main"
OUT=/home/z/my-project/download/Tumaanina-v1.12.0.zip

rm -rf "$STG"
mkdir -p "$ROOT"

rsync -a \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude 'db' \
  --exclude 'data' \
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
  --exclude 'bun.lock' \
  --exclude 'Caddyfile' \
  --exclude '.next/cache' \
  "$PROJ/" "$ROOT/"

echo "── فحص الحزمة ──"
[ -f "$ROOT/.next/BUILD_ID" ] && echo "✓ .next بناء إنتاجي جاهز ($(cat "$ROOT/.next/BUILD_ID"))"
[ -f "$ROOT/server.js" ] && echo "✓ server.js"
rg -q '"version": "1.12.0"' "$ROOT/package.json" && echo "✓ package.json v1.12.0"
rg -q 'version: "1.12.0"' "$ROOT/src/app/api/health/route.ts" && echo "✓ health route v1.12.0"
rg -q 'v1.12.0' "$ROOT/server.js" && echo "✓ server.js v1.12.0"
[ -f "$ROOT/تشغيل-سريع.txt" ] && echo "✓ تشغيل-سريع.txt"
rg -q 'عقد المنصة' "$ROOT/src/lib/i18n/ar.ts" && echo "✓ مفاتيح عقد المنصة في الترجمات"
! rg -q 'save-template' "$ROOT/src" && echo "✓ نُزع save-template نهائياً"
! rg -qi "rafiqi|رفيقي" "$ROOT/src" "$ROOT/server.js" "$ROOT/public/sw.js" && echo "✓ صفر أثر للاسم القديم"
[ ! -d "$ROOT/apk-env" ] && echo "✓ بلا apk-env داخل الحزمة"

cd "$STG"
zip -qr "$OUT" Tumaanina-main
echo "── الحزمة ──"
ls -la "$OUT"
md5sum "$OUT"
FILES=$(unzip -l "$OUT" | tail -1 | awk '{print $2}')
echo "عدد الملفات: $FILES"
