import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Clinic, ClinicGalleryMedia } from "@/lib/models";
import { loadClinicGalleryVideos } from "@/lib/server/media";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/* ═ v1.15.0 — معرض صور العيادة (يُجلب عند الطلب) ═
   GET /api/clinics/{id}/gallery — صور معرض العيادة (id أو slug).
   تُجلب عند فتح نافذة المعرض فقط كي لا تُثقل ملف العيادة.
   v1.17.0: تعيد أيضاً فيديوهات المعرض كروابط تقديم آمنة (بلا base64). */

async function GET_impl(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await connectDB();

  const key = String(id || "").trim();
  if (!key) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isObjectId = /^[a-f0-9]{24}$/i.test(key);
  const clinic = (await Clinic.findOne(isObjectId ? { _id: key } : { slug: key }).select("_id gallery galleryVideoRefs isActive").lean()) as
    | { _id?: unknown; gallery?: string[]; galleryVideoRefs?: string[]; isActive?: boolean }
    | null;
  if (!clinic || clinic.isActive === false) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  /* v1.18.0: فيديوهات المعرض — القائمة الموحّدة (قديم + GridFS بلا حد حجم) */
  const cid = String(clinic._id);
  const videos = await loadClinicGalleryVideos(ClinicGalleryMedia, cid, clinic.galleryVideoRefs);

  return NextResponse.json({ images: clinic.gallery || [], videos });
}

export const GET = apiHandler(GET_impl);
