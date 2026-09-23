import type { Request } from "express";
import {
  accessTokenTtlSeconds,
  hashToken,
  signAccessToken,
  signDeviceToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../../lib/jwt";
import { hashPassword, verifyPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { writeAudit } from "../../lib/audit";
import type { LoginInput, PairDeviceInput, RegisterInput } from "@smritisetu/shared-types";

export async function registerUser(input: RegisterInput, req: Request) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw AppError.conflict("An account with that email already exists");

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await hashPassword(input.password),
      fullName: input.fullName,
      phoneNumber: input.phoneNumber,
      role: input.role,
    },
  });

  await writeAudit(req, {
    action: "USER_REGISTERED",
    resource: "User",
    resourceId: user.id,
    metadata: { role: user.role },
  });

  return issueSession(user.id, user.email, user.fullName, user.role, req);
}

export async function loginUser(input: LoginInput, req: Request) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  // Same error for unknown email and wrong password: no account enumeration.
  const genericFailure = AppError.unauthorized("Email or password is incorrect");
  if (!user || !user.active || user.deletedAt) throw genericFailure;

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    await writeAudit(req, {
      action: "LOGIN_FAILED",
      resource: "User",
      resourceId: user.id,
      metadata: { email: input.email },
    });
    throw genericFailure;
  }

  await writeAudit(req, { action: "LOGIN_SUCCEEDED", resource: "User", resourceId: user.id });
  return issueSession(user.id, user.email, user.fullName, user.role, req);
}

export async function refreshSession(refreshToken: string, req: Request) {
  const claims = verifyRefreshToken(refreshToken);
  const tokenHash = hashToken(refreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!stored || stored.revokedAt) {
    // A revoked token being replayed means the token may have leaked; drop
    // every session for that user.
    if (stored?.revokedAt) {
      await prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await writeAudit(req, {
        action: "REFRESH_TOKEN_REPLAY_DETECTED",
        resource: "RefreshToken",
        resourceId: stored.id,
      });
    }
    throw AppError.unauthorized("This session is no longer valid. Please sign in again.");
  }
  if (stored.expiresAt.getTime() < Date.now()) {
    throw AppError.tokenExpired();
  }

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || !user.active || user.deletedAt) throw AppError.unauthorized("Account is not active");

  // Rotate: the presented token is retired as the new one is issued.
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  return issueSession(user.id, user.email, user.fullName, user.role, req);
}

export async function logout(
  userId: string,
  options: { refreshToken?: string; allDevices?: boolean },
  req: Request,
) {
  if (options.allDevices) {
    const result = await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await writeAudit(req, { action: "LOGOUT_ALL", resource: "User", resourceId: userId });
    return { revoked: result.count };
  }
  if (!options.refreshToken) return { revoked: 0 };
  const result = await prisma.refreshToken.updateMany({
    where: { userId, tokenHash: hashToken(options.refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await writeAudit(req, { action: "LOGOUT", resource: "User", resourceId: userId });
  return { revoked: result.count };
}

async function issueSession(
  userId: string,
  email: string,
  fullName: string,
  role: "PATIENT" | "CAREGIVER" | "HEALTH_WORKER" | "ADMIN",
  req: Request,
) {
  const accessToken = signAccessToken({ sub: userId, role, type: "user" });
  const refresh = signRefreshToken(userId);
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: refresh.hash,
      expiresAt: refresh.expiresAt,
      userAgent: req.get("user-agent") ?? null,
      ipAddress: req.ip ?? null,
    },
  });
  return {
    user: { userId, email, fullName, role },
    tokens: {
      accessToken,
      refreshToken: refresh.token,
      expiresIn: accessTokenTtlSeconds(),
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Device pairing                                                            */
/* -------------------------------------------------------------------------- */

export async function pairDevice(input: PairDeviceInput, req: Request) {
  const now = new Date();
  const pairing = await prisma.pairingCode.findFirst({
    where: { code: input.pairingCode },
    orderBy: { createdAt: "desc" },
    include: { patient: true },
  });

  if (!pairing) throw AppError.notFound("Pairing code");
  if (pairing.expiresAt.getTime() < now.getTime()) {
    throw AppError.gone("That pairing code has expired. Please ask your caregiver for a new one.");
  }
  // Single-use, unless the same physical device is re-pairing (app reinstall),
  // or this is the seeded demonstration code (see PairingCode.reusable).
  if (pairing.usedAt && pairing.usedByDeviceId && !pairing.reusable) {
    const previous = await prisma.device.findUnique({ where: { id: pairing.usedByDeviceId } });
    if (previous && previous.deviceIdentifier !== input.deviceIdentifier) {
      throw AppError.conflict("That pairing code has already been used on another device.");
    }
  }

  const rotated = await prisma.$transaction(async (tx) => {
    const existing = await tx.device.findUnique({ where: { deviceIdentifier: input.deviceIdentifier } });

    // Create first with a placeholder hash so the device id can be signed into
    // the token, then rotate the stored hash to the real one.
    const device = existing
      ? await tx.device.update({
          where: { id: existing.id },
          data: {
            patientId: pairing.patientId,
            platform: input.platform ?? existing.platform,
            appVersion: input.appVersion ?? existing.appVersion,
            pushToken: input.pushToken ?? existing.pushToken,
            revokedAt: null,
          },
        })
      : await tx.device.create({
          data: {
            patientId: pairing.patientId,
            deviceIdentifier: input.deviceIdentifier,
            platform: input.platform,
            appVersion: input.appVersion,
            pushToken: input.pushToken,
            tokenHash: "pending",
            tokenExpiresAt: now,
          },
        });

    const token = signDeviceToken({ sub: device.id, patientId: pairing.patientId, type: "device" });
    const updated = await tx.device.update({
      where: { id: device.id },
      data: { tokenHash: token.hash, tokenIssuedAt: now, tokenExpiresAt: token.expiresAt },
    });

    await tx.pairingCode.update({
      where: { id: pairing.id },
      data: { usedAt: now, usedByDeviceId: device.id },
    });

    return { device: updated, token };
  });

  await writeAudit(req, {
    action: "DEVICE_PAIRED",
    resource: "Device",
    resourceId: rotated.device.id,
    patientId: pairing.patientId,
    metadata: { platform: input.platform ?? null },
  });

  return {
    deviceId: rotated.device.id,
    deviceToken: rotated.token.token,
    patientId: pairing.patientId,
    patient: {
      patientId: pairing.patient.id,
      displayName: pairing.patient.displayName,
      preferredName: pairing.patient.preferredName,
      age: pairing.patient.age,
      location: pairing.patient.location,
      preferredLanguage: pairing.patient.preferredLanguage,
      stateId: pairing.patient.stateId ?? undefined,
      communityId: pairing.patient.communityId ?? undefined,
      reducedMotion: pairing.patient.reducedMotion,
      largeText: pairing.patient.largeText,
      audioGuidanceEnabled: pairing.patient.audioGuidanceEnabled,
    },
    packageVersion: pairing.patient.packageVersion,
    expiresAt: rotated.token.expiresAt.toISOString(),
  };
}
