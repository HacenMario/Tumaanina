import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/** فحص صحة الخدمة — مفيد للمراقبة وRailway ولتأكيد الإصدار عند المستخدم */
async function GET_impl() {
  const dbState = mongoose.connection.readyState; // 1 = متصل
  return NextResponse.json({
    ok: true,
    service: "tumaanina",
    version: "2.5.2",
    db: dbState === 1 ? "connected" : dbState === 2 ? "connecting" : "disconnected",
    time: new Date().toISOString(),
  });
}

export const GET = apiHandler(GET_impl);
