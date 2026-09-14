import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Clinic, ClinicBooking, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";
import { notifyUser } from "@/lib/server/notify";
import { SLOT_TIMES } from "@/lib/constants";

export const dynamic = "force-dynamic";

/* ═ v1.14.0 — حجز جلسة حضورية في العيادة ═
   POST /api/clinics/{id}/book — للعميل المسجّل (VICTIM) حصراً:
     { userId, name, phone, date: "YYYY-MM-DD", slot: "HH:MM", reason? }
   • موعد واحد لكل (عيادة + تاريخ + ساعة) — الفحص على الحجوزات
     الحية فقط (بانتظار/مؤكد)، الملغى والمكتمل يحرّران الوقت.
   • التاريخ يجب أن يكون من اليوم إلى +60 يوماً، والساعة من SLOT_TIMES.
   • عند النجاح يصل إشعار فوري لصاحب العيادة بالتفاصيل الكاملة.
   GET /api/clinics/{id}/book?date=YYYY-MM-DD — الساعات المحجوزة لذلك اليوم. */

/* v1.16.0: التاريخ الموحد YYYY/MM/DD HH:MM:SS في إشعارات الحجز */
function fmtWhen(d: unknown, s2: unknown): string {
  return `${String(d ?? "").replaceAll("-", "/")} ${String(s2 ?? "")}:00`;
}

async function GET_impl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const date = (searchParams.get("date") || "").trim();
  await connectDB();

  if (!/^[a-f0-9]{24}$/i.test(String(id || "")) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  const busy = await ClinicBooking.find({ clinicId: id, date, status: { $in: ["PENDING", "CONFIRMED"] } })
    .select("slot")
    .lean();
  return NextResponse.json({ taken: busy.map((b) => (b as unknown as { slot: string }).slot) });
}

async function POST_impl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();
  await connectDB();

  const { userId, name, phone, date, slot, reason, packIndex } = body as {
    userId?: string;
    name?: string;
    phone?: string;
    date?: string;
    slot?: string;
    reason?: string;
    packIndex?: number;
  };

  if (!/^[a-f0-9]{24}$/i.test(String(userId || "")) || !/^[a-f0-9]{24}$/i.test(String(id || ""))) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  const nm = String(name || "").trim().slice(0, 120);
  const ph = String(phone || "").replace(/\D/g, "");
  if (!nm || ph.length < 7 || ph.length > 15) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) {
    return NextResponse.json({ error: "BAD_SLOT" }, { status: 400 });
  }
  /* التاريخ: من اليوم إلى +60 يوماً (بتوقيت الجزائر UTC+1) */
  const nowDz = new Date(Date.now() + 60 * 60 * 1000);
  const today = nowDz.toISOString().slice(0, 10);
  const maxDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (String(date) < today || String(date) > maxDate) {
    return NextResponse.json({ error: "BAD_DATE" }, { status: 400 });
  }
  /* v1.16.0: الساعة يجب أن تكون من مواعيد العيادة قبل كل فحص لاحق
     حتى نعرف قيمتها عند فحص المواعيد الماضية */

  const [user, clinic] = await Promise.all([
    User.findById(userId).select("role suspended").lean(),
    Clinic.findById(id).select("_id name slug isActive ownerUserId address wilaya city slots packs").lean(),
  ]);
  if (!user || (user as { role?: string }).role !== "VICTIM" || (user as { suspended?: boolean }).suspended) {
    return NextResponse.json({ error: "INVALID" }, { status: 401 });
  }
  if (!clinic || (clinic as { isActive?: boolean }).isActive === false) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  /* v1.15.0: الساعة يجب أن تكون من مواعيد العيادة نفسها إن عرّفت مواعيد،
     وإلا من المواعيد الافتراضية للمنصة */
  const clinicSlots = ((clinic as unknown as { slots?: string[] }).slots || []) as string[];
  const allowed = clinicSlots.length ? clinicSlots : (SLOT_TIMES as readonly string[]);
  if (!(allowed as readonly string[]).includes(String(slot))) {
    return NextResponse.json({ error: "BAD_SLOT" }, { status: 400 });
  }

  /* v1.16.0: لا حجز في موعد ماضٍ — إن كان التاريخ اليوم فلا تُقبل إلا
     الساعات اللاحقة للحظة الحالية بتوقيت الجزائر (مقارنة HH:MM نصية كافية
     لأن الصيغة موحّدة zero-padded) */
  if (String(date) === today) {
    const nowHHMM = nowDz.toISOString().slice(11, 16);
    if (String(slot || "") <= nowHHMM) {
      return NextResponse.json({ error: "SLOT_PAST" }, { status: 400 });
    }
  }

  /* v1.17.0: اختيار باقة (Packs) عند الحجز — اختياري: إن أُرسل فهرس الباقة
     يجب أن يطابق باقة حقيقية من باقات العيادة الحالية، وتُحفظ نسخة لحظة
     الحجز (الاسم/عدد الجلسات/السعر بالدينار) مع الحجز نفسه */
  const clinicPacks = ((clinic as unknown as { packs?: { name: string; sessions: number; price: number }[] }).packs || []) as {
    name: string;
    sessions: number;
    price: number;
  }[];
  let packSnap: { packName: string | null; packSessions: number | null; packPrice: number | null } = {
    packName: null,
    packSessions: null,
    packPrice: null,
  };
  if (packIndex !== undefined && packIndex !== null) {
    const pi = Math.round(Number(packIndex));
    if (!Number.isInteger(pi) || pi < 0 || pi >= clinicPacks.length) {
      return NextResponse.json({ error: "BAD_PACK" }, { status: 400 });
    }
    packSnap = {
      packName: String(clinicPacks[pi].name).slice(0, 80),
      packSessions: Math.max(1, Math.min(200, Math.round(Number(clinicPacks[pi].sessions)))),
      packPrice: Math.max(0, Math.round(Number(clinicPacks[pi].price))),
    };
  }

  /* تصادم ذري: هل الوقت محجوز بحجز حي؟ */
  const clash = await ClinicBooking.findOne({
    clinicId: id,
    date,
    slot,
    status: { $in: ["PENDING", "CONFIRMED"] },
  })
    .select("_id")
    .lean();
  if (clash) {
    return NextResponse.json({ error: "SLOT_TAKEN" }, { status: 409 });
  }

  /* v1.16.0: حجز حيّ واحد لكل (عميل × عيادة) — لا يستطيع العميل حجز جلسة
     حضورية ثانية بنفس العيادة ما دام له حجز بانتظار أو مؤكد. الحجز يتحرر
     فقط بالإتمام (COMPLETED) أو الإلغاء (CANCELLED). */
  const dup = await ClinicBooking.findOne({
    clinicId: id,
    clientUserId: userId,
    status: { $in: ["PENDING", "CONFIRMED"] },
  })
    .select("_id")
    .lean();
  if (dup) {
    return NextResponse.json({ error: "ALREADY_BOOKED" }, { status: 409 });
  }

  await ClinicBooking.create({
    clinicId: id,
    clientUserId: userId,
    clientName: nm,
    clientPhone: ph,
    date,
    slot,
    reason: (reason || "").trim().slice(0, 600) || null,
    status: "PENDING",
    packName: packSnap.packName,
    packSessions: packSnap.packSessions,
    packPrice: packSnap.packPrice,
  });

  /* إشعار فوري لصاحب العيادة بالتفاصيل الكاملة */
  const ownerId = String((clinic as unknown as { ownerUserId: unknown }).ownerUserId);
  void notifyUser(
    ownerId,
    "clinicBookingNew",
    "/?view=clinic-dashboard",
    { name: nm, when: fmtWhen(date, slot), clinic: String((clinic as unknown as { name: string }).name) }
  ).catch(() => {});

  return NextResponse.json({ ok: true });
}

export const GET = apiHandler(GET_impl);
export const POST = apiHandler(POST_impl);
