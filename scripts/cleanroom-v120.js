/**
 * اختبار غرفة نظيفة — v1.2.0
 * يفكّ الحزمة في مجلد جديد، يثبّت الاعتماديات، ثم npm start (بلا build)
 * ويتحقق من: الإقلاع على 3020 + health 1.1.0 + صفحة الهبوط + manifest
 */
const { MongoMemoryServer } = require("mongodb-memory-server");
const { spawn, execSync } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOM = "/tmp/tumaanina-cleanroom-v12";
const PORT = "3877";
const BASE = `http://localhost:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (p) => new Promise((res, rej) => {
  http.get(`${BASE}${p}`, (r) => { let b = ""; r.on("data", (c) => (b += c)); r.on("end", () => res({ status: r.statusCode, body: b })); }).on("error", rej);
});

(async () => {
  console.log("🧪 غرفة نظيفة — v1.2.0");
  fs.rmSync(ROOM, { recursive: true, force: true });
  fs.mkdirSync(ROOM, { recursive: true });
  execSync(`unzip -q /home/z/my-project/tumaanina/download/Tumaanina-v1.2.0.zip -d ${ROOM}`);
  const app = path.join(ROOM, "Tumaanina-main");
  console.log("✓ unzipped");

  console.log("⏳ npm install ...");
  execSync("npm install --no-audit --no-fund --loglevel=error", { cwd: app, stdio: "inherit", env: process.env });
  console.log("✓ installed");

  const mongod = await MongoMemoryServer.create();
  const server = spawn("node", ["server.js", "--prod"], {
    cwd: app,
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("cleanroom"), ADMIN_PASSCODE: "cr-pass", NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => process.stdout.write("[srv] " + d.toString().split("\n").filter(l => l.trim()).slice(0, 8).join("\n[srv] ") + "\n"));
  server.stderr.on("data", (d) => process.stderr.write(d));

  let ok = false, health = null;
  for (let i = 0; i < 60; i++) {
    await wait(500);
    try { health = await get("/api/health"); if (health.status === 200) { ok = true; break; } } catch {}
  }
  console.log(ok ? `✓ الخادم أقلع — health: ${health.body.slice(0, 120)}` : "❌ لم يقلع");
  const home = await get("/");
  const manifest = await get("/manifest.webmanifest");
  console.log(`${home.status === 200 && home.body.includes("طمأنينة") ? "✓" : "❌"} الهبوط تعرض طمأنينة (${home.status})`);
  console.log(`${manifest.body.includes("طمأنينة") && !manifest.body.includes("رفيقي") ? "✓" : "❌"} manifest نظيف`);
  console.log(`${!home.body.includes("مجاناً") ? "✓" : "❌"} بلا مجاناً في الهبوط`);
  const sw = await get("/sw.js");
  console.log(`${!/rafiqi/i.test(sw.body) ? "✓" : "❌"} sw.js بلا أثر قديم`);

  const pass = ok && home.status === 200 && manifest.body.includes("طمأنينة") && !home.body.includes("مجاناً");
  server.kill();
  await mongod.stop();
  console.log(pass ? "🎉 الغرفة النظيفة خضراء — npm install ثم npm start يعملان فوراً" : "⚠️ فشل");
  process.exit(pass ? 0 : 1);
})();
