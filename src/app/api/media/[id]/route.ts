import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { Readable } from "stream";
import { connectDB } from "@/lib/db";
import { gridfsFileInfo, mediaBucket } from "@/lib/server/media";

export const dynamic = "force-dynamic";

/* ═ v1.18.0 — تقديم وسائط GridFS (الفيديو الكبير) ببثّ يدعم Range ═
   GET /api/media/{fileId} — ملف فيديو رُفع عبر /api/media (إعلان أو معرض).
   المشغّل المدمج في المتصفح يطلب Range فتُقدَّم المقطوعة المطلوبة (206)
   ليعمل التمرير داخل الفيديو بسلاسة على الهاتف والحاسوب.
   الوصول عمومي مقصود: هذه وسائط محتوى منشور للجمهور (نمط نفسه لمسار
   وسائط الإعلانات) — لا تحمل أي بيانات حساسة. */

async function GET_impl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[a-f0-9]{24}$/i.test(String(id || ""))) {
    return new NextResponse("Not found", { status: 404 });
  }
  await connectDB();
  const info = await gridfsFileInfo(id);
  if (!info) return new NextResponse("Not found", { status: 404 });

  const type = info.contentType || "application/octet-stream";
  const total = info.length;
  const range = req.headers.get("range");

  const baseHeaders: Record<string, string> = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=3600",
  };

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      let start = m[1] ? Number(m[1]) : 0;
      let end = m[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
      if (start > end || start >= total) {
        return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
      }
      if (start < 0) start = 0;
      if (end >= total) end = total - 1;
      const bucket = mediaBucket();
      const stream = bucket.openDownloadStream(new mongoose.Types.ObjectId(id), { start, end: end + 1 });
      return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${total}`,
        },
      });
    }
  }

  const bucket = mediaBucket();
  const stream = bucket.openDownloadStream(new mongoose.Types.ObjectId(id));
  return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(total) },
  });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return GET_impl(req, ctx);
}
