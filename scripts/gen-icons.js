// توليد أيقونات PWA من شعار SVG عبر sharp
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const svgPath = "/home/z/my-project/public/icons/logo-source.svg";
const outDir = "/home/z/my-project/public/icons";

const svg = fs.readFileSync(svgPath);

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  await sharp(svg, { density: 600 })
    .resize(192, 192)
    .png()
    .toFile(path.join(outDir, "icon-192.png"));

  await sharp(svg, { density: 600 })
    .resize(512, 512)
    .png()
    .toFile(path.join(outDir, "icon-512.png"));

  await sharp(svg, { density: 300 })
    .resize(64, 64)
    .png()
    .toFile(path.join(outDir, "icon-64.png"));

  // maskable: ملف مستقلاً مصمم مسبقاً مع الحشو الآمن
  await sharp(path.join(outDir, "maskable-source.svg"), { density: 300 })
    .resize(512, 512)
    .png()
    .toFile(path.join(outDir, "maskable-512.png"));

  console.log("✅ icons generated:", fs.readdirSync(outDir));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
