/**
 * رفيقي النفسي — مُهيّئ التشغيل (بيئة المعاينة)
 * ─────────────────────────────────────────────────────────
 * المسؤولية: ضمان توفر MongoDB ثم تشغيل server.js
 *
 * المنطق:
 * 1. إن وُجد MONGODB_URI في البيئة → تشغيل مباشر به
 * 2. إن كان هناك MongoDB يعمل محليًا على :27017 → تشغيل مباشر عليه
 * 3. وإلا → محاولة تشغيل MongoDB مؤقت (mongodb-memory-server) بأفضل جهد
 * 4. إن فشل كل شيء → تشغيل server.js على أي حال (يعمل بوضع محدود:
 *    الصفحات والملفات الثابتة تعمل، وواجهات القاعدة تعيد خطأً وديًا)
 */
const { spawn } = require("child_process");
const net = require("net");

function probePort(port, host = "127.0.0.1", timeout = 500) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeout);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function main() {
  let uri = process.env.MONGODB_URI || "";

  if (uri) {
    console.log("🗄️  MONGODB_URI محدد في البيئة — تشغيل مباشر");
  } else if (await probePort(27017)) {
    console.log("🗄️  MongoDB محلي موجود على :27017 — التشغيل عليه");
  } else {
    try {
      const { MongoMemoryServer } = require("mongodb-memory-server");
      console.log("⏳ لا يوجد MongoDB محلي — تشغيل نسخة مؤقتة (أول مرة قد يُنزَّل الثنائي)...");
      const mongod = await MongoMemoryServer.create();
      uri = mongod.getUri("rafiqi-nafsi");
      console.log(`🗄️  MongoDB المؤقت جاهز: ${uri.replace(/\/\/([^@/]*)@/, "//***@")}`);
      mongod._rafiqiKeep = true; // لا تُغلق تلقائيًا — تعيش مع العملية
    } catch (e) {
      console.error("⚠️  تعذر تشغيل MongoDB تلقائيًا:", e.message);
      console.error("    سيُشغَّل الخادم بدونه — الصفحات والملفات الثابتة تعمل.");
    }
  }

  const child = spawn(process.execPath, ["server.js"], {
    stdio: "inherit",
    env: { ...process.env, ...(uri ? { MONGODB_URI: uri } : {}) },
  });

  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(sig, () => {
      try {
        child.kill(sig);
      } catch {}
      process.exit(0);
    });
  }
}

main().catch((e) => {
  console.error("❌ فشل المُهيّئ:", e);
  /* آخر أمل: شغّل الخادم مباشرة */
  const child = spawn(process.execPath, ["server.js"], { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 1));
});
