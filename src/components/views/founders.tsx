"use client";

/**
 * v2.8.0 — صفحة المؤسسين.
 * تعرّف بفريق المنصة: المطوّر المؤسس + قائمة الأخصائيين النفسانيين المشاركين.
 * المحتوى يديره الأدمين من تبويب «المؤسسون» في لوحة الإشراف (نصوص ثلاثية اللغات).
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { HeartHandshake, Code2, Stethoscope, Users } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { BackButton } from "@/components/shared/back-button";
import { useApp } from "@/lib/store";

interface FoundersData {
  textAr: string;
  textFr: string;
  textEn: string;
  developerName: string;
  developerRole: string;
  members: { name: string; role: string }[];
}

export function FoundersView() {
  const { t, lang } = useI18n();
  const { setView } = useApp();
  const [data, setData] = useState<FoundersData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/founders")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d?.content || null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const intro = data ? (lang === "fr" ? data.textFr || data.textAr : lang === "en" ? data.textEn || data.textAr : data.textAr) : "";
  const developerRole = data?.developerRole || t.founders.developerBadge;
  const developerName = data?.developerName || t.common.appName;

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 md:py-14">
      <BackButton />
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-2 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <HeartHandshake className="h-5.5 w-5.5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black">{t.founders.title}</h1>
            <p className="text-muted-foreground text-sm">{t.founders.subtitle}</p>
          </div>
        </div>
      </motion.div>

      {loading ? (
        <div className="space-y-3">
          <Card className="h-32 animate-pulse bg-muted/50 border-0" />
          <Card className="h-20 animate-pulse bg-muted/50 border-0" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* النص التعريفي */}
          {intro && (
            <Card className="border-primary/25 bg-primary/5">
              <CardContent className="p-6">
                <p className="text-sm md:text-base font-semibold leading-relaxed whitespace-pre-wrap" dir="auto">
                  {intro}
                </p>
              </CardContent>
            </Card>
          )}

          {/* بطاقة المطوّر المؤسس */}
          <Card className="border-border/70">
            <CardContent className="p-5 flex items-center gap-4">
              <Avatar className="h-16 w-16 rounded-2xl">
                <AvatarFallback className="gradient-primary text-white rounded-2xl font-black text-2xl">
                  {developerName.trim().charAt(0) || "✦"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-lg" dir="auto">
                    {developerName}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-black px-2.5 py-1">
                    <Code2 className="h-3 w-3" />
                    {t.founders.developerBadge}
                  </span>
                </div>
                <p className="text-xs font-bold text-muted-foreground mt-1" dir="auto">
                  {developerRole}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* قائمة الأخصائيين النفسانيين */}
          <section className="space-y-3">
            <h2 className="font-black text-lg flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-primary" />
              {t.founders.membersTitle}
            </h2>
            {!data || data.members.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="p-8 text-center space-y-2 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto opacity-40" />
                  <p className="text-sm font-semibold">{t.founders.empty}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {data.members.map((m, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                    <Card className="border-border/70 h-full">
                      <CardContent className="p-4 flex items-center gap-3">
                        <Avatar className="h-11 w-11 rounded-xl">
                          <AvatarFallback className="gradient-primary text-white rounded-xl font-black">
                            {m.name.trim().charAt(0) || "✦"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="font-black text-sm truncate" dir="auto">
                            {m.name}
                          </div>
                          {m.role && (
                            <div className="text-[11px] font-bold text-muted-foreground truncate" dir="auto">
                              {m.role}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </section>

          <Button variant="outline" className="rounded-xl font-bold" onClick={() => setView("landing")}>
            {t.nav.home}
          </Button>
        </div>
      )}
    </div>
  );
}
