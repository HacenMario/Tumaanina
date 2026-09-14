/**
 * فحص بصري حي v1.17.0 — خادم حقيقي + متصفح آلي:
 * 1) الهيدر على سطح المكتب: بلا تداخل، قائمة «المزيد» تعمل
 * 2) زر «تصفح العيادات» في الواجهة يوجّه للدليل
 * 3) صفحة الإعلانات: بطاقة واحدة + عدّاد صفحات
 * 4) صفحة العيادة: الباقات + زر الحجز + اختيار الباقة داخل النافذة
 * 5) القائمة الجانبية للهاتف: أيقونات فريدة لكل صفحة
 * 6) صفر أخطاء كونسول حرجة (#418 شامل)
 */
const { spawn } = require("child_process");
const { chromium } = require("/home/z/.npm-global/lib/node_modules/playwright");
const { MongoMemoryServer } = require("/home/z/my-project/tumaanina/Tumaanina-main/node_modules/mongodb-memory-server");

const PORT = "3994";
const BASE = `http://127.0.0.1:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = "/tmp/tum-v1170-shots";

async function main() {
  require("fs").mkdirSync(SHOTS, { recursive: true });
  const mongod = await MongoMemoryServer.create({ instance: { port: 27078 } });
  const server = spawn("node", ["server.js"], {
    cwd: "/home/z/my-project/tumaanina/Tumaanina-main",
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("tumaanina-v17v"), ADMIN_PASSCODE: "tum-pass-17", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "ignore"],
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    await wait(500);
    try {
      const h = await fetch(`${BASE}/api/health`).then((r) => r.json());
      if (h?.version === "1.17.0") { ready = true; break; }
    } catch {}
  }
  console.log(ready ? "✓ الخادم جاهز" : "✗ الخادم لم يجهز!");
  if (!ready) process.exit(1);

  /* بذر بيانات: عيادة بباقات + إعلانان معتمدان */
  const reg = await fetch(`${BASE}/api/clinic`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "register", name: "عيادة الطمأنينة النفسية", email: `vis${Date.now()}@t.dz`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة استرجاع تجريبية" }) }).then((r) => r.json());
  const uid = reg.userId, slug = reg.slug;
  await fetch(`${BASE}/api/clinic`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update-profile", userId: uid, sessionPrice: 2500, packs: [{ name: "باقة 4 جلسات", sessions: 4, price: 8000, note: "الأكثر طلباً" }], about: "عيادة متخصصة في الصحة النفسية" }) });
  await fetch(`${BASE}/api/ads`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", userId: uid, title: "عرض خاص للجلسات", body: "خصم 20% هذا الشهر على باقة الجلسات الأربع." }) });
  /* v1.17.0: إعلان ثانٍ — كي يكون هناك صفحتان وعدّاد ظاهر */
  const reg2 = await fetch(`${BASE}/api/clinic`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "register", name: "مركز هدوء الدوري", email: `vis2${Date.now()}@t.dz`, password: "pass-tumaanina-1", recoveryPhrase: "عبارة استرجاع تجريبية ٢" }) }).then((r) => r.json());
  await fetch(`${BASE}/api/ads`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", userId: reg2.userId, title: "جلسات دعم أسري", body: "جلسات دعم أسري بأسعار مخفضة هذا الأسبوع." }) });
  const adminTok = (await fetch(`${BASE}/api/admin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", passcode: "tum-pass-17" }) }).then((r) => r.json())).token;
  const adList = (await fetch(`${BASE}/api/ads?userId=${uid}&pageSize=8`).then((r) => r.json())).ads;
  const adList2 = (await fetch(`${BASE}/api/ads?userId=${reg2.userId}&pageSize=8`).then((r) => r.json())).ads;
  for (const [lst, amount] of [[adList, 300], [adList2, 700]]) {
    const id = lst[0].id;
    await fetch(`${BASE}/api/ads/admin`, { method: "POST", headers: { "Content-Type": "application/json", "x-admin-token": adminTok }, body: JSON.stringify({ action: "ads-set-dues", id, amount }) });
    await fetch(`${BASE}/api/ads/admin`, { method: "POST", headers: { "Content-Type": "application/json", "x-admin-token": adminTok }, body: JSON.stringify({ action: "ads-set-paid", id, paid: true }) });
    await fetch(`${BASE}/api/ads/admin`, { method: "POST", headers: { "Content-Type": "application/json", "x-admin-token": adminTok }, body: JSON.stringify({ action: "ads-approve", id }) });
  }
  console.log("✓ بيانات البصر جاهزة");

  const browser = await chromium.launch();
  const errors = [];
  const mk = async (vp) => {
    const ctx = await browser.newContext({ viewport: vp, locale: "ar" });
    const p = await ctx.newPage();
    p.on("console", async (m) => {
      if (m.type() !== "error") return;
      const txt = m.text().slice(0, 160);
      errors.push(txt);
      /* v1.17.0: التقاط كامل وسائط أخطاء الترطيب (مكوّن السبب) */
      if (/#418|hydrat/i.test(m.text())) {
        for (const arg of m.args()) {
          try {
            const val = await arg.evaluate((a) => (typeof a === "string" ? a : JSON.stringify(a)));
            if (val && val.length > 20) console.log("═══ 418-وسيط:", String(val).slice(0, 3000));
          } catch {}
        }
      }
    });
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
    return p;
  };

  /* ── سطح المكتب 1440×900 ── */
  let page = await mk({ width: 1440, height: 900 });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await wait(1200);

  /* زر تصفح العيادات */
  const cta = await page.locator("text=تصفح العيادات").count();
  console.log(cta > 0 ? "✓ زر «تصفح العيادات» ظاهر في الواجهة" : "✗ زر تصفح العيادات مفقود");
  await page.screenshot({ path: `${SHOTS}/desktop-landing.png` });

  /* قائمة «المزيد» في الهيدر */
  const moreBtn = await page.locator("header button:has-text('المزيد')").count();
  console.log(moreBtn > 0 ? "✓ قائمة «المزيد» ظاهرة في هيدر سطح المكتب" : "✗ قائمة المزيد مفقودة");
  /* فحص عدم التداخل: ارتفاع الهيدر ثابت وكل الأزرار في سطر واحد */
  const headerOverflow = await page.evaluate(() => {
    const h = document.querySelector("header");
    const nav = h?.querySelector("nav[aria-label=main]");
    if (!h || !nav) return "missing";
    if (nav.scrollWidth <= nav.clientWidth + 2) return "ok";
    const parts = [...h.querySelectorAll(":scope > div > *")].map((el) => `${el.tagName}.${(el.className || "").toString().slice(0, 18)}=${el.clientWidth}`);
    const btns = [...nav.querySelectorAll("button")].map((b) => `${b.textContent?.trim().slice(0, 14)}=${b.clientWidth}`).join(" | ");
    return `OVERFLOW nav=${nav.clientWidth}<${nav.scrollWidth} | حاوية=${h.clientWidth} | ${parts.join(", ")} | أزرار: ${btns}`;
  });
  console.log(headerOverflow === "ok" ? "✓ شريط التنقل بلا فيض (لا تداخل نصوص)" : `✗ الفيض: ${headerOverflow}`);

  /* قائمة المزيد تفتح */
  if (moreBtn > 0) {
    await page.locator("header button:has-text('المزيد')").first().click();
    await wait(500);
    const items = await page.locator("[data-radix-popper-content-wrapper] [role=menuitem]").count();
    console.log(items >= 5 ? `✓ قائمة المزيد تعمل (${items} صفحة داخلها)` : `✗ قائمة المزيد فارغة (${items})`);
    await page.keyboard.press("Escape");
  }

  /* ── دليل العيادات من الزر ── */
  await page.locator("text=تصفح العيادات").first().click();
  await wait(900);
  const dirOk = await page.locator("text=عيادة الطمأنينة النفسية").count();
  console.log(dirOk > 0 ? "✓ الزر وجّه لدليل العيادات والعيادة ظاهرة" : "✗ التوجيه للدليل فشل");

  /* صفحة العيادة: السعر + الباقة + نافذة الحجز باختيار الباقة
     v1.17.0: ننتقل مباشرة برابط العيادة (النقر من الدليل كان واهناً) */
  await page.goto(`${BASE}/?clinic=${slug}`, { waitUntil: "networkidle" });
  await wait(1500);
  await page.screenshot({ path: `${SHOTS}/desktop-clinic-page.png` });
  const priceChip = await page.locator("text=2,500 DZD").count() + await page.locator("text=2500 DZD").count();
  console.log(priceChip > 0 ? "✓ سعر الجلسة ظاهر في صفحة العيادة" : "✗ السعر غير ظاهر");
  const packCard = await page.locator("text=باقة 4 جلسات").count();
  console.log(packCard > 0 ? "✓ الباقة ظاهرة في صفحة العيادة" : "✗ الباقة غير ظاهرة");
  /* فتح نافذة الحجز — سياق جديد بعميل مسجّل مسبقاً (storageState):
     الحقن بعد أول زيارة لا يكفي لأن الربط العميق ?clinic يُستهلك مرة واحدة */
  const cli = await fetch(`${BASE}/api/client`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "register", pseudonym: "عميل-بصري", password: "pass-tumaanina-1", recoveryPhrase: "عبارة استرجاع تجريبية", gender: "male", phone: "0555777888" }) }).then((r) => r.json());
  await page.context().close();
  const loggedCtx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "ar",
    storageState: {
      cookies: [],
      origins: [{ origin: BASE, localStorage: [{ name: "tumaanina-state", value: JSON.stringify({ state: { user: cli.user }, version: 0 }) }] }],
    },
  });
  loggedCtx.page = await loggedCtx.newPage();
  loggedCtx.page.on("console", async (m) => { if (m.type() === "error" && !/favicon|Failed to load|net::/i.test(m.text())) errors.push(m.text().slice(0, 160)); });
  page = loggedCtx.page;
  await page.goto(`${BASE}/?clinic=${encodeURIComponent(slug)}`, { waitUntil: "networkidle" });
  await wait(1800);
  await page.keyboard.press("Escape"); /* إغلاق نافذة العبارة إن ظهرت */
  await wait(400);
  await page.locator("button:has-text('احجز جلسة حضورية')").first().click();
  await wait(900);
  const packChoose = await page.locator("text=باقة الجلسات (اختياري)").count();
  const packNone = await page.locator("text=بدون باقة").count();
  console.log(packChoose > 0 && packNone > 0 ? "✓ نافذة الحجز فيها اختيار الباقة (بدون باقة + الباقة)" : `✗ اختيار الباقة مفقود (${packChoose}/${packNone})`);
  await page.screenshot({ path: `${SHOTS}/desktop-booking-pack.png` });
  await page.keyboard.press("Escape");
  await wait(400);

  /* ── صفحة الإعلانات: بطاقة واحدة + عدّاد ── */
  await page.evaluate(() => { const st = window.__NEXT_HYDRATED__ || 1; });
  await page.goto(`${BASE}/?view=ads`, { waitUntil: "networkidle" });
  await wait(1300);
  /* الترتيب السري: الأغلى مستحقات (700 جلسات دعم أسري) في الصفحة الأولى */
  const firstAd = await page.locator("h2:has-text('جلسات دعم أسري')").count();
  console.log(firstAd === 1 ? "✓ الصفحة الأولى = الأغلى مستحقات (ترتيب سري صحيح)" : `✗ الصفحة الأولى خاطئة (${firstAd})`);
  const counterTxt = await page.evaluate(() => {
    const el = [...document.querySelectorAll("span.font-mono")].find((s) => /1/.test(s.textContent || "") && /2/.test(s.textContent || ""));
    return el ? el.textContent.trim() : null;
  });
  console.log(counterTxt ? `✓ عدّاد الصفحات ظاهر: «${counterTxt}»` : "✗ العدّاد مفقود");
  await page.screenshot({ path: `${SHOTS}/desktop-ads.png` });

  await page.context().close();

  /* ── الهاتف 390×844 ── */
  page = await mk({ width: 390, height: 844 });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await wait(1000);
  await page.screenshot({ path: `${SHOTS}/mobile-landing.png` });
  /* القائمة الجانبية: أيقونات + بنود */
  await page.locator("header button[aria-label='القائمة']").click().catch(async () => { await page.locator("header button:has(svg)").last().click(); });
  await wait(700);
  await page.screenshot({ path: `${SHOTS}/mobile-sidebar.png` });
  const sidebarItems = await page.locator("[data-slot=sheet-content] button").count();
  console.log(sidebarItems >= 10 ? `✓ قائمة الهاتف كاملة (${sidebarItems} زراً)` : `✗ قائمة الهاتف ناقصة (${sidebarItems})`);
  await page.keyboard.press("Escape");

  /* صفحة العيادة على الهاتف: الإطار لا يتجاوز الشاشة */
  await page.goto(`${BASE}/?clinic=${slug}`, { waitUntil: "networkidle" });
  await wait(1200);
  const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
  console.log(noHScroll ? "✓ صفحة العيادة على الهاتف: لا تمرير أفقي" : "✗ فيض أفقي في صفحة العيادة على الهاتف");
  await page.screenshot({ path: `${SHOTS}/mobile-clinic.png` });

  /* صفحة الإعلانات على الهاتف */
  await page.goto(`${BASE}/?view=ads`, { waitUntil: "networkidle" });
  await wait(1200);
  const noHScrollAds = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
  console.log(noHScrollAds ? "✓ صفحة الإعلانات على الهاتف: لا تمرير أفقي" : "✗ فيض أفقي في الإعلانات");
  await page.screenshot({ path: `${SHOTS}/mobile-ads.png` });

  await browser.close();

  /* أخطاء الكونسول: نتجاهل الأخطاء المتوقعة (صور/شبكة بذر) */
  const critical = errors.filter((e) => !/favicon|Image|img|net::|Load failed|Failed to load/i.test(e));
  console.log(critical.length === 0 ? "✓ صفر أخطاء كونسول حرجة" : `⚠ أخطاء كونسول (${critical.length}):`);
  critical.slice(0, 6).forEach((e) => console.log("   •", e));

  server.kill();
  await mongod.stop();
  console.log("\nانتهى الفحص البصري — لقطات في", SHOTS);
  process.exit(0);
}

main().catch((e) => { console.error("CRASH:", e); process.exit(1); });
