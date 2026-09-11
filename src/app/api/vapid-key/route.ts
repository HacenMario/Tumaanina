import { NextResponse } from "next/server";
import { ensurePushConfigured } from "@/lib/server/push";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/**
 * المفتاح العام VAPID للاشتراك في الإشعارات.
 * ⚠️ يجب استدعاء ensurePushConfigured() أولاً — فهي التي تحمّل/تولّد المفاتيح
 * (env → ملف data/vapid.json → توليد جديد محفوظ). بدونها يفشل أول تفعيل
 * للمستخدم لأن المفاتيح غير موجودة في process.env بعد.
 */
async function GET_impl() {
  if (!ensurePushConfigured()) {
    return NextResponse.json({ error: "VAPID keys not configured" }, { status: 500 });
  }
  /* no-store: لا يُسمح أبداً بأي ذاكرة مؤقتة للمفتاح — مفتاح قديم مخبأ
     يولّد اشتراكات غير صالحة مع الخادم الحالي */
  return NextResponse.json(
    { publicKey: process.env.VAPID_PUBLIC_KEY },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export const GET = apiHandler(GET_impl);
