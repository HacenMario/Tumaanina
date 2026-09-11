#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v1.1.0 — جراحة إزالة المحفظة والدفع من مسار الإدارة (admin/route.ts)"""
import re

p = "/home/z/my-project/tumaanina/src/app/api/admin/route.ts"
s = open(p, encoding="utf-8").read()
orig_len = len(s)

# 1) الاستيراد
s = s.replace(
    'import { CounselorProfile, CrisisLog, Feedback, FoundersContent, InAppNotification, Message, PushSubscription, SupportSession, User, WalletTransaction } from "@/lib/models";',
    'import { CounselorProfile, CrisisLog, Feedback, FoundersContent, InAppNotification, Message, PushSubscription, SupportSession, User } from "@/lib/models";'
)

# 2) رصيد المحفظة في قائمة المستخدمين
s = s.replace("""          /* v1.0.0 (طمأنينة): رصيد محفظة الحساب — للمراجعة الإدارية */
          walletBalance: Number((u as { walletBalance?: number }).walletBalance ?? 0),
""", "")

# 3) إنشاء حساب العميل
s = s.replace("""        phone: cleanPhone,
        walletBalance: 0,
""", """        phone: cleanPhone,
""")

# 4) حذف جلسة: بلا استرداد مالي
s = s.replace("""    const target = (await SupportSession.findById(sessionId).lean()) as
      | { status?: string; price?: number; paymentStatus?: string; victimId?: unknown }
      | null;
    if (!target) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    /* v1.0.0 (طمأنينة): جلسة محجوزة دفعها العميل ولم تُسوَّ بعد → استرداد كامل */
    const paid = Number(target.price) || 0;
    if (paid > 0 && target.paymentStatus === "PAID") {
      const refunded = (await User.findByIdAndUpdate(
        target.victimId,
        { $inc: { walletBalance: paid } },
        { new: true }
      ).lean()) as { walletBalance?: number } | null;
      await WalletTransaction.create({
        userId: target.victimId,
        type: "REFUND",
        amount: paid,
        status: "COMPLETED",
        sessionId,
        note: "استرداد إداري — حذف الجلسة",
        balanceAfter: Math.round(Number(refunded?.walletBalance ?? 0) * 100) / 100,
      });
    }
    await Message.deleteMany({ sessionId });""",
"""    if (!(await SupportSession.findById(sessionId).lean())) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    await Message.deleteMany({ sessionId });""")

# 5) عدّادات Promise.all: حركات مالية + إيرادات
s = s.replace("""      /* v1.0.0 (طمأنينة): حركات مالية بانتظار قرار الإدارة (حوالات + سحب) */
      WalletTransaction.countDocuments({ status: "PENDING" }),
      /* إيرادات المنصة: مجموع مدفوعات الجلسات المحصّلة vs ما صُرف للأخصائيين */
      WalletTransaction.aggregate([
        { $match: { status: "COMPLETED", type: { $in: ["SESSION_PAYMENT", "EARNING"] } } },
        { $group: { _id: "$type", total: { $sum: "$amount" } } },
      ]),
""", "")

# 6) حساب الإيرادات قبل الاستجابة
s = s.replace("""    /* v1.0.0 (طمأنينة): إيرادات المنصة — SESSION_PAYMENT موجبة سجلياً؟
       لا: دفتر المحفظة يسجّل خصم العميل سالباً وصرف الأخصائي موجباً؛
       لذا الإيراد = |مجموع الخصومات| − مجموع الأرباح المصروفة */
    let grossCollected = 0;
    let totalPaidOut = 0;
    for (const r of revenueAgg as { _id: string; total: number }[]) {
      if (r._id === "SESSION_PAYMENT") grossCollected = Math.abs(r.total);
      if (r._id === "EARNING") totalPaidOut = r.total;
    }
    const platformRevenue = Math.round((grossCollected - totalPaidOut) * 100) / 100;

""", "")

# 7) حقول الاستجابة
s = s.replace("""        paymentsPending,
        revenue: { grossCollected, totalPaidOut, platformRevenue, commissionRate: PLATFORM_COMMISSION },
""", "")

# 8) كتل actions الثلاث كاملة (payments-list / payment-decide / revenue-stats)
s = re.sub(
    r"  /\* ─── v1\.0\.0 \(طمأنينة\): لوحة المدفوعات ───.*?\n  if \(action === \"revenue-stats\"\) \{.*?\n  \}\n\n",
    "",
    s,
    flags=re.S,
)

open(p, "w", encoding="utf-8").write(s)
print(f"admin/route.ts: {orig_len} -> {len(s)} chars (-{orig_len - len(s)})")
# تحقق
for word in ["WalletTransaction", "walletBalance", "paymentsPending", "PLATFORM_COMMISSION", "revenue-stats", "payment-decide", "payments-list"]:
    print(f"  {word}: {'REMAINS!' if word in s else 'clean ✓'}")
