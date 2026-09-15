import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/* ═ v1.21.0 — نزع نظام رفع الفيديو كلياً (طلب المستخدم) ═
   كانت هذه المسار يرفع الفيديوهات بتقطيعها دفعة دفعة ويجمعها في GridFS —
   نُزع بالكامل لتجنّب استهلاك مساحة قاعدة البيانات المسموح بها (512MB).
   المسار يبقى حياً ليعيد رفضاً واضحاً لأي عميل قديم مخبّأ، أما تقديم
   الفيديوهات القديمة المحفوظة سابقاً فما زال يعمل عبر /api/media/{id}
   كي لا تنكسر الإعلانات والمعارف القديمة. */

async function POST_impl() {
  return NextResponse.json(
    { error: "MEDIA_DISABLED", message: "Video upload removed in v1.21.0" },
    { status: 410 }
  );
}

export const POST = apiHandler(POST_impl);
