import "server-only";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import webpush from "web-push";
import { PushSubscription } from "@/lib/models";

let configured = false;

function dataDir(): string {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  /* على Vercel نظام الملفات للقراءة فقط عدا /tmp */
  if (process.env.VERCEL) return "/tmp/tumaanina-data";
  return path.join(process.cwd(), "data");
}

/* المنحنى الإهليلجي P-256 — ترتيب المجموعة n (لضمان سلامة العدد الأصم) */
const P256_ORDER = Buffer.from(
  "ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551",
  "hex"
);

/**
 * ✅ الحل الجذري لمشكلة توقف إشعارات الهاتف بعد كل تحديث:
 * اشتقاق حتمي لمفاتيح VAPID من بذرة ثابتة (SHA-256 → مفتاح EC P-256 عبر PKCS8)
 * — نفس البذرة = نفس المفاتيح في كل إقلاع وإعادة نشر، فتبقى اشتراكات
 * المستخدمين صالحة دائماً بدل توليد عشوائي يضيع مع الحاوية القديمة.
 */
function deriveVapidKeys(seed: string): { publicKey: string; privateKey: string } {
  let d = crypto.createHash("sha256").update(`tumaanina-vapid-seed:${seed}`).digest();
  while (Buffer.compare(d, P256_ORDER) >= 0 || d.every((b) => b === 0)) {
    d = crypto.createHash("sha256").update(d).digest();
  }
  /* PKCS8 مصغّر: SEQUENCE{ INTEGER 0, AlgId EC P-256, OCTET STRING{ SEC1{ INTEGER 1, OCTET d } } } */
  const der = Buffer.concat([
    Buffer.from(
      "3041020100301306072a8648ce3d020106082a8648ce3d030107042730250201010420",
      "hex"
    ),
    d,
  ]);
  const pk = crypto.createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  const jwk = pk.export({ format: "jwk" }) as { d: string; x: string; y: string };
  const publicKey = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(jwk.x, "base64url"),
    Buffer.from(jwk.y, "base64url"),
  ]).toString("base64url");
  return { publicKey, privateKey: jwk.d };
}

function vapidSeed(): string {
  return (
    process.env.VAPID_SEED ||
    process.env.ADMIN_PASSCODE ||
    "tumaanina-default-v1" /* بذرة مدمجة — مستقرة عبر كل المنصات */
  );
}

/**
 * مصادر مفاتيح VAPID بالترتيب:
 * 1) متغيرات البيئة VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
 * 2) ملف محفوظ سابقاً في $DATA_DIR/vapid.json (يوافق على المفاتيح القديمة بلا انقطاع)
 * 3) اشتقاق حتمي من بذرة ثابتة — لا يتغير أبداً عبر إعادة النشر (بدل عشوائي يفقد الاشتراكات)
 */
function loadOrGenerateKeys(): { publicKey: string; privateKey: string } | null {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
    };
  }

  const file = path.join(dataDir(), "vapid.json");
  try {
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    if (saved.publicKey && saved.privateKey) {
      process.env.VAPID_PUBLIC_KEY = saved.publicKey;
      process.env.VAPID_PRIVATE_KEY = saved.privateKey;
      return saved;
    }
  } catch {
    /* لا يوجد ملف — تابع للاشتقاق الحتمي */
  }

  try {
    /* الاشتقاق الحتمي: لا يُكتب في ملف — يُعاد حسابه في كل إقلاع بنفس النتيجة */
    const keys = deriveVapidKeys(vapidSeed());
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    console.log("🔑 مفاتيح VAPID المشتقة جاهزة (مستقرة عبر إعادة النشر — نفس البذرة = نفس المفتاح)");
    return keys;
  } catch (e) {
    console.error("❌ تعذر اشتقاق مفاتيح VAPID — محاولة توليد عشوائي أخيرة:", e);
    try {
      const keys = webpush.generateVAPIDKeys();
      fs.mkdirSync(dataDir(), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(keys, null, 2));
      process.env.VAPID_PUBLIC_KEY = keys.publicKey;
      process.env.VAPID_PRIVATE_KEY = keys.privateKey;
      console.log(`🔑 تم توليد مفاتيح VAPID العشوائية وحفظها في: ${file}`);
      return keys;
    } catch (e2) {
      console.error("❌ فشل حتى التوليد العشوائي:", e2);
      return null;
    }
  }
}

export function ensurePushConfigured() {
  if (configured) return true;
  const keys = loadOrGenerateKeys();
  if (!keys) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:stevenhacen@gmail.com",
    keys.publicKey,
    keys.privateKey
  );
  configured = true;
  return true;
}

export type PushLang = "ar" | "fr" | "en" | "tr" | "ru" | "zh";

export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  url: string = "/",
  /* v1.5.0: لغة الإشعار — تحدد اتجاه النص RTL/LTR في إشعار الهاتف */
  lang?: string
): Promise<{ sent: number; removed: number }> {
  if (!ensurePushConfigured()) return { sent: 0, removed: 0 };
  const dir = lang === "ar" ? "rtl" : "ltr";
  const subs = await PushSubscription.find({ userId }).lean();
  let sent = 0;
  let removed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title, body, url, lang: lang || "ar", dir }),
          /* v1.8.0 (نقل من رفيقي v2.15.0): TTL ساعة كاملة — autopush يخزّن
             الرسالة للمستخدم غير المتصل (شاشة مطفأة / انقطاع لحظي) ويسلّمها
             فور عودة الاتصال بدل إسقاطها الفوري — أساس «الإشعارات الخلفية
             الفورية» المفيدة فعلاً على أندرويد وآيفون */
          { TTL: 3600 }
        );
        sent++;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        /* 404/410: اشتراك منتهي — 403: رفض التفويض (تدوير مفتاح VAPID)
           في كل الحالات لن يصل إشعار بهذا الاشتراك مرة أخرى → حذفه */
        if (statusCode === 404 || statusCode === 410 || statusCode === 403) {
          await PushSubscription.findByIdAndDelete(s._id).catch(() => {});
          removed++;
        }
      }
    })
  );
  return { sent, removed };
}
