#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v1.1.0 — إزالة المحفظة من الواجهات: settings + admin + admin-dashboard + السعر الافتراضي"""
import re

BASE = "/home/z/my-project/tumaanina"

def edit(path, reps, regex=False):
    p = f"{BASE}/{path}"
    s = open(p, encoding="utf-8").read()
    for old, new in reps:
        if old not in s:
            print(f"[WARN] {path}: not found: {old[:70]!r}")
            continue
        s = s.replace(old, new)
    open(p, "w", encoding="utf-8").write(s)
    print(f"[ok] {path}")

# ═══ 1) settings.tsx ═══
edit("src/components/views/settings.tsx", [
    ('import { Share2, Wallet as WalletIcon } from "lucide-react";', 'import { Share2 } from "lucide-react";'),
    ("  const [walletBalance, setWalletBalance] = useState(0);\n", ""),
    ("""          /* v1.0.0 (طمأنينة): سعر جلستي ورصيد محفظتي */
          setSessionPrice(String(Math.round(Number(me.sessionPrice) || 15)));
          setWalletBalance(Number(me.walletBalance ?? 0));""",
     """          /* v1.1.0 (طمأنينة): سعر جلستي بالدينار الجزائري */
          setSessionPrice(String(Math.round(Number(me.sessionPrice) || 2500)));"""),
    ('''      {/* ─── v1.0.0 (طمأنينة): المحفظة — للعميل والأخصائي معاً ─── */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/8 via-transparent to-primary/5">
        <CardContent className="p-6 flex flex-wrap items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0">
            <WalletIcon className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-40">
            <h2 className="font-black">{t.settings.walletCardTitle}</h2>
            <p className="text-xs text-muted-foreground font-semibold mt-0.5">
              {t.settings.walletCardBalance}: <span className="font-black text-primary" dir="ltr">${walletBalance.toFixed(2)}</span>
            </p>
          </div>
          <Button className="gradient-primary text-white font-bold rounded-xl" onClick={() => setView("wallet")}>
            <WalletIcon className="h-4 w-4" />
            {t.settings.walletCardBtn}
          </Button>
        </CardContent>
      </Card>

''', ""),
])

# ═══ 2) admin-dashboard.tsx ═══
p = f"{BASE}/src/components/views/admin-dashboard.tsx"
s = open(p, encoding="utf-8").read()
s = s.replace("  paymentsPending: number;\n", "")
s = s.replace("  revenue: { grossCollected: number; totalPaidOut: number; platformRevenue: number; commissionRate: number };\n", "")
s = s.replace("""      {/* v1.0.0 (طمأنينة): المالية — إيرادات المنصة والأموال المعلّقة */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Wallet} value={`$${stats.revenue.grossCollected.toFixed(2)}`} label={t.admin.dashGross} />
        <StatCard icon={TrendingUp} value={`$${stats.revenue.totalPaidOut.toFixed(2)}`} label={t.admin.dashPaidOut} tone="sky" />
        <StatCard icon={Landmark} value={`$${stats.revenue.platformRevenue.toFixed(2)}`} label={t.admin.dashRevenue} tone="amber" />
        <StatCard icon={CreditCard} value={stats.paymentsPending} label={t.admin.dashPaymentsPending} tone="amber" />
      </div>

""", "")
s = s.replace(
    'import { Users, HeartPulse, Hourglass, ShieldAlert, CalendarClock, Wallet, Landmark, TrendingUp, MessageSquare, MessagesSquare, Crown, RefreshCw, Check, X, Phone, MapPin, CreditCard } from "lucide-react";',
    'import { Users, HeartPulse, Hourglass, ShieldAlert, CalendarClock, MessageSquare, MessagesSquare, Crown, RefreshCw, Check, X, Phone, MapPin } from "lucide-react";'
)
# حذف PaymentsTab حتى نهاية الملف
idx = s.find("/* ─── v1.0.0 (طمأنينة): تبويب المدفوعات")
if idx > 0:
    s = s[:idx].rstrip() + "\n"
open(p, "w", encoding="utf-8").write(s)
print(f"[ok] admin-dashboard.tsx ({len(s)} chars)")

# ═══ 3) admin.tsx ═══
edit("src/components/views/admin.tsx", [
    ('import { DashboardTab, PaymentsTab } from "@/components/views/admin-dashboard";',
     'import { DashboardTab } from "@/components/views/admin-dashboard";'),
    ('import { LayoutDashboard, CreditCard } from "lucide-react";', 'import { LayoutDashboard } from "lucide-react";'),
    ("""  /* v2.11.0: حالة توثيق العميل (نفس منطق شارة الأخصائي) */
  fireStatus?: string | null;
  /* v1.0.0 (طمأنينة): رصيد المحفظة في صف الحسابات */
  walletBalance?: number;
""", ""),
    ("  const [paymentsPendingCount, setPaymentsPendingCount] = useState(0);\n", ""),
    ("""    /* v1.0.0 (طمأنينة): عدد الحوالات وطلبات السحب المعلّقة */
    try {
      const pp = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "payments-list", status: "PENDING" }),
      }).then((r) => r.json());
      setPaymentsPendingCount((pp.transactions || []).length);
    } catch {
      /* اختياري */
    }
""", ""),
    ("""            {t.admin.tabDashboard}
            {paymentsPendingCount > 0 && (
              <span className="ms-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.5">{paymentsPendingCount}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="payments" className="font-bold flex items-center gap-1.5 shrink-0">
            <CreditCard className="h-3.5 w-3.5" />
            {t.admin.tabPayments}
            {paymentsPendingCount > 0 && (
              <span className="ms-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.5">{paymentsPendingCount}</span>
            )}
          </TabsTrigger>""",
     """            {t.admin.tabDashboard}
          </TabsTrigger>"""),
    ("""        {/* ─── v2.9.0: توثيق العميلين من الحرائق ─── */}
        <TabsContent value="payments" className="space-y-3">
          <PaymentsTab onChanged={load} />
        </TabsContent>

""", ""),
])

print("\n=== wallet sweep in views ===")
EOF_MARKER = None
