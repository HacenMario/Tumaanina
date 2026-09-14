/* ═ v1.18.0 — رفع الفيديو إلى GridFS عبر /api/media (بلا حد للحجم) ═
   يقطّع الملف دفعة دفعة (~3.5MB) كي يتجاوز حدود أجسام الطلبات على أي
   مضيف، ثم يجمّعها الخادم في ملف GridFS واحد يعيد رابطه «/api/media/{id}».
   onProgress تُبلّغ بالنسبة المئوية 0-100 لعرضها أثناء الرفع. */

export interface UploadVideoResult {
  url: string;
  fileId: string;
  bytes: number;
}

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

  const report = (done: number) => {
    try {
      onProgress?.(Math.min(99, Math.round((done / Math.max(1, file.size)) * 100)));
    } catch {
      /* تجاهل */
    }
  };

  try {
    /* 2) الدفعات — بالترتيب، دفعة واحدة في الطيران لثبات الاتصال الضعيف */
    let sent = 0;
    let idx = 0;
    while (sent < file.size) {
      const blob = file.slice(sent, Math.min(sent + chunkSize, file.size));
      const res = await fetch(`/api/media?op=chunk&uid=${encodeURIComponent(uploadId)}&idx=${idx}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: blob,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "UPLOAD_CHUNK_FAILED");
      }
      sent += blob.size;
      idx += 1;
      report(sent);
    }

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
