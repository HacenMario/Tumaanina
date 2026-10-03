#!/bin/bash
# حزم طمأنينة v1.22.3 — تغيير نطاق المواعيد المسموح بها إلى 08:00 → 00:00 (منتصف الليل)
# بنية مطابقة للنسخة المنشورة المعتمدة (جذر Tumaanina-main) + بناء إنتاجي جاهز (.next بلا cache)
# بلا: node_modules / .env / .git / cache / download / tool-results / مخلفات التطوير
set -e
SRC=/home/z/my-project/tumaanina-v1222-work/Tumaanina-main
STG=/home/z/my-project/tumaanina-v1222-work/staging-v1223
OUT=/home/z/my-project/download/Tumaanina-v1.22.3.zip

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
  "$SRC/" "$STG/Tumaanina-main/"

echo "── فحص الحزمة (15 فحصاً) ──"
FAIL=0
ok(){ echo "✓ $1"; }
bad(){ echo "✗ $1"; FAIL=1; }

[ -f "$STG/Tumaanina-main/.next/BUILD_ID" ] && ok ".next بناء إنتاجي جاهز ($(cat "$STG/Tumaanina-main/.next/BUILD_ID"))" || bad ".next/BUILD_ID مفقود"
[ -f "$STG/Tumaanina-main/server.js" ] && ok "server.js موجود" || bad "server.js مفقود"
grep -q '"version": "1.22.3"' "$STG/Tumaanina-main/package.json" && ok "package.json v1.22.3" || bad "package.json ليس 1.22.3"
grep -q '"1.22.3"' "$STG/Tumaanina-main/src/app/api/health/route.ts" && ok "/api/health يقول 1.22.3" || bad "/api/health ليس 1.22.3"
grep -q 'tumaanina-v1.22.3' "$STG/Tumaanina-main/public/sw.js" && ok "sw.js CACHE_NAME = tumaanina-v1.22.3" || bad "sw.js CACHE_NAME قديم"
grep -q 'skipWaiting' "$STG/Tumaanina-main/public/sw.js" && grep -q 'clients.claim' "$STG/Tumaanina-main/public/sw.js" && ok "sw.js: skipWaiting + clients.claim كما هي" || bad "sw.js فقد آلية التحديث"
grep -q '"08:00"' "$STG/Tumaanina-main/src/lib/constants.ts" && ok "SLOT_TIMES يبدأ 08:00" || bad "08:00 غير موجودة"
grep -A3 'منتصف الليل' "$STG/Tumaanina-main/src/lib/constants.ts" | grep -q '"00:00"' && ok "SLOT_TIMES ينتهي 00:00 (منتصف الليل)" || bad "00:00 غير موجودة"
[ "$(grep -c '"0[0-9]:00"\|"1[0-9]:00"\|"2[0-3]:00"' "$STG/Tumaanina-main/src/lib/constants.ts")" -ge 1 ] && ok "صيغة الساعات HH:MM سليمة" || bad "صيغة الساعات مكسورة"
grep -q 'وقت الفطور 12:00–13:00' "$STG/Tumaanina-main/src/lib/constants.ts" && ok "استثناء الفطور 12:00 محافظ عليه" || bad "استثناء الفطور تغيّر"
for L in ar en fr tr ru zh es de it; do
  grep -q '08:00' "$STG/Tumaanina-main/src/lib/i18n/$L.ts" && grep -q '00:00' "$STG/Tumaanina-main/src/lib/i18n/$L.ts" \
    && ok "i18n/$L.ts تلميح المواعيد محدّث" || bad "i18n/$L.ts لم يُحدّث"
done
[ ! -d "$STG/Tumaanina-main/.next/cache" ] && ok ".next بلا cache" || bad "يوجد .next/cache"
[ ! -f "$STG/Tumaanina-main/.env" ] && ok "بلا .env" || bad "يوجد .env"
[ ! -d "$STG/Tumaanina-main/node_modules" ] && ok "بلا node_modules" || bad "يوجد node_modules"
[ ! -d "$STG/Tumaanina-main/.git" ] && ok "بلا .git" || bad "يوجد .git"

[ "$FAIL" -eq 1 ] && { echo "── فشلت الفحوصات، إلغاء ──"; exit 1; }

cd "$STG"
zip -qr "$OUT" Tumaanina-main
cd "$SRC"
rm -rf "$STG"
echo "── الحزمة ──"
ls -la "$OUT"
md5sum "$OUT"
FILES=$(unzip -l "$OUT" | tail -1 | awk '{print $2}')
echo "عدد الملفات: $FILES"
