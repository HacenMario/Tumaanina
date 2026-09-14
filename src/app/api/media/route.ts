import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { Clinic, MediaChunk, MediaUpload, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";
import { gridfsPutBuffer, MAX_VIDEO_BYTES, CHUNK_BYTES } from "@/lib/server/media";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* ═ v1.18.0 — رفع الفيديو الكبير بتقطيع عبر /api/media ═
   بلا حد للحجم في الواجهة: العميل يبدأ جلسة رفع ثم يدفع الملف دفعة دفعة
   (~3.5MB لكل طلب — أماناً من حدود أجسام الطلبات على كل المضيفين) وأخيراً
   يُجمَّع الملف في GridFS. حصري لحسابات العيادات النشطة (إعلاناتها
   ومعارضها) — لا يلمس أي بيانات مالية ولا أي سرّ من أسرار المنصة.

   POST /api/media  (JSON) {op:"start", mime, name, size} → {ok, uploadId}
   POST /api/media?op=chunk&uid=..&idx=..  (جسم ثنائي خام) → {ok, received}
   POST /api/media  (JSON) {op:"commit", uploadId} → {ok, url, fileId}
   POST /api/media  (JSON) {op:"abort", uploadId} → {ok} */

const MAX_CHUNK_B64 = 5_200_000; // دفعة ~3.8MB ثنائية
const MAX_CHUNKS = 80; // 80 × 3.5MB ≈ 280MB > السقف التقني

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

async function clinicContext(userId: unknown) {
  if (!userId || !/^[a-f0-9]{24}$/i.test(String(userId))) return null;
  const user = await User.findById(String(userId)).select("role suspended").lean();
  if (!user || (user as { role?: string }).role !== "CLINIC" || (user as { suspended?: boolean }).suspended) return null;
  const clinic = (await Clinic.findOne({ ownerUserId: String(userId) }).select("_id isActive").lean()) as Record<string, unknown> | null;
  if (!clinic || clinic.isActive === false) return null;
  return { userId: String(userId), clinicId: String(clinic._id) };
}

async function cleanupUpload(uploadId: string) {
  try {
    await MediaChunk.deleteMany({ uploadId });
    await MediaUpload.deleteOne({ _id: uploadId });
  } catch {
    /* تنظيف صامت */
  }
}

async function POST_impl(req: NextRequest) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const op = searchParams.get("op");

  /* ─── دفعة ثنائية خام ─── */
  if (op === "chunk") {
    const uid = searchParams.get("uid") || "";
    const idx = Number(searchParams.get("idx"));
    if (!/^[a-f0-9]{24}$/i.test(uid)) return bad("UPLOAD_NOT_FOUND", 404);
    const session = (await MediaUpload.findById(uid).lean()) as Record<string, unknown> | null;
    if (!session) return bad("UPLOAD_NOT_FOUND", 404);
    const ctx = await clinicContext(session.userId);
    if (!ctx || ctx.clinicId !== String(session.clinicId)) return bad("INVALID", 401);
    if (!Number.isInteger(idx) || idx < 0 || idx >= MAX_CHUNKS) return bad("BAD_CHUNK");
    const ab = await req.arrayBuffer();
    if (ab.byteLength === 0 || ab.byteLength > CHUNK_BYTES + 512_000) return bad("BAD_CHUNK");
    const b64 = Buffer.from(ab).toString("base64");
    if (b64.length > MAX_CHUNK_B64) return bad("BAD_CHUNK");
    await MediaChunk.updateOne(
      { uploadId: new mongoose.Types.ObjectId(uid), idx },
      { $set: { data: b64, createdAt: new Date() } },
      { upsert: true }
    );
    await MediaUpload.updateOne({ _id: uid }, { $set: { received: idx + 1 } });
    return NextResponse.json({ ok: true, received: ab.byteLength });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const ctx = await clinicContext(body.userId);
  if (!ctx) return bad("INVALID", 401);

  /* ─── بدء جلسة رفع ─── */
  if (body.op === "start") {
    const mime = String(body.mime || "video/mp4");
    if (!/^video\//i.test(mime)) return bad("INVALID_MIME");
    const size = Math.max(0, Math.round(Number(body.size) || 0));
    if (size > MAX_VIDEO_BYTES) return bad("VIDEO_TOO_BIG");
    /* تنظيف الجلسات المهجورة (أكثر من 24 ساعة) — احتياطاً مع TTL */
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
    const stale = (await MediaUpload.find({ createdAt: { $lt: dayAgo } }).select("_id").lean()) as Record<string, unknown>[];
    for (const s of stale) await cleanupUpload(String(s._id));
    const doc = await MediaUpload.create({
      clinicId: ctx.clinicId,
      userId: ctx.userId,
      mime,
      name: String(body.name || "").slice(0, 200),
      size,
      chunkSize: CHUNK_BYTES,
    });
    return NextResponse.json({ ok: true, uploadId: String((doc as unknown as { _id: unknown })._id), chunkSize: CHUNK_BYTES });
  }

  /* ─── الإنهاء: تجميع الدفعات في GridFS ─── */
  if (body.op === "commit") {
    const uid = String(body.uploadId || "");
    if (!/^[a-f0-9]{24}$/i.test(uid)) return bad("UPLOAD_NOT_FOUND", 404);
    const session = (await MediaUpload.findById(uid).lean()) as Record<string, unknown> | null;
    if (!session) return bad("UPLOAD_NOT_FOUND", 404);
    if (ctx.clinicId !== String(session.clinicId) || ctx.userId !== String(session.userId)) return bad("INVALID", 401);

    const chunks = (await MediaChunk.find({ uploadId: new mongoose.Types.ObjectId(uid) }).sort({ idx: 1 }).lean()) as Record<string, unknown>[];
    if (!chunks.length) return bad("NO_DATA");
    for (let i = 0; i < chunks.length; i++) {
      if (Number(chunks[i].idx) !== i) return bad("GAP_IN_CHUNKS");
    }
    const parts = chunks.map((c) => Buffer.from(String(c.data), "base64"));
    const total = parts.reduce((s, p) => s + p.length, 0);
    if (total > MAX_VIDEO_BYTES) {
      await cleanupUpload(uid);
      return bad("VIDEO_TOO_BIG");
    }
    const buf = Buffer.concat(parts);
    const mime = String(session.mime || "video/mp4");
    const fileId = await gridfsPutBuffer(buf, {
      contentType: mime,
      metadata: { clinicId: ctx.clinicId, kind: "video", name: String(session.name || "") },
    });
    await cleanupUpload(uid);
    return NextResponse.json({ ok: true, url: `/api/media/${fileId}`, fileId, bytes: total });
  }

  /* ─── إلغاء جلسة رفع ─── */
  if (body.op === "abort") {
    const uid = String(body.uploadId || "");
    if (/^[a-f0-9]{24}$/i.test(uid)) await cleanupUpload(uid);
    return NextResponse.json({ ok: true });
  }

  return bad("Unknown op");
}

export const POST = apiHandler(POST_impl);
