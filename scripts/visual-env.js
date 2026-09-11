#!/usr/bin/env node
/**
 * بيئة اختبار بصرية: MongoDB في الذاكرة (يبقى حياً) + زرع بيانات تجريبية + إيقاف عند SIGTERM
 * الاستخدام: node scripts/visual-env.js  → يطبع URI
 */
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const { randomBytes, scryptSync } = require("crypto");

async function main() {
  const mongod = await MongoMemoryServer.create({ instance: { port: 27017, ip: "127.0.0.1" } });
  const uri = mongod.getUri("rafiqi-nafsi");
  console.log("MONGO_URI=" + uri);

  const conn = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 10000 }).asPromise();
  const hash = (s) => {
    const salt = randomBytes(16).toString("hex");
    return { hash: scryptSync(s, salt, 64).toString("hex"), salt };
  };
  const UserSchema = new mongoose.Schema(
    {
      pseudonym: String,
      role: String,
      language: { type: String, default: "ar" },
      email: { type: String, sparse: true, unique: true },
      wilaya: String,
      ageGroup: String,
      passwordHash: String,
      passwordSalt: String,
      recoveryHash: String,
      recoverySalt: String,
    },
    { timestamps: true, collection: "users" }
  );
  const ProfileSchema = new mongoose.Schema(
    {
      userId: mongoose.Schema.Types.ObjectId,
      fullName: String,
      specialties: [String],
      languages: [String],
      bio: String,
      whatsapp: String,
      yearsExperience: { type: Number, default: 0 },
      diplomaImage: String,
      verificationStatus: { type: String, default: "PENDING" },
      available: { type: Boolean, default: true },
      rating: { type: Number, default: 5 },
      sessionsCount: { type: Number, default: 0 },
    },
    { timestamps: true, collection: "counselors" }
  );
  const U = conn.model("User", UserSchema);
  const P = conn.model("CounselorProfile", ProfileSchema);

  /* أخصائي موثّق للعرض */
  const pw = hash("visual-pass-1");
  const rec = hash("عبارة بصرية استرجاعية");
  const u = await U.create({
    role: "COUNSELOR",
    pseudonym: "د. أمين بصري",
    email: "visual@local",
    passwordHash: pw.hash,
    passwordSalt: pw.salt,
    recoveryHash: rec.hash,
    recoverySalt: rec.salt,
    language: "ar",
  });
  const TINY_PNG =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  await P.create({
    userId: u._id,
    fullName: "د. أمين بصري",
    specialties: ["trauma", "grief"],
    languages: ["ar", "fr"],
    bio: "أخصائي تجريبي للاختبار البصري — 12 سنة خبرة.",
    whatsapp: "0555000111",
    yearsExperience: 12,
    diplomaImage: TINY_PNG,
    verificationStatus: "VERIFIED",
  });
  /* أخصائي بانتظار التوثيق لفحص لوحة الإدارة */
  const pw2 = hash("visual-pass-2");
  const u2 = await U.create({
    role: "COUNSELOR",
    pseudonym: "د. انتظار بصري",
    email: "pending@local",
    passwordHash: pw2.hash,
    passwordSalt: pw2.salt,
    recoveryHash: rec.hash,
    recoverySalt: rec.salt,
  });
  await P.create({
    userId: u2._id,
    fullName: "د. انتظار بصري",
    specialties: ["children"],
    languages: ["ar"],
    bio: "ملف بانتظار التوثيق.",
    whatsapp: "213555000222",
    diplomaImage: TINY_PNG,
    verificationStatus: "PENDING",
  });
  /* متضرر واحد للدخول السريع */
  const pv = hash("victim-pass-1");
  await U.create({
    role: "VICTIM",
    pseudonym: "ياسمين 26",
    language: "ar",
    wilaya: "alger",
    passwordHash: pv.hash,
    passwordSalt: pv.salt,
    recoveryHash: rec.hash,
    recoverySalt: rec.salt,
  });
  await conn.close();
  console.log("🌱 بيانات بصرية مزروعة: د. أمين بصري (موثّق) / د. انتظار (معلّق) / ياسمين 26");

  process.on("SIGTERM", async () => {
    await mongod.stop();
    process.exit(0);
  });
  process.on("SIGINT", async () => {
    await mongod.stop();
    process.exit(0);
  });
  setInterval(() => {}, 1 << 30); // إبقاء العملية حية
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
