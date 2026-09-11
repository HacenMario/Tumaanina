/* تحقق بصري — طمأنينة v1.2.0: لوحة الأخصائي + العملات + الأخضر الأطلسي */
const { MongoMemoryServer } = require("mongodb-memory-server");
const { spawn } = require("child_process");
const http = require("http");
const { chromium } = require("playwright");
const fs = require("fs");

const PORT = "3992";
const BASE = `http://localhost:${PORT}`;
const OUT = "download/v120-shots";
fs.mkdirSync(OUT, { recursive: true });

function req(m, p, b) {
  return new Promise((res, rej) => {
    const d = b ? JSON.stringify(b) : null;
    const r = http.request(`${BASE}${p}`, { method: m, headers: { "Content-Type": "application/json", ...(d ? { "Content-Length": Buffer.byteLength(d) } : {}) } }, (x) => { let buf = ""; x.on("data", (c) => (buf += c)); x.on("end", () => { let j = null; try { j = JSON.parse(buf); } catch {} res({ status: x.statusCode, json: j }); }); });
    r.on("error", rej); if (d) r.write(d); r.end();
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const mongod = await MongoMemoryServer.create();
  const server = spawn("node", ["server.js", "--prod"], {
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("visual-v120"), ADMIN_PASSCODE: "vis-pass", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let ready = false;
  for (let i = 0; i < 60; i++) { await wait(500); try { const h = await req("GET", "/api/health"); if (h.json?.ok) { ready = true; break; } } catch {} }
  if (!ready) { console.error("server not ready"); process.exit(1); }
  await req("POST", "/api/admin", { action: "login", passcode: "vis-pass" });

  /* بيانات: أخصائي موثّق + عميل + 4 جلسات مكتملة بسعر 2000 */
  const cEmail = `doc-vis-${Date.now()}@test.dz`;
  await req("POST", "/api/counselor", {
    action: "register", fullName: "د. ياسمين الأطلس", email: cEmail,
    password: "vis-pass-123", recoveryPhrase: "عبارة العرض البصري الثاني",
    specialties: ["anxietyDepression"], languages: ["ar"], yearsExperience: 11,
    whatsapp: "213666777000", sessionPrice: 2000,
    bio: "أخصائية نفسية — مرافقة نفسية احترافية بسرّية تامة.",
  });
  const counselor = (await req("POST", "/api/counselor", { action: "login", email: cEmail, password: "vis-pass-123" })).json.user;
  const prof = await req("GET", `/api/counselor?userId=${counselor.id}`);
  await req("POST", "/api/admin", { action: "verify", profileId: prof.json?.profile?.id });
  const client = (await req("POST", "/api/client", {
    action: "register", pseudonym: "سليم", password: "vis-pass-123",
    recoveryPhrase: "عبارة العرض للعميل", gender: "male", phone: "0555777002",
  })).json.user;
  for (let k = 1; k <= 4; k++) {
    const when = new Date(Date.now() + (24 + k * 28) * 3600 * 1000).toISOString();
    const b = await req("POST", "/api/sessions", { victimId: client.id, counselorId: counselor.id, topic: "anxiety", mode: "TEXT", scheduledAt: when });
    const sid = b.json?.session?.id;
    await req("PATCH", `/api/sessions/${sid}`, { status: "ACCEPTED", durationMinutes: 45 });
    await req("PATCH", `/api/sessions/${sid}`, { status: "COMPLETED" });
  }

  const browser = await chromium.launch();

  /* 1) لوحة الأخصائي — إحصائيات + مستحقات الشهر */
  let ctx = await browser.newContext({ locale: "ar", viewport: { width: 1360, height: 940 } });
  let page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await wait(2000);
  await page.evaluate((uid) => {
    const st = JSON.parse(localStorage.getItem("tumaanina-state") || "{}");
    st.state = { ...(st.state || {}), user: { id: uid, role: "COUNSELOR", fullName: "د. ياسمين الأطلس" }, view: "counselor-stats" };
    localStorage.setItem("tumaanina-state", JSON.stringify(st));
  }, counselor.id);
  await page.goto(`${BASE}/?view=counselor-stats`, { waitUntil: "networkidle" });
  await wait(3000);
  await page.screenshot({ path: `${OUT}/v120-01-dashboard.png` });
  await page.close(); await ctx.close();

  /* 2) دليل الأخصائيين بعملة EUR */
  ctx = await browser.newContext({ locale: "ar", viewport: { width: 1360, height: 940 } });
  page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await wait(1800);
  await page.evaluate((uid) => {
    const st = JSON.parse(localStorage.getItem("tumaanina-state") || "{}");
    st.state = { ...(st.state || {}), user: { id: uid, role: "VICTIM", pseudonym: "سليم" }, view: "counselors-directory", currency: "EUR" };
    localStorage.setItem("tumaanina-state", JSON.stringify(st));
  }, client.id);
  await page.goto(`${BASE}/?view=counselors-directory`, { waitUntil: "networkidle" });
  await wait(2800);
  try {
    const closeBtns = await page.locator("button[aria-label]").all();
    for (const b of closeBtns) {
      const lbl = (await b.getAttribute("aria-label")) || "";
      if (lbl.includes("إغلاق") || lbl.includes("إخفاء")) { await b.click({ timeout: 1200 }); break; }
    }
  } catch {}
  await wait(600);
  await page.screenshot({ path: `${OUT}/v120-02-directory-eur.png` });
  await page.close(); await ctx.close();

  /* 3) الثيمات — الأخضر الأطلسي على الهبوط */
  ctx = await browser.newContext({ locale: "ar", viewport: { width: 1360, height: 940 } });
  page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("tumaanina-palette", "atlasgreen");
  });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await wait(2400);
  try {
    const closeBtns = await page.locator("button[aria-label]").all();
    for (const b of closeBtns) {
      const lbl = (await b.getAttribute("aria-label")) || "";
      if (lbl.includes("إغلاق") || lbl.includes("إخفاء")) { await b.click({ timeout: 1200 }); break; }
    }
  } catch {}
  await wait(500);
  await page.screenshot({ path: `${OUT}/v120-03-atlas-green.png` });
  await page.close(); await ctx.close();

  await browser.close();
  server.kill();
  await mongod.stop();
  console.log(`✓ screenshots → ${OUT}`);
  process.exit(0);
})();
