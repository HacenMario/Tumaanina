"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  UsersRound,
  ImagePlus,
  X,
  Send,
  Heart,
  MessageCircle,
  Trash2,
  BadgeCheck,
  UserPlus,
  UserCheck,
  Loader2,
  HeartHandshake,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

/**
 * v2.13.0 — مجتمع طمأنينة النفسي: منشورات الأخصائيين على غرار إنستغرام.
 * ─────────────────────────────────────────────────────────────────────
 * • الأخصائيون فقط ينشرون منشوراً (نص + صورة اختيارية مضغوطة في المتصفح).
 * • المنشور يراه كل مستخدمي المنصة، ويستطيع أي مستخدم مسجّل (عميل أو
 *   أخصائي) الإعجاب به وتعليقه كتابياً ومتابعة حساب صاحبه.
 * • v2.13.0:
 *   - المتابعة فعلية: تبقّة «من أتابعهم» تعرض منشورات المتابَعين حصراً،
 *     وعدّاد المتابعين بجانب اسم الكاتب، وإشعار فوري للمتابعين عند النشر.
 *   - قائمة المعجبين في نافذة منبثقة (الضغط على عدّاد الإعجاب، أو زر
 *     الإعجاب في منشور الكاتب نفسه كما طلب المستخدم).
 *   - تحديث صامت كل 3 دقائق أثناء بقاء الصفحة مفتوحة — دون إعادة
 *     تحميل الصفحة كاملة ودون مقاطعة ما يكتبه المستخدم.
 *   - إطار الكتابة (المنشور والتعليق) ثابت الحجم مع التفاف تلقائي
 *     للسطر عند نهاية الإطار + تمرير عمودي — لا تجعيد ولا تشويه للصفحة.
 */

interface PostAuthor {
  id: string;
  name: string;
  role: string;
  verified: boolean;
  photoUrl: string | null;
  specialties: string[];
  /* v2.13.0: عدد متابعي هذا الأخصائي */
  followersCount: number;
}

interface PostComment {
  id: string;
  text: string;
  createdAt: string | Date;
  authorName: string;
  authorRole: string;
}

/* v2.13.0: سجل معجب لنافذة المعجبين */
interface LikerRow {
  id: string;
  name: string;
  role: string;
}

interface FeedPost {
  id: string;
  text: string;
  image: string | null;
  createdAt: string;
  likesCount: number;
  likedByMe: boolean;
  commentsCount: number;
  comments: PostComment[];
  author: PostAuthor | null;
  followedByMe: boolean;
}

/* ضغط الصورة في المتصفح — أقصى بعد 1080px وجودة 0.82 ثم dataURL (JPEG) */
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read-failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode-failed"));
      img.onload = () => {
        try {
          const max = 1080;
          let { width, height } = img;
          if (width > max || height > max) {
            const ratio = Math.min(max / width, max / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("no-ctx"));
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        } catch (e) {
          reject(e as Error);
        }
      };
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

function timeAgo(iso: string | Date, t: { justNow: string; minAgo: string; hourAgo: string; dayAgo: string }): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return t.justNow;
  if (min < 60) return t.minAgo.replace("{n}", String(min));
  const h = Math.floor(min / 60);
  if (h < 24) return t.hourAgo.replace("{n}", String(h));
  return t.dayAgo.replace("{n}", String(Math.floor(h / 24)));
}

type FeedTab = "all" | "following";
const SILENT_REFRESH_MS = 3 * 60 * 1000; /* v2.13.0: تحديث صامت كل 3 دقائق */

export function CommunityView() {
  const { t } = useI18n();
  const { user } = useApp();
  const isCounselor = user?.role === "COUNSELOR";

  /* ─── حالة المنشورات ─── */
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [moreBusy, setMoreBusy] = useState(false);
  const [feed, setFeed] = useState<FeedTab>("all");

  /* مراجع حيّة للتحديث الصامت — بلا إعادة إنشاء المؤقّت */
  const pageRef = useRef(0);
  const feedRef = useRef<FeedTab>("all");

  /* ─── حالة النافذة الضوئية للصور ─── */
  const [lightbox, setLightbox] = useState<string | null>(null);

  const viewerId = user?.id || "";

  const load = useCallback(
    async (p: number, replace: boolean, f: FeedTab = feedRef.current) => {
      if (p === 0) setLoading(true);
      else setMoreBusy(true);
      try {
        const qs = new URLSearchParams({ page: String(p), feed: f });
        if (viewerId) qs.set("viewerId", viewerId);
        const res = await fetch(`/api/social?${qs.toString()}`);
        const data = await res.json();
        if (replace) setPosts(data.posts || []);
        else setPosts((prev) => [...prev, ...(data.posts || [])]);
        setHasMore(!!data.hasMore);
        setPage(p);
        pageRef.current = p;
        feedRef.current = f;
      } catch {
        /* تجاهل أخطاء الشبكة المؤقتة */
      } finally {
        setLoading(false);
        setMoreBusy(false);
      }
    },
    [viewerId]
  );

  useEffect(() => {
    load(0, true, "all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── v2.13.0: تحديث صامت كل 3 دقائق — يجلب المنشورات الجديدة دون
      إعادة تحميل الصفحة كاملة، ولا يعمل إلا والتبويب ظاهراً، ويحفظ
      حالة الواجهة (تعليقات موسّعة، نص التعليق قيد الكتابة…) ─── */
  useEffect(() => {
    const i = setInterval(() => {
      try {
        if (document.visibilityState !== "visible") return;
      } catch {
        /* تجاهل */
      }
      load(pageRef.current, true);
    }, SILENT_REFRESH_MS);
    return () => clearInterval(i);
  }, [load]);

  const switchFeed = (f: FeedTab) => {
    if (f === feed) return;
    setFeed(f);
    load(0, true, f);
  };

  /* ─── إعجاب فوري (تفاؤلي) ───
     v2.13.0: في منشور الكاتب نفسه، الضغط على زر الإعجاب يفتح قائمة
     المعجبين (نافذة منبثقة) إن وُجدوا — كما طلب المستخدم. */
  const [likersOpen, setLikersOpen] = useState<FeedPost | null>(null);

  const toggleLike = async (post: FeedPost) => {
    if (!user) return;
    const isMine = post.author?.id === user.id;
    if (isMine) {
      /* منشوري: زر الإعجاب يعرض قائمة المعجبين إن وُجدوا */
      if (post.likesCount > 0) setLikersOpen(post);
      return;
    }
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? { ...p, likedByMe: !p.likedByMe, likesCount: p.likesCount + (p.likedByMe ? -1 : 1) }
          : p
      )
    );
    try {
      await fetch(`/api/social/${post.id}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
    } catch {
      /* الارتداد — نعيد الحالة عند الفشل */
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? { ...p, likedByMe: post.likedByMe, likesCount: post.likesCount }
            : p
        )
      );
    }
  };

  /* ─── متابعة / إلغاء متابعة ─── */
  const toggleFollow = async (post: FeedPost) => {
    if (!user) return;
    const nowFollowing = !post.followedByMe;
    setPosts((prev) =>
      prev.map((p) =>
        p.author && p.author.id === post.author?.id
          ? {
              ...p,
              followedByMe: nowFollowing,
              /* v2.13.0: عدّاد المتابعين يتحدّث فوراً */
              author: p.author
                ? { ...p.author, followersCount: Math.max(0, p.author.followersCount + (nowFollowing ? 1 : -1)) }
                : p.author,
            }
          : p
      )
    );
    try {
      await fetch("/api/social/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, targetId: post.author?.id }),
      });
    } catch {
      /* تجاهل */
    }
  };

  const deletePost = async (post: FeedPost) => {
    if (!user) return;
    if (!window.confirm(t.community.deleteConfirm)) return;
    setPosts((prev) => prev.filter((p) => p.id !== post.id));
    try {
      await fetch(`/api/social/${post.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
    } catch {
      /* تجاهل */
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 md:py-14">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-2 mb-8">
        <h1 className="text-2xl md:text-3xl font-black flex items-center gap-2.5">
          <span className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <UsersRound className="h-5.5 w-5.5 text-primary" />
          </span>
          {t.community.title}
        </h1>
        <p className="text-muted-foreground leading-relaxed">{t.community.desc}</p>
      </motion.div>

      {isCounselor && <Composer onPublished={() => load(0, true)} />}

      {/* v2.13.0: تبقّة العرض — الكل / من أتابعهم (قيمة حقيقية للمتابعة) */}
      <div className="grid grid-cols-2 gap-2 mb-5">
        {([
          { key: "all" as FeedTab, label: t.community.tabAll },
          { key: "following" as FeedTab, label: t.community.tabFollowing },
        ]).map((tb) => (
          <button
            key={tb.key}
            onClick={() => switchFeed(tb.key)}
            disabled={tb.key === "following" && !user}
            className={`rounded-xl py-2.5 text-sm font-black transition-all disabled:opacity-45 disabled:cursor-not-allowed ${
              feed === tb.key
                ? "gradient-primary text-white shadow"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {tb.key === "following" ? <UserCheck className="inline h-4 w-4 me-1.5 -mt-0.5" /> : <UsersRound className="inline h-4 w-4 me-1.5 -mt-0.5" />}
            {tb.label}
          </button>
        ))}
      </div>

      {/* قائمة المنشورات */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="h-52 animate-pulse bg-muted/50 border-border/50" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center space-y-3 text-muted-foreground">
            {feed === "following" ? (
              <>
                <HeartHandshake className="h-10 w-10 mx-auto opacity-40" />
                <p className="font-semibold">{t.community.emptyFollowing}</p>
                <p className="text-xs leading-relaxed max-w-sm mx-auto">{t.community.emptyFollowingDesc}</p>
                <Button variant="outline" size="sm" className="rounded-xl font-black border-primary/40 text-primary" onClick={() => switchFeed("all")}>
                  {t.community.tabAll}
                </Button>
              </>
            ) : (
              <>
                <UsersRound className="h-10 w-10 mx-auto opacity-40" />
                <p className="font-semibold">{t.community.empty}</p>
                <p className="text-xs leading-relaxed max-w-sm mx-auto">{t.community.emptyDesc}</p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              isMine={!!user && post.author?.id === user.id}
              onLike={() => toggleLike(post)}
              onFollow={() => toggleFollow(post)}
              onDelete={() => deletePost(post)}
              onImage={() => post.image && setLightbox(post.image)}
              onShowLikers={() => setLikersOpen(post)}
              onCommentAdded={(c) =>
                setPosts((prev) =>
                  prev.map((p) =>
                    p.id === post.id
                      ? { ...p, commentsCount: p.commentsCount + 1, comments: [...p.comments, c] }
                      : p
                  )
                )
              }
              onShowAll={async () => {
                try {
                  const res = await fetch(`/api/social/${post.id}/comments`);
                  const data = await res.json();
                  if (Array.isArray(data.comments)) {
                    setPosts((prev) =>
                      prev.map((p) => (p.id === post.id ? { ...p, comments: data.comments } : p))
                    );
                  }
                } catch {
                  /* تجاهل */
                }
              }}
            />
          ))}

          {hasMore && (
            <Button
              variant="outline"
              className="w-full rounded-xl font-black h-12"
              disabled={moreBusy}
              onClick={() => load(page + 1, false)}
            >
              {moreBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : t.community.loadMore}
            </Button>
          )}
        </div>
      )}

      {/* النافذة الضوئية للصور */}
      <Dialog open={!!lightbox} onOpenChange={(v) => !v && setLightbox(null)}>
        <DialogContent className="sm:max-w-2xl p-2">
          {/* v1.5.0: عنوان sr-only إلزامي لكل DialogContent (تحذير الوصولية) */}
          <DialogTitle className="sr-only">{t.community.imagePreview || "—"}</DialogTitle>
          {lightbox && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lightbox} alt="" className="w-full max-h-[75dvh] object-contain rounded-xl" />
          )}
        </DialogContent>
      </Dialog>

      {/* v2.13.0: نافذة قائمة المعجبين بالمنشور */}
      <LikersDialog post={likersOpen} onClose={() => setLikersOpen(null)} />
    </div>
  );
}

/* ─── v2.13.0: نافذة المعجبين — من أعجب بالمنشور ─── */
function LikersDialog({ post, onClose }: { post: FeedPost | null; onClose: () => void }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<LikerRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!post) {
      setRows(null);
      return;
    }
    setBusy(true);
    setRows(null);
    let cancelled = false;
    fetch(`/api/social/${post.id}/likes`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setRows(Array.isArray(d?.likers) ? d.likers : []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [post]);

  return (
    <Dialog open={!!post} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-start text-base flex items-center gap-2">
            <Heart className="h-4.5 w-4.5 text-rose-500 fill-current" />
            {t.community.likersTitle}
          </DialogTitle>
        </DialogHeader>
        <div className="px-5 pb-5 max-h-[55dvh] overflow-y-auto space-y-1.5 scrollbar-thin">
          {busy ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !rows || rows.length === 0 ? (
            <p className="py-8 text-center text-sm font-bold text-muted-foreground">{t.community.noLikers}</p>
          ) : (
            rows.map((lk) => (
              <div key={lk.id} className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
                <span className="h-8 w-8 rounded-lg gradient-primary text-white flex items-center justify-center text-xs font-black shrink-0">
                  {lk.name.replace("د. ", "").charAt(0) || "—"}
                </span>
                <span className="text-sm font-black truncate" dir="auto">{lk.name}</span>
                {lk.role === "COUNSELOR" && (
                  <Badge className="text-[9px] font-black bg-primary/10 text-primary border-0 px-1.5 py-0 shrink-0">
                    {t.community.specialistBadge}
                  </Badge>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── بطاقة منشور ─── */
function PostCard({
  post,
  isMine,
  onLike,
  onFollow,
  onDelete,
  onImage,
  onShowLikers,
  onCommentAdded,
  onShowAll,
}: {
  post: FeedPost;
  isMine: boolean;
  onLike: () => void;
  onFollow: () => void;
  onDelete: () => void;
  onImage: () => void;
  onShowLikers: () => void;
  onCommentAdded: (c: PostComment) => void;
  onShowAll: () => void;
}) {
  const { t } = useI18n();
  const { user } = useApp();
  const [showComments, setShowComments] = useState(post.comments.length > 0);
  const [commentText, setCommentText] = useState("");
  const [busy, setBusy] = useState(false);
  const [allShown, setAllShown] = useState(false);

  const submitComment = async () => {
    const text = commentText.trim();
    if (!text || !user || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/social/${post.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, text }),
      });
      const data = await res.json();
      if (data.ok && data.comment) {
        onCommentAdded({
          id: `me:${Date.now()}`,
          text: data.comment.text,
          createdAt: data.comment.createdAt,
          authorName: data.comment.authorName,
          authorRole: data.comment.authorRole,
        });
        setCommentText("");
        setShowComments(true);
        setAllShown(true);
      }
    } catch {
      /* تجاهل */
    } finally {
      setBusy(false);
    }
  };

  const a = post.author;
  const comments = post.comments;

  return (
    <Card className="border-border/70 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-5 space-y-3.5">
        {/* رأس المنشور: الكاتب + زر المتابعة + الحذف */}
        <div className="flex items-start gap-3">
          <Avatar className="h-11 w-11 rounded-xl">
            {a?.photoUrl ? <AvatarImage src={a.photoUrl} alt={a.name} className="rounded-xl object-cover" /> : null}
            <AvatarFallback className="gradient-primary text-white rounded-xl font-black">
              {(a?.name || "—").replace("د. ", "").charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-black text-sm leading-tight" dir="auto">{a?.name || "—"}</span>
              {a?.verified && (
                <BadgeCheck className="h-4 w-4 text-primary shrink-0" />
              )}
              {a?.role === "COUNSELOR" && (
                <span className="text-[10px] font-black text-primary bg-primary/10 rounded-full px-2 py-0.5">
                  {t.community.specialistBadge}
                </span>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground font-semibold">
              {timeAgo(post.createdAt, t.time)}
              {a && a.specialties.length > 0 && (
                <span dir="auto"> · {a.specialties.slice(0, 2).join(" · ")}</span>
              )}
              {/* v2.13.0: عدّاد المتابعين — قيمة حقيقية للمتابعة */}
              {a?.role === "COUNSELOR" && a.followersCount > 0 && (
                <span dir="auto"> · {t.community.followersCount.replace("{n}", String(a.followersCount))}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {a && user && a.id !== user.id && a.role === "COUNSELOR" && (
              <Button
                size="sm"
                variant={post.followedByMe ? "secondary" : "outline"}
                className={`rounded-full font-black text-xs h-8 px-3 ${post.followedByMe ? "" : "border-primary/40 text-primary"}`}
                onClick={onFollow}
              >
                {post.followedByMe ? <UserCheck className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
                {post.followedByMe ? t.community.following : t.community.follow}
              </Button>
            )}
            {isMine && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-destructive"
                onClick={onDelete}
                aria-label={t.community.deletePost}
                title={t.community.deletePost}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* النص */}
        {post.text && (
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words" dir="auto">
            {post.text}
          </p>
        )}

        {/* الصورة */}
        {post.image && (
          <button onClick={onImage} className="block w-full rounded-2xl overflow-hidden border border-border/60">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.image} alt="" className="w-full max-h-96 object-cover" loading="lazy" />
          </button>
        )}

        {/* أزرار التفاعل */}
        <div className="flex items-center gap-4 pt-0.5">
          <button
            onClick={onLike}
            disabled={!user || (isMine && post.likesCount === 0)}
            title={isMine ? t.community.likersTitle : !user ? t.community.loginToInteract : undefined}
            className={`flex items-center gap-1.5 text-xs font-black transition-colors ${
              post.likedByMe ? "text-rose-500" : "text-muted-foreground hover:text-rose-500"
            } disabled:opacity-50`}
          >
            <Heart className={`h-4.5 w-4.5 ${post.likedByMe ? "fill-current" : ""}`} />
            {post.likesCount > 0 ? post.likesCount : t.community.like}
          </button>
          {/* v2.13.0: عدّاد الإعجاب قابل للضغط — يفتح قائمة المعجبين */}
          {!isMine && post.likesCount > 0 && (
            <button
              onClick={onShowLikers}
              title={t.community.likersTitle}
              className="text-[11px] font-black text-muted-foreground hover:text-rose-500 transition-colors -ms-2"
            >
              {t.community.viewLikers}
            </button>
          )}
          <button
            onClick={() => setShowComments((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-black text-muted-foreground hover:text-primary transition-colors"
          >
            <MessageCircle className="h-4.5 w-4.5" />
            {post.commentsCount > 0 ? `${post.commentsCount}` : t.community.comment}
          </button>
        </div>

        {/* التعليقات */}
        {showComments && (
          <div className="space-y-2.5 pt-1">
            {comments.length > 0 && (
              <div className="space-y-2">
                {(allShown ? comments : comments.slice(-2)).map((c) => (
                  <div key={c.id} className="rounded-xl bg-muted/50 px-3.5 py-2.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-black text-foreground" dir="auto">{c.authorName}</span>
                      {c.authorRole === "COUNSELOR" && (
                        <span className="text-[9px] font-black text-primary bg-primary/10 rounded-full px-1.5 py-0.5">
                          {t.community.specialistBadge}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground/80 font-semibold">
                        {timeAgo(c.createdAt, t.time)}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed mt-0.5 break-words whitespace-pre-wrap" dir="auto">{c.text}</p>
                  </div>
                ))}
                {!allShown && post.commentsCount > 2 && (
                  <button
                    onClick={() => {
                      onShowAll();
                      setAllShown(true);
                    }}
                    className="text-[11px] font-black text-primary hover:underline"
                  >
                    {t.community.viewAllComments.replace("{n}", String(post.commentsCount))}
                  </button>
                )}
              </div>
            )}

            {/* حقل تعليق جديد — v2.13.0: إطار ثابت مع تلفيف تلقائي وتمرير */}
            {user ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <Textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder={t.community.commentPlaceholder}
                    className="min-h-10 max-h-32 overflow-y-auto field-sizing-fixed w-full rounded-xl bg-card text-sm py-2 resize-none"
                    rows={1}
                    maxLength={1000}
                    dir="auto"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        submitComment();
                      }
                    }}
                  />
                </div>
                <Button
                  size="icon"
                  className="gradient-primary text-white rounded-xl h-10 w-10 shrink-0"
                  disabled={!commentText.trim() || busy}
                  onClick={submitComment}
                  aria-label={t.community.send}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 rtl:-scale-x-100" />}
                </Button>
              </div>
            ) : (
              <p className="text-[11px] font-bold text-muted-foreground">{t.community.loginToInteract}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── محرّر منشور جديد — للأخصائيين فقط ─── */
function Composer({ onPublished }: { onPublished: () => void }) {
  const { t } = useI18n();
  const { user } = useApp();
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const pickImage = async (f: File | null) => {
    if (!f) return;
    setError("");
    try {
      const dataUrl = await compressImage(f);
      setImage(dataUrl);
    } catch {
      setError(t.community.imageTooLarge);
    }
  };

  const publish = async () => {
    if (!user || busy) return;
    if (!text.trim() && !image) {
      setError(t.community.needContent);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, text: text.trim(), image }),
      });
      const data = await res.json();
      if (data.ok) {
        setText("");
        setImage(null);
        onPublished();
      } else if (data.error === "IMAGE_TOO_LARGE") {
        setError(t.community.imageTooLarge);
      } else {
        setError(t.common.errorServer);
      }
    } catch {
      setError(t.common.errorServer);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-primary/30 shadow-lg shadow-primary/5 mb-7">
      <CardContent className="p-5 space-y-3">
        {/* v2.13.0: إطار ثابت مع تلفيف السطر تلقائياً عند نهاية الإطار
            وتمرير عمودي بعد الارتفاع الأقصى — لا تجعيد ولا تشويه للصفحة */}
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t.community.composerPlaceholder}
          className="min-h-24 max-h-60 overflow-y-auto field-sizing-fixed w-full rounded-xl bg-card text-sm resize-none"
          maxLength={3000}
          dir="auto"
        />
        {image && (
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="" className="h-28 rounded-xl border border-border object-cover" />
            <button
              onClick={() => setImage(null)}
              className="absolute -top-2 -end-2 h-6 w-6 rounded-full bg-destructive text-white flex items-center justify-center shadow"
              aria-label={t.community.removeImage}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {error && <div className="rounded-xl bg-destructive/10 text-destructive text-xs font-bold px-3.5 py-2.5">{error}</div>}
        <div className="flex items-center justify-between gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => pickImage(e.target.files?.[0] || null)}
          />
          <Button variant="outline" className="rounded-xl font-bold" onClick={() => fileRef.current?.click()}>
            <ImagePlus className="h-4 w-4" />
            {t.community.addImage}
          </Button>
          <Button
            className="gradient-primary text-white font-black rounded-xl px-6"
            disabled={busy || (!text.trim() && !image)}
            onClick={publish}
          >
            {busy ? t.common.loading : t.community.composerAction}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
