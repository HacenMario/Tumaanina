import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Clinic, ClinicGalleryMedia } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/* ═ v1.17.0 — تقديم فيديوهات معرض العيادة ═
   GET /api/clinics/{id}/gallery/media/{idx} — الفيديو رقم idx من مجموعة
   clinic_gallery_media المستقلة (تدعم طلبات Range لتمرير المشغّل المدمج
   في متصفح الجهاز). الفيديو يُقدَّم لمعاينة نشطة فقط (عيادة غير معطّلة). */

async function GET_impl(req: NextRequest, ctx: { params: Promise<{ id: string; idx: string }> }) {
  const { id, idx } = await ctx.params;
  const i = Number(idx);
  if (!/^[a-f0-9]{24}$/i.test(String(id || "")) || !Number.isInteger(i) || i < 0 || i > 1) {
    return new NextResponse("Not found", { status: 404 });
  }
  await connectDB();

  const clinic = (await Clinic.findById(id).select("isActive").lean()) as { isActive?: boolean } | null;
  if (!clinic || clinic.isActive === false) {
    return new NextResponse("Not found", { status: 404 });
  }

  const rows = (await ClinicGalleryMedia.find({ clinicId: id }).sort({ createdAt: 1, _id: 1 }).lean()) as {
    mime?: string;
    data?: string;
  }[];
  const item = rows[i];
  if (!item?.data) return new NextResponse("Not found", { status: 404 });

  const buf = Buffer.from(item.data, "base64");
  const type = item.mime || "video/mp4";

  /* دعم Range لتمرير الفيديو داخل المشغّل */
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
            "Cache-Control": "private, max-age=3600",
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
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export const GET = apiHandler(GET_impl);
