import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { SupportSession, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/* ─── بطاقة ملخص العميل قبل الجلسة — v2.5.3 ───
   للأخصائي فقط: يرى قبل بدء الحوار خلاصة المسار العلاجي مع هذا
   العميل: عدد الجلسات السابقة المكتملة، متوسط المزاج قبل/بعد،
   آخر ملاحظة كتبها العميل، تاريخ آخر جلسة، وعدد الجلسات التي
   سُجّل فيها علم الأزمة.
   حماية الوصول: userId المُمرَّر يجب أن يكون أخصائي هذه الجلسة نفسه. */
async function GET_impl(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  await connectDB();

  const session = (await SupportSession.findById(id)
    .select("counselorId victimId")
    .lean()) as { _id: unknown; counselorId: unknown; victimId: unknown } | null;
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  /* الأخصائي المعني فقط — لا أخصائي آخر يرى ملخص عميل ليس في علاجه */
  if (String(session.counselorId) !== String(userId)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const past = (await SupportSession.find({
    _id: { $ne: session._id },
    victimId: session.victimId,
    counselorId: session.counselorId,
    status: "COMPLETED",
  })
    .select("moodBefore moodAfter notes endedAt scheduledAt crisisFlag")
    .sort({ scheduledAt: -1 })
    .limit(12)
    .lean()) as {
    moodBefore?: number | null;
    moodAfter?: number | null;
    notes?: string | null;
    endedAt?: Date | null;
    scheduledAt?: Date | null;
    crisisFlag?: boolean;
  }[];

  const moodPairs = past.filter((s) => typeof s.moodBefore === "number" || typeof s.moodAfter === "number");
  const avg = (key: "moodBefore" | "moodAfter") => {
    const vals = past.map((s) => s[key]).filter((v): v is number => typeof v === "number");
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  };

  const lastWithNote = past.find((s) => s.notes && String(s.notes).trim());
  const lastAt = past[0]?.endedAt || past[0]?.scheduledAt || null;

  /* v2.7.0: رقم هاتف العميل — هذا المسار محمي للأخصائي المعني حصراً (403 لغيره)،
     وهو القناة الرسمية الوحيدة التي يصل فيها الرقم مع بطاقة ما قبل الجلسة
     ليتواصل معه عبر واتساب مباشرة */
  const victimDoc = (await User.findById(session.victimId)
    .select("phone")
    .lean()) as { phone?: string | null } | null;

  return NextResponse.json({
    summary: {
      previousSessions: past.length,
      avgMoodBefore: avg("moodBefore"),
      avgMoodAfter: avg("moodAfter"),
      moodSampleSize: moodPairs.length,
      lastNotes: lastWithNote ? String(lastWithNote.notes).slice(0, 500) : null,
      lastSessionAt: lastAt ? new Date(lastAt).toISOString() : null,
      crisisSessions: past.filter((s) => s.crisisFlag).length,
      phone: victimDoc?.phone ?? null,
    },
  });
}

export const GET = apiHandler(GET_impl);
