import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { CounselorProfile, SocialFollow, User } from "@/lib/models";
import { notifyUser } from "@/lib/server/notify";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/* ─── v2.12.0: متابعة/إلغاء متابعة أخصائي — لكل مستخدم مسجّل (تبديل) ───
   POST { userId, targetId } → { following, followers } */

async function POST_impl(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const userId = typeof body.userId === "string" ? body.userId : "";
  const targetId = typeof body.targetId === "string" ? body.targetId : "";
  if (!userId || !targetId) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  if (userId === targetId) return NextResponse.json({ error: "CANNOT_FOLLOW_SELF" }, { status: 400 });

  await connectDB();

  const [me, target] = (await Promise.all([
    User.findById(userId).select("_id role").lean(),
    User.findById(targetId).select("_id role").lean(),
  ])) as unknown as [{ _id?: unknown; role?: string } | null, { _id?: unknown; role?: string } | null];
  if (!me || !target) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  /* المتابعة موجّهة لحسابات الأخصائيين — من أي مستخدم مسجّل */
  if (target.role !== "COUNSELOR") {
    return NextResponse.json({ error: "COUNSELOR_ONLY" }, { status: 400 });
  }

  const existing = (await SocialFollow.findOne({ followerId: me._id, followingId: target._id })
    .select("_id")
    .lean()) as unknown as { _id?: unknown } | null;
  if (existing) {
    await SocialFollow.deleteOne({ _id: existing._id });
  } else {
    try {
      await SocialFollow.create({ followerId: me._id, followingId: target._id });
      /* v2.14.0: إشعار متابع جديد — يصل للأخصائي لحظة المتابعة */
      void (async () => {
        try {
          let name = (me as { role?: string }).role === "COUNSELOR" ? "" : "";
          if ((me as { role?: string }).role === "COUNSELOR") {
            const p = (await CounselorProfile.findOne({ userId }).select("fullName").lean()) as
              | { fullName?: string }
              | null;
            name = p?.fullName || "";
          } else {
            const mu = (await User.findById(userId).select("pseudonym").lean()) as
              | { pseudonym?: string | null }
              | null;
            name = mu?.pseudonym || "";
          }
          await notifyUser(targetId, "newFollower", "/?view=community", {
            name: name || "—",
          });
        } catch {
          /* إشعار المتابعة ميزة إضافية */
        }
      })();
    } catch {
      /* تصادم فهرس فريد — متابعة موجودة أصلاً */
    }
  }

  const followers = await SocialFollow.countDocuments({ followingId: target._id });
  return NextResponse.json({ ok: true, following: !existing, followers });
}

export const POST = apiHandler(POST_impl);
