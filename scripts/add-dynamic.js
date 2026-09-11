// يضيف export const dynamic = "force-dynamic" لكل مسارات API
// حتى لا يحاول Next.js تنفيذها (واستعلام قاعدة البيانات) وقت البناء الثابت
const fs = require("fs");
const path = require("path");

const API_DIR = path.join(__dirname, "..", "src", "app", "api");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

let changed = 0;
for (const file of walk(API_DIR)) {
  let src = fs.readFileSync(file, "utf8");
  if (src.includes('export const dynamic')) continue;
  const lines = src.split("\n");
  let lastImport = -1;
  lines.forEach((l, i) => {
    if (l.startsWith("import ")) lastImport = i;
  });
  lines.splice(lastImport + 1, 0, "", 'export const dynamic = "force-dynamic";');
  fs.writeFileSync(file, lines.join("\n"));
  changed++;
  console.log("✅", path.relative(process.cwd(), file));
}
console.log(`— تم تحديث ${changed} ملفات`);
