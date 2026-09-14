import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Clinic, ClinicAd, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/* ═ v1.15.0 — إعلانات العيادات ═
   GET  /api/ads                      → الإعلانات المنشورة (APPROVED) للجميع (صفحة 8)
   GET  /api/ads?userId={عيادة}       → إعلانات عيادتي بكل حالاتها + تفاصيلها السرية
   POST /api/ads {action:"create"}    → العيادة تصيغ إعلاناً (PENDING) بوسائط
   POST /api/ads {action:"like"}      → إعجاب/إلغاء إعجاب (عميل أو مختص)
   POST /api/ads {action:"comment"}   → تعليق على الإعلان (عميل أو مختص)
   POST /api/ads {action:"comment-hide"}  → العيادة تحجب تعليقاً على إعلانها
   POST /api/ads {action:"comment-reply"} → العيادة ترد على تعليق
   POST /api/ads {action:"delete"}    → العيادة تحذف إعلاناً لها
   POST /api/ads {action:"ads-optout"} → العميل يرفض/يسمح بالإعلانات المدفوعة
   الإعلان لا يظهر للجمهور إلا بعد أن يحدد الأدمين مستحقاته ويؤكد سدادها
   ثم يوافق على النشر. بيانات المستحقات (المبلغ/حالة السداد) سرّية تُرسل
   للعيادة صاحبة الإعلان والإدارة فقط — لا تظهر في أي استجابة عمومية. */

const MAX_MEDIA_ITEM = 6_000_000;   // ~4.5MB ثنائي لكل وسيط
const MAX_MEDIA_TOTAL = 11_000_000; // سقف مجموع الوسائط داخل الوثيقة
const MAX_ADS_PER_CLINIC = 15;
/* v1.17.0: صفحة الإعلانات العمومية — إعلان واحد كامل في الصفحة (ترقيم بالبطاقة)،
   والبانر العمومي يجلب حتى 8 للدوران */
const PUBLIC_PAGE = 1;
const PUBLIC_MAX = 8;
const OWNER_PAGE = 8;

/* وسائط الإعلان → روابط تقديم آمنة (بلا base64 داخل JSON) */
function mediaUrls(id: string, rec: Record<string, unknown>): string[] {
  const media = (rec.media as string[]) || [];
  const legacy = rec.image ? [rec.image as string] : [];
  const all = media.length ? media : legacy;
  return all.map((_, i) => `/api/ads/${id}/media/${i}`);
}

function mediaCount(rec: Record<string, unknown>): number {
  const media = (rec.media as string[]) || [];
  return media.length || (rec.image ? 1 : 0);
}

async function GET_impl(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const viewerId = searchParams.get("viewerId");
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  await connectDB();

  /* لوحة العيادة: إعلاناتها فقط (لا ترى إعلانات غيرها أبداً) بكل الحالات
     + تفاصيلها المحاسبية وبيانات تفاعل الجمهور */
  if (userId) {
    const user = await User.findById(userId).select("role").lean();
    if (!user || (user as { role?: string }).role !== "CLINIC") {
      return NextResponse.json({ error: "INVALID" }, { status: 401 });
    }
    const clinic = (await Clinic.findOne({ ownerUserId: userId }).select("_id name slug").lean()) as Record<string, unknown> | null;
    if (!clinic) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const filter = { clinicId: clinic._id };
    const [rows, total] = await Promise.all([
      ClinicAd.find(filter).sort({ createdAt: -1 }).skip((page - 1) * OWNER_PAGE).limit(OWNER_PAGE).lean(),
      ClinicAd.countDocuments(filter),
    ]);
    return NextResponse.json({
      clinicName: (clinic.name as string) || "—",
      ads: rows.map((r) => {
        const rec = r as Record<string, unknown>;
        const comments = ((rec.comments as Record<string, unknown>[]) || []) as Record<string, unknown>[];
        const visible = comments.filter((c) => !c.hidden);
        return {
          id: String(rec._id),
          title: (rec.title as string) || "",
          body: (rec.body as string) || "",
          mediaUrls: mediaUrls(String(rec._id), rec),
          hasImage: mediaCount(rec) > 0,
          imageUrl: mediaUrls(String(rec._id), rec)[0] || null,
          status: rec.status,
          adminNote: (rec.adminNote as string) || null,
          paymentNote: (rec.paymentNote as string) || null,
          /* تفاصيل المستحقات — لصاحب العيادة والإدارة فقط */
          amountDue: Number(rec.amountDue) || 0,
          paid: rec.paid === true,
          paidAt: rec.paidAt ?? null,
          /* الإعلان العائم */
          float: rec.float === true,
          floatPerUser: Number(rec.floatPerUser) || 3,
          floatDays: Number(rec.floatDays) || 7,
          expiresAt: rec.expiresAt ?? null,
          /* تفاعلات الجمهور */
          views: Number(rec.views) || 0,
          likesCount: ((rec.likes as string[]) || []).length,
          commentsCount: visible.length,
          comments: comments.map((c, i) => ({
            id: String(i),
            name: (c.name as string) || "—",
            text: (c.text as string) || "",
            hidden: c.hidden === true,
            /* v1.17.0: اسم العيادة صاحبة الرد — بدل عبارة «رد العيادة» */
            reply: c.reply ? { text: (c.reply as { text?: string }).text || null, at: (c.reply as { at?: string }).at || null, name: (clinic.name as string) || "—" } : null,
            createdAt: c.createdAt,
          })),
          reviewedAt: rec.reviewedAt ?? null,
          createdAt: rec.createdAt,
        };
      }),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / OWNER_PAGE)),
    });
  }

  /* الجمهور: المنشورة فقط — مع بيانات العيادة للربط بصفحتها.
     لا شيء هنا يدل على مستحقات أو سداد — الإعلان مجرد محتوى منشور.
     v1.17.0: الترتيب من أعلى مستحقات إلى أدناها (معلومة إدارية سرّية —
     لا تُكتب في أي استجابة ولا في الواجهة) ثم الأحدث — والعموم يرى مجرد
     صفحات متساوية. صفحة عمومية واحدة = إعلان كامل، والبانر يجلب حتى 8. */
  const pageSize = Math.min(PUBLIC_MAX, Math.max(1, Number(searchParams.get("pageSize")) || PUBLIC_PAGE));
  const filter = { status: "APPROVED" };
  const [rows, total] = await Promise.all([
    ClinicAd.find(filter).sort({ amountDue: -1, reviewedAt: -1, createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
    ClinicAd.countDocuments(filter),
  ]);
  const clinicIds = Array.from(new Set(rows.map((r) => String((r as unknown as { clinicId: { toString(): string } }).clinicId))));
  const clinics = clinicIds.length
    ? await Clinic.find({ _id: { $in: clinicIds } }).select("name slug wilaya city address phones whatsapp website hasLogo").lean()
    : [];
  const byId = new Map(clinics.map((c) => [String((c as unknown as { _id: unknown })._id), c as Record<string, unknown>]));
  const viewerOid = viewerId && /^[a-f0-9]{24}$/i.test(viewerId) ? viewerId : null;

  return NextResponse.json({
    ads: rows
      .map((r) => {
        const rec = r as Record<string, unknown>;
        const cid = String((rec.clinicId as { toString(): string }).toString());
        const c = byId.get(cid) || {};
        const likes = (rec.likes as string[]) || [];
        const comments = ((rec.comments as Record<string, unknown>[]) || []).filter((cm) => !cm.hidden);
        return {
          id: String(rec._id),
          title: (rec.title as string) || "",
          body: (rec.body as string) || "",
          mediaUrls: mediaUrls(String(rec._id), rec),
          imageUrl: mediaUrls(String(rec._id), rec)[0] || null,
          publishedAt: (rec.reviewedAt as string) || (rec.createdAt as string),
          likesCount: likes.length,
          likedByMe: viewerOid ? likes.some((l) => String(l) === viewerOid) : false,
          commentsCount: comments.length,
          comments: comments.map((cm) => ({
            name: (cm.name as string) || "—",
            text: (cm.text as string) || "",
            /* v1.17.0: الرد يحمل اسم العيادة صاحبة الإعلان نفسه */
            reply: cm.reply ? { text: (cm.reply as { text?: string }).text || null, name: (c.name as string) || "—" } : null,
            createdAt: cm.createdAt,
          })),
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
            hasLogo: c.hasLogo === true,
            logoUrl: `/api/clinics/${cid}/logo?v=${c.updatedAt ? new Date(c.updatedAt as string).getTime() : 0}`,
          },
        };
      })
      .filter((a) => a.clinic.slug),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

async function POST_impl(req: NextRequest) {
  const body = await req.json();
  const { action, userId } = body as { action?: string; userId?: string };
  await connectDB();

  /* ─── رفض/السماح بالإعلانات المدفوعة (حق العميل من إعداداته) ─── */
  if (action === "ads-optout") {
    if (!userId || !/^[a-f0-9]{24}$/i.test(String(userId))) {
      return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
    }
    await User.updateOne({ _id: userId }, { $set: { adsOptOut: body.optOut === true } });
    return NextResponse.json({ ok: true });
  }

  /* ─── إعجاب (تبديل) — للعملاء والمختصين ─── */
  if (action === "like") {
    if (!userId || !body.id || !/^[a-f0-9]{24}$/i.test(String(userId))) {
      return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
    }
    const user = await User.findById(userId).select("role suspended").lean();
    if (!user || (user as { suspended?: boolean }).suspended) {
      return NextResponse.json({ error: "INVALID" }, { status: 401 });
    }
    const ad = await ClinicAd.findById(body.id).select("likes status").lean();
    if (!ad || (ad as unknown as { status: string }).status !== "APPROVED") {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    const likes = ((ad as unknown as { likes: string[] }).likes || []).map((l) => String(l));
    const mine = likes.includes(String(userId));
    const update = mine
      ? { $pull: { likes: userId } }
      : { $addToSet: { likes: userId } };
    await ClinicAd.updateOne({ _id: body.id }, update);
    const fresh = (await ClinicAd.findById(body.id).select("likes").lean()) as unknown as { likes: string[] } | null;
    return NextResponse.json({ ok: true, likedByMe: !mine, likesCount: (fresh?.likes || []).length });
  }

  /* ─── تعليق — للعملاء والمختصين ─── */
  if (action === "comment") {
    if (!userId || !body.id || !/^[a-f0-9]{24}$/i.test(String(userId))) {
      return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
    }
    const user = (await User.findById(userId).select("role pseudonym suspended").lean()) as { role?: string; pseudonym?: string; suspended?: boolean } | null;
    if (!user || user.suspended || user.role === "CLINIC") {
      return NextResponse.json({ error: "INVALID" }, { status: 401 });
    }
    const text = String(body.text || "").trim().slice(0, 300);
    if (!text) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
    const ad = (await ClinicAd.findById(body.id).select("status comments").lean()) as unknown as { status: string; comments: unknown[] } | null;
    if (!ad || ad.status !== "APPROVED") return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if ((ad.comments || []).length >= 200) return NextResponse.json({ error: "COMMENTS_FULL" }, { status: 409 });
    await ClinicAd.updateOne({ _id: body.id }, {
      $push: { comments: { userId, name: (user.pseudonym || "—").slice(0, 80), text, hidden: false, createdAt: new Date() } },
    });
    return NextResponse.json({ ok: true });
  }

  /* ─── أفعال العيادة على إعلاناتها (حجب تعليق / رد / إنشاء / تعديل / حذف) ─── */
  const ownerActions = ["create", "update", "delete", "comment-hide", "comment-reply"];
  if (ownerActions.includes(String(action))) {
    const user = await User.findById(userId).select("role suspended").lean();
    if (!user || (user as { role?: string }).role !== "CLINIC" || (user as { suspended?: boolean }).suspended) {
      return NextResponse.json({ error: "INVALID" }, { status: 401 });
    }
    const clinic = (await Clinic.findOne({ ownerUserId: userId }).select("_id isActive").lean()) as Record<string, unknown> | null;
    if (!clinic || clinic.isActive === false) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    if (action === "create") {
      const title = String(body.title || "").trim().slice(0, 120);
      const adBody = String(body.body || "").trim().slice(0, 1200);
      if (!title || !adBody) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
      /* الوسائط: حتى 5 صور + فيديو واحد (data URLs) */
      let media: string[] = Array.isArray(body.media) ? body.media.filter((m: unknown) => typeof m === "string") : [];
      if (!media.length && typeof body.image === "string" && body.image) media = [body.image];
      if (media.length > 6) return NextResponse.json({ error: "MAX_6_MEDIA" }, { status: 400 });
      const images = media.filter((m) => m.startsWith("data:image/"));
      const videos = media.filter((m) => m.startsWith("data:video/"));
      if (images.length + videos.length !== media.length) return NextResponse.json({ error: "INVALID_MEDIA" }, { status: 400 });
      if (images.length > 5 || videos.length > 1) return NextResponse.json({ error: "MAX_6_MEDIA" }, { status: 400 });
      if (media.some((m) => m.length > MAX_MEDIA_ITEM)) return NextResponse.json({ error: "MEDIA_TOO_BIG" }, { status: 400 });
      if (media.reduce((s, m) => s + m.length, 0) > MAX_MEDIA_TOTAL) return NextResponse.json({ error: "MEDIA_TOO_BIG" }, { status: 400 });
      const count = await ClinicAd.countDocuments({ clinicId: clinic._id });
      if (count >= MAX_ADS_PER_CLINIC) return NextResponse.json({ error: "ADS_LIMIT" }, { status: 409 });
      await ClinicAd.create({ clinicId: clinic._id, title, body: adBody, media, status: "PENDING" });
      return NextResponse.json({ ok: true });
    }

    /* الأفعال المتبقية تشترط ملكية الإعلان */
    const ad = (await ClinicAd.findById(body.id).select("clinicId status").lean()) as Record<string, unknown> | null;
    if (!ad || String(ad.clinicId as { toString(): string }) !== String(clinic._id)) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    /* v1.17.0: تعديل إعلان العيادة (بانتظار المراجعة أو المنشور) —
       التعديل على المنشور يصل للمستخدمين تلقائياً فور الحفظ (البيانات
       تُقرأ من القاعدة في كل زيارة)، وتبقى حالة الإعلان كما هي.
       المرفوض لا يُعدَّل — يُحذف ويُصاغ غيره بسببه المعروض للعيادة */
    if (action === "update") {
      const st = String(ad.status || "");
      if (st === "REJECTED") return NextResponse.json({ error: "REJECTED_LOCKED" }, { status: 403 });
      const title = String(body.title || "").trim().slice(0, 120);
      const adBody = String(body.body || "").trim().slice(0, 1200);
      if (!title || !adBody) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
      let media: string[] = Array.isArray(body.media) ? body.media.filter((m: unknown) => typeof m === "string") : [];
      if (!media.length && typeof body.image === "string" && body.image) media = [body.image];
      if (media.length > 6) return NextResponse.json({ error: "MAX_6_MEDIA" }, { status: 400 });
      const images = media.filter((m) => m.startsWith("data:image/"));
      const videos = media.filter((m) => m.startsWith("data:video/"));
      if (images.length + videos.length !== media.length) return NextResponse.json({ error: "INVALID_MEDIA" }, { status: 400 });
      if (images.length > 5 || videos.length > 1) return NextResponse.json({ error: "MAX_6_MEDIA" }, { status: 400 });
      if (media.some((m) => m.length > MAX_MEDIA_ITEM)) return NextResponse.json({ error: "MEDIA_TOO_BIG" }, { status: 400 });
      if (media.reduce((s, m) => s + m.length, 0) > MAX_MEDIA_TOTAL) return NextResponse.json({ error: "MEDIA_TOO_BIG" }, { status: 400 });
      await ClinicAd.updateOne({ _id: body.id }, { $set: { title, body: adBody, media } });
      return NextResponse.json({ ok: true, updated: true });
    }

    if (action === "delete") {
      await ClinicAd.deleteOne({ _id: body.id });
      return NextResponse.json({ ok: true });
    }
    if (action === "comment-hide") {
      const idx = Number(body.commentIndex);
      if (!Number.isInteger(idx) || idx < 0) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
      const target = await ClinicAd.findById(body.id).select("comments").lean() as unknown as { comments: { hidden: boolean }[] } | null;
      if (!target || !target.comments?.[idx]) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
      await ClinicAd.updateOne({ _id: body.id }, { $set: { [`comments.${idx}.hidden`]: body.hidden !== false } });
      return NextResponse.json({ ok: true });
    }
    if (action === "comment-reply") {
      const idx = Number(body.commentIndex);
      const text = String(body.text || "").trim().slice(0, 300);
      if (!Number.isInteger(idx) || idx < 0 || !text) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
      const target = await ClinicAd.findById(body.id).select("comments").lean() as unknown as { comments: unknown[] } | null;
      if (!target || !target.comments?.[idx]) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
      await ClinicAd.updateOne({ _id: body.id }, { $set: { [`comments.${idx}.reply`]: { text, at: new Date() } } });
      return NextResponse.json({ ok: true });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export const POST = apiHandler(POST_impl);
export const GET = apiHandler(GET_impl);
