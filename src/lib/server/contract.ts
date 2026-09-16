import "server-only";
import { connectDB } from "@/lib/db";
import { ContractCounter, PlatformContract, TherapyContract } from "@/lib/models";
import { DEFAULT_PLATFORM_CONTRACT } from "@/lib/contract-template";

/**
 * v1.11.0 — ترحيل الفهارس (مرة واحدة لكل عملية):
 * v1.10.0 كانت تُفرض «عقد واحد لكل زوج» بفهرس فريد على
 * {counselorId, clientUserId} — بعد إمضاء العميل أول عقد، أي حجز
 * لاحق لنفس الزوج كان يصطدم بالفهرس فيفشل إنشاء العقد صامتاً
 * فتتوقف النافذة المنبثقة (بلاغ المستخدم). نُسقط هذا الفهرس
 * القديم إن وُجد وننشئ فهرس الاستعلام الجديد على الثلاثية
 * {counselorId, clientUserId, sessionId} — عقد مستقل لكل جلسة.
 */
let indexesReady: Promise<void> | null = null;
export function ensureContractIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      await connectDB();
      try {
        const idx = (await TherapyContract.listIndexes()) as Array<{
          name: string;
          key?: Record<string, number>;
          unique?: boolean;
        }>;
        const legacy = idx.find(
          (i) => i.unique && i.key && i.key.counselorId === 1 && i.key.clientUserId === 1 && i.key.sessionId === undefined
        );
        if (legacy) {
          await TherapyContract.collection.dropIndex(legacy.name);
          console.log(`[CONTRACT] سُقط الفهرس القديم «${legacy.name}» — العقود صارت لكل جلسة`);
        }
        await TherapyContract.syncIndexes();
      } catch (e) {
        console.error("[CONTRACT] ترحيل فهارس العقود:", (e as Error).message);
        indexesReady = null; /* اسمح بمحاولة لاحقة */
      }
    })();
  }
  return indexesReady;
}

/**
 * v1.10.0 — توليد رقم العقد التسلسلي الرسمي ذرياً بلا تكرار.
 * الشكل: TC-YYYY-00001 — العدّاد مركزي واحد (مجموعة contract_counters)
 * يُحدَّث بـ findOneAndUpdate({$inc}) وهي عملية ذرّية على مستوى قاعدة
 * البيانات، فلا يمكن أن يحصل عقدان على نفس الرقم حتى مع طلبين متزامنين،
 * ويحترم التسلسل تصاعدياً.
 * ملاحظة: التسلسل مستمر عبر السنوات (السنة في الرقم تعكس سنة الإبرام)
 * — أبسط وأكثر أماناً من تصفير سنوي قد يسبب تكراراً في حدود الثانية.
 * v1.11.0: يستدعي ensureContractIndexes() أولاً (مؤجّلة مرة واحدة)
 * فكل مسار إنشاء عقد يضمن الترحيل تلقائياً.
 */
export async function nextContractNumber(): Promise<string> {
  await ensureContractIndexes();
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
  return typeof v === "string" && ["ar", "fr", "en", "tr", "ru", "zh", "es", "de", "it"].includes(v) ? v : "ar";
}

/* ═ v1.12.0: عقد المنصة الواحد — عقد علاجي واحد لكل المستخدمين يمثل المنصة ═
   • النص يديره فريق الإدارة حصراً من لوحة الأدمين (بوابة x-admin-token).
   • عند أول قراءة إن لم يوجد مستد يُزرع النص الافتراضي المعتمد تلقائياً
     فلا يوجد أبداً نظام بلا عقد — وحتى الأخصائي الذي لم يمضِ بعد يرى النص.
   • الأخصائي لا يعدّل النص إطلاقاً — يمضيه فقط، وكل حجز جديد يأخذ لقطة
     محمية من النص الحالي لحظة إنشائه (العقود الموقّعة سابقاً لا تُمَس). */

export const PLATFORM_CONTRACT_MIN = 100;
export const PLATFORM_CONTRACT_MAX = 15000;

/** قراءة نص عقد المنصة مع الزرع الأولي التلقائي للنص الافتراضي */
export async function getPlatformContract(): Promise<{ text: string; updatedAt: string | null; updatedBy: string | null }> {
  await connectDB();
  let doc = (await PlatformContract.findById("platform").lean()) as
    | { text?: string; updatedBy?: string | null; updatedAt?: Date }
    | null;
  if (!doc?.text) {
    /* الزرع الأولي — findOneAndUpdate ذرّي فلا ازدواج حتى مع تزامن */
    doc = (await PlatformContract.findOneAndUpdate(
      { _id: "platform" },
      { $setOnInsert: { text: DEFAULT_PLATFORM_CONTRACT } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean()) as { text?: string; updatedBy?: string | null; updatedAt?: Date } | null;
  }
  return {
    text: doc?.text || DEFAULT_PLATFORM_CONTRACT,
    updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    updatedBy: doc?.updatedBy || null,
  };
}

/** حفظ نص عقد المنصة — حصراً من لوحة الإدارة (يُستدعى من مسار admin المحمي) */
export async function savePlatformContract(text: string, updatedBy: string | null): Promise<{ updatedAt: string }> {
  const t = String(text || "").trim();
  if (t.length < PLATFORM_CONTRACT_MIN || t.length > PLATFORM_CONTRACT_MAX) {
    throw new Error("INVALID_TEXT");
  }
  await connectDB();
  const doc = await PlatformContract.findOneAndUpdate(
    { _id: "platform" },
    { $set: { text: t, updatedBy: updatedBy || null } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  return { updatedAt: new Date((doc as { updatedAt?: Date })?.updatedAt || new Date()).toISOString() };
}
