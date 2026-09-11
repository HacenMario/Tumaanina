import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

/**
 * تجزئة كلمات المرور وعبارات الاسترجاع (scrypt — بدون اعتماديات خارجية)
 * العبارة الاسترجاعية تتطلبها الواجهة عند نسيان كلمة المرور.
 */
export function hashSecret(secret: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(secret), salt, 64).toString("hex");
  return { hash, salt };
}

export function verifySecret(secret: string, hash?: string | null, salt?: string | null): boolean {
  if (!hash || !salt) return false;
  try {
    const candidate = scryptSync(String(secret), salt, 64);
    const stored = Buffer.from(hash, "hex");
    return candidate.length === stored.length && timingSafeEqual(candidate, stored);
  } catch {
    return false;
  }
}
