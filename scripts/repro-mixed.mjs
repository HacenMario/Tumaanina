#!/usr/bin/env node
/* تكرار مصغّر مع خادم ذاكرة فعلي: تسجيل PushSubscription ثم InAppNotification
   كما في التطبيق، ثم find/countDocuments بـ userId="admin" */
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

const mongod = await MongoMemoryServer.create({ instance: { port: 27077 } });
await mongoose.connect(mongod.getUri("tum-repro"));

const PushSchema = new mongoose.Schema(
  { userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true }, endpoint: String, p256dh: String, auth: String },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "push_subscriptions" }
);
mongoose.model("PushSubscription", PushSchema);

const InAppSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    key: { type: String, default: null },
    title: { type: String, default: "" },
    body: { type: String, default: "" },
    url: { type: String, default: "/" },
    read: { type: Boolean, default: false },
    vars: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "notifications" }
);
const M = mongoose.model("InAppNotification", InAppSchema);

try {
  await M.create({ userId: "admin", title: "t", body: "b" });
  const rows = await M.find({ userId: "admin" }).sort({ createdAt: -1 }).limit(50).lean();
  const n = await M.countDocuments({ userId: "admin", read: false });
  console.log("REPRO OK — find:", rows.length, "count:", n);
} catch (e) {
  console.log("REPRO ERROR:", e.name, e.message);
}
await mongoose.disconnect();
await mongod.stop();
process.exit(0);
