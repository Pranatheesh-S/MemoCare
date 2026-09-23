import crypto from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import type { UserRole } from "@smritisetu/shared-types";
import { env } from "../config/env";
import { AppError } from "./errors";

/**
 * Access token claims.
 *
 * Deliberately minimal: identity plus role only. No medical data, no schedule
 * content and no memory metadata is ever placed inside a JWT, because tokens
 * are readable by anyone holding them.
 */
export type AccessTokenClaims = {
  sub: string;
  role: UserRole;
  type: "user";
};

export type DeviceTokenClaims = {
  sub: string; // device id
  patientId: string;
  type: "device";
};

export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
    issuer: "smritisetu-ai",
    audience: "smritisetu-clients",
  } as SignOptions);
}

export function signRefreshToken(userId: string): { token: string; hash: string; expiresAt: Date } {
  const token = jwt.sign({ sub: userId, type: "refresh", jti: crypto.randomUUID() }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL,
    issuer: "smritisetu-ai",
  } as SignOptions);
  const decoded = jwt.decode(token) as { exp: number };
  return {
    token,
    hash: hashToken(token),
    expiresAt: new Date(decoded.exp * 1000),
  };
}

export function signDeviceToken(claims: DeviceTokenClaims): { token: string; hash: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + env.DEVICE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  // A unique jti makes every issued token distinct. Without it, re-pairing the
  // same device inside the same second would produce a byte-identical JWT, so
  // the previous token would keep working and rotation would be a no-op.
  const token = jwt.sign({ ...claims, jti: crypto.randomUUID() }, env.JWT_ACCESS_SECRET, {
    expiresIn: `${env.DEVICE_TOKEN_TTL_DAYS}d`,
    issuer: "smritisetu-ai",
    audience: "smritisetu-devices",
  } as SignOptions);
  return { token, hash: hashToken(token), expiresAt };
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: "smritisetu-ai",
      audience: "smritisetu-clients",
    }) as AccessTokenClaims;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) throw AppError.tokenExpired();
    throw AppError.unauthorized("Invalid access token");
  }
}

export function verifyDeviceToken(token: string): DeviceTokenClaims {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: "smritisetu-ai",
      audience: "smritisetu-devices",
    }) as DeviceTokenClaims;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) throw AppError.tokenExpired("This device needs to be paired again.");
    throw AppError.unauthorized("Invalid device token");
  }
}

export function verifyRefreshToken(token: string): { sub: string } {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET, { issuer: "smritisetu-ai" }) as { sub: string };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) throw AppError.tokenExpired();
    throw AppError.unauthorized("Invalid refresh token");
  }
}

/** Tokens are never stored in the clear — only a SHA-256 digest is persisted. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function accessTokenTtlSeconds(): number {
  const ttl = env.JWT_ACCESS_TTL;
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) return 900;
  const value = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * (multipliers[unit] ?? 60);
}
