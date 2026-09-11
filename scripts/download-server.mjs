/**
 * خادم تحميل مخصص — يقدّم مجلد download عبر البوابة (:81 → :3000)
 * GET /rafiqi-nafsi.zip → تحميل مباشر (Content-Disposition: attachment)
 * GET /                 → صفحة تحميل عربية بزر كبير
 * GET /health           → فحص الحالة
 */
import http from "node:http";
import { createReadStream, statSync, existsSync } from "node:fs";
import path from "node:path";

const PORT = 3000;
const ROOT = "/home/z/my-project/download";

const FILES = {
  "/rafiqi-nafsi.zip": {
    file: path.join(ROOT, "rafiqi-nafsi.zip"),
    name: "rafiqi-nafsi-v2.3.0.zip",
  },
};

const HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>تحميل — رفيقي النفسي v2.3.0</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;display:flex;align-items:center;justify-content:center;
       font-family:system-ui,"Segoe UI",Tahoma,sans-serif;
       background:linear-gradient(160deg,#0b3d2e 0%,#0e5c3f 55%,#128557 100%);
       padding:24px}
  .card{background:#fff;max-width:520px;width:100%;border-radius:20px;
        padding:40px 32px;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.35)}
  .flag{font-size:44px;line-height:1}
  h1{color:#0b3d2e;font-size:1.5rem;margin:14px 0 6px}
  .ver{display:inline-block;background:#e8f5ee;color:#0e5c3f;border:1px solid #bfe3d0;
       border-radius:999px;padding:4px 14px;font-size:.85rem;font-weight:700;margin:8px 0 18px}
  p{color:#4b5563;font-size:.95rem;line-height:1.7;margin-bottom:22px}
  a.btn{display:block;background:#0e5c3f;color:#fff;text-decoration:none;
        font-size:1.1rem;font-weight:800;padding:16px;border-radius:14px;
        transition:transform .15s,box-shadow .15s}
  a.btn:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(14,92,63,.4)}
  .meta{margin-top:16px;color:#6b7280;font-size:.8rem}
  .steps{margin-top:22px;text-align:right;background:#f9fafb;border:1px solid #e5e7eb;
         border-radius:12px;padding:16px 18px}
  .steps h2{font-size:.9rem;color:#374151;margin-bottom:8px}
  .steps li{color:#4b5563;font-size:.82rem;line-height:1.9;margin-right:18px}
</style>
</head>
<body>
  <div class="card">
    <div class="flag">🇩🇿💚</div>
    <h1>منصة رفيقي النفسي</h1>
    <span class="ver">النسخة النهائية v2.3.0</span>
    <p>الملف الكامل الجاهز للتشغيل — يتضمن كل التصحيحات الـ11 الأخيرة
       (علم القلب الرسمي، حصر الإشعارات بالدور، إصلاح إشعارات الهاتف، وغيرها).</p>
    <a class="btn" href="/rafiqi-nafsi.zip" download>⬇️ تحميل الملف الآن (rafiqi-nafsi.zip)</a>
    <div class="meta">الحجم: 384 كيلوبايت · 179 ملفًا · ZIP</div>
    <div class="steps">
      <h2>خطوات التشغيل بعد فك الضغط:</h2>
      <ol>
        <li>فك الضغط في مجلد جديد فارغ (لا تفك فوق نسخة قديمة)</li>
        <li>انسخ ملف <b>.env</b> القديم أو أنشئه من <b>.env.example</b></li>
        <li>احذف مجلد <b>.next</b> إن وُجد</li>
        <li>شغّل: <b>npm install</b> ثم <b>npm run dev</b></li>
        <li>افتح المتصفح على العنوان: <b>http://localhost:3000</b></li>
      </ol>
    </div>
  </div>
</body>
</html>`;

function sendZip(req, res, entry) {
  if (!existsSync(entry.file)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("الملف غير موجود");
  }
  const size = statSync(entry.file).size;
  const headers = {
    "Content-Type": "application/zip",
    "Content-Length": size,
    "Content-Disposition": `attachment; filename="${entry.name}"; filename*=UTF-8''${encodeURIComponent(entry.name)}`,
    "Cache-Control": "no-store",
    "Accept-Ranges": "none",
  };
  if (req.method === "HEAD") {
    res.writeHead(200, headers);
    return res.end();
  }
  res.writeHead(200, headers);
  createReadStream(entry.file).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = (req.url || "/").split("?")[0];
  console.log(`${new Date().toISOString()} ${req.method} ${url} from ${req.socket.remoteAddress}`);

  if (FILES[url]) return sendZip(req, res, FILES[url]);

  if (url === "/" || url === "/index.html") {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    return res.end(HTML);
  }

  if (url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, service: "download", version: "2.3.0" }));
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("404 — استخدم الرابط المباشر: /rafiqi-nafsi.zip");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ خادم التحميل يعمل على :${PORT} — يقدّم ${ROOT}`);
});
