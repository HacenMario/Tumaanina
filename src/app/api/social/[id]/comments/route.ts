import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { CounselorProfile, SocialPost, User } from "@/lib/models";
import { commentAuthorInfo } from "@/lib/server/social";
import { notifyUser, messageExcerpt } from "@/lib/server/notify";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/* ─── v2.12.0: تعليقات المنشور ───
   GET  → كل التعليقات بأسماء أصحابها (عميل أو أخصائي)
   POST { userId, text } → إضافة تعليق — لكل مستخدم مسجّل (حد 1000 حرف) */

const MAX_COMMENTS = 100;

async function GET_impl(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await connectDB();

  const post = (await SocialPost.findById(id).select("comments").lean()) as
    | { comments?: { authorId: unknown; text?: string; createdAt?: Date | string }[] }
    | null;
  if (!post) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const out: Record<string, unknown>[] = [];
  for (const c of post.comments || []) {
    const a = await commentAuthorInfo(c.authorId);
    out.push({
      id: `${String(c.authorId)}:${new Date(c.createdAt || 0).getTime()}`,
      text: String(c.text || ""),
      createdAt: c.createdAt,
      authorName: a.name,
      authorRole: a.role,
    });
  }

  return NextResponse.json({ comments: out });
}

async function POST_impl(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const userId = typeof body.userId === "string" ? body.userId : "";
  const text = String(body.text || "").trim();
  if (!userId) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  if (!text) return NextResponse.json({ error: "EMPTY_COMMENT" }, { status: 400 });

  await connectDB();

  const u = (await User.findById(userId).select("role pseudonym").lean()) as
    | { role?: string; pseudonym?: string | null }
    | null;
  if (!u) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });

  const post = (await SocialPost.findById(id).select("comments authorId").lean()) as
    | { comments?: unknown[]; authorId?: unknown }
    | null;
  if (!post) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if ((post.comments || []).length >= MAX_COMMENTS) {
    return NextResponse.json({ error: "COMMENTS_FULL" }, { status: 409 });
  }

  const createdAt = new Date();
  await SocialPost.findByIdAndUpdate(id, {
    $push: {
      comments: {
        $each: [{ authorId: userId, text: text.slice(0, 1000), createdAt }],
        $slice: -MAX_COMMENTS,
      },
    },
  });

  /* اسم كاتب التعليق كما سيظهر لاحقاً في القائمة: الأخصائي باسمه المهني */
  let authorName = u.pseudonym || "—";
  const authorRole = u.role || "VICTIM";
  if (authorRole === "COUNSELOR") {
    const p = (await CounselorProfile.findOne({ userId }).select("fullName").lean()) as
      | { fullName?: string }
      | null;
    authorName = p?.fullName || authorName;
  }

  /* v2.14.0: إشعار تعليق جديد — صاحب المنشور يُبلَّغ فوراً (بلا إشعار لنفسه) */
  if (post.authorId && String(post.authorId) !== userId) {
    void (async () => {
      try {
        await notifyUser(String(post.authorId), "socialComment", "/?view=community", {
          name: authorName,
          excerpt: messageExcerpt(text),
        });
      } catch {
        /* إشعار التعليق ميزة إضافية — لا يفشل التعليق نفسه */
      }
    })();
  }

  return NextResponse.json({
    ok: true,
    comment: { text: text.slice(0, 1000), createdAt, authorName, authorRole },
  });
}

export const GET = apiHandler(GET_impl);
export const POST = apiHandler(POST_impl);

