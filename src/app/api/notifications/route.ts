import { NextRequest, NextResponse } from "next/server";
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
  void User.updateOne({ _id: userId }, { $set: { lastSeenAt: new Date() } })
    .catch(() => {})
    .then(() => undefined);

  const [items, unread] = await Promise.all([
    InAppNotification.find({ userId }).sort({ createdAt: -1 }).limit(50).lean(),
    InAppNotification.countDocuments({ userId, read: false }),
  ]);

  /* v2.11.0: تعقيم الإشعارات القديمة المحفوظة قبل إصلاح «عبارة name» —
     بعض الإشعارات المخزنة سابقاً كانت تحوي متغيرات قالب غير مُملوءة
     مثل {name}؛ تُستبدل هنا بشرطة «—» كي لا تصل للمستخدم كما هي */
  const clean = (s: string) => String(s || "").replace(/\{(name|excerpt|reason|when|text)\}/g, "—");

  return NextResponse.json({
    notifications: items.map((n) => ({
      id: String(n._id),
      key: n.key ?? null,
      title: clean(n.title),
      body: clean(n.body),
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

async function POST_impl(req: NextRequest) {
  const body = await req.json();
  const { action, userId, id } = body;
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  await connectDB();

  if (action === "read") {
    if (id) {
      await InAppNotification.updateOne({ _id: id, userId }, { $set: { read: true } });
    } else {
      await InAppNotification.updateMany({ userId, read: false }, { $set: { read: true } });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "clear") {
    await InAppNotification.deleteMany({ userId });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export const GET = apiHandler(GET_impl);
export const POST = apiHandler(POST_impl);
