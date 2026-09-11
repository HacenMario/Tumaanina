import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { CounselorProfile, CounselorRating, SupportSession, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";
import { notifyUser, displayNameOf } from "@/lib/server/notify";

export const dynamic = "force-dynamic";

/* ─── v2.14.0: تقييم المختص من طرف العميل — 1 إلى 5 نجوم ───
   POST { victimId, stars, comment?, sessionId? }
   تقييم واحد لكل (عميل + مختص + جلسة) — إعادة الإرسال تُحدِّث النجوم.
   متوسط النجوم يُحدَّث لحظياً في ملف المختص ويُرسل إشعار للمختص. */
async function POST_impl(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const victimId = typeof body.victimId === "string" ? body.victimId : "";
  const stars = Math.round(Number(body.stars));
  const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 500) : "";
  const sessionId = typeof body.sessionId === "string" && body.sessionId ? body.sessionId : null;

  if (!victimId) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  if (!Number.isFinite(stars) || stars < 1 || stars > 5) {
    return NextResponse.json({ error: "INVALID_STARS" }, { status: 400 });
  }
  if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(victimId)) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  await connectDB();

  const [victim, counselorUser] = (await Promise.all([
    User.findById(victimId).select("role").lean(),
    User.findById(id).select("role").lean(),
  ])) as unknown as [{ role?: string } | null, { role?: string } | null];
  if (!victim || victim.role !== "VICTIM") {
    return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }
  if (!counselorUser || counselorUser.role !== "COUNSELOR") {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (sessionId && mongoose.isValidObjectId(sessionId)) {
    /* التقييم عبر جلسة متاح فقط لأطراف الجلسة */
    const s = (await SupportSession.findById(sessionId)
      .select("victimId counselorId status")
      .lean()) as unknown as { victimId?: unknown; counselorId?: unknown; status?: string } | null;
    if (!s || String(s.victimId) !== victimId || String(s.counselorId) !== id) {
      return NextResponse.json({ error: "NOT_ALLOWED" }, { status: 403 });
    }
  }

  const rateKey = `${id}:${victimId}:${sessionId || "direct"}`;
  await CounselorRating.findOneAndUpdate(
    { rateKey },
    {
      $set: {
        counselorId: id,
        victimId,
        sessionId,
        stars,
        comment: comment || null,
      },
    },
    { upsert: true, new: true }
  );

  /* إعادة حساب المتوسط من كل التقييمات وتحديث ملف المختص */
  const cId = new mongoose.Types.ObjectId(id);
  const agg = (await CounselorRating.aggregate([
    { $match: { counselorId: cId } },
    { $group: { _id: null, avg: { $avg: "$stars" }, count: { $sum: 1 } } },
  ])) as { avg?: number; count?: number }[];
  const count = agg[0]?.count ?? 1;
  const avg = agg[0]?.avg ?? stars;
  const rounded = Math.round(avg * 10) / 10;
  await CounselorProfile.updateOne({ userId: id }, { $set: { rating: rounded } }).catch(() => {});

  /* إشعار المختص بالتقييم الجديد — v1.5.0: يذكر الاسم المستعار للعميل صراحة */
  const raterName = await displayNameOf(victimId);
  notifyUser(id, "ratingReceived", "/?view=counselor-dashboard", { stars: String(stars), name: raterName || "—" }).catch(() => {});

  return NextResponse.json({ ok: true, avg: rounded, count });
}

export const POST = apiHandler(POST_impl);
