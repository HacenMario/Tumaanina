/* رفع حزمة v2.11.1 إلى gofile عبر المتصفح (شبكة المتصفح هي الوحيدة العاملة) */
const { chromium } = require("playwright");
const fs = require("fs");

const FILE = process.argv[2] || "/home/z/my-project/download/Rafiqi-Annafsi-v2.11.1.zip";

(async () => {
  const md5 = require("crypto").createHash("md5").update(fs.readFileSync(FILE)).digest("hex");
  console.log("الملف:", FILE, "md5:", md5);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36", acceptDownloads: true });
  const page = await ctx.newPage();

  let gofileLink = null;
  /* التقاط استجابة API الرفع داخل الصفحة */
  page.on("response", async (res) => {
    try {
      if (res.url().includes("/contents/uploadfile") || res.url().includes("uploadfile")) {
        const j = await res.json().catch(() => null);
        const dp = j?.data?.downloadPage;
        if (dp) gofileLink = dp;
      }
    } catch {}
  });

  await page.goto("https://gofile.io/", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(7000);
  await page.screenshot({ path: "screens/upload-01-page.png" });

  /* حقل الملف — قد يكون مخفياً داخل الصفحة الرئيسية */
  let input = page.locator('input[type="file"]').first();
  if (!(await input.count())) {
    console.log("لا حقل ملف في الرئيسية — لقطة للصفحة:");
    const html = await page.content();
    console.log("file inputs:", (html.match(/input[^>]*file/g) || []).length);
  }
  await input.setInputFiles(FILE);
  console.log("[1] الملف أُلحق بالحقل — جارٍ الرفع…");

  /* انتظار ظهور الرابط (حتى 5 دقائق لملف 4.2MB) */
  const t0 = Date.now();
  while (!gofileLink && Date.now() - t0 < 300000) await page.waitForTimeout(2000);
  await page.screenshot({ path: "screens/upload-02-done.png" });
  if (!gofileLink) {
    /* محاولة قراءة الرابط من الصفحة مباشرة */
    const txt = await page.locator("a[href*='gofile.io/d/'], input[value*='gofile.io/d/']").allTextContents().catch(() => []);
    console.log("نص الصفحة:", JSON.stringify(txt).slice(0, 300));
  }
  console.log("[2] رابط gofile:", gofileLink || "لم يُكتشف");
  fs.writeFileSync("/home/z/my-project/tool-results/upload-v2111.json", JSON.stringify({ md5, gofileLink }, null, 1));
  await browser.close();
  if (!gofileLink) process.exit(1);
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
