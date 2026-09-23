import { Router } from "express";
import { updatePatientSchema } from "@smritisetu/shared-types";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../middleware/errorHandler";
import { requireRole, requireUser, requireUserOrDevice } from "../../middleware/auth";
import { requirePatientAccess } from "../../middleware/patientAccess";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { buildSignedUrl } from "../../lib/signedUrl";
import { writeAudit } from "../../lib/audit";
import { buildGameConfig, buildOfflinePackage, bumpPackageVersion } from "../../services/offlinePackage";

export const patientsRouter = Router();

function baseUrlOf(req: import("express").Request): string {
  return `${req.protocol}://${req.get("host")}`;
}

function patientSummary(
  patient: {
    id: string;
    displayName: string;
    preferredName: string;
    age: number;
    location: string;
    preferredLanguage: string;
    stateId: string | null;
    communityId: string | null;
    photoStorageKey: string | null;
    reducedMotion: boolean;
    largeText: boolean;
    audioGuidanceEnabled: boolean;
    packageVersion: number;
  },
  req: import("express").Request,
) {
  return {
    patientId: patient.id,
    displayName: patient.displayName,
    preferredName: patient.preferredName,
    age: patient.age,
    location: patient.location,
    preferredLanguage: patient.preferredLanguage,
    stateId: patient.stateId ?? undefined,
    communityId: patient.communityId ?? undefined,
    photoUrl: patient.photoStorageKey
      ? buildSignedUrl(patient.photoStorageKey, patient.id, baseUrlOf(req))
      : undefined,
    reducedMotion: patient.reducedMotion,
    largeText: patient.largeText,
    audioGuidanceEnabled: patient.audioGuidanceEnabled,
    packageVersion: patient.packageVersion,
  };
}

/** The caregiver/health-worker dashboard's patient list — only patients the caller is assigned to. */
patientsRouter.get(
  "/patients",
  requireUser,
  requireRole("CAREGIVER", "HEALTH_WORKER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const { userId, role } = req.auth!;
    const where =
      role === "ADMIN"
        ? { deletedAt: null }
        : role === "CAREGIVER"
          ? { deletedAt: null, caregiverAssignments: { some: { userId, revokedAt: null } } }
          : { deletedAt: null, healthWorkerAssignments: { some: { userId, revokedAt: null } } };

    const patients = await prisma.patientProfile.findMany({ where, orderBy: { displayName: "asc" } });
    res.json({ data: patients.map((patient) => patientSummary(patient, req)), requestId: req.requestId });
  }),
);

patientsRouter.get(
  "/patients/:patientId",
  requireUserOrDevice,
  requirePatientAccess(),
  asyncHandler(async (req, res) => {
    const patient = await prisma.patientProfile.findFirst({
      where: { id: req.params.patientId, deletedAt: null },
    });
    if (!patient) throw AppError.notFound("Patient");

    res.json({
      data: {
        patientId: patient.id,
        displayName: patient.displayName,
        preferredName: patient.preferredName,
        age: patient.age,
        location: patient.location,
        preferredLanguage: patient.preferredLanguage,
        stateId: patient.stateId ?? undefined,
        communityId: patient.communityId ?? undefined,
        photoUrl: patient.photoStorageKey
          ? buildSignedUrl(patient.photoStorageKey, patient.id, baseUrlOf(req))
          : undefined,
        reducedMotion: patient.reducedMotion,
        largeText: patient.largeText,
        audioGuidanceEnabled: patient.audioGuidanceEnabled,
        packageVersion: patient.packageVersion,
      },
      requestId: req.requestId,
    });
  }),
);

/** The caregiver dashboard's landing card for one patient. */
patientsRouter.get(
  "/patients/:patientId/overview",
  requireUser,
  requirePatientAccess(),
  asyncHandler(async (req, res) => {
    const patientId = req.params.patientId;
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [patient, device, gamesCompletedToday, acknowledged, missed, openAlertCount, lastSession] =
      await Promise.all([
        prisma.patientProfile.findFirst({ where: { id: patientId, deletedAt: null } }),
        prisma.device.findFirst({ where: { patientId }, orderBy: { lastSeenAt: "desc" } }),
        prisma.gameSession.count({ where: { patientId, completed: true, playedAt: { gte: startOfToday } } }),
        prisma.reminderEvent.count({ where: { patientId, state: "ACKNOWLEDGED", dueAt: { gte: since7d } } }),
        prisma.reminderEvent.count({ where: { patientId, state: "MISSED", dueAt: { gte: since7d } } }),
        prisma.alert.count({ where: { patientId, status: { not: "RESOLVED" } } }),
        prisma.gameSession.findFirst({ where: { patientId }, orderBy: { playedAt: "desc" } }),
      ]);
    if (!patient) throw AppError.notFound("Patient");

    // "Unpaired" until a device pairs; briefly "paired" after it is last seen,
    // then "offline" — a live status, not the transient client-side "syncing".
    const deviceStatus = !device || device.revokedAt
      ? "unpaired"
      : device.lastSeenAt && Date.now() - device.lastSeenAt.getTime() < 15 * 60 * 1000
        ? "paired"
        : "offline";

    const adherenceTotal = acknowledged + missed;

    res.json({
      data: {
        patientId: patient.id,
        displayName: patient.displayName,
        deviceStatus,
        lastActivityAt: lastSession?.playedAt.toISOString(),
        lastSyncAt: device?.lastSyncAt?.toISOString(),
        gamesCompletedToday,
        // No reminders due yet is not the same as every one being missed.
        reminderAdherence7d: adherenceTotal > 0 ? Number((acknowledged / adherenceTotal).toFixed(3)) : 1,
        openAlertCount,
      },
      requestId: req.requestId,
    });
  }),
);

/** Who is currently assigned to this patient, for the dashboard's profile screen. */
patientsRouter.get(
  "/patients/:patientId/assignments",
  requireUser,
  requirePatientAccess(),
  asyncHandler(async (req, res) => {
    const patientId = req.params.patientId;
    const [caregivers, healthWorkers] = await Promise.all([
      prisma.caregiverAssignment.findMany({ where: { patientId, revokedAt: null } }),
      prisma.healthWorkerAssignment.findMany({ where: { patientId, revokedAt: null } }),
    ]);

    res.json({
      data: [
        ...caregivers.map((a) => ({
          patientId,
          userId: a.userId,
          role: "CAREGIVER" as const,
          activeFrom: a.createdAt.toISOString(),
          activeTo: a.revokedAt?.toISOString(),
        })),
        ...healthWorkers.map((a) => ({
          patientId,
          userId: a.userId,
          role: "HEALTH_WORKER" as const,
          activeFrom: a.createdAt.toISOString(),
          activeTo: a.revokedAt?.toISOString(),
        })),
      ],
      requestId: req.requestId,
    });
  }),
);

patientsRouter.patch(
  "/patients/:patientId",
  requireUserOrDevice,
  requirePatientAccess(),
  validate(updatePatientSchema),
  asyncHandler(async (req, res) => {
    // A device may only change the accessibility preferences the patient can
    // reach from the Settings screen; identity fields stay with the care team.
    const deviceEditable = ["preferredLanguage", "reducedMotion", "largeText", "audioGuidanceEnabled"];
    if (req.device) {
      const attempted = Object.keys(req.body);
      const forbidden = attempted.filter((k) => !deviceEditable.includes(k));
      if (forbidden.length > 0) {
        throw AppError.forbidden(`A device cannot change: ${forbidden.join(", ")}`);
      }
    }

    const updated = await prisma.patientProfile.update({
      where: { id: req.params.patientId },
      data: req.body,
    });
    await bumpPackageVersion(updated.id);
    await writeAudit(req, {
      action: "PATIENT_UPDATED",
      resource: "PatientProfile",
      resourceId: updated.id,
      patientId: updated.id,
      metadata: { fields: Object.keys(req.body) },
    });

    res.json({
      data: {
        patientId: updated.id,
        displayName: updated.displayName,
        preferredName: updated.preferredName,
        age: updated.age,
        location: updated.location,
        preferredLanguage: updated.preferredLanguage,
        reducedMotion: updated.reducedMotion,
        largeText: updated.largeText,
        audioGuidanceEnabled: updated.audioGuidanceEnabled,
        packageVersion: updated.packageVersion + 1,
      },
      requestId: req.requestId,
    });
  }),
);

patientsRouter.get(
  "/patients/:patientId/offline-package",
  requireUserOrDevice,
  requirePatientAccess(),
  asyncHandler(async (req, res) => {
    const language = typeof req.query.language === "string" ? req.query.language : undefined;
    const pkg = await buildOfflinePackage(req.params.patientId, {
      baseUrl: baseUrlOf(req),
      language: language === "as" || language === "en" ? language : undefined,
    });

    if (req.device) {
      await prisma.device.update({
        where: { id: req.device.deviceId },
        data: { packageVersion: pkg.packageVersion, lastSeenAt: new Date() },
      });
    }
    await writeAudit(req, {
      action: "OFFLINE_PACKAGE_DOWNLOADED",
      resource: "PatientProfile",
      resourceId: req.params.patientId,
      patientId: req.params.patientId,
      metadata: { packageVersion: pkg.packageVersion, memories: pkg.memories.length },
    });

    res.json({ data: pkg, requestId: req.requestId });
  }),
);

patientsRouter.get(
  "/patients/:patientId/game-config",
  requireUserOrDevice,
  requirePatientAccess(),
  asyncHandler(async (req, res) => {
    const config = await buildGameConfig(req.params.patientId);
    res.json({ data: config, requestId: req.requestId });
  }),
);

/** Caregiver-facing: generate a fresh six-digit pairing code for a patient. */
patientsRouter.post(
  "/patients/:patientId/pairing-codes",
  requireUser,
  requireRole("CAREGIVER", "ADMIN", "HEALTH_WORKER"),
  requirePatientAccess(),
  asyncHandler(async (req, res) => {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const created = await prisma.pairingCode.create({
      data: {
        code,
        patientId: req.params.patientId,
        createdById: req.auth!.userId,
        expiresAt,
      },
    });
    await writeAudit(req, {
      action: "PAIRING_CODE_CREATED",
      resource: "PairingCode",
      resourceId: created.id,
      patientId: req.params.patientId,
    });
    res.status(201).json({
      data: { pairingCode: code, expiresAt: expiresAt.toISOString() },
      requestId: req.requestId,
    });
  }),
);
