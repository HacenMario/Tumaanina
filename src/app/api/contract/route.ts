import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { CounselorProfile, SupportSession, TherapyContract, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";
import { notifyUser } from "@/lib/server/notify";

export const dynamic = "force-dynamic";

/* ═ v1.9.0: العقد العلاجي — مسار مستقل بثلاث مهام ═
   ① الأخصائي يكتب قالب عقد علاجي من إعداداته ويمضيه رقمياً ويحفظه
   ② عند قبول الأخصائي لجلسة يُنسخ القالب إلى عقد مستقل بانتظار توقيع العميل
      (يحدث داخل sessions/[id] PATCH — لا هنا)
   ③ العميل المسجّل يرى النافذة الإلزامية، يمضي رقمياً ويكتب اسمه الكامل
      ويضغط «أقبل» فتُحفظ النسخة الموقّعة من الطرفين في حساب الأخصائي
   الحماية المتبادلة: لقطة نص العقد وإمضاء الأخصائي تُثبَّت لحظة الإنشاء
   ولا تتغير بعد التوقيع، وكل توقيع يُخزَّن مع اسمه وتاريخه الصريحين. */

const MIN_TEXT = 100;
const MAX_TEXT = 15000;
const MAX_SIGNATURE_B64 = 300_000; /* لوحة امضاء PNG مضغوطة تتجاوز هذا => مرفوض */

function validSignature(s: unknown): s is string {
  return (
    typeof s === "string" &&
    s.startsWith("data:image/") &&
    s.length > 100 &&
    s.length <= MAX_SIGNATURE_B64
  );
}

/* ─── GET ───
   ?view=template&userId=…  → قالب الأخصائي (إعداداته)
   ?view=pending&userId=…   → عقد بانتظار توقيع هذا العميل (النافذة المنبثقة)
   ?view=list&userId=…      → عقود الأخصائي كلها (بيانات القائمة)
   ?view=one&id=…&userId=…  → عقد واحد كامل (للطرفين فقط) */
async function GET_impl(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view") || "pending";
  const userId = searchParams.get("userId") || "";
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  await connectDB();

  const user = (await User.findById(userId).select("role pseudonym").lean()) as
    | { role?: string; pseudonym?: string | null }
    | null;
  if (!user) return NextResponse.json({ error: "INVALID" }, { status: 401 });

  if (view === "template") {
    if (user.role !== "COUNSELOR") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const prof = (await CounselorProfile.findOne({ userId }).select("contractText contractSignature contractSignedAt").lean()) as {
      contractText?: string | null;
      contractSignature?: string | null;
      contractSignedAt?: Date | null;
    } | null;
    return NextResponse.json({
      template: {
        text: prof?.contractText ?? null,
        signature: prof?.contractSignature ?? null,
        signedAt: prof?.contractSignedAt ?? null,
      },
    });
  }

  if (view === "pending") {
    if (user.role !== "VICTIM") return NextResponse.json({ contract: null });
    const c = (await TherapyContract.findOne({ clientUserId: userId, status: "AWAITING_CLIENT" })
      .sort({ createdAt: -1 })
      .lean()) as {
      _id: unknown;
      contractText: string;
      counselorName?: string | null;
      counselorSignature?: string | null;
      counselorSignedAt?: Date | null;
      sessionId?: unknown;
      createdAt?: Date;
    } | null;
    if (!c) return NextResponse.json({ contract: null });
    /* موعد الجلسة المرتبطة للعرض السياقي داخل النافذة */
    let scheduledAt: string | null = null;
    if (c.sessionId) {
      const s = (await SupportSession.findById(c.sessionId).select("scheduledAt").lean()) as { scheduledAt?: Date } | null;
      scheduledAt = s?.scheduledAt ? new Date(s.scheduledAt).toISOString() : null;
    }
    return NextResponse.json({
      contract: {
        id: String(c._id),
        text: c.contractText,
        counselorName: c.counselorName || null,
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
      .select("clientName status sessionId clientSignedAt counselorSignedAt createdAt updatedAt")
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
        text: c.contractText,
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
   action=save-template (COUNSELOR): نص + إمضاء → حفظ القالب الموقّع
   action=client-sign   (VICTIM): إمضاء + الاسم الكامل → العقد SIGNED */
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

  /* ═① حفظ القالب من إعدادات الأخصائي — الإمضاء الرقمي إلزامي ═
     v1.9.1: بعد الحفظ تُزوَّد كل الجلسات المقبولة سابقاً بعقود بانتظار
     امضاء عملائها — إغلاق ثغرة الترتيب: أخصائي قبل جلسة ثم أنشأ القالب
        بعدها كانت الجلسات القديمة تبقى بلا عقد أبداً ولا ترى النافذة. */
  if (action === "save-template") {
    if (user.role !== "COUNSELOR") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (text.length < MIN_TEXT || text.length > MAX_TEXT) {
      return NextResponse.json({ error: "INVALID_TEXT" }, { status: 400 });
    }
    if (!validSignature(body.signature)) {
      return NextResponse.json({ error: "SIGNATURE_REQUIRED" }, { status: 400 });
    }
    const prof = (await CounselorProfile.findOne({ userId }).select("fullName").lean()) as { fullName?: string } | null;
    if (!prof) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
    await CounselorProfile.findOneAndUpdate(
      { userId },
      {
        $set: {
          contractText: text,
          contractSignature: body.signature,
          contractSignedAt: new Date(),
        },
      }
    );
    /* ─── v1.9.1: سدّ ثغرة الترتيب — الجلسات المقبولة قبل وجود قالب
       تحصل الآن على عقودها فور حفظ القالب (العميل الممضي سابقاً لا يُمَس) ─── */
    let backfilled = 0;
    try {
      const accepted = (await SupportSession.find({
        counselorId: userId,
        status: { $in: ["ACCEPTED", "ACTIVE"] },
      })
        .sort({ createdAt: -1 })
        .limit(500)
        .select("_id victimId")
        .lean()) as unknown as Array<{ _id: unknown; victimId: unknown }>;
      for (const s of accepted) {
        const existing = (await TherapyContract.findOne({
          counselorId: userId,
          clientUserId: s.victimId,
        })
          .select("_id status")
          .lean()) as { _id: unknown; status?: string } | null;
        if (existing?.status === "SIGNED") continue; /* العقد الممضى لا يُمَس */
        if (!existing) {
          await TherapyContract.create({
            counselorId: userId,
            clientUserId: s.victimId,
            sessionId: s._id,
            contractText: text,
            counselorName: prof.fullName || null,
            counselorSignature: body.signature,
            counselorSignedAt: new Date(),
            status: "AWAITING_CLIENT",
          });
          backfilled++;
        } else {
          await TherapyContract.findByIdAndUpdate(existing._id, {
            $set: {
              sessionId: s._id,
              contractText: text,
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

  /* ═③ توقيع العميل — إلزامي قبل الدخول لأي خدمة مرتبطة بالعقد ═ */
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
    c.clientSignedAt = new Date();
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
