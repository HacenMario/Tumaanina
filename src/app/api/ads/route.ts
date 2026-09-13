import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Clinic, ClinicAd, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/* ═ v1.14.0 — إعلانات العيادات ═
   GET  /api/ads                      → الإعلانات المنشورة (APPROVED) للجميع
   GET  /api/ads?userId={عيادة}       → + إعلانات عيادتي بكل حالاتها (للوحة)
   POST /api/ads {action:"create"}    → العيادة تصيغ إعلاناً (PENDING)
   POST /api/ads {action:"delete"}    → العيادة تحذف إعلاناً لها
   الإعلان لا يظهر للجمهور إلا بعد أن يؤكد الأدمين نشره بعد التواصل مع
   العيادة والتأكد من سداد مستحقات الإعلان (approve من /api/ads/admin). */

const MAX_IMAGE_B64 = 4_500_000;
const MAX_ADS_PER_CLINIC = 10;

async function GET_impl(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  await connectDB();

  /* لوحة العيادة: إعلاناتها بكل الحالات + أسماؤها */
  if (userId) {
    const user = await User.findById(userId).select("role").lean();
    if (!user || (user as { role?: string }).role !== "CLINIC") {
      return NextResponse.json({ error: "INVALID" }, { status: 401 });
    }
    const clinic = (await Clinic.findOne({ ownerUserId: userId }).select("_id name slug").lean()) as Record<string, unknown> | null;
    if (!clinic) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const rows = await ClinicAd.find({ clinicId: clinic._id }).sort({ createdAt: -1 }).limit(50).lean();
    return NextResponse.json({
      clinicName: (clinic.name as string) || "—",
      ads: rows.map((r) => {
        const rec = r as Record<string, unknown>;
        return {
          id: String(rec._id),
          title: (rec.title as string) || "",
          body: (rec.body as string) || "",
          hasImage: !!rec.image,
          imageUrl: rec.image ? `/api/ads/${String(rec._id)}/image` : null,
          status: rec.status,
          adminNote: (rec.adminNote as string) || null,
          paymentNote: (rec.paymentNote as string) || null,
          reviewedAt: rec.reviewedAt ?? null,
          createdAt: rec.createdAt,
        };
      }),
    });
  }

  /* الجمهور: المنشورة فقط — مع بيانات العيادة للربط بصفحتها */
  const rows = await ClinicAd.find({ status: "APPROVED" }).sort({ reviewedAt: -1, createdAt: -1 }).limit(60).lean();
  const clinicIds = Array.from(new Set(rows.map((r) => String((r as unknown as { clinicId: { toString(): string } }).clinicId))));
  const clinics = clinicIds.length
    ? await Clinic.find({ _id: { $in: clinicIds } }).select("name slug wilaya city address phones whatsapp website logo").lean()
    : [];
  const byId = new Map(clinics.map((c) => [String((c as unknown as { _id: unknown })._id), c as Record<string, unknown>]));

  return NextResponse.json({
    ads: rows
      .map((r) => {
        const rec = r as Record<string, unknown>;
        const cid = String((rec.clinicId as { toString(): string }).toString());
        const c = byId.get(cid) || {};
        return {
          id: String(rec._id),
          title: (rec.title as string) || "",
          body: (rec.body as string) || "",
          imageUrl: rec.image ? `/api/ads/${String(rec._id)}/image` : null,
          publishedAt: (rec.reviewedAt as string) || (rec.createdAt as string),
          clinic: {
            id: cid,
            name: (c.name as string) || "—",
            slug: (c.slug as string) || null,
            wilaya: (c.wilaya as string) || null,
            city: (c.city as string) || null,
            address: (c.address as string) || null,
            phone: ((c.phones as string[]) || [])[0] || null,
            whatsapp: (c.whatsapp as string) || null,
            website: (c.website as string) || null,
            logoUrl: `/api/clinics/${cid}/logo?v=${c.updatedAt ? new Date(c.updatedAt as string).getTime() : 0}`,
          },
        };
      })
      .filter((a) => a.clinic.slug),
  });
}

async function POST_impl(req: NextRequest) {
  const body = await req.json();
  const { action, userId } = body as { action?: string; userId?: string };
  await connectDB();

  if (action === "create") {
    const user = await User.findById(userId).select("role suspended").lean();
    if (!user || (user as { role?: string }).role !== "CLINIC" || (user as { suspended?: boolean }).suspended) {
      return NextResponse.json({ error: "INVALID" }, { status: 401 });
    }
    const clinic = (await Clinic.findOne({ ownerUserId: userId }).select("_id isActive").lean()) as Record<string, unknown> | null;
    if (!clinic || clinic.isActive === false) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const title = String(body.title || "").trim().slice(0, 120);
    const adBody = String(body.body || "").trim().slice(0, 1200);
    if (!title || !adBody) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
    const image = typeof body.image === "string" && body.image ? body.image : null;
    if (image && (image.length > MAX_IMAGE_B64 || !image.startsWith("data:image/"))) {
      return NextResponse.json({ error: "INVALID_IMAGE" }, { status: 400 });
    }
    /* حد واقعي يمنع إغراق لوحة المراجعة */
    const count = await ClinicAd.countDocuments({ clinicId: clinic._id });
    if (count >= MAX_ADS_PER_CLINIC) {
      return NextResponse.json({ error: "ADS_LIMIT" }, { status: 409 });
    }
    await ClinicAd.create({ clinicId: clinic._id, title, body: adBody, image, status: "PENDING" });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete") {
    const user = await User.findById(userId).select("role").lean();
    if (!user || (user as { role?: string }).role !== "CLINIC") {
      return NextResponse.json({ error: "INVALID" }, { status: 401 });
    }
    const clinic = await Clinic.findOne({ ownerUserId: userId }).select("_id").lean();
    if (!clinic) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const res = await ClinicAd.deleteOne({ _id: body.id, clinicId: clinic._id });
    if (!res.deletedCount) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export const POST = apiHandler(POST_impl);
export const GET = apiHandler(GET_impl);
