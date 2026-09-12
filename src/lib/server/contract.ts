import "server-only";
import { connectDB } from "@/lib/db";
import { ContractCounter } from "@/lib/models";

/**
 * v1.10.0 — توليد رقم العقد التسلسلي الرسمي ذرياً بلا تكرار.
 * الشكل: TC-YYYY-00001 — العدّاد مركزي واحد (مجموعة contract_counters)
 * يُحدَّث بـ findOneAndUpdate({$inc}) وهي عملية ذرّية على مستوى قاعدة
 * البيانات، فلا يمكن أن يحصل عقدان على نفس الرقم حتى مع طلبين متزامنين،
 * ويحترم التسلسل تصاعدياً.
 * ملاحظة: التسلسل مستمر عبر السنوات (السنة في الرقم تعكس سنة الإبرام)
 * — أبسط وأكثر أماناً من تصفير سنوي قد يسبب تكراراً في حدود الثانية.
 */
export async function nextContractNumber(): Promise<string> {
  await connectDB();
  const c = (await ContractCounter.findOneAndUpdate(
    { _id: "therapy" },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
    .lean()
    .exec()) as { seq?: number } | null;
  const seq = Math.max(1, Number(c?.seq || 1));
  const year = new Date().getFullYear();
  return `TC-${year}-${String(seq).padStart(5, "0")}`;
}

/** لغة مستند صالحة من بين الست — احتياطاً العربية */
export function safeContractLang(v: unknown): string {
  return typeof v === "string" && ["ar", "fr", "en", "tr", "ru", "zh"].includes(v) ? v : "ar";
}
