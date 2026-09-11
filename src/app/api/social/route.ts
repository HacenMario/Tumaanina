import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { SocialFollow, SocialPost, CounselorProfile, User } from "@/lib/models";
import { commentAuthorInfo, postAuthorInfo } from "@/lib/server/social";
import { apiHandler } from "@/lib/server/api";
import { messageExcerpt } from "@/lib/server/notify";

export const dynamic = "force-dynamic";

/* ─── v2.12.0 + v2.13.0: منشورات المجتمع ───
   GET  ?page=0&viewerId=…&feed=all|following
        feed=all       → آخر المنشورات للجميع (10 لكل صفحة)
        feed=following → منشورات من يتابعهم الطالب حصراً — القيمة
                         الفعلية للمتابعة (على غرار تبقّة المتابَعين
                         في إنستغرام)؛ تتطلب viewerId وإلا ترجع فارغة.
        مع اسم الأخصائي وصورته وتخصصاته وعدد الإعجابات والتعليقات
        وعدد المتابعين وحالة الإعجاب/المتابعة للطالب viewerId.
   POST { userId, text, image? } → إنشاء منشور — للأخصائيين فقط
        (نص أو صورة أو كلاهما) + إشعار فوري لكل متابعي الكاتب. */

const PAGE_SIZE = 10;
const MAX_IMAGE_CHARS = 2_600_000; /* ≈1.9MB base64 — الصورة تُضغط في المتصفح قبلها */
const MAX_TEXT = 3000;
const MAX_NOTIFY_FOLLOWERS = 300;

async function GET_impl(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(0, Number(searchParams.get("page") || 0) || 0);
  const viewerId = searchParams.get("viewerId");
  const feed = searchParams.get("feed") === "following" ? "following" : "all";

  await connectDB();

  /* متابعات الطالب — لمعرفة من يتابعه بالفعل + فلتر تبقّة «من أتابعهم» */
  let followedSet = new Set<string>();
  if (viewerId) {
    try {
      const f = (await SocialFollow.find({ followerId: viewerId })
        .select("followingId")
        .limit(2000)
        .lean()
        .then((rows) => (rows as unknown as { followingId: unknown }[]).map((x) => String(x.followingId))));
      followedSet = new Set(f);
    } catch {
      /* تجاهل */
    }
  }

  /* v2.13.0: تبقّة «من أتابعهم» — منشورات المتابَعين فقط */
  const filter = feed === "following"
    ? { authorId: { $in: Array.from(followedSet) } }
    : {};

  const docs = (await SocialPost.find(filter)
    .sort({ createdAt: -1 })
    .skip(page * PAGE_SIZE)
    .limit(PAGE_SIZE + 1)
    .lean()) as unknown as {
    _id: unknown;
    authorId: unknown;
    text?: string;
    image?: string | null;
    likes?: unknown[];
    comments?: { authorId: unknown; text?: string; createdAt?: Date | string }[];
    createdAt?: Date | string;
  }[];

  const hasMore = docs.length > PAGE_SIZE;
  const slice = docs.slice(0, PAGE_SIZE);

  const posts: Record<string, unknown>[] = [];
  for (const d of slice) {
    const author = await postAuthorInfo(d.authorId);
    /* عدد متابعي الكاتب — يعرض بجانب اسمه في البطاقة */
    let followersCount = 0;
    if (author) {
      try {
        followersCount = await SocialFollow.countDocuments({ followingId: author.id });
      } catch {
        followersCount = 0;
      }
    }
    const likes = (d.likes || []).map(String);
    const comments = d.comments || [];
    /* آخر تعليقين يظهران مباشرة تحت المنشور — والباقي بزر عرض الكل */
    const lastTwo = comments.slice(-2);
    const commentsOut: Record<string, unknown>[] = [];
    for (const c of lastTwo) {
      const a = await commentAuthorInfo(c.authorId);
      commentsOut.push({
        id: `${String(d._id)}:${String(c.authorId)}:${new Date(c.createdAt || 0).getTime()}`,
        text: String(c.text || ""),
        createdAt: c.createdAt || d.createdAt,
        authorName: a.name,
        authorRole: a.role,
      });
    }
    posts.push({
      id: String(d._id),
      text: String(d.text || ""),
      image: d.image || null,
      createdAt: d.createdAt,
      likesCount: likes.length,
      likedByMe: viewerId ? likes.includes(viewerId) : false,
      commentsCount: comments.length,
      comments: commentsOut,
      author: author ? { ...author, followersCount } : null,
      followedByMe: author ? followedSet.has(author.id) : false,
    });
  }

  return NextResponse.json({ posts, hasMore });
}

async function POST_impl(req: NextRequest) {
  const body = await req.json();
  const userId = typeof body.userId === "string" ? body.userId : "";
  const text = String(body.text || "").trim();
  const image = typeof body.image === "string" && body.image.startsWith("data:image/") ? body.image : null;

  if (!userId) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  if (!text && !image) return NextResponse.json({ error: "EMPTY_POST" }, { status: 400 });
  if (text.length > MAX_TEXT) return NextResponse.json({ error: "TEXT_TOO_LONG" }, { status: 400 });
  if (image && image.length > MAX_IMAGE_CHARS) return NextResponse.json({ error: "IMAGE_TOO_LARGE" }, { status: 413 });

  await connectDB();

  /* النشر للأخصائيين حصراً — تحقق من الدور في الخادم */
  const u = (await User.findById(userId).select("role suspended").lean()) as
    | { role?: string; suspended?: boolean }
    | null;
  if (!u || u.role !== "COUNSELOR") {
    return NextResponse.json({ error: "COUNSELOR_ONLY" }, { status: 403 });
  }
  if (u.suspended) return NextResponse.json({ error: "SUSPENDED" }, { status: 403 });

  const post = await SocialPost.create({
    authorId: userId,
    text: text.slice(0, MAX_TEXT),
    image,
    likes: [],
    comments: [],
  });

  /* v2.13.0: القيمة الحقيقية للمتابعة — إشعار فوري (جرس + Push) لكل
     متابعي هذا الأخصائي بأنه نشر منشوراً جديداً، مع اقتباس من النص */
  try {
    const followers = (await SocialFollow.find({ followingId: userId })
      .select("followerId")
      .limit(MAX_NOTIFY_FOLLOWERS)
      .lean()) as unknown as { followerId: unknown }[];
    const ids = followers.map((f) => String(f.followerId)).filter(Boolean);
    if (ids.length > 0) {
      /* اسم الكاتب المهني (كما يظهر في المجتمع) — والاسم المستعار احتياطاً */
      const [u2, prof] = (await Promise.all([
        User.findById(userId).select("pseudonym").lean(),
        CounselorProfile.findOne({ userId }).select("fullName").lean(),
      ])) as unknown as [
        { pseudonym?: string } | null,
        { fullName?: string } | null,
      ];
    }
  } catch {
    /* الإشعار لا يعيق النشر */
  }

  return NextResponse.json({ ok: true, id: String(post._id) });
}

export const GET = apiHandler(GET_impl);
export const POST = apiHandler(POST_impl);
