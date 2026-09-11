import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { SupportSession } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";
import { evaluateVictimChallenge, getVictimChallengeWinner } from "@/lib/server/client-challenge";
import { notifyAdminVictimChallengeWinner } from "@/lib/server/notify";

export const dynamic = "force-dynamic";

/* نافذة اعتبار الحضور: آخر نبض أحدث من هذا الحد = الطرف موجود في الغرفة */
const PRESENCE_WINDOW_MS = 35_000;

/**
 * نبض الحضور داخل غرفة الجلسة — يعمل على Railway وVercel معاً (REST).
 * العميل يستدعيه كل 10 ثوانٍ أثناء فتح الغرفة:
 *  - يحدّث victimLastSeenAt / counselorLastSeenAt على الجلسة
 *  - يرد بحالة الطرف الآخر (present/absent) لتحديث عبارة «بانتظار…»
 */
async function POST_impl(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const role = body?.role === "COUNSELOR" ? "COUNSELOR" : body?.role === "VICTIM" ? "VICTIM" : null;
  if (!role) return NextResponse.json({ error: "role required" }, { status: 400 });

  await connectDB();

  const now = new Date();
  const field = role === "VICTIM" ? "victimLastSeenAt" : "counselorLastSeenAt";
  const partnerField = role === "VICTIM" ? "counselorLastSeenAt" : "victimLastSeenAt";

  /* v1.6.0: أول دخول للغرفة يُضبط مرة واحدة (أساس احتساب التزام العميل في
     تحدّي العملاء — كانت الاعتماد على آخر نبض يُفشل أي جلسة >10 دقائق
     فبقى العداد 0/4 دائماً — طلب المستخدم الصريح) */
  if (role === "VICTIM") {
    await SupportSession.updateOne({ _id: id, victimFirstSeenAt: null }, { $set: { victimFirstSeenAt: now } }).catch(() => {});
  }

  const updated = (await SupportSession.findByIdAndUpdate(
    id,
    { $set: { [field]: now } },
    { new: true, select: "_id status victimId victimLastSeenAt counselorLastSeenAt" }
  ).lean()) as {
    _id: unknown;
    status: string;
    victimId: unknown;
    victimLastSeenAt: Date | null;
    counselorLastSeenAt: Date | null;
  } | null;

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const partnerSeen = updated[partnerField] ? new Date(updated[partnerField] as unknown as string).getTime() : 0;
  const partnerPresent = partnerSeen > 0 && Date.now() - partnerSeen < PRESENCE_WINDOW_MS;

  /* ─── v2.9.0: تحدي الالتزام للعميلين — يُقيَّم مع كل نبض حضور للعميل.
     الكتابة تحدث مرة واحدة فقط عند بلوغ 4 مواعيد متتالية دون فائز سابق،
     ثم يُشعَر الأدمين باسم الفائز الأول (fire-and-forget لا يعطل النبض). */
  if (role === "VICTIM") {
    void (async () => {
      try {
        const victimId = String((updated as unknown as { victimId?: unknown }).victimId ?? "");
        if (!victimId) return;
        const winnerBefore = await getVictimChallengeWinner();
        if (winnerBefore) return; /* هناك فائز — لا شيء يُحتسب */
        const res = await evaluateVictimChallenge(victimId);
        if (res.won && res.winner) {
          await notifyAdminVictimChallengeWinner(res.winner.name);
          console.log(`[CHALLENGE] فائز تحدي الالتزام: ${res.winner.name}`);
        }
      } catch (e) {
        console.error("[CHALLENGE] تقييم تحدي العميل فشل:", (e as Error).message);
      }
    })();
  }

  return NextResponse.json({
    ok: true,
    status: updated.status,
    partnerPresent,
    partnerLastSeenAt: updated[partnerField] || null,
  });
}

export const POST = apiHandler(POST_impl);
