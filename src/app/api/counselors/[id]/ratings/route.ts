import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { CounselorRating, SupportSession, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/* ─── v2.14.0: قائمة تقييمات مختص — تُعرض بعد الضغط على زر «التقييمات» ───
   GET ?viewerId=&sessionId= → { avg, count, distribution, items, myRating }
   items تظهر بلا أي بيانات حساسة: اسم مستعار + نجوم + تعليق + تاريخ. */
async function GET_impl(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const viewerId = searchParams.get("viewerId") || "";
  const sessionId = searchParams.get("sessionId") || "";
  await connectDB();

  const rows = (await CounselorRating.find({ counselorId: id })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean()) as unknown as {
    _id: unknown;
    victimId: unknown;
    sessionId?: string | null;
    stars: number;
    comment?: string | null;
    createdAt?: Date | string;
  }[];

  const count = rows.length;
  const avg = count > 0 ? Math.round((rows.reduce((a, r) => a + r.stars, 0) / count) * 10) / 10 : 0;
  const distribution = [5, 4, 3, 2, 1].map((s) => ({ stars: s, count: rows.filter((r) => r.stars === s).length }));

  /* أسماء المستعارين للمقيّمين — استعلام واحد */
  const victimIds = [...new Set(rows.map((r) => String(r.victimId)))];
  const vics = (await User.find({ _id: { $in: victimIds } })
    .select("pseudonym")
    .lean()) as unknown as { _id: unknown; pseudonym?: string | null }[];
  const nameOf = new Map(vics.map((v) => [String(v._id), v.pseudonym || "—"]));

  let myRating: { stars: number; comment: string | null } | null = null;
  if (viewerId) {
    const mine = rows.find(
      (r) => String(r.victimId) === viewerId && (!sessionId || !r.sessionId || String(r.sessionId) === sessionId)
    );
    if (mine) myRating = { stars: mine.stars, comment: mine.comment || null };
  }

  const items = await Promise.all(
    rows.map(async (r) => {
      let when: string | null = null;
      if (r.sessionId) {
        const s = (await SupportSession.findById(r.sessionId).select("scheduledAt").lean()) as unknown as {
          scheduledAt?: Date | string | null;
        } | null;
        when = s?.scheduledAt ? new Date(s.scheduledAt as string).toISOString() : null;
      }
      return {
        id: String(r._id),
        stars: r.stars,
        comment: r.comment || null,
        by: nameOf.get(String(r.victimId)) || "—",
        at: r.createdAt ? new Date(r.createdAt as string).toISOString() : null,
        sessionWhen: when,
      };
    })
  );

  return NextResponse.json({ avg, count, distribution, items, myRating });
}

export const GET = apiHandler(GET_impl);
