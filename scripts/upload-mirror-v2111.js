/* مرآة احتياطية: رفع v2.11.1 إلى litter.catbox.moe (72 ساعة) و tmpfiles.org (60 دقيقة) عبر المتصفح */
const { chromium } = require("playwright");
const fs = require("fs");

const FILE = process.argv[2] || "/home/z/my-project/download/Rafiqi-Annafsi-v2.11.1.zip";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36" });
  const page = await ctx.newPage();
  const out = { catbox: null, tmpfiles: null };

  /* ─── 1) litter.catbox.moe — 72 ساعة ─── */
  try {
    await page.goto("https://litter.catbox.moe/", { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(3000);
    const radios = page.locator('input[name="time"][value="72h"]');
    if (await radios.count()) await radios.first().check().catch(() => {});
    await page.locator('input[name="fileToUpload"], input[type="file"]').first().setInputFiles(FILE);
    /* النموذج يُرسل تقليدياً — انتظر التنقل */
    await Promise.all([
      page.waitForNavigation({ timeout: 300000 }).catch(() => {}),
      page.locator('input[type="submit"], button[type="submit"]').first().click().catch(() => {}),
    ]);
    await page.waitForTimeout(3000);
    const url = page.url();
    const body = await page.content();
    const hit = body.match(/https:\/\/l\.catbox\.moe\/[a-z0-9.]+/i) || url.match(/https:\/\/l\.catbox\.moe\/[a-z0-9.]+/i);
    out.catbox = hit ? hit[0] : ("صفحة النتيجة: " + url);
    console.log("[catbox]", out.catbox);
    await page.screenshot({ path: "screens/mirror-catbox.png" });
  } catch (e) { console.log("[catbox] فشل:", e.message); }

  /* ─── 2) tmpfiles.org — 60 دقيقة ─── */
  try {
    await page.goto("https://tmpfiles.org/", { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(3000);
    await page.locator('input[type="file"]').first().setInputFiles(FILE);
    await page.locator('button:has-text("Upload"), input[type="submit"]').first().click().catch(() => {});
    await page.waitForTimeout(15000);
    const body = await page.content();
    const hit = body.match(/https:\/\/tmpfiles\.org\/[a-z0-9]+\/[a-z0-9.]+/i);
    out.tmpfiles = hit ? hit[0] : "لم يُعثر على الرابط";
    console.log("[tmpfiles]", out.tmpfiles);
    await page.screenshot({ path: "screens/mirror-tmpfiles.png" });
  } catch (e) { console.log("[tmpfiles] فشل:", e.message); }

  fs.writeFileSync("/home/z/my-project/tool-results/mirror-v2111.json", JSON.stringify(out, null, 1));
  await browser.close();
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
