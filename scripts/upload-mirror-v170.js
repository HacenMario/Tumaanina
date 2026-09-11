/* مرآة بديلة — litterbox.catbox.moe (رابط مباشر 72 ساعة) */
const fs = require("fs");
const { execSync } = require("child_process");

const ZIP = "/home/z/my-project/tumaanina/download/Tumaanina-v1.7.0.zip";
const MD5 = execSync(`md5sum "${ZIP}"`).toString().split(" ")[0];
console.log("md5:", MD5);

async function catbox() {
  const fd = new FormData();
  fd.append("reqtype", "fileupload");
  fd.append("time", "72h");
  fd.append("fileToUpload", new Blob([fs.readFileSync(ZIP)]), "tumaanina-v1.7.0.zip");
  const r = await fetch("https://litterbox.catbox.moe/resources/internals/api.php", { method: "POST", body: fd });
  const t = await r.text();
  if (!t.startsWith("https://")) throw new Error("catbox failed: " + t.slice(0, 120));
  return t.trim();
}

(async () => {
  try {
    const link = await catbox();
    console.log("✅ litterbox:", link);
    fs.writeFileSync("/tmp/links-tumaanina-v170-mirror.json", JSON.stringify({ litterbox: link, md5: MD5 }, null, 1));
  } catch (e) {
    console.log("❌ litterbox:", e.message);
    process.exit(1);
  }
})();
