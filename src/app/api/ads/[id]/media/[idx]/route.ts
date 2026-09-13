import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { ClinicAd } from "@/lib/models";

export const dynamic = "force-dynamic";

/* ═ v1.15.0 — تقديم وسائط الإعلان (صور/فيديو) ═
   GET /api/ads/{id}/media/{idx} — الوسيط رقم idx من وثيقة الإعلان
   (تدعم الفيديو طلبات Range للتمرير داخل المشغّل).
   v1.15.1: يُقدَّم الوسيط لكل حالات الإعلان (بانتظار/مرفوض/منشور) —
   كي ترى العيادة صاحبة الإعلان صور إعلانها في بطاقة «إعلاناتي» فور
   صياغته، ويراها الأدمين في لوحة المراجعة قبل الاعتماد. معرّف الإعلان
   ObjectId غير قابل للتخمين، ولا يُدرج الإعلان غير المنشور في أي قائمة
   عمومية — فلا تسريب عملي. */

function contentTypeOf(dataUrl: string): string {
  const m = /^data:([^;,]+)[;,]/.exec(dataUrl);
  return m ? m[1] : "application/octet-stream";
}

async function GET_impl(req: NextRequest, ctx: { params: Promise<{ id: string; idx: string }> }) {
  const { id, idx } = await ctx.params;
  const i = Number(idx);
  if (!/^[a-f0-9]{24}$/i.test(String(id || "")) || !Number.isInteger(i) || i < 0 || i > 5) {
    return new NextResponse("Not found", { status: 404 });
  }
  await connectDB();

  const ad = (await ClinicAd.findById(id).select("media image").lean()) as
    | { media?: string[]; image?: string | null }
    | null;
  if (!ad) {
    return new NextResponse("Not found", { status: 404 });
  }

  const media = (ad.media && ad.media.length ? ad.media : ad.image ? [ad.image] : []) as string[];
  const item = media[i];
  if (!item || !item.startsWith("data:")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const base64 = item.slice(item.indexOf(",") + 1);
  const buf = Buffer.from(base64, "base64");
  const type = contentTypeOf(item);

  /* دعم Range لفيديو الإعلان (تمرير المشغّل) */
  const range = req.headers.get("range");
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      const start = m[1] ? Number(m[1]) : 0;
      const end = m[2] ? Math.min(Number(m[2]), buf.length - 1) : buf.length - 1;
      if (start <= end && start < buf.length) {
        const chunk = buf.subarray(start, end + 1);
        return new NextResponse(new Uint8Array(chunk), {
          status: 206,
          headers: {
            "Content-Type": type,
            "Content-Length": String(chunk.length),
            "Content-Range": `bytes ${start}-${end}/${buf.length}`,
            "Accept-Ranges": "bytes",
            "Cache-Control": "private, max-age=86400",
          },
        });
      }
    }
  }

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": type,
      "Content-Length": String(buf.length),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=86400",
    },
  });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string; idx: string }> }) {
  return GET_impl(_req, ctx);
}
