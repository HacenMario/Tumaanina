import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { CrisisLog, SupportSession } from "@/lib/models";
import { listEnrichedCrisisLogs } from "@/lib/server/crisis";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

async function POST_impl(req: NextRequest) {
  const body = await req.json();
  const { sessionId, source, phrase, action, saidBy } = body;
  if (!phrase) return NextResponse.json({ error: "phrase required" }, { status: 400 });

  await connectDB();
  const log = await CrisisLog.create({
    sessionId: sessionId || null,
    source: source || "CLIENT",
    phrase,
    action: action || "CRISIS_BANNER_SHOWN",
    saidBy: saidBy || null, /* VICTIM | COUNSELOR — كاتب العبارة */
  });
  // وسم الجلسة أيضاً
  if (sessionId) {
    await SupportSession.updateOne(
      { _id: sessionId },
      { $set: { crisisFlag: true } }
    ).catch(() => {});
  }
  return NextResponse.json({
    ok: true,
    log: { id: String(log._id), sessionId: log.sessionId, source: log.source, phrase: log.phrase, action: log.action, saidBy: log.saidBy, createdAt: log.createdAt },
  });
}

async function GET_impl() {
  /* سجل مُثرى: الاسم المستعار للعميل + اسم الأخصائي + من كتب العبارة —
     يعمل حتى مع السجلات القديمة (الإثراء عند القراءة من الجلسة المرتبطة) */
  const logs = await listEnrichedCrisisLogs();
  return NextResponse.json({ logs });
}

export const GET = apiHandler(GET_impl);
export const POST = apiHandler(POST_impl);
