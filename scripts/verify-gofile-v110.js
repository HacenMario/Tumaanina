/* تحميل فعلي من gofile والتحقق من md5 — v1.1.0 */
const fs = require("fs");
const { execSync } = require("child_process");

const PAGE = "https://gofile.io/d/an0LPHXn";
const EXPECTED = "6cdf4965b04d24f4dc846408ec232303";

(async () => {
  /* 1) زيارة صفحة التحميل لالتقاط الكوكيز (accountToken) */
  const head = await fetch(PAGE, { headers: { "User-Agent": "Mozilla/5.0" } });
  const cookies = head.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const html = await head.text();
  const wt = (html.match(/"wt":\s*"([^"]+)"/) || [])[1] || "website";

  /* 2) جلب بيانات المحتوى */
  const contentId = PAGE.split("/d/")[1];
  const api = await fetch(`https://api.gofile.io/contents/${contentId}?wt=${wt}&cache=true`, {
    headers: { Cookie: cookies, "User-Agent": "Mozilla/5.0" },
  }).then((r) => r.json());
  const node = api.data && api.data.children ? Object.values(api.data.children)[0] : api.data;
  if (!node || !node.link) throw new Error("no direct link: " + JSON.stringify(api).slice(0, 200));
  console.log("direct link:", node.link);

  /* 3) تنزيل فعلي */
  const dl = await fetch(node.link, { headers: { Cookie: cookies, "User-Agent": "Mozilla/5.0" } });
  const buf = Buffer.from(await dl.arrayBuffer());
  fs.writeFileSync("/tmp/verify-tumaanina-v110.zip", buf);
  const md5 = execSync("md5sum /tmp/verify-tumaanina-v110.zip").toString().split(" ")[0];
  console.log("downloaded:", buf.length, "bytes | md5:", md5);
  console.log(md5 === EXPECTED ? "🎉 md5 مطابق — الرابط يعمل والتزم الحزمة" : "⚠️ md5 مختلف!");
  process.exit(md5 === EXPECTED ? 0 : 1);
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
