"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { UserPlus, LogIn } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { BackButton } from "@/components/shared/back-button";
import { CounselorRegisterView } from "./counselor-register";
import { CounselorLoginView } from "./counselor-login";

type Tab = "register" | "login";

/**
 * بوابة الأخصائيين — بنفس نمط بوابة العميل:
 * تبويبان «حساب جديد / تسجيل الدخول» فوق المحتوى، دون تغيير أي منطق قائم.
 */
export function CounselorAuthView() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("register");

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 md:py-12">
      <BackButton />
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        {/* تبويبات: حساب جديد / دخول — مطابقة لتبويبات بوابة العميل */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setTab("register")}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-black transition-all ${
              tab !== "login" ? "gradient-primary text-white shadow" : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            <UserPlus className="h-4 w-4" />
            {t.client.tabNewAccount}
          </button>
          <button
            onClick={() => setTab("login")}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-black transition-all ${
              tab === "login" ? "gradient-primary text-white shadow" : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            <LogIn className="h-4 w-4" />
            {t.client.tabLogin}
          </button>
        </div>
      </motion.div>

      {tab === "register" ? <CounselorRegisterView embedded /> : <CounselorLoginView embedded />}
    </div>
  );
}
