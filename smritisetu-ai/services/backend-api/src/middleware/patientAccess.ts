import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/errors";
import { prisma } from "../lib/prisma";

/**
 * Patient assignment gate.
 *
 * A caregiver or health worker may only reach a patient they are actively
 * assigned to. Admins pass through (their access is recorded in the audit log).
 * A device may only reach the patient it was paired with.
 *
 * `paramName` names the route parameter carrying the patient id.
 */
export function requirePatientAccess(paramName = "patientId") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    void (async () => {
      try {
        const patientId = req.params[paramName];
        if (!patientId) throw AppError.badRequest(`Route parameter ${paramName} is required`);

        if (req.device) {
          if (req.device.patientId !== patientId) {
            throw AppError.forbidden("This device is not paired with that patient");
          }
          req.patientId = patientId;
          return next();
        }

        if (!req.auth) throw AppError.unauthorized();

        const patient = await prisma.patientProfile.findFirst({
          where: { id: patientId, deletedAt: null },
          select: { id: true },
        });
        if (!patient) throw AppError.notFound("Patient");

        if (req.auth.role === "ADMIN") {
          req.patientId = patientId;
          return next();
        }

        const assigned = await isAssigned(req.auth.userId, req.auth.role, patientId);
        if (!assigned) {
          throw AppError.forbidden("You are not assigned to this patient");
        }
        req.patientId = patientId;
        next();
      } catch (error) {
        next(error);
      }
    })();
  };
}

export async function isAssigned(userId: string, role: string, patientId: string): Promise<boolean> {
  if (role === "ADMIN") return true;
  if (role === "CAREGIVER") {
    const row = await prisma.caregiverAssignment.findFirst({
      where: { userId, patientId, revokedAt: null },
      select: { id: true },
    });
    return Boolean(row);
  }
  if (role === "HEALTH_WORKER") {
    const row = await prisma.healthWorkerAssignment.findFirst({
      where: { userId, patientId, revokedAt: null },
      select: { id: true },
    });
    return Boolean(row);
  }
  return false;
}

/** Every patient id this user can reach — the dashboard's patient list and alert-inbox scope. */
export async function accessiblePatientIds(userId: string, role: string): Promise<string[]> {
  if (role === "ADMIN") {
    const all = await prisma.patientProfile.findMany({ where: { deletedAt: null }, select: { id: true } });
    return all.map((p) => p.id);
  }
  if (role === "CAREGIVER") {
    const rows = await prisma.caregiverAssignment.findMany({
      where: { userId, revokedAt: null },
      select: { patientId: true },
    });
    return rows.map((r) => r.patientId);
  }
  if (role === "HEALTH_WORKER") {
    const rows = await prisma.healthWorkerAssignment.findMany({
      where: { userId, revokedAt: null },
      select: { patientId: true },
    });
    return rows.map((r) => r.patientId);
  }
  return [];
}

/**
 * Resolves the patient behind a non-patient-scoped resource (an alert, a
 * memory, a schedule) and applies the same assignment gate.
 */
export function requireAccessToPatientOf(resolver: (req: Request) => Promise<string | null>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    void (async () => {
      try {
        const patientId = await resolver(req);
        if (!patientId) throw AppError.notFound("Resource");
        if (req.device) {
          if (req.device.patientId !== patientId) throw AppError.forbidden("This device cannot access that resource");
          req.patientId = patientId;
          return next();
        }
        if (!req.auth) throw AppError.unauthorized();
        const allowed = await isAssigned(req.auth.userId, req.auth.role, patientId);
        if (!allowed) throw AppError.forbidden("You are not assigned to this patient");
        req.patientId = patientId;
        next();
      } catch (error) {
        next(error);
      }
    })();
  };
}
