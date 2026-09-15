#!/usr/bin/env node
/* عزل: هل GET /api/notifications?userId=admin يعيد 500 على قاعدة فارغة؟ */
import { spawn } from "child_process";
import { MongoMemoryServer } from "mongodb-memory-server";

const PORT = "3997";
const BASE = `http://127.0.0.1:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function req(path) {
  const res = await fetch(`${BASE}${path}`);
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const mongod = await MongoMemoryServer.create({ instance: { port: 27077 } });
const server = spawn("node", ["server.js"], {
  env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("tum-iso"), ADMIN_PASSCODE: "p20", NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
});
const logs = [];
server.stdout.on("data", (d) => logs.push(String(d)));
server.stderr.on("data", (d) => logs.push("E:" + String(d)));
for (let i = 0; i < 60; i++) { await wait(400); try { if ((await req("/api/health")).json?.version === "1.20.0") break; } catch {} }

console.log("admin (string):", JSON.stringify(await req("/api/notifications?userId=admin")));
console.log("real 24hex    :", JSON.stringify(await req("/api/notifications?userId=111111111111111111111111")));
await wait(200);
console.log("logs tail:\n" + logs.filter(l => l.includes("api-error") || l.includes("NOTIFY")).slice(-5).join(""));
server.kill(); await mongod.stop(); process.exit(0);
