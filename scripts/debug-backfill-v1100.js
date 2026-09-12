/* تصحيح مركّز — backfill عند تحديث القالب لحالة PENDING */
const { MongoMemoryServer } = require("mongodb-memory-server");
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

const PORT = String(4500 + (process.pid % 100));
const BASE = `http://localhost:${PORT}`;
let ADMIN_TOKEN = "";

function req(method, pathQ, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(`${BASE}${pathQ}`, {
      method,
      headers: { "Content-Type": "application/json", ...(ADMIN_TOKEN ? { "x-admin-token": ADMIN_TOKEN } : {}), ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}) },
    }, (res) => {
      let buf = "";
      res.on("data", (c) => (buf += c));
      res.on("end", () => { let j = null; try { j = JSON.parse(buf); } catch {} resolve({ status: res.statusCode, json: j }); });
    });
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const SIG_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAUCAYAAAD/RnK7AAAAKklEQVR42u3NMQEAAAgDoJfafLDjDSSAgICAgICAgICAgICAgICAgICAgICAgB5bDgEFAASyPQAAAAASUVORK5CYII=";
const T1 = "عقد تجريبي أول بنص كافٍ الطول لاجتياز فحص المئة حرف في الخادم — بند 1 السرية وند 2 المواعيد وند 3 الرسوم.";
const T2 = T1 + " بند إضافي جديد v2.";

(async () => {
  const mongod = await MongoMemoryServer.create();
  const server = spawn("node", ["server.js"], {
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("dbg"), ADMIN_PASSCODE: "x", NODE_ENV: "production" },
    stdio: ["ignore", "inherit", "inherit"],
  });
  for (let i = 0; i < 60; i++) { await wait(500); try { const h = await req("GET", "/api/health"); if (h.json?.ok) break; } catch {} }
  const login = await req("POST", "/api/admin", { action: "login", passcode: "x" });
  ADMIN_TOKEN = login.json?.token || "";

  const client = (await req("POST", "/api/client", { action: "register", pseudonym: "عميل", password: "p123456", recoveryPhrase: "عبارة", gender: "male" })).json.user;
  const cEmail = `d${Date.now()}@t.dz`;
  await req("POST", "/api/counselor", { action: "register", fullName: "د. اختبار", email: cEmail, password: "p123456", recoveryPhrase: "عبارة", specialties: [], languages: ["ar"], yearsExperience: 1, whatsapp: "213600000000", sessionPrice: 1000 });
  const c = (await req("POST", "/api/counselor", { action: "login", email: cEmail, password: "p123456" })).json.user;
  const prof = (await req("GET", `/api/counselor?userId=${c.id}`)).json?.profile;
  await req("POST", "/api/admin", { action: "verify", profileId: prof?.id });

  /* حجز أولاً (بلا قالب) */
  const b = await req("POST", "/api/sessions", { victimId: client.id, counselorId: c.id, topic: "anxiety", mode: "TEXT", scheduledAt: new Date(Date.now() + 48 * 3600e3).toISOString(), currency: "DZD" });
  console.log("booking contract (should be null):", JSON.stringify(b.json?.contract));

  /* ثم حفظ القالب → backfill */
  const s1 = await req("POST", "/api/contract", { action: "save-template", userId: c.id, text: T1, signature: SIG_PNG });
  console.log("save1 backfilled:", s1.json?.backfilled);
  const p1 = (await req("GET", `/api/contract?view=pending&userId=${client.id}`)).json?.contract;
  console.log("pending after save1:", p1 ? { number: p1.number, text: p1.text.slice(0, 30) } : null);

  /* تحديث القالب → يجب تحديث لقطة العقد المفتوح */
  const s2 = await req("POST", "/api/contract", { action: "save-template", userId: c.id, text: T2, signature: SIG_PNG });
  console.log("save2 backfilled:", s2.json?.backfilled);
  const p2 = (await req("GET", `/api/contract?view=pending&userId=${client.id}`)).json?.contract;
  console.log("pending after save2:", p2 ? { number: p2.number, hasV2: p2.text.includes("v2"), text: p2.text.slice(0, 30) } : null);

  server.kill();
  await mongod.stop();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
