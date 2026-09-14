/** التقاط كامل وسائط خطأ #418 في بناء الإنتاج (stack المكوّن) */
const { spawn } = require("child_process");
const { chromium } = require("/home/z/.npm-global/lib/node_modules/playwright");
const { MongoMemoryServer } = require("/home/z/my-project/tumaanina/Tumaanina-main/node_modules/mongodb-memory-server");
const PORT = "3997";
const BASE = `http://127.0.0.1:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const mongod = await MongoMemoryServer.create({ instance: { port: 27081 } });
  const server = spawn("node", ["server.js"], {
    cwd: "/home/z/my-project/tumaanina/Tumaanina-main",
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("e418"), ADMIN_PASSCODE: "x", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "ignore"],
  });
  for (let i = 0; i < 60; i++) { await wait(400); try { const h = await fetch(`${BASE}/api/health`).then(r => r.json()); if (h?.ok) break; } catch {} }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", async (msg) => {
    if (msg.type() !== "error") return;
    const t = msg.text();
    if (!/#418|hydrat/i.test(t)) return;
    console.log("═══ الخطأ:", t.slice(0, 200));
    for (const arg of msg.args()) {
      try {
        const val = await arg.evaluate((a) => {
          if (typeof a === "string") return a;
          try { return JSON.stringify(a); } catch { return String(a); }
        });
        console.log("─── وسيط:", String(val).slice(0, 2500));
      } catch { /* تم تحريره */ }
    }
  });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await wait(3000);
  await browser.close();
  server.kill(); await mongod.stop();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
