import type { Request } from "express";
import { prisma } from "./prisma";
import { logger } from "./logger";

export type AuditInput = {
  action: string;
  resource: string;
  resourceId?: string | null;
  patientId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Audit writes are best-effort: a logging failure must never break a patient
 * or caregiver request, but it is always reported.
 */
export async function writeAudit(req: Request | null, input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: req?.auth?.userId ?? null,
        actorRole: req?.auth?.role ?? req?.device?.deviceId ? (req?.auth?.role ?? "DEVICE") : null,
        actorType: req?.device ? "DEVICE" : req?.auth ? "USER" : "SYSTEM",
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId ?? null,
        patientId: input.patientId ?? null,
        ipAddress: req?.ip ?? null,
        userAgent: req?.get?.("user-agent") ?? null,
        metadata: (input.metadata ?? {}) as object,
      },
    });
  } catch (error) {
    logger.error("Failed to write audit log", {
      action: input.action,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
