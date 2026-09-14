import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Clinic, ClinicAd, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/* ═ v1.16.0 — «من أعجب بالإعلان؟» لصاحب العيادة حصراً ═
   GET /api/ads/{id}/likes?userId={صاحب العيادة}
   • يتحقق أن الطالب حساب CLINIC فعّال وأن الإعلان يعود لعيادته —
     أي محاولة من غيره (حتى صاحب عيادة أخرى) تُرد 403.
   • يعيد قائمة أسماء المعجبين (الاسم المستعار) الأحدث أولاً —
     بلا أي بيانات حساسة (لا بريد ولا هواتف). */

async function GET_impl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const userId = (searchParams.get("userId") || "").trim();

  if (!/^[a-f0-9]{24}$/i.test(String(id || "")) || !/^[a-f0-9]{24}$/i.test(userId)) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  await connectDB();

  /* الطالب يجب أن يكون حساب عيادة فعّالاً */
  const user = (await User.findById(userId).select("role suspended").lean()) as
    | { role?: string; suspended?: boolean }
    | null;
  if (!user || user.role !== "CLINIC" || user.suspended) {
    return NextResponse.json({ error: "INVALID" }, { status: 401 });
  }

  /* عيادة الطالب */
  const clinic = (await Clinic.findOne({ ownerUserId: userId }).select("_id isActive").lean()) as
    | { _id: unknown; isActive?: boolean }
    | null;
  if (!clinic || clinic.isActive === false) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  /* الإعلان يجب أن يعود لعيادة الطالب حصراً */
  const ad = (await ClinicAd.findOne({ _id: id, clinicId: clinic._id }).select("likes").lean()) as
    | { likes?: unknown[] }
    | null;
  if (!ad) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const likeIds = (ad.likes || []).map((l) => String(l));
  if (!likeIds.length) {
    return NextResponse.json({ ok: true, likers: [], count: 0 });
  }

  /* أسماء المعجبين — بالترتيب الأحدث أولاً (آخر معجب أول القائمة) */
  const users = await User.find({ _id: { $in: likeIds } })
    .select("pseudonym suspended")
    .lean();
  const nameById = new Map<string, string>(
    users
      .filter((u) => !(u as { suspended?: boolean }).suspended)
      .map((u) => [String((u as { _id: unknown })._id), String((u as { pseudonym?: string }).pseudonym || "—").slice(0, 80)])
  );
  const likers = likeIds
    .reverse()
    .map((lid) => nameById.get(lid))
    .filter((n): n is string => !!n);

  return NextResponse.json({ ok: true, likers, count: likers.length });
}

export const GET = apiHandler(GET_impl);
