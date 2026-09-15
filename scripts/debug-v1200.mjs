#!/usr/bin/env node
/* تصحيح: إشعارا clinicAdSubmitted وclinicAdReply — فحص مباشر */
import { spawn } from "child_process";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

const PORT = "3999";
const BASE = `http://127.0.0.1:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(method, path, body = null, headers = {}) {
  const opt = { method, headers: { "Content-Type": "application/json", ...headers } };
  if (body) opt.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opt);
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

const run = async () => {
  const mongod = await MongoMemoryServer.create({ instance: { port: 27077 } });
  const server = spawn("node", ["server.js"], {
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("tumaanina-dbg2"), ADMIN_PASSCODE: "tum-pass-20", NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  server.stdout.on("data", (d) => logs.push(String(d)));
  server.stderr.on("data", (d) => logs.push(String(d)));

  for (let i = 0; i < 60; i++) {
    await wait(500);
    try { const h = await req("GET", "/api/health"); if (h.json?.version === "1.20.0") break; } catch {}
  }
  const admin = await req("POST", "/api/admin", { action: "login", passcode: "tum-pass-20" });
  const AH = { "x-admin-token": admin.json?.token || "" };
  const stamp = Date.now();
  const clA = await req("POST", "/api/clinic", { action: "register", name: `عيادة ${stamp}`, email: `a${stamp}@t.dz`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة استرجاع طويلة أ" });
  console.log("clinic register:", clA.status, JSON.stringify(clA.json).slice(0, 200));
  const A_uid = clA.json?.userId;
  const c1 = (await req("POST", "/api/client", { action: "register", pseudonym: `عميل ${stamp}`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة استرجاع طويلة ب", gender: "male", phone: "0555000001" })).json?.user;

  const createRes = await req("POST", "/api/ads", { action: "create", userId: A_uid, title: "إعلان تجريبي", body: "نص" });
  console.log("create ad:", createRes.status, JSON.stringify(createRes.json));
  await wait(400);
  const n1 = await req("GET", "/api/notifications?userId=admin");
  console.log("admin notifs:", n1.status, JSON.stringify((n1.json?.notifications || []).map((n) => n.key)));
  const c2 = new mongoose.Mongoose();
  await c2.connect(mongod.getUri("tumaanina-dbg2"));
  const all = await c2.connection.db.collection("notifications").find({}).toArray();
  console.log("RAW notifications collection:", JSON.stringify(all.map((n) => ({ u: String(n.userId), k: n.key }))));
  await c2.disconnect();

  const adsList = (await req("POST", "/api/ads/admin", { action: "ads-list" }, AH)).json?.ads || [];
  const adId = adsList[0]?.id;
  await req("POST", "/api/ads/admin", { action: "ads-approve", id: adId }, AH);
  const cm = await req("POST", "/api/ads", { action: "comment", userId: c1.id, id: adId, text: "تعليق تجريبي" });
  console.log("comment:", cm.status, JSON.stringify(cm.json));
  const rp = await req("POST", "/api/ads", { action: "comment-reply", userId: A_uid, id: adId, commentIndex: 0, text: "رد تجريبي" });
  console.log("reply:", rp.status, JSON.stringify(rp.json));
  await wait(400);
  const n2 = await req("GET", `/api/notifications?userId=${c1.id}`);
  console.log("client notifs:", n2.status, JSON.stringify((n2.json?.notifications || []).map((n) => n.key)));

  const bad = logs.filter((l) => l.includes("NOTIFY") || l.includes("Cast") || l.includes("api-error"));
  console.log("SERVER LOGS:\n" + bad.slice(-8).join(""));
  server.kill();
  await mongod.stop();
  process.exit(0);
};
run().catch((e) => { console.error("FATAL", e); process.exit(1); });
