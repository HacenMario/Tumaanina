import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Clinic } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/* ═ v1.15.0 — معرض صور العيادة (يُجلب عند الطلب) ═
   GET /api/clinics/{id}/gallery — صور معرض العيادة (id أو slug).
   تُجلب عند فتح نافذة المعرض فقط كي لا تُثقل ملف العيادة. */

async function GET_impl(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await connectDB();

  const key = String(id || "").trim();
  if (!key) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isObjectId = /^[a-f0-9]{24}$/i.test(key);
  const clinic = (await Clinic.findOne(isObjectId ? { _id: key } : { slug: key }).select("gallery isActive").lean()) as
    | { gallery?: string[]; isActive?: boolean }
    | null;
  if (!clinic || clinic.isActive === false) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ images: clinic.gallery || [] });
}

export const GET = apiHandler(GET_impl);
