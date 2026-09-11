#!/bin/bash
# حزم طمأنينة v1.2.0 — كود مصدري كامل + بناء إنتاجي جاهز (.next)
# بحيث يعمل npm install ثم npm start مباشرة بلا خطوة build
set -e
SRC=/home/z/my-project/tumaanina
STG=$SRC/scripts/staging-v120
ROOT="$STG/Tumaanina-main"
OUT=$SRC/download/Tumaanina-v1.2.0.zip

rm -rf "$STG"
mkdir -p "$ROOT"

cd "$SRC"

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
  "$SRC/" "$ROOT/"

# فحوصات الحزمة
echo "── فحص الحزمة ──"
[ -f "$ROOT/.next/BUILD_ID" ] && echo "✓ .next بناء إنتاجي جاهز ($(cat "$ROOT/.next/BUILD_ID"))"
[ -f "$ROOT/server.js" ] && echo "✓ server.js"
[ -f "$ROOT/package.json" ] && rg -q '"version": "1.2.0"' "$ROOT/package.json" && echo "✓ package.json v1.2.0"
[ -f "$ROOT/تشغيل-سريع.txt" ] && echo "✓ تشغيل-سريع.txt"
[ -f "$ROOT/public/manifest.webmanifest" ] && rg -q "طمأنينة" "$ROOT/public/manifest.webmanifest" && echo "✓ manifest طمأنينة"
! rg -qi "rafiqi|رفيقي" "$ROOT/src" "$ROOT/server.js" "$ROOT/public/sw.js" 2>/dev/null && echo "✓ صفر أثر للاسم القديم"
! rg -q "محفظة" "$ROOT/src/lib/i18n/ar.ts" && echo "✓ بلا محفظة في الترجمات"

cd "$STG"
zip -qr "$OUT" Tumaanina-main
cd "$SRC"
echo "── الحزمة ──"
ls -la "$OUT"
md5sum "$OUT"
FILES=$(unzip -l "$OUT" | tail -1 | awk '{print $2}')
echo "عدد الملفات: $FILES"
