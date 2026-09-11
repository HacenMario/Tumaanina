import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { SocialPost, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";
import { notifyUser } from "@/lib/server/notify";
import { commentAuthorInfo } from "@/lib/server/social";

export const dynamic = "force-dynamic";

/* ─── v2.12.0: إعجاب/إلغاء إعجاب بمنشور — لكل مستخدم مسجّل (تبديل ذري) ───
   v2.14.0: صاحب المنشور يُبلَّغ بالإعجاب الجديد (بلا إشعار لنفسه) */

async function POST_impl(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!userId) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });

  await connectDB();

  const u = (await User.findById(userId).select("_id").lean()) as { _id?: unknown } | null;
  if (!u) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });

  const post = (await SocialPost.findById(id).select("likes authorId").lean()) as
    | { likes?: unknown[]; authorId?: unknown }
    | null;
  if (!post) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const liked = (post.likes || []).some((x) => String(x) === userId);
  const updated = liked
    ? await SocialPost.findByIdAndUpdate(
        id,
        { $pull: { likes: u._id } },
        { new: true, select: "likes" }
      ).lean()
    : await SocialPost.findByIdAndUpdate(
        id,
        { $addToSet: { likes: u._id } },
        { new: true, select: "likes" }
      ).lean();

  const likes = ((updated as { likes?: unknown[] } | null)?.likes || []).length;

  /* v2.14.0: إشعار الإعجاب — فقط عند إعجاب جديد وليس لمنشور نفسه */
  if (!liked && post.authorId && String(post.authorId) !== userId) {
    void (async () => {
      try {
        const a = await commentAuthorInfo(userId);
        await notifyUser(String(post.authorId), "socialLike", "/?view=community", {
          name: a.name,
        });
      } catch {
        /* إشعار الإعجاب ميزة إضافية — لا يفشل الإعجاب نفسه */
      }
    })();
  }

  return NextResponse.json({ ok: true, liked: !liked, likes });
}

export const POST = apiHandler(POST_impl);
