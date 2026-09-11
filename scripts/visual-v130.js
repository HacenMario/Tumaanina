/* تحقق بصري — طمأنينة v1.3.0: أسعار ثلاث عملات + حفظ الإعدادات + الرابط العام */
const { MongoMemoryServer } = require("mongodb-memory-server");
const { spawn } = require("child_process");
const http = require("http");
const { chromium } = require("playwright");
const fs = require("fs");

const PORT = "3994";
const BASE = `http://localhost:${PORT}`;
const OUT = "download/v130-shots";
fs.mkdirSync(OUT, { recursive: true });

function req(m, p, b) {
  return new Promise((res, rej) => {
    const d = b ? JSON.stringify(b) : null;
    const r = http.request(`${BASE}${p}`, { method: m, headers: { "Content-Type": "application/json", ...(d ? { "Content-Length": Buffer.byteLength(d) } : {}) } }, (x) => { let buf = ""; x.on("data", (c) => (buf += c)); x.on("end", () => { let j = null; try { j = JSON.parse(buf); } catch {} res({ status: x.statusCode, json: j }); }); });
    r.on("error", rej); if (d) r.write(d); r.end();
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function TRACE(msg) { fs.appendFileSync("download/v130-shots/trace.log", String(msg) + "\n"); }

(async () => {
  const mongod = await MongoMemoryServer.create();
  const server = spawn("node", ["server.js", "--prod"], {
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("visual-v130b"), ADMIN_PASSCODE: "vis-pass", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let ready = false;
  for (let i = 0; i < 60; i++) { await wait(500); try { const h = await req("GET", "/api/health"); if (h.json?.ok) { ready = true; break; } } catch {} }
  if (!ready) { console.error("server not ready"); process.exit(1); }
  await req("POST", "/api/admin", { action: "login", passcode: "vis-pass" });

  const cEmail = `doc-vis-${Date.now()}@test.dz`;
  await req("POST", "/api/counselor", {
    action: "register", fullName: "د. ياسمين الأطلس", email: cEmail,
    password: "vis-pass-123", recoveryPhrase: "عبارة العرض البصري الثالث",
    specialties: ["anxietyDepression"], languages: ["ar"], yearsExperience: 11,
    whatsapp: "213666777000", sessionPrice: 3500,
    sessionPrices: { DZD: 3500, EUR: 24, USD: 26 },
    bio: "أخصائية نفسية — مرافقة نفسية احترافية بسرّية تامة.",
    photo: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mNk+M/wn4EIwESMolGFlCsEAE1QA7tZOgdIAAAAAElFTkSuQmCC",
  });
  const counselor = (await req("POST", "/api/counselor", { action: "login", email: cEmail, password: "vis-pass-123" })).json.user;
  const prof = (await req("GET", `/api/counselor?userId=${counselor.id}`)).json?.profile;
  const slug = prof?.slug;
  await req("POST", "/api/admin", { action: "verify", profileId: prof?.id });

  const client = (await req("POST", "/api/client", {
    action: "register", pseudonym: "سليم", password: "vis-pass-123",
    recoveryPhrase: "عبارة العرض للعميل", gender: "male", phone: "0555777002",
  })).json.user;

  /* جلسة EUR للعرض في جلستي */
  const when = new Date(Date.now() + 96 * 3600 * 1000).toISOString();
  const b = await req("POST", "/api/sessions", { victimId: client.id, counselorId: counselor.id, topic: "anxiety", mode: "TEXT", scheduledAt: when, currency: "EUR" });
  TRACE(`حجز EUR للعرض: ${b.status}`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  /* ─── 1) الرابط العام: السعر بكل العملات + الصورة ─── */
  await page.goto(`${BASE}/counselor/${slug}`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/1-public-all-currencies.png`, fullPage: true });
  const pubTxt = await page.locator("body").innerText();
  TRACE(`الرابط العام: 3 500 دج = ${pubTxt.includes("3 500")}, 24 € = ${/24\s€|24,00\s€/.test(pubTxt)}, 26 $ = ${/26\s\$|26,00\s\$/.test(pubTxt)}`);

  /* ─── 2) الدليل (عملة DZD الافتراضية) ─── */
  await page.goto(`${BASE}/?view=counselors-directory`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/2-directory-dzd.png`, fullPage: false });
  const dirTxt = await page.locator("body").innerText();
  TRACE(`الدليل DZD يعرض 3 500 دج: ${dirTxt.includes("3 500")}`);

  /* ─── 3) إعدادات الأخصائي ─── */
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 20000 });
  /* عطّل نافذة التحدي مسبقاً ثم ادخل كأخصائي */
  await page.evaluate((email) => {
    localStorage.setItem("tumaanina-challenge-info-off", "1");
    return fetch("/api/counselor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", email, password: "vis-pass-123" }) })
      .then((r) => r.json())
      .then((j) => {
        if (j?.user) {
          const st = JSON.parse(localStorage.getItem("tumaanina-state") || "{}");
          localStorage.setItem("tumaanina-state", JSON.stringify({ ...st, state: { ...(st.state || {}), user: j.user } }));
        }
      });
  }, cEmail);
  await page.goto(`${BASE}/?view=settings`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(2500);
  /* أغلق/أزِل نافذة «لحظة اطمئنان» إن فتحت */
  await page.evaluate(() => {
    document.querySelectorAll('[aria-label="لحظة اطمئنان"]').forEach((el) => el.remove());
    document.querySelectorAll("[data-slot=dialog-overlay]").forEach((el) => el.remove());
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/3-settings-prices.png`, fullPage: true });
  const setTxt = await page.locator("body").innerText();
  TRACE(`الإعدادات: دينار جزائري = ${setTxt.includes("دينار جزائري")}, يورو = ${setTxt.includes("يورو")}, دولار = ${setTxt.includes("دولار")}`);

  /* زر الحفظ المستقل في بطاقة الروابط/السعر/الجنس */
  await page.evaluate(() => {
    document.querySelectorAll('[aria-label="لحظة اطمئنان"]').forEach((el) => el.remove());
  });
  const saveBtns = page.locator('button:has-text("حفظ")');
  TRACE(`أزرار حفظ = ${await saveBtns.count()}`);
  if (await saveBtns.count() > 1) {
    await saveBtns.last().scrollIntoViewIfNeeded();
    await saveBtns.last().click({ timeout: 5000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/4-settings-save-result.png`, fullPage: false });
    const afterTxt = await page.locator("body").innerText();
    TRACE(`رسالة نجاح الحفظ: ${afterTxt.includes("تم حفظ المعلومات") || afterTxt.includes("حفظت") || afterTxt.includes("تم حفظ")}`);
    /* تحقق فعلي: السعر في القاعدة تغيّر */
    const me = (await req("GET", `/api/counselor?userId=${counselor.id}`)).json?.profile;
    TRACE(`القاعدة: sessionPrices = ${JSON.stringify(me?.sessionPrices)}`);
  }

  /* ─── 4) جلستي للعميل: سعر بعملة الحجز EUR ─── */
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.evaluate(() => {
    return fetch("/api/client", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", pseudonym: "سليم", password: "vis-pass-123" }) })
      .then((r) => r.json())
      .then((j) => {
        if (j?.user) {
          const st = JSON.parse(localStorage.getItem("tumaanina-state") || "{}");
          localStorage.setItem("tumaanina-state", JSON.stringify({ ...st, state: { ...(st.state || {}), user: j.user } }));
        }
      });
  });
  await page.goto(`${BASE}/?view=client-sessions`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    document.querySelectorAll('[aria-label="لحظة اطمئنان"]').forEach((el) => el.remove());
    document.querySelectorAll("[data-slot=dialog-overlay]").forEach((el) => el.remove());
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/5-my-sessions-eur.png`, fullPage: true });
  const sessTxt = await page.locator("body").innerText();
  TRACE(`جلستي تعرض 24,00 € (عملة الحجز): ${/24,00\s?€/.test(sessTxt)}`);
  TRACE(`جلستي فيها زر تغيير الموعد: ${sessTxt.includes("تغيير الموعد")}`);

  await browser.close();
  server.kill();
  await mongod.stop();
  TRACE("📸 لقطات v1.3.0 جاهزة في download/v130-shots");
  process.exit(0);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
