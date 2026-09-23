import { Prisma } from "@prisma/client";
import {
  gameSessionSchema,
  helpRequestSchema,
  memoryEngagementSchema,
  reminderEventSchema,
  type SyncBatchInput,
  type SyncResponse,
} from "@smritisetu/shared-types";
import { prisma } from "../../lib/prisma";
import { logger } from "../../lib/logger";
import {
  evaluateGameAbandonment,
  evaluateHelpRequest,
  evaluateMissedCriticalReminders,
} from "../../services/alertEngine";
import { evaluateAdaptation } from "../../services/adaptation";
import { evaluateSessionPlan } from "../../services/personalisation";

type Outcome =
  | { kind: "accepted"; eventId: string }
  | { kind: "duplicate"; eventId: string }
  | { kind: "rejected"; eventId: string; code: string; message: string }
  | {
      kind: "conflict";
      eventId: string;
      serverVersion: number;
      clientVersion: number;
      resolutionRequired: boolean;
    };

/**
 * Ingests a batch of offline events.
 *
 * Guarantees:
 *  * idempotent — a replayed event is reported as a duplicate, never stored twice
 *  * partial success — one bad event never rejects the whole batch
 *  * append-only — game and reminder events are inserted, never updated
 *  * no silent overwrite — an event referencing an outdated medicine or routine
 *    schedule version is returned as a conflict for a human to resolve
 */
export async function ingestEvents(
  deviceId: string,
  patientId: string,
  input: SyncBatchInput,
): Promise<SyncResponse> {
  const outcomes: Outcome[] = [];

  // Preserve creation order: the device queues events in the order they
  // happened and later events may depend on earlier ones.
  const ordered = [...input.events].sort(
    (a, b) => new Date(a.localCreatedAt).getTime() - new Date(b.localCreatedAt).getTime(),
  );

  const seenInBatch = new Set<string>();

  for (const event of ordered) {
    try {
      if (event.patientId !== patientId) {
        outcomes.push({
          kind: "rejected",
          eventId: event.eventId,
          code: "PATIENT_MISMATCH",
          message: "This event belongs to a different patient than the paired device",
        });
        continue;
      }

      // Duplicate inside the same batch.
      if (seenInBatch.has(event.eventId)) {
        outcomes.push({ kind: "duplicate", eventId: event.eventId });
        continue;
      }
      seenInBatch.add(event.eventId);

      const alreadyStored = await prisma.syncEvent.findUnique({
        where: { deviceId_eventId: { deviceId, eventId: event.eventId } },
        select: { id: true, status: true },
      });
      if (alreadyStored) {
        outcomes.push({ kind: "duplicate", eventId: event.eventId });
        continue;
      }

      const outcome = await handleEvent(deviceId, patientId, event);
      outcomes.push(outcome);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        // Lost a race with a concurrent batch — that is still a duplicate.
        outcomes.push({ kind: "duplicate", eventId: event.eventId });
        continue;
      }
      logger.error("Failed to ingest sync event", {
        eventId: event.eventId,
        deviceId,
        reason: error instanceof Error ? error.message : String(error),
      });
      outcomes.push({
        kind: "rejected",
        eventId: event.eventId,
        code: "INGEST_FAILED",
        message: "This event could not be stored. The device may safely retry it.",
      });
    }
  }

  const accepted = outcomes.filter((o) => o.kind === "accepted").map((o) => o.eventId);

  // Post-ingest evaluations run only when something was actually accepted, and
  // never block the response contract: a failure here is logged, not surfaced.
  if (accepted.length > 0) {
    await runPostIngestEvaluations(patientId, ordered, accepted).catch((error) =>
      logger.error("Post-ingest evaluation failed", {
        patientId,
        reason: error instanceof Error ? error.message : String(error),
      }),
    );
    await prisma.device.update({
      where: { id: deviceId },
      data: { lastSyncAt: new Date(), lastSeenAt: new Date() },
    });
  }

  const patient = await prisma.patientProfile.findUnique({
    where: { id: patientId },
    select: { packageVersion: true },
  });

  const response: SyncResponse = {
    accepted,
    duplicates: outcomes.filter((o) => o.kind === "duplicate").map((o) => o.eventId),
    rejected: outcomes
      .filter((o): o is Extract<Outcome, { kind: "rejected" }> => o.kind === "rejected")
      .map(({ eventId, code, message }) => ({ eventId, code, message })),
    conflicts: outcomes
      .filter((o): o is Extract<Outcome, { kind: "conflict" }> => o.kind === "conflict")
      .map(({ eventId, serverVersion, clientVersion, resolutionRequired }) => ({
        eventId,
        serverVersion,
        clientVersion,
        resolutionRequired,
      })),
    serverTime: new Date().toISOString(),
  };

  if (patient && input.clientPackageVersion !== undefined && patient.packageVersion > input.clientPackageVersion) {
    response.nextPackageVersion = patient.packageVersion;
  }

  return response;
}

async function handleEvent(
  deviceId: string,
  patientId: string,
  event: SyncBatchInput["events"][number],
): Promise<Outcome> {
  switch (event.eventType) {
    case "GAME_SESSION":
      return handleGameSession(deviceId, patientId, event);
    case "REMINDER_EVENT":
      return handleReminderEvent(deviceId, patientId, event);
    case "HELP_REQUEST":
      return handleHelpRequest(deviceId, patientId, event);
    case "MEMORY_ENGAGEMENT":
      return handleMemoryEngagement(deviceId, patientId, event);
    case "APP_HEARTBEAT":
      await storeEnvelope(deviceId, patientId, event, "ACCEPTED");
      return { kind: "accepted", eventId: event.eventId };
    default:
      await storeEnvelope(deviceId, patientId, event, "REJECTED", "UNKNOWN_EVENT_TYPE");
      return {
        kind: "rejected",
        eventId: event.eventId,
        code: "UNKNOWN_EVENT_TYPE",
        message: `Event type ${String(event.eventType)} is not supported by this server version`,
      };
  }
}

async function handleGameSession(
  deviceId: string,
  patientId: string,
  event: SyncBatchInput["events"][number],
): Promise<Outcome> {
  const parsed = gameSessionSchema.safeParse({ ...event.payload, eventId: event.eventId, patientId, deviceId });
  if (!parsed.success) {
    await storeEnvelope(deviceId, patientId, event, "REJECTED", "INVALID_GAME_SESSION");
    return {
      kind: "rejected",
      eventId: event.eventId,
      code: "INVALID_GAME_SESSION",
      message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  }

  const data = parsed.data;
  await prisma.$transaction(async (tx) => {
    await tx.gameSession.create({
      data: {
        eventId: data.eventId,
        patientId,
        deviceId,
        gameType: data.gameType,
        difficulty: data.difficulty,
        accuracy: data.accuracy,
        responseTimeSeconds: data.responseTimeSeconds,
        hintsUsed: data.hintsUsed,
        attempts: data.attempts,
        completed: data.completed,
        abandoned: data.abandoned,
        engagementDurationSeconds: data.engagementDurationSeconds,
        playedAt: new Date(data.playedAt),
        detail: (data.detail ?? {}) as Prisma.InputJsonValue,
      },
    });
    await storeEnvelope(deviceId, patientId, event, "ACCEPTED", undefined, tx);
  });

  return { kind: "accepted", eventId: event.eventId };
}

async function handleReminderEvent(
  deviceId: string,
  patientId: string,
  event: SyncBatchInput["events"][number],
): Promise<Outcome> {
  const parsed = reminderEventSchema.safeParse({ ...event.payload, eventId: event.eventId, patientId, deviceId });
  if (!parsed.success) {
    await storeEnvelope(deviceId, patientId, event, "REJECTED", "INVALID_REMINDER_EVENT");
    return {
      kind: "rejected",
      eventId: event.eventId,
      code: "INVALID_REMINDER_EVENT",
      message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  }

  const data = parsed.data;
  const schedule = await prisma.schedule.findFirst({
    where: { id: data.scheduleId, patientId },
  });
  if (!schedule) {
    await storeEnvelope(deviceId, patientId, event, "REJECTED", "UNKNOWN_SCHEDULE");
    return {
      kind: "rejected",
      eventId: event.eventId,
      code: "UNKNOWN_SCHEDULE",
      message: "The schedule this reminder refers to no longer exists on the server",
    };
  }

  // The device acted on an older version of a medicine or routine schedule.
  // The event is still stored (it is real history and must not be lost) but the
  // conflict is reported so a caregiver can reconcile it — the server never
  // silently rewrites the patient's medicine or routine plan.
  const isPlanCritical = schedule.kind === "MEDICINE" || Boolean(schedule.routineId);
  if (isPlanCritical && data.scheduleVersion < schedule.version) {
    await prisma.$transaction(async (tx) => {
      await tx.reminderEvent.create({
        data: reminderEventRow(data, deviceId, patientId, schedule.kind, schedule.critical),
      });
      await storeEnvelope(deviceId, patientId, event, "CONFLICT", "SCHEDULE_VERSION_OUTDATED", tx);
    });
    return {
      kind: "conflict",
      eventId: event.eventId,
      serverVersion: schedule.version,
      clientVersion: data.scheduleVersion,
      resolutionRequired: true,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.reminderEvent.create({
      data: reminderEventRow(data, deviceId, patientId, schedule.kind, schedule.critical),
    });
    await storeEnvelope(deviceId, patientId, event, "ACCEPTED", undefined, tx);
  });

  return { kind: "accepted", eventId: event.eventId };
}

function reminderEventRow(
  data: {
    eventId: string;
    scheduleId: string;
    scheduleVersion: number;
    dueAt: string;
    state: string;
    stateChangedAt: string;
    snoozeCount: number;
    helpRequested: boolean;
  },
  deviceId: string,
  patientId: string,
  kind: Prisma.ReminderEventCreateInput["kind"],
  critical: boolean,
) {
  return {
    eventId: data.eventId,
    patientId,
    deviceId,
    scheduleId: data.scheduleId,
    scheduleVersion: data.scheduleVersion,
    kind,
    critical,
    dueAt: new Date(data.dueAt),
    state: data.state as Prisma.ReminderEventCreateInput["state"],
    stateChangedAt: new Date(data.stateChangedAt),
    snoozeCount: data.snoozeCount,
    helpRequested: data.helpRequested,
  };
}

async function handleHelpRequest(
  deviceId: string,
  patientId: string,
  event: SyncBatchInput["events"][number],
): Promise<Outcome> {
  const parsed = helpRequestSchema.safeParse({ ...event.payload, eventId: event.eventId, patientId, deviceId });
  if (!parsed.success) {
    await storeEnvelope(deviceId, patientId, event, "REJECTED", "INVALID_HELP_REQUEST");
    return {
      kind: "rejected",
      eventId: event.eventId,
      code: "INVALID_HELP_REQUEST",
      message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  }
  await storeEnvelope(deviceId, patientId, event, "ACCEPTED");
  return { kind: "accepted", eventId: event.eventId };
}

async function handleMemoryEngagement(
  deviceId: string,
  patientId: string,
  event: SyncBatchInput["events"][number],
): Promise<Outcome> {
  const parsed = memoryEngagementSchema.safeParse({ ...event.payload, eventId: event.eventId, patientId, deviceId });
  if (!parsed.success) {
    await storeEnvelope(deviceId, patientId, event, "REJECTED", "INVALID_MEMORY_ENGAGEMENT");
    return {
      kind: "rejected",
      eventId: event.eventId,
      code: "INVALID_MEMORY_ENGAGEMENT",
      message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  }
  await storeEnvelope(deviceId, patientId, event, "ACCEPTED");
  return { kind: "accepted", eventId: event.eventId };
}

async function storeEnvelope(
  deviceId: string,
  patientId: string,
  event: SyncBatchInput["events"][number],
  status: "ACCEPTED" | "REJECTED" | "DUPLICATE" | "CONFLICT",
  rejectionCode?: string,
  client: Prisma.TransactionClient = prisma,
): Promise<void> {
  await client.syncEvent.create({
    data: {
      eventId: event.eventId,
      patientId,
      deviceId,
      eventType: event.eventType,
      eventTimestamp: new Date(event.eventTimestamp),
      payloadVersion: event.payloadVersion,
      localCreatedAt: new Date(event.localCreatedAt),
      payload: event.payload as Prisma.InputJsonValue,
      status,
      rejectionCode: rejectionCode ?? null,
    },
  });
}

/**
 * After a successful batch: re-evaluate the alert rules and ask the ML service
 * for a fresh difficulty recommendation. Both are best-effort.
 */
async function runPostIngestEvaluations(
  patientId: string,
  events: SyncBatchInput["events"],
  acceptedIds: string[],
): Promise<void> {
  const accepted = new Set(acceptedIds);
  const relevant = events.filter((e) => accepted.has(e.eventId));

  // Missed critical reminders — evaluated once per affected schedule.
  const missedScheduleIds = new Set(
    relevant
      .filter((e) => e.eventType === "REMINDER_EVENT" && (e.payload as { state?: string }).state === "MISSED")
      .map((e) => String((e.payload as { scheduleId?: string }).scheduleId ?? ""))
      .filter(Boolean),
  );
  for (const scheduleId of missedScheduleIds) {
    await evaluateMissedCriticalReminders(patientId, scheduleId);
  }

  // Help requests.
  const helpEvents = relevant.filter(
    (e) =>
      e.eventType === "HELP_REQUEST" ||
      (e.eventType === "REMINDER_EVENT" && (e.payload as { state?: string }).state === "HELP_REQUESTED"),
  );
  for (const helpEvent of helpEvents) {
    await evaluateHelpRequest(
      patientId,
      new Date(helpEvent.eventTimestamp),
      String((helpEvent.payload as { context?: string }).context ?? "app"),
    );
  }

  // Difficulty adaptation, once per game type touched by this batch.
  const gameTypes = new Set(
    relevant
      .filter((e) => e.eventType === "GAME_SESSION")
      .map((e) => String((e.payload as { gameType?: string }).gameType ?? ""))
      .filter(Boolean),
  );
  for (const gameType of gameTypes) {
    await evaluateAdaptation(patientId, gameType as Prisma.GameSessionCreateInput["gameType"]);
    await evaluateSessionPlan(patientId, gameType as Prisma.GameSessionCreateInput["gameType"]);
  }

  if (gameTypes.size > 0) {
    await evaluateGameAbandonment(patientId);
  }
}

export async function getSyncStatus(deviceId: string) {
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    include: { patient: { select: { packageVersion: true, id: true } } },
  });
  if (!device) return null;

  const [acceptedEventCount, pendingServerActions] = await Promise.all([
    prisma.syncEvent.count({ where: { deviceId, status: "ACCEPTED" } }),
    prisma.alert.count({ where: { patientId: device.patientId, status: "OPEN" } }),
  ]);

  return {
    deviceId: device.id,
    patientId: device.patientId,
    lastSyncAt: device.lastSyncAt?.toISOString() ?? null,
    acceptedEventCount,
    pendingServerActions,
    currentPackageVersion: device.patient.packageVersion,
    serverTime: new Date().toISOString(),
  };
}
