/* تحقق بصري — طمأنينة v1.1.0: بلا محفظة + دينار جزائري + شعار جديد */
const { MongoMemoryServer } = require("mongodb-memory-server");
const { spawn } = require("child_process");
const http = require("http");
const { chromium } = require("playwright");
const fs = require("fs");

const PORT = "3991";
const BASE = `http://localhost:${PORT}`;
const OUT = "download/v110-shots";
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
  const server = spawn("node", ["server.js"], {
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("visual-v110"), ADMIN_PASSCODE: "vis-pass", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let ready = false;
  for (let i = 0; i < 60; i++) { await wait(500); try { const h = await req("GET", "/api/health"); if (h.json?.ok) { ready = true; break; } } catch {} }
  if (!ready) { console.error("server not ready"); process.exit(1); }
  await req("POST", "/api/admin", { action: "login", passcode: "vis-pass" });

  /* بيانات عرض: أخصائي بسعر 3000 دج + عميل */
  const cEmail = `doc-vis-${Date.now()}@test.dz`;
  await req("POST", "/api/counselor", {
    action: "register", fullName: "د. سارة الطمأنينة", email: cEmail,
    password: "vis-pass-123", recoveryPhrase: "عبارة العرض البصري",
    specialties: ["anxietyDepression", "sleep"], languages: ["ar", "fr"], yearsExperience: 9,
    whatsapp: "213666777000", sessionPrice: 3000,
    bio: "أخصائية نفسية سريرية، مرافقة نفسية للقلق واضطرابات النوم — استماع بلا حكم ومساحة آمنة تماماً.",
  });
  const counselor = (await req("POST", "/api/counselor", { action: "login", email: cEmail, password: "vis-pass-123" })).json.user;
  const prof = await req("GET", `/api/counselor?userId=${counselor.id}`);
  await req("POST", "/api/admin", { action: "verify", profileId: prof.json?.profile?.id });
  const client = (await req("POST", "/api/client", {
    action: "register", pseudonym: "أمين", password: "vis-pass-123",
    recoveryPhrase: "عبارة العرض", gender: "male", phone: "0555777001",
  })).json.user;

  const browser = await chromium.launch();
  /* إغلاق نافذة «لحظة اطمئنان» إن ظهرت */
  const dismissQuote = async (pg) => {
    try { await pg.locator('button[aria-label]').filter({ hasNot: pg.locator('[aria-hidden]') }).all(); } catch {}
    try {
      const btns = await pg.locator("button").all();
      for (const b of btns.reverse()) {
        try {
          const box = await b.boundingBox();
          const label = (await b.getAttribute("aria-label")) || "";
          if (label && (label.includes("إغلاق") || label.includes("إخفاء") || label.includes("close"))) { await b.click({ timeout: 1500 }); await wait(600); return; }
        } catch {}
      }
      /* احتياط: زر X الأول في النافذة */
      await pg.keyboard.press("Escape");
      await wait(500);
    } catch {}
  };

  /* 1) الهبوط — الشعار الجديد بلا مجان */
  let ctx = await browser.newContext({ locale: "ar", viewport: { width: 1360, height: 900 } });
  let page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await wait(2500);
  await page.screenshot({ path: `${OUT}/v110-01-landing-ar.png` });
  await page.close(); await ctx.close();

  /* 2) دليل الأخصائيين — السعر بالدينار في البطاقة (عميل مسجل) */
  ctx = await browser.newContext({ locale: "ar", viewport: { width: 1360, height: 900 } });
  page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await wait(1800);
  /* تسجيل دخول العميل عبر واجهة البدء */
  await page.evaluate((uid) => {
    const st = JSON.parse(localStorage.getItem("tumaanina-state") || "{}");
    st.state = { ...(st.state || {}), user: { id: uid, role: "VICTIM", pseudonym: "أمين", phone: "0555777001" }, view: "counselors-directory" };
    localStorage.setItem("tumaanina-state", JSON.stringify(st));
  }, client.id);
  await page.goto(`${BASE}/?view=counselors-directory`, { waitUntil: "networkidle" });
  await wait(2600);
  await dismissQuote(page);
  await page.screenshot({ path: `${OUT}/v110-02-directory-price-dzd.png` });

  /* 3) نافذة الحجز — كتلة السعر البارزة */
  try {
    await page.locator("text=احجز جلسة").first().click({ timeout: 5000 });
    await wait(1200);
    await page.screenshot({ path: `${OUT}/v110-03-booking-dialog-price.png` });
  } catch (e) { console.log("dialog click skipped:", e.message.split("\n")[0]); }
  await page.close(); await ctx.close();

  /* 4) صفحة «كيف تعمل» — نموذج الدفع الجديد */
  ctx = await browser.newContext({ locale: "ar", viewport: { width: 1360, height: 900 } });
  page = await ctx.newPage();
  await page.goto(`${BASE}/?view=how`, { waitUntil: "networkidle" });
  await wait(2200);
  await dismissQuote(page);
  await page.screenshot({ path: `${OUT}/v110-04-how-payment-model.png` });
  await page.close(); await ctx.close();

  /* 5) صفحة «عن طمأنينة» — القيم الجديدة */
  ctx = await browser.newContext({ locale: "ar", viewport: { width: 1360, height: 900 } });
  page = await ctx.newPage();
  await page.goto(`${BASE}/?view=about`, { waitUntil: "networkidle" });
  await wait(2200);
  await dismissQuote(page);
  await page.screenshot({ path: `${OUT}/v110-05-about-values.png` });
  await page.close(); await ctx.close();

  /* 6) الهبوط بالفرنسية — بلا gratuit */
  ctx = await browser.newContext({ locale: "fr", viewport: { width: 1360, height: 900 } });
  page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await wait(2200);
  await dismissQuote(page);
  await page.screenshot({ path: `${OUT}/v110-06-landing-fr.png` });
  await page.close(); await ctx.close();

  await browser.close();
  server.kill();
  await mongod.stop();
  console.log(`✓ screenshots → ${OUT}`);
  process.exit(0);
})();
