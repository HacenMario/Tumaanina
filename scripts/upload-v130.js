/* رفع حزمة Tumaanina v1.3.0 إلى gofile.io + tmpfiles — روابط مباشرة */
const fs = require("fs");
const { execSync } = require("child_process");
const path = require("path");

const ZIP = "/home/z/my-project/tumaanina/download/Tumaanina-v1.3.0.zip";
const MD5 = execSync(`md5sum "${ZIP}"`).toString().split(" ")[0];
console.log("local md5:", MD5, "size:", fs.statSync(ZIP).size);

async function gofile() {
  const s1 = await fetch("https://api.gofile.io/servers").then((r) => r.json());
  const server = (s1.data && s1.data.servers && s1.data.servers[0].name) || s1.data?.server || "store1";
  console.log("gofile server:", server);
  const fd = new FormData();
  fd.append("file", new Blob([fs.readFileSync(ZIP)]), path.basename(ZIP));
  const up = await fetch(`https://${server}.gofile.io/contents/uploadfile`, { method: "POST", body: fd }).then((r) => r.json());
  if (up.status !== "ok") throw new Error("gofile upload failed: " + JSON.stringify(up).slice(0, 200));
  return `https://gofile.io/d/${up.data.downloadPage}`;
}

async function tmpfiles() {
  const fd = new FormData();
  fd.append("file", new Blob([fs.readFileSync(ZIP)]), path.basename(ZIP));
  const r = await fetch("https://tmpfiles.org/api/v1/upload", { method: "POST", body: fd }).then((r) => r.json());
  if (r.status !== "success") throw new Error("tmpfiles failed");
  return r.data.url.replace("tmpfiles.org/", "tmpfiles.org/dl/");
}

(async () => {
  const results = {};
  for (const [name, fn] of [["gofile", gofile], ["tmpfiles", tmpfiles]]) {
    try {
      results[name] = await fn();
      console.log(`✅ ${name}: ${results[name]}`);
    } catch (e) {
      console.log(`❌ ${name}: ${e.message}`);
    }
  }
  fs.writeFileSync("/tmp/links-tumaanina-v130.json", JSON.stringify({ ...results, md5: MD5 }, null, 1));
  console.log("DONE");
})();
