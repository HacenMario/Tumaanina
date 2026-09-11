import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { GratitudeContent } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";

export const dynamic = "force-dynamic";

/* النص الافتراضي — يُزرع مرة واحدة عند أول تشغيل ثم يبقى تعديل الأدمين محفوظاً
   v1.4.0: صياغة تجارية احترافية — المنصة استشارات مدفوعة بلا أي لغة تطوع/دعم */
const DEFAULT_AR = `من منصة «طمأنينة» نتقدّم بجزيل الشكر والعرفان إلى كل من ساهم في نجاح هذه المنصة:

إلى الأخصائيين النفسانيين المرخّصين الذين يمنحون عملاءهم وقتهم وخبرتهم المهنية بأعلى معايير الأخلاقيات، وإلى كل عميل وثق بنا واختار طمأنينة رفيقاً في رحلته نحو صفاء نفسي أفضل — ثقتكم هي رأس مالنا الحقيقي، ونجاحكم هو إنجازنا.

شكراً لكل تفاعل بنّاء، ولكل ملاحظة طيبة، ولكل توصية ساهمت في وصول الخدمة لمن يحتاجها.`;
const DEFAULT_FR = `De la part de « Tumaanina », nous adressons nos sincères remerciements à tous ceux qui contribuent au succès de cette plateforme :

Aux psychologues agréés qui offrent à leurs clients leur temps et leur expertise professionnelle selon les plus hauts standards déontologiques, et à chaque client qui nous a fait confiance et a choisi Tumaanina comme compagnon vers un mieux-être psychique — votre confiance est notre véritable capital, et votre réussite est notre plus belle réalisation.

Merci pour chaque retour constructif, chaque mot encourageant et chaque recommandation qui fait parvenir nos services à ceux qui en ont besoin.`;
const DEFAULT_EN = `From « Tumaanina », we extend our sincere gratitude to everyone who contributes to this platform's success:

To the licensed psychologists who give their clients their time and professional expertise to the highest ethical standards, and to every client who trusted us and chose Tumaanina as a companion on the journey toward better mental well-being — your trust is our true capital, and your success is our greatest achievement.

Thank you for every constructive interaction, every kind word, and every recommendation that brings our services to those who need them.`;

const ALLOWED_SYMBOLS = ["❤️", "💛", "💚", "💙", "🧡", "🌹", "🌟", "✨", "🕊️", "💐", "🤲", "🫶", "🌸"];

function mapContent(c: Record<string, unknown>) {
  return {
    id: String(c._id ?? ""),
    textAr: c.textAr,
    textFr: c.textFr,
    textEn: c.textEn,
    symbol: (c.symbol as string) || "❤️",
    active: c.active !== false,
  };
}

async function ensureSeeded() {
  const count = await GratitudeContent.countDocuments();
  if (count > 0) return;
  try {
    await GratitudeContent.create({ textAr: DEFAULT_AR, textFr: DEFAULT_FR, textEn: DEFAULT_EN, symbol: "❤️", active: true });
    console.log("🌱 تم زرع نص صفحة الشكر والعرفان الافتراضي");
  } catch (e) {
    console.error("تعذر زرع نص صفحة الشكر:", (e as Error).message);
  }
}

/* ─── عام: محتوى صفحة الشكر (سجل مفرد) ─── */
async function GET_impl() {
  await connectDB();
  await ensureSeeded();
  const doc = await GratitudeContent.findOne().sort({ createdAt: 1 }).lean();
  return NextResponse.json({ content: doc ? mapContent(doc as unknown as Record<string, unknown>) : null });
}

/* ─── إدارة الأدمين: قراءة + تحديث (نص ثلاثي اللغات + الرمز) ─── */
async function POST_impl(req: NextRequest) {
  const body = await req.json();
  const action = body.action;
  await connectDB();
  await ensureSeeded();

  if (action === "get") {
    const doc = await GratitudeContent.findOne().sort({ createdAt: 1 }).lean();
    return NextResponse.json({ content: doc ? mapContent(doc as unknown as Record<string, unknown>) : null });
  }

  if (action === "update") {
    const textAr = String(body.textAr || "").trim();
    const textFr = String(body.textFr || "").trim();
    const textEn = String(body.textEn || "").trim();
    if (!textAr || !textFr || !textEn) {
      return NextResponse.json({ error: "MISSING_LANGUAGES" }, { status: 400 });
    }
    const symbol = ALLOWED_SYMBOLS.includes(String(body.symbol || "")) ? String(body.symbol) : "❤️";
    const doc = await GratitudeContent.findOne().sort({ createdAt: 1 });
    if (!doc) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    doc.textAr = textAr;
    doc.textFr = textFr;
    doc.textEn = textEn;
    doc.symbol = symbol;
    if (typeof body.active === "boolean") doc.active = body.active;
    await doc.save();
    return NextResponse.json({ ok: true, content: mapContent(doc.toObject() as unknown as Record<string, unknown>) });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export const GET = apiHandler(GET_impl);
export const POST = apiHandler(POST_impl);
