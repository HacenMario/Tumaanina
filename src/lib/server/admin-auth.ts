import "server-only";
import crypto from "crypto";
import { User } from "@/lib/models";

/**
 * v1.4.0 — بوابة صلاحيات فريق الإدارة
 * ─────────────────────────────────────────────────
 * قبل هذه النسخة كانت أفعال لوحة الإدارة متاحة دون أي تحقق خادمي
 * (يكفي الوصول للمسار!). الآن:
 *  • كل فعل (عدا login/staff-login) يتطلب رمز إدارة صالحاً (x-admin-token)
 *  • الرمز موقّع HMAC-SHA256 مرتبط بحساب الموظف ومدة صلاحية 12 ساعة
 *  • ثلاثة مستويات: SUPER (المالك) > ADMIN (مدير منصة) > MANAGER (مسير)
 *
 * المصفوفة المنطقية:
 *   MANAGER : قراءة اللوحات والإحصائيات + المحتوى (عبارات/شكر/مؤسسون)
 *             + الإشعارات + محادثة الأخصائيين — بلا أي أمر هدّام
 *   ADMIN   : كل إدارة المنصة (توثيق/تعليق/حذف/كلمات مرور) عدا إدارة الفريق
 *   SUPER   : كل شيء + إنشاء وحذف حسابات الفريق
 */

export type StaffLevel = 1 | 2 | 3; /* MANAGER=1, ADMIN=2, SUPER=3 */

export const LEVEL_OF: Record<string, StaffLevel> = { MANAGER: 1, ADMIN: 2, SUPER: 3 };

/* أدنى مستوى يطلبه كل فعل (الافتراضي 2 = إدارة كاملة؛ والمحتوى والإشعارات 1) */
const ACTION_MIN_LEVEL: Record<string, StaffLevel> = {
  /* قراءة ومحتوى — المسير يكفي */
  "list-users": 1,
  "list-sessions": 1,
  "cancelled-requests": 1,
  "counselor-requests": 1,
  "pending-counselors": 1,
  "overdue-requests": 1,
  "feedback-list": 1,
  "crisis-log": 1,
  stats: 1,
  "dashboard-stats": 1,
  "challenge-status": 1,
  "admin-threads": 1,
  "founders-get": 1,
  "founders-save": 1,
  "quotes-list": 1,
  "quote-save": 1,
  "quote-delete": 1,
  "gratitude-get": 1,
  "gratitude-save": 1,
  "bulk-notify": 1,
  /* إدارة المنصة — أدمين كامل */
  "set-password": 2,
  "create-account": 2,
  unverify: 2,
  reject: 2,
  verify: 2,
  "toggle-user": 2,
  "delete-user": 2,
  "delete-session": 2,
  "feedback-delete": 2,
  "feedback-handled": 2,
  /* إدارة الفريق — المالك حصراً */
  "staff-list": 3,
  "staff-create": 3,
  "staff-toggle": 3,
  "staff-delete": 3,
  /* v1.6.0: لوحة التحديين — قراءة للمسير، وتعديل/إعادة تشغيل لأدمين كامل */
  "challenge-config-get": 1,
  "challenge-config-set": 2,
  "challenge-reset": 2,
  /* v1.7.0: مستحقات المختصين — قراءة فقط (نسخة إدارية من «إحصائياتي») */
  "counselors-earnings": 1,
  /* v1.12.0: عقد المنصة الواحد — قراءة للمسير، وتعديل النص لأدمين كامل */
  "platform-contract-get": 1,
  "platform-contract-save": 2,
};

function secret(): string {
  return process.env.ADMIN_PASSCODE || process.env.VAPID_PUBLIC_KEY || "tumaanina-staff-secret";
}

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function hmac(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** إصدار رمز إدارة لحيازة موظف — 12 ساعة */
export function issueAdminToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ uid: String(userId), exp: Date.now() + TOKEN_TTL_MS })).toString("base64url");
  return `${payload}.${hmac(payload)}`;
}

export interface AdminAuth {
  uid: string;
  level: StaffLevel;
  staffRole: "SUPER" | "ADMIN" | "MANAGER";
}

/**
 * التحقق من الرمز وحساب الموظف ومستوى الصلاحية للفعل المطلوب.
 * يعيد استجابة خطأ جاهزة عند الفشل، أو بيانات الصلاحية عند النجاح.
 */
export async function adminGuard(
  req: NextRequestLike,
  action: string
): Promise<{ ok: true; auth: AdminAuth } | { ok: false; status: number; error: string }> {
  const token = String(req.headers?.get?.("x-admin-token") || "").trim();
  if (!token || !token.includes(".")) return { ok: false, status: 401, error: "ADMIN_TOKEN_REQUIRED" };

  const [payload, sig] = token.split(".");
  let parsed: { uid?: string; exp?: number } = {};
  try {
    if (hmac(payload) !== sig) return { ok: false, status: 401, error: "ADMIN_TOKEN_INVALID" };
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, status: 401, error: "ADMIN_TOKEN_INVALID" };
  }
  if (!parsed.uid || !parsed.exp || parsed.exp < Date.now()) {
    return { ok: false, status: 401, error: "ADMIN_TOKEN_EXPIRED" };
  }

  const u = (await User.findById(parsed.uid).select("role suspended staffRole").lean()) as {
    role?: string;
    suspended?: boolean;
    staffRole?: string;
  } | null;
  if (!u || u.role !== "ADMIN" || u.suspended) {
    return { ok: false, status: 401, error: "ADMIN_TOKEN_INVALID" };
  }

  const staffRole = (u.staffRole && LEVEL_OF[u.staffRole] ? u.staffRole : "ADMIN") as AdminAuth["staffRole"];
  const level = LEVEL_OF[staffRole];
  const min = ACTION_MIN_LEVEL[action] ?? 2; /* أفعال غير مصنفة = إدارة كاملة */
  if (level < min) return { ok: false, status: 403, error: "FORBIDDEN" };

  return { ok: true, auth: { uid: String(parsed.uid), level, staffRole } };
}

/* شكل ضئيل لترويسات الطلب — يكفي للقراءة في الحارس */
export interface NextRequestLike {
  headers: { get(name: string): string | null };
}
