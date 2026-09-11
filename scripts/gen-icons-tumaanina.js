/* توليد أيقونات طمأنينة من logo-source.svg — sharp */
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "public", "logo-source.svg");
const OUT = path.join(__dirname, "..", "public", "icons");
fs.mkdirSync(OUT, { recursive: true });

async function render(size, name, opts = {}) {
  const base = Buffer.from(fs.readFileSync(SRC));
  const svg = opts.maskable
    ? base.toString().replace("<circle cx=\"32\" cy=\"32\" r=\"30\"", "<circle cx=\"32\" cy=\"32\" r=\"32\"")
        .replace('viewBox="0 0 64 64"', 'viewBox="-6 -6 76 76"')
    : base;
  await sharp(Buffer.from(svg), { density: 300 })
    .resize(size, size)
    .png()
    .toFile(path.join(OUT, name));
  console.log("✓", name);
}

(async () => {
  await render(64, "icon-64.png");
  await render(192, "icon-192.png");
  await render(512, "icon-512.png");
  await render(512, "maskable-512.png", { maskable: true });
  await sharp(Buffer.from(fs.readFileSync(SRC)), { density: 300 }).resize(64, 64).png().toFile(path.join(__dirname, "..", "public", "favicon.png"));
  console.log("favicon ✓");
})();
