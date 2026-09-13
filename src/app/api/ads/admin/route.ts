import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Clinic, ClinicAd } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";
import { adminGuard } from "@/lib/server/admin-auth";
import { notifyUser } from "@/lib/server/notify";

export const dynamic = "force-dynamic";

/* ═ v1.14.0 — إدارة إعلانات العيادات (الإدارة حصراً) ═
   POST /api/ads/admin  (ترويسة x-admin-token إلزامية)
     {action:"ads-list", status?}             → آخر الإعلانات بحالة/كل الحالات
     {action:"ads-approve", id, paymentNote?} → نشر بعد التأكد من السداد
     {action:"ads-reject",  id, adminNote?}   → رفض بسبب يصل للعيادة
     {action:"ads-delete",  id}               → حذف نهائي
   المنطق الواقعي: قبل الموافقة يظهر للأدمين كامل بيانات تواصل العيادة
   (هاتف/واتساب/بريد) ليتواصل معها ويؤكد سداد مستحقات النشر — مرجع
   السداد يُسجَّل مع الموافقة كأثر محاسبي. الموافقة/الرفض يصلان إشعاراً
   فورياً لصاحب العيادة. */

const LEVEL: Record<string, 1 | 2> = {
  "ads-list": 1,
  "ads-approve": 2,
  "ads-reject": 2,
  "ads-delete": 2,
};

async function POST_impl(req: NextRequest) {
  const body = await req.json();
  const action = String(body.action || "");
  const guard = await adminGuard(req, action);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  if (!(action in LEVEL)) return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  await connectDB();

  if (action === "ads-list") {
    const status = ["PENDING", "APPROVED", "REJECTED"].includes(String(body.status)) ? String(body.status) : null;
    const query: Record<string, unknown> = status ? { status } : {};
    const rows = await ClinicAd.find(query).sort({ createdAt: -1 }).limit(120).lean();
    const clinicIds = Array.from(new Set(rows.map((r) => String((r as unknown as { clinicId: { toString(): string } }).clinicId))));
    const clinics = clinicIds.length
      ? await Clinic.find({ _id: { $in: clinicIds } }).select("name slug wilaya city address phones whatsapp contactEmail isActive").lean()
      : [];
    const byId = new Map(clinics.map((c) => [String((c as unknown as { _id: unknown })._id), c as Record<string, unknown>]));
    return NextResponse.json({
      ads: rows.map((r) => {
        const rec = r as Record<string, unknown>;
        const cid = String((rec.clinicId as { toString(): string }).toString());
        const c = byId.get(cid) || {};
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
          reviewedBy: (rec.reviewedBy as string) || null,
          createdAt: rec.createdAt,
          clinic: {
            id: cid,
            name: (c.name as string) || "—",
            slug: (c.slug as string) || null,
            wilaya: (c.wilaya as string) || null,
            city: (c.city as string) || null,
            address: (c.address as string) || null,
            phones: (c.phones as string[]) || [],
            whatsapp: (c.whatsapp as string) || null,
            contactEmail: (c.contactEmail as string) || null,
            isActive: c.isActive !== false,
          },
        };
      }),
    });
  }

  const ad = (await ClinicAd.findById(body.id).lean()) as Record<string, unknown> | null;
  if (!ad) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const clinic = (await Clinic.findById(String(ad.clinicId as { toString(): string })).select("ownerUserId name").lean()) as Record<string, unknown> | null;

  if (action === "ads-approve") {
    if (ad.status === "APPROVED") return NextResponse.json({ error: "BAD_STATE" }, { status: 409 });
    await ClinicAd.updateOne(
      { _id: body.id },
      {
        $set: {
          status: "APPROVED",
          paymentNote: (body.paymentNote || "").trim().slice(0, 200) || null,
          reviewedBy: guard.auth.staffRole,
          reviewedAt: new Date(),
          adminNote: null,
        },
      }
    );
    if (clinic) {
      void notifyUser(String(clinic.ownerUserId), "clinicAdApproved", "/?view=ads", {
        title: String(ad.title || "").slice(0, 80),
      }).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "ads-reject") {
    if (ad.status === "REJECTED") return NextResponse.json({ error: "BAD_STATE" }, { status: 409 });
    await ClinicAd.updateOne(
      { _id: body.id },
      {
        $set: {
          status: "REJECTED",
          adminNote: (body.adminNote || "").trim().slice(0, 400) || null,
          reviewedBy: guard.auth.staffRole,
          reviewedAt: new Date(),
        },
      }
    );
    if (clinic) {
      void notifyUser(String(clinic.ownerUserId), "clinicAdRejected", "/?view=clinic-dashboard", {
        title: String(ad.title || "").slice(0, 80),
        reason: (body.adminNote || "").trim().slice(0, 200) || "—",
      }).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  }

  /* ads-delete */
  await ClinicAd.deleteOne({ _id: body.id });
  return NextResponse.json({ ok: true });
}

export const POST = apiHandler(POST_impl);
