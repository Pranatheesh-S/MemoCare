import { Router } from "express";
import {
  acknowledgeAlertSchema,
  alertQuerySchema,
  escalateAlertSchema,
  resolveAlertSchema,
} from "@smritisetu/shared-types";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../middleware/errorHandler";
import { requireRole, requireUser } from "../../middleware/auth";
import { accessiblePatientIds, requireAccessToPatientOf, requirePatientAccess } from "../../middleware/patientAccess";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { writeAudit } from "../../lib/audit";
import { releaseDedupe } from "../../services/alertEngine";

export const alertsRouter = Router();

const resolveAlertPatient = async (req: import("express").Request) => {
  const alert = await prisma.alert.findUnique({
    where: { id: req.params.alertId },
    select: { patientId: true },
  });
  return alert?.patientId ?? null;
};

function serializeAlert(a: {
  id: string;
  patientId: string;
  type: string;
  severity: string;
  evidence: unknown;
  explanation: string;
  createdAt: Date;
  status: string;
  assignedUserId: string | null;
  acknowledgedAt: Date | null;
  acknowledgedByUserId: string | null;
  escalatedAt: Date | null;
  resolvedAt: Date | null;
  resolutionNote: string | null;
  ruleVersion: string;
  dedupeKey: string;
}) {
  return {
    alertId: a.id,
    patientId: a.patientId,
    type: a.type,
    severity: a.severity,
    evidence: a.evidence,
    explanation: a.explanation,
    createdAt: a.createdAt.toISOString(),
    status: a.status,
    assignedUserId: a.assignedUserId,
    acknowledgedAt: a.acknowledgedAt?.toISOString() ?? null,
    acknowledgedByUserId: a.acknowledgedByUserId,
    escalatedAt: a.escalatedAt?.toISOString() ?? null,
    resolvedAt: a.resolvedAt?.toISOString() ?? null,
    resolutionNote: a.resolutionNote,
    ruleVersion: a.ruleVersion,
    dedupeKey: a.dedupeKey,
    isDiagnosis: false,
  };
}

/** The dashboard's alert inbox: every open-or-recent alert across every patient this user can reach. */
alertsRouter.get(
  "/alerts",
  requireUser,
  requireRole("CAREGIVER", "HEALTH_WORKER", "ADMIN"),
  validate(alertQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as { status?: string; severity?: string; type?: string; limit: number };
    const statuses = query.status ? query.status.split(",").map((s) => s.trim().toUpperCase()) : undefined;
    const patientIds = await accessiblePatientIds(req.auth!.userId, req.auth!.role);

    const alerts = patientIds.length
      ? await prisma.alert.findMany({
          where: {
            patientId: { in: patientIds },
            ...(statuses ? { status: { in: statuses as never[] } } : {}),
            ...(query.severity ? { severity: query.severity as never } : {}),
            ...(query.type ? { type: query.type as never } : {}),
          },
          orderBy: [{ createdAt: "desc" }],
          take: query.limit,
        })
      : [];

    res.json({ data: alerts.map(serializeAlert), requestId: req.requestId });
  }),
);

alertsRouter.get(
  "/patients/:patientId/alerts",
  requireUser,
  requirePatientAccess(),
  validate(alertQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as {
      status?: string;
      severity?: string;
      type?: string;
      limit: number;
    };
    const statuses = query.status
      ? query.status.split(",").map((s) => s.trim().toUpperCase())
      : undefined;

    const alerts = await prisma.alert.findMany({
      where: {
        patientId: req.params.patientId,
        ...(statuses ? { status: { in: statuses as never[] } } : {}),
        ...(query.severity ? { severity: query.severity as never } : {}),
        ...(query.type ? { type: query.type as never } : {}),
      },
      orderBy: [{ createdAt: "desc" }],
      take: query.limit,
    });

    res.json({
      data: alerts.map(serializeAlert),
      requestId: req.requestId,
    });
  }),
);

const acknowledgeAlert = asyncHandler(async (req, res) => {
  const alert = await prisma.alert.findUnique({ where: { id: req.params.alertId } });
  if (!alert) throw AppError.notFound("Alert");
  if (alert.status === "RESOLVED") throw AppError.conflict("That alert is already resolved");

  const updated = await prisma.alert.update({
    where: { id: alert.id },
    data: {
      status: "ACKNOWLEDGED",
      acknowledgedAt: new Date(),
      acknowledgedByUserId: req.auth!.userId,
    },
  });
  await writeAudit(req, {
    action: "ALERT_ACKNOWLEDGED",
    resource: "Alert",
    resourceId: alert.id,
    patientId: alert.patientId,
    metadata: { note: req.body.note ?? null },
  });
  res.json({ data: { alertId: updated.id, status: updated.status }, requestId: req.requestId });
});

// POST is the shipped contract; PATCH is an alias for the dashboard, which
// follows §8.1's verb rather than this service's own docs.
alertsRouter.post(
  "/alerts/:alertId/acknowledge",
  requireUser,
  requireRole("CAREGIVER", "HEALTH_WORKER", "ADMIN"),
  requireAccessToPatientOf(resolveAlertPatient),
  validate(acknowledgeAlertSchema),
  acknowledgeAlert,
);
alertsRouter.patch(
  "/alerts/:alertId/acknowledge",
  requireUser,
  requireRole("CAREGIVER", "HEALTH_WORKER", "ADMIN"),
  requireAccessToPatientOf(resolveAlertPatient),
  validate(acknowledgeAlertSchema),
  acknowledgeAlert,
);

const escalateAlert = asyncHandler(async (req, res) => {
  const alert = await prisma.alert.findUnique({ where: { id: req.params.alertId } });
  if (!alert) throw AppError.notFound("Alert");
  if (alert.status === "RESOLVED") throw AppError.conflict("That alert is already resolved");

  // Escalation raises severity by one step, never past URGENT.
  const ladder = ["INFORMATION", "ATTENTION", "IMPORTANT", "URGENT"] as const;
  const nextSeverity = ladder[Math.min(ladder.indexOf(alert.severity) + 1, ladder.length - 1)];

  const updated = await prisma.alert.update({
    where: { id: alert.id },
    data: {
      status: "ESCALATED",
      escalatedAt: new Date(),
      severity: nextSeverity,
      assignedUserId: req.body.escalateToUserId ?? alert.assignedUserId,
    },
  });
  await writeAudit(req, {
    action: "ALERT_ESCALATED",
    resource: "Alert",
    resourceId: alert.id,
    patientId: alert.patientId,
    metadata: { from: alert.severity, to: nextSeverity, note: req.body.note ?? null },
  });
  res.json({
    data: { alertId: updated.id, status: updated.status, severity: updated.severity },
    requestId: req.requestId,
  });
});

alertsRouter.post(
  "/alerts/:alertId/escalate",
  requireUser,
  requireRole("CAREGIVER", "HEALTH_WORKER", "ADMIN"),
  requireAccessToPatientOf(resolveAlertPatient),
  validate(escalateAlertSchema),
  escalateAlert,
);
alertsRouter.patch(
  "/alerts/:alertId/escalate",
  requireUser,
  requireRole("CAREGIVER", "HEALTH_WORKER", "ADMIN"),
  requireAccessToPatientOf(resolveAlertPatient),
  validate(escalateAlertSchema),
  escalateAlert,
);

const resolveAlert = asyncHandler(async (req, res) => {
  const alert = await prisma.alert.findUnique({ where: { id: req.params.alertId } });
  if (!alert) throw AppError.notFound("Alert");
  if (alert.status === "RESOLVED") {
    res.json({ data: { alertId: alert.id, status: "RESOLVED", alreadyResolved: true }, requestId: req.requestId });
    return;
  }

  const updated = await prisma.alert.update({
    where: { id: alert.id },
    data: {
      status: "RESOLVED",
      resolvedAt: new Date(),
      resolutionNote: req.body.resolutionNote,
    },
  });
  // The condition is closed, so a future recurrence may raise a fresh alert.
  await releaseDedupe(alert.patientId, alert.dedupeKey);

  await writeAudit(req, {
    action: "ALERT_RESOLVED",
    resource: "Alert",
    resourceId: alert.id,
    patientId: alert.patientId,
    metadata: { resolutionNote: req.body.resolutionNote },
  });
  res.json({
    data: { alertId: updated.id, status: updated.status, resolvedAt: updated.resolvedAt?.toISOString() },
    requestId: req.requestId,
  });
});

alertsRouter.post(
  "/alerts/:alertId/resolve",
  requireUser,
  requireRole("CAREGIVER", "HEALTH_WORKER", "ADMIN"),
  requireAccessToPatientOf(resolveAlertPatient),
  validate(resolveAlertSchema),
  resolveAlert,
);
alertsRouter.patch(
  "/alerts/:alertId/resolve",
  requireUser,
  requireRole("CAREGIVER", "HEALTH_WORKER", "ADMIN"),
  requireAccessToPatientOf(resolveAlertPatient),
  validate(resolveAlertSchema),
  resolveAlert,
);
