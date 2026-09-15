import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Clinic, ClinicAd } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";
import { adminGuard } from "@/lib/server/admin-auth";
import { notifyUser } from "@/lib/server/notify";

export const dynamic = "force-dynamic";

/* ═ v1.15.0 — إدارة إعلانات العيادات (الإدارة حصراً) ═
   POST /api/ads/admin  (ترويسة x-admin-token إلزامية)
     {action:"ads-list", status?, page?}      → الإعلانات مرقّمة (12 لكل صفحة)
     {action:"ads-set-dues", id, amount}      → تحديد مبلغ المستحقات + إشعار فوري للعيادة
     {action:"ads-set-paid", id, paid, paymentNote?} → تحديد تم السداد/لم يتم
     {action:"ads-set-float", id, float, perUser?, days?} → تفعيل/إيقاف العرض العائم
     {action:"ads-approve", id, paymentNote?, float?, perUser?, days?} → نشر (يشترط سداد المستحقات إن حُدّد مبلغ لها) ويُحسب انتهاء الصلاحية
     {action:"ads-reject",  id, adminNote?}   → رفض بسبب يصل للعيادة
     {action:"ads-delete",  id}               → حذف نهائي
     {action:"ads-stats"}                     → إحصاءات مستحقات الإعلانات لكل عيادة
   السير الواقعي: العيادة تنشر إعلاناً → الأدمين يحدد المبلغ فيصلها
   إشعار فوري بالتواصل مع الإدارة والسداد → بعد تأكيد الدفع (paid)
   يوافق الأدمين على النشر، ويحدد إن كان الإعلان عائماً وكم مرة يظهر
   لكل مستخدم ومدة صلاحيته. */

const LEVEL: Record<string, 1 | 2> = {
  "ads-list": 1,
  "ads-set-dues": 2,
  "ads-set-paid": 2,
  "ads-set-float": 2,
  "ads-approve": 2,
  "ads-reject": 2,
  "ads-delete": 2,
  "ads-stats": 1,
};

const LIST_PAGE = 12;

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
    const page = Math.max(1, Number(body.page) || 1);
    const query: Record<string, unknown> = status ? { status } : {};
    const [rows, total] = await Promise.all([
      ClinicAd.find(query).sort({ createdAt: -1 }).skip((page - 1) * LIST_PAGE).limit(LIST_PAGE).lean(),
      ClinicAd.countDocuments(query),
    ]);
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
          mediaCount: (((rec.media as string[]) || []).length || (rec.image ? 1 : 0)),
          imageUrl: ((rec.media as string[]) || []).length || rec.image ? `/api/ads/${String(rec._id)}/media/0` : null,
          status: rec.status,
          adminNote: (rec.adminNote as string) || null,
          paymentNote: (rec.paymentNote as string) || null,
          /* المستحقات والعائم — الإدارة تراها كاملة */
          amountDue: Number(rec.amountDue) || 0,
          paid: rec.paid === true,
          paidAt: rec.paidAt ?? null,
          float: rec.float === true,
          floatPerUser: Number(rec.floatPerUser) || 3,
          floatDays: Number(rec.floatDays) || 7,
          expiresAt: rec.expiresAt ?? null,
          views: Number(rec.views) || 0,
          likesCount: ((rec.likes as string[]) || []).length,
          commentsCount: ((rec.comments as unknown[]) || []).length,
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
      total,
      page,
      pages: Math.max(1, Math.ceil(total / LIST_PAGE)),
    });
  }

  if (action === "ads-stats") {
    /* إحصاءات مستحقات الإعلانات لكل عيادة + الإجمالي */
    const ads = await ClinicAd.find({}).select("clinicId amountDue paid status").lean();
    const clinicIds = Array.from(new Set(ads.map((a) => String((a as unknown as { clinicId: { toString(): string } }).clinicId))));
    const clinics = clinicIds.length
      ? await Clinic.find({ _id: { $in: clinicIds } }).select("name slug").lean()
      : [];
    const byId = new Map(clinics.map((c) => [String((c as unknown as { _id: unknown })._id), c as Record<string, unknown>]));
    const rows = clinicIds.map((cid) => {
      const mine = ads.filter((a) => String((a as unknown as { clinicId: { toString(): string } }).clinicId) === cid);
      const dues = mine.reduce((s, a) => s + (Number((a as unknown as { amountDue?: number }).amountDue) || 0), 0);
      const paidSum = mine.filter((a) => (a as unknown as { paid?: boolean }).paid).reduce((s, a) => s + (Number((a as unknown as { amountDue?: number }).amountDue) || 0), 0);
      const c = byId.get(cid) || {};
      return {
        clinicId: cid,
        clinicName: (c.name as string) || "—",
        clinicSlug: (c.slug as string) || null,
        adsCount: mine.length,
        approvedCount: mine.filter((a) => (a as unknown as { status?: string }).status === "APPROVED").length,
        duesTotal: dues,
        duesPaid: paidSum,
        duesPending: dues - paidSum,
      };
    }).sort((a, b) => b.duesTotal - a.duesTotal);
    return NextResponse.json({
      rows,
      totals: {
        adsCount: ads.length,
        duesTotal: rows.reduce((s, r) => s + r.duesTotal, 0),
        duesPaid: rows.reduce((s, r) => s + r.duesPaid, 0),
        duesPending: rows.reduce((s, r) => s + r.duesPending, 0),
      },
    });
  }

  const ad = (await ClinicAd.findById(body.id).lean()) as Record<string, unknown> | null;
  if (!ad) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const clinic = (await Clinic.findById(String(ad.clinicId as { toString(): string })).select("ownerUserId name").lean()) as Record<string, unknown> | null;
  const ownerId = clinic ? String(clinic.ownerUserId as unknown) : null;

  /* ─── تحديد مبلغ المستحقات ─── */
  if (action === "ads-set-dues") {
    const amount = Math.max(0, Math.round(Number(body.amount) || 0));
    await ClinicAd.updateOne({ _id: body.id }, { $set: { amountDue: amount } });
    if (amount === 0) {
      /* بلا مستحقات — لا حاجة لسداد */
      await ClinicAd.updateOne({ _id: body.id }, { $set: { paid: true, paidAt: new Date() } });
    } else if (ownerId) {
      /* إشعار فوري للعيادة: تواصلي مع الإدارة وادفعي المستحقات لتأكيد إعلانك */
      await notifyUser(ownerId, "clinicAdDues", "/?view=clinic-dashboard", {
        title: String(ad.title || "").slice(0, 60),
        amount: String(amount),
      }).catch(() => {});
    }
    return NextResponse.json({ ok: true, amountDue: amount, paid: amount === 0 });
  }

  /* ─── تحديد حالة السداد ─── */
  if (action === "ads-set-paid") {
    const paid = body.paid === true;
    await ClinicAd.updateOne({ _id: body.id }, { $set: { paid, paidAt: paid ? new Date() : null } });
    if (paid && ownerId) {
      await notifyUser(ownerId, "clinicAdPaidConfirmed", "/?view=clinic-dashboard", {
        title: String(ad.title || "").slice(0, 60),
      }).catch(() => {});
    }
    return NextResponse.json({ ok: true, paid });
  }

  /* ─── تفعيل/إيقاف الإعلان العائم ─── */
  if (action === "ads-set-float") {
    const float = body.float === true;
    const perUser = Math.min(20, Math.max(1, Math.round(Number(body.perUser) || 3)));
    const days = Math.min(365, Math.max(1, Math.round(Number(body.days) || 7)));
    await ClinicAd.updateOne({ _id: body.id }, { $set: { float, floatPerUser: perUser, floatDays: days } });
    return NextResponse.json({ ok: true, float, floatPerUser: perUser, floatDays: days });
  }

  if (action === "ads-approve") {
    if (ad.status === "APPROVED") return NextResponse.json({ error: "BAD_STATE" }, { status: 409 });
    /* يشترط سداد المستحقات قبل النشر إن كان هناك مبلغ محدد غير مسدد */
    const due = Number(ad.amountDue) || 0;
    if (due > 0 && ad.paid !== true) {
      return NextResponse.json({ error: "DUES_NOT_PAID" }, { status: 409 });
    }
    const float = body.float === true || ad.float === true;
    const perUser = Math.min(20, Math.max(1, Math.round(Number(body.perUser) || Number(ad.floatPerUser) || 3)));
    const days = Math.min(365, Math.max(1, Math.round(Number(body.days) || Number(ad.floatDays) || 7)));
    const now = new Date();
    await ClinicAd.updateOne(
      { _id: body.id },
      {
        $set: {
          status: "APPROVED",
          paymentNote: (body.paymentNote || "").trim().slice(0, 200) || null,
          float,
          floatPerUser: perUser,
          floatDays: days,
          /* صلاحية العرض العائم تُحسب من لحظة النشر */
          expiresAt: float ? new Date(now.getTime() + days * 86400000) : null,
          reviewedBy: guard.auth.staffRole,
          reviewedAt: now,
          adminNote: null,
        },
      }
    );
    if (ownerId) {
      await notifyUser(ownerId, "clinicAdApproved", "/?view=ads", {
        title: String(ad.title || "").slice(0, 80),
      }).catch(() => {});
    }
    return NextResponse.json({ ok: true, expiresAt: float ? new Date(now.getTime() + days * 86400000) : null });
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
    if (ownerId) {
      await notifyUser(ownerId, "clinicAdRejected", "/?view=clinic-dashboard", {
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
