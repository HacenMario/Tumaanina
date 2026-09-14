/* إعادة إنتاج: أزرار اختيار الملفات (صور/فيديو) — تعديل الإعلان + معرض العيادة */
const { MongoMemoryServer } = require("mongodb-memory-server");
const { spawn } = require("child_process");
const http = require("http");
const { chromium } = require("playwright");

const PORT = "3997";
const BASE = `http://localhost:${PORT}`;

function req(m, p, b, headers = {}) {
  return new Promise((res, rej) => {
    const d = b ? JSON.stringify(b) : null;
    const r = http.request(`${BASE}${p}`, { method: m, headers: { "Content-Type": "application/json", ...headers, ...(d ? { "Content-Length": Buffer.byteLength(d) } : {}) } }, (x) => { let buf = ""; x.on("data", (c) => (buf += c)); x.on("end", () => { let j = null; try { j = JSON.parse(buf); } catch {} res({ status: x.statusCode, json: j }); }); });
    r.on("error", rej); if (d) r.write(d); r.end();
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tinyImg = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

(async () => {
  const mongod = await MongoMemoryServer.create();
  const server = spawn("node", ["server.js"], {
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("repro1190"), ADMIN_PASSCODE: "rp-19", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let ready = false;
  for (let i = 0; i < 60; i++) { await wait(500); try { const h = await req("GET", "/api/health"); if (h.json?.ok) { ready = true; break; } } catch {} }
  if (!ready) { console.error("server not ready"); process.exit(1); }
  console.log("server ready");

  const stamp = Date.now();
  const cl = await req("POST", "/api/clinic", { action: "register", name: "عيادة repro", email: `rp${stamp}@t.dz`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة استرجاع" });
  const A_uid = cl.json.userId, A_slug = cl.json.slug;
  await req("POST", "/api/ads", { action: "create", userId: A_uid, title: "إعلان تجريبي", body: "نص الإعلان", media: [tinyImg] });
  await req("POST", "/api/clinic", { action: "update-profile", userId: A_uid, sessionPrice: 2000 });
  const clinicUser = (await req("POST", "/api/clinic", { action: "login", email: `rp${stamp}@t.dz`, password: "pass-tumaanina-1" })).json.user;

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: "ar",
    storageState: { cookies: [], origins: [{ origin: BASE, localStorage: [{ name: "tumaanina-state", value: JSON.stringify({ state: { user: clinicUser, view: "clinic-dashboard" }, version: 0 }) }] }] },
  });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE-ERR:", m.text().slice(0, 160)); });

  /* ── 1) تبويب إعلاناتي: نافذة التعديل ── */
  await page.goto(`${BASE}/?view=clinic-dashboard`, { waitUntil: "networkidle" });
  await wait(1200);
  await page.locator("button:has-text('إعلاناتي')").first().click();
  await wait(900);
  await page.locator("button:has-text('تعديل')").first().click();
  await wait(1100);

  const probe = async (btnText) => {
    const fcPromise = new Promise((res) => {
      const to = setTimeout(() => res(false), 3500);
      page.once("filechooser", () => { clearTimeout(to); res(true); });
    });
    const btn = page.locator(`button:has-text('${btnText}')`).first();
    const visible = await btn.count();
    if (!visible) return { found: false, picker: false };
    await btn.click();
    const picker = await fcPromise;
    return { found: true, picker };
  };

  const imgRes = await probe("صورة");
  console.log(`زر «صورة» في نافذة تعديل الإعلان: زر=${imgRes.found} فتح_الملف=${imgRes.picker}`);
  const vidRes = await probe("فيديو");
  console.log(`زر «فيديو» في نافذة تعديل الإعلان: زر=${vidRes.found} فتح_الملف=${vidRes.picker}`);

  /* حالة الأزرار — هل معطّلة؟ */
  const imgBtnInfo = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")].filter((b) => b.textContent.includes("صورة"));
    return btns.map((b) => ({ disabled: b.disabled, text: b.textContent.trim().slice(0, 40) }));
  });
  console.log("حالة زر الصور:", JSON.stringify(imgBtnInfo));

  await page.keyboard.press("Escape");
  await wait(400);

  /* ── 2) تبويب المعلومات: زر إضافة صورة للمعرض ── */
  await page.locator("button:has-text('معلومات العيادة')").first().click();
  await wait(1200);
  const galFc = new Promise((res) => {
    const to = setTimeout(() => res(false), 3500);
    page.once("filechooser", () => { clearTimeout(to); res(true); });
  });
  const galBtn = page.locator("button:has-text('إضافة صور')").first();
  const galFound = await galBtn.count();
  if (galFound) await galBtn.click();
  const galPicker = await galFc;
  console.log(`زر «إضافة صورة» في معرض العيادة: زر=${galFound > 0} فتح_الملف=${galPicker}`);

  /* هل المدخل موجود في DOM؟ */
  const dom = await page.evaluate(() => ({
    gal: !!document.getElementById("clinic-gallery-input"),
    vid: !!document.getElementById("clinic-videos-input"),
    logo: !!document.getElementById("clinic-logo-input"),
    adImg: !!document.getElementById("ad-img-input"),
    adVid: !!document.getElementById("ad-vid-input"),
  }));
  console.log("المدخلات في DOM:", JSON.stringify(dom));

  await page.screenshot({ path: "download/repro-1190.png", fullPage: false });
  await browser.close();
  server.kill();
  await mongod.stop();
  process.exit(0);
})().catch((e) => { console.error("CRASH:", e); process.exit(1); });
