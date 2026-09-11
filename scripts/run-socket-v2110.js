/** v2.11.0 — تشغيل test-socket على خادم مؤقت مع بذر أخصائي موثّق */
const { MongoMemoryServer } = require("mongodb-memory-server");
const { spawn } = require("child_process");
const { execSync } = require("child_process");

(async () => {
  const m = await MongoMemoryServer.create();
  const uri = m.getUri("rafiqi-sock");
  const s = spawn("node", ["server.js"], {
    env: { ...process.env, PORT: "3100", MONGODB_URI: uri, ADMIN_PASSCODE: "sock-pass", NODE_ENV: "production" },
    stdio: "ignore",
  });
  /* انتظر الجاهزية */
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try { const h = await fetch("http://127.0.0.1:3100/api/health"); if ((await h.json()).db === "connected") break; } catch {}
  }
  console.log("🟢 الخادم المؤقت جاهز");

  const post = async (path, body) => {
    const r = await fetch(`http://127.0.0.1:3100${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => null) };
  };

  await post("/api/admin", { action: "login", passcode: "sock-pass" });
  const reg = await post("/api/counselor", {
    action: "register", fullName: "د. سوكيت", email: "sock@test.dz", password: "sock-pass-123",
    recoveryPhrase: "عبارة سوكيت", whatsapp: "0555000111", specialties: ["trauma"], languages: ["ar"], yearsExperience: 4,
  });
  console.log("تسجيل الأخصائي:", reg.status, reg.json?.userId ? "ok" : JSON.stringify(reg.json));
  const login = await post("/api/counselor", { action: "login", email: "sock@test.dz", password: "sock-pass-123" });
  const me = await fetch("http://127.0.0.1:3100/api/counselor?userId=" + login.json?.user?.id).then((r) => r.json());
  const pid = me?.profile?.id;
  console.log("profileId:", pid);
  if (pid) await post("/api/admin", { action: "verify", profileId: pid });

  /* شغّل اختبار السوكيت كعملية فرعية */
  try {
    const out = execSync("node scripts/test-socket.js", { encoding: "utf-8", timeout: 60000, env: { ...process.env, TEST_URL: "http://127.0.0.1:3100" } });
    console.log(out);
  } catch (e) {
    console.log(e.stdout || e.message);
    process.exitCode = 1;
  }

  s.kill("SIGKILL");
  await m.stop();
  process.exit(process.exitCode || 0);
})();
