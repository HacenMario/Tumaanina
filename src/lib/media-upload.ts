/* ═ v1.19.0 — رفع الفيديو إلى GridFS عبر /api/media (بلا حد للحجم) ═
   يقطّع الملف دفعة دفعة (~3.5MB) كي يتجاوز حدود أجسام الطلبات على أي
   مضيف، ثم يجمّعها الخادم في ملف GridFS واحد يعيد رابطه «/api/media/{id}».

   v1.19.0: تسريع الرفع — ثلاث دفعات في الطيران معاً بدل دفعة واحدة،
   مع إعادة محاولة واحدة لكل دفعة تعالج تقلبات الاتصال الضعيف تلقائياً،
   وonProgress تُبلّغ بالنسبة المئوية 0-100 أثناء الرفع. */

export interface UploadVideoResult {
  url: string;
  fileId: string;
  bytes: number;
}

/* عدد الدفعات المتزامنة — ثلاثة يضاعف السرعة عادةً دون إرهاق اتصال ضعيف */
const PARALLEL = 3;

export async function uploadVideoToMedia(
  file: File,
  userId: string,
  onProgress?: (pct: number) => void
): Promise<UploadVideoResult> {
  /* 1) بدء الجلسة */
  const startRes = await fetch("/api/media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, op: "start", mime: file.type || "video/mp4", name: file.name || "video", size: file.size }),
  });
  const startData = await startRes.json().catch(() => ({}));
  if (!startRes.ok || !startData.ok || !startData.uploadId) {
    throw new Error(startData.error || "UPLOAD_START_FAILED");
  }
  const uploadId = String(startData.uploadId);
  const chunkSize = Math.max(1024 * 512, Number(startData.chunkSize) || 3_500_000);
  const chunksCount = Math.max(1, Math.ceil(file.size / chunkSize));

  let sentBytes = 0;
  const report = () => {
    try {
      onProgress?.(Math.min(99, Math.round((sentBytes / Math.max(1, file.size)) * 100)));
    } catch {
      /* تجاهل */
    }
  };

  /* 2) دفعة واحدة — مع محاولة ثانية عند الإخفاق (انقطاع شبكة أو خطأ خادم عابر) */
  const sendChunk = async (idx: number): Promise<void> => {
    const from = idx * chunkSize;
    const blob = file.slice(from, Math.min(from + chunkSize, file.size));
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`/api/media?op=chunk&uid=${encodeURIComponent(uploadId)}&idx=${idx}`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: blob,
        });
        if (res.ok) {
          sentBytes += blob.size;
          report();
          return;
        }
        /* خطأ طلب دائم (4xx) لا تنفع فيه إعادة المحاولة */
        if (res.status < 500) break;
      } catch {
        /* شبكة — تُعاد المحاولة */
      }
    }
    throw new Error("UPLOAD_CHUNK_FAILED");
  };

  try {
    /* 2) الدفعات — ثلاثة في الطيران بالترتيب المؤشر لكل عامل */
    let next = 0;
    const worker = async () => {
      for (;;) {
        const idx = next;
        next += 1;
        if (idx >= chunksCount) return;
        await sendChunk(idx);
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, chunksCount) }, () => worker()));

    /* 3) الإنهاء والتجميع في GridFS */
    const commitRes = await fetch("/api/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, op: "commit", uploadId }),
    });
    const commitData = await commitRes.json().catch(() => ({}));
    if (!commitRes.ok || !commitData.ok || !commitData.url) {
      throw new Error(commitData.error || "UPLOAD_COMMIT_FAILED");
    }
    onProgress?.(100);
    return { url: String(commitData.url), fileId: String(commitData.fileId || ""), bytes: Number(commitData.bytes) || file.size };
  } catch (e) {
    /* إخفاق بأي سبب — تُلغى الجلسة وتُحذف دفعاتها */
    try {
      await fetch("/api/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, op: "abort", uploadId }),
      });
    } catch {
      /* تجاهل */
    }
    throw e;
  }
}
