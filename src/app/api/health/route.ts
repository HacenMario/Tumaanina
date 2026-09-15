import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/** فحص الصحة — يؤكد الإصدار العاملة ويستخدم في التشخيص والمراقبة */
async function GET_impl() {
  const dbState = mongoose.connection.readyState; // 1 = متصل
  return NextResponse.json({
    ok: true,
    service: "tumaanina",
    version: "1.21.0",
    db: dbState === 1 ? "connected" : dbState === 2 ? "connecting" : "disconnected",
    time: new Date().toISOString(),
  });
}

export const GET = apiHandler(GET_impl);
