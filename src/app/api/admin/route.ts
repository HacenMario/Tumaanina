import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { CounselorProfile, CrisisLog, Feedback, FoundersContent, InAppNotification, Message, PushSubscription, SupportSession, User } from "@/lib/models";
import { notifyBulk, messageExcerpt, notifyUser } from "@/lib/server/notify";
import { listEnrichedCrisisLogs } from "@/lib/server/crisis";
import { normalizeWhatsapp } from "@/lib/whatsapp";
import { hashSecret, verifySecret } from "@/lib/server/auth";
import { apiHandler } from "@/lib/server/api";
import { adminGuard, issueAdminToken } from "@/lib/server/admin-auth";
import { sweepOverdueRequests, listOverdueRequests } from "@/lib/server/overdue";
import { challengeStatus, getChallengeWinner } from "@/lib/server/challenge";
import { getVictimChallengeWinner } from "@/lib/server/client-challenge";
import { readChallengeConfig, writeChallengeConfig, type ChallengeWhich } from "@/lib/server/challenge-config";
import { dayKeyUTC1 } from "@/lib/availability";
import { getPlatformContract, savePlatformContract } from "@/lib/server/contract";
import { PLATFORM_COMMISSION_RATE, CURRENCY_CODES } from "@/lib/constants";
import type { CurrencyCode } from "@/lib/constants";

export const dynamic = "force-dynamic";

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function POST_impl(req: NextRequest) {
  const body = await req.json();
  const action = body.action;
  await connectDB();

  if (action === "login") {
    /* لا كلمة مرور افتراضية — يجب ضبط ADMIN_PASSCODE في متغيرات البيئة */
    const envPasscode = process.env.ADMIN_PASSCODE;
    if (!envPasscode) {
      return NextResponse.json(
        { error: "ADMIN_PASSCODE_MISSING", message: "اضبط متغير البيئة ADMIN_PASSCODE أولاً" },
        { status: 503 }
      );
    }
    if (body.passcode !== envPasscode) {
      return NextResponse.json({ error: "INVALID" }, { status: 401 });
    }
    /* v2.7.0: حساب أدمين حقيقي في القاعدة — يضمن وصول إشعار فائز التحدي
       (وكل إشعارات الإدارة الداخلية) إلى معرّف ObjectId صحيح،
       ويعمل جرس الإشعارات في حساب الأدمين. إن لم يوجد مستند سابقاً
       (تثبيت قديم يعمل برمز البيئة وحده) يُنشأ مرة واحدة تلقائياً
       v1.4.0: حساب الرمز الرئيسي = المالك SUPER — وحده يدير فريق الإدارة */
    let admin = (await User.findOne({ role: "ADMIN" }).lean()) as { _id?: unknown; staffRole?: string | null } | null;
    if (!admin) {
      try {
        admin = (await User.create({ role: "ADMIN", pseudonym: "الإدارة", language: "ar", staffRole: "SUPER", staffName: "المالك" }).then((d: any) => d.toObject())) as { _id?: unknown; staffRole?: string | null };
      } catch {
        /* قاعدة مقيدة؟ نعود للمعرّف الاصطناعي القديم */
      }
    }
    /* ترقية الحساب القديم إلى SUPER إن كان بلا دور فريق */
    if (admin && !admin.staffRole) {
      await User.updateOne({ _id: admin._id }, { $set: { staffRole: "SUPER" } }).catch(() => {});
    }
    const uid = admin ? String(admin._id) : "admin";
    return NextResponse.json({
      ok: true,
      user: { id: uid, role: "ADMIN", staffRole: "SUPER" },
      /* v1.4.0: رمز الإدارة — إلزامي لكل أفعال اللوحة (بوابة خادمية) */
      token: uid === "admin" ? null : issueAdminToken(uid),
    });
  }

  /* ═ v1.4.0: دخول موظف الإدارة (أدمين/مسير) بالبريد وكلمة المرور ═ */
  if (action === "staff-login") {
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const u = (await User.findOne({ email, role: "ADMIN" }).lean()) as {
      _id?: unknown;
      suspended?: boolean;
      staffRole?: string | null;
      staffName?: string | null;
      pseudonym?: string | null;
      passwordHash?: string | null;
      passwordSalt?: string | null;
    } | null;
    if (!u || !u.passwordHash || !verifySecret(password, u.passwordHash, u.passwordSalt)) {
      return NextResponse.json({ error: "INVALID" }, { status: 401 });
    }
    if (u.suspended) return NextResponse.json({ error: "SUSPENDED" }, { status: 403 });
    const staffRole = u.staffRole === "SUPER" || u.staffRole === "MANAGER" ? u.staffRole : "ADMIN";
    return NextResponse.json({
      ok: true,
      user: { id: String(u._id), role: "ADMIN", staffRole, name: u.staffName || u.pseudonym || null },
      token: issueAdminToken(String(u._id)),
    });
  }

  /* ═ v1.4.0: بوابة الصلاحيات — كل فعل بعد الدخول يتطلب رمزاً صالحاً
     ومستوى صلاحية كافياً (سدّ ثغرة: كانت الأفعال متاحة بلا أي تحقق!) */
  const gate = await adminGuard(req, String(action || ""));
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  /* ═ v1.4.0: إدارة فريق الإدارة — المالك (SUPER) حصراً ═ */
  if (action === "staff-list") {
    const staff = (await User.find({ role: "ADMIN" }).sort({ createdAt: -1 }).lean()) as Record<string, unknown>[];
    return NextResponse.json({
      staff: staff.map((u) => ({
        id: String(u._id),
        name: (u.staffName as string) || (u.pseudonym as string) || null,
        email: (u.email as string) || null,
        staffRole: (u.staffRole as string) || "ADMIN",
        suspended: !!u.suspended,
        isMaster: !!(u.staffRole === "SUPER" && !(u.email as string)),
        createdAt: u.createdAt as unknown,
      })),
    });
  }

  if (action === "staff-create") {
    const { staffName, email, password, staffRole } = body;
    const name = String(staffName || "").trim().slice(0, 80);
    const mail = String(email || "").trim().toLowerCase();
    const role = staffRole === "SUPER" || staffRole === "MANAGER" ? staffRole : "ADMIN";
    if (!name || !mail || !password || String(password).length < 8) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }
    if (await User.findOne({ email: mail }).lean()) {
      return NextResponse.json({ error: "EMAIL_EXISTS" }, { status: 409 });
    }
    const pw = hashSecret(String(password));
    const created = await User.create({
      role: "ADMIN",
      email: mail,
      pseudonym: name,
      staffName: name,
      staffRole: role,
      language: "ar",
      passwordHash: pw.hash,
      passwordSalt: pw.salt,
    });
    return NextResponse.json({ ok: true, id: String(created._id) });
  }

  if (action === "staff-toggle") {
    const { userId, suspended } = body;
    if (!userId || typeof suspended !== "boolean") {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }
    const target = (await User.findById(userId).lean()) as { role?: string; staffRole?: string } | null;
    if (!target || target.role !== "ADMIN") return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    /* المالك الأصلي (برمز البيئة بلا بريد) لا يُعلَّق أبداً */
    if (target.staffRole === "SUPER") {
      const withEmail = !!(await User.findOne({ _id: userId, email: { $ne: null } }).lean());
      if (!withEmail) return NextResponse.json({ error: "PROTECTED" }, { status: 400 });
    }
    await User.updateOne({ _id: userId }, { $set: { suspended } });
    return NextResponse.json({ ok: true });
  }

  if (action === "staff-delete") {
    const { userId } = body;
    const target = (await User.findById(userId).lean()) as { role?: string; staffRole?: string; email?: string | null } | null;
    if (!target || target.role !== "ADMIN") return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (target.staffRole === "SUPER" && !target.email) {
      return NextResponse.json({ error: "PROTECTED" }, { status: 400 });
    }
    await Promise.all([
      PushSubscription.deleteMany({ userId }),
      InAppNotification.deleteMany({ userId }),
    ]);
    await User.findByIdAndDelete(userId);
    return NextResponse.json({ ok: true });
  }

  /* ─── إدارة الحسابات: قائمة كل المستخدمين مع بحث وفلترة ─── */
  if (action === "list-users") {
    const filter: Record<string, unknown> = {};
    if (body.role && body.role !== "ALL") filter.role = body.role;
    if (body.q && String(body.q).trim()) {
      const rx = new RegExp(escapeRegExp(String(body.q).trim()), "i");
      filter.$or = [{ pseudonym: rx }, { email: rx }];
    }
    /* v2.8.0 أداء: استبعاد الصور base64 الضخمة من استعلام القائمة —
       كانت سبب بطء قائمة الحسابات وطلبات التوثيق */
    const users = await User.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    const ids = users.map((u) => u._id);
    const profiles = await CounselorProfile.find({ userId: { $in: ids } })
      .select("userId fullName whatsapp verificationStatus yearsExperience")
      .lean();
    const byUser = new Map(profiles.map((p) => [String(p.userId), p]));
    return NextResponse.json({
      users: users.map((u) => {
        const p = byUser.get(String(u._id));
        return {
          id: String(u._id),
          role: u.role,
          pseudonym: u.pseudonym ?? null,
          email: u.email ?? null,
          wilaya: u.wilaya ?? null,
          language: u.language ?? null,
          createdAt: u.createdAt,
          fullName: p?.fullName ?? null,
          whatsapp: p?.whatsapp ?? null,
          verificationStatus: p?.verificationStatus ?? null,
          /* v1.9.0: سنوات الخبرة — يعدّلها الأدمين من تبويب الحسابات */
          yearsExperience: Number(p?.yearsExperience) || 0,
          /* v2.9.0: الجنس — للفرز والمراجعة (v1.0.0: بلا أي توثيق للعملاء) */
          gender: (u as { gender?: string | null }).gender ?? null,
          /* v2.6.0: حالة التعليق + عدّاد التأخر في قبول الطلبات */
          suspended: !!(u as unknown as { suspended?: boolean }).suspended,
          lateCount: Number(p?.lateCount) || 0,
        };
      }),
    });
  }

  /* ─── حذف حساب نهائياً مع كل بياناته (جلسات، رسائل، اشتراكات، ملف مهني) ─── */
  if (action === "delete-user") {
    const { userId } = body;
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
    const user = await User.findById(userId).lean();
    if (!user) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const sessions = await SupportSession.find({
      $or: [{ victimId: userId }, { counselorId: userId }],
    })
      .select("_id")
      .lean();
    const sessionIds = sessions.map((s) => s._id);

    await Promise.all([
      Message.deleteMany({ sessionId: { $in: sessionIds } }),
      SupportSession.deleteMany({ _id: { $in: sessionIds } }),
      PushSubscription.deleteMany({ userId }),
      InAppNotification.deleteMany({ userId }),
      CounselorProfile.deleteMany({ userId }),
    ]);
    await User.findByIdAndDelete(userId);
    return NextResponse.json({ ok: true });
  }

  /* ─── تعيين كلمة مرور جديدة لأي حساب (بلا حاجة للكلمة القديمة) ─── */
  if (action === "set-password") {
    const { userId, newPassword } = body;
    if (!userId || !newPassword || String(newPassword).length < 8) {
      return NextResponse.json({ error: "WEAK_PASSWORD" }, { status: 400 });
    }
    const pw = hashSecret(String(newPassword));
    const r = await User.updateOne(
      { _id: userId },
      { $set: { passwordHash: pw.hash, passwordSalt: pw.salt } }
    );
    if (!r.matchedCount) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  /* ─── إنشاء حساب مباشرة من لوحة الإدارة (عميل أو أخصائي) ─── */
  if (action === "create-account") {
    const { role, pseudonym, email, password, recoveryPhrase, fullName, whatsapp, wilaya, ageGroup, gender, phone, language, specialties, languages, bio, yearsExperience, verified } = body;
    if (!password || String(password).length < 8) {
      return NextResponse.json({ error: "WEAK_PASSWORD" }, { status: 400 });
    }
    const pw = hashSecret(String(password));
    /* عبارة الاسترجاع: ما كتبه الأدمين أو كلمة المرور نفسها كبديل */
    const rec = hashSecret(String(recoveryPhrase || password).trim());

    if (role === "VICTIM") {
      const name = String(pseudonym || "").trim();
      if (!name || name.length < 3) {
        return NextResponse.json({ error: "PSEUDONYM_REQUIRED" }, { status: 400 });
      }
      const existing = await User.findOne({ role: "VICTIM", pseudonym: new RegExp(`^${escapeRegExp(name)}$`, "i") }).lean();
      if (existing) return NextResponse.json({ error: "PSEUDONYM_TAKEN" }, { status: 409 });
      /* v1.0.0 (طمأنينة): كل الحقول مثل التسجيل العادي — الحساب جاهز فوراً
         بلا أي توثيق (العملاء لا يُوثَّقون أصلاً في النسخة التجارية) */
      const cleanPhone = phone ? normalizeWhatsapp(String(phone)) : null;
      if (phone && !cleanPhone) return NextResponse.json({ error: "INVALID_PHONE" }, { status: 400 });
      const user = await User.create({
        role: "VICTIM",
        pseudonym: name,
        language: language || "ar",
        wilaya: wilaya || null,
        ageGroup: ageGroup || null,
        gender: gender === "male" || gender === "female" ? gender : null,
        phone: cleanPhone,
        passwordHash: pw.hash,
        passwordSalt: pw.salt,
        recoveryHash: rec.hash,
        recoverySalt: rec.salt,
      });
      return NextResponse.json({ ok: true, userId: user._id.toString() });
    }

    if (role === "COUNSELOR") {
      const name = String(fullName || "").trim();
      const cleanEmail = String(email || "").trim().toLowerCase();
      if (!name || !cleanEmail) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      }
      const existing = await User.findOne({ email: cleanEmail }).lean();
      if (existing) return NextResponse.json({ error: "EMAIL_EXISTS" }, { status: 409 });
      const wa = whatsapp ? normalizeWhatsapp(whatsapp) : null;
      if (whatsapp && !wa) return NextResponse.json({ error: "INVALID_WHATSAPP" }, { status: 400 });
      const user = await User.create({
        role: "COUNSELOR",
        email: cleanEmail,
        language: language || "ar",
        pseudonym: name,
        passwordHash: pw.hash,
        passwordSalt: pw.salt,
        recoveryHash: rec.hash,
        recoverySalt: rec.salt,
      });
      await CounselorProfile.create({
        userId: user._id,
        fullName: name,
        specialties: Array.isArray(specialties) && specialties.length ? specialties : ["trauma"],
        languages: Array.isArray(languages) && languages.length ? languages : ["ar"],
        whatsapp: wa,
        bio: bio || null,
        yearsExperience: Number(yearsExperience) || 0,
        verificationStatus: verified ? "VERIFIED" : "PENDING",
        available: true,
      });
      return NextResponse.json({ ok: true, userId: user._id.toString() });
    }

    return NextResponse.json({ error: "Unsupported role" }, { status: 400 });
  }

  if (action === "pending-counselors") {
    /* v2.8.0 أداء: الصورة الشخصية base64 مستبعدة من القائمة — فقط صورة الشهادة
       تُحمّل (تحتاجها الإدارة للتوثيق) — كان هذا الاستعلام يجرّ كل الصور لكل زيارة */
    const profiles = await CounselorProfile.find().sort({ createdAt: -1 }).select("-photo").lean();
    const userIds = profiles.map((p) => p.userId);
    const users = await User.find({ _id: { $in: userIds } }).select("email").lean();
    const emailById = new Map(users.map((u) => [String(u._id), u.email]));

    const mapped = profiles.map((p) => ({
      id: String(p._id),
      userId: String(p.userId),
      fullName: p.fullName,
      email: emailById.get(String(p.userId)) ?? null,
      whatsapp: p.whatsapp || null,
      specialties: p.specialties || [],
      languages: p.languages || [],
      bio: p.bio ?? null,
      yearsExperience: p.yearsExperience ?? 0,
      diplomaImage: p.diplomaImage || null,
      verificationStatus: p.verificationStatus,
      available: !!p.available,
      rating: p.rating ?? 5,
      sessionsCount: p.sessionsCount ?? 0,
      createdAt: p.createdAt,
    }));

    return NextResponse.json({
      pending: mapped.filter((p) => p.verificationStatus === "PENDING"),
      all: mapped,
    });
  }

  if (action === "verify" || action === "reject" || action === "unverify") {
    const { profileId } = body;
    if (!profileId) return NextResponse.json({ error: "profileId required" }, { status: 400 });
    const status = action === "verify" ? "VERIFIED" : action === "reject" ? "REJECTED" : "PENDING";
    /* v1.5.0: منطق التوثيق المضمون في كل مرة:
       ① التحقق من وجود الملف أولاً — لا نجاح صامت لمعرّف خاطئ
       ② التحديث شرطي بحالة مختلفة عن الحالة المطلوبة (لا كتابة زائدة)
       ③ إشعار فوري للأخصائي بالنتيجة (توثيق أو اعتذار)
       ④ إعادة الحالة الجديدة للواجهة لتغذية راجعة دقيقة */
    const profile = (await CounselorProfile.findById(profileId).select("userId verificationStatus").lean()) as {
      _id: unknown;
      userId: unknown;
      verificationStatus?: string;
    } | null;
    if (!profile) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
    if (profile.verificationStatus !== status) {
      await CounselorProfile.findByIdAndUpdate(profileId, { $set: { verificationStatus: status } });
      /* v1.8.0 (مبدأ رفيقي): بعد اتخاذ القرار النهائي (توثيق أو اعتذار) تُحذف
         صورة الشهادة base64 من قاعدة البيانات تلقائياً — كانت تبقى مدفونة
         للأبد (حتى 900KB لكل أخصائي!) وتنفّر القاعدة بلا أي فائدة:
         الحالة مسجّلة، وصورة أخصائي موثّق/مرفوض لا تُراجع مجدداً،
         وإذا أعاد التقديم يرفع صورة جديدة نظيفة */
      await CounselorProfile.findByIdAndUpdate(profileId, { $unset: { diplomaImage: "" } }).catch(() => {});
      if (action === "verify") {
        notifyUser(String(profile.userId), "counselorVerified", "/?view=counselor-dashboard").catch(() => {});
      } else if (action === "reject") {
        notifyUser(String(profile.userId), "counselorRejected", "/?view=settings").catch(() => {});
      }
    }
    return NextResponse.json({ ok: true, profileId: String(profileId), status });
  }

  /* ─── v1.9.0: تعديل سنوات خبرة أخصائي — من تبويب الحسابات ───
     معرّف الحساب هو userId (كما في بقية صفوف القائمة)، والقيمة 0–70 سنة */
  if (action === "set-experience") {
    const { userId: targetUserId, years } = body;
    if (!targetUserId) return NextResponse.json({ error: "userId required" }, { status: 400 });
    const y = Math.round(Number(years));
    if (!Number.isFinite(y) || y < 0 || y > 70) {
      return NextResponse.json({ error: "INVALID_EXPERIENCE" }, { status: 400 });
    }
    const prof = await CounselorProfile.findOneAndUpdate(
      { userId: targetUserId },
      { $set: { yearsExperience: y } },
      { new: true }
    ).select("userId yearsExperience");
    if (!prof) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ ok: true, yearsExperience: prof.yearsExperience });
  }

  /* ─── الملاحظات والبلاغات: قائمة + حذف + تعيين كمعالجة ─── */
  if (action === "feedback-list") {
    const items = await Feedback.find().sort({ createdAt: -1 }).limit(200).lean();
    return NextResponse.json({
      feedbacks: items.map((f) => ({
        id: String(f._id),
        type: f.type,
        subject: f.subject ?? "",
        message: f.message,
        contact: f.contact ?? null,
        handled: !!f.handled,
        createdAt: f.createdAt,
      })),
    });
  }

  if (action === "feedback-delete") {
    const { feedbackId } = body;
    if (!feedbackId) return NextResponse.json({ error: "feedbackId required" }, { status: 400 });
    await Feedback.findByIdAndDelete(feedbackId);
    return NextResponse.json({ ok: true });
  }

  if (action === "feedback-handled") {
    const { feedbackId, handled } = body;
    if (!feedbackId) return NextResponse.json({ error: "feedbackId required" }, { status: 400 });
    await Feedback.findByIdAndUpdate(feedbackId, { $set: { handled: !!handled } });
    return NextResponse.json({ ok: true });
  }

  if (action === "crisis-log") {
    /* سجل مُثرى (v2.5.4): الاسم المستعار للعميل + اسم الأخصائي + من كتب العبارة */
    const logs = await listEnrichedCrisisLogs();
    return NextResponse.json({ logs });
  }

  if (action === "stats") {
    const [users, sessions, verifiedCounselors, crises, completed, byModeAgg] = await Promise.all([
      User.countDocuments(),
      SupportSession.countDocuments(),
      CounselorProfile.countDocuments({ verificationStatus: "VERIFIED" }),
      CrisisLog.countDocuments(),
      SupportSession.countDocuments({ status: "COMPLETED" }),
      SupportSession.aggregate([{ $group: { _id: "$mode", count: { $sum: 1 } } }]),
    ]);
    const byMode = byModeAgg.map((m) => ({ mode: m._id, _count: m.count }));
    return NextResponse.json({
      stats: { users, sessions, verifiedCounselors, crises, completed, byMode },
    });
  }

  /* ─── v2.7.0: حالة التحدي — الفائز يظهر دائماً في لوحة الإدارة ───
     يُرجع معلومات الفائز (الاسم، تاريخ الفوز، معرّف الملف للصورة) وإحصاءات المشاركة */
  if (action === "challenge-status") {
    const status = await challengeStatus(null);
    return NextResponse.json({ ok: true, winner: status.winner, active: status.active });
  }

  /* ─── v1.6.0: لوحة تحكّم التحديين — إعدادات + فائز + إعادة تشغيل ───
     طلب المستخدم: صلاحية الأدمين بتفعيل/تعطيل التحدي وتحديد مدة الصلاحية،
     للتحديين معاً (المختصين والعملاء) */
  if (action === "challenge-config-get") {
    const [counselor, victim, cWinner, vWinner] = await Promise.all([
      readChallengeConfig("counselor"),
      readChallengeConfig("victim"),
      getChallengeWinner(),
      getVictimChallengeWinner(),
    ]);
    return NextResponse.json({ ok: true, counselor: { ...counselor, winner: cWinner }, victim: { ...victim, winner: vWinner } });
  }

  if (action === "challenge-config-set") {
    const which = body.which === "victim" ? "victim" : "counselor";
    const enabled = !!body.enabled;
    const durationDays = Math.max(0, Math.min(3650, Math.round(Number(body.durationDays) || 0)));
    const cfg = await writeChallengeConfig(which as ChallengeWhich, { enabled, durationDays });
    return NextResponse.json({ ok: true, config: cfg });
  }

  if (action === "challenge-reset") {
    const which = body.which === "victim" ? "victim" : "counselor";
    /* إعادة تشغيل: مسح الفائز + تفعيل بلا حد زمني جديد */
    if (which === "victim") {
      const { VictimChallengeState } = await import("@/lib/models");
      await VictimChallengeState.findByIdAndUpdate("victim-challenge", { $set: { winnerUserId: null, winnerName: null, wonAt: null } }, { upsert: true });
    } else {
      const { ChallengeState } = await import("@/lib/models");
      await ChallengeState.findByIdAndUpdate("challenge", { $set: { winnerUserId: null, winnerName: null, winnerProfileId: null, wonAt: null } }, { upsert: true });
    }
    const cfg = await writeChallengeConfig(which as ChallengeWhich, { enabled: true, durationDays: 0 });
    return NextResponse.json({ ok: true, config: cfg });
  }

  /* ─── تصدير البيانات: قائمة الجلسات الكاملة (يحوّلها العميل إلى Excel/CSV) ─── */
  if (action === "list-sessions") {
    const sessions = await SupportSession.find()
      .sort({ createdAt: -1 })
      .limit(1000)
      .populate("victimId", "pseudonym")
      .populate("counselorId", "pseudonym")
      .lean();
    return NextResponse.json({
      sessions: sessions.map((s: Record<string, unknown>) => {
        const victim = s.victimId as { pseudonym?: string } | null;
        const counselor = s.counselorId as { pseudonym?: string } | null;
        return {
          id: String(s._id),
          topic: s.topic,
          mode: s.mode,
          status: s.status,
          scheduledAt: s.scheduledAt,
          victim: victim?.pseudonym ?? null,
          counselor: counselor?.pseudonym ?? null,
          moodBefore: s.moodBefore ?? null,
          moodAfter: s.moodAfter ?? null,
          crisisFlag: !!s.crisisFlag,
        };
      }),
    });
  }

  /* ─── v2.6.0: الطلبات المعلّقة لأخصائي معيّن (زر بجانب كل حساب أخصائي) ───
     كل تفاصيل الطلب: العميل المستعار + تاريخ الإنشاء الكامل
     (YYYY/MM/DD HH:MM:SS) + الموضوع والوسيط والموعد المطلوب */
  if (action === "counselor-requests") {
    const { counselorUserId } = body;
    if (!counselorUserId) return NextResponse.json({ error: "counselorUserId required" }, { status: 400 });
    const sessions = await SupportSession.find({ counselorId: counselorUserId, status: "PENDING" })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    const victimIds = sessions.map((s) => (s as unknown as { victimId: unknown }).victimId);
    const victims = await User.find({ _id: { $in: victimIds } }).select("pseudonym").lean();
    const victimById = new Map(victims.map((v) => [String(v._id), (v as { pseudonym?: string }).pseudonym ?? null]));
    const now = Date.now();
    return NextResponse.json({
      requests: sessions.map((s) => {
        const doc = s as unknown as { _id: unknown; victimId: unknown; createdAt?: Date; scheduledAt?: Date; topic?: string; mode?: string };
        return {
          id: String(doc._id),
          victimAlias: victimById.get(String(doc.victimId)) ?? null,
          createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
          scheduledAt: doc.scheduledAt ? new Date(doc.scheduledAt).toISOString() : null,
          topic: doc.topic ?? null,
          mode: doc.mode ?? null,
          hoursPending: doc.createdAt ? Math.floor((now - new Date(doc.createdAt).getTime()) / 3600000) : 0,
        };
      }),
    });
  }

  /* ─── v2.6.0: المسح الدوري للطلبات المتأخرة +36 ساعة ───
     يوسم الطلبات، يزيد عدّاد التأخر للأخصائي، يُعلّق الحساب عند 3 تأخرات،
     ويُبلغ الأدمين (إشعار داخلي) — ثم يعيد القائمة الحالية للافتة اللوحة */
  if (action === "overdue-requests") {
    await sweepOverdueRequests();
    const overdue = await listOverdueRequests();
    return NextResponse.json({ overdue });
  }

  /* ─── v2.6.0: تفعيل / تعطيل أي حساب (أخصائي أو عميل) من الإدارة ───
     إعادة تفعيل الأخصائي تُصفّر عدّاد التأخر — بداية جديدة */
  if (action === "toggle-user") {
    const { userId, suspended } = body;
    if (!userId || typeof suspended !== "boolean") {
      return NextResponse.json({ error: "userId and suspended required" }, { status: 400 });
    }
    const target = await User.findById(userId).select("role").lean();
    if (!target) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if ((target as { role?: string }).role === "ADMIN") {
      return NextResponse.json({ error: "CANNOT_SUSPEND_ADMIN" }, { status: 400 });
    }
    await User.updateOne({ _id: userId }, { $set: { suspended } });
    if (!suspended) {
      await CounselorProfile.updateOne({ userId }, { $set: { lateCount: 0 } });
    }
    return NextResponse.json({ ok: true, suspended });
  }

  /* ─── v2.8.0: تبويب الطلبات الملغاة — كل الطلبات المرفوضة/الملغاة بتفاصيلها ───
     الاسم المستعار للعميل + اسم الأخصائي + سبب التعذّر + من ألغى + المواعيد */
  if (action === "cancelled-requests") {
    const sessions = await SupportSession.find({ status: "CANCELLED" })
      .sort({ updatedAt: -1 })
      .limit(200)
      .lean();
    const ids = [
      ...new Set(
        sessions.flatMap((x) => {
          const doc = x as unknown as { victimId: unknown; counselorId: unknown };
          return [String(doc.victimId), String(doc.counselorId)];
        })
      ),
    ];
    const users = await User.find({ _id: { $in: ids } }).select("pseudonym").lean();
    const profiles = await CounselorProfile.find({ userId: { $in: ids } }).select("userId fullName").lean();
    const nameById = new Map(users.map((u) => [String(u._id), (u as { pseudonym?: string }).pseudonym ?? null]));
    const fullNameByUserId = new Map(profiles.map((pf) => [String(pf.userId), (pf as { fullName?: string }).fullName ?? null]));

    return NextResponse.json({
      cancelled: sessions.map((x) => {
        const doc = x as unknown as {
          _id: unknown; victimId: unknown; counselorId: unknown; topic?: string; mode?: string;
          scheduledAt?: Date; createdAt?: Date; updatedAt?: Date;
          cancelReason?: string | null; cancelledBy?: string | null;
        };
        return {
          id: String(doc._id),
          victimAlias: nameById.get(String(doc.victimId)) ?? null,
          counselorName: fullNameByUserId.get(String(doc.counselorId)) ?? nameById.get(String(doc.counselorId)) ?? null,
          topic: doc.topic ?? null,
          mode: doc.mode ?? null,
          scheduledAt: doc.scheduledAt ? new Date(doc.scheduledAt).toISOString() : null,
          createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
          cancelledAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
          cancelReason: doc.cancelReason || null,
          cancelledBy: doc.cancelledBy || null,
        };
      }),
    });
  }

  /* ─── v2.8.0: حذف طلب معلق مباشرة من المنصة (الأدمين) — مع رسائله */
  if (action === "delete-session") {
    const { sessionId } = body;
    if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    if (!(await SupportSession.findById(sessionId).lean())) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    await Message.deleteMany({ sessionId });
    await SupportSession.findByIdAndDelete(sessionId);
    return NextResponse.json({ ok: true });
  }

  /* ─── v2.8.0: الإشعار الجماعي — لكل العميلين أو المختصين أو مستخدم معيّن أو الجميع ───
     v1.3.0: الهدف المفرد يُحدَّد بالاسم المستعار أو البريد الإلكتروني (وليس ID) —
     ويبقى قبول معرّف قاعدة البيانات احتياطاً للتوافق */
  if (action === "bulk-notify") {
    const { target, identifier, userId, textAr, textFr, textEn } = body;
    const ta = String(textAr || "").trim();
    if (!ta) return NextResponse.json({ error: "TEXT_REQUIRED" }, { status: 400 });
    if (!["ALL_VICTIMS", "ALL_COUNSELORS", "ALL", "USER"].includes(String(target))) {
      return NextResponse.json({ error: "BAD_TARGET" }, { status: 400 });
    }
    if (String(target) === "USER") {
      const ident = String(identifier || userId || "").trim();
      if (!ident) return NextResponse.json({ error: "IDENTIFIER_REQUIRED" }, { status: 400 });
      /* البحث بالبريد أولاً (مطابقة تامة) ثم بالاسم المستعار (غير حساس لحالة الأحرف) */
      let u = (await User.findOne({ email: ident.toLowerCase() }).select("_id").lean()) as unknown as { _id: unknown } | null;
      if (!u) {
        u = (await User.findOne({ pseudonym: new RegExp(`^${ident.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") })
          .select("_id")
          .lean()) as unknown as { _id: unknown } | null;
      }
      if (!u && /^[0-9a-f]{24}$/i.test(ident)) {
        u = (await User.findById(ident).select("_id").lean()) as unknown as { _id: unknown } | null;
      }
      if (!u) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
      const r = await notifyBulk([String(u._id)], ta, String(textFr || "").trim() || undefined, String(textEn || "").trim() || undefined);
      return NextResponse.json({ ok: true, sent: r.sent, count: 1 });
    }
    const filter: Record<string, unknown> = { suspended: false };
    if (target === "ALL_VICTIMS") filter.role = "VICTIM";
    else if (target === "ALL_COUNSELORS") filter.role = "COUNSELOR";
    const users = (await User.find(filter).select("_id").limit(5000).lean()) as unknown as { _id: unknown }[];
    const r = await notifyBulk(users.map((u) => String(u._id)), ta, String(textFr || "").trim() || undefined, String(textEn || "").trim() || undefined);
    return NextResponse.json({ ok: true, sent: r.sent, count: users.length });
  }

  /* ─── v2.8.0: صفحة المؤسسين — قراءة وحفظ من تبويب خاص باللوحة ─── */
  if (action === "founders-get") {
    const doc = (await FoundersContent.findOne({ key: "founders" }).lean()) as Record<string, unknown> | null;
    return NextResponse.json({
      content: {
        textAr: (doc?.textAr as string) ?? "",
        textFr: (doc?.textFr as string) ?? "",
        textEn: (doc?.textEn as string) ?? "",
        developerName: (doc?.developerName as string) ?? "",
        developerRole: (doc?.developerRole as string) ?? "",
        members: Array.isArray(doc?.members) ? doc?.members : [],
      },
    });
  }

  if (action === "founders-save") {
    const { textAr, textFr, textEn, developerName, developerRole, members } = body;
    if (!String(textAr || "").trim() || !String(textFr || "").trim() || !String(textEn || "").trim()) {
      return NextResponse.json({ error: "MISSING_LANGUAGES" }, { status: 400 });
    }
    const cleanMembers = Array.isArray(members)
      ? members
          .map((m: { name?: unknown; role?: unknown }) => ({
            name: String(m?.name ?? "").trim().slice(0, 120),
            role: String(m?.role ?? "").trim().slice(0, 120),
          }))
          .filter((m: { name: string }) => m.name)
          .slice(0, 100)
      : [];
    await FoundersContent.findOneAndUpdate(
      { key: "founders" },
      {
        $set: {
          textAr: String(textAr).slice(0, 5000),
          textFr: String(textFr).slice(0, 5000),
          textEn: String(textEn).slice(0, 5000),
          developerName: String(developerName || "").trim().slice(0, 120),
          developerRole: String(developerRole || "").trim().slice(0, 120),
          members: cleanMembers,
        },
      },
      { upsert: true }
    );
    return NextResponse.json({ ok: true });
  }

  /* ─── v2.9.0: لوحة القيادة — كل الإحصائيات التي يحتاجها الأدمين في صفحة واحدة ─── */
  if (action === "dashboard-stats") {
    const now = new Date();
    const todayKey = dayKeyUTC1(now);
    const dayStart = new Date(`${todayKey}T00:00:00+01:00`).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const weekStart = dayStart - 6 * 24 * 60 * 60 * 1000;

    const [
      totalVictims,
      totalCounselors,
      pendingCounselors,
      suspendedUsers,
      totalSessions,
      pendingSessions,
      acceptedSessions,
      activeSessions,
      completedSessions,
      cancelledSessions,
      todaySessions,
      weekSessions,
      crisisCount,
      feedbackUnhandled,
      messagesCount,
      genderAgg,
      wilayaAgg,
      counselorLoad,
      victimWinner,
      counselorWinner,
    ] = await Promise.all([
      User.countDocuments({ role: "VICTIM" }),
      User.countDocuments({ role: "COUNSELOR" }),
      CounselorProfile.countDocuments({ verificationStatus: "PENDING" }),
      User.countDocuments({ suspended: true }),
      SupportSession.countDocuments(),
      SupportSession.countDocuments({ status: "PENDING" }),
      SupportSession.countDocuments({ status: "ACCEPTED" }),
      SupportSession.countDocuments({ status: "ACTIVE" }),
      SupportSession.countDocuments({ status: "COMPLETED" }),
      SupportSession.countDocuments({ status: "CANCELLED" }),
      SupportSession.countDocuments({ scheduledAt: { $gte: new Date(dayStart), $lt: new Date(dayEnd) } }),
      SupportSession.countDocuments({ scheduledAt: { $gte: new Date(weekStart), $lt: new Date(dayEnd) } }),
      CrisisLog.countDocuments(),
      Feedback.countDocuments({ handled: false }),
      Message.countDocuments({}),
      User.aggregate([{ $match: { role: "VICTIM" } }, { $group: { _id: "$gender", n: { $sum: 1 } } }]),
      User.aggregate([{ $match: { role: "VICTIM", wilaya: { $ne: null } } }, { $group: { _id: "$wilaya", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 6 }]),
      SupportSession.aggregate([
        { $match: { status: { $in: ["ACCEPTED", "ACTIVE", "COMPLETED"] } } },
        { $group: { _id: "$counselorId", n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 5 },
      ]),
      getVictimChallengeWinner(),
      challengeStatus(null).then((s) => s.winner),
    ]);

    /* sessions آخرة 14 يوماً — رسم بياني مبسّط في اللوحة */
    const dailyAgg = await SupportSession.aggregate([
      { $match: { createdAt: { $gte: new Date(dayStart - 13 * 24 * 60 * 60 * 1000) } } },
      {
        $group: {
          _id: { $dateToString: { date: "$createdAt", timezone: "+01:00", format: "%Y-%m-%d" } },
          n: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    const daily: { day: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(dayStart - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      const hit = dailyAgg.find((x) => x._id === key);
      daily.push({ day: key, count: hit ? hit.n : 0 });
    }

    /* أسماء أعلى الأخصائيين حملاً */
    const loadIds = counselorLoad.map((c) => String(c._id));
    const loadUsers = loadIds.length
      ? await CounselorProfile.find({ userId: { $in: loadIds } }).select("userId fullName").lean()
      : [];
    const nameByUid = new Map(loadUsers.map((p: Record<string, unknown>) => [String(p.userId), p.fullName as string]));

    return NextResponse.json({
      stats: {
        users: { totalVictims, totalCounselors, pendingCounselors, suspendedUsers },
        sessions: { totalSessions, pendingSessions, acceptedSessions, activeSessions, completedSessions, cancelledSessions, todaySessions, weekSessions },
        crisisCount,
        feedbackUnhandled,
        messagesCount,
        gender: genderAgg.map((g) => ({ key: g._id ?? "unknown", n: g.n })),
        wilayas: wilayaAgg.map((w) => ({ key: w._id, n: w.n })),
        counselorLoad: counselorLoad.map((c) => ({ name: nameByUid.get(String(c._id)) || "—", n: c.n })),
        daily,
        victims: { victimWinner, counselorWinner },
      },
    });
  }

  /* ─── v2.10.0: صندوق محادثات المختصين مع الإدارة ───
     يجمّع خيوط admin:{counselorId} مع آخر رسالة وعددها واسم المختص،
     مرتبة من الأحدث — تُعرض في تبويب «رسائل المختصين» بلوحة الإدارة. */
  if (action === "admin-threads") {
    const msgs = (await Message.find({ threadKey: { $regex: /^admin:/ } })
      .sort({ createdAt: -1 })
      .limit(800)
      .select("threadKey senderRole senderName content createdAt")
      .lean()) as {
      threadKey?: string | null;
      senderRole?: string;
      senderName?: string | null;
      content?: string;
      createdAt?: Date;
    }[];
    const byThread = new Map<
      string,
      { lastAt: string; count: number; lastRole: string; lastContent: string; lastSender: string }
    >();
    for (const m of msgs) {
      const k = String(m.threadKey || "");
      if (!k) continue;
      const cur = byThread.get(k);
      if (!cur) {
        byThread.set(k, {
          lastAt: new Date(m.createdAt as unknown as string).toISOString(),
          count: 1,
          lastRole: String(m.senderRole || ""),
          lastContent: String(m.content || ""),
          lastSender: String(m.senderName || ""),
        });
      } else {
        cur.count += 1;
      }
    }
    const threads: Record<string, unknown>[] = [];
    for (const [key, v] of byThread) {
      const cid = key.split(":")[1] || "";
      let counselorName = "—";
      if (/^[a-f\d]{24}$/i.test(cid)) {
        const u = (await User.findById(cid).select("pseudonym").lean()) as { pseudonym?: string } | null;
        counselorName = u?.pseudonym || "—";
      }
      threads.push({ key, counselorId: cid, counselorName, ...v });
    }
    threads.sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)));
    return NextResponse.json({ ok: true, threads });
  }

  /* ─── v1.7.0: مستحقات المختصين — نسخة إدارية من صفحة «إحصائياتي» ───
     لكل مختص: عدد الجلسات المكتملة + الإجمالي بعملته (DZD/EUR/USD بلا تحويل)
     + عمولة المنصة 15% + صافي مستحقه + مستحق هذا الشهر + آخر 8 جلسات بتفاصيلها
     (العميل، الموضوع، السعر، العمولة، التاريخ). قراءة للمسير (مستوى 1). */
  if (action === "counselors-earnings") {
    type MoneyBag = Record<CurrencyCode, number>;
    const emptyBag = (): MoneyBag => ({ DZD: 0, EUR: 0, USD: 0 });
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const bagOf = (b: MoneyBag) => {
      const out = {} as MoneyBag;
      for (const c of CURRENCY_CODES) out[c] = r2(b[c]);
      return out;
    };

    const counselors = (await User.find({ role: "COUNSELOR" })
      .select("pseudonym email suspended createdAt")
      .sort({ createdAt: 1 })
      .lean()) as { _id?: unknown; pseudonym?: string | null; email?: string | null; suspended?: boolean; createdAt?: Date }[];

    const completed = (await SupportSession.find({ status: "COMPLETED" })
      .select("counselorId victimId price currency topic mode endedAt scheduledAt")
      .sort({ endedAt: -1, scheduledAt: -1 })
      .limit(5000)
      .populate("victimId", "pseudonym")
      .lean()) as {
      counselorId?: { _id?: unknown } | unknown;
      victimId?: { pseudonym?: string } | null;
      price?: number | null;
      currency?: string | null;
      topic?: string;
      mode?: string;
      endedAt?: Date | null;
      scheduledAt?: Date;
    }[];

    const thisMonthKey = new Date().toISOString().slice(0, 7);
    const byCounselor = new Map<
      string,
      {
        count: number;
        gross: MoneyBag;
        commission: MoneyBag;
        net: MoneyBag;
        dueThisMonth: MoneyBag;
        lastCompletedAt: string | null;
        recent: { clientAlias: string | null; topic: string; mode: string; price: number; currency: CurrencyCode; commission: number; endedAt: string | null }[];
      }
    >();

    for (const s of completed) {
      const cid = s.counselorId ? String((s.counselorId as { _id?: unknown })._id ?? s.counselorId) : "";
      if (!cid) continue;
      const price = Math.max(0, Number(s.price) || 0);
      const cur = (s.currency === "EUR" || s.currency === "USD" ? s.currency : "DZD") as CurrencyCode;
      const when = s.endedAt || s.scheduledAt;
      if (!when) continue;
      let row = byCounselor.get(cid);
      if (!row) {
        row = { count: 0, gross: emptyBag(), commission: emptyBag(), net: emptyBag(), dueThisMonth: emptyBag(), lastCompletedAt: null, recent: [] };
        byCounselor.set(cid, row);
      }
      row.count += 1;
      row.gross[cur] += price;
      row.commission[cur] += price * PLATFORM_COMMISSION_RATE;
      row.net[cur] += price * (1 - PLATFORM_COMMISSION_RATE);
      const whenIso = new Date(when).toISOString();
      if (!row.lastCompletedAt || whenIso > row.lastCompletedAt) row.lastCompletedAt = whenIso;
      if (whenIso.slice(0, 7) === thisMonthKey) row.dueThisMonth[cur] += price * PLATFORM_COMMISSION_RATE;
      if (row.recent.length < 8) {
        row.recent.push({
          clientAlias: s.victimId?.pseudonym || null,
          topic: s.topic || "other",
          mode: s.mode || "TEXT",
          price,
          currency: cur,
          commission: r2(price * PLATFORM_COMMISSION_RATE),
          endedAt: whenIso,
        });
      }
    }

    const grand = { count: 0, gross: emptyBag(), commission: emptyBag(), net: emptyBag(), dueThisMonth: emptyBag() };
    const rows = counselors.map((c) => {
      const id = String(c._id || "");
      const row = byCounselor.get(id);
      const gross = row?.gross || emptyBag();
      const commission = row?.commission || emptyBag();
      const net = row?.net || emptyBag();
      const due = row?.dueThisMonth || emptyBag();
      grand.count += row?.count || 0;
      for (const cur of CURRENCY_CODES) {
        grand.gross[cur] += gross[cur];
        grand.commission[cur] += commission[cur];
        grand.net[cur] += net[cur];
        grand.dueThisMonth[cur] += due[cur];
      }
      return {
        id,
        name: c.pseudonym || "—",
        email: c.email || null,
        suspended: !!c.suspended,
        completedCount: row?.count || 0,
        gross: bagOf(gross),
        commission: bagOf(commission),
        net: bagOf(net),
        dueThisMonth: bagOf(due),
        lastCompletedAt: row?.lastCompletedAt || null,
        recent: row?.recent || [],
      };
    });
    /* المختصون بجلسات مكتملة أولاً (تنازلياً بالعدد) ثم الباقي */
    rows.sort((a, b) => b.completedCount - a.completedCount || a.name.localeCompare(b.name));

    return NextResponse.json({
      ok: true,
      commissionRate: PLATFORM_COMMISSION_RATE,
      grand: { count: grand.count, gross: bagOf(grand.gross), commission: bagOf(grand.commission), net: bagOf(grand.net), dueThisMonth: bagOf(grand.dueThisMonth) },
      counselors: rows,
    });
  }

  /* ═ v1.12.0: عقد المنصة الواحد — عقد علاجي واحد لكل المستخدمين يمثل
     المنصة، نصه تديره الإدارة من هنا حصراً (بوابة الصلاحيات أعلاه تفرض
     مستوى أدمين كامل للتعديل). الأخصائيون والعملاء يرونه قراءةً فقط
     ولا يمكن لأحد منهم إنشاء عقد خاص أو تعديل نصه — الأخصائي يمضيه فقط
     وكل حجز جديد يأخذ لقطة محمية من النص المعتمد لحظة إنشائه. ═ */
  if (action === "platform-contract-get") {
    const p = await getPlatformContract();
    return NextResponse.json({ ok: true, platform: p });
  }

  if (action === "platform-contract-save") {
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (text.length < 100 || text.length > 15000) {
      return NextResponse.json({ error: "INVALID_TEXT" }, { status: 400 });
    }
    /* اسم من عدّل — من هوية رمز الإدارة نفسها فلا انتحال */
    const editor = (await User.findById(gate.auth.uid).select("staffName pseudonym").lean()) as
      | { staffName?: string | null; pseudonym?: string | null }
      | null;
    const saved = await savePlatformContract(text, editor?.staffName || editor?.pseudonym || null);
    return NextResponse.json({ ok: true, ...saved });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export const POST = apiHandler(POST_impl);
