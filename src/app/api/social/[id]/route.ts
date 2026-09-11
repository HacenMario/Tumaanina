import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { SocialPost, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/* ─── v2.12.0: حذف منشور — صاحبه أو الإدارة فقط ─── */

async function DELETE_impl(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!userId) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });

  await connectDB();

  const u = (await User.findById(userId).select("role").lean()) as
    | { role?: string }
    | null;
  if (!u) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });

  const post = (await SocialPost.findById(id).select("authorId").lean()) as
    | { authorId: unknown }
    | null;
  if (!post) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const isAuthor = String(post.authorId) === userId;
  const isAdmin = u.role === "ADMIN";
  if (!isAuthor && !isAdmin) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  await SocialPost.deleteOne({ _id: id });
  return NextResponse.json({ ok: true });
}

export const DELETE = apiHandler(DELETE_impl);
