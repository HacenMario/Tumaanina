/* تشخيص: لماذا text=/DZD/ لا يُجدَد رغم ظهوره في اللقطة؟ */
const { MongoMemoryServer } = require("mongodb-memory-server");
const { spawn } = require("child_process");
const http = require("http");
const { chromium } = require("playwright");

const PORT = "3989";
const BASE = `http://localhost:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function req(m, p, b, headers = {}) {
  return new Promise((res, rej) => {
    const d = b ? JSON.stringify(b) : null;
    const r2 = http.request(`${BASE}${p}`, { method: m, headers: { "Content-Type": "application/json", ...(d ? { "Content-Length": Buffer.byteLength(d) } : {}), ...headers } }, (x) => { let buf = ""; x.on("data", (c) => (buf += c)); x.on("end", () => { let j = null; try { j = JSON.parse(buf); } catch {} res({ status: x.statusCode, json: j }); }); });
    r2.on("error", rej); if (d) r2.write(d); r2.end();
  });
}

(async () => {
  const mongod = await MongoMemoryServer.create();
  const server = spawn("node", ["server.js"], {
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("dzd-dbg"), ADMIN_PASSCODE: "p1", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "ignore"],
  });
  for (let i = 0; i < 60; i++) { await wait(500); try { if ((await req("GET", "/api/health")).json?.ok) break; } catch {} }
  const stamp = Date.now();
  const cl = await req("POST", "/api/clinic", { action: "register", name: "عيادة أ", email: `a${stamp}@t.dz`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة استرجاع طويلة" });
  const A_uid = cl.json.userId;
  await req("POST", "/api/courses", { userId: A_uid, title: "دورة تجربة", description: "وصف", price: 1800, capacity: 6 });
  const cli = (await req("POST", "/api/client", { action: "register", pseudonym: "عميل-تشخيص", password: "pass-tumaanina-1", recoveryPhrase: "عبارة استرجاع عميل", gender: "male", phone: "0555000001" })).json.user;

  const browser = await chromium.launch();
  const p1 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await p1.goto(`${BASE}/?view=courses`, { waitUntil: "networkidle" });
  await p1.evaluate((u) => { const s = localStorage.getItem("tumaanina-state"); if (s) { const st = JSON.parse(s); st.state.user = u; localStorage.setItem("tumaanina-state", JSON.stringify(st)); } }, cli);
  await p1.goto(`${BASE}/?view=courses`, { waitUntil: "networkidle" });
  await wait(1500);
  const probe = await p1.evaluate(() => {
    const badge = Array.from(document.querySelectorAll("span, div")).find((e) => e.textContent && e.textContent.includes("DZD") && e.children.length <= 2);
    return {
      found: !!badge,
      text: badge ? badge.textContent : null,
      html: badge ? badge.outerHTML.slice(0, 160) : null,
      anyDZD: document.body.textContent.includes("DZD"),
    };
  });
  console.log("probe:", JSON.stringify(probe, null, 1));
  console.log("locator text=/DZD/ count:", await p1.locator("text=/DZD/").count());
  console.log("locator text=DZD count:", await p1.locator("text=DZD").count());
  console.log("getByText DZD count:", await p1.getByText("DZD").count());
  await browser.close();
  server.kill();
  await mongod.stop();
  process.exit(0);
})();
