/** تحقق بصري مركّز: بطاقة المختص بزر النجوم + نافذة التقييمات */
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");

const PORT = String(3700 + (process.pid % 100));
const BASE = `http://localhost:${PORT}`;
const SHOTS = "/home/z/my-project/download/v2140-shots";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(`${BASE}${path}`, {
      method, headers: { "Content-Type": "application/json", ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}) },
    }, (res) => {
      let buf = ""; res.on("data", (c) => (buf += c));
      res.on("end", () => { let j = null; try { j = JSON.parse(buf); } catch {} resolve({ status: res.statusCode, json: j }); });
    });
    r.on("error", reject); if (data) r.write(data); r.end();
  });
}

(async () => {
  const { MongoMemoryServer } = require("mongodb-memory-server");
  const mongod = await MongoMemoryServer.create();
  const server = spawn("node", ["server.js"], {
    env: { ...process.env, PORT, MONGODB_URI: mongod.getUri("v2140-ratings-visual"), ADMIN_PASSCODE: "v2140-rv", NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    await wait(500);
    try { const h = await req("GET", "/api/health"); if (h.json?.version >= "2.14.0") { ready = true; break; } } catch {}
  }
  if (!ready) { console.error("not ready"); process.exit(1); }

  /* مختص موثّق + متضرر له جلسة مكتملة + تقييمان */
  await req("POST", "/api/admin", { action: "login", passcode: "v2140-rv" });
  const cEmail = `rvis-${Date.now()}@test.dz`;
  await req("POST", "/api/counselor", {
    action: "register", fullName: "د. سلمى الحسني", email: cEmail, password: "pass-safe-2140",
    recoveryPhrase: "عبارة تجريبية للتحقق", specialties: ["anxiety", "grief"], languages: ["ar", "fr"],
    yearsExperience: 12, whatsapp: "213661234567", bio: "أخصائية نفسية سريرية، مرافقة نفسية لضحايا الكوارث والأسر المتضررة.",
  });
  const counselor = (await req("POST", "/api/counselor", { action: "login", email: cEmail, password: "pass-safe-2140" })).json.user;
  const meProf = await req("GET", `/api/counselor?userId=${counselor.id}`);
  await req("POST", "/api/admin", { action: "verify", profileId: meProf.json?.profile?.id });

  const victim = (await req("POST", "/api/victim", {
    action: "register", pseudonym: "أمين-1979", password: "pass-safe-2140",
    recoveryPhrase: "عبارة استرجاع", gender: "male", phone: "0555999888",
  })).json.user;

  const { MongoClient, ObjectId } = require("mongodb");
  const mc = new MongoClient(mongod.getUri("v2140-ratings-visual"));
  await mc.connect();
  await mc.db().collection("sessions").insertOne({
    victimId: new ObjectId(victim.id), counselorId: new ObjectId(counselor.id),
    topic: "anxiety", status: "COMPLETED", scheduledAt: new Date(), createdAt: new Date(),
  });
  await mc.close();

  await req("POST", `/api/counselors/${counselor.id}/ratings`, { victimId: victim.id, stars: 5, comment: "رافقتني بحنان وصبر حتى تجاوزت أزمنتي الصعبة. شكراً من القلب." });
  /* متضرر ثانٍ بتقييم 4 */
  const v2 = (await req("POST", "/api/victim", {
    action: "register", pseudonym: "وردة-1988", password: "pass-safe-2140",
    recoveryPhrase: "عبارة استرجاع 2", gender: "female", phone: "0555777666",
  })).json.user;
  const { MongoClient: MC2, ObjectId: OID2 } = require("mongodb");
  const mc2 = new MC2(mongod.getUri("v2140-ratings-visual"));
  await mc2.connect();
  await mc2.db().collection("sessions").insertOne({
    victimId: new OID2(v2.id), counselorId: new OID2(counselor.id),
    topic: "grief", status: "COMPLETED", scheduledAt: new Date(), createdAt: new Date(),
  });
  await mc2.close();
  await req("POST", `/api/counselors/${counselor.id}/ratings`, { victimId: v2.id, stars: 4, comment: "متابعة دقيقة ومقصلة، أنصح بها بشدة." });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: "ar" });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" }).catch(() => {});
  await wait(2500);
  await page.keyboard.press("Escape").catch(() => {});
  await page.evaluate((v) => {
    const raw = localStorage.getItem("rafiqi-state");
    const st = raw ? JSON.parse(raw) : { state: {}, version: 0 };
    st.state.view = "counselors-directory";
    localStorage.setItem("rafiqi-state", JSON.stringify(st));
  }, null);
  await page.reload({ waitUntil: "networkidle" }).catch(() => {});
  await wait(11000); /* نافذة الاطمئنان تغلق تلقائياً بعد 10 ثوانٍ */
  await page.screenshot({ path: `${SHOTS}/07-directory-stars.png` });
  console.log("📸 07 بطاقة المختص بزر النجوم");

  /* فتح نافذة التقييمات */
  await page.locator("button", { hasText: "التقييمات" }).first().click().catch(async () => {
    await page.locator('button[title="التقييمات"]').first().click().catch(() => {});
  });
  await wait(1300);
  await page.screenshot({ path: `${SHOTS}/09-ratings-dialog.png` });
  console.log("📸 09 نافذة التقييمات");

  await browser.close();
  server.kill("SIGKILL");
  await mongod.stop();
  process.exit(0);
})().catch((e) => { console.error("💥", e); process.exit(1); });
