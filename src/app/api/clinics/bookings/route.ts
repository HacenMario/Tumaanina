import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Clinic, ClinicBooking, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";
import { notifyUser } from "@/lib/server/notify";
import { WILAYAS, WILAYA_LABELS } from "@/lib/constants";

export const dynamic = "force-dynamic";

/* ═ v1.14.0 — إدارة الحجوزات الحضورية ═
   GET  /api/clinics/bookings?userId={حساب العيادة}     → حجوزات عيادتي
   GET  /api/clinics/bookings?clientUserId={حساب العميل} → حجوزاتي كعميل
   POST /api/clinics/bookings
     { userId, id, action: "confirm" }        → العيادة تؤكد (+عنوان للعميل)
     { userId, id, action: "cancel", note? }  → العيادة تلغي (السبب يصل للعميل)
     { userId, id, action: "complete" }       → العيادة تُتم الزيارة
     { userId, id, action: "client-cancel" }  → العميل يلغي حجزه
   كل إشعار حالة يصل للطرف الآخر فوراً بلغة حسابه. */

function wilayaLabel(w: string | null | undefined, lang: string): string {
  if (!w || !WILAYAS.includes(w)) return "";
  const l = WILAYA_LABELS[w];
  if (!l) return w;
  return (lang === "ar" ? l.ar : lang === "fr" ? l.fr : l.en) || w;
}

async function GET_impl(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const clientUserId = searchParams.get("clientUserId");
  if (!userId && !clientUserId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  await connectDB();

  /* حجوزات العميل نفسه — يرى حالة كل حجز وبيانات العيادة الأساسية */
  if (clientUserId) {
    const rows = await ClinicBooking.find({ clientUserId }).sort({ date: -1, slot: -1 }).limit(100).lean();
    const clinicIds = Array.from(new Set(rows.map((r) => String((r as unknown as { clinicId: { toString(): string } }).clinicId))));
    const clinics = clinicIds.length ? await Clinic.find({ _id: { $in: clinicIds } }).select("name slug address city wilaya phones whatsapp").lean() : [];
    const byId = new Map(clinics.map((c) => [String((c as unknown as { _id: unknown })._id), c as Record<string, unknown>]));
    return NextResponse.json({
      bookings: rows.map((r) => {
        const rec = r as Record<string, unknown>;
        const cid = String((rec.clinicId as { toString(): string }).toString());
        const c = byId.get(cid) || {};
        return {
          id: String(rec._id),
          clinicId: cid,
          clinicName: (c.name as string) || "—",
          clinicSlug: (c.slug as string) || null,
          clinicAddress: (c.address as string) || null,
          clinicCity: (c.city as string) || null,
          clinicWilaya: (c.wilaya as string) || null,
          clinicPhone: ((c.phones as string[]) || [])[0] || null,
          clinicWhatsapp: (c.whatsapp as string) || null,
          date: rec.date,
          slot: rec.slot,
          status: rec.status,
          clinicNote: (rec.clinicNote as string) || null,
          cancelledBy: (rec.cancelledBy as string) || null,
          createdAt: rec.createdAt,
        };
      }),
    });
  }

  /* حجوزات عيادة — للعيادة نفسها حصراً */
  const user = await User.findById(userId).select("role").lean();
  if (!user || (user as { role?: string }).role !== "CLINIC") {
    return NextResponse.json({ error: "INVALID" }, { status: 401 });
  }
  const clinic = (await Clinic.findOne({ ownerUserId: userId }).select("_id").lean()) as { _id?: unknown } | null;
  if (!clinic) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const rows = await ClinicBooking.find({ clinicId: clinic._id }).sort({ date: 1, slot: 1 }).limit(200).lean();
  return NextResponse.json({
    bookings: rows.map((r) => {
      const rec = r as Record<string, unknown>;
      return {
        id: String(rec._id),
        clientName: (rec.clientName as string) || "—",
        clientPhone: (rec.clientPhone as string) || null,
        date: rec.date,
        slot: rec.slot,
        reason: (rec.reason as string) || null,
        status: rec.status,
        clinicNote: (rec.clinicNote as string) || null,
        cancelledBy: (rec.cancelledBy as string) || null,
        createdAt: rec.createdAt,
      };
    }),
  });
}

async function POST_impl(req: NextRequest) {
  const body = await req.json();
  const { userId, id, action } = body as { userId?: string; id?: string; action?: string };
  if (!userId || !id || !action) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  await connectDB();

  const booking = (await ClinicBooking.findById(id).lean()) as Record<string, unknown> | null;
  if (!booking) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const user = (await User.findById(userId).select("role language").lean()) as { role?: string; language?: string } | null;
  if (!user) return NextResponse.json({ error: "INVALID" }, { status: 401 });

  const clinicId = String((booking.clinicId as { toString(): string }).toString());
  const clientUserId = String((booking.clientUserId as { toString(): string }).toString());
  const clinic = (await Clinic.findById(clinicId).select("_id name slug address city wilaya phones whatsapp ownerUserId").lean()) as Record<string, unknown> | null;
  if (!clinic) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  /* ─── أفعال العيادة ─── */
  if (action === "confirm" || action === "cancel" || action === "complete") {
    const clinicOwner = await Clinic.findOne({ ownerUserId: userId }).select("_id").lean();
    if (!clinicOwner || String((clinicOwner as unknown as { _id: unknown })._id) !== clinicId) {
      return NextResponse.json({ error: "INVALID" }, { status: 401 });
    }
    if (action === "confirm") {
      if (booking.status !== "PENDING") return NextResponse.json({ error: "BAD_STATE" }, { status: 409 });
      await ClinicBooking.updateOne({ _id: id }, { $set: { status: "CONFIRMED" } });
      const address = [
        (clinic.address as string) || "",
        (clinic.city as string) || "",
        wilayaLabel((clinic.wilaya as string) || null, user.language || "ar"),
      ]
        .filter(Boolean)
        .join("، ");
      void notifyUser(clientUserId, "clinicBookingConfirmed", `/?clinic=${encodeURIComponent(String(clinic.slug || clinicId))}`, {
        clinic: (clinic.name as string) || "—",
        when: `${booking.date} ${booking.slot}`,
        address,
      }).catch(() => {});
      return NextResponse.json({ ok: true });
    }
    if (action === "cancel") {
      if (!["PENDING", "CONFIRMED"].includes(String(booking.status))) {
        return NextResponse.json({ error: "BAD_STATE" }, { status: 409 });
      }
      await ClinicBooking.updateOne(
        { _id: id },
        { $set: { status: "CANCELLED", cancelledBy: "CLINIC", clinicNote: (body.note || "").trim().slice(0, 400) || null } }
      );
      void notifyUser(clientUserId, "clinicBookingCancelled", `/?clinic=${encodeURIComponent(String(clinic.slug || clinicId))}`, {
        clinic: (clinic.name as string) || "—",
        when: `${booking.date} ${booking.slot}`,
        reason: (body.note || "").trim().slice(0, 200) || "—",
      }).catch(() => {});
      return NextResponse.json({ ok: true });
    }
    /* complete */
    if (booking.status !== "CONFIRMED") return NextResponse.json({ error: "BAD_STATE" }, { status: 409 });
    await ClinicBooking.updateOne({ _id: id }, { $set: { status: "COMPLETED" } });
    await Clinic.updateOne({ _id: clinicId }, { $inc: { bookingsCount: 1 } });
    /* إشعار الاكتمال يطلب من العميل تقييم العيادة */
    void notifyUser(clientUserId, "clinicVisitCompleted", `/?clinic=${encodeURIComponent(String(clinic.slug || clinicId))}`, {
      clinic: (clinic.name as string) || "—",
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  /* ─── إلغاء العميل لحجزه ─── */
  if (action === "client-cancel") {
    if (clientUserId !== String(userId)) return NextResponse.json({ error: "INVALID" }, { status: 401 });
    if (!["PENDING", "CONFIRMED"].includes(String(booking.status))) {
      return NextResponse.json({ error: "BAD_STATE" }, { status: 409 });
    }
    await ClinicBooking.updateOne({ _id: id }, { $set: { status: "CANCELLED", cancelledBy: "CLIENT" } });
    const ownerId = String((clinic as unknown as { ownerUserId: unknown }).ownerUserId);
    void notifyUser(ownerId, "clinicBookingCancelledByClient", "/?view=clinic-dashboard", {
      name: (booking.clientName as string) || "—",
      when: `${booking.date} ${booking.slot}`,
      clinic: (clinic.name as string) || "—",
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export const GET = apiHandler(GET_impl);
export const POST = apiHandler(POST_impl);
