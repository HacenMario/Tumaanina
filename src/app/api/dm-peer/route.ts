import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/**
 * v2.9.0 — اسم الطرف في محادثة ما قبل الجلسة (حد أدنى من المعلومات العامة).
 * GET /api/dm-peer?id={userId} → { name }
 * يُستعمل عند فتح إشعار رسالة (?dm={id}) لتظهر نافذة المحادثة باسم الطرف
 * دون كشف أي بيانات أخرى (لا هاتف ولا بريد ولا حالة توثيق).
 */
async function GET_impl(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await connectDB();
  const u = (await User.findById(id).select("pseudonym role").lean()) as
    | { pseudonym?: string; role?: string }
    | null;
  if (!u) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json({ name: u.pseudonym || null, role: u.role || null });
}

export const GET = apiHandler(GET_impl);
