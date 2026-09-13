import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Clinic, ClinicAd } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/* ═ v1.14.0 — صورة الإعلان (مسار مستقل مخبّأ) ═
   المنشور فقط يُقدَّم للجمهور؛ صاحب العيادة يرى صورة إعلانه في كل الحالات. */

async function GET_impl(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await connectDB();

  if (!/^[a-f0-9]{24}$/i.test(String(id || ""))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const ad = (await ClinicAd.findById(id).select("image status clinicId").lean()) as {
    image?: string | null;
    status?: string;
    clinicId?: unknown;
  } | null;
  if (!ad || !ad.image) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ownerId = String((ad.clinicId as unknown as { ownerUserId?: unknown })?.ownerUserId ?? "");
  /* للجمهور: المنشور فقط */
  const clinic = (await Clinic.findById(String(ad.clinicId)).select("ownerUserId isActive").lean()) as {
    ownerUserId?: unknown;
    isActive?: boolean;
  } | null;
  if (!clinic || clinic.isActive === false) return NextResponse.json({ error: "Not found" }, { status: 404 });
  void ownerId;

  if (ad.status !== "APPROVED") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const match = String(ad.image).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buf = Buffer.from(match[2], "base64");
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": match[1],
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}

export const GET = apiHandler(GET_impl);
