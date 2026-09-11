#!/usr/bin/env node
/**
 * رفيقي النفسي — أداة إدخال أخصائيين حقيقيين إلى MongoDB
 * ─────────────────────────────────────────────────────────────────
 * الاستخدام:
 *   npm run db:add-counselor            → وضع تفاعلي (يسألك سؤالاً سؤالاً)
 *   node scripts/add-counselor.js --list                 → عرض الأخصائيين الحاليين
 *   node scripts/add-counselor.js --verify <email>       → توثيق أخصائي بالبريد
 *   node scripts/add-counselor.js --unverify <email>     → إلغاء توثيق أخصائي
 *
 * متغير البيئة المطلوب: MONGODB_URI (افتراضي: mongodb://127.0.0.1:27017/rafiqi-nafsi)
 */
const readline = require("readline");
const mongoose = require("mongoose");

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/rafiqi-nafsi";

const SPECIALTIES = ["trauma", "grief", "anxietyDepression", "children", "burnout"];
const LANGUAGES = ["ar", "fr", "en"];

/* ─── مخططات مطابقة لـ src/lib/models.ts ─── */
const UserSchema = new mongoose.Schema(
  {
    pseudonym: { type: String, default: null },
    role: { type: String, enum: ["VICTIM", "COUNSELOR", "ADMIN"], required: true },
    language: { type: String, default: "ar" },
    wilaya: { type: String, default: null },
    ageGroup: { type: String, default: null },
    email: { type: String, default: null, trim: true, lowercase: true, sparse: true, unique: true },
    accessCode: { type: String, default: null },
  },
  { timestamps: true, collection: "users" }
);

const CounselorProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    fullName: { type: String, required: true },
    specialties: { type: [String], default: [] },
    languages: { type: [String], default: [] },
    bio: { type: String, default: null },
    whatsapp: { type: String, default: null },
    yearsExperience: { type: Number, default: 0 },
    diplomaRef: { type: String, default: null },
    verificationStatus: { type: String, enum: ["PENDING", "VERIFIED", "REJECTED"], default: "PENDING" },
    available: { type: Boolean, default: true },
    rating: { type: Number, default: 5.0 },
    sessionsCount: { type: Number, default: 0 },
  },
  { timestamps: true, collection: "counselors" }
);

const User = mongoose.models.User || mongoose.model("User", UserSchema);
const CounselorProfile =
  mongoose.models.CounselorProfile || mongoose.model("CounselorProfile", CounselorProfileSchema);

function ask(rl, q, fallback = "") {
  return new Promise((resolve) => {
    rl.question(fallback ? `${q} [${fallback}]: ` : `${q}: `, (a) => resolve(a.trim() || fallback));
  });
}

function generateAccessCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function normalizeWhatsapp(input) {
  const digits = String(input || "").replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return digits;
}

async function listCounselors() {
  const profiles = await CounselorProfile.find().lean();
  const users = await User.find({ role: "COUNSELOR" }).select("email").lean();
  const emailById = new Map(users.map((u) => [String(u._id), u.email]));
  console.log(`\n📋 عدد الأخصائيين: ${profiles.length}\n`);
  for (const p of profiles) {
    console.log(`• ${p.fullName}`);
    console.log(`  البريد: ${emailById.get(String(p.userId)) ?? "—"}`);
    console.log(`  واتساب: ${p.whatsapp ? "+" + p.whatsapp : "—"}`);
    console.log(`  التخصصات: ${(p.specialties || []).join(", ") || "—"}`);
    console.log(`  الحالة: ${p.verificationStatus} | متاح: ${p.available ? "نعم" : "لا"}`);
    console.log("");
  }
}

async function setVerification(email, status) {
  const user = await User.findOne({ email: String(email).toLowerCase() }).lean();
  if (!user) {
    console.error(`❌ لا يوجد مستخدم بالبريد: ${email}`);
    process.exitCode = 1;
    return;
  }
  const res = await CounselorProfile.updateOne({ userId: user._id }, { $set: { verificationStatus: status } });
  if (res.matchedCount === 0) {
    console.error(`❌ لا يوجد ملف أخصائي لهذا المستخدم: ${email}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✅ تم تحديث حالة ${email} إلى ${status}`);
}

async function interactiveAdd() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log("\n🇩🇿 إضافة أخصائي حقيقي إلى قاعدة بيانات رفيقي النفسي\n");

  const fullName = await ask(rl, "الاسم الكامل");
  if (!fullName) {
    console.error("❌ الاسم مطلوب");
    rl.close();
    process.exit(1);
  }
  const email = (await ask(rl, "البريد الإلكتروني (يُستخدم للدخول)")).toLowerCase();
  if (!email || !email.includes("@")) {
    console.error("❌ بريد غير صالح");
    rl.close();
    process.exit(1);
  }
  const whatsappRaw = await ask(rl, "رقم واتساب بالصيغة الدولية (مثال: 213555123456 أو +213...)");
  const whatsapp = normalizeWhatsapp(whatsappRaw);
  if (!whatsapp) {
    console.error("❌ رقم واتساب غير صالح (7–15 خانة أرقام)");
    rl.close();
    process.exit(1);
  }
  console.log(`   التخصصات المتاحة: ${SPECIALTIES.join(", ")}`);
  const specialties = (await ask(rl, "التخصصات مفصولة بفاصلة", "trauma,grief"))
    .split(",")
    .map((s) => s.trim())
    .filter((s) => SPECIALTIES.includes(s));
  if (!specialties.length) {
    console.error("❌ يجب اختيار تخصص واحد على الأقل من القائمة");
    rl.close();
    process.exit(1);
  }
  console.log(`   اللغات المتاحة: ${LANGUAGES.join(", ")}`);
  const languages = (await ask(rl, "لغات الاستشارة مفصولة بفاصلة", "ar"))
    .split(",")
    .map((s) => s.trim())
    .filter((s) => LANGUAGES.includes(s));
  if (!languages.length) {
    console.error("❌ يجب اختيار لغة واحدة على الأقل");
    rl.close();
    process.exit(1);
  }
  const yearsExperience = Number(await ask(rl, "سنوات الخبرة", "0")) || 0;
  const diplomaRef = await ask(rl, "مرجع الشهادة/الترخيص (اختياري)");
  const bio = await ask(rl, "نبذة تعريفية (اختياري)");
  const verified = (await ask(rl, "توثيق فوري؟ y/n", "n")).toLowerCase() === "y";

  const existing = await User.findOne({ email }).lean();
  if (existing) {
    console.error(`❌ البريد مستخدم مسبقاً: ${email}`);
    rl.close();
    process.exit(1);
  }

  const accessCode = generateAccessCode();
  const user = await User.create({
    role: "COUNSELOR",
    email,
    accessCode,
    pseudonym: fullName,
    language: languages[0] || "ar",
  });
  await CounselorProfile.create({
    userId: user._id,
    fullName,
    specialties,
    languages,
    whatsapp,
    yearsExperience,
    diplomaRef: diplomaRef || null,
    bio: bio || null,
    verificationStatus: verified ? "VERIFIED" : "PENDING",
    available: true,
  });

  console.log("\n────────────────────────────────────────────");
  console.log(`✅ تمت إضافة الأخصائي: ${fullName}`);
  console.log(`   البريد:      ${email}`);
  console.log(`   رمز الدخول:  ${accessCode}  ← أرسله للأخصائي`);
  console.log(`   واتساب:      +${whatsapp}`);
  console.log(`   الحالة:      ${verified ? "موثّق (يظهر فوراً للمتضررين)" : "قيد التحقق (وثّقه من لوحة الإدارة أو --verify)"}`);
  console.log("────────────────────────────────────────────\n");
  rl.close();
}

async function main() {
  const args = process.argv.slice(2);
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });

  try {
    if (args[0] === "--list") {
      await listCounselors();
    } else if (args[0] === "--verify" && args[1]) {
      await setVerification(args[1], "VERIFIED");
    } else if (args[0] === "--unverify" && args[1]) {
      await setVerification(args[1], "PENDING");
    } else {
      await interactiveAdd();
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((e) => {
  console.error("❌ خطأ:", e.message);
  process.exit(1);
});
