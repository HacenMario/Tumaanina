import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { FoundersContent } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/**
 * v2.8.0 — صفحة المؤسسين: محتوى عام يقرأه الجميع.
 * GET → المحتوى (نص تعريفي ثلاثي اللغات + المطوّر + قائمة الأخصائيين).
 * التعديل يتم من لوحة الإدارة عبر /api/admin action "founders-save".
 */
async function GET_impl() {
  await connectDB();
  const doc = (await FoundersContent.findOne({ key: "founders" }).lean()) as {
    textAr?: string;
    textFr?: string;
    textEn?: string;
    developerName?: string;
    developerRole?: string;
    members?: { name?: string; role?: string }[];
  } | null;

  return NextResponse.json({
    content: {
      textAr: doc?.textAr ?? "",
      textFr: doc?.textFr ?? "",
      textEn: doc?.textEn ?? "",
      developerName: doc?.developerName ?? "",
      developerRole: doc?.developerRole ?? "",
      members: Array.isArray(doc?.members) ? doc!.members : [],
    },
  });
}

export const GET = apiHandler(GET_impl);
