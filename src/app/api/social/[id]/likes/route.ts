import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { SocialPost } from "@/lib/models";
import { commentAuthorInfo } from "@/lib/server/social";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/* ─── v2.13.0: قائمة المعجبين بمنشور — نافذة منبثقة في المجتمع ───
   GET /api/social/{id}/likes → { likers: [{ id, name, role }] }
   الأخصائيون بأسمائهم المهنية والعميلون بأسمائهم المستعارة.
   متاح للجميع (الأسماء المستعارة/المهنية علنية أصلًا على المنشور). */

const MAX_LIKERS = 300;

async function GET_impl(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await connectDB();

  const post = (await SocialPost.findById(id)
    .select("likes")
    .lean()) as { likes?: unknown[] } | null;
  if (!post) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const likeIds = (post.likes || []).slice(0, MAX_LIKERS).map((x) => String(x));

  /* أسماء المعجبين بالتوازي — صفوف بنفس ترتيب الإعجاب */
  const rows = await Promise.all(
    likeIds.map(async (uid) => {
      const a = await commentAuthorInfo(uid);
      return { id: uid, name: a.name, role: a.role };
    })
  );

  return NextResponse.json({ likers: rows, total: likeIds.length });
}

export const GET = apiHandler(GET_impl);
