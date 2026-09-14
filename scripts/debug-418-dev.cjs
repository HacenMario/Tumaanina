/**
 * تشخيص React #418 — تشغيل وضع التطوير لالتقاط فرق الترطيب الكامل
 */
const { spawn } = require("child_process");
const { chromium } = require("/home/z/.npm-global/lib/node_modules/playwright");
const { MongoMemoryServer } = require("/home/z/my-project/tumaanina/Tumaanina-main/node_modules/mongodb-memory-server");
const PORT = "3996";
const BASE = `http://127.0.0.1:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const mongod = await MongoMemoryServer.create({ instance: { port: 27080 } });
  /* next dev مباشرة */
  const server = spawn("node", ["node_modules/next/dist/bin/next", "dev", "-p", PORT], {
    cwd: "/home/z/my-project/tumaanina/Tumaanina-main",
    env: { ...process.env, MONGODB_URI: mongod.getUri("dbg418"), ADMIN_PASSCODE: "x" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  server.stdout.on("data", (d) => { out += d.toString(); });
  server.stderr.on("data", (d) => { out += d.toString(); });
  let ready = false;
  for (let i = 0; i < 120; i++) {
    await wait(1000);
    try { const r = await fetch(`${BASE}`); if (r.ok) { ready = true; break; } } catch {}
  }
  console.log(ready ? "✓ dev جاهز" : "✗ dev لم يجهز\n" + out.slice(-1500));
  if (!ready) { server.kill(); await mongod.stop(); process.exit(1); }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await wait(4000);
  const hyd = errs.filter((e) => /hydrat|#418|did not match|server rendered/i.test(e));
  console.log(`أخطاء ترطيب: ${hyd.length}`);
  hyd.slice(0, 3).forEach((e) => console.log("═══════\n" + e.slice(0, 3500)));
  const other = errs.filter((e) => !/hydrat|#418|did not match/i.test(e) && !/favicon/i.test(e));
  console.log(`أخطاء أخرى: ${other.length}`);
  other.slice(0, 3).forEach((e) => console.log("──\n" + e.slice(0, 500)));
  await browser.close();
  server.kill(); await mongod.stop();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
