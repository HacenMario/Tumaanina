#!/usr/bin/env node
/** خادم اختبار مستمر للفحص البصري — mongo في الذاكرة + الإنتاج v1.12.0 */
const { spawn } = require("child_process");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const { randomBytes, scryptSync } = require("crypto");

const PORT = 3197;

async function main() {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri("tumaanina-visual");

  /* زرع أخصائي موثّق + عميل للتجربة اليدوية */
  const conn = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 10000 }).asPromise();
  const hash = (s) => {
    const salt = randomBytes(16).toString("hex");
    return { hash: scryptSync(s, salt, 64).toString("hex"), salt };
  };
  const UserSchema = new mongoose.Schema(
    { pseudonym: String, fullName: String, role: String, language: { type: String, default: "ar" }, email: { type: String, sparse: true, unique: true }, passwordHash: String, passwordSalt: String, recoveryHash: String, recoverySalt: String, gender: String },
    { timestamps: true, collection: "users" }
  );
  const ProfileSchema = new mongoose.Schema(
    { userId: mongoose.Schema.Types.ObjectId, fullName: String, specialties: [String], languages: [String], whatsapp: String, verificationStatus: { type: String, default: "PENDING" }, available: { type: Boolean, default: true }, rating: { type: Number, default: 5 }, sessionsCount: { type: Number, default: 0 }, contractSignature: String, contractSignedAt: Date },
    { timestamps: true, collection: "counselors" }
  );
  const U = conn.model("User", UserSchema);
  const P = conn.model("CounselorProfile", ProfileSchema);
  const pw = hash("counselor-pass-1");
  const rec = hash("عبارة الاسترجاعية");
  await U.create({ role: "COUNSELOR", pseudonym: "د. أخصائي", fullName: "د. أخصائي تجربة", email: "test@local", passwordHash: pw.hash, passwordSalt: pw.salt, recoveryHash: rec.hash, recoverySalt: rec.salt, gender: "male" });
  await P.create({ userId: (await U.findOne({ email: "test@local" }))._id, fullName: "د. أخصائي تجربة", specialties: ["trauma"], languages: ["ar", "fr"], whatsapp: "213555000111", verificationStatus: "VERIFIED" });
  await conn.close();
  console.log("🌱 بيانات الاختبار مزروعة");

  const server = spawn("node", ["server.js", "--prod"], {
    cwd: process.cwd(),
    env: { ...process.env, MONGODB_URI: uri, ADMIN_PASSCODE: "test-pass-123", PORT: String(PORT) },
    stdio: "inherit",
  });
  server.on("exit", async () => {
    await mongod.stop().catch(() => {});
    process.exit(0);
  });
}
main().catch((e) => { console.error(e); process.exit(1); });
