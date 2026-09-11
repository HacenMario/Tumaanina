/**
 * طمأنينة — اتصال MongoDB (mongoose)
 * ─────────────────────────────────────────────────────────────────
 * اتصال مفرد (singleton) تشاركه كل مسارات API والخادم الموحّد server.js
 * — لأن الجميع يعمل داخل نفس عملية Node.
 *
 * المفتاح يُقرأ من MONGODB_URI في .env
 * الافتراضي: mongodb://127.0.0.1:27017/tumaanina (تطوير محلي)
 */
import mongoose from "mongoose";

export const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/tumaanina";

const globalForMongo = globalThis as unknown as {
  _tumaaninaMongo?: Promise<typeof mongoose>;
};

export function connectDB(): Promise<typeof mongoose> {
  if (!globalForMongo._tumaaninaMongo) {
    mongoose.set("strictQuery", true);
    globalForMongo._tumaaninaMongo = mongoose
      .connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        autoIndex: true, // ينشئ الفهارس تلقائياً (unique/sparse)
      })
      .then((m) => {
        const safeUri = MONGODB_URI.replace(/\/\/([^@/]*)@/, "//***:***@");
        console.log(`🗄️  MongoDB متصل: ${safeUri}`);
        return m;
      })
      .catch((e) => {
        globalForMongo._tumaaninaMongo = undefined; // اسمح بمحاولة لاحقة
        console.error("❌ فشل الاتصال بـ MongoDB — تحقق من MONGODB_URI:", e.message);
        throw e;
      });
  }
  return globalForMongo._tumaaninaMongo;
}
