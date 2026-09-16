import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/**
 * v1.6.0 — مزامنة لغة واجهة المستخدم مع حسابه في قاعدة البيانات.
 * ─────────────────────────────────────────────────────────────
 * طلب المستخدم: «الإشعارات لا تترجم للغات الأخرى». كان `User.language`
 * يُضبط عند التسجيل فقط ولا يتغير مع تبديل لغة الواجهة، فتبقى الإشعارات
 * الفورية (Push) تُرسل بلغة التسجيل القديمة. الآن كل تبديل للغة من
 * مبدّل الهيدر يُحدّث الحساب فوراً — فتُرسل الإشعارات القادمة بلغته
 * الحالية فعلاً. (الإشعارات الداخلية في الجرس تُعاد ترجمتها عند العرض
 * من src/lib/notif-texts بغضّ النظر عن هذه اللغة.)
 */
async function POST_impl(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const userId = typeof body.userId === "string" ? body.userId : "";
  const language = typeof body.language === "string" ? body.language : "";
  if (!userId || !["ar", "fr", "en", "tr", "ru", "zh", "es", "de", "it"].includes(language)) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  await connectDB();
  await User.updateOne({ _id: userId }, { $set: { language } });
  return NextResponse.json({ ok: true });
}

export const POST = apiHandler(POST_impl);
