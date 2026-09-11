/* مسبار تشخيصي — لماذا لا تظهر النافذة المنبثقة عالمياً؟ */
const { MongoMemoryServer } = require("mongodb-memory-server");
const { spawn } = require("child_process");
const http = require("http");
const { chromium } = require("playwright");

const PORT = "3994";
const BASE = `http://localhost:${PORT}`;
function req(m, p, b, headers = {}) {
  return new Promise((res, rej) => {
    const d = b ? JSON.stringify(b) : null;
    const r = http.request(`${BASE}${p}`, { method: m, headers: { "Content-Type": "application/json", ...headers, ...(d ? { "Content-Length": Buffer.byteLength(d) } : {}) } }, (x) => { let buf = ""; x.on("data", (c) => (buf += c)); x.on("end", () => { let j = null; try { j = JSON.parse(buf); } catch {} res({ status: x.statusCode, json: j }); }); });
    r.on("error", rej); if (d) r.write(d); r.end();
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const mongod = await MongoMemoryServer.create();
  const server = spawn("node", ["server.js", "--prod"], {
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("dbg"), ADMIN_PASSCODE: "dbg-pass", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  for (let i = 0; i < 60; i++) { await wait(500); try { const h = await req("GET", "/api/health"); if (h.json?.ok) break; } catch {} }

  const cEmail = `dbg-${Date.now()}@test.dz`;
  await req("POST", "/api/counselor", { action: "register", fullName: "د. تشخيص", email: cEmail, password: "dbg-pass-123", recoveryPhrase: "عبارة التشخيص", specialties: ["anxietyDepression"], languages: ["ar"], yearsExperience: 5, whatsapp: "213666777000", sessionPrice: 2000 });
  const counselor = (await req("POST", "/api/counselor", { action: "login", email: cEmail, password: "dbg-pass-123" })).json.user;
  const prof = (await req("GET", `/api/counselor?userId=${counselor.id}`)).json?.profile;
  const login = await req("POST", "/api/admin", { action: "login", passcode: "dbg-pass" });
  await req("POST", "/api/admin", { action: "verify", profileId: prof?.id }, { "x-admin-token": login.json?.token });
  const client = (await req("POST", "/api/client", { action: "register", pseudonym: "زينب", password: "dbg-pass-123", recoveryPhrase: "عبارة العميلة", gender: "female", phone: "0555000111" })).json.user;
  const bk = await req("POST", "/api/sessions", { victimId: client.id, counselorId: counselor.id, topic: "stress", mode: "TEXT", scheduledAt: new Date(Date.now() + 96 * 3600 * 1000).toISOString(), currency: "DZD" });
  console.log("seeded pending session:", bk.json?.session?.id);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("console", (m) => { if (m.type() === "error") console.log("PAGE-ERR:", m.text().slice(0, 160)); });

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await wait(2500);
  await page.evaluate((email) => {
    return fetch("/api/counselor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", email, password: "dbg-pass-123" }) })
      .then((r) => r.json())
      .then((j) => {
        const st = JSON.parse(localStorage.getItem("tumaanina-state") || "{}");
        localStorage.setItem("tumaanina-state", JSON.stringify({ ...st, state: { ...(st.state || {}), user: j.user } }));
        return JSON.stringify(j.user);
      });
  }, cEmail).then(console.log);

  await page.goto(`${BASE}/?view=community`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await wait(4000);
  const diag = await page.evaluate(async () => {
    const st = JSON.parse(localStorage.getItem("tumaanina-state") || "{}");
    const u = st?.state?.user || null;
    let sess = null;
    if (u?.id) {
      const r = await fetch(`/api/sessions?userId=${u.id}&role=COUNSELOR`);
      sess = (await r.json())?.sessions?.map((s) => ({ id: s.id, status: s.status }));
    }
    return {
      storedUser: u ? { id: u.id, role: u.role, fullName: u.fullName } : null,
      sessions: sess,
      popupText: !!Array.from(document.querySelectorAll("*")).find((el) => el.children.length === 0 && (el.textContent || "").includes("طلب حجز جديد")),
      welcomeDialogs: document.querySelectorAll('[aria-label="لحظة اطمئنان"]').length,
      anyDialog: document.querySelectorAll("[data-slot=dialog-content]").length,
    };
  });
  console.log("DIAG:", JSON.stringify(diag, null, 2));
  await wait(8000);
  const diag2 = await page.evaluate(() => ({
    popupText: !!Array.from(document.querySelectorAll("*")).find((el) => el.children.length === 0 && (el.textContent || "").includes("طلب حجز جديد")),
  }));
  console.log("DIAG+8s:", JSON.stringify(diag2));
  await page.screenshot({ path: "download/v150-shots/debug-popup.png" });

  await browser.close(); server.kill(); await mongod.stop(); process.exit(0);
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
