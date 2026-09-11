import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/**
 * v2.8.0 — حفظ تفعيل/تعطيل الإخفاء السريع مع الحساب نفسه (وليس الجهاز فقط).
 * POST { userId, enabled, hash? }
 * - enabled=true يتطلب hash (SHA-256 للرمز) — يُحفظ في مستند المستخدم.
 * - enabled=false يمسح الحالتين من الحساب.
 * localStorage يبقى احتياطاً محلياً؛ القاعدة هي المرجع عند الولوج من أي جهاز.
 */
async function POST_impl(req: NextRequest) {
  const body = await req.json();
  const { userId, enabled, hash } = body;
  if (!userId || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "userId and enabled required" }, { status: 400 });
  }
  await connectDB();

  if (enabled) {
    if (!hash || typeof hash !== "string" || hash.length < 32) {
      return NextResponse.json({ error: "HASH_REQUIRED" }, { status: 400 });
    }
    await User.updateOne({ _id: userId }, { $set: { quickHideEnabled: true, quickHideHash: hash } });
  } else {
    await User.updateOne({ _id: userId }, { $set: { quickHideEnabled: false, quickHideHash: null } });
  }

  return NextResponse.json({ ok: true });
}

/** GET ?userId=… → حالة الإخفاء السريع المحفوظة في الحساب */
async function GET_impl(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  await connectDB();
  const u = (await User.findById(userId).select("quickHideEnabled quickHideHash").lean()) as {
    quickHideEnabled?: boolean;
    quickHideHash?: string | null;
  } | null;
  if (!u) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({
    enabled: !!u.quickHideEnabled && !!u.quickHideHash,
    hash: u.quickHideHash || null,
  });
}

export const POST = apiHandler(POST_impl);
export const GET = apiHandler(GET_impl);
