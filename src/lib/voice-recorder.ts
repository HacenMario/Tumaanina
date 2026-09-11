"use client";

/**
 * v1.5.0 — مسجّل الرسائل الصوتية المشترك (غرفة الجلسة + محادثة ما قبل الجلسة).
 * MediaRecorder بأفضل صيغة يدعمها المتصفح، حد أقصى 60 ثانية، وتحويل
 * إلى data URL مضغوط يُرسل في حقل content مع type=voice.
 * يعمل على Chrome/Android/Safari/Firefox — والفشل يعود برسالة واضحة.
 */

export interface VoiceRecorderState {
  recording: boolean;
  seconds: number;
  busy: boolean;
}

const MAX_SECONDS = 60;

export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private elapsed = 0;
  private cancelled = false;

  static supported(): boolean {
    return (
      typeof window !== "undefined" &&
      typeof MediaRecorder !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia
    );
  }

  async start(): Promise<void> {
    if (this.recorder) return;
    if (!VoiceRecorder.supported()) throw new Error("UNSUPPORTED");
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = VoiceRecorder.pickMime();
    this.recorder = new MediaRecorder(this.stream, mime ? { mimeType: mime, audioBitsPerSecond: 24_000 } : undefined);
    this.chunks = [];
    this.cancelled = false;
    this.elapsed = 0;
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(250);
    this.timer = setInterval(() => {
      this.elapsed++;
      if (this.elapsed >= MAX_SECONDS) {
        this.stop().catch(() => {});
      }
    }, 1000);
  }

  /** إيقاف التسجيل وإرجاع الرسالة — null إذا أُلغيت أو كانت فارغة */
  async stop(): Promise<{ dataUrl: string; seconds: number } | null> {
    const rec = this.recorder;
    if (!rec) return null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;

    const done = new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      try {
        rec.stop();
      } catch {
        resolve();
      }
    });
    await done;

    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;

    if (this.cancelled || this.chunks.length === 0) {
      this.chunks = [];
      return null;
    }
    const blob = new Blob(this.chunks, { type: this.chunks[0]?.type || "audio/webm" });
    this.chunks = [];
    if (blob.size < 800) return null; /* تسجيل فارغ عملياً */
    const dataUrl = await VoiceRecorder.blobToDataUrl(blob);
    if (dataUrl.length > 1_150_000) throw new Error("TOO_LARGE");
    return { dataUrl, seconds: Math.max(1, this.elapsed) };
  }

  /** إلغاء التسجيل بلا إرسال */
  cancel(): void {
    this.cancelled = true;
    try {
      this.recorder?.stop();
    } catch {
      /* تجاهل */
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.chunks = [];
  }

  private static pickMime(): string | null {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    for (const c of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(c)) return c;
    }
    return null;
  }

  private static blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("READ_FAILED"));
      reader.readAsDataURL(blob);
    });
  }
}
