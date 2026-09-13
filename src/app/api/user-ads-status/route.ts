import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/* ═ v1.15.0 — حالة رفض الإعلانات المدفوعة للمستخدم ═
   GET /api/user-ads-status?userId= → { adsOptOut } — تُقرأ في الإعدادات
   لعرض مفتاح «رفض الإعلانات المدفوعة» في حالته الصحيحة. */

async function GET_impl(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId || !/^[a-f0-9]{24}$/i.test(userId)) {
    return NextResponse.json({ adsOptOut: false });
  }
  await connectDB();
  const user = (await User.findById(userId).select("adsOptOut").lean()) as { adsOptOut?: boolean } | null;
  return NextResponse.json({ adsOptOut: user?.adsOptOut === true });
}

export const GET = apiHandler(GET_impl);
