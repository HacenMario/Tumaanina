import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Exercise, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/* ─── v2.14.0: حذف تمرين — منشئه أو الأدمين فقط ───
   DELETE { userId } */
async function DELETE_impl(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!userId) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });

  await connectDB();
  const u = (await User.findById(userId).select("role suspended").lean()) as
    | { role?: string; suspended?: boolean }
    | null;
  if (!u || u.suspended) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });

  const ex = (await Exercise.findById(id).select("createdBy").lean()) as
    | { createdBy?: unknown }
    | null;
  if (!ex) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const isOwner = String(ex.createdBy) === userId;
  const isAdmin = u.role === "ADMIN";
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "NOT_ALLOWED" }, { status: 403 });
  }

  await Exercise.findByIdAndDelete(id);
  return NextResponse.json({ ok: true });
}

export const DELETE = apiHandler(DELETE_impl);
