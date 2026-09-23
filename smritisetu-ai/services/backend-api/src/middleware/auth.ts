import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@smritisetu/shared-types";
import { AppError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { hashToken, verifyAccessToken, verifyDeviceToken } from "../lib/jwt";

function bearerToken(req: Request): string | null {
  const header = req.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

/** Requires a caregiver / health worker / admin access token. */
export function requireUser(req: Request, _res: Response, next: NextFunction): void {
  const token = bearerToken(req);
  if (!token) return next(AppError.unauthorized());
  try {
    const claims = verifyAccessToken(token);
    if (claims.type !== "user") return next(AppError.unauthorized("A user token is required here"));
    req.auth = { userId: claims.sub, role: claims.role };
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Requires a paired patient device token. The token is additionally checked
 * against the stored hash so that revoked or rotated device tokens stop
 * working immediately, rather than only when the JWT expires.
 */
export function requireDevice(req: Request, _res: Response, next: NextFunction): void {
  const token = bearerToken(req);
  if (!token) return next(AppError.unauthorized("This device is not paired"));
  void (async () => {
    try {
      const claims = verifyDeviceToken(token);
      if (claims.type !== "device") throw AppError.unauthorized("A device token is required here");
      const device = await prisma.device.findUnique({ where: { id: claims.sub } });
      if (!device || device.revokedAt) {
        throw AppError.unauthorized("This device is no longer paired. Please pair it again.");
      }
      if (device.tokenHash !== hashToken(token)) {
        throw AppError.unauthorized("This device token has been replaced. Please pair the device again.");
      }
      if (device.tokenExpiresAt.getTime() < Date.now()) {
        throw AppError.tokenExpired("This device needs to be paired again.");
      }
      req.device = { deviceId: device.id, patientId: device.patientId };
      req.patientId = device.patientId;
      await prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
      next();
    } catch (error) {
      next(error);
    }
  })();
}

/** Accepts either a user token or a device token. */
export function requireUserOrDevice(req: Request, res: Response, next: NextFunction): void {
  const token = bearerToken(req);
  if (!token) return next(AppError.unauthorized());
  try {
    const claims = verifyAccessToken(token);
    if (claims.type === "user") {
      req.auth = { userId: claims.sub, role: claims.role };
      return next();
    }
  } catch {
    // fall through to device verification
  }
  requireDevice(req, res, next);
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) return next(AppError.unauthorized());
    if (!roles.includes(req.auth.role)) {
      return next(AppError.forbidden("Your role does not permit this action"));
    }
    next();
  };
}
