"use client";

/**
 * أصوات الواجهة — نغمات مولّدة عبر WebAudio (بدون ملفات صوتية)
 * ─────────────────────────────────────────────────────────────
 * click     نقرة خفيفة عند الضغط على الأزرار والروابط
 * navigate  نغمة تنقّل بين الصفحات
 * message   وصول رسالة جديدة داخل المحادثة
 * notify    وصول إشعار
 * success   نجاح عملية (حفظ/إرسال)
 * error     خطأ
 *
 * v2.14.0 (طلب المستخدم): كل الأصوات في المنصة مطفأة تلقائياً افتراضياً
 * — نقرات وأصوات طبيعة الخ — ولا تعمل إلا بعد تفعيلها من الإعدادات.
 * الإعداد محفوظ في localStorage: tumaanina-sounds = "on" | "off" (افتراضي off)
 * AudioContext يُفتح عند أول تفاعل من المستخدم (سياسة المتصفحات).
 */

export type SoundName = "click" | "navigate" | "message" | "notify" | "success" | "error";

const STORAGE_KEY = "tumaanina-sounds";

export function isSoundOn(): boolean {
  if (typeof window === "undefined") return false;
  /* v2.14.0: الصمت افتراضياً — الصوت يحتاج تفعيلاً صريحاً من الإعدادات */
  return localStorage.getItem(STORAGE_KEY) === "on";
}

export function setSoundOn(on: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
}

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

interface ToneSpec {
  freq: number;
  to?: number;
  dur: number;
  delay?: number;
  type?: OscillatorType;
  gain?: number;
}

function playTones(tones: ToneSpec[]) {
  if (!isSoundOn()) return;
  const ac = getCtx();
  if (!ac) return;
  if (ac.state === "suspended") return; // لم يُفتح بعد بتفاعل مستخدم — نتجاهل بصمت
  const now = ac.currentTime;
  for (const t of tones) {
    try {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      const start = now + (t.delay ?? 0);
      const end = start + t.dur;
      const vol = t.gain ?? 0.05;
      osc.type = t.type ?? "sine";
      osc.frequency.setValueAtTime(t.freq, start);
      if (t.to) osc.frequency.exponentialRampToValueAtTime(t.to, end);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(vol, start + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(g).connect(ac.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    } catch {
      /* تجاهل */
    }
  }
}

/** تشغيل نغمة واجهة — آمن للاستدعاء من أي مكان */
export function playSound(name: SoundName) {
  switch (name) {
    case "click":
      playTones([{ freq: 620, to: 520, dur: 0.045, type: "triangle", gain: 0.035 }]);
      break;
    case "navigate":
      playTones([
        { freq: 494, dur: 0.07, type: "sine", gain: 0.04 },
        { freq: 740, dur: 0.09, delay: 0.06, type: "sine", gain: 0.045 },
      ]);
      break;
    case "message":
      playTones([{ freq: 660, to: 880, dur: 0.1, type: "sine", gain: 0.055 }]);
      break;
    case "notify":
      playTones([
        { freq: 880, dur: 0.12, type: "sine", gain: 0.06 },
        { freq: 1318, dur: 0.16, delay: 0.1, type: "sine", gain: 0.05 },
      ]);
      break;
    case "success":
      playTones([
        { freq: 523, dur: 0.08, type: "sine", gain: 0.045 },
        { freq: 659, dur: 0.08, delay: 0.07, type: "sine", gain: 0.045 },
        { freq: 784, dur: 0.12, delay: 0.14, type: "sine", gain: 0.05 },
      ]);
      break;
    case "error":
      playTones([{ freq: 240, to: 170, dur: 0.16, type: "sawtooth", gain: 0.03 }]);
      break;
  }
}

let lastClickAt = 0;
let installed = false;

/**
 * v2.13.0 — أصوات طبيعة مهدئة (20 ثانية) مولّدة كلياً عبر WebAudio.
 * ─────────────────────────────────────────────────────────────
 * في كل مرة يُختار صوت عشوائي واحد من خمسة:
 *   1. مطر            → ضجيج مُرشَّح منخفض + نقط مطر متطايرة stereo
 *   2. نار مشتعلة     → هدير جمر بني + طقطقات عشوائية بأطوال وحدّ متفاوتين
 *   3. عصافير وتدفق ماء → جدول ماء + زقزقة FM بسلالم متصاعدة
 *   4. حيتان البحر    → أنين حيتان بطيء منخفض التردد + صدى تحت الماء
 *   5. غابة وشلال     → شلال متجدد + عصافير بعيدة (من روح مقطع
 *     «Chants d'oiseaux et ruisseau, cascade, forêt» المقترح من المستخدم)
 *
 * قاعدة الأمان النفسي: كل الأصوات منخفضة الحدّة وبلا ترددات حادة ولا
 * قفزات مفاجئة، مع تلاشٍ دخول/خروج ناعم — صوت يهدئ ولا يوتّر.
 * المدة 20 ثانية (طلب المستخدم)، وتُشغَّل بعد إغلاق نافذة الاطمئنان
 * في الصفحة الرئيسية، بلا ملفات صوتية وتحترم إعداد أصوات الواجهة.
 */

const AMBIENT_DURATION = 20;

/** مخزن ضجيج أبيض أو بني (تكاملي) — أساس كل الأصوات الطبيعية */
function makeNoiseBuffer(ac: AudioContext, seconds: number, kind: "white" | "brown"): AudioBuffer {
  const len = Math.max(1, Math.floor(ac.sampleRate * seconds));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  if (kind === "white") {
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } else {
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }
  return buf;
}

function loopNoise(ac: AudioContext, out: AudioNode, t0: number, dur: number, kind: "white" | "brown"): AudioBufferSourceNode {
  const src = ac.createBufferSource();
  src.buffer = makeNoiseBuffer(ac, Math.min(4, dur), kind);
  src.loop = true;
  src.start(t0);
  src.stop(t0 + dur + 0.2);
  src.connect(out);
  return src;
}

function randomPan(ac: AudioContext, amount = 0.6): AudioNode | null {
  try {
    const p = ac.createStereoPanner();
    p.pan.value = Math.random() * 2 * amount - amount;
    return p;
  } catch {
    return null; /* متصفح بلا StereoPanner — بلا تنصت */
  }
}

/* ─── 1) المطر ─── */
function scheduleRain(ac: AudioContext, out: AudioNode, t0: number, dur: number) {
  /* طبقة الهطول المتصل: مرشّح منخفض متوسط + طبقة عمق منخفضة */
  const body = ac.createBiquadFilter();
  body.type = "lowpass";
  body.frequency.value = 2400;
  body.Q.value = 0.4;
  const bodyGain = ac.createGain();
  bodyGain.gain.value = 0.14;
  body.connect(bodyGain).connect(out);
  loopNoise(ac, body, t0, dur, "white");

  const deep = ac.createBiquadFilter();
  deep.type = "lowpass";
  deep.frequency.value = 480;
  const deepGain = ac.createGain();
  deepGain.gain.value = 0.10;
  deep.connect(deepGain).connect(out);
  loopNoise(ac, deep, t0, dur, "white");

  /* نقط مطر متطايرة: نبضات قصيرة جداً بترددات عالية وبتنصت عشوائي */
  const drops = Math.floor(dur * 3.2);
  for (let i = 0; i < drops; i++) {
    try {
      const at = t0 + Math.random() * dur;
      const osc = ac.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(2600 + Math.random() * 3900, at);
      const g = ac.createGain();
      const peak = 0.006 + Math.random() * 0.013;
      const d = 0.02 + Math.random() * 0.045;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak, at + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, at + d);
      const pan = randomPan(ac);
      if (pan) {
        osc.connect(g).connect(pan).connect(out);
      } else {
        osc.connect(g).connect(out);
      }
      osc.start(at);
      osc.stop(at + d + 0.02);
    } catch {
      /* تجاهل */
    }
  }
}

/* ─── 2) النار المشتعلة ─── */
function scheduleFire(ac: AudioContext, out: AudioNode, t0: number, dur: number) {
  /* هدير الجمر: ضجيج بني مرشّح منخفض جداً */
  const rumble = ac.createBiquadFilter();
  rumble.type = "lowpass";
  rumble.frequency.value = 340;
  const rumbleGain = ac.createGain();
  rumbleGain.gain.value = 0.26;
  rumble.connect(rumbleGain).connect(out);
  loopNoise(ac, rumble, t0, dur, "brown");

  /* همس اللهب: طبقة وسطى خفيفة */
  const hiss = ac.createBiquadFilter();
  hiss.type = "bandpass";
  hiss.frequency.value = 2600;
  hiss.Q.value = 0.6;
  const hissGain = ac.createGain();
  hissGain.gain.value = 0.012;
  hiss.connect(hissGain).connect(out);
  loopNoise(ac, hiss, t0, dur, "white");

  /* الطقطقة: انفجارات ضجيج قصيرة بأطوال وحدود عشوائية — مثل الچمر الحقيقي */
  const popBuf = makeNoiseBuffer(ac, 0.12, "white");
  const count = Math.floor(dur * 7);
  for (let i = 0; i < count; i++) {
    try {
      const at = t0 + Math.random() * (dur - 0.2);
      const src = ac.createBufferSource();
      src.buffer = popBuf;
      const offset = Math.random() * 0.05;
      const d = 0.015 + Math.random() * 0.05;
      const bp = ac.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 900 + Math.random() * 4600;
      bp.Q.value = 0.9 + Math.random();
      const g = ac.createGain();
      const peak = 0.02 + Math.random() * 0.1;
      g.gain.setValueAtTime(peak, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + d);
      const pan = randomPan(ac);
      src.connect(bp).connect(g);
      if (pan) g.connect(pan).connect(out);
      else g.connect(out);
      src.start(at, offset, d + 0.02);
    } catch {
      /* تجاهل */
    }
  }

  /* طقطقات عميقة من حين لآخر (انفجارات جذوع) */
  const thumps = Math.floor(dur / 4);
  for (let i = 0; i < thumps; i++) {
    try {
      const at = t0 + Math.random() * dur;
      const src = ac.createBufferSource();
      src.buffer = popBuf;
      const lp = ac.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 300;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.12, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
      src.connect(lp).connect(g).connect(out);
      src.start(at, Math.random() * 0.05, 0.1);
    } catch {
      /* تجاهل */
    }
  }
}

/* ─── 3) عصافير وتدفق ماء ─── */
function scheduleBirdsWater(ac: AudioContext, out: AudioNode, t0: number, dur: number) {
  /* الجدول: ضجيج مُرشَّح نطاقياً يتماوج ببطء (LFO على تردد المرشح) */
  const stream = ac.createBiquadFilter();
  stream.type = "bandpass";
  stream.frequency.value = 1000;
  stream.Q.value = 0.7;
  const streamGain = ac.createGain();
  streamGain.gain.value = 0.085;
  stream.connect(streamGain).connect(out);
  loopNoise(ac, stream, t0, dur, "white");

  try {
    const lfo = ac.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.35;
    const lfoGain = ac.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain).connect(stream.frequency);
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.2);
  } catch {
    /* تجاهل */
  }

  /* فقاعات الماء: صفير صاعد قصير متكرر */
  const bubbles = Math.floor(dur * 3);
  for (let i = 0; i < bubbles; i++) {
    try {
      const at = t0 + Math.random() * dur;
      const osc = ac.createOscillator();
      osc.type = "sine";
      const f0 = 320 + Math.random() * 380;
      osc.frequency.setValueAtTime(f0, at);
      osc.frequency.exponentialRampToValueAtTime(f0 * 2.4, at + 0.05 + Math.random() * 0.07);
      const g = ac.createGain();
      const d = 0.05 + Math.random() * 0.09;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.008 + Math.random() * 0.008, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + d);
      const pan = randomPan(ac);
      if (pan) osc.connect(g).connect(pan).connect(out);
      else osc.connect(g).connect(out);
      osc.start(at);
      osc.stop(at + d + 0.02);
    } catch {
      /* تجاهل */
    }
  }

  /* العصافير: مجموعات زقزقة — كل مجموعة 2-4 مقاطع بصعود وهبوط تردد */
  let at = t0 + 0.4 + Math.random();
  while (at < t0 + dur - 1.2) {
    const syllables = 2 + Math.floor(Math.random() * 3);
    let sAt = at;
    const baseF = 2300 + Math.random() * 2100;
    const pan = randomPan(ac, 0.7);
    for (let s = 0; s < syllables; s++) {
      const sd = 0.07 + Math.random() * 0.09;
      try {
        const osc = ac.createOscillator();
        osc.type = "sine";
        const f0 = baseF * (0.92 + Math.random() * 0.16);
        osc.frequency.setValueAtTime(f0, sAt);
        osc.frequency.linearRampToValueAtTime(f0 * (1.25 + Math.random() * 0.3), sAt + sd * 0.45);
        osc.frequency.linearRampToValueAtTime(f0 * (0.8 + Math.random() * 0.12), sAt + sd);
        const g = ac.createGain();
        const peak = 0.014 + Math.random() * 0.026;
        g.gain.setValueAtTime(0.0001, sAt);
        g.gain.exponentialRampToValueAtTime(peak, sAt + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, sAt + sd);
        if (pan) osc.connect(g).connect(pan).connect(out);
        else osc.connect(g).connect(out);
        osc.start(sAt);
        osc.stop(sAt + sd + 0.02);
      } catch {
        /* تجاهل */
      }
      sAt += sd + 0.04 + Math.random() * 0.08;
    }
    at += 1.4 + Math.random() * 2.2;
  }
}

/* ─── 4) حيتان البحر ───
   أنين الحيتان: انزلاقات تردد بطيئة جداً (95–400Hz) مع فيبراتو لطيف
   وهجوم/انحلال ممتدّ، فوق فرشة محيط عميقة (ضجيج بني مرشَّح)، وصدى
   خفيف يحاكي امتداد الصوت تحت الماء. بلا أي حِدّة أو مفاجآت. */
function scheduleWhales(ac: AudioContext, out: AudioNode, t0: number, dur: number) {
  /* فرشة المحيط: ضجيج بني مرشَّح منخفض جداً — عمق هادئ */
  const ocean = ac.createBiquadFilter();
  ocean.type = "lowpass";
  ocean.frequency.value = 260;
  const oceanGain = ac.createGain();
  oceanGain.gain.value = 0.16;
  ocean.connect(oceanGain).connect(out);
  loopNoise(ac, ocean, t0, dur, "brown");

  /* تماوج بطيء لعمق المحيط — موجة كل 7 ثوانٍ تقريباً */
  try {
    const swell = ac.createOscillator();
    swell.type = "sine";
    swell.frequency.value = 0.14;
    const swellGain = ac.createGain();
    swellGain.gain.value = 0.05;
    swell.connect(swellGain).connect(oceanGain.gain);
    swell.start(t0);
    swell.stop(t0 + dur + 0.2);
  } catch {
    /* تجاهل */
  }

  /* صدى تحت الماء — تأخير ناعم بتغذية راجعة خفيفة */
  let echo: DelayNode | null = null;
  try {
    echo = ac.createDelay(1.2);
    echo.delayTime.value = 0.42;
    const echoFb = ac.createGain();
    echoFb.gain.value = 0.3;
    const echoOut = ac.createGain();
    echoOut.gain.value = 0.5;
    echo.connect(echoFb).connect(echo);
    echo.connect(echoOut).connect(out);
  } catch {
    echo = null;
  }

  /* أنين الحيتان: 3-4 نداءات ممتدة — كل نداء انزلاق تردد بطيء مع فيبراتو */
  const calls = 3 + Math.floor(Math.random() * 2);
  for (let i = 0; i < calls; i++) {
    try {
      const at = t0 + 0.6 + (dur - 2.2) * (i / calls) + Math.random() * 0.7;
      const callDur = 2.2 + Math.random() * 1.6;
      const osc = ac.createOscillator();
      osc.type = "sine";
      const f0 = 95 + Math.random() * 90;
      const f1 = f0 * (1.5 + Math.random() * 1.1);
      const f2 = f0 * (0.8 + Math.random() * 0.3);
      /* منحنى النداء: انزلاق صاعد بطيء ثم هبوط أطول */
      osc.frequency.setValueAtTime(f0, at);
      osc.frequency.linearRampToValueAtTime(f1, at + callDur * 0.45);
      osc.frequency.linearRampToValueAtTime(f2, at + callDur);
      /* فيبراتو لطيف 4-6Hz — «رعشة» صوت الحوت الطبيعية */
      const vib = ac.createOscillator();
      vib.type = "sine";
      vib.frequency.value = 4 + Math.random() * 2;
      const vibGain = ac.createGain();
      vibGain.gain.value = f0 * 0.03;
      vib.connect(vibGain).connect(osc.frequency);
      vib.start(at);
      vib.stop(at + callDur + 0.1);

      const g = ac.createGain();
      /* هجوم وانحلال ممتدان — بلا أي نبضة مفاجئة */
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.03, at + callDur * 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, at + callDur);

      const lp = ac.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 620; /* إزالة أي حِدّة مزعجة */

      const pan = randomPan(ac, 0.5);
      osc.connect(g).connect(lp);
      if (pan) {
        lp.connect(pan).connect(out);
      } else {
        lp.connect(out);
      }
      if (echo && pan) pan.connect(echo);
      else if (echo) lp.connect(echo);
      osc.start(at);
      osc.stop(at + callDur + 0.05);
    } catch {
      /* تجاهل */
    }
  }
}

/* ─── 5) غابة وشلال ───
   مستوحى من مقطع «Chants d'oiseaux et ruisseau, cascade, forêt» —
   شلال متجدد بطبقات (جسم متماوج + رذاذ ناعم + بركة عميقة)، وعصافير
   بعيدة منخفضة الحِدّ، بلا أي صوت يفاجئ المستخدم. */
function scheduleForestWaterfall(ac: AudioContext, out: AudioNode, t0: number, dur: number) {
  /* جسم الشلال: ضجيج مرشَّح نطاقي متوسط يتماوج ببطء (تغيّر تدفق طبيعي) */
  const falls = ac.createBiquadFilter();
  falls.type = "bandpass";
  falls.frequency.value = 750;
  falls.Q.value = 0.55;
  const fallsGain = ac.createGain();
  fallsGain.gain.value = 0.11;
  falls.connect(fallsGain).connect(out);
  loopNoise(ac, falls, t0, dur, "white");
  try {
    const lfo = ac.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.22;
    const lfoGain = ac.createGain();
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain).connect(falls.frequency);
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.2);
  } catch {
    /* تجاهل */
  }

  /* رذاذ مرتفع ناعم — طبقة فوقية خفيفة جداً مُرشَّحة بلا حِدّة */
  const spray = ac.createBiquadFilter();
  spray.type = "lowpass";
  spray.frequency.value = 5200;
  const sprayGain = ac.createGain();
  sprayGain.gain.value = 0.045;
  spray.connect(sprayGain).connect(out);
  loopNoise(ac, spray, t0, dur, "white");

  /* بركة أسفل الشلال: عمق منخفض يربط الطبقات */
  const pool = ac.createBiquadFilter();
  pool.type = "lowpass";
  pool.frequency.value = 400;
  const poolGain = ac.createGain();
  poolGain.gain.value = 0.07;
  pool.connect(poolGain).connect(out);
  loopNoise(ac, pool, t0, dur, "brown");

  /* عصافير الغابة البعيدة — زقزقة أخفّ وأهدأ من «عصافير وماء» */
  let at = t0 + 1.2 + Math.random();
  while (at < t0 + dur - 1.5) {
    const syllables = 2 + Math.floor(Math.random() * 2);
    let sAt = at;
    const baseF = 1900 + Math.random() * 1400;
    const pan = randomPan(ac, 0.75);
    for (let s = 0; s < syllables; s++) {
      const sd = 0.08 + Math.random() * 0.08;
      try {
        const osc = ac.createOscillator();
        osc.type = "sine";
        const f0 = baseF * (0.94 + Math.random() * 0.12);
        osc.frequency.setValueAtTime(f0, sAt);
        osc.frequency.linearRampToValueAtTime(f0 * (1.18 + Math.random() * 0.2), sAt + sd * 0.5);
        osc.frequency.linearRampToValueAtTime(f0 * (0.85 + Math.random() * 0.1), sAt + sd);
        const g = ac.createGain();
        const peak = 0.008 + Math.random() * 0.012; /* بعيدة — حدّ منخفض */
        g.gain.setValueAtTime(0.0001, sAt);
        g.gain.exponentialRampToValueAtTime(peak, sAt + 0.014);
        g.gain.exponentialRampToValueAtTime(0.0001, sAt + sd);
        const lp = ac.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 4200; /* مسافة الغابة — بلا صفير حاد */
        if (pan) osc.connect(g).connect(lp).connect(pan).connect(out);
        else osc.connect(g).connect(lp).connect(out);
        osc.start(sAt);
        osc.stop(sAt + sd + 0.02);
      } catch {
        /* تجاهل */
      }
      sAt += sd + 0.05 + Math.random() * 0.09;
    }
    at += 2.2 + Math.random() * 2.8;
  }
}

/** تشغيل صوت طبيعة عشوائي لمدة 20 ثانية — آمن للاستدعاء من أي مكان
 *  (الاسم التاريخي 30s محفوظ توافقاً مع الاستدعاءات القائمة) */
export function playAmbient30s(): void {
  if (!isSoundOn()) return;
  const ac = getCtx();
  if (!ac || ac.state === "suspended") return;
  const t0 = ac.currentTime + 0.08;

  const master = ac.createGain();
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.exponentialRampToValueAtTime(0.9, t0 + 2.0);
  master.gain.setValueAtTime(0.9, t0 + AMBIENT_DURATION - 2.8);
  master.gain.exponentialRampToValueAtTime(0.0001, t0 + AMBIENT_DURATION);
  master.connect(ac.destination);

  const pick = Math.floor(Math.random() * 5);
  if (pick === 0) scheduleRain(ac, master, t0, AMBIENT_DURATION);
  else if (pick === 1) scheduleFire(ac, master, t0, AMBIENT_DURATION);
  else if (pick === 2) scheduleBirdsWater(ac, master, t0, AMBIENT_DURATION);
  else if (pick === 3) scheduleWhales(ac, master, t0, AMBIENT_DURATION);
  else scheduleForestWaterfall(ac, master, t0, AMBIENT_DURATION);

  /* تنظيف العقد بعد انتهاء التلاشي الخروج */
  setTimeout(() => {
    try {
      master.disconnect();
    } catch {
      /* تجاهل */
    }
  }, (AMBIENT_DURATION + 1.5) * 1000);
}

/** تثبيت مستمع عام: نقرة خفيفة على كل زر/رابط — يُستدعى مرة واحدة من الـProviders */
export function initGlobalSounds() {
  if (typeof window === "undefined" || installed) return;
  installed = true;
  document.addEventListener(
    "pointerdown",
    (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const el = target.closest("button, a, [role='button'], [role='menuitem'], summary");
      if (!el) return;
      // عناصر معطّلة بلا صوت
      if ((el as HTMLButtonElement).disabled) return;
      const now = Date.now();
      if (now - lastClickAt < 70) return;
      lastClickAt = now;
      playSound("click");
    },
    { capture: true }
  );
}
