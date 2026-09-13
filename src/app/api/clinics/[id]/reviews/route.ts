import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Clinic, ClinicBooking, ClinicRating, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/* ═ v1.14.0 — تقييمات العيادة ═
   GET  /api/clinics/{id}/reviews — آخر التقييمات (اسم العميل بالكنية) + ملخص.
   POST /api/clinics/{id}/reviews — تقييم/تحديث تقييم العميل (1–5 نجوم).
   المنطق الواقعي: يقيّم من يملك حجزاً واحداً على الأقل في هذه العيادة
   لم يُلغِه (بانتظار/مؤكد/مكتمل) — لا تقييمات من غير من تعامل معها.
   تقييم واحد لكل (عميل × عيادة)؛ إعادة الإرسال تُحدّث النجوم والتعليق،
   ومتوسط العيادة وعدّادها يُحدَّثان لحظياً. */

const PAGE = 10;

async function GET_impl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const viewerId = searchParams.get("viewerId");
  await connectDB();

  if (!/^[a-f0-9]{24}$/i.test(String(id || ""))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const clinic = await Clinic.findById(id).select("_id").lean();
  if (!clinic) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [items, total] = await Promise.all([
    ClinicRating.find({ clinicId: id }).sort({ createdAt: -1 }).skip((page - 1) * PAGE).limit(PAGE).lean(),
    ClinicRating.countDocuments({ clinicId: id }),
  ]);

  /* المتوسط والتوزيع من كل التقييمات — ومتوسط الملف يبقى مرجعاً محدثاً */
  const all = await ClinicRating.find({ clinicId: id }).select("stars clientUserId comment").lean();
  const n = all.length;
  const avg = n ? Math.round((all.reduce((s, r) => s + (Number((r as { stars?: number }).stars) || 0), 0) / n) * 10) / 10 : 5;
  /* v1.15.0: توزيع النجوم — نمط نافذة تقييمات الأخصائيين */
  const distribution = [5, 4, 3, 2, 1].map((s) => ({
    stars: s,
    count: all.filter((r) => Math.round(Number((r as { stars?: number }).stars) || 0) === s).length,
  }));
  /* تقييم المشاهد نفسه — لتعبئة النموذج في النافذة */
  let myRating: { stars: number; comment: string | null } | null = null;
  if (viewerId && /^[a-f0-9]{24}$/i.test(viewerId)) {
    const mine = all.find((r) => String((r as unknown as { clientUserId: { toString(): string } }).clientUserId) === viewerId) as
      | { stars?: number; comment?: string | null }
      | undefined;
    if (mine) myRating = { stars: Number(mine.stars) || 0, comment: mine.comment ?? null };
  }

  const userIds = items.map((r) => (r as unknown as { clientUserId: unknown }).clientUserId).filter(Boolean);
  const users = userIds.length ? await User.find({ _id: { $in: userIds } }).select("pseudonym").lean() : [];
  const nameById = new Map(users.map((u) => [String((u as { _id: unknown })._id), (u as { pseudonym?: string }).pseudonym || "—"]));

  return NextResponse.json({
    reviews: items.map((r) => {
      const rec = r as Record<string, unknown>;
      return {
        id: String(rec._id),
        stars: Number(rec.stars) || 5,
        comment: (rec.comment as string) || null,
        clientName: nameById.get(String(rec.clientUserId)) || "—",
        createdAt: rec.createdAt,
      };
    }),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE)),
    avg,
    count: n,
    distribution,
    myRating,
  });
}

async function POST_impl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();
  await connectDB();

  const { userId, stars, comment } = body as { userId?: string; stars?: number; comment?: string };
  if (!userId || !/^[a-f0-9]{24}$/i.test(String(userId || "")) || !/^[a-f0-9]{24}$/i.test(String(id || ""))) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  const s = Math.round(Number(stars));
  if (!Number.isFinite(s) || s < 1 || s > 5) {
    return NextResponse.json({ error: "INVALID_STARS" }, { status: 400 });
  }

  const [user, clinic] = await Promise.all([
    User.findById(userId).select("role pseudonym suspended").lean(),
    Clinic.findById(id).select("_id isActive").lean(),
  ]);
  if (!user || (user as { role?: string }).role !== "VICTIM" || (user as { suspended?: boolean }).suspended) {
    return NextResponse.json({ error: "INVALID" }, { status: 401 });
  }
  if (!clinic || (clinic as { isActive?: boolean }).isActive === false) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  /* يقيّم من يملك حجزاً غير ملغى في هذه العيادة */
  const hasBooking = await ClinicBooking.countDocuments({
    clinicId: id,
    clientUserId: userId,
    status: { $in: ["PENDING", "CONFIRMED", "COMPLETED"] },
  });
  if (!hasBooking) {
    return NextResponse.json({ error: "BOOKING_REQUIRED" }, { status: 403 });
  }

  const rateKey = `${id}:${userId}`;
  await ClinicRating.findOneAndUpdate(
    { rateKey },
    { rateKey, clinicId: id, clientUserId: userId, stars: s, comment: (comment || "").trim().slice(0, 500) || null },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  /* إعادة حساب متوسط العيادة وعدّادها */
  const all = await ClinicRating.find({ clinicId: id }).select("stars").lean();
  const n = all.length;
  const avg = n ? all.reduce((acc, r) => acc + (Number((r as { stars?: number }).stars) || 0), 0) / n : 5;
  await Clinic.updateOne({ _id: id }, { $set: { rating: Math.round(avg * 10) / 10, ratingsCount: n } });

  return NextResponse.json({ ok: true, rating: Math.round(avg * 10) / 10, ratingsCount: n });
}

export const GET = apiHandler(GET_impl);
export const POST = apiHandler(POST_impl);
