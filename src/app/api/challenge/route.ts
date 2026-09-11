import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { apiHandler } from "@/lib/server/api";
import { challengeStatus, ensureChallengeState, registerClick } from "@/lib/server/challenge";
import { victimChallengeStatus, evaluateVictimChallenge, getVictimChallengeWinner } from "@/lib/server/client-challenge";
import { notifyAdminChallengeWinner, notifyAdminVictimChallengeWinner } from "@/lib/server/notify";

export const dynamic = "force-dynamic";

/**
 * v2.7.0 — التحدي الداخلي الخاص بالمختصين
 * ─────────────────────────────────────────────────────────
 * GET  /api/challenge?userId=…      → حالة التحدي (الصلاحية + تقدمي + الفائز)
 * POST /api/challenge { userId }    → تسجيل ضغطة واحدة على علم الجزائر
 *                                     عند بلوغ العدد المطلوب: حسم الفوز ذرياً
 *                                     + إشعار فوري في حساب الأدمين باسم الفائز
 *
 * ملاحظة أمنية مقصودة: العدد المطلوب لا تستهين به الواجهة ولا يُعلَن —
 * الواجهة تعرض عدّاد ضغطاتي فقط، واكتشاف القاعدة جزء من اللغز.
 */
async function GET_impl(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  await connectDB();

  /* ─── v2.9.0: تحدي الالتزام للعميلين — GET /api/challenge?victim=1&userId=…
     يعيد سلسلة مواعيدي المتتالية (تأخير ≤10 دقائق) + الفائز إن وُجد.
     وإن بلغت السلسلة 4 دون فائز سابق يُحسم الفوز هنا أيضاً (كتابة واحدة
     في العمر) — يضمن أن الفائز يُعلَن حتى لو لم يعد يفتح غرفة. ─── */
  if (searchParams.get("victim") === "1") {
    if (userId && !(await getVictimChallengeWinner())) {
      const res = await evaluateVictimChallenge(String(userId)).catch(() => null);
      if (res?.won && res.winner) void notifyAdminVictimChallengeWinner(res.winner.name).catch(() => {});
    }
    const vstatus = await victimChallengeStatus(userId || null);
    return NextResponse.json({ ok: true, victim: true, ...vstatus });
  }

  await ensureChallengeState();

  const status = await challengeStatus(userId || null);
  /* العدد المطلوب سرّ اللغز — لا يُرسَل إلى العميل إطلاقاً */
  const { required, ...publicStatus } = status;
  void required;
  return NextResponse.json({ ok: true, ...publicStatus });
}

async function POST_impl(req: NextRequest) {
  const body = await req.json();
  const userId = String(body?.userId || "");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  await connectDB();
  await ensureChallengeState();

  const result = await registerClick(userId);
  if ("error" in result) {
    /* CHALLENGE_ENDED / COUNSELOR_ONLY / SUSPENDED / INVALID — صامتة للواجهة */
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  /* أول فوز في المنصة: إشعار فوري في حساب الأدمين باسم الفائز (fire-and-forget) */
  if (result.won) {
    notifyAdminChallengeWinner(result.winner?.name || "").catch(() => {});
  }

  /* العدد المطلوب سرّ اللغز — يكفي العميل: عدّاد ضغطاته وحالة الفوز */
  const { required, ...publicResult } = result;
  void required;
  return NextResponse.json({ ok: true, ...publicResult });
}

export const GET = apiHandler(GET_impl);
export const POST = apiHandler(POST_impl);
