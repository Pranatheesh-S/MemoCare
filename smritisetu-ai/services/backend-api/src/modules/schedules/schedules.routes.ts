import { Router } from "express";
import { Prisma } from "@prisma/client";
import { createScheduleSchema, updateScheduleSchema } from "@smritisetu/shared-types";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../middleware/errorHandler";
import { requireRole, requireUser, requireUserOrDevice } from "../../middleware/auth";
import { requireAccessToPatientOf, requirePatientAccess } from "../../middleware/patientAccess";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { writeAudit } from "../../lib/audit";
import { bumpPackageVersion } from "../../services/offlinePackage";

export const schedulesRouter = Router();

const resolveSchedulePatient = async (req: import("express").Request) => {
  const schedule = await prisma.schedule.findFirst({
    where: { id: req.params.scheduleId, deletedAt: null },
    select: { patientId: true },
  });
  return schedule?.patientId ?? null;
};

schedulesRouter.get(
  "/patients/:patientId/schedules",
  requireUserOrDevice,
  requirePatientAccess(),
  asyncHandler(async (req, res) => {
    const includeInactive = req.query.includeInactive === "true";
    const schedules = await prisma.schedule.findMany({
      where: {
        patientId: req.params.patientId,
        deletedAt: null,
        ...(includeInactive ? {} : { active: true }),
      },
      orderBy: { createdAt: "asc" },
    });
    res.json({ data: schedules, requestId: req.requestId });
  }),
);

schedulesRouter.post(
  "/patients/:patientId/schedules",
  requireUser,
  requireRole("CAREGIVER", "HEALTH_WORKER", "ADMIN"),
  requirePatientAccess(),
  validate(createScheduleSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as import("@smritisetu/shared-types").CreateScheduleInput;

    // Two schedules of the same kind at the same time of day on overlapping
    // days is almost always a mistake — surfaced rather than silently created.
    const conflict = await findTimeConflict(req.params.patientId, body.kind, body.occurrences, null);
    if (conflict) {
      throw AppError.conflict("Another schedule of the same kind already covers that time", {
        conflictingScheduleId: conflict.id,
        conflictingTitle: conflict.titleEn,
        timeOfDay: conflict.timeOfDay,
      });
    }

    const created = await prisma.$transaction(async (tx) => {
      const schedule = await tx.schedule.create({
        data: {
          patientId: req.params.patientId,
          kind: body.kind,
          titleEn: body.titleEn,
          titleAs: body.titleAs,
          detail: body.detail,
          critical: body.critical,
          occurrences: body.occurrences as unknown as Prisma.InputJsonValue,
          missedAfterMinutes: body.missedAfterMinutes,
          snoozeMinutes: body.snoozeMinutes,
          medicineId: body.medicineId,
          routineId: body.routineId,
          version: 1,
        },
      });
      await tx.scheduleVersion.create({
        data: {
          scheduleId: schedule.id,
          version: 1,
          kind: schedule.kind,
          titleEn: schedule.titleEn,
          titleAs: schedule.titleAs,
          detail: schedule.detail,
          critical: schedule.critical,
          occurrences: schedule.occurrences as Prisma.InputJsonValue,
          missedAfterMinutes: schedule.missedAfterMinutes,
          snoozeMinutes: schedule.snoozeMinutes,
          active: schedule.active,
          changedByUserId: req.auth!.userId,
          changeNote: "Created",
        },
      });
      return schedule;
    });

    await bumpPackageVersion(req.params.patientId);
    await writeAudit(req, {
      action: "SCHEDULE_CREATED",
      resource: "Schedule",
      resourceId: created.id,
      patientId: req.params.patientId,
      metadata: { kind: created.kind, critical: created.critical },
    });

    res.status(201).json({ data: created, requestId: req.requestId });
  }),
);

schedulesRouter.patch(
  "/schedules/:scheduleId",
  requireUser,
  requireRole("CAREGIVER", "HEALTH_WORKER", "ADMIN"),
  requireAccessToPatientOf(resolveSchedulePatient),
  validate(updateScheduleSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as import("@smritisetu/shared-types").UpdateScheduleInput;
    const existing = await prisma.schedule.findFirst({
      where: { id: req.params.scheduleId, deletedAt: null },
    });
    if (!existing) throw AppError.notFound("Schedule");

    // Optimistic concurrency. Medicine and routine plans are never silently
    // overwritten: if someone else edited first, the caller is told and must
    // re-read before retrying.
    if (body.expectedVersion !== undefined && body.expectedVersion !== existing.version) {
      throw AppError.conflict("This schedule was changed by someone else. Please review the latest version.", {
        serverVersion: existing.version,
        clientVersion: body.expectedVersion,
        resolutionRequired: true,
      });
    }

    if (body.occurrences || body.kind) {
      const conflict = await findTimeConflict(
        existing.patientId,
        body.kind ?? existing.kind,
        (body.occurrences ?? existing.occurrences) as Array<{ timeOfDay: string; daysOfWeek: number[] }>,
        existing.id,
      );
      if (conflict) {
        throw AppError.conflict("Another schedule of the same kind already covers that time", {
          conflictingScheduleId: conflict.id,
          conflictingTitle: conflict.titleEn,
          timeOfDay: conflict.timeOfDay,
        });
      }
    }

    const nextVersion = existing.version + 1;
    const updated = await prisma.$transaction(async (tx) => {
      const schedule = await tx.schedule.update({
        where: { id: existing.id },
        data: {
          kind: body.kind ?? existing.kind,
          titleEn: body.titleEn ?? existing.titleEn,
          titleAs: body.titleAs ?? existing.titleAs,
          detail: body.detail ?? existing.detail,
          critical: body.critical ?? existing.critical,
          occurrences: (body.occurrences ?? existing.occurrences) as Prisma.InputJsonValue,
          missedAfterMinutes: body.missedAfterMinutes ?? existing.missedAfterMinutes,
          snoozeMinutes: body.snoozeMinutes ?? existing.snoozeMinutes,
          active: body.active ?? existing.active,
          version: nextVersion,
        },
      });
      await tx.scheduleVersion.create({
        data: {
          scheduleId: schedule.id,
          version: nextVersion,
          kind: schedule.kind,
          titleEn: schedule.titleEn,
          titleAs: schedule.titleAs,
          detail: schedule.detail,
          critical: schedule.critical,
          occurrences: schedule.occurrences as Prisma.InputJsonValue,
          missedAfterMinutes: schedule.missedAfterMinutes,
          snoozeMinutes: schedule.snoozeMinutes,
          active: schedule.active,
          changedByUserId: req.auth!.userId,
          changeNote: "Updated",
        },
      });
      return schedule;
    });

    await bumpPackageVersion(existing.patientId);
    await writeAudit(req, {
      action: "SCHEDULE_UPDATED",
      resource: "Schedule",
      resourceId: updated.id,
      patientId: existing.patientId,
      metadata: { version: nextVersion, fields: Object.keys(body) },
    });

    res.json({ data: updated, requestId: req.requestId });
  }),
);

schedulesRouter.delete(
  "/schedules/:scheduleId",
  requireUser,
  requireRole("CAREGIVER", "HEALTH_WORKER", "ADMIN"),
  requireAccessToPatientOf(resolveSchedulePatient),
  asyncHandler(async (req, res) => {
    const existing = await prisma.schedule.findFirst({
      where: { id: req.params.scheduleId, deletedAt: null },
    });
    if (!existing) throw AppError.notFound("Schedule");

    // Soft delete: reminder history keeps pointing at a real schedule row.
    const nextVersion = existing.version + 1;
    await prisma.$transaction(async (tx) => {
      await tx.schedule.update({
        where: { id: existing.id },
        data: { deletedAt: new Date(), active: false, version: nextVersion },
      });
      await tx.scheduleVersion.create({
        data: {
          scheduleId: existing.id,
          version: nextVersion,
          kind: existing.kind,
          titleEn: existing.titleEn,
          titleAs: existing.titleAs,
          detail: existing.detail,
          critical: existing.critical,
          occurrences: existing.occurrences as Prisma.InputJsonValue,
          missedAfterMinutes: existing.missedAfterMinutes,
          snoozeMinutes: existing.snoozeMinutes,
          active: false,
          changedByUserId: req.auth!.userId,
          changeNote: "Removed",
        },
      });
    });

    await bumpPackageVersion(existing.patientId);
    await writeAudit(req, {
      action: "SCHEDULE_DELETED",
      resource: "Schedule",
      resourceId: existing.id,
      patientId: existing.patientId,
    });

    res.json({ data: { scheduleId: existing.id, deleted: true }, requestId: req.requestId });
  }),
);

/** Version history for a schedule — nothing is ever lost. */
schedulesRouter.get(
  "/schedules/:scheduleId/versions",
  requireUser,
  requireAccessToPatientOf(resolveSchedulePatient),
  asyncHandler(async (req, res) => {
    const versions = await prisma.scheduleVersion.findMany({
      where: { scheduleId: req.params.scheduleId },
      orderBy: { version: "desc" },
    });
    res.json({ data: versions, requestId: req.requestId });
  }),
);

type Occurrence = { timeOfDay: string; daysOfWeek: number[] };

async function findTimeConflict(
  patientId: string,
  kind: string,
  occurrences: Occurrence[],
  excludeScheduleId: string | null,
): Promise<{ id: string; titleEn: string; timeOfDay: string } | null> {
  const existing = await prisma.schedule.findMany({
    where: {
      patientId,
      kind: kind as Prisma.ScheduleWhereInput["kind"],
      deletedAt: null,
      active: true,
      ...(excludeScheduleId ? { id: { not: excludeScheduleId } } : {}),
    },
  });

  for (const schedule of existing) {
    const theirs = schedule.occurrences as Occurrence[];
    for (const mine of occurrences) {
      for (const other of theirs) {
        if (mine.timeOfDay !== other.timeOfDay) continue;
        const daysOverlap =
          mine.daysOfWeek.length === 0 ||
          other.daysOfWeek.length === 0 ||
          mine.daysOfWeek.some((d) => other.daysOfWeek.includes(d));
        if (daysOverlap) {
          return { id: schedule.id, titleEn: schedule.titleEn, timeOfDay: mine.timeOfDay };
        }
      }
    }
  }
  return null;
}
