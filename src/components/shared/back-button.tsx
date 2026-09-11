"use client";

import { useI18n } from "@/lib/i18n";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";

export function BackButton() {
  const { lang } = useI18n();
  const { goBack } = useApp();
  const Arrow = lang === "ar" ? ArrowRight : ArrowLeft;

  return (
    <Button variant="ghost" size="sm" className="mb-4 -ms-2 font-semibold" onClick={goBack}>
      <Arrow className="h-4 w-4" />
    </Button>
  );
}
