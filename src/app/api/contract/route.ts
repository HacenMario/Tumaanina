import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { CounselorProfile, SupportSession, TherapyContract, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";
import { notifyUser } from "@/lib/server/notify";
import { getPlatformContract, nextContractNumber, safeContractLang } from "@/lib/server/contract";

export const dynamic = "force-dynamic";

/* ═ v1.12.0: العقد العلاجي — عقدٌ واحد للمنصة كاملة ═
   ─────────────────────────────────────────────────
   ① عقد واحد لكل المستخدمين يمثل المنصة: نصه تديره الإدارة حصراً من لوحة
      الأدمين (مسار admin المحمي برمز الفريق)، ولا يمكن لأي أخصائي أو عميل
      إنشاء عقد خاص أو تعديل نص العقد — نُزعت خاصية «العقد الخاص» نهائياً.
   ② الأخصائي يقرأ عقد المنصة من إعداداته (قراءة فقط) ويمضيه رقمياً مرة
      واحدة (counselor-sign) — نص عقد المنصة لا يقبل أي تعديل من طرفه.
   ③ لحظة حجز العميل جلسة مع أخصائي ممضٍ يُنشأ للجلسة عقد مستقل برقم
      تسلسلي فريد يحمل لقطة محمية من نص عقد المنصة وإمضاء الأخصائي،
      فتظهر نافذة الامضاء للعميل فوراً بعد كل حجز مهما تكرر.
   ④ العميل المسجّل يرى النافذة الإلزامية، يمضي رقمياً ويكتب اسمه الكامل
      ويضغط «أقبل» فتُحفظ النسخة الموقّعة من الطرفين في حساب الأخصائي.
   الحماية المتبادلة: لقطة نص العقد وإمضاء الأخصائي تُثبَّت لحظة الإنشاء
   ولا تتغير بعد التوقيع، وكل توقيع يُخزَّن مع اسمه وتاريخه الصريحين. */

const MAX_SIGNATURE_B64 = 300_000; /* لوحة امضاء PNG مضغوطة تتجاوز هذا => مرفوضة */

function validSignature(s: unknown): s is string {
  return (
    typeof s === "string" &&
    s.startsWith("data:image/") &&
    s.length > 100 &&
    s.length <= MAX_SIGNATURE_B64
  );
}

/* ─── GET ───
   ?view=platform           → نص عقد المنصة (لعرضه للجميع — قراءة فقط)
   ?view=template&userId=…  → عقد المنصة + حالة إمضاء الأخصائي (إعداداته)
   ?view=pending&userId=…   → عقد بانتظار توقيع هذا العميل (النافذة المنبثقة)
   ?view=list&userId=…      → عقود الأخصائي كلها (بيانات القائمة)
   ?view=one&id=…&userId=…  → عقد واحد كامل (للطرفين فقط) */
async function GET_impl(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view") || "pending";
  const userId = searchParams.get("userId") || "";
  await connectDB();

  /* view=platform متاح حتى بلا userId — قراءة عامة محمية من التعديل
     (نص عقد المنصة معتمد ولا يحمل بيانات شخصية) */
  if (view === "platform") {
    const p = await getPlatformContract();
    return NextResponse.json({ platform: p });
  }

  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  const user = (await User.findById(userId).select("role pseudonym").lean()) as
    | { role?: string; pseudonym?: string | null }
    | null;
  if (!user) return NextResponse.json({ error: "INVALID" }, { status: 401 });

  if (view === "template") {
    /* v1.12.0: الأخصائي يرى نص عقد المنصة قراءةً فقط + حالة إمضائه هو.
       نص العقد يأتي من المنصة (تديره الإدارة) — لا حقل تعديل لصالحه. */
    if (user.role !== "COUNSELOR") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const [prof, platform] = await Promise.all([
      CounselorProfile.findOne({ userId }).select("contractSignature contractSignedAt").lean() as
        | { contractSignature?: string | null; contractSignedAt?: Date | null }
        | null,
      getPlatformContract(),
    ]);
    return NextResponse.json({
      template: {
        text: platform.text,
        signature: prof?.contractSignature ?? null,
        signedAt: prof?.contractSignedAt ?? null,
        platformUpdatedAt: platform.updatedAt,
        locked: true, /* النص محمي — للقراءة فقط، الإدارة وحدها تعدّله */
      },
    });
  }

  if (view === "pending") {
    if (user.role !== "VICTIM") return NextResponse.json({ contract: null });
    const c = (await TherapyContract.findOne({ clientUserId: userId, status: "AWAITING_CLIENT" })
      .sort({ createdAt: -1 })
      .lean()) as {
      _id: unknown;
      number?: string | null;
      contractText: string;
      counselorName?: string | null;
      counselorSignature?: string | null;
      counselorSignedAt?: Date | null;
      sessionId?: unknown;
      createdAt?: Date;
    } | null;
    if (!c) return NextResponse.json({ contract: null });
    /* رقم العقد — موجّه مسبقاً عند الإنشاء؛ الاحتياط للعقود القديمة فقط */
    const number = c.number || (await nextContractNumber());
    /* موعد الجلسة المرتبطة للعرض السياقي داخل النافذة */
    let scheduledAt: string | null = null;
    if (c.sessionId) {
      const s = (await SupportSession.findById(c.sessionId).select("scheduledAt").lean()) as { scheduledAt?: Date } | null;
      scheduledAt = s?.scheduledAt ? new Date(s.scheduledAt).toISOString() : null;
    }
    return NextResponse.json({
      contract: {
        id: String(c._id),
        number,
        text: c.contractText,
        counselorName: c.counselorName || null,
        counselorSignature: c.counselorSignature || null,
        counselorSignedAt: c.counselorSignedAt ? new Date(c.counselorSignedAt).toISOString() : null,
        scheduledAt,
        createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : null,
      },
    });
  }

  if (view === "list") {
    if (user.role !== "COUNSELOR") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const rows = (await TherapyContract.find({ counselorId: userId })
      .sort({ updatedAt: -1 })
      .limit(200)
      .select("number clientName status sessionId clientSignedAt counselorSignedAt createdAt updatedAt")
      .lean()) as Array<Record<string, unknown>>;
    /* مواعيد الجلسات المرتبطة — استعلام واحد */
    const sids = rows.map((r) => String(r.sessionId || "")).filter(Boolean);
    const sessions = sids.length
      ? ((await SupportSession.find({ _id: { $in: sids } }).select("scheduledAt").lean()) as Array<{ _id: unknown; scheduledAt?: Date }>)
      : [];
    const whenBySid = new Map(sessions.map((s) => [String(s._id), s.scheduledAt ? new Date(s.scheduledAt).toISOString() : null]));
    return NextResponse.json({
      contracts: rows.map((r) => ({
        id: String(r._id),
        number: r.number || null,
        clientName: r.clientName || null,
        status: r.status,
        scheduledAt: r.sessionId ? whenBySid.get(String(r.sessionId)) ?? null : null,
        counselorSignedAt: r.counselorSignedAt ? new Date(r.counselorSignedAt as Date).toISOString() : null,
        clientSignedAt: r.clientSignedAt ? new Date(r.clientSignedAt as Date).toISOString() : null,
        updatedAt: r.updatedAt ? new Date(r.updatedAt as Date).toISOString() : null,
      })),
    });
  }

  if (view === "one") {
    const id = searchParams.get("id") || "";
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const c = (await TherapyContract.findById(id).lean()) as Record<string, unknown> | null;
    if (!c) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    /* الطرفان فقط يطّلعان على العقد كاملاً */
    if (String(c.counselorId) !== userId && String(c.clientUserId) !== userId) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    let scheduledAt: string | null = null;
    if (c.sessionId) {
      const s = (await SupportSession.findById(c.sessionId).select("scheduledAt").lean()) as { scheduledAt?: Date } | null;
      scheduledAt = s?.scheduledAt ? new Date(s.scheduledAt).toISOString() : null;
    }
    return NextResponse.json({
      contract: {
        id: String(c._id),
        number: c.number || null,
        text: c.contractText,
        lang: safeContractLang(c.lang),
        counselorName: c.counselorName || null,
        counselorSignature: c.counselorSignature || null,
        counselorSignedAt: c.counselorSignedAt ? new Date(c.counselorSignedAt as Date).toISOString() : null,
        clientName: c.clientName || null,
        clientSignature: c.clientSignature || null,
        clientSignedName: c.clientSignedName || null,
        clientSignedAt: c.clientSignedAt ? new Date(c.clientSignedAt as Date).toISOString() : null,
        status: c.status,
        scheduledAt,
      },
    });
  }

  return NextResponse.json({ error: "UNKNOWN_VIEW" }, { status: 400 });
}

/* ─── POST ───
   action=counselor-sign (COUNSELOR): إمضاء الأخصائي على عقد المنصة المعتمد
                                       (نصه محمي — لا تعديل ولا عقد خاص)
   action=client-sign    (VICTIM):    إمضاء العميل + الاسم الكامل → SIGNED */
async function POST_impl(req: NextRequest) {
  const body = await req.json();
  const action = body?.action;
  const userId = body?.userId;
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  await connectDB();

  const user = (await User.findById(userId).select("role pseudonym").lean()) as
    | { role?: string; pseudonym?: string | null }
    | null;
  if (!user) return NextResponse.json({ error: "INVALID" }, { status: 401 });

  /* ═② إمضاء الأخصائي على عقد المنصة — الامضاء فقط، النص محميّ من المنصة ═
     بعد الإمضاء تُزوَّد كل الجلسات الحيّة بعقودها المستقلة (لقطة النص
     المعتمد + إمضاء الأخصائي) فتصل النافذة لعملائه الحاليين فوراً. */
  if (action === "counselor-sign") {
    if (user.role !== "COUNSELOR") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    if (!validSignature(body.signature)) {
      return NextResponse.json({ error: "SIGNATURE_REQUIRED" }, { status: 400 });
    }
    const prof = (await CounselorProfile.findOne({ userId }).select("fullName").lean()) as { fullName?: string } | null;
    if (!prof) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
    const platform = await getPlatformContract();
    await CounselorProfile.findOneAndUpdate(
      { userId },
      {
        $set: {
          contractSignature: body.signature,
          contractSignedAt: new Date(),
        },
      }
    );
    /* ─── سدّ ثغرة الترتيب: كل الجلسات الحية (المعلّجة والمقبولة والجارية)
       قبل إمضاء الأخصائي تحصل على عقدها فور امضائه برقم تسلسلي فريد —
       العقود المفتوحة تُحدَّث لقطة إمضائها، والعميل الممضي سابقاً لا يُمَس ─── */
    let backfilled = 0;
    try {
      const live = (await SupportSession.find({
        counselorId: userId,
        status: { $in: ["PENDING", "ACCEPTED", "ACTIVE"] },
      })
        .sort({ createdAt: -1 })
        .limit(500)
        .select("_id victimId")
        .lean()) as unknown as Array<{ _id: unknown; victimId: unknown }>;
      /* أسماء العملاء دفعة واحدة */
      const victimIds = Array.from(new Set(live.map((x) => String(x.victimId))));
      const vdocs = victimIds.length
        ? ((await User.find({ _id: { $in: victimIds } }).select("pseudonym fullName").lean()) as Array<{ _id: unknown; pseudonym?: string | null; fullName?: string | null }>)
        : [];
      const nameById = new Map(vdocs.map((v) => [String(v._id), String(v.pseudonym || v.fullName || "").trim().slice(0, 60)]));
      for (const ses of live) {
        const existing = (await TherapyContract.findOne({
          counselorId: userId,
          clientUserId: ses.victimId,
          sessionId: ses._id,
        })
          .select("_id status")
          .lean()) as { _id: unknown; status?: string } | null;
        if (existing?.status === "SIGNED") continue; /* العقد الممضى لا يُمَس */
        if (!existing) {
          await TherapyContract.create({
            number: await nextContractNumber(),
            counselorId: userId,
            clientUserId: ses.victimId,
            sessionId: ses._id,
            contractText: platform.text,
            counselorName: prof.fullName || null,
            clientName: nameById.get(String(ses.victimId)) || null,
            counselorSignature: body.signature,
            counselorSignedAt: new Date(),
            status: "AWAITING_CLIENT",
          });
          backfilled++;
        } else {
          await TherapyContract.findByIdAndUpdate(existing._id, {
            $set: {
              counselorSignature: body.signature,
              counselorSignedAt: new Date(),
            },
          });
          backfilled++;
        }
      }
    } catch (e) {
      console.error("[CONTRACT] تعذر تزويد الجلسات السابقة بالعقد:", (e as Error).message);
    }
    return NextResponse.json({ ok: true, signedAt: new Date().toISOString(), backfilled });
  }

  /* ═④ توقيع العميل — إلزامي قبل الدخول لأي خدمة مرتبطة بالعقد ═
     لغة المستند المعتمدة عند الطباعة تُحفظ مع العقد (lang) */
  if (action === "client-sign") {
    if (user.role !== "VICTIM") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const contractId = typeof body.contractId === "string" ? body.contractId : "";
    if (!contractId) return NextResponse.json({ error: "contractId required" }, { status: 400 });
    if (!validSignature(body.signature)) {
      return NextResponse.json({ error: "SIGNATURE_REQUIRED" }, { status: 400 });
    }
    const fullName = typeof body.fullName === "string" ? body.fullName.trim().replace(/\s+/g, " ") : "";
    if (fullName.length < 3 || fullName.length > 80) {
      return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 });
    }
    const c = (await TherapyContract.findById(contractId)) as
      | {
          _id: unknown;
          clientUserId: unknown;
          counselorId: unknown;
          status: string;
          lang?: string | null;
          clientName?: string | null;
          clientSignature?: string | null;
          clientSignedName?: string | null;
          clientSignedAt?: Date | null;
          save: (o?: object) => Promise<unknown>;
        }
      | null;
    if (!c) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (String(c.clientUserId) !== userId) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    /* العقد الممضى لا يُمَس — لقطة موقعة من الطرفين وثيقة نهائية */
    if (c.status === "SIGNED") return NextResponse.json({ ok: true, alreadySigned: true });
    c.status = "SIGNED";
    c.clientSignature = body.signature;
    c.clientSignedName = fullName;
    /* v1.13.0: الطرف الثاني في المستند المطبوع هو الاسم الكامل القانوني الذي
       كتبه العميل عند الإمضاء — يُعتمد رسمياً في العقد وقوائمه بدل الاسم المستعار */
    c.clientName = fullName;
    c.clientSignedAt = new Date();
    c.lang = safeContractLang(body.lang);
    await c.save();
    /* إشعار فوري للأخصائي بوصول العقد الموقّع */
    notifyUser(String(c.counselorId), "contractSigned", "/?view=counselor-dashboard", {
      name: c.clientName || user.pseudonym || fullName,
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "UNKNOWN_ACTION" }, { status: 400 });
}

export const GET = apiHandler(GET_impl);
export const POST = apiHandler(POST_impl);
