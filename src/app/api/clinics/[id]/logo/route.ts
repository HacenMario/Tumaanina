import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Clinic, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/* ═ v1.14.0 — شعار العيادة (مسار مستقل مخبّأ) ═
   نفس منهج صور الأخصائيين: الصور الضخمة لا تُحمَّل داخل JSON القوائم،
   بل من هذا المسار مع تخزين مؤقت للمتصفح (Cache-Control) — سرعة الدليل. */

async function GET_impl(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await connectDB();

  if (!/^[a-f0-9]{24}$/i.test(String(id || ""))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const clinic = (await Clinic.findById(id).select("logo isActive ownerUserId").lean()) as { logo?: string | null; isActive?: boolean; ownerUserId?: unknown } | null;
  if (!clinic || !clinic.logo || clinic.isActive === false) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const owner = (await User.findById((clinic as unknown as { ownerUserId?: unknown }).ownerUserId).select("suspended").lean()) as { suspended?: boolean } | null;
  if (owner?.suspended) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const match = String(clinic.logo).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
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
