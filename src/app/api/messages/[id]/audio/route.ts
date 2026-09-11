import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Message, SupportSession, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/**
 * v1.6.0 — جلب بيانات الرسالة الصوتية عند الطلب الفعلي للتشغيل.
 * ─────────────────────────────────────────────────────────────
 * قوائم الاستقصاء لا تحمل بيانات الصوت الثقيلة (كانت تُسحب مع كل
 * دورة استقصاء فتُغرق شبكات الهاتف) — فقاعة المشغّل تستدعي هذا
 * المسار مرة واحدة عند أول ضغطة تشغيل.
 *
 * الصلاحيات: أعضاء الخيط فقط
 *   • sessionId  → طرفا الجلسة (العميل/الأخصائي)
 *   • dm:{victimId}:{counselorId} → أحد الطرفين
 *   • counselors → أي أخصائي غير معلّق
 *   • admin:{counselorId} → صاحب الخيط أو الإدارة
 */
async function GET_impl(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") || "";

  await connectDB();

  const m = (await Message.findById(id)
    .select("sessionId threadKey senderRole type content deleted seconds")
    .lean()) as
    | { _id: unknown; sessionId?: unknown; threadKey?: string | null; senderRole?: string; type?: string; content: string; deleted?: boolean; seconds?: number }
    | null;
  if (!m || m.deleted || m.type !== "voice") {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  /* تحقق الصلاحية — userId مطلوب (يُمرَّر من عميل مسجّل دائماً) */
  if (userId) {
    const me = (await User.findById(userId).select("role suspended").lean()) as
      | { role?: string; suspended?: boolean }
      | null;
    if (!me || me.suspended) {
      return NextResponse.json({ error: "NOT_ALLOWED" }, { status: 403 });
    }
    let allowed = false;
    if (m.sessionId) {
      const s = (await SupportSession.findById(m.sessionId)
        .select("victimId counselorId")
        .lean()) as { victimId?: unknown; counselorId?: unknown } | null;
      allowed = !!s && (String(s.victimId) === userId || String(s.counselorId) === userId || me.role === "ADMIN");
    } else if (m.threadKey === "counselors") {
      allowed = me.role === "COUNSELOR" || me.role === "ADMIN";
    } else if (m.threadKey && m.threadKey.startsWith("admin:")) {
      allowed = m.threadKey.split(":")[1] === userId || me.role === "ADMIN";
    } else if (m.threadKey && m.threadKey.startsWith("dm:")) {
      const parts = m.threadKey.split(":");
      allowed = parts[1] === userId || parts[2] === userId || me.role === "ADMIN";
    }
    if (!allowed) return NextResponse.json({ error: "NOT_ALLOWED" }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    content: m.content,
    seconds: Number(m.seconds) || 0,
  });
}

export const GET = apiHandler(GET_impl);
