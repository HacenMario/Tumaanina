/* مسبار تشخيصي: تحديد عناصر التجاوز الأفقي في غرفة الجلسة هاتفياً (v1.6.0 بند 4) */
const { MongoMemoryServer } = require("mongodb-memory-server");
const { spawn } = require("child_process");
const http = require("http");
const { chromium } = require("playwright");
const PORT = "3997";
const BASE = `http://localhost:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function req(m, p, b, headers = {}) {
  return new Promise((res, rej) => {
    const d = b ? JSON.stringify(b) : null;
    const r = http.request(`${BASE}${p}`, { method: m, headers: { "Content-Type": "application/json", ...headers, ...(d ? { "Content-Length": Buffer.byteLength(d) } : {}) } }, (x) => { let buf = ""; x.on("data", (c) => (buf += c)); x.on("end", () => { let j = null; try { j = JSON.parse(buf); } catch {} res({ status: x.statusCode, json: j }); }); });
    r.on("error", rej); if (d) r.write(d); r.end();
  });
}
(async () => {
  const mongod = await MongoMemoryServer.create();
  const server = spawn("node", ["server.js", "--prod"], { env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("probe-v170"), ADMIN_PASSCODE: "pass-probe-16", NODE_ENV: "production" }, stdio: ["ignore", "ignore", "ignore"] });
  for (let i = 0; i < 60; i++) { await wait(500); try { const h = await req("GET", "/api/health"); if (h.json?.ok) break; } catch {} }
  const lg = await req("POST", "/api/admin", { action: "login", passcode: "pass-probe-16" });
  const TOKEN = lg.json?.token || "";
  const cEmail = `docp-${Date.now()}@test.dz`;
  const reg = await req("POST", "/api/counselor", { action: "register", fullName: "د. نور الدين مرادي التجاوب", email: cEmail, password: "vis-pass-123", recoveryPhrase: "عبارة استرجاع للمسبار", specialties: ["anxietyDepression"], languages: ["ar"], yearsExperience: 9, whatsapp: "213666777000", sessionPrice: 2500 });
  console.log("register:", reg.status, JSON.stringify(reg.json).slice(0, 200));
  const counselor = (await req("POST", "/api/counselor", { action: "login", email: cEmail, password: "vis-pass-123" })).json.user;
  const prof = (await req("GET", `/api/counselor?userId=${counselor.id}`)).json?.profile;
  await req("POST", "/api/admin", { action: "verify", profileId: prof?.id }, { "x-admin-token": TOKEN });
  const client = (await req("POST", "/api/client", { action: "register", pseudonym: "أمينة-العميلة-المستعارة", password: "vis-pass-123", recoveryPhrase: "عبارة استرجاع للمسبار", gender: "female", phone: "0555777006" })).json.user;
  const bk = await req("POST", "/api/sessions", { victimId: client.id, counselorId: counselor.id, topic: "relationships", mode: "TEXT", scheduledAt: new Date(Date.now() + 96 * 3600 * 1000).toISOString(), currency: "DZD" });
  const sid = bk.json?.session?.id;
  await req("PATCH", `/api/sessions/${sid}`, { status: "ACCEPTED", durationMinutes: 45 });

  const browser = await chromium.launch();
  const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mob.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await mob.evaluate(async (email) => {
    const r = await fetch("/api/counselor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", email, password: "vis-pass-123" }) });
    const j = await r.json();
    if (j?.user) localStorage.setItem("tumaanina-inject-user", JSON.stringify(j.user));
  }, cEmail);
  await mob.addInitScript(() => {
    const raw = localStorage.getItem("tumaanina-inject-user");
    if (!raw) return;
    try { const user = JSON.parse(raw); const st = JSON.parse(localStorage.getItem("tumaanina-state") || "{}"); const v = typeof st.version === "number" ? st.version : 0; localStorage.setItem("tumaanina-state", JSON.stringify({ ...st, version: v, state: { ...(st.state || {}), user } })); } catch {}
  });
  await mob.goto(`${BASE}/?session=${sid}`, { waitUntil: "domcontentloaded" });
  await mob.waitForTimeout(3500);
  await mob.locator('button:has-text("تخطي")').first().click({ timeout: 3000, force: true }).catch(() => {});
  await mob.waitForTimeout(1200);
  const report = await mob.evaluate(() => {
    const vw = window.innerWidth;
    const docW = document.documentElement.scrollWidth;
    const out = [];
    document.querySelectorAll("*").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > vw + 1 || r.left < -1) && r.width > 24) {
        out.push({
          tag: el.tagName,
          cls: String(el.className?.baseVal ?? el.className).slice(0, 90),
          txt: String(el.textContent || "").trim().slice(0, 30),
          w: Math.round(r.width), l: Math.round(r.left), rgt: Math.round(r.right),
        });
      }
    });
    /* أعمق عناصر فقط */
    return { vw, docW, count: out.length, sample: out.filter((o, i, arr) => !arr.some((p) => p !== o && o.cls.includes(p.cls) && p.txt === o.txt)).slice(0, 14) };
  });
  console.log(JSON.stringify(report, null, 1));
  await browser.close();
  server.kill("SIGKILL");
  await mongod.stop();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
