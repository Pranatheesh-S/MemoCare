import { z } from "zod";
import {
  AlertSeverities,
  AlertTypes,
  GameTypes,
  PlanGameTypes,
  MAX_DIFFICULTY,
  MemoryAssetTypes,
  MemoryCategories,
  MIN_DIFFICULTY,
  NEStateIds,
  ReminderStates,
  ScheduleKinds,
  SupportedLanguages,
  SyncEventTypes,
  UserRoles,
} from "./enums";

/* -------------------------------------------------------------------------- */
/*  Primitives                                                                */
/* -------------------------------------------------------------------------- */

export const uuidSchema = z.string().uuid();
export const isoDateTimeSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Must be an ISO-8601 date-time string",
  });

export const difficultySchema = z
  .number()
  .int()
  .min(MIN_DIFFICULTY)
  .max(MAX_DIFFICULTY);

export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Must be HH:mm in 24-hour format");

/* -------------------------------------------------------------------------- */
/*  Auth                                                                      */
/* -------------------------------------------------------------------------- */

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128)
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a digit");

export const registerSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: passwordSchema,
  fullName: z.string().min(2).max(120),
  role: z.enum(UserRoles).refine((role) => role !== "PATIENT", {
    message: "Patients access the system through device pairing, not registration",
  }),
  phoneNumber: z.string().min(6).max(20).optional(),
});

export const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(10).optional(),
  allDevices: z.boolean().optional().default(false),
});

export const pairDeviceSchema = z.object({
  pairingCode: z.string().regex(/^\d{6}$/, "Pairing code must be six digits"),
  deviceIdentifier: z.string().min(6).max(128),
  platform: z.string().max(40).optional(),
  appVersion: z.string().max(40).optional(),
  /** FCM token so the backend can push reminders when online. */
  pushToken: z.string().max(512).optional(),
});

/* -------------------------------------------------------------------------- */
/*  Patients                                                                  */
/* -------------------------------------------------------------------------- */

export const updatePatientSchema = z
  .object({
    displayName: z.string().min(1).max(120).optional(),
    preferredName: z.string().min(1).max(60).optional(),
    age: z.number().int().min(1).max(130).optional(),
    location: z.string().max(160).optional(),
    preferredLanguage: z.enum(SupportedLanguages).optional(),
    stateId: z.enum(NEStateIds).optional(),
    communityId: z.string().max(64).optional(),
    reducedMotion: z.boolean().optional(),
    largeText: z.boolean().optional(),
    audioGuidanceEnabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

/* -------------------------------------------------------------------------- */
/*  Schedules                                                                 */
/* -------------------------------------------------------------------------- */

export const occurrenceSchema = z.object({
  timeOfDay: timeOfDaySchema,
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).default([]),
});

export const createScheduleSchema = z.object({
  kind: z.enum(ScheduleKinds),
  titleEn: z.string().min(1).max(120),
  titleAs: z.string().max(160).optional(),
  detail: z.string().max(400).optional(),
  critical: z.boolean().default(false),
  occurrences: z.array(occurrenceSchema).min(1).max(12),
  missedAfterMinutes: z.number().int().min(5).max(720).default(45),
  snoozeMinutes: z.number().int().min(1).max(120).default(10),
  medicineId: uuidSchema.optional(),
  routineId: uuidSchema.optional(),
});

export const updateScheduleSchema = createScheduleSchema
  .partial()
  .extend({
    active: z.boolean().optional(),
    /**
     * Optimistic concurrency: the caregiver must state the version they edited
     * so that conflicting medicine/routine changes are surfaced, never silently
     * overwritten.
     */
    expectedVersion: z.number().int().min(1).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

/* -------------------------------------------------------------------------- */
/*  Game sessions                                                             */
/* -------------------------------------------------------------------------- */

export const gameSessionSchema = z.object({
  eventId: uuidSchema,
  patientId: uuidSchema,
  deviceId: z.string().min(1),
  gameType: z.enum(GameTypes),
  difficulty: difficultySchema,
  accuracy: z.number().min(0).max(1).nullable(),
  responseTimeSeconds: z.number().min(0).max(36000),
  hintsUsed: z.number().int().min(0).max(500),
  attempts: z.number().int().min(0).max(2000),
  completed: z.boolean(),
  abandoned: z.boolean(),
  engagementDurationSeconds: z.number().int().min(0).max(86400),
  playedAt: isoDateTimeSchema,
  detail: z.record(z.unknown()).optional(),
});

/* -------------------------------------------------------------------------- */
/*  Reminder events                                                           */
/* -------------------------------------------------------------------------- */

export const reminderEventSchema = z.object({
  eventId: uuidSchema,
  patientId: uuidSchema,
  deviceId: z.string().min(1),
  scheduleId: uuidSchema,
  scheduleVersion: z.number().int().min(1).default(1),
  dueAt: isoDateTimeSchema,
  state: z.enum(ReminderStates),
  stateChangedAt: isoDateTimeSchema,
  snoozeCount: z.number().int().min(0).max(100).default(0),
  helpRequested: z.boolean().default(false),
});

export const helpRequestSchema = z.object({
  eventId: uuidSchema,
  patientId: uuidSchema,
  deviceId: z.string().min(1),
  requestedAt: isoDateTimeSchema,
  context: z.string().max(200).optional(),
  scheduleId: uuidSchema.optional(),
});

export const memoryEngagementSchema = z.object({
  eventId: uuidSchema,
  patientId: uuidSchema,
  deviceId: z.string().min(1),
  memoryIds: z.array(z.string()).max(200).default([]),
  audioPlayedCount: z.number().int().min(0).max(500).default(0),
  engagementDurationSeconds: z.number().int().min(0).max(86400),
  viewedAt: isoDateTimeSchema,
});

/* -------------------------------------------------------------------------- */
/*  Sync                                                                      */
/* -------------------------------------------------------------------------- */

export const syncEventEnvelopeSchema = z.object({
  eventId: uuidSchema,
  patientId: uuidSchema,
  deviceId: z.string().min(1).max(128),
  eventType: z.enum(SyncEventTypes),
  eventTimestamp: isoDateTimeSchema,
  payloadVersion: z.number().int().min(1).max(100),
  localCreatedAt: isoDateTimeSchema,
  payload: z.record(z.unknown()),
});

export const syncBatchSchema = z.object({
  events: z.array(syncEventEnvelopeSchema).min(1).max(200),
  /** Package version the device currently holds, so the server can advise. */
  clientPackageVersion: z.number().int().min(0).optional(),
});

/* -------------------------------------------------------------------------- */
/*  Memory vault                                                              */
/* -------------------------------------------------------------------------- */

export const uploadUrlSchema = z.object({
  fileName: z.string().min(1).max(200),
  mimeType: z
    .string()
    .regex(/^(image\/(jpeg|png|webp)|audio\/(mpeg|mp4|m4a|wav|aac))$/, "Unsupported media type"),
  sizeBytes: z.number().int().min(1).max(50 * 1024 * 1024),
  checksum: z.string().min(8).max(128).optional(),
});

export const createMemorySchema = z.object({
  category: z.enum(MemoryCategories),
  assetType: z.enum(MemoryAssetTypes),
  titleEn: z.string().min(1).max(160),
  titleAs: z.string().max(200).optional(),
  captionEn: z.string().max(500).optional(),
  captionAs: z.string().max(600).optional(),
  storyEn: z.string().max(2000).optional(),
  storyAs: z.string().max(2400).optional(),
  storageKey: z.string().max(400).optional(),
  checksum: z.string().max(128).optional(),
  mimeType: z.string().max(80).optional(),
  sizeBytes: z.number().int().min(0).optional(),
  personName: z.string().max(120).optional(),
  relationshipEn: z.string().max(80).optional(),
  relationshipAs: z.string().max(120).optional(),
  voiceStorageKey: z.string().max(400).optional(),
  consentId: uuidSchema,
  favourite: z.boolean().default(false),
});

export const consentSchema = z.object({
  purpose: z.string().min(3).max(300),
  grantedByName: z.string().min(2).max(120),
  assetScope: z.string().min(2).max(200),
  consentVersion: z.string().min(1).max(20).default("1.0"),
});

/* -------------------------------------------------------------------------- */
/*  Alerts                                                                    */
/* -------------------------------------------------------------------------- */

export const acknowledgeAlertSchema = z.object({
  note: z.string().max(500).optional(),
});

export const escalateAlertSchema = z.object({
  escalateToUserId: uuidSchema.optional(),
  note: z.string().max(500).optional(),
});

export const resolveAlertSchema = z.object({
  resolutionNote: z.string().min(1).max(1000),
});

export const alertQuerySchema = z.object({
  status: z.string().optional(),
  severity: z.enum(AlertSeverities).optional(),
  type: z.enum(AlertTypes).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const trendsQuerySchema = z.object({
  period: z.enum(["7d", "30d"]).default("7d"),
});

export const gameSessionQuerySchema = z.object({
  gameType: z.enum(GameTypes).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  since: isoDateTimeSchema.optional(),
});

export const sessionPlanQuerySchema = z.object({
  gameType: z.enum(PlanGameTypes).optional(),
});

/* -------------------------------------------------------------------------- */
/*  Offline package validation (used by the mobile client)                    */
/* -------------------------------------------------------------------------- */

export const audioPromptSchema = z.object({
  key: z.string().min(1),
  language: z.enum(SupportedLanguages),
  localAssetPath: z.string().optional(),
  remoteAssetUrl: z.string().optional(),
  checksum: z.string().optional(),
});

export const languagePackSchema = z.object({
  language: z.enum(SupportedLanguages),
  version: z.number().int().min(1),
  translations: z.record(z.string()),
  audioPrompts: z.array(audioPromptSchema),
});

export const patientProfileSchema = z.object({
  patientId: z.string(),
  displayName: z.string(),
  preferredName: z.string(),
  age: z.number(),
  location: z.string(),
  preferredLanguage: z.enum(SupportedLanguages),
  stateId: z.enum(NEStateIds).optional(),
  communityId: z.string().optional(),
  photoUrl: z.string().optional(),
  reducedMotion: z.boolean(),
  largeText: z.boolean(),
  audioGuidanceEnabled: z.boolean(),
});

export const offlinePackageSchema = z.object({
  packageVersion: z.number().int().min(1),
  generatedAt: z.string(),
  patient: patientProfileSchema,
  schedules: z.array(z.record(z.unknown())),
  memories: z.array(z.record(z.unknown())),
  contacts: z.array(z.record(z.unknown())),
  difficultyProfiles: z.array(z.record(z.unknown())),
  languagePack: languagePackSchema,
  gameConfig: z.record(z.unknown()),
  contentPack: z
    .object({
      stateId: z.enum(NEStateIds),
      stateName: z.string(),
      communityId: z.string().optional(),
      primaryLanguage: z.enum(SupportedLanguages),
    })
    .optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PairDeviceInput = z.infer<typeof pairDeviceSchema>;
export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
export type SyncBatchInput = z.infer<typeof syncBatchSchema>;
export type GameSessionInput = z.infer<typeof gameSessionSchema>;
export type CreateMemoryInput = z.infer<typeof createMemorySchema>;
