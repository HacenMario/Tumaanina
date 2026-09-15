import "server-only";
import { InAppNotification, User } from "@/lib/models";
import { sendPushToUser } from "@/lib/server/push";
import { TEXTS, fill, type NotifKey, type NotifLang } from "@/lib/notif-texts";






/** v1.4.0: اسم العرض للطرف الآخر — يُدمج في نصوص الإشعارات ({name}) */
export async function displayNameOf(userId: string): Promise<string> {
  try {
    const u = (await User.findById(userId).select("pseudonym fullName").lean()) as {
      pseudonym?: string | null;
      fullName?: string | null;
    } | null;
    return String(u?.pseudonym || u?.fullName || "").trim().slice(0, 60);
  } catch {
    return "";
  }
}

/** لغة المستخدم من قاعدة البيانات (افتراضي: العربية) — v2.9.0: + تر/روسية/صينية */
const NOTIF_LANGS: NotifLang[] = ["ar", "fr", "en", "tr", "ru", "zh"];
async function langOf(userId: string): Promise<NotifLang> {
  try {
    const user = (await User.findById(userId).select("language").lean()) as { language?: string } | null;
    const lang = user?.language as NotifLang | undefined;
    if (lang && NOTIF_LANGS.includes(lang)) return lang;
  } catch {
    /* معرّف غير صالح (مثل "admin") — العربية افتراضياً */
  }
  return "ar";
}


/** اقتباس آمن من نص الرسالة — يُستعمل في تفاصيل إشعار الرسالة (مقطوع ومطهّف) */
export function messageExcerpt(content: string, max = 90): string {
  const clean = String(content || "").replace(/\s+/g, " ").trim();
  if (!clean) return "…";
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/** v1.16.0: تنسيق موعد موحد بالأرقام اللاتينية: YYYY/MM/DD HH:MM:SS (توقيت الجزائر)
    — نفس الصيغة الموحدة للمنصة كلها، بلا ص/م ولا تواريخ هجرية */
export function formatWhenUTC1(d: Date | string): string {
  const dt = new Date(typeof d === "string" ? d : d.getTime());
  const shifted = new Date(dt.getTime() + 60 * 60 * 1000);
  const iso = shifted.toISOString();
  return `${iso.slice(0, 4)}/${iso.slice(5, 7)}/${iso.slice(8, 10)} ${iso.slice(11, 19)}`;
}

/**
 * إشعار موحّد: Push فوري على الجهاز + إشعار داخلي في جرس الموقع.
 * كلاهما باللغة المفضلة للمستخدم المسجلة في حسابه.
 * vars: متغيرات القالب — تُدمج في النص قبل الحفظ.
 */
export async function notifyUser(
  userId: string,
  key: NotifKey,
  url: string = "/",
  vars?: Record<string, string>
): Promise<{ sent: number }> {
  const lang = await langOf(userId);
  const tpl = TEXTS[key][lang];
  const title = fill(tpl.title, vars);
  const body = fill(tpl.body, vars);

  /* إشعار داخلي في جرس الموقع (يبقى حتى يقرأه المستخدم)
     v1.6.0: تُخزَّن vars مع المفتاح كي يُعاد توليد النص بلغة واجهة
     المستخدم الحالية عند العرض — الإشعارات تُترجم فعلياً للغات الست */
  try {
    await InAppNotification.create({ userId, key, title, body, url, vars: vars || null });
  } catch (e) {
    console.error("[NOTIFY] تعذر حفظ الإشعار الداخلي:", (e as Error).message);
  }

  const r = await sendPushToUser(userId, title, body, url, lang);
  return { sent: r.sent };
}

/**
 * v2.13.0 — إشعار مفاتيحي جماعي: نفس قالب notifyUser لكن لعدة مستخدمين
 * (كل مستخدم بلغته الخاصة) — يُستعمل لإشعار متابعي الأخصائي بنشر جديد.
 * مستخدم فاشل لا يوقف البقية.
 */
export async function notifyManyByKey(
  userIds: string[],
  key: NotifKey,
  url: string = "/",
  vars?: Record<string, string>
): Promise<{ sent: number }> {
  let sent = 0;
  for (const id of userIds) {
    try {
      const r = await notifyUser(id, key, url, vars);
      sent += r.sent > 0 ? 1 : 0;
    } catch {
      /* مستخدم فاشل لا يوقف البقية */
    }
  }
  return { sent };
}

/**
 * إشعار رسالة جديدة داخل غرفة الجلسة: يُرسل فقط عندما يكون الطرف المستلم
 * بعيداً عن الغرفة (آخر نبض له أقدم من نافذة الحضور) — مع اسم المرسل
 * واقتباس من الرسالة (v2.8.0: تفاصيل الرسالة كما طلب المستخدم).
 * v2.9.0: رابط الإشعار (?session={id}) يفتح غرفة الجلسة مباشرة عند الضغط.
 */
export async function notifyNewMessage(
  partnerUserId: string,
  senderName: string,
  excerpt?: string,
  sessionId?: string
): Promise<{ sent: number }> {
  const lang = await langOf(partnerUserId);
  const tpl = TEXTS.message[lang];
  const safeName = String(senderName || "").trim().slice(0, 60);
  const fallbackName = lang === "ar" ? "الطرف الآخر" : lang === "fr" ? "l'autre partie" : "the other party";
  const title = tpl.title;
  const body = fill(tpl.body, {
    name: safeName || fallbackName,
    excerpt: (excerpt || "").slice(0, 120),
  });

  const targetUrl = sessionId ? `/?session=${encodeURIComponent(sessionId)}` : "/";
  try {
    await InAppNotification.create({
      userId: partnerUserId,
      key: "message",
      title,
      body,
      url: targetUrl,
      vars: { name: safeName || fallbackName, excerpt: (excerpt || "").slice(0, 120) },
    });
  } catch (e) {
    console.error("[NOTIFY] تعذر حفظ إشعار الرسالة:", (e as Error).message);
  }

  const r = await sendPushToUser(partnerUserId, title, body, targetUrl, lang);
  return { sent: r.sent };
}

/**
 * v2.8.0 — إشعار رسالة في محادثة ما قبل الجلسة (DM).
 * يُرسل فقط عندما يكون المستلم غائباً عن المنصة: آخر نبض عام له
 * (lastSeenAt — يُحدَّث مع كل فحص للجرس) أقدم من نافذة الحضور.
 */
const GLOBAL_PRESENCE_WINDOW_MS = 45_000;

export async function notifyDmMessage(
  partnerUserId: string,
  senderName: string,
  excerpt: string,
  senderId?: string
): Promise<{ sent: number; skipped: boolean }> {
  const partner = (await User.findById(partnerUserId).select("language lastSeenAt").lean()) as {
    language?: string;
    lastSeenAt?: Date | null;
  } | null;
  if (!partner) return { sent: 0, skipped: true };

  /* حاضر في المنصة الآن؟ → لا إشعار (يصفّي المحادثة بنفسه) */
  const seen = partner.lastSeenAt ? new Date(partner.lastSeenAt as unknown as string).getTime() : 0;
  if (seen && Date.now() - seen < GLOBAL_PRESENCE_WINDOW_MS) {
    return { sent: 0, skipped: true };
  }

  const lang = (partner.language && NOTIF_LANGS.includes(partner.language as NotifLang)
    ? (partner.language as NotifLang)
    : "ar") as NotifLang;
  const tpl = TEXTS.dm[lang];
  const safeName = String(senderName || "").trim().slice(0, 60);
  const fallbackName =
    lang === "ar" ? "طرف المحادثة"
    : lang === "fr" ? "votre interlocuteur"
    : lang === "tr" ? "sohbet ortağınız"
    : lang === "ru" ? "ваш собеседник"
    : lang === "zh" ? "聊天对象"
    : "your chat partner";
  const title = tpl.title;
  const body = fill(tpl.body, { name: safeName || fallbackName, excerpt: excerpt.slice(0, 120) });

  /* v2.9.0: الضغط على الإشعار يفتح المحادثة مع المرسل مباشرة */
  const targetUrl = senderId ? `/?dm=${encodeURIComponent(senderId)}` : "/";
  try {
    await InAppNotification.create({ userId: partnerUserId, key: "dm", title, body, url: targetUrl, vars: { name: safeName || fallbackName, excerpt: excerpt.slice(0, 120) } });
  } catch (e) {
    console.error("[NOTIFY] تعذر حفظ إشعار المحادثة:", (e as Error).message);
  }

  const r = await sendPushToUser(partnerUserId, title, body, targetUrl, lang);
  return { sent: r.sent, skipped: false };
}

/**
 * v2.10.0 — رسالة جديدة في محادثة المختص مع الإدارة:
 * • من المختص → تُخزَّن إشعارات داخلية لكل حسابات الإدارة (ويُدفع push)
 *   بذكر اسم المختص واقتباس الرسالة.
 * • من الإدارة → إشعار للمختص برابط ?admin-chat=1 يفتح صفحة المحادثة مباشرة.
 * كلاهما يُرسل فقط للطرف الغائب عن المنصة (آخر نبض عام).
 */
export async function notifyAdminChatMessage(
  opts: { fromAdmin: boolean; counselorId: string; senderName: string; excerpt: string }
): Promise<{ sent: number }> {
  const { fromAdmin, counselorId, senderName, excerpt } = opts;
  let sent = 0;

  if (!fromAdmin) {
    /* المختص راسل الإدارة → أبلغ كل حسابات الإدارة */
    const admins = (await User.find({ role: "ADMIN" }).select("_id lastSeenAt language").lean()) as {
      _id: unknown;
      lastSeenAt?: Date | null;
      language?: string;
    }[];
    for (const a of admins) {
      try {
        const seen = a.lastSeenAt ? new Date(a.lastSeenAt as unknown as string).getTime() : 0;
        if (seen && Date.now() - seen < GLOBAL_PRESENCE_WINDOW_MS) continue; /* حاضر — لا إزعاج */
        const lang = (a.language && NOTIF_LANGS.includes(a.language as NotifLang) ? (a.language as NotifLang) : "ar") as NotifLang;
        const tpl = TEXTS.adminChat[lang];
        const title = tpl.title;
        const body = fill(tpl.body, { name: String(senderName || "").slice(0, 60) || "—", excerpt: String(excerpt || "").slice(0, 120) });
        await InAppNotification.create({ userId: String(a._id), key: "adminChat", title, body, url: "/", vars: { name: String(senderName || "").slice(0, 60) || "—", excerpt: String(excerpt || "").slice(0, 120) } });
        const r = await sendPushToUser(String(a._id), title, body, "/", lang);
        sent += r.sent > 0 ? 1 : 0;
      } catch {
        /* إشعار واحد فاشل لا يوقف البقية */
      }
    }
    return { sent };
  }

  /* الإدارة ردّت → أبلغ المختص برابط يفتح محادثة الإدارة مباشرة */
  const counselor = (await User.findById(counselorId).select("language lastSeenAt").lean()) as {
    language?: string;
    lastSeenAt?: Date | null;
  } | null;
  if (!counselor) return { sent: 0 };
  const seen = counselor.lastSeenAt ? new Date(counselor.lastSeenAt as unknown as string).getTime() : 0;
  if (seen && Date.now() - seen < GLOBAL_PRESENCE_WINDOW_MS) return { sent: 0, skipped: true } as { sent: number; skipped?: boolean };
  const lang = (counselor.language && NOTIF_LANGS.includes(counselor.language as NotifLang) ? (counselor.language as NotifLang) : "ar") as NotifLang;
  const tpl = TEXTS.adminChat[lang];
  const title = tpl.title;
  const body = fill(tpl.body, { name: String(senderName || "").slice(0, 60) || "—", excerpt: String(excerpt || "").slice(0, 120) });
  const targetUrl = "/?admin-chat=1";
  try {
    await InAppNotification.create({ userId: counselorId, key: "adminChat", title, body, url: targetUrl, vars: { name: String(senderName || "").slice(0, 60) || "—", excerpt: String(excerpt || "").slice(0, 120) } });
  } catch (e) {
    console.error("[NOTIFY] تعذر حفظ إشعار محادثة الإدارة:", (e as Error).message);
  }
  const r = await sendPushToUser(counselorId, title, body, targetUrl, lang);
  return { sent: r.sent };
}

/**
 * v2.8.0 — إشعار جماعي من الإدارة: نص بلغة كل مستخدم (العربية احتياطاً).
 * يعيد عدد المرسل بنجاح. يُستدعى من action bulk-notify في /api/admin.
 */
export async function notifyBulk(
  userIds: string[],
  textAr: string,
  textFr?: string,
  textEn?: string
): Promise<{ sent: number }> {
  let sent = 0;
  for (const id of userIds) {
    try {
      const lang = await langOf(id);
      const text = lang === "fr" ? textFr || textAr : lang === "en" ? textEn || textAr : textAr;
      const tpl = TEXTS.bulk[lang];
      const title = tpl.title;
      const body = fill(tpl.body, { text: String(text || "").slice(0, 500) });
      await InAppNotification.create({ userId: id, key: null, title, body, url: "/" });
      const r = await sendPushToUser(id, title, body, "/", lang);
      sent += r.sent > 0 ? 1 : 0;
    } catch {
      /* مستخدم فاشل لا يوقف البقية */
    }
  }
  return { sent };
}

/**
 * v1.20.0 — إشعار كل حسابات الإدارة بمفتاح قالب موحّد.
 * يُستعمل عند تقديم عيادة إعلاناً جديداً بانتظار المراجعة.
 * فشل إشعار واحد لا يوقف البقية. الانتظار مقصود (await) — على مضيفي
 * الدوال المؤقتة (serverless) قد يُقتل الوعد الطافي `void` بعد إرسال
 * الرد فلا يصل الإشعار أبداً؛ الاستدعاء المنتظر مضمون الحفظ.
 */
export async function notifyAdminsByKey(
  key: NotifKey,
  url: string = "/",
  vars?: Record<string, string>
): Promise<{ sent: number }> {
  let sent = 0;
  let targets: string[] = [];
  try {
    const admins = (await User.find({ role: "ADMIN" }).select("_id").lean()) as { _id: unknown }[];
    targets = admins.map((a) => String(a._id));
  } catch {
    /* قاعدة البيانات — يُعاد صفر */
  }
  if (targets.length === 0) targets.push("admin"); // المعرّف الاصطناعي احتياطاً
  for (const id of targets) {
    try {
      await notifyUser(id, key, url, vars);
      sent += 1; /* الإشعار الداخلي يُحفظ دوماً حتى لو فشل الـ push */
    } catch {
      /* إشعار أدمين فاشل لا يوقف البقية */
    }
  }
  return { sent };
}

/**
 * v2.9.0 — إشعار فوز تحدي الالتزام للعميلين — يصل لكل حسابات الأدمين
 * (أو المعرّف الاصطناعي "admin" كاحتياط) باسم الفائز الأول.
 */
export async function notifyAdminVictimChallengeWinner(winnerName: string): Promise<{ sent: number }> {
  const admins = (await User.find({ role: "ADMIN" }).select("_id").lean()) as { _id: unknown }[];
  const targets: string[] = admins.map((a) => String(a._id));
  if (targets.length === 0) targets.push("admin");

  let sent = 0;
  for (const id of targets) {
    try {
      const lang = await langOf(id).catch(() => "ar" as NotifLang);
      const tpl = TEXTS.victimChallenge[lang];
      const title = tpl.title;
      const body = tpl.body.split("{name}").join(String(winnerName || "—").slice(0, 80));
      await InAppNotification.create({ userId: id, key: "victimChallenge", title, body, url: "/", vars: { name: String(winnerName || "—").slice(0, 80) } });
      const r = await sendPushToUser(id, title, body, "/", lang);
      sent += r.sent > 0 ? 1 : 0;
    } catch {
      /* فشل إشعار أدمين واحد لا يوقف البقية */
    }
  }
  return { sent };
}

/**
 * v1.0.0 (طمأنينة) — حُذف إشعار نتيجة توثيق العميلين: التوثيق أصبح
 * حكراً على الأخصائيين فقط ونتيجته تصل عبر إشعارات verify/reject القائمة.
 */

/**
 * v2.7.0 — إشعار فوز التحدي السري: يصل لكل حسابات الأدمين (أو المعرّف
 * الاصطناعي "admin" كاحتياط إن لم يوجد حساب) باسم الفائز الأول.
 */
export async function notifyAdminChallengeWinner(winnerName: string): Promise<{ sent: number }> {
  const admins = (await User.find({ role: "ADMIN" }).select("_id language").lean()) as {
    _id: unknown;
    language?: string;
  }[];
  let sent = 0;

  const targets: string[] = admins.map((a) => String(a._id));
  if (targets.length === 0) targets.push("admin"); // المعرّف الاصطناعي — Mixed يقبله

  for (const id of targets) {
    try {
      const lang = await langOf(id).catch(() => "ar" as const);
      const tpl = TEXTS.challengeWon[lang];
      const title = tpl.title;
      const body = tpl.body.split("{name}").join(String(winnerName || "—").slice(0, 80));
      await InAppNotification.create({ userId: id, key: "challengeWon", title, body, url: "/", vars: { name: String(winnerName || "—").slice(0, 80) } });
      const r = await sendPushToUser(id, title, body, "/", lang);
      sent += r.sent > 0 ? 1 : 0;
    } catch {
      /* فشل إشعار أدمين واحد لا يوقف البقية */
    }
  }
  return { sent };
}
