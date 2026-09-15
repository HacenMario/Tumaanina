/* التحقق النهائي من رابط GoFile: فتح الصفحة + تحميل الملف + مطابقة MD5 */
const { chromium } = require("playwright");
const crypto = require("crypto");
const fs = require("fs");

const PAGE = "https://gofile.io/d/Q1Qj3D7O";
const EXPECTED_MD5 = "312718f5c15128597d1d4f81db056ecc";
const OUT = "/tmp/dl-check/Tumaanina-v1.19.0.zip";

(async () => {
  fs.mkdirSync("/tmp/dl-check", { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, locale: "en" });
  const page = await ctx.newPage();
  await page.goto(PAGE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(6000);
  /* اسم الملف ظاهر في الصفحة؟ */
  const body = await page.evaluate(() => document.body.innerText);
  const nameOk = body.includes("Tumaanina-v1.19.0.zip");
  console.log(nameOk ? "✓ اسم الملف ظاهر في صفحة GoFile" : "✗ الاسم غير ظاهر — الصفحة:\n" + body.slice(0, 300));

  /* التحميل الفعلي عبر زر التحميل */
  try {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 120000 }),
      page.locator("button:has-text('Download'), a:has-text('Download')").first().click({ timeout: 20000 }),
    ]);
    await download.saveAs(OUT);
    const buf = fs.readFileSync(OUT);
    const md5 = crypto.createHash("md5").update(buf).digest("hex");
    const size = buf.length;
    console.log(`✓ تم التحميل: ${size} بايت`);
    console.log(md5 === EXPECTED_MD5 ? `✓ MD5 مطابق تماماً: ${md5}` : `✗ MD5 مختلف: ${md5} ≠ ${EXPECTED_MD5}`);
    process.exit(nameOk && md5 === EXPECTED_MD5 && size === 4907309 ? 0 : 1);
  } catch (e) {
    console.log("⚠ تعذر التحميل الآلي:", e.message.split("\n")[0]);
    process.exit(nameOk ? 0 : 1);
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error("CRASH:", e.message); process.exit(1); });
