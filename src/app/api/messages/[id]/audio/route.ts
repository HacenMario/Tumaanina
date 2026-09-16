import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Message, SupportSession, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/**
 * v1.21.1 — جلب بيانات الرسالة الصوتية عند الطلب الفعلي للتشغيل.
 * ─────────────────────────────────────────────────────────────
 * قوائم الاستقصاء لا تحمل بيانات الصوت الثقيلة — فقاعة المشغّل تستدعي
 * هذا المسار مرة واحدة عند أول ضغطة تشغيل.
 *
 * وضعان:
 *  • الافتراضي (JSON) — يعيد data URL كاملاً (توافق خلفي مع النسخ القديمة)
 *  • mode=raw — بثّ ثنائي مباشر (audio/webm...) بدل JSON ضخم:
 *      أخف من base64 بأكثر من 25%، يدعم Range للتقديم، ويستفيد من كاش
 *      المتصفح (immutable) — أوثق بكثير على الشبكات الضعيفة.
 *
 * الرسائل القديمة التالفة (حقبة v1.5.0: قُطع محتواها إلى 4000 حرف بخطأ
 * قديم شُرح في سجل الإصلاح v1.6.0) تُكتشف تلقائياً وتُجاب بـ 410
 * LEGACY_BROKEN كي تعرض الواجهة رسالة واضحة بدل خطأ تشغيل غامض.
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
  const raw = searchParams.get("mode") === "raw";

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

  /* v1.21.1: رسائل حقبة v1.5.0 المقصوصة إلى 4000 حرف — تالفة بنيوياً
     (slice(0,4000) كان يقطع data URL الصوتي) — نُبلّغ بوضوح بدل ملف صوتي مكسور */
  if (m.content.length === 4000) {
    return NextResponse.json({ error: "LEGACY_BROKEN" }, { status: 410 });
  }

  if (raw) {
    const commaIdx = m.content.indexOf(",");
    if (!m.content.startsWith("data:audio/") || commaIdx < 0) {
      return NextResponse.json({ error: "LEGACY_BROKEN" }, { status: 410 });
    }
    const meta = m.content.slice(5, commaIdx); /* audio/webm;codecs=opus;base64 */
    const isB64 = meta.endsWith(";base64");
    const mimeRaw = (isB64 ? meta.slice(0, -7) : meta).trim() || "audio/webm";
    /* ترميز آمن للترويسة — نسمح بأنواع الصوت فقط */
    const mime = /^audio\/[\w.+-]+(;\s*[\w-]+=[\w.+-]+)*$/.test(mimeRaw) ? mimeRaw : "audio/webm";
    const bytes = Buffer.from(m.content.slice(commaIdx + 1), isB64 ? "base64" : "utf8");
    if (bytes.length === 0) {
      return NextResponse.json({ error: "LEGACY_BROKEN" }, { status: 410 });
    }

    const baseHeaders: Record<string, string> = {
      "Content-Type": mime,
      "Accept-Ranges": "bytes",
      /* المحتوى لا يتغير أبداً لمعرّف رسالة ثابت — كاش آمن لليوم كامل */
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
    };

    /* دعم Range — تقديم/ترجيع فعّال حتى مع ملفات webm بلا مدة مضمّنة */
    const rangeHdr = req.headers.get("range");
    if (rangeHdr) {
      const mt = /^bytes=(\d*)-(\d*)$/.exec(rangeHdr.trim());
      if (mt) {
        let start = mt[1] === "" ? null : Number.parseInt(mt[1], 10);
        let end = mt[2] === "" ? null : Number.parseInt(mt[2], 10);
        if (start === null && end !== null) {
          start = Math.max(0, bytes.length - end);
          end = bytes.length - 1;
        }
        if (start === null) start = 0;
        if (end === null || end >= bytes.length) end = bytes.length - 1;
        if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= bytes.length) {
          return new NextResponse(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${bytes.length}` },
          });
        }
        const slice = bytes.subarray(start, end + 1);
        return new NextResponse(slice, {
          status: 206,
          headers: {
            ...baseHeaders,
            "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
            "Content-Length": String(slice.length),
          },
        });
      }
    }

    return new NextResponse(bytes, {
      status: 200,
      headers: { ...baseHeaders, "Content-Length": String(bytes.length) },
    });
  }

  return NextResponse.json({
    ok: true,
    content: m.content,
    seconds: Number(m.seconds) || 0,
  });
}

export const GET = apiHandler(GET_impl);
