import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { PushSubscription } from "@/lib/models";
import { sendPushToUser, ensurePushConfigured } from "@/lib/server/push";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/* no-store: اشتراكات الإشعارات لا تخزن مؤقتاً إطلاقاً */
const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

interface Body {
  action: "subscribe" | "resubscribe" | "test" | "notify";
  userId?: string;
  role?: string;
  subscription?: { endpoint: string; keys: { p256dh: string; auth: string } };
  oldEndpoint?: string;
  title?: string;
  body?: string;
  url?: string;
}

async function POST_impl(req: NextRequest) {
  const data = (await req.json()) as Body;
  await connectDB();

  if (data.action === "subscribe") {
    const { userId, role, subscription } = data;
    if (!userId || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: "Missing subscription data" }, { status: 400 });
    }
    await PushSubscription.updateOne(
      { endpoint: subscription.endpoint },
      {
        $set: {
          userId,
          role: role || "VICTIM",
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      },
      { upsert: true }
    );
    return NextResponse.json({ ok: true, message: "Subscribed successfully" }, { headers: NO_STORE });
  }

  /* إعادة اشتراك تلقائية من Service Worker عند تدوير مفتاح Push:
     نجد المستخدم عبر نقطة نهاية الاشتراك القديم ونحدّث سجله */
  if (data.action === "resubscribe") {
    const { oldEndpoint, subscription } = data;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: "Missing subscription data" }, { status: 400 });
    }
    let userId = data.userId || null;
    let role = data.role || null;
    if (!userId && oldEndpoint) {
      const prev = (await PushSubscription.findOne({ endpoint: oldEndpoint }).lean()) as { userId?: unknown; role?: string } | null;
      if (prev) {
        userId = String(prev.userId);
        role = prev.role ?? null;
      }
    }
    if (!userId) {
      /* لا نعرف المستخدم — حذف القديم وتجاهل؛ سيعيد المستخدم التفعيل من الإعدادات */
      if (oldEndpoint) await PushSubscription.deleteMany({ endpoint: oldEndpoint });
      return NextResponse.json({ ok: false, message: "Unknown previous subscription" });
    }
    if (oldEndpoint && oldEndpoint !== subscription.endpoint) {
      await PushSubscription.deleteMany({ endpoint: oldEndpoint });
    }
    await PushSubscription.updateOne(
      { endpoint: subscription.endpoint },
      {
        $set: {
          userId,
          role: role || "VICTIM",
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      },
      { upsert: true }
    );
    return NextResponse.json({ ok: true, message: "Re-subscribed successfully" }, { headers: NO_STORE });
  }

  if (data.action === "test") {
    if (!data.userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
    if (!ensurePushConfigured()) {
      return NextResponse.json({ ok: false, error: "PUSH_NOT_CONFIGURED" }, { status: 200 });
    }
    const result = await sendPushToUser(
      data.userId,
      data.title || "مرحباً بك في طمأنينة 💜",
      data.body || "الإشعارات تعمل بنجاح — أنت في أيدٍ أمينة"
    );
    if (result.sent === 0) {
      /* 200 وليس 404: عدم وجود اشتراك حالة متوقعة (المستخدم لم يفعّل الإشعارات
         على هذا الجهاز) — نتجنب خطأ أحمر في كونسول المتصفح ونعالجه في الواجهة */
      return NextResponse.json({ ok: false, error: "NO_SUBSCRIPTION", sent: 0 }, { status: 200 });
    }
    /* نسخة داخلية في جرس الموقع للإشعار التجريبي */
    try {
      const { InAppNotification } = await import("@/lib/models");
      await InAppNotification.create({
        userId: data.userId,
        key: "test",
        title: data.title || "مرحباً بك في طمأنينة 💜",
        body: data.body || "الإشعارات تعمل بنجاح — أنت في أيدٍ أمينة",
        url: "/",
      });
    } catch {}
    return NextResponse.json({ ok: true, ...result });
  }

  if (data.action === "notify") {
    if (!data.userId || !data.title) {
      return NextResponse.json({ error: "userId and title required" }, { status: 400 });
    }
    const result = await sendPushToUser(data.userId, data.title, data.body || "", data.url || "/");
    return NextResponse.json({ ok: true, ...result });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export const POST = apiHandler(POST_impl);
