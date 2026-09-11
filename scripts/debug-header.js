/* لقطة تشخيصية للهيدر — هل النصوص متداخلة فعلاً؟ */
const { MongoMemoryServer } = require("mongodb-memory-server");
const { spawn } = require("child_process");
const http = require("http");
const { chromium } = require("playwright");
const PORT = "3996";
const BASE = `http://localhost:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const mongod = await MongoMemoryServer.create();
  const server = spawn("node", ["server.js", "--prod"], { env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("hdr"), ADMIN_PASSCODE: "x", NODE_ENV: "production" }, stdio: ["ignore", "ignore", "pipe"] });
  for (let i = 0; i < 60; i++) { await wait(500); try { const h = await new Promise((res) => http.get(`${BASE}/api/health`, (x) => { let b = ""; x.on("data", (c) => (b += c)); x.on("end", () => { try { res(JSON.parse(b || "{}")); } catch { res({}); } }); }).on("error", () => res({}))); if (h?.ok) break; } catch { break; } }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 400 } });
  await page.goto(`${BASE}/?view=counselors-directory`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await wait(3000);
  await page.screenshot({ path: "download/v150-shots/debug-header.png", clip: { x: 0, y: 0, width: 1280, height: 80 } });
  const overlap = await page.evaluate(() => {
    const header = document.querySelector("header") || document.querySelector("nav");
    if (!header) return "no header";
    const els = Array.from(header.querySelectorAll("a, button")).filter((e) => e.offsetParent !== null);
    const boxes = els.map((e) => ({ t: (e.innerText || "").trim().slice(0, 18), r: e.getBoundingClientRect() }));
    const hits = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].r, b = boxes[j].r;
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 8 && oy > 8) hits.push(`${boxes[i].t} × ${boxes[j].t} (${Math.round(ox)}px)`);
    }
    return hits.length ? hits : "لا تداخل";
  });
  console.log("OVERLAP-CHECK:", JSON.stringify(overlap, null, 2));
  await browser.close(); server.kill(); await mongod.stop(); process.exit(0);
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
