#!/usr/bin/env node
/* فحص تجاوب حي — يزور كل صفحات العميل ويقيس الفائض الأفقي عند 360px */
const { execSync } = require("child_process");

const ab = (cmd) => execSync(`agent-browser ${cmd}`, { encoding: "utf8", timeout: 60000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const VIEWS = [
  "الرئيسية", "احجز استشارتك", "الأخصائيون", "العيادات", "الإعلانات",
  "تمارين التهدئة", "جلستي", "شكر وعرفان", "الدورات", "الإعدادات",
];

(async () => {
  ab(`set viewport 360 780`);
  ab(`open http://127.0.0.1:3931/`);
  ab(`wait --load networkidle`);
  await sleep(1200);

  const results = [];
  for (const name of VIEWS) {
    try {
      ab(`eval "(function(){var b=document.querySelectorAll('button');for(var i=0;i<b.length;i++){if((b[i].getAttribute('aria-label')||'').indexOf('القائمة')>=0){b[i].click();break}}})()"`);
      await sleep(500);
      const clickOut = ab(`eval "(function(){var b=document.querySelectorAll('button');for(var i=0;i<b.length;i++){if(b[i].textContent && b[i].textContent.trim()==='${name}'){b[i].click();return 'OK'}}return 'MISS'})()"`).trim();
      await sleep(1400);
      const m = ab(`eval "JSON.stringify({w: window.innerWidth, sw: document.documentElement.scrollWidth, over: document.documentElement.scrollWidth > window.innerWidth})"`).trim();
      results.push({ name, clickOut, m });
      console.log(`${name}: ${clickOut} → ${m}`);
    } catch (e) {
      results.push({ name, clickOut: "ERR", m: e.message.slice(0, 80) });
      console.log(`${name}: ERR ${e.message.slice(0, 80)}`);
    }
  }

  console.log("\n=== الملخص ===");
  let bad = 0;
  for (const r of results) {
    try {
      const o = JSON.parse(r.m.replace(/^[^{]*/, ""));
      const ok = !o.over;
      if (!ok) bad++;
      console.log(`${ok ? "✓" : "✗ فائض!"} ${r.name} (${o.sw}/${o.w})`);
    } catch {
      console.log(`? ${r.name}: غير مقاس — ${r.m}`);
      bad++;
    }
  }
  console.log(bad === 0 ? "\nكل الصفحات بلا فائض أفقي عند 360px" : `\n${bad} بنود فيها مشكلة`);
})();
