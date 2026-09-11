import "server-only";
import { InAppNotification, PushSubscription, SupportSession, User } from "@/lib/models";
import { sendPushToUser } from "@/lib/server/push";

/**
 * التذكير المسبق بالموعد بساعة (إشعار داخل المنصة + إشعار فوري على الهاتف).
 * نفس منطق مجدول server.js — يُستدعى هنا بشكل كسول (fire-and-forget) من
 * GET /api/sessions ليعمل أيضاً على Vercel حيث لا يوجد مجدول دائم.
 * idempotent: الحجز الذري عبر reminderSentAt يمنع التكرار بين المنصتين.
 */
/* v2.14.0: التذكير بست لغات كاملة — كان محصوراً في ar/fr/en فكان مستخدم
   التركية/الروسية/الصينية يتلقى التذكير بالعربية */
const REMINDER_TEXTS: Record<"ar" | "fr" | "en" | "tr" | "ru" | "zh", { title: string; body: string }> = {
  ar: { title: "⏰ تذكير: جلستك بعد ساعة", body: "جلستك في «طمأنينة النفسي» بعد ساعة تقريباً — الغرفة تنتظركما" },
  fr: { title: "⏰ Rappel : votre séance dans une heure", body: "Votre séance sur Tumaanina Annafsi commence dans une heure — la salle vous attend" },
  en: { title: "⏰ Reminder: your session in one hour", body: "Your Tumaanina Annafsi session starts in about an hour — the room is waiting for you" },
  tr: { title: "⏰ Hatırlatma: seansınız bir saat sonra", body: "Tumaanina Annafsi seansınız bir saat içinde başlıyor — oda sizi bekliyor" },
  ru: { title: "⏰ Напоминание: сессия через час", body: "Ваша сессия Tumaanina Annafsi начнётся примерно через час — комната ждёт вас" },
  zh: { title: "⏰ 提醒：您的会话将在一小时后开始", body: "您的「心灵伴侣」会话约一小时后开始——房间正在等候二位" },
};

export async function sendDueReminders(): Promise<void> {
  try {
    const now = Date.now();
    const due = await (SupportSession.find({
      status: { $in: ["PENDING", "ACCEPTED"] },
      scheduledAt: { $gte: new Date(now + 55 * 60 * 1000), $lte: new Date(now + 65 * 60 * 1000) },
      reminderSentAt: null,
    })
      .select("_id victimId counselorId")
      .limit(20)
      .lean()) as unknown as { _id: unknown; victimId: unknown; counselorId: unknown }[];

    for (const s of due) {
      const claim = await SupportSession.updateOne(
        { _id: s._id, reminderSentAt: null },
        { $set: { reminderSentAt: new Date() } }
      );
      if (!claim.modifiedCount) continue;

      for (const userId of [String(s.victimId), String(s.counselorId)]) {
        try {
          const u = (await User.findById(userId).select("language").lean()) as { language?: string } | null;
          const lang = (["ar", "fr", "en", "tr", "ru", "zh"].includes(u?.language || "") ? u?.language : "ar") as "ar" | "fr" | "en" | "tr" | "ru" | "zh";
          const txt = REMINDER_TEXTS[lang];
          await InAppNotification.create({ userId, key: "reminder", title: txt.title, body: txt.body, url: "/" }).catch(() => {});
          await sendPushToUser(userId, txt.title, txt.body, "/");
        } catch {
          /* فشل إشعار طرف واحد لا يعطل البقية */
        }
      }
    }
  } catch {
    /* التذكيرات خدمة إضافية — لا تُفشل طلب الواجهة أبداً */
  }
}
