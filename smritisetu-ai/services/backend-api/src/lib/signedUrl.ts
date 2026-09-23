import crypto from "node:crypto";
import { env } from "../config/env";

/**
 * Media is never served from a public bucket URL. Every asset is addressed
 * through /api/v1/media/:key with a short-lived HMAC signature bound to the
 * key, the patient and the expiry, so a leaked link cannot be replayed later
 * or reused for a different patient.
 */
export type SignedUrlParts = {
  key: string;
  patientId: string;
  expiresAt: number;
  signature: string;
};

export function signMediaKey(key: string, patientId: string, ttlSeconds = env.MEDIA_URL_TTL_SECONDS): SignedUrlParts {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  return { key, patientId, expiresAt, signature: computeSignature(key, patientId, expiresAt) };
}

export function buildSignedUrl(
  key: string,
  patientId: string,
  baseUrl = "",
  ttlSeconds = env.MEDIA_URL_TTL_SECONDS,
): string {
  const parts = signMediaKey(key, patientId, ttlSeconds);
  const query = new URLSearchParams({
    patientId: parts.patientId,
    expires: String(parts.expiresAt),
    signature: parts.signature,
  });
  return `${baseUrl}${env.API_BASE_PATH}/media/${encodeURIComponent(key)}?${query.toString()}`;
}

export function verifyMediaSignature(
  key: string,
  patientId: string,
  expiresAt: number,
  signature: string,
): { valid: boolean; reason?: string } {
  if (!Number.isFinite(expiresAt)) return { valid: false, reason: "MALFORMED_EXPIRY" };
  if (expiresAt * 1000 < Date.now()) return { valid: false, reason: "EXPIRED" };
  const expected = computeSignature(key, patientId, expiresAt);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: "BAD_SIGNATURE" };
  }
  return { valid: true };
}

function computeSignature(key: string, patientId: string, expiresAt: number): string {
  return crypto
    .createHmac("sha256", env.MEDIA_SIGNING_SECRET)
    .update(`${key}:${patientId}:${expiresAt}`)
    .digest("hex");
}

export function checksumOf(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
