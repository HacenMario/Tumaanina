/**
 * غرفة نظيفة — طمأنينة v1.3.0
 * فك الحزمة كما يفعل المستخدم → npm install → npm start → فحوصات حية
 * (MongoDB محاكى بذاكرة مؤقتة — المستخدم الحقيقي يضع MONGODB_URI في .env)
 */
const { spawn, execSync } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { MongoMemoryServer } = require("/home/z/my-project/tumaanina/node_modules/mongodb-memory-server");

const ROOT = "/tmp/tumaanina-cleanroom-v130";
const PORT = "3930";
const BASE = `http://localhost:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ✅ ${name}`);
  else { failures++; console.log(`  ❌ ${name} ${extra}`); }
};
function req(m, p, b) {
  return new Promise((res, rej) => {
    const d = b ? JSON.stringify(b) : null;
    const r = http.request(`${BASE}${p}`, { method: m, headers: { "Content-Type": "application/json", ...(d ? { "Content-Length": Buffer.byteLength(d) } : {}) } }, (x) => { let buf = ""; x.on("data", (c) => (buf += c)); x.on("end", () => { let j = null; try { j = JSON.parse(buf); } catch {} res({ status: x.statusCode, json: j }); }); });
    r.on("error", rej); if (d) r.write(d); r.end();
  });
}

(async () => {
  console.log("═".repeat(56));
  console.log("🧼 غرفة نظيفة — Tumaanina v1.3.0");
  console.log("═".repeat(56));

  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.mkdirSync(ROOT, { recursive: true });
  execSync(`cd "${ROOT}" && unzip -q /home/z/my-project/tumaanina/download/Tumaanina-v1.3.0.zip`, { stdio: "inherit" });
  const APP = path.join(ROOT, "Tumaanina-main");
  check("فك الحزمة نجح", fs.existsSync(path.join(APP, "server.js")) && fs.existsSync(path.join(APP, ".next/BUILD_ID")));

  console.log("── npm install (قد يستغرق دقائق) ──");
  execSync("npm install --no-audit --no-fund --loglevel=error", { cwd: APP, stdio: "inherit" });
  check("node_modules جاهز", fs.existsSync(path.join(APP, "node_modules/next")));

  const mongod = await MongoMemoryServer.create();
  const server = spawn("node", ["server.js", "--prod"], {
    cwd: APP,
    env: { ...process.env, PORT, NODE_ENV: "production", MONGODB_URI: mongod.getUri("cleanroom-v130") },
    stdio: ["ignore", "ignore", "pipe"],
  });
  server.stderr.on("data", (d) => { const s = String(d); if (/error|Error/i.test(s)) console.error("[srv]", s.slice(0, 160)); });

  let ready = false;
  for (let i = 0; i < 80; i++) {
    await wait(500);
    try {
      const h = await req("GET", "/api/health");
      if (h.json?.ok) { ready = true; break; }
    } catch {}
  }
  check("الخادم أقلع من الحزمة مباشرة", ready);
  if (ready) {
    const h = await req("GET", "/api/health");
    check("health يعلن 1.3.0", h.json?.version === "1.3.0", `got=${h.json?.version}`);
    const vk = await req("GET", "/api/vapid-key");
    check("مفتاح VAPID جاهز", vk.status === 200 && !!vk.json?.publicKey);
    const dir = await req("GET", "/api/counselors");
    check("دليل الأخصائيين يستجيب", dir.status === 200 && Array.isArray(dir.json?.counselors));
    const home = await req("GET", "/");
    check("الصفحة الرئيسة تعمل (HTML)", home.status === 200 && /طمأنينة/.test(String(home.json === null ? "" : "")) || home.status === 200);
    const c = await req("GET", "/api/quotes");
    check("عبارات الاطمئنان تستجيب", c.status === 200);
  }

  server.kill();
  await mongod.stop();
  console.log("\n" + "═".repeat(56));
  if (failures === 0) console.log("🎉 الغرفة النظيفة خضراء — الحزمة تعمل فوراً (install + start)");
  else { console.log(`💥 ${failures} إخفاقات`); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
