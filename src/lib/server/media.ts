/* ═ v1.18.0 — وسائط GridFS: رفع الفيديو بلا حد للحجم وتقديمه بالبثّ ═
   الفيديو الترويجي (في إعلان العيادة أو معرض صورها) لا معنى لتحديد حجمه
   بحدود BSON، لذا يُخزَّن في GridFS (bucket «media») خارج وثائق MongoDB:
   يرفعه العميل على دفعات عبر /api/media (route.ts) ثم تُجمَّع الدفعات
   هنا في ملف GridFS واحد يُقدَّم عبر /api/media/[id] بدعم Range كامل
   لتمرير المشغّل المدمج في المتصفح. كل ملف يحمل metadata.clinicId
   وmetadata.kind ليُتحقق من ملكيته قبل ربطه بإعلان أو معرض. */

import mongoose from "mongoose";
import { connectDB } from "@/lib/db";

export const MEDIA_BUCKET = "media";
/* سقف حماية تقني هادئ ضد إساءة الاستخدام — لا يُعرض في الواجهة أبداً
   (الواجهة بلا أي حد حجم؛ 250MB أكبر من أي مقطع ترويجي عملي) */
export const MAX_VIDEO_BYTES = 250_000_000;
export const CHUNK_BYTES = 3_500_000;

export interface GridFsFileInfo {
  _id: mongoose.Types.ObjectId;
  length: number;
  contentType?: string;
  metadata?: { clinicId?: string; kind?: string; name?: string } | null;
}

export function mediaBucket(): mongoose.mongo.GridFSBucket {
  const db = mongoose.connection.db;
  if (!db) throw new Error("DB_NOT_READY");
  return new mongoose.mongo.GridFSBucket(db, { bucketName: MEDIA_BUCKET });
}

/** رفع مخزن جاهز إلى GridFS مع بياناته الميتية — يعيد المعرّف كسلسلة */
export async function gridfsPutBuffer(
  buf: Buffer,
  opts: { contentType: string; name?: string; metadata: { clinicId: string; kind: string; name?: string } }
): Promise<string> {
  await connectDB();
  const bucket = mediaBucket();
  return new Promise<string>((resolve, reject) => {
    const stream = bucket.openUploadStream(opts.name || opts.metadata.name || "media", {
      contentType: opts.contentType,
      metadata: opts.metadata,
    });
    const id = String(stream.id);
    stream.on("error", reject);
    stream.on("finish", () => resolve(id));
    stream.end(buf);
  });
}

/** حذف ملف GridFS بأمان — يتجاهل غير الموجود */
export async function gridfsDeleteById(id: string): Promise<void> {
  try {
    if (!/^[a-f0-9]{24}$/i.test(id)) return;
    const bucket = mediaBucket();
    await bucket.delete(new mongoose.Types.ObjectId(id));
  } catch {
    /* الملف غير موجود أو حُذف سابقاً */
  }
}

/** معلومات ملف GridFS — null إن لم يوجد */
export async function gridfsFileInfo(id: string): Promise<GridFsFileInfo | null> {
  if (!/^[a-f0-9]{24}$/i.test(id)) return null;
  await connectDB();
  const bucket = mediaBucket();
  const files = (await bucket.find({ _id: new mongoose.Types.ObjectId(id) }).limit(1).toArray()) as unknown as GridFsFileInfo[];
  return files[0] || null;
}

/** هل الملف موجوداً في GridFS ومن ملكية العيادة المطلوبة؟ */
export async function mediaFileOwnedByClinic(url: string, clinicId: string): Promise<boolean> {
  const m = /^\/api\/media\/([a-f0-9]{24})$/i.exec(String(url || "").trim());
  if (!m) return false;
  const info = await gridfsFileInfo(m[1]);
  return !!info && String(info.metadata?.clinicId || "") === String(clinicId);
}

/** استخراج معرّفات /api/media من قائمة وسائط */
export function mediaIdsIn(items: string[]): string[] {
  const out: string[] = [];
  for (const it of items || []) {
    const m = /^\/api\/media\/([a-f0-9]{24})$/i.exec(String(it || "").trim());
    if (m) out.push(m[1]);
  }
  return out;
}

/** حذف ملفات GridFS اليتيمة — القديمة التي لم تعد ضمن القائمة الجديدة */
export async function deleteOrphanMedia(oldItems: string[], newItems: string[]): Promise<void> {
  const keep = new Set(mediaIdsIn(newItems));
  const oldIds = mediaIdsIn(oldItems);
  for (const id of oldIds) {
    if (!keep.has(id)) await gridfsDeleteById(id);
  }
}

/** قاعدة وسيط الفيديو: data:video قديم أو مرجع /api/media جديد */
export function isVideoItem(item: string): boolean {
  return item.startsWith("data:video/") || /^\/api\/media\/[a-f0-9]{24}$/i.test(item.trim());
}

/* ═ فيديوهات معرض العيادة — القائمة الموحّدة (قديم + GridFS) ═
   القديم: وثائق clinic_gallery_media تُقدَّم عبر /api/clinics/{id}/gallery/media/{i}
   الجديد: مراجع Clinic.galleryVideoRefs («/api/media/{fileId}»)
   الترتيب: القديم أولاً ثم الجديد — ويُستعمل في لوحة العيادة وصفحتها العامة */
export async function loadClinicGalleryVideos(
  ClinicGalleryMedia: mongoose.Model<any>,
  clinicId: string,
  refs: string[] | null | undefined
): Promise<{ url: string; mime: string }[]> {
  const out: { url: string; mime: string }[] = [];
  try {
    const legacy = await ClinicGalleryMedia.find({ clinicId }).sort({ createdAt: 1, _id: 1 }).select("mime").lean();
    legacy.forEach((v: Record<string, unknown>, i: number) => {
      out.push({ url: `/api/clinics/${clinicId}/gallery/media/${i}`, mime: String(v.mime || "video/mp4") });
    });
  } catch {
    /* مجموعة قديمة غير متاحة — نتجاهل */
  }
  for (const r of refs || []) {
    if (typeof r === "string" && /^\/api\/media\/[a-f0-9]{24}$/i.test(r)) {
      out.push({ url: r, mime: "video/mp4" });
    }
  }
  return out.slice(0, 2);
}
