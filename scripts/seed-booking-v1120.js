#!/usr/bin/env node
/** إنشاء عميل + حجز عبر API على خادم الفحص البصري (3197) — لاختبار الطباعة من الواجهة */
const mongoose = require("mongoose");
const { randomBytes, scryptSync } = require("crypto");

const MONGO = process.env.VISUAL_MONGO; // من سجل الإقلاع
const BASE = "http://127.0.0.1:3197";

async function main() {
  const conn = await mongoose.createConnection(MONGO, { serverSelectionTimeoutMS: 8000 }).asPromise();
  const UserSchema = new mongoose.Schema(
    { pseudonym: String, fullName: String, role: String, language: { type: String, default: "ar" }, gender: String },
    { timestamps: true, collection: "users" }
  );
  const U = conn.model("User", UserSchema);
  let client = await U.findOne({ pseudonym: "عميل-الطباعة" });
  if (!client) client = await U.create({ role: "VICTIM", pseudonym: "عميل-الطباعة", fullName: "عميل تجربة الطباعة", gender: "female" });
  const counselor = await U.findOne({ email: "test@local" });
  await conn.close();

  /* إمضاء الأخصائي على عقد المنصة أولاً (إن لم يكن ممضياً) */
  const prof = await fetch(`${BASE}/api/contract?view=template&userId=${counselor._id}`).then((r) => r.json());
  if (prof?.template && !prof.template.signature) {
    const TINY = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const s = await fetch(`${BASE}/api/contract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "counselor-sign", userId: counselor._id.toString(), signature: TINY }),
    }).then((r) => r.json());
    console.log("✍️ إمضاء الأخصائي:", s.ok ? "تم" : s);
  }

  /* حجز جلسة الغد 11:00 */
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  const sched = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 11, 0, 0).toISOString();
  const b = await fetch(`${BASE}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      victimId: client._id.toString(),
      counselorId: counselor._id.toString(),
      topic: "anxiety",
      mode: "TEXT",
      scheduledAt: sched,
    }),
  }).then((r) => r.json());
  console.log("📅 الحجز:", b.ok ? `عقد ${b.contract?.number}` : JSON.stringify(b));
}
main().catch((e) => { console.error(e); process.exit(1); });
