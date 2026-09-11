import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { CounselorProfile, SupportSession, User } from "@/lib/models";
import { normalizeWhatsapp } from "@/lib/whatsapp";
import { hashSecret, verifySecret } from "@/lib/server/auth";
import { apiHandler } from "@/lib/server/api";
import { slugifyName, fallbackSlug, ensureCounselorSlug } from "@/lib/server/slug";
import { normalizeAvailability } from "@/lib/availability";
import { getChallengeWinner } from "@/lib/server/challenge";
import { DEFAULT_SESSION_PRICE, buildSessionPrices, CURRENCY_CODES, CURRENCIES } from "@/lib/constants";
import type { CurrencyCode } from "@/lib/constants";

export const dynamic = "force-dynamic";

const MAX_DIPLOMA_B64 = 4_500_000; // ~3.3MB صورة بعد ضغط base64 (العميل يضغط تلقائياً)
const MAX_PHOTO_B64 = 1_500_000; // الصورة الشخصية: بعد ضغط العميل (~700px) عادة < 200KB

/* تطهير قائمة التخصصات الخاصة المُدخلة يدوياً (تسجيل أو تعديل) */
function sanitizeCustomSpecialties(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((s) => String(s ?? "").trim().slice(0, 50))
    .filter((s) => s.length > 0)
    .slice(0, 8);
}

interface RegisterBody {
  action: "register";
  fullName: string;
  email: string;
  password: string;
  recoveryPhrase: string;
  whatsapp: string;
  specialties: string[];
  customSpecialties?: string[];
  languages: string[];
  bio?: string;
  yearsExperience: number;
  diplomaImage?: string;
  photo?: string | null;
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

interface ChangePasswordBody {
  action: "change-password";
  userId: string;
  oldPassword: string;
  newPassword: string;
}

interface AvailabilityBody {
  action: "availability";
  userId: string;
  available: boolean;
}

interface UpdateProfileBody {
  action: "update-profile";
  userId: string;
  fullName?: string;
  whatsapp?: string;
  bio?: string;
  /* تعديل التخصصات من الإعدادات: القائمة الجاهزة + الخاصة (تُستبدل كاملة عند الإرسال) */
  specialties?: string[];
  customSpecialties?: string[];
  /* الصورة الشخصية: data URL للتعيين/التغيير، null للحذف، غائبة = دون تغيير */
  photo?: string | null;
}
async function POST_impl(req: NextRequest) {
  const body = await req.json();
  await connectDB();

  if (body.action === "register") {
    const {
      fullName,
      email,
      password,
      recoveryPhrase,
      whatsapp,
      specialties,
      languages,
      bio,
      yearsExperience,
      diplomaImage,
      language,
    } = body as RegisterBody;

    if (!fullName?.trim() || !email?.trim() || !specialties?.length || !languages?.length) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!password || String(password).length < 8) {
      return NextResponse.json({ error: "WEAK_PASSWORD" }, { status: 400 });
    }
    if (!recoveryPhrase || String(recoveryPhrase).trim().length < 6) {
      return NextResponse.json({ error: "WEAK_RECOVERY" }, { status: 400 });
    }
    const wa = normalizeWhatsapp(whatsapp);
    if (!wa) {
      return NextResponse.json({ error: "INVALID_WHATSAPP" }, { status: 400 });
    }
    if (diplomaImage && (typeof diplomaImage !== "string" || diplomaImage.length > MAX_DIPLOMA_B64 || !diplomaImage.startsWith("data:image/"))) {
      return NextResponse.json({ error: "INVALID_DIPLOMA" }, { status: 400 });
    }
    const photo = typeof body.photo === "string" && body.photo ? body.photo : null;
    if (photo && (photo.length > MAX_PHOTO_B64 || !photo.startsWith("data:image/"))) {
      return NextResponse.json({ error: "INVALID_PHOTO" }, { status: 400 });
    }
    const cleanEmail = email.trim().toLowerCase();
    const existing = await User.findOne({ email: cleanEmail }).lean();
    if (existing) {
      return NextResponse.json({ error: "EMAIL_EXISTS" }, { status: 409 });
    }

    const pw = hashSecret(password);
    const rec = hashSecret(recoveryPhrase.trim());
    const user = await User.create({
      role: "COUNSELOR",
      email: cleanEmail,
      language: language || "ar",
      pseudonym: fullName.trim(),
      passwordHash: pw.hash,
      passwordSalt: pw.salt,
      recoveryHash: rec.hash,
      recoverySalt: rec.salt,
    });
    /* v2.5.5: توليد slug فريد من الاسم الكامل مرة واحدة عند التسجيل
       (يُستعمل في رابط الملف العام: /counselor/{slug}) */
    let slug = slugifyName(fullName);
    if (!slug) slug = fallbackSlug(String(user._id));
    for (let i = 2; i < 50; i++) {
      const clash = await CounselorProfile.findOne({ slug, _id: { $ne: String(user._id) } }).select("_id").lean();
      if (!clash) break;
      slug = `${slugifyName(fullName) || fallbackSlug(String(user._id))}-${i}`;
    }
    const profile = await CounselorProfile.create({
      userId: user._id,
      fullName: fullName.trim(),
      slug,
      specialties,
      customSpecialties: sanitizeCustomSpecialties(body.customSpecialties),
      languages,
      whatsapp: wa,
      bio: bio || null,
      yearsExperience: Number(yearsExperience) || 0,
      diplomaImage: diplomaImage || null,
      photo,
      /* v1.3.0: أسعار الجلسة الثلاثة — قيم اختيارية من التسجيل، والمدينة الافتراضية
         تُشتق من سعر الدينار (ترحيل أولي قابل للتعديل من الإعدادات) */
      sessionPrice: Math.min(20000, Math.max(200, Math.round(Number(body.sessionPrice) || DEFAULT_SESSION_PRICE))),
      sessionPrices: buildSessionPrices(body.sessionPrices, body.sessionPrice),
      verificationStatus: "PENDING",
      available: true,
    });

    return NextResponse.json({
      ok: true,
      userId: user._id.toString(),
      verificationStatus: profile.verificationStatus,
    });
  }

  if (body.action === "login") {
    const { email, password } = body as LoginBody;
    const user = await User.findOne({ email: String(email || "").trim().toLowerCase() });
    if (!user || user.role !== "COUNSELOR" || !verifySecret(password, user.passwordHash, user.passwordSalt)) {
      return NextResponse.json({ error: "INVALID" }, { status: 401 });
    }
    /* v2.6.0: الحساب المعلّق من الإدارة (تأخر 3 مرات أو تعطيل يدوي) لا يستطيع الولوج */
    if ((user as unknown as { suspended?: boolean }).suspended) {
      return NextResponse.json({ error: "SUSPENDED" }, { status: 403 });
    }
    const profile = (await CounselorProfile.findOne({ userId: user._id }).lean()) as { fullName?: string; verificationStatus?: string; photo?: string | null } | null;
    return NextResponse.json({
      ok: true,
      user: {
        id: String(user._id),
        role: user.role,
        fullName: profile?.fullName ?? null,
        verified: profile?.verificationStatus === "VERIFIED",
        verificationStatus: profile?.verificationStatus ?? "PENDING",
        photo: profile?.photo ?? null,
        language: user.language,
      },
    });
  }

  /* نسيان كلمة المرور: البريد + عبارة الاسترجاع المكتوبة عند إنشاء الحساب */
  if (body.action === "forgot") {
    const { email, recoveryPhrase, newPassword } = body as ForgotBody;
    if (!newPassword || String(newPassword).length < 8) {
      return NextResponse.json({ error: "WEAK_PASSWORD" }, { status: 400 });
    }
    const user = await User.findOne({ email: String(email || "").trim().toLowerCase() });
    if (!user || user.role !== "COUNSELOR" || !verifySecret(String(recoveryPhrase || "").trim(), user.recoveryHash, user.recoverySalt)) {
      return NextResponse.json({ error: "RECOVERY_INVALID" }, { status: 401 });
    }
    const pw = hashSecret(newPassword);
    await User.updateOne(
      { _id: user._id },
      { $set: { passwordHash: pw.hash, passwordSalt: pw.salt } }
    );
    return NextResponse.json({ ok: true });
  }

  /* تغيير كلمة المرور من اللوحة (بعد الدخول) */
  if (body.action === "change-password") {
    const { userId, oldPassword, newPassword } = body as ChangePasswordBody;
    if (!userId || !oldPassword || !newPassword || String(newPassword).length < 8) {
      return NextResponse.json({ error: "WEAK_PASSWORD" }, { status: 400 });
    }
    const user = await User.findById(userId);
    if (!user || user.role !== "COUNSELOR" || !verifySecret(oldPassword, user.passwordHash, user.passwordSalt)) {
      return NextResponse.json({ error: "INVALID" }, { status: 401 });
    }
    const pw = hashSecret(newPassword);
    await User.updateOne(
      { _id: user._id },
      { $set: { passwordHash: pw.hash, passwordSalt: pw.salt } }
    );
    return NextResponse.json({ ok: true });
  }

  if (body.action === "availability") {
    const { userId, available } = body as AvailabilityBody;
    await CounselorProfile.updateOne({ userId }, { $set: { available: !!available } });
    return NextResponse.json({ ok: true });
  }

  /* v2.6.0: حفظ جدول التوفر الأسبوعي من الإعدادات —
     يُطبَّع ويُتحقق من صحته (أيام 0-6 × ساعات SLOT_TIMES فقط)؛
     الجدول الفارغ تماماً يُخزَّن null = كل الأوقات متاحة */
  if (body.action === "set-availability") {
    const { userId, weeklyAvailability } = body as { userId: string; weeklyAvailability: unknown };
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
    const normalized = normalizeAvailability(weeklyAvailability);
    await CounselorProfile.updateOne({ userId }, { $set: { weeklyAvailability: normalized } });
    return NextResponse.json({ ok: true, weeklyAvailability: normalized });
  }

  /* تعديل المعلومات المهنية من صفحة الإعدادات */
  if (body.action === "update-profile") {
    const { userId, fullName, whatsapp, bio } = body as UpdateProfileBody;
    const user = await User.findById(userId);
    if (!user || user.role !== "COUNSELOR") {
      return NextResponse.json({ error: "INVALID" }, { status: 401 });
    }
    const set: Record<string, unknown> = {};
    if (fullName && fullName.trim()) set.fullName = fullName.trim();
    if (whatsapp !== undefined) {
      if (whatsapp && whatsapp.trim()) {
        const wa = normalizeWhatsapp(whatsapp);
        if (!wa) return NextResponse.json({ error: "INVALID_WHATSAPP" }, { status: 400 });
        set.whatsapp = wa;
      } else {
        set.whatsapp = null;
      }
    }
    if (bio !== undefined) set.bio = bio || null;
    if (Array.isArray(body.specialties)) {
      const cleaned = body.specialties.map((s: unknown) => String(s ?? "").trim()).filter(Boolean);
      set.specialties = cleaned;
    }
    if (body.customSpecialties !== undefined) {
      set.customSpecialties = sanitizeCustomSpecialties(body.customSpecialties);
    }
    if (body.photo !== undefined) {
      if (body.photo === null || body.photo === "") {
        set.photo = null; // حذف الصورة
      } else if (typeof body.photo === "string" && body.photo.startsWith("data:image/")) {
        if (body.photo.length > MAX_PHOTO_B64) return NextResponse.json({ error: "INVALID_PHOTO" }, { status: 400 });
        set.photo = body.photo; // تعيين/تغيير الصورة
      } else {
        return NextResponse.json({ error: "INVALID_PHOTO" }, { status: 400 });
      }
    }
    /* v2.9.0: روابط التواصل الاجتماعي — تُظهر بأيقوناتها الحقيقية في بطاقة الأخصائي
       (يُقبل رابط كامل أو معرّف حساب، ويُطبَّع داخلياً) */
    if (body.socials !== undefined && typeof body.socials === "object" && body.socials !== null) {
      const s = body.socials as Record<string, unknown>;
      const clean = (v: unknown, host: string) => {
        const raw = String(v ?? "").trim();
        if (!raw) return null;
        if (/^https?:\/\//i.test(raw)) return raw.slice(0, 300);
        /* v2.11.0: المضيف قد ينتهي بـ@ (تيكتوك) — يُلحق المعرّف مباشرة بلا شرطة */
        const joiner = host.endsWith("@") ? "" : "/";
        return `https://${host}${joiner}${raw.replace(/^@/, "")}`.slice(0, 300);
      };
      set.socials = {
        facebook: clean(s.facebook, "facebook.com"),
        instagram: clean(s.instagram, "instagram.com"),
        /* v2.11.0: تيكتوك يحتاج @ في مسار الحساب — tiktok.com/@user */
        tiktok: clean(s.tiktok, "tiktok.com/@"),
      };
    }
    /* ═ v1.3.0: أسعار الجلسة الثلاثة — كل عملة بحدودها المستقلة ═
       (يستبدل فحص 1–500$ القديم الذي كان يُفشل حفظ الملف كله
       كلما تجاوز السعر بالدينار 500 — سبب شكوى «لا يوجد زر يضمن الحفظ»)
       sessionPrices غائبة تماماً = دون تغيير (حماية من حفظ صورة يفرغ الأسعار) */
    if (body.sessionPrices !== undefined && typeof body.sessionPrices === "object" && body.sessionPrices !== null) {
      const sp = body.sessionPrices as Record<string, unknown>;
      for (const c of CURRENCY_CODES) {
        if (sp[c] === undefined) continue;
        const v = Number(sp[c]);
        const { min, max } = CURRENCIES[c as CurrencyCode];
        if (!Number.isFinite(v) || v < min || v > max) {
          return NextResponse.json({ error: "INVALID_PRICE", currency: c }, { status: 400 });
        }
      }
      const current = (await CounselorProfile.findOne({ userId }).select("sessionPrice").lean()) as { sessionPrice?: number } | null;
      const built = buildSessionPrices(sp, current?.sessionPrice);
      set.sessionPrices = built;
      set.sessionPrice = built.DZD; /* العمود القديم يبقى متزامناً (دينار) */
    } else if (body.sessionPrice !== undefined) {
      /* توافق خلفي: سعر دينار وحيد (من نسخ قديمة) */
      const spDzd = Math.round(Number(body.sessionPrice));
      if (!Number.isFinite(spDzd) || spDzd < 200 || spDzd > 20000) {
        return NextResponse.json({ error: "INVALID_PRICE" }, { status: 400 });
      }
      set.sessionPrice = spDzd;
      set.sessionPrices = buildSessionPrices(null, spDzd);
    }
    /* v2.9.0: جنس العميلين الذي يقبل التعامل معهم — يُفلتر به قوائم الحجز */
    if (body.acceptedGenders !== undefined) {
      const g = Array.isArray(body.acceptedGenders)
        ? body.acceptedGenders.filter((x: unknown) => x === "male" || x === "female")
        : [];
      /* قائمة فارغة = كلا الجنسين (حماية من قفل الحساب بالخطأ) */
      const toSet = g.length ? Array.from(new Set(g)) : ["male", "female"];
      await User.updateOne({ _id: userId }, { $set: { acceptedGenders: toSet } });
    }
    if (Object.keys(set).length) await CounselorProfile.updateOne({ userId }, { $set: set });
    if (set.fullName) {
      await User.updateOne({ _id: userId }, { $set: { pseudonym: String(set.fullName) } });
      /* v2.5.5: تغيير الاسم يُحدّث slug رابط الملف العام (بعد التحديث لضمان قراءة الاسم الجديد) */
      const fresh = await CounselorProfile.findOne({ userId }).select("_id fullName slug").lean();
      if (fresh) await ensureCounselorSlug(fresh as Record<string, any>);
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

/* ─── v2.5.3: الملف الشخصي الخفيف للأخصائي نفسه ───
   بدل سحب قائمة كل الأخصائيين (كانت تحمل صور base64 ضخمة) من الإعدادات
   ولوحة الأخصائي: مسار واحد خفيف يعيد بياناتي فقط + معرّف الملف
   المهني (لرابط الملف العام) + عدد الجلسات المكتملة لحظياً */
async function GET_impl(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  await connectDB();
  const user = await User.findById(userId).select("role").lean();
  if (!user || (user as { role?: string }).role !== "COUNSELOR") {
    return NextResponse.json({ error: "INVALID" }, { status: 401 });
  }
  const p = (await CounselorProfile.findOne({ userId }).lean()) as Record<string, unknown> | null;
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });

  /* v2.5.5: slug رابط الملف العام — مع ترحيل تلقائي للحسابات القديمة */
  const slug = await ensureCounselorSlug(p);

  const done = await SupportSession.countDocuments({ counselorId: p.userId, status: "COMPLETED" });

  /* v2.7.0: هل هذا الأخصائي هو فائز التحدي؟ (للتاج الملكي فوق صورته) */
  const winner = await getChallengeWinner();
  const challengeWinner = !!winner && winner.userId === String(p.userId);

  /* v2.9.0: تفضيل الجنس + روابط التواصل الاجتماعي */
  const me = (await User.findById(p.userId).select("acceptedGenders").lean()) as { acceptedGenders?: string[] } | null;
  const socials = (p as { socials?: { facebook?: string | null; instagram?: string | null; tiktok?: string | null } }).socials ?? {};

  return NextResponse.json({
    profile: {
      id: String(p._id),
      userId: String(p.userId),
      slug,
      fullName: p.fullName,
      whatsapp: p.whatsapp || null,
      bio: p.bio ?? null,
      specialties: p.specialties || [],
      customSpecialties: p.customSpecialties || [],
      languages: p.languages || [],
      yearsExperience: p.yearsExperience ?? 0,
      available: !!p.available,
      rating: Math.round((Number(p.rating) || 5) * 10) / 10,
      verificationStatus: p.verificationStatus || "PENDING",
      sessionsCount: done,
      photo: (p.photo as string | null) || null,
      /* v2.6.0: جدول التوفر (للإعدادات ولوحة الأخصائي) + عدّاد التأخر */
      weeklyAvailability: (p.weeklyAvailability as Record<string, string[]> | null) ?? null,
      lateCount: Number(p.lateCount) || 0,
      /* v2.9.0: جنس العميلين المقبولين + روابط التواصل الاجتماعي */
      acceptedGenders: me?.acceptedGenders?.length ? me.acceptedGenders : ["male", "female"],
      /* v1.1.0 (طمأنينة): سعر الجلسة بالدينار الجزائري + v1.3.0 الأسعار الثلاثة (ترحيل تلقائي) */
      sessionPrice: Math.max(200, Math.round(Number(p.sessionPrice) || DEFAULT_SESSION_PRICE)),
      sessionPrices: buildSessionPrices((p as { sessionPrices?: unknown }).sessionPrices as never, p.sessionPrice),
      socials: {
        facebook: socials.facebook ?? null,
        instagram: socials.instagram ?? null,
        tiktok: socials.tiktok ?? null,
      },
      /* v2.7.0: فائز التحدي */
      challengeWinner,
      wonAt: challengeWinner && winner ? winner.wonAt : null,
    },
  });
}

export const POST = apiHandler(POST_impl);
export const GET = apiHandler(GET_impl);
