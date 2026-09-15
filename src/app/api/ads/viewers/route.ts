import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Clinic, ClinicAd, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/* ═ v1.20.0 — قائمة من شاهدوا الإعلان (لصاحبة العيادة حصراً) ═
   GET /api/ads/viewers?id={adId}&userId={حساب العيادة}
   يُتحقق من ملكية الإعلان ثم تُحلّ هويات المشاهدين المسجّلين إلى أسماء
   حساباتهم، مع عدد الزيارات العابرة غير المسجّلة (views - viewers). */

async function GET_impl(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = String(searchParams.get("id") || "");
  const userId = String(searchParams.get("userId") || "");
  if (!/^[a-f0-9]{24}$/i.test(id) || !/^[a-f0-9]{24}$/i.test(userId)) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  await connectDB();

  const user = (await User.findById(userId).select("role suspended").lean()) as { role?: string; suspended?: boolean } | null;
  if (!user || user.suspended || user.role !== "CLINIC") {
    return NextResponse.json({ error: "INVALID" }, { status: 401 });
  }
  const clinic = (await Clinic.findOne({ ownerUserId: userId }).select("_id").lean()) as { _id?: unknown } | null;
  if (!clinic) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const ad = (await ClinicAd.findById(id).select("clinicId viewers views title").lean()) as unknown as {
    clinicId?: unknown;
    viewers?: unknown[];
    views?: number;
    title?: string;
  } | null;
  if (!ad || String(ad.clinicId as { toString(): string }) !== String(clinic._id)) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const ids = (ad.viewers || []).map((v) => String(v)).slice(0, 500);
  const users = ids.length
    ? ((await User.find({ _id: { $in: ids } }).select("pseudonym fullName").lean()) as Record<string, unknown>[])
    : [];
  const byId = new Map(users.map((u) => [String(u._id), u]));
  const viewers = ids.map((uid) => {
    const u = byId.get(uid) || {};
    const name = String(u.pseudonym || u.fullName || "").trim();
    return { id: uid, name: (name || "—").slice(0, 60) };
  });
  const views = Number(ad.views) || 0;

  return NextResponse.json({
    title: String(ad.title || ""),
    views,
    viewersCount: viewers.length,
    anonymous: Math.max(0, views - viewers.length),
    viewers,
  });
}

export const GET = apiHandler(GET_impl);
