/* رفع حزمة v2.11.1 إلى gofile عبر API الحساب الضيف + مرآة catbox/tmpfiles */
const fs = require("fs");
const path = require("path");

const FILE = process.argv[2] || "/home/z/my-project/download/Rafiqi-Annafsi-v2.11.1.zip";

(async () => {
  const buf = fs.readFileSync(FILE);
  const md5 = require("crypto").createHash("md5").update(buf).digest("hex");
  console.log("الملف:", path.basename(FILE), buf.length, "bytes, md5:", md5);

  /* 1) حساب ضيف */
  const accRes = await fetch("https://api.gofile.io/accounts", { method: "POST" });
  const acc = await accRes.json();
  const token = acc?.data?.token;
  if (!token) throw new Error("فشل إنشاء حساب gofile: " + JSON.stringify(acc).slice(0, 200));
  console.log("[1] توكن الضيف جاهز");

  /* 2) خادم الرفع */
  const srvRes = await fetch("https://api.gofile.io/servers", { headers: { Authorization: "Bearer " + token } });
  const srv = await srvRes.json();
  const server = srv?.data?.servers?.[0]?.name;
  if (!server) throw new Error("لا خادم رفع: " + JSON.stringify(srv).slice(0, 200));
  console.log("[2] الخادم:", server);

  /* 3) الرفع */
  const form = new FormData();
  form.append("token", token);
  form.append("file", new Blob([buf]), path.basename(FILE));
  const upRes = await fetch(`https://${server}.gofile.io/contents/uploadfile`, { method: "POST", body: form });
  const up = await upRes.json();
  const page = up?.data?.downloadPage;
  if (!page) throw new Error("فشل الرفع: " + JSON.stringify(up).slice(0, 300));
  console.log("[3] رابط gofile:", page);

  /* 4) مرآة catbox litter (72 ساعة) */
  let catbox = "فشل";
  try {
    const cf = new FormData();
    cf.append("reqtype", "fileupload");
    cf.append("time", "72h");
    cf.append("fileToUpload", new Blob([buf]), path.basename(FILE));
    const cRes = await fetch("https://litter.catbox.moe/resource/internals/upload/", { method: "POST", body: cf });
    catbox = (await cRes.text()).trim();
    console.log("[4] مرآة catbox:", catbox);
  } catch (e) { console.log("[4] catbox فشل:", e.message); }

  /* 5) احتياط tmpfiles (60 دقيقة) */
  let tmpfiles = "فشل";
  try {
    const tf = new FormData();
    tf.append("file", new Blob([buf]), path.basename(FILE));
    const tRes = await fetch("https://tmpfiles.org/api/v1/upload", { method: "POST", body: tf });
    const tj = await tRes.json();
    tmpfiles = tj?.data?.url || "فشل";
    console.log("[5] احتياط tmpfiles:", tmpfiles);
  } catch (e) { console.log("[5] tmpfiles فشل:", e.message); }

  console.log("===SUMMARY===");
  console.log(JSON.stringify({ md5, size: buf.length, gofile: page, catbox, tmpfiles }, null, 1));
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
