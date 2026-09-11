import { CounselorProfile } from "@/lib/models";

/* ─── v2.5.5: رابط الملف العام باسم الأخصائي ───
   بدل /counselor/6a97dccfd6da8149f407e269 يصبح الرابط
   /counselor/drtest — اسم الأخصائي كما يطلبه صاحب الطلب
   (بلا مسافات، بحروف صغيرة، مع دعم الأحرف العربية واللاتينية).

   القواعد:
   - تُحذف كل المسافات وشرطات التسطير: "Dr Test" → "drtest"
   - تُحفظ الأحرف العربية واللاتينية والأرقام والنقطة (لـ «د.») والشرطة
   - يُضمن عدم التصادم بإلحاق -2 و -3 … عند التشابه
   - إن أنهى الاسم لا ينتج حروفاً صالحة → بديل آمن counselor-<8 محارف من المعرّف>
*/

/** تحويل اسم الأخصائي إلى slug صالح للروابط */
export function slugifyName(name: string): string {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "") // المسافات وشرطات التسطير تُحذف (لا بديل لها)
    .replace(/[^\p{L}\p{N}.\-]+/gu, "") // يُحفظ: حروف وأرقام أي لغة + النقطة + الشرطة
    .replace(/^[.\-]+|[.\-]+$/g, "") // بلا نقاط/شرطات طرفية
    .slice(0, 80);
}

/** بديل آمن عند اسم غير قابل للتحويل */
export function fallbackSlug(id: string): string {
  return `counselor-${String(id || "").slice(-8)}`;
}

/**
 * يضمن وجود slug فريد للملف المهني ويُرجع النسخة الجاهزة.
 * - إن وُجد مسبقاً يُعاد كما هو (بدون كتابة).
 * - إن غاب يُولَّد من fullName (أو بديل المعرّف)، يُفحص التصادم،
 *   ثم يُحفظ في القاعدة (ترحيل تلقائي للحسابات القديمة).
 * يعمل مع مستندات mongoose ونتائج lean() على حد سواء.
 */
export async function ensureCounselorSlug(
  profile: Record<string, any> | null
): Promise<string> {
  if (!profile) return "";

  const id = String(profile._id ?? "");
  const existing = profile.slug ? String(profile.slug) : "";
  if (existing) return existing;

  let base = slugifyName(String(profile.fullName ?? ""));
  if (!base) base = fallbackSlug(id);

  /* فحص التصادم — نفس الاسم لأخصائيين مختلفين */
  let candidate = base;
  for (let i = 2; i < 50; i++) {
    const clash = await CounselorProfile.findOne({
      slug: candidate,
      _id: { $ne: id },
    })
      .select("_id")
      .lean();
    if (!clash) break;
    candidate = `${base}-${i}`;
  }

  try {
    await CounselorProfile.updateOne({ _id: id }, { $set: { slug: candidate } });
  } catch {
    /* فشل الكتابة غير قاتل — تُعاد محاولة التوليد في الزيارة التالية */
  }
  if (profile && typeof profile === "object") profile.slug = candidate;
  return candidate;
}
