import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { InAppNotification, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/**
 * إشعارات جرس الموقع (داخل التطبيق):
 *  GET  ?userId=…  → قائمة آخر الإشعارات + عدّاد غير المقروء
 *  POST {action:"read", userId, id?}    → تعيين إشعار واحد (أو الكل) كمقروء
 *  POST {action:"clear", userId}        → مسح كل إشعارات المستخدم
 */
async function GET_impl(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  await connectDB();

  /* v2.8.0: نبض الحضور العام — الجرس يستقصي كل 12 ثانية لكل مستخدم ولوج،
     فهو مقياس مثالي لـ«هل المستخدم حاضر في المنصة الآن؟» الذي يعتمد عليه
     إرسال إشعارات الرسائل الجديدة (لا إشعار لمن هو حاضر يقرأ بنفسه) */
  if (/^[a-f0-9]{24}$/i.test(userId)) {
    void User.updateOne({ _id: userId }, { $set: { lastSeenAt: new Date() } })
      .catch(() => {})
      .then(() => undefined);
  }

  /* v1.20.0 — إصلاح جذري لـ«لا إشعار يصل»:
     1) التوافق مع مخازن قديمة وجديدة معاً: بعض الإصدارات السابقة كانت تخزن
        userId كـ ObjectId وأخرى كنص — الاستعلام بـ$in يجلب كليهما دائماً.
     2) المعرّف الاصطناعي "admin" (تثبيتات برمز الإدارة بلا مستند User) —
        مخطط قديم مترجم كان يرمي CastError فتنهار القائمة برقم 500 ولا يرى
        الإدارة أي إشعار داخل المنصة أبداً. الآن أي فشل صبّ يعيد قائمة فارغة
        بدل انهيار المسار، والاستعلام النصي يمرّ آمناً على المخطط الحالي. */
  const idFilter = /^[a-f0-9]{24}$/i.test(userId)
    ? { userId: { $in: [userId, new mongoose.Types.ObjectId(userId)] } }
    : { userId };

  let items: Record<string, unknown>[] = [];
  let unread = 0;
  try {
    [items, unread] = (await Promise.all([
      InAppNotification.find(idFilter).sort({ createdAt: -1 }).limit(50).lean(),
      InAppNotification.countDocuments({ ...idFilter, read: false }),
    ])) as [Record<string, unknown>[], number];
  } catch {
    /* صبّ فاسد (بناء قديم) — قائمة فارغة بدل 500 */
    return NextResponse.json({ notifications: [], unread: 0 });
  }

  /* v2.11.0: تعقيم الإشعارات القديمة المحفوظة قبل إصلاح «عبارة name» —
     بعض الإشعارات المخزنة سابقاً كانت تحوي متغيرات قالب غير مُملوءة
     مثل {name}؛ تُستبدل هنا بشرطة «—» كي لا تصل للمستخدم كما هي */
  const clean = (s: string) => String(s || "").replace(/\{(name|excerpt|reason|when|text)\}/g, "—");

  return NextResponse.json({
    notifications: items.map((n) => ({
      id: String(n._id),
      key: n.key ?? null,
      title: clean(String(n.title ?? "")),
      body: clean(String(n.body ?? "")),
      /* v1.6.0: متغيرات القالب تُعاد للعميل كي يُعيد توليد النص بلغة
         واجهته الحالية من src/lib/notif-texts — الإشعارات تُترجم للغات الست */
      vars: (n as { vars?: Record<string, string> | null }).vars || null,
      url: n.url || "/",
      read: !!n.read,
      createdAt: n.createdAt,
    })),
    unread,
  });
}

/* v1.20.0: فلتر موحّد للقراءة/المسح — يتوافق مع userId مخزّناً نصاً أو
   ObjectId (بيانات قديمة)، ويطابق معرّف الإشعار إن حُدّد */
function readFilter(userId: string, id: string | null): Record<string, unknown> {
  const userMatch = /^[a-f0-9]{24}$/i.test(userId)
    ? { userId: { $in: [userId, new mongoose.Types.ObjectId(userId)] } }
    : { userId };
  return id ? { ...userMatch, _id: id } : userMatch;
}

async function POST_impl(req: NextRequest) {
  const body = await req.json();
  const { action, userId, id } = body;
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  await connectDB();

  if (action === "read") {
    if (id) {
      await InAppNotification.updateOne(readFilter(userId, id), { $set: { read: true } });
    } else {
      await InAppNotification.updateMany(readFilter(userId, null), { $set: { read: true } });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "clear") {
    await InAppNotification.deleteMany(readFilter(userId, null));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export const GET = apiHandler(GET_impl);
export const POST = apiHandler(POST_impl);
