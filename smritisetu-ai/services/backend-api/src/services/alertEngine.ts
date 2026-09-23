import { Prisma, type AlertSeverity, type AlertType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import { notifications } from "../lib/notifications";

export const ALERT_RULE_VERSION = "alerts-1.0.0";

/** Alerts that are still "live" and therefore block a duplicate. */
const UNRESOLVED_STATUSES = ["OPEN", "ACKNOWLEDGED", "ESCALATED"] as const;

type RaiseInput = {
  patientId: string;
  type: AlertType;
  severity: AlertSeverity;
  evidence: Record<string, unknown>;
  explanation: string;
  dedupeKey: string;
  ruleVersion?: string;
};

export type RaiseResult = {
  created: boolean;
  alertId: string;
  reason?: "DUPLICATE_OPEN_CONDITION";
};

/**
 * Creates an alert unless an unresolved alert already exists for the same
 * condition.
 *
 * Deduplication is enforced by a unique (patientId, dedupeKey) row rather than
 * by a read-then-write check, so two concurrent sync batches cannot both slip
 * an alert through. The dedupe row is released when the alert is resolved.
 */
export async function raiseAlert(input: RaiseInput): Promise<RaiseResult> {
  const ruleVersion = input.ruleVersion ?? ALERT_RULE_VERSION;

  try {
    const alert = await prisma.$transaction(async (tx) => {
      const created = await tx.alert.create({
        data: {
          patientId: input.patientId,
          type: input.type,
          severity: input.severity,
          evidence: input.evidence as Prisma.InputJsonValue,
          explanation: input.explanation,
          dedupeKey: input.dedupeKey,
          ruleVersion,
          assignedUserId: await primaryCaregiverId(input.patientId, tx),
        },
      });
      // Unique constraint on (patientId, dedupeKey) — throws P2002 if a live
      // alert for this condition already exists.
      await tx.alertDedupe.create({
        data: { patientId: input.patientId, dedupeKey: input.dedupeKey, alertId: created.id },
      });
      return created;
    });

    await notifyCareTeam(input.patientId, alert.id, input.severity, input.explanation);
    logger.info("Alert raised", {
      alertId: alert.id,
      patientId: input.patientId,
      type: input.type,
      severity: input.severity,
    });
    return { created: true, alertId: alert.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.alertDedupe.findUnique({
        where: { patientId_dedupeKey: { patientId: input.patientId, dedupeKey: input.dedupeKey } },
      });
      logger.debug("Duplicate alert suppressed", { patientId: input.patientId, dedupeKey: input.dedupeKey });
      return {
        created: false,
        alertId: existing?.alertId ?? "",
        reason: "DUPLICATE_OPEN_CONDITION",
      };
    }
    throw error;
  }
}

async function primaryCaregiverId(
  patientId: string,
  tx: Prisma.TransactionClient = prisma,
): Promise<string | null> {
  const assignment = await tx.caregiverAssignment.findFirst({
    where: { patientId, revokedAt: null },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: { userId: true },
  });
  return assignment?.userId ?? null;
}

async function notifyCareTeam(
  patientId: string,
  alertId: string,
  severity: AlertSeverity,
  explanation: string,
): Promise<void> {
  const devices = await prisma.device.findMany({
    where: { patientId, revokedAt: null, pushToken: { not: null } },
    select: { pushToken: true },
  });
  const messages = devices
    .filter((d): d is { pushToken: string } => Boolean(d.pushToken))
    .map((d) => ({
      to: d.pushToken,
      title: severity === "URGENT" ? "Urgent: care team notified" : "Care update",
      body: explanation,
      data: { alertId, severity },
      priority: (severity === "URGENT" || severity === "IMPORTANT" ? "high" : "normal") as
        | "high"
        | "normal",
    }));
  if (messages.length > 0) await notifications.sendMany(messages);
}

/** Releases the dedupe slot so the condition can raise a fresh alert later. */
export async function releaseDedupe(patientId: string, dedupeKey: string): Promise<void> {
  await prisma.alertDedupe
    .delete({ where: { patientId_dedupeKey: { patientId, dedupeKey } } })
    .catch(() => undefined);
}

/* -------------------------------------------------------------------------- */
/*  Rules                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Repeatedly missed critical reminders.
 *
 * Deliberately phrased as "was not marked as done" — the app records an
 * acknowledgement, never that medicine was actually taken.
 */
export async function evaluateMissedCriticalReminders(
  patientId: string,
  scheduleId: string,
): Promise<RaiseResult | null> {
  const since = new Date(Date.now() - 72 * 60 * 60 * 1000);
  const missed = await prisma.reminderEvent.findMany({
    where: { patientId, scheduleId, critical: true, state: "MISSED", dueAt: { gte: since } },
    orderBy: { dueAt: "desc" },
    take: 20,
  });

  // A later ACKNOWLEDGED event for the same due time cancels out the miss.
  const acknowledged = await prisma.reminderEvent.findMany({
    where: {
      patientId,
      scheduleId,
      state: { in: ["ACKNOWLEDGED"] },
      dueAt: { gte: since },
    },
    select: { dueAt: true },
  });
  const acknowledgedTimes = new Set(acknowledged.map((a) => a.dueAt.getTime()));
  const outstanding = missed.filter((m) => !acknowledgedTimes.has(m.dueAt.getTime()));

  if (outstanding.length < env.ALERT_MISSED_CRITICAL_THRESHOLD) return null;

  const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId } });
  const label = schedule?.titleEn ?? "a routine";

  return raiseAlert({
    patientId,
    type: "MISSED_CRITICAL_REMINDER",
    severity: outstanding.length >= env.ALERT_MISSED_CRITICAL_THRESHOLD + 2 ? "URGENT" : "IMPORTANT",
    evidence: {
      scheduleId,
      scheduleTitle: label,
      missedCount: outstanding.length,
      threshold: env.ALERT_MISSED_CRITICAL_THRESHOLD,
      windowHours: 72,
      missedDueTimes: outstanding.slice(0, 5).map((m) => m.dueAt.toISOString()),
    },
    explanation: `"${label}" was not marked as done ${outstanding.length} times in the last 3 days. A caregiver check-in is suggested.`,
    dedupeKey: `MISSED_CRITICAL:${scheduleId}`,
  });
}

/** Patient pressed "I Need Help". Always urgent, always deduped per hour. */
export async function evaluateHelpRequest(
  patientId: string,
  requestedAt: Date,
  context?: string,
): Promise<RaiseResult> {
  const hourBucket = new Date(requestedAt);
  hourBucket.setMinutes(0, 0, 0);
  return raiseAlert({
    patientId,
    type: "HELP_REQUESTED",
    severity: "URGENT",
    evidence: {
      requestedAt: requestedAt.toISOString(),
      context: context ?? "home_screen",
      source: "patient_device",
    },
    explanation:
      "The patient asked for help from the app. Please contact them. This app is not an emergency service.",
    dedupeKey: `HELP:${hourBucket.toISOString()}`,
  });
}

/** No game, memory or reminder activity for the configured window. */
export async function evaluateInactivity(patientId: string): Promise<RaiseResult | null> {
  const cutoff = new Date(Date.now() - env.ALERT_INACTIVITY_HOURS * 60 * 60 * 1000);
  const [lastGame, lastReminder] = await Promise.all([
    prisma.gameSession.findFirst({ where: { patientId }, orderBy: { playedAt: "desc" } }),
    prisma.reminderEvent.findFirst({
      where: { patientId, state: { in: ["ACKNOWLEDGED", "SNOOZED"] } },
      orderBy: { stateChangedAt: "desc" },
    }),
  ]);

  const lastActivity = [lastGame?.playedAt, lastReminder?.stateChangedAt]
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  if (!lastActivity || lastActivity > cutoff) return null;

  const hours = Math.floor((Date.now() - lastActivity.getTime()) / (60 * 60 * 1000));
  return raiseAlert({
    patientId,
    type: "NO_ACTIVITY",
    severity: hours >= env.ALERT_INACTIVITY_HOURS * 2 ? "IMPORTANT" : "ATTENTION",
    evidence: { lastActivityAt: lastActivity.toISOString(), hoursSinceActivity: hours, thresholdHours: env.ALERT_INACTIVITY_HOURS },
    explanation: `There has been no app activity for about ${hours} hours. A friendly check-in is suggested.`,
    dedupeKey: `NO_ACTIVITY:${lastActivity.toISOString().slice(0, 10)}`,
  });
}

/** Device has not synchronised for the configured window. */
export async function evaluateDeviceNotSynced(patientId: string): Promise<RaiseResult | null> {
  const cutoff = new Date(Date.now() - env.ALERT_NO_SYNC_HOURS * 60 * 60 * 1000);
  const device = await prisma.device.findFirst({
    where: { patientId, revokedAt: null },
    orderBy: { lastSyncAt: "desc" },
  });
  if (!device) return null;
  const lastSync = device.lastSyncAt ?? device.createdAt;
  if (lastSync > cutoff) return null;

  const hours = Math.floor((Date.now() - lastSync.getTime()) / (60 * 60 * 1000));
  return raiseAlert({
    patientId,
    type: "DEVICE_NOT_SYNCED",
    severity: "ATTENTION",
    evidence: { deviceId: device.id, lastSyncAt: lastSync.toISOString(), hoursSinceSync: hours },
    explanation: `The patient's device has not connected for about ${hours} hours. Activity on the device is still saved and will arrive when it reconnects.`,
    dedupeKey: `NO_SYNC:${device.id}:${lastSync.toISOString().slice(0, 10)}`,
  });
}

/** Repeated abandonment of activities — a gentle engagement signal only. */
export async function evaluateGameAbandonment(patientId: string): Promise<RaiseResult | null> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recent = await prisma.gameSession.findMany({
    where: { patientId, playedAt: { gte: since } },
    orderBy: { playedAt: "desc" },
    take: 10,
  });
  const abandoned = recent.filter((s) => s.abandoned);
  if (abandoned.length < env.ALERT_ABANDON_THRESHOLD) return null;

  return raiseAlert({
    patientId,
    type: "REPEATED_GAME_ABANDONMENT",
    severity: "ATTENTION",
    evidence: {
      abandonedCount: abandoned.length,
      consideredSessions: recent.length,
      windowDays: 7,
      threshold: env.ALERT_ABANDON_THRESHOLD,
      gameTypes: [...new Set(abandoned.map((a) => a.gameType))],
    },
    explanation: `${abandoned.length} of the last ${recent.length} activities were left before finishing. A calmer activity such as Memory Lane may suit better right now.`,
    dedupeKey: `ABANDONMENT:${new Date().toISOString().slice(0, 10)}`,
  });
}

/**
 * Sustained multi-session trend change, raised from an ML observation.
 * Never a diagnosis — the wording always frames it as "review suggested".
 */
export async function evaluateTrendObservation(
  patientId: string,
  observation: {
    status: string;
    reasonCode: string;
    explanation: string;
    indicators: unknown;
    modelVersion: string;
    period: string;
    sessionCount: number;
  },
): Promise<RaiseResult | null> {
  if (observation.status !== "REVIEW_SUGGESTED") return null;

  return raiseAlert({
    patientId,
    type: "SUSTAINED_TREND_CHANGE",
    severity: "ATTENTION",
    evidence: {
      reasonCode: observation.reasonCode,
      indicators: observation.indicators,
      period: observation.period,
      sessionCount: observation.sessionCount,
      isDiagnosis: false,
    },
    explanation: observation.explanation,
    dedupeKey: `TREND:${observation.reasonCode}:${observation.period}`,
    ruleVersion: observation.modelVersion,
  });
}

export const alertEngine = {
  raiseAlert,
  releaseDedupe,
  evaluateMissedCriticalReminders,
  evaluateHelpRequest,
  evaluateInactivity,
  evaluateDeviceNotSynced,
  evaluateGameAbandonment,
  evaluateTrendObservation,
  UNRESOLVED_STATUSES,
};
