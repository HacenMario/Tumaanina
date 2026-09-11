import "server-only";
import { NextResponse } from "next/server";

/**
 * طمأنينة النفسي — شبكة أمان موحدة لمسارات API
 * ─────────────────────────────────────────────
 * يضمن أن أي استثناء في أي مسار يعيد JSON واضحاً بدل استجابة فارغة
 * (الاستجابة الفارغة تُظهر في المتصفح: "Unexpected end of JSON input").
 *
 * يعيد 503 لأخطاء الاتصال بقاعدة البيانات (قابلة للإعادة)، و500 لغيرها،
 * مع تفاصيل الخطأ في الحقل detail لتشخيص المشكلة من الكونسول مباشرة.
 */
type AnyFn = (...args: any[]) => Promise<Response>;

export function apiHandler(fn: AnyFn): AnyFn {
  return async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (e) {
      const err = e as { name?: string; message?: string };
      const msg = String(err?.message ?? e ?? "unexpected");
      console.error("[api-error]", err?.name ?? "Error", "-", msg);
      const dbDown =
        err?.name === "MongooseServerSelectionError" ||
        err?.name === "MongooseError" ||
        msg.includes("buffering timed out") ||
        msg.includes("ENOTFOUND") ||
        msg.includes("ETIMEDOUT") ||
        msg.includes("ECONNREFUSED") ||
        msg.includes("bad auth");
      return NextResponse.json(
        { error: dbDown ? "DB_UNAVAILABLE" : "SERVER_ERROR", detail: msg },
        { status: dbDown ? 503 : 500 }
      );
    }
  };
}
