import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Clinic, User } from "@/lib/models";
import { normalizeWhatsapp } from "@/lib/whatsapp";
import { hashSecret, verifySecret } from "@/lib/server/auth";
import { apiHandler } from "@/lib/server/api";
import { slugifyName, fallbackSlug } from "@/lib/server/slug";
import { SPECIALTIES, WILAYAS } from "@/lib/constants";

export const dynamic = "force-dynamic";

/* ═ v1.14.0 — حساب عيادة نفسية (دور CLINIC) ═
   تسجيل/دخول/نسيان كلمة المرور + تحديث ملف العيادة كاملاً من لوحتها.
   التسجيل ينشئ حساب مستخدم (role=CLINIC) + ملف عيادة (clinics) برابط
   عام /clinic/{slug} — العيادة تظهر في الدليل فور تسجيلها ويمكنها
   إكمال بقية التفاصيل لاحقاً من لوحتها. */

const MAX_LOGO_B64 = 1_500_000; // شعار العيادة بعد ضغط العميل (~700px)

/* تطهير قائمة التخصصات (الجاهزة من SPECIALTIES فقط) */
function sanitizeSpecialties(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return Array.from(new Set(input.map((s) => String(s ?? "").trim()).filter((s) => (SPECIALTIES as readonly string[]).includes(s)))).slice(0, SPECIALTIES.length);
}

/* تطهير قائمة التخصصات الخاصة المُدخلة يدوياً */
function sanitizeCustomSpecialties(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((s) => String(s ?? "").trim().slice(0, 50))
    .filter((s) => s.length > 0)
    .slice(0, 10);
}

/* تطهير قائمة الهواتف — أرقام فقط بالصيغة الدولية 213XXXXXXXXX */
function sanitizePhones(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const raw of input) {
    const wa = normalizeWhatsapp(String(raw ?? ""));
    if (wa && !out.includes(wa)) out.push(wa);
    if (out.length >= 4) break;
  }
  return out;
}

interface RegisterBody {
  action: "register";
  name: string;
  email: string;
  password: string;
  recoveryPhrase: string;
  wilaya?: string;
  language?: string;
}

interface LoginBody {
  action: "login";
  email: string;
  password: string;
}

interface ForgotBody {
  action: "forgot";
  email: string;
  recoveryPhrase: string;
  newPassword: string;
}

interface UpdateProfileBody {
  action: "update-profile";
  userId: string;
  name?: string;
  foundedYear?: number | null;
  specialties?: string[];
  customSpecialties?: string[];
  about?: string | null;
  wilaya?: string | null;
  city?: string | null;
  address?: string | null;
  phones?: string[];
  whatsapp?: string | null;
  contactEmail?: string | null;
  website?: string | null;
  socials?: { facebook?: string | null; instagram?: string | null; tiktok?: string | null };
  logo?: string | null;
  workingHours?: string | null;
  priceNote?: string | null;
  licenseNumber?: string | null;
  /* v1.15.0: مواعيد الحجز + معرض الصور + الموقع على الخريطة */
  slots?: string[];
  gallery?: string[] | null;
  location?: { lat: number | null; lng: number | null } | null;
}

interface ChangePasswordBody {
  action: "change-password";
  userId: string;
  oldPassword: string;
  newPassword: string;
}

/* توليد slug فريد من اسم العيادة (نفس منطق الأخصائيين) */
async function uniqueClinicSlug(name: string, selfId: string): Promise<string> {
  const base = slugifyName(name) || fallbackSlug(selfId);
  let candidate = base;
  for (let i = 2; i < 50; i++) {
    const clash = await Clinic.findOne({ slug: candidate, _id: { $ne: selfId } }).select("_id").lean();
    if (!clash) break;
    candidate = `${base}-${i}`;
  }
  return candidate;
}

async function POST_impl(req: NextRequest) {
  const body = await req.json();
  await connectDB();

  /* ─── التسجيل ─── */
  if (body.action === "register") {
    const { name, email, password, recoveryPhrase, wilaya, language } = body as RegisterBody;
    if (!name?.trim() || !email?.trim()) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!password || String(password).length < 8) {
      return NextResponse.json({ error: "WEAK_PASSWORD" }, { status: 400 });
    }
    if (!recoveryPhrase || String(recoveryPhrase).trim().length < 6) {
      return NextResponse.json({ error: "WEAK_RECOVERY" }, { status: 400 });
    }
    if (wilaya && wilaya !== "all" && !WILAYAS.includes(wilaya)) {
      return NextResponse.json({ error: "INVALID_WILAYA" }, { status: 400 });
    }
    const cleanEmail = email.trim().toLowerCase();
    const existing = await User.findOne({ email: cleanEmail }).lean();
    if (existing) {
      return NextResponse.json({ error: "EMAIL_EXISTS" }, { status: 409 });
    }

    const pw = hashSecret(password);
    const rec = hashSecret(recoveryPhrase.trim());
    const user = await User.create({
      role: "CLINIC",
      email: cleanEmail,
      language: language || "ar",
      pseudonym: name.trim().slice(0, 80),
      wilaya: wilaya || null,
      passwordHash: pw.hash,
      passwordSalt: pw.salt,
      recoveryHash: rec.hash,
      recoverySalt: rec.salt,
    });
    const slug = await uniqueClinicSlug(name, String(user._id));
    await Clinic.create({
      ownerUserId: user._id,
      name: name.trim(),
      slug,
      wilaya: wilaya || null,
      contactEmail: cleanEmail,
      isActive: true,
    });

    return NextResponse.json({ ok: true, userId: String(user._id), slug });
  }

  /* ─── الدخول ─── */
  if (body.action === "login") {
    const { email, password } = body as LoginBody;
    const user = await User.findOne({ email: String(email || "").trim().toLowerCase() });
    if (!user || user.role !== "CLINIC" || !verifySecret(password, user.passwordHash, user.passwordSalt)) {
      return NextResponse.json({ error: "INVALID" }, { status: 401 });
    }
    if ((user as unknown as { suspended?: boolean }).suspended) {
      return NextResponse.json({ error: "SUSPENDED" }, { status: 403 });
    }
    const clinic = (await Clinic.findOne({ ownerUserId: user._id }).select("name slug isActive").lean()) as
      | { _id: unknown; name?: string; slug?: string; isActive?: boolean }
      | null;
    /* حساب بلا ملف عيادة (قاعدة قديمة/تدخل يدوي) — يُنشأ ملف تقني فارغ */
    let clinicId = clinic ? String(clinic._id) : null;
    let slug = clinic?.slug ?? null;
    if (!clinic) {
      const created = await Clinic.create({ ownerUserId: user._id, name: user.pseudonym || "عيادة", isActive: true });
      clinicId = String((created as unknown as { _id: unknown })._id);
      slug = (created as unknown as { slug?: string }).slug ?? null;
    }
    return NextResponse.json({
      ok: true,
      user: {
        id: String(user._id),
        role: user.role,
        clinicName: clinic?.name ?? user.pseudonym ?? null,
        clinicSlug: slug,
        clinicId,
        clinicActive: clinic?.isActive !== false,
        language: user.language,
      },
    });
  }

  /* ─── نسيان كلمة المرور: عبارة الاسترجاع ─── */
  if (body.action === "forgot") {
    const { email, recoveryPhrase, newPassword } = body as ForgotBody;
    if (!newPassword || String(newPassword).length < 8) {
      return NextResponse.json({ error: "WEAK_PASSWORD" }, { status: 400 });
    }
    const user = await User.findOne({ email: String(email || "").trim().toLowerCase() });
    if (!user || user.role !== "CLINIC" || !verifySecret(String(recoveryPhrase || "").trim(), user.recoveryHash, user.recoverySalt)) {
      return NextResponse.json({ error: "RECOVERY_INVALID" }, { status: 401 });
    }
    const pw = hashSecret(newPassword);
    await User.updateOne({ _id: user._id }, { $set: { passwordHash: pw.hash, passwordSalt: pw.salt } });
    return NextResponse.json({ ok: true });
  }

  /* ─── تغيير كلمة المرور من اللوحة ─── */
  if (body.action === "change-password") {
    const { userId, oldPassword, newPassword } = body as ChangePasswordBody;
    if (!userId || !oldPassword || !newPassword || String(newPassword).length < 8) {
      return NextResponse.json({ error: "WEAK_PASSWORD" }, { status: 400 });
    }
    const user = await User.findById(userId);
    if (!user || user.role !== "CLINIC" || !verifySecret(oldPassword, user.passwordHash, user.passwordSalt)) {
      return NextResponse.json({ error: "INVALID" }, { status: 401 });
    }
    const pw = hashSecret(newPassword);
    await User.updateOne({ _id: userId }, { $set: { passwordHash: pw.hash, passwordSalt: pw.salt } });
    return NextResponse.json({ ok: true });
  }

  /* ─── تحديث ملف العيادة من لوحتها ─── */
  if (body.action === "update-profile") {
    const { userId } = body as UpdateProfileBody;
    const user = await User.findById(userId);
    if (!user || user.role !== "CLINIC") {
      return NextResponse.json({ error: "INVALID" }, { status: 401 });
    }
    const clinic = await Clinic.findOne({ ownerUserId: user._id });
    if (!clinic) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const set: Record<string, unknown> = {};

    /* اسم العيادة — تغييره يولّد slug جديداً إن اصطدم */
    if (body.name !== undefined) {
      const nm = String(body.name || "").trim().slice(0, 120);
      if (!nm) return NextResponse.json({ error: "INVALID_NAME" }, { status: 400 });
      set.name = nm;
      const base = slugifyName(nm) || fallbackSlug(String(clinic._id));
      let candidate = base;
      for (let i = 2; i < 50; i++) {
        const clash = await Clinic.findOne({ slug: candidate, _id: { $ne: clinic._id } }).select("_id").lean();
        if (!clash) break;
        candidate = `${base}-${i}`;
      }
      set.slug = candidate;
    }

    /* سنة الإنشاء 1950..السنة الحالية — أو null لإخفائها */
    if (body.foundedYear !== undefined) {
      const y = body.foundedYear === null ? null : Math.round(Number(body.foundedYear));
      if (y === null) set.foundedYear = null;
      else if (!Number.isFinite(y) || y < 1950 || y > new Date().getFullYear()) {
        return NextResponse.json({ error: "INVALID_YEAR" }, { status: 400 });
      } else set.foundedYear = y;
    }

    if (body.specialties !== undefined) set.specialties = sanitizeSpecialties(body.specialties);
    if (body.customSpecialties !== undefined) set.customSpecialties = sanitizeCustomSpecialties(body.customSpecialties);
    if (body.about !== undefined) set.about = body.about ? String(body.about).slice(0, 4000) : null;

    if (body.wilaya !== undefined) {
      if (body.wilaya === null || body.wilaya === "" || body.wilaya === "all") set.wilaya = null;
      else if (!WILAYAS.includes(String(body.wilaya))) return NextResponse.json({ error: "INVALID_WILAYA" }, { status: 400 });
      else set.wilaya = body.wilaya;
    }
    if (body.city !== undefined) set.city = body.city ? String(body.city).trim().slice(0, 80) : null;
    if (body.address !== undefined) set.address = body.address ? String(body.address).trim().slice(0, 300) : null;

    if (body.phones !== undefined) set.phones = sanitizePhones(body.phones);

    if (body.whatsapp !== undefined) {
      if (body.whatsapp && String(body.whatsapp).trim()) {
        const wa = normalizeWhatsapp(String(body.whatsapp));
        if (!wa) return NextResponse.json({ error: "INVALID_WHATSAPP" }, { status: 400 });
        set.whatsapp = wa;
      } else set.whatsapp = null;
    }

    if (body.contactEmail !== undefined) {
      const em = String(body.contactEmail || "").trim().toLowerCase();
      if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return NextResponse.json({ error: "INVALID_EMAIL" }, { status: 400 });
      set.contactEmail = em || null;
    }
    if (body.website !== undefined) {
      const w = String(body.website || "").trim();
      if (!w) set.website = null;
      else if (!/^https?:\/\//i.test(w)) set.website = `https://${w}`.slice(0, 300);
      else set.website = w.slice(0, 300);
    }

    /* روابط التواصل — يُقبل رابط كامل أو معرّف حساب (نفس منطق الأخصائيين) */
    if (body.socials !== undefined && typeof body.socials === "object" && body.socials !== null) {
      const s = body.socials as Record<string, unknown>;
      const clean = (v: unknown, host: string) => {
        const raw = String(v ?? "").trim();
        if (!raw) return null;
        if (/^https?:\/\//i.test(raw)) return raw.slice(0, 300);
        const joiner = host.endsWith("@") ? "" : "/";
        return `https://${host}${joiner}${raw.replace(/^@/, "")}`.slice(0, 300);
      };
      set.socials = {
        facebook: clean(s.facebook, "facebook.com"),
        instagram: clean(s.instagram, "instagram.com"),
        tiktok: clean(s.tiktok, "tiktok.com/@"),
      };
    }

    /* الشعار: data URL للتعيين، null للحذف، غائب = دون تغيير */
    if (body.logo !== undefined) {
      if (body.logo === null || body.logo === "") {
        set.logo = null;
        set.hasLogo = false;
      } else if (typeof body.logo === "string" && body.logo.startsWith("data:image/")) {
        if (body.logo.length > MAX_LOGO_B64) return NextResponse.json({ error: "INVALID_LOGO" }, { status: 400 });
        set.logo = body.logo;
        set.hasLogo = true;
      } else return NextResponse.json({ error: "INVALID_LOGO" }, { status: 400 });
    }

    /* ══ v1.15.0 ══ */
    /* مواعيد الحجز المعرفة من العيادة — HH:MM فريدة مرتبة حتى 24 موعداً؛
       مصفوفة فارغة = العودة للمواعيد الافتراضية للمنصة */
    if (body.slots !== undefined) {
      const raw = Array.isArray(body.slots) ? body.slots : [];
      const clean = Array.from(
        new Set(raw.map((s) => String(s ?? "").trim()).filter((s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s)))
      )
        .sort()
        .slice(0, 24);
      set.slots = clean;
    }
    /* معرض الصور: حتى 8 صور data URL (نفس قاعدة الشعار)؛ null أو [] = حذف الكل */
    if (body.gallery !== undefined) {
      if (body.gallery === null) set.gallery = [];
      else if (Array.isArray(body.gallery)) {
        const clean = body.gallery
          .filter((g) => typeof g === "string" && g.startsWith("data:image/"))
          .slice(0, 8);
        if (clean.some((g) => (g as string).length > MAX_LOGO_B64)) {
          return NextResponse.json({ error: "INVALID_GALLERY" }, { status: 400 });
        }
        set.gallery = clean;
      } else return NextResponse.json({ error: "INVALID_GALLERY" }, { status: 400 });
    }
    /* الموقع على الخريطة: إحداثيات دقيقة من GPS — null لإزالته */
    if (body.location !== undefined) {
      if (body.location === null) {
        set.location = { lat: null, lng: null };
      } else {
        const lat = Number(body.location?.lat);
        const lng = Number(body.location?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          return NextResponse.json({ error: "INVALID_LOCATION" }, { status: 400 });
        }
        set.location = { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
      }
    }

    if (body.workingHours !== undefined) set.workingHours = body.workingHours ? String(body.workingHours).trim().slice(0, 400) : null;
    if (body.priceNote !== undefined) set.priceNote = body.priceNote ? String(body.priceNote).trim().slice(0, 400) : null;
    if (body.licenseNumber !== undefined) set.licenseNumber = body.licenseNumber ? String(body.licenseNumber).trim().slice(0, 80) : null;

    if (Object.keys(set).length) await Clinic.updateOne({ _id: clinic._id }, { $set: set });
    /* اسم العيادة يُزامن مع اسم الحساب (يظهر في الهيدر) */
    if (set.name) await User.updateOne({ _id: userId }, { $set: { pseudonym: String(set.name) } });

    const fresh = (await Clinic.findById(clinic._id).select("name slug").lean()) as { name?: string; slug?: string } | null;
    return NextResponse.json({ ok: true, name: fresh?.name, slug: fresh?.slug });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

/* ─── ملف عيادتي (للوحة العيادة) ─── */
async function GET_impl(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  await connectDB();
  const user = await User.findById(userId).select("role email").lean();
  if (!user || (user as { role?: string }).role !== "CLINIC") {
    return NextResponse.json({ error: "INVALID" }, { status: 401 });
  }
  const c = (await Clinic.findOne({ ownerUserId: userId }).lean()) as Record<string, unknown> | null;
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });

  /* اللوغو لا يُحمَّل في JSON اللوحة — يُجلب من مساره المخبّأ */
  return NextResponse.json({
    clinic: {
      id: String(c._id),
      userId,
      name: c.name,
      slug: c.slug,
      foundedYear: c.foundedYear ?? null,
      specialties: c.specialties || [],
      customSpecialties: c.customSpecialties || [],
      about: c.about ?? null,
      wilaya: c.wilaya ?? null,
      city: c.city ?? null,
      address: c.address ?? null,
      phones: c.phones || [],
      whatsapp: c.whatsapp || null,
      contactEmail: c.contactEmail ?? null,
      accountEmail: (user as { email?: string }).email ?? null,
      website: c.website ?? null,
      socials: c.socials ?? {},
      logoUrl: `/api/clinics/${String(c._id)}/logo?v=${c.updatedAt ? new Date(c.updatedAt as string).getTime() : 0}`,
      hasLogo: !!c.logo,
      workingHours: c.workingHours ?? null,
      priceNote: c.priceNote ?? null,
      licenseNumber: c.licenseNumber ?? null,
      isActive: c.isActive !== false,
      rating: Math.round((Number(c.rating) || 5) * 10) / 10,
      ratingsCount: Number(c.ratingsCount) || 0,
      bookingsCount: Number(c.bookingsCount) || 0,
      /* v1.15.0: المواعيد والمعرض والموقع */
      slots: (c.slots as string[]) || [],
      /* المعرض يُعاد كاملاً لصاحب العيادة فقط — لتحريره من لوحته */
      gallery: (c.gallery as string[]) || [],
      galleryCount: ((c.gallery as string[]) || []).length,
      location: (c.location as { lat: number | null; lng: number | null }) ?? { lat: null, lng: null },
    },
  });
}

export const POST = apiHandler(POST_impl);
export const GET = apiHandler(GET_impl);
