import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { SupportSession } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/**
 * v2.8.0 — المواعيد المحجوزة لأخصائي ما في الأيام القادمة.
 * الموعد الذي اختاره أي عميل (طلب معلّق/مقبول/جارية) لا يمكن اختياره
 * مرة أخرى من طرف العميلين الآخرين — تعرضه الواجهة معطّلاً منذ البداية.
 * GET /api/taken-slots?counselorId=…&days=21
 * → { taken: { "YYYY-MM-DD": ["09:00", "13:00", …] } } (توقيت الجزائر UTC+1)
 */
async function GET_impl(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const counselorId = searchParams.get("counselorId");
  if (!counselorId) return NextResponse.json({ error: "counselorId required" }, { status: 400 });
  const days = Math.min(60, Math.max(1, Number(searchParams.get("days")) || 21));

  await connectDB();

  const from = new Date(Date.now() - 2 * 60 * 60 * 1000); // سماحية ساعتين للأيام القريبة
  const to = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const sessions = await SupportSession.find({
    counselorId,
    status: { $in: ["PENDING", "ACCEPTED", "ACTIVE"] },
    scheduledAt: { $gte: from, $lte: to },
  })
    .select("scheduledAt")
    .lean();

  /* مفتاح اليوم + الساعة بتوقيت الجزائر (UTC+1) — نفس منهج slotDateUTC1 */
  const taken: Record<string, string[]> = {};
  for (const s of sessions) {
    const d = new Date((s.scheduledAt as unknown as Date).getTime());
    const shifted = new Date(d.getTime() + 60 * 60 * 1000);
    const key = shifted.toISOString().slice(0, 10);
    const hhmm = shifted.toISOString().slice(11, 16);
    (taken[key] ||= []).push(hhmm);
  }

  return NextResponse.json({ taken });
}

export const GET = apiHandler(GET_impl);
