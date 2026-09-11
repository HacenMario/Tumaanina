/* مرآة بديلة — catbox.moe (رابط مباشر دائم) + إعادة محاولة tmpfiles الخام */
const fs = require("fs");
const { execSync } = require("child_process");

const ZIP = "/home/z/my-project/tumaanina/download/Tumaanina-v1.5.0.zip";
const MD5 = execSync(`md5sum "${ZIP}"`).toString().split(" ")[0];
console.log("md5:", MD5);

async function catbox() {
  const fd = new FormData();
  fd.append("reqtype", "fileupload");
  fd.append("fileToUpload", new Blob([fs.readFileSync(ZIP)]), "tumaanina-v1.5.0.zip");
  const r = await fetch("https://catbox.moe/user/api.php", { method: "POST", body: fd });
  const t = await r.text();
  if (!t.startsWith("https://")) throw new Error("catbox failed: " + t.slice(0, 120));
  return t.trim();
}

(async () => {
  try {
    const link = await catbox();
    console.log("✅ catbox:", link);
    fs.writeFileSync("/tmp/links-tumaanina-v150-mirror.json", JSON.stringify({ catbox: link, md5: MD5 }, null, 1));
  } catch (e) {
    console.log("❌ catbox:", e.message);
    process.exit(1);
  }
})();
