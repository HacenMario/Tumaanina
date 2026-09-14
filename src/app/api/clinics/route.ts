import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Clinic, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";
import { SPECIALTIES, WILAYAS } from "@/lib/constants";

export const dynamic = "force-dynamic";

/* ═ v1.14.0 — دليل العيادات النفسية (صفحة عامة) ═
   GET /api/clinics
     ?wilaya=oran&city=وهران&specialty=anxietyDepression&minYears=5&q=نص
   يعرض العيادات النشطة فقط (isActive)، بفلاتر اختيارية:
   الولاية، البلدية/المدينة، التخصصات، سنوات الخبرة الأدنى (تُشتق من
   سنة الإنشاء)، وبحث نصي في الاسم/النبذة/العنوان.
   الشعار يُحمَّل من /api/clinics/{id}/logo — لا base64 داخل JSON القائمة. */

async function GET_impl(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const wilaya = searchParams.get("wilaya");
  const city = (searchParams.get("city") || "").trim();
  const specialty = searchParams.get("specialty");
  const minYears = Number(searchParams.get("minYears")) || 0;
  const q = (searchParams.get("q") || "").trim();
  /* v1.15.0: ترقيم صفحات من الخادم — 8 عيادات لكل صفحة */
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const PER = 8;

  await connectDB();

  const query: Record<string, unknown> = { isActive: true };
  if (wilaya && wilaya !== "all" && WILAYAS.includes(wilaya)) query.wilaya = wilaya;
  if (specialty && specialty !== "all" && (SPECIALTIES as readonly string[]).includes(specialty)) {
    query.$or = [{ specialties: specialty }, { customSpecialties: specialty }];
  }

  const clinics = await Clinic.find(query)
    .select("-logo -gallery")
    .sort({ rating: -1, ratingsCount: -1, name: 1 })
    .limit(200)
    .lean();

  /* v1.16.0 — شفاء ذاتي لحقول hasLogo القديمة: تجميعة خفيفة تتحقق من
     وجود شعار فعلي (طول base64 > 10) وتصحّح حقلاً hasLogo المخزّن خاطئاً
     في القاعدة (سجلات قديمة أُنشئت قبل الحقل) — الشعار يظهر دائماً. */
  const clinicIds = clinics.map((c) => (c as unknown as { _id: unknown })._id);
  if (clinicIds.length) {
    try {
      const logoProbe = await Clinic.aggregate<{ _id: unknown; realLogo: boolean }>([
        { $match: { _id: { $in: clinicIds } } },
        {
          $project: {
            realLogo: { $gt: [{ $strLenCP: { $ifNull: ["$logo", ""] } }, 10] },
          },
        },
      ]);
      const stale = logoProbe.filter((p) => {
        const c = clinics.find(
          (cc) => String((cc as unknown as { _id: unknown })._id) === String(p._id)
        ) as { hasLogo?: boolean } | undefined;
        return c && !!c.hasLogo !== p.realLogo;
      });
      if (stale.length) {
        const idsTrue = stale.filter((p) => p.realLogo).map((p) => p._id);
        const idsFalse = stale.filter((p) => !p.realLogo).map((p) => p._id);
        /* v1.16.0: ننتظر الكتابة كي يخرج الطلب بعد اتساق القاعدة فعلياً */
        if (idsTrue.length) await Clinic.updateMany({ _id: { $in: idsTrue } }, { $set: { hasLogo: true } });
        if (idsFalse.length) await Clinic.updateMany({ _id: { $in: idsFalse } }, { $set: { hasLogo: false } });
        for (const p of stale) {
          const c = clinics.find(
            (cc) => String((cc as unknown as { _id: unknown })._id) === String(p._id)
          ) as { hasLogo?: boolean } | undefined;
          if (c) c.hasLogo = p.realLogo;
        }
      }
    } catch {
      /* الشفاء الذاتي اختياري — لا يعطل القائمة أبداً */
    }
  }

  const ownerIds = clinics.map((c) => c.ownerUserId).filter(Boolean);
  const owners = ownerIds.length
    ? await User.find({ _id: { $in: ownerIds } }).select("suspended").lean()
    : [];
  const suspendedSet = new Set(
    owners.filter((u) => (u as { suspended?: boolean }).suspended).map((u) => String((u as { _id: unknown })._id))
  );

  const nowYear = new Date().getFullYear();

  const mapped = clinics
    .filter((c) => !suspendedSet.has(String(c.ownerUserId)))
    .map((c) => {
      const rec = c as Record<string, unknown>;
      const founded = Number(rec.foundedYear) || 0;
      const yearsExp = founded > 0 ? Math.max(0, nowYear - founded) : 0;
      return {
        id: String(rec._id),
        name: String(rec.name || ""),
        slug: (rec.slug as string) || null,
        foundedYear: founded || null,
        yearsExperience: yearsExp,
        specialties: (rec.specialties as string[]) || [],
        customSpecialties: (rec.customSpecialties as string[]) || [],
        wilaya: (rec.wilaya as string) || null,
        city: (rec.city as string) || null,
        address: (rec.address as string) || null,
        phones: (rec.phones as string[]) || [],
        whatsapp: (rec.whatsapp as string) || null,
        website: (rec.website as string) || null,
        socials: rec.socials ?? {},
        about: (rec.about as string) || null,
        workingHours: (rec.workingHours as string) || null,
        priceNote: (rec.priceNote as string) || null,
        rating: Math.round((Number(rec.rating) || 5) * 10) / 10,
        ratingsCount: Number(rec.ratingsCount) || 0,
        bookingsCount: Number(rec.bookingsCount) || 0,
        /* v1.15.0: حقل الشعار المحفوظ فعلياً — كان يُشتق من حقل مستبعد
           من الاستعلام فكان دائماً false ولا يظهر الشعار في الدليل */
        logoUrl: `/api/clinics/${String(rec._id)}/logo?v=${rec.updatedAt ? new Date(rec.updatedAt as string).getTime() : 0}`,
        hasLogo: rec.hasLogo === true,
        /* v1.16.0: سعر الجلسة الحضورية + باقات الجلسات (Packs) */
        sessionPrice: (rec.sessionPrice as number | null) ?? null,
        packs: (rec.packs as { name: string; sessions: number; price: number; note: string | null }[]) || [],
        createdAt: rec.createdAt,
      };
    })
    .filter((c) => {
      /* فلترة سنوات الخبرة الأدنى — العيادات بلا سنة إنشاء تُستبعد عند الفلترة */
      if (minYears > 0 && c.yearsExperience < minYears) return false;
      /* فلترة البلدية/المدينة نصياً */
      if (city && !`${c.city || ""} ${c.address || ""}`.includes(city)) return false;
      /* بحث نصي: الاسم + النبذة + العنوان + التخصصات الخاصة */
      if (q) {
        const hay = `${c.name} ${c.about || ""} ${c.city || ""} ${c.address || ""} ${c.customSpecialties.join(" ")}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });

  /* v1.15.0: ترقيم الصفحات بعد الفلترة — يُعاد الإجمالي والصفحات */
  const total = mapped.length;
  const pages = Math.max(1, Math.ceil(total / PER));
  const safePage = Math.min(page, pages);

  return NextResponse.json({
    clinics: mapped.slice((safePage - 1) * PER, safePage * PER),
    total,
    page: safePage,
    pages,
  });
}

export const GET = apiHandler(GET_impl);
