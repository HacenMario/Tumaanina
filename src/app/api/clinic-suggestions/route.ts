import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Clinic, ClinicSuggestion, SupportSession, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";
import { notifyUser } from "@/lib/server/notify";
import { SPECIALTIES, WILAYAS, WILAYA_LABELS } from "@/lib/constants";

export const dynamic = "force-dynamic";

/* ═ v1.14.0 — اقتراح عيادة من المختص للعميل (غرفة الجلسة) ═
   POST /api/clinic-suggestions
     { counselorUserId, sessionId, clinicId, note? }
   • للمختص (COUNSELOR) حصراً، وفي جلسة يخصّه فعلاً.
   • لا تكرار لنفس العيادة في نفس الجلسة.
   • عند النجاح: إشعار فوري للعميل بكامل تفاصيل العيادة
     (الاسم، الولاية/المدينة، التخصصات، سنوات الخبرة، ملاحظة المختص)
     والضغط عليه يفتح صفحة العيادة مباشرة (/?clinic={slug}).
   GET /api/clinic-suggestions?sessionId=…&userId=…
     اقتراحات جلسة (للعميل وللمختص معاً) — شريط «العيادات المقترحة». */

function wilayaName(w: string | null | undefined, lang: string): string {
  if (!w || !WILAYAS.includes(w)) return "";
  const l = WILAYA_LABELS[w];
  if (!l) return w;
  return (lang === "ar" ? l.ar : lang === "fr" ? l.fr : l.en) || w;
}

async function POST_impl(req: NextRequest) {
  const body = await req.json();
  const { counselorUserId, sessionId, clinicId, note } = body as {
    counselorUserId?: string;
    sessionId?: string;
    clinicId?: string;
    note?: string;
  };
  if (!counselorUserId || !sessionId || !clinicId) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  await connectDB();

  const counselor = (await User.findById(counselorUserId).select("role suspended").lean()) as { role?: string; suspended?: boolean } | null;
  if (!counselor || counselor.role !== "COUNSELOR" || counselor.suspended) {
    return NextResponse.json({ error: "INVALID" }, { status: 401 });
  }

  const session = (await SupportSession.findById(sessionId).select("counselorId victimId").lean()) as Record<string, unknown> | null;
  if (!session) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (String(session.counselorId as { toString(): string }) !== String(counselorUserId)) {
    return NextResponse.json({ error: "INVALID" }, { status: 401 });
  }

  const clinic = (await Clinic.findById(clinicId).select("name slug isActive wilaya city specialties customSpecialties foundedYear").lean()) as Record<string, unknown> | null;
  if (!clinic || clinic.isActive === false) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const clientUserId = String(session.victimId as { toString(): string });
  /* منطق صريح مضمون: اقتراح واحد لكل (جلسة × عيادة) — إعادة الإرسال تُحدّث
     الملاحظة فقط، والسباق النادر على الفهرس الفريد يُتجاهل بهدوء */
  const cleanNote = (note || "").trim().slice(0, 400) || null;
  const existingSugg = (await ClinicSuggestion.findOne({ sessionId, clinicId }).select("_id").lean()) as { _id?: unknown } | null;
  if (existingSugg) {
    await ClinicSuggestion.updateOne({ _id: existingSugg._id }, { $set: { note: cleanNote } });
  } else {
    try {
      await ClinicSuggestion.create({ sessionId, clinicId, counselorUserId, clientUserId, note: cleanNote });
    } catch (e) {
      const err = e as { code?: number };
      if (err?.code !== 11000) throw e;
    }
  }

  /* لغة العميل من حسابه — تفاصيل الإشعار كاملة كما طلب المستخدم */
  const client = (await User.findById(clientUserId).select("language").lean()) as { language?: string } | null;
  const lang = client?.language || "ar";
  const nowYear = new Date().getFullYear();
  const founded = Number(clinic.foundedYear) || 0;
  const yearsExp = founded > 0 ? Math.max(0, nowYear - founded) : 0;
  const loc = [wilayaName((clinic.wilaya as string) || null, lang), (clinic.city as string) || null].filter(Boolean).join(" - ");
  const specs = [...((clinic.specialties as string[]) || []), ...((clinic.customSpecialties as string[]) || [])]
    .filter((s) => (SPECIALTIES as readonly string[]).includes(s) || s.length > 0)
    .slice(0, 4)
    .join("، ");

  void notifyUser(clientUserId, "clinicSuggested", `/?clinic=${encodeURIComponent(String(clinic.slug || clinicId))}`, {
    clinic: String(clinic.name || ""),
    wilaya: loc || "—",
    specs: specs || "—",
    years: yearsExp > 0 ? String(yearsExp) : "—",
    note: (note || "").trim().slice(0, 200) || "—",
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}

async function GET_impl(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  const userId = searchParams.get("userId");
  if (!sessionId || !userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  await connectDB();

  const user = (await User.findById(userId).select("role").lean()) as { role?: string } | null;
  if (!user) return NextResponse.json({ error: "INVALID" }, { status: 401 });

  const session = (await SupportSession.findById(sessionId).select("counselorId victimId").lean()) as Record<string, unknown> | null;
  if (!session) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  /* الطرفان فقط يريان الاقتراحات */
  const uid = String(userId);
  const isCounselor = String(session.counselorId as { toString(): string }) === uid;
  const isClient = String(session.victimId as { toString(): string }) === uid;
  if (!isCounselor && !isClient) return NextResponse.json({ error: "INVALID" }, { status: 403 });

  const rows = await ClinicSuggestion.find({ sessionId }).sort({ createdAt: -1 }).limit(20).lean();
  const clinicIds = Array.from(new Set(rows.map((r) => String((r as unknown as { clinicId: { toString(): string } }).clinicId))));
  const clinics = clinicIds.length
    ? await Clinic.find({ _id: { $in: clinicIds } }).select("name slug wilaya city specialties customSpecialties foundedYear").lean()
    : [];
  const byId = new Map(clinics.map((c) => [String((c as unknown as { _id: unknown })._id), c as Record<string, unknown>]));

  const nowYear = new Date().getFullYear();
  return NextResponse.json({
    suggestions: rows.map((r) => {
      const rec = r as Record<string, unknown>;
      const cid = String((rec.clinicId as { toString(): string }).toString());
      const c = byId.get(cid) || {};
      const founded = Number(c.foundedYear) || 0;
      return {
        id: String(rec._id),
        clinicId: cid,
        clinicName: (c.name as string) || "—",
        clinicSlug: (c.slug as string) || null,
        wilaya: (c.wilaya as string) || null,
        city: (c.city as string) || null,
        specialties: (c.specialties as string[]) || [],
        customSpecialties: (c.customSpecialties as string[]) || [],
        yearsExperience: founded > 0 ? Math.max(0, nowYear - founded) : null,
        note: (rec.note as string) || null,
        createdAt: rec.createdAt,
      };
    }),
  });
}

export const POST = apiHandler(POST_impl);
export const GET = apiHandler(GET_impl);
