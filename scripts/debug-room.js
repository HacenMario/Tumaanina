/* مسبار تشخيصي 2 — لماذا تنهار غرفة الجلسة للأخصائي؟ */
const { MongoMemoryServer } = require("mongodb-memory-server");
const { spawn } = require("child_process");
const http = require("http");
const { chromium } = require("playwright");

const PORT = "3995";
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
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("dbg2"), ADMIN_PASSCODE: "dbg-pass", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  for (let i = 0; i < 60; i++) { await wait(500); try { const h = await req("GET", "/api/health"); if (h.json?.ok) break; } catch {} }

  const cEmail = `dbg2-${Date.now()}@test.dz`;
  await req("POST", "/api/counselor", { action: "register", fullName: "د. غرفة", email: cEmail, password: "dbg-pass-123", recoveryPhrase: "عبارة الغرفة", specialties: ["anxietyDepression"], languages: ["ar"], yearsExperience: 5, whatsapp: "213666777000", sessionPrice: 2000 });
  const counselor = (await req("POST", "/api/counselor", { action: "login", email: cEmail, password: "dbg-pass-123" })).json.user;
  const prof = (await req("GET", `/api/counselor?userId=${counselor.id}`)).json?.profile;
  const login = await req("POST", "/api/admin", { action: "login", passcode: "dbg-pass" });
  await req("POST", "/api/admin", { action: "verify", profileId: prof?.id }, { "x-admin-token": login.json?.token });
  const client = (await req("POST", "/api/client", { action: "register", pseudonym: "سارة", password: "dbg-pass-123", recoveryPhrase: "عبارة العميلة سارة", gender: "female", phone: "0555000222" })).json.user;
  const bk = await req("POST", "/api/sessions", { victimId: client.id, counselorId: counselor.id, topic: "stress", mode: "TEXT", scheduledAt: new Date(Date.now() + 96 * 3600 * 1000).toISOString(), currency: "DZD" });
  const sid = bk.json?.session?.id;
  await req("PATCH", `/api/sessions/${sid}`, { status: "ACCEPTED", durationMinutes: 45 });
  await req("POST", "/api/messages", { sessionId: sid, senderRole: "VICTIM", senderName: "سارة", senderId: client.id, content: "مرحباً دكتور" });
  console.log("session:", sid);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) console.log("CONSOLE-" + m.type().toUpperCase() + ":", m.text().slice(0, 500)); });
  page.on("pageerror", (e) => console.log("PAGE-ERROR:", String(e.stack || e.message).slice(0, 1200)));

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await wait(2500);
  await page.evaluate(async (email) => {
    const r = await fetch("/api/counselor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", email, password: "dbg-pass-123" }) });
    const j = await r.json();
    const st = JSON.parse(localStorage.getItem("tumaanina-state") || "{}");
    const version = typeof st.version === "number" ? st.version : 0;
    localStorage.setItem("tumaanina-state", JSON.stringify({ ...st, version, state: { ...(st.state || {}), user: j.user } }));
  }, cEmail);
  await page.goto(`${BASE}/?session=${sid}`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await wait(5000);
  const diag = await page.evaluate(() => ({
    bodySnippet: (document.body.innerText || "").slice(0, 300).replace(/\n+/g, " | "),
    hasTextarea: !!document.querySelector("textarea"),
    chatBtns: Array.from(document.querySelectorAll("button")).filter((b) => (b.textContent || "").includes("افتح الدردشة")).length,
  }));
  console.log("ROOM-DIAG:", JSON.stringify(diag, null, 2));
  await page.screenshot({ path: "download/v150-shots/debug-room.png" });
  await browser.close(); server.kill(); await mongod.stop(); process.exit(0);
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
