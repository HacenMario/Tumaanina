"use client";

import { motion } from "framer-motion";
import {
  HeartCrack,
  CloudRainWind,
  CloudMoon,
  HeartHandshake,
  Briefcase,
  Sparkles,
  Baby,
  MessageCircleHeart,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { TOPICS, type TopicKey } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { BackButton } from "@/components/shared/back-button";

/* v1.0.0 (طمأنينة): مواضيع عامة لأي شخص — بلا ارتباط بالكوارث */
const TOPIC_ICONS: Record<TopicKey, React.ElementType> = {
  anxiety: CloudRainWind,
  depression: CloudMoon,
  grief: HeartCrack,
  relationships: HeartHandshake,
  workStress: Briefcase,
  selfConfidence: Sparkles,
  children: Baby,
  other: MessageCircleHeart,
};

export function ClientTopicsView() {
  const { t } = useI18n();
  const { setView, setDraft } = useApp();

  const pick = (topic: TopicKey) => {
    setDraft({ topic });
    /* v2.6.0: قبل ظهور قائمة المختصين يدخل العميل المواعيد التي تناسبه
       (الخيار الأول) — ثم تُعرض القائمة المصفّاة بالمطابقة */
    setView("client-slots");
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 md:py-16">
      <BackButton />
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-3 mb-10">
        <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 flex items-center justify-center animate-breathe">
          <MessageCircleHeart className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl md:text-3xl font-black">{t.client.topicTitle}</h1>
        <p className="text-muted-foreground">{t.client.topicDesc}</p>
      </motion.div>

      <div className="grid sm:grid-cols-2 gap-4">
        {TOPICS.map((topic, i) => {
          const Icon = TOPIC_ICONS[topic];
          return (
            <motion.div
              key={topic}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, duration: 0.4 }}
            >
              <button
                className="w-full text-start outline-none focus-visible:ring-2 ring-ring rounded-2xl"
                onClick={() => pick(topic)}
                aria-label={t.client.topics[topic]}
              >
                <Card className="h-full border-border/70 hover:border-primary/50 hover:bg-primary/5 hover:-translate-y-0.5 transition-all group">
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className="w-12 h-12 shrink-0 rounded-2xl bg-primary/10 group-hover:bg-primary group-hover:text-white transition-colors flex items-center justify-center">
                      <Icon className="h-6 w-6 text-primary group-hover:text-white transition-colors" />
                    </div>
                    <span className="font-bold leading-snug">{t.client.topics[topic]}</span>
                  </CardContent>
                </Card>
              </button>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
