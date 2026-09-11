import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { CounselorProfile } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/* ─── تقديم الصورة الشخصية كصورة حقيقية مع تخزين مؤقت ───
   v2.5.3: كانت الصور تُنقل base64 داخل JSON قائمة الأخصائيين
   (حتى 1.5MB لكل أخصائي!) فيتباطأ دليل الأخصائيين كثيراً.
   الآن: القائمة تحمل photoUrl فقط، والصورة تُحمَّل من هنا.
   v1.3.0 إصلاح «الصورة تحفظ ولا تظهر»: تخزين يوم واحد فقط +
   إعادة تحقق يومية، ورفض 404 بلا أي تخزين — مع معامل ?v= في
   الواجهات يكسر الذاكرة فور تغيير الصورة (كانت أسبوعاً كاملاً!). */
async function GET_impl(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await connectDB();

  const profile = (await CounselorProfile.findById(id)
    .select("photo updatedAt")
    .lean()) as { photo?: string | null; updatedAt?: Date | string | null } | null;
  const photo = profile?.photo || null;

  if (!photo || !photo.startsWith("data:image/")) {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }

  const match = photo.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }

  /* ETag مشتق من وقت آخر تحديث للملف — تغيير الصورة يغيّر الـ ETag فوراً */
  const etag = `"${new Date(profile?.updatedAt as string).getTime() || 0}-${id}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  const buf = Buffer.from(match[2], "base64");
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": match[1],
      /* يوم واحد + إعادة تحقق خلفية — الجديدة تظهر خلال لحظات مع ?v= */
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
      ETag: etag,
      "Content-Length": String(buf.length),
    },
  });
}

export const GET = apiHandler(GET_impl);
