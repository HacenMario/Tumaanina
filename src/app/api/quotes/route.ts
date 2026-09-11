import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { UpliftQuote } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";
import seedQuotes from "../../../../shared/uplift-quotes.json";

export const dynamic = "force-dynamic";

/* ─── زرع تلقائي عند أول تشغيل (نفس فلسفة المنصة: صفر تهيئة يدوية) ───
   تُزرع العبارات من shared/uplift-quotes.json مرة واحدة فقط عندما يكون
   الجدول فارغاً — أي إضافة/تعديل من الأدمين بعدها يبقى محفوظاً.
   v2.13.0: بذر تزايدي — حتى في القواعد القديمة تُضاف العبارات الجديدة
   تلقائياً (تُطابَق بالنص العربي حتى لا تتكرر أي عبارة)، بينما تبقى
   إضافات وتعديلات الأدمين المحفوظة كما هي. */
async function ensureSeeded() {
  const existing = (await UpliftQuote.find()
    .select("textAr")
    .limit(600)
    .lean()) as unknown as { textAr?: string }[];
  const existingAr = new Set(existing.map((q) => String(q.textAr || "").trim()));
  const missing = (
    seedQuotes as { cat: string; ar: string; fr: string; en: string; tr?: string; ru?: string; zh?: string; au: string }[]
  ).filter((q) => !existingAr.has(q.ar.trim()));
  if (missing.length === 0) return;
  try {
    await UpliftQuote.insertMany(
      missing.map((q) => ({
        category: q.cat,
        textAr: q.ar,
        textFr: q.fr,
        textEn: q.en,
        textTr: q.tr ?? null,
        textRu: q.ru ?? null,
        textZh: q.zh ?? null,
        author: q.au || null,
        active: true,
      }))
    );
    console.log(`🌱 تم زرع ${missing.length} عبارة اطمئنان جديدة (المكتبة الكاملة: ${seedQuotes.length})`);
  } catch (e) {
    console.error("تعذر زرع العبارات الافتراضية:", (e as Error).message);
  }
}

function mapQuote(q: Record<string, unknown>) {
  return {
    id: String(q._id),
    textAr: q.textAr,
    textFr: q.textFr,
    textEn: q.textEn,
    textTr: q.textTr ?? null,
    textRu: q.textRu ?? null,
    textZh: q.textZh ?? null,
    author: q.author ?? null,
    category: q.category ?? "wisdom",
    active: !!q.active,
    createdAt: q.createdAt,
  };
}

/* ─── عام: العبارات النشطة فقط (العميل يختار عشوائياً) ─── */
async function GET_impl() {
  await connectDB();
  await ensureSeeded();
  const quotes = await UpliftQuote.find({ active: true })
    .select("textAr textFr textEn textTr textRu textZh author category active createdAt")
    .limit(300)
    .lean();
  return NextResponse.json({
    total: quotes.length,
    quotes: quotes.map((q) => mapQuote(q as unknown as Record<string, unknown>)),
  });
}

/* ─── إدارة الأدمين: نفس نمط /api/admin (اللوحة محمية بتسجيل الدخول) ─── */
async function POST_impl(req: NextRequest) {
  const body = await req.json();
  const action = body.action;
  await connectDB();

  if (action === "list-all") {
    const quotes = await UpliftQuote.find().sort({ createdAt: -1 }).limit(300).lean();
    return NextResponse.json({ quotes: quotes.map((q) => mapQuote(q as unknown as Record<string, unknown>)) });
  }

  if (action === "create") {
    const textAr = String(body.textAr || "").trim();
    const textFr = String(body.textFr || "").trim();
    const textEn = String(body.textEn || "").trim();
    if (!textAr || !textFr || !textEn) {
      return NextResponse.json({ error: "MISSING_LANGUAGES" }, { status: 400 });
    }
    /* v2.10.0: التركية/الروسية/الصينية اختيارية عند الإنشاء اليدوي */
    const quote = await UpliftQuote.create({
      textAr,
      textFr,
      textEn,
      textTr: String(body.textTr || "").trim() || null,
      textRu: String(body.textRu || "").trim() || null,
      textZh: String(body.textZh || "").trim() || null,
      author: String(body.author || "").trim() || null,
      category: ["religious", "social", "wisdom"].includes(body.category) ? body.category : "wisdom",
      active: body.active !== false,
    });
    return NextResponse.json({ ok: true, quote: mapQuote(quote.toObject() as unknown as Record<string, unknown>) });
  }

  if (action === "update") {
    const { id } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const patch: Record<string, unknown> = {};
    for (const k of ["textAr", "textFr", "textEn", "textTr", "textRu", "textZh"] as const) {
      if (typeof body[k] === "string") {
        if (!body[k].trim() && (k === "textAr" || k === "textFr" || k === "textEn")) {
          return NextResponse.json({ error: "MISSING_LANGUAGES" }, { status: 400 });
        }
        patch[k] = body[k].trim() || null;
      }
    }
    if (typeof body.author === "string") patch.author = body.author.trim() || null;
    if (["religious", "social", "wisdom"].includes(body.category)) patch.category = body.category;
    if (typeof body.active === "boolean") patch.active = body.active;
    const quote = await UpliftQuote.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean();
    if (!quote) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ ok: true, quote: mapQuote(quote as unknown as Record<string, unknown>) });
  }

  if (action === "delete") {
    const { id } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const r = await UpliftQuote.findByIdAndDelete(id);
    if (!r) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export const GET = apiHandler(GET_impl);
export const POST = apiHandler(POST_impl);
