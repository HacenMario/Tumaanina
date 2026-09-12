import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { SupportSession, User } from "@/lib/models";
import { apiHandler } from "@/lib/server/api";
import { PLATFORM_COMMISSION_RATE, CURRENCY_CODES } from "@/lib/constants";
import type { CurrencyCode } from "@/lib/constants";

export const dynamic = "force-dynamic";

/* ═══ v1.3.0 — لوحة أخصائي: إحصائيات الجلسات المكتملة والمستحقات ═══
   GET /api/counselor/stats?userId=...&period=day|week|month
   • كل مبلغ يُجمَع بعملته الخاصة (DZD/EUR/USD) — بلا أي تحويل بين العملات
   • عمولة المنصة 20% تُحسب هنا وتُعرض للمختص حصراً
   • buckets: تفصيل زمني حسب الفلتر (يومي: 30 يوماً | أسبوعي: 12 أسبوعاً | شهري: 12 شهراً)
     — العدّادات بأعداد الجلسات والمبالغ بكائن لكل عملة
   • dueThisMonth: مستحق الشهر الحالي (عمولة جلسات الشهر المكتملة) لكل عملة */

type MoneyBag = Record<CurrencyCode, number>;

const emptyBag = (): MoneyBag => ({ DZD: 0, EUR: 0, USD: 0 });
const addTo = (bag: MoneyBag, cur: string, v: number) => {
  if (cur === "EUR" || cur === "USD") bag[cur] += v;
  else bag.DZD += v;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

async function GET_impl(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const period = ["day", "week", "month"].includes(searchParams.get("period") || "")
    ? (searchParams.get("period") as "day" | "week" | "month")
    : "month";
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  await connectDB();
  const user = await User.findById(userId).select("role").lean();
  if (!user || (user as { role?: string }).role !== "COUNSELOR") {
    return NextResponse.json({ error: "INVALID" }, { status: 401 });
  }

  const completed = (await SupportSession.find({ counselorId: userId, status: "COMPLETED" })
    .select("price currency endedAt topic mode scheduledAt")
    .sort({ endedAt: -1, scheduledAt: -1 })
    .limit(2000)
    .lean()) as { price?: number | null; currency?: string | null; endedAt?: Date | null; topic?: string; mode?: string; scheduledAt?: Date }[];

  /* تفصيل زمني */
  const now = new Date();
  const bucketOf = (d: Date): string => {
    if (period === "day") return d.toISOString().slice(0, 10);
    if (period === "month") return d.toISOString().slice(0, 7);
    /* أسبوع: بداية الأسبوع (الأحد) بصيغة YYYY-MM-DD */
    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - d.getUTCDay()));
    return start.toISOString().slice(0, 10);
  };

  const map = new Map<string, { count: number; gross: MoneyBag }>();
  let totalCount = 0;
  const totalGross = emptyBag();
  const dueThisMonth = emptyBag();
  const thisMonthKey = now.toISOString().slice(0, 7);

  for (const s of completed) {
    const price = Math.max(0, Number(s.price) || 0);
    const cur = s.currency || "DZD";
    const when = s.endedAt || s.scheduledAt;
    if (!when) continue;
    totalCount += 1;
    addTo(totalGross, cur, price);
    const key = bucketOf(new Date(when));
    const b = map.get(key) || { count: 0, gross: emptyBag() };
    b.count += 1;
    addTo(b.gross, cur, price);
    map.set(key, b);
    if (new Date(when).toISOString().slice(0, 7) === thisMonthKey) {
      addTo(dueThisMonth, cur, price * PLATFORM_COMMISSION_RATE);
    }
  }

  /* ملء الفترات الفارغة لرسم متسق */
  const buckets: { key: string; count: number; gross: MoneyBag; commission: MoneyBag; net: MoneyBag }[] = [];
  const push = (key: string) => {
    const b = map.get(key) || { count: 0, gross: emptyBag() };
    const commission = emptyBag();
    const net = emptyBag();
    for (const c of CURRENCY_CODES) {
      commission[c] = r2(b.gross[c] * PLATFORM_COMMISSION_RATE);
      net[c] = r2(b.gross[c] * (1 - PLATFORM_COMMISSION_RATE));
    }
    buckets.push({ key, count: b.count, gross: b.gross, commission, net });
  };
  if (period === "day") {
    for (let i = 29; i >= 0; i--) {
      push(new Date(now.getTime() - i * 86400e3).toISOString().slice(0, 10));
    }
  } else if (period === "week") {
    for (let i = 11; i >= 0; i--) {
      const start = new Date(now.getTime() - (now.getUTCDay() + i * 7) * 86400e3);
      push(start.toISOString().slice(0, 10));
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
    }
  }

  const bagOf = (b: MoneyBag) => {
    const out = {} as MoneyBag;
    for (const c of CURRENCY_CODES) out[c] = r2(b[c]);
    return out;
  };
  const totalCommission = emptyBag();
  const totalNet = emptyBag();
  for (const c of CURRENCY_CODES) {
    totalCommission[c] = r2(totalGross[c] * PLATFORM_COMMISSION_RATE);
    totalNet[c] = r2(totalGross[c] * (1 - PLATFORM_COMMISSION_RATE));
  }

  return NextResponse.json({
    stats: {
      period,
      commissionRate: PLATFORM_COMMISSION_RATE,
      /* مبالغ لكل عملة — بلا أي تحويل بين العملات */
      totals: {
        count: totalCount,
        gross: bagOf(totalGross),
        commission: bagOf(totalCommission),
        net: bagOf(totalNet),
      },
      /* مستحق المنصة للشهر الحالي (عمولة 20%) لكل عملة */
      dueThisMonth: bagOf(dueThisMonth),
      buckets,
      recent: completed.slice(0, 12).map((s) => {
        const price = Math.max(0, Number(s.price) || 0);
        return {
          topic: s.topic || "other",
          mode: s.mode || "TEXT",
          price,
          currency: s.currency || "DZD",
          commission: r2(price * PLATFORM_COMMISSION_RATE),
          endedAt: (s.endedAt || s.scheduledAt || null) as string | null,
        };
      }),
    },
  });
}

export const GET = apiHandler(GET_impl);
