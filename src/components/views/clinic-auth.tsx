"use client";

import { useState } from "react";
import { BackButton } from "@/components/shared/back-button";
import { useI18n } from "@/lib/i18n";
import { ClinicRegisterView } from "./clinic-register";
import { ClinicLoginView } from "./clinic-login";

type Tab = "register" | "login";

/**
 * v1.14.0 — بوابة العيادات: تبويبان «حساب جديد / تسجيل الدخول»
 * بنفس نمط بوابة العميل وبوابة الأخصائيين.
 */
export function ClinicAuthView() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("register");

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 md:py-12">
      <BackButton />
      <div className="mb-6 text-center space-y-1.5">
        <h1 className="text-2xl font-black">{t.clinicAuth.gateTitle}</h1>
        <p className="text-sm text-muted-foreground font-semibold leading-relaxed">{t.clinicAuth.gateDesc}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-6">
        <button
          onClick={() => setTab("register")}
          className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-black transition-all ${
            tab !== "login" ? "gradient-primary text-white shadow" : "bg-muted text-muted-foreground hover:bg-muted/70"
          }`}
        >
          {t.client.tabNewAccount}
        </button>
        <button
          onClick={() => setTab("login")}
          className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-black transition-all ${
            tab === "login" ? "gradient-primary text-white shadow" : "bg-muted text-muted-foreground hover:bg-muted/70"
          }`}
        >
          {t.client.tabLogin}
        </button>
      </div>
      {tab === "register" ? <ClinicRegisterView embedded /> : <ClinicLoginView embedded />}
    </div>
  );
}
