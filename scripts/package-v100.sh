#!/bin/bash
# حزم طمأنينة v1.0.0 — كود مصدري كامل (بلا node_modules/.env/مخرجات البناء)
set -e
SRC=/home/z/my-project/tumaanina
STG=$SRC/scripts/staging-v100
ROOT="$STG/Tumaanina-main"
OUT=$SRC/download/Tumaanina-v1.0.0.zip

rm -rf "$STG"
mkdir -p "$ROOT"

cd "$SRC"

rsync -a \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude '.next' \
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

# ملف بيئة نموذجي
cat > "$ROOT/.env.example" <<'ENV'
# طمأنينة — متغيرات البيئة
MONGODB_URI=mongodb://127.0.0.1:27017/tumaanina
# كلمة مرور لوحة الإدارة (إلزامية في الإنتاج)
ADMIN_PASSCODE=change-me-strong-passcode
# مفاتيح إشعارات Web Push (تُولَّد تلقائياً وتُخزَّن في القاعدة إن تُركت فارغة)
# VAPID_PUBLIC_KEY=
# VAPID_PRIVATE_KEY=
# VAPID_SUBJECT=mailto:admin@tumaanina.example
ENV

mkdir -p "$SRC/download"
cd "$STG"
zip -q -r "$OUT" Tumaanina-main
cd "$SRC"

echo "== الحزمة =="
ls -la "$OUT"
unzip -l "$OUT" | tail -1
echo "== md5 =="
md5sum "$OUT"
