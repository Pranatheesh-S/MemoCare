import { env } from "../config/env";

const bearer = [{ bearerAuth: [] }];

const errorResponse = {
  description: "Error",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/ApiError" },
    },
  },
};

function ok(schemaRef: string, description = "Success") {
  return {
    description,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            data: { $ref: schemaRef },
            requestId: { type: "string" },
          },
        },
      },
    },
  };
}

function okArray(schemaRef: string, description = "Success") {
  return {
    description,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            data: { type: "array", items: { $ref: schemaRef } },
            requestId: { type: "string" },
          },
        },
      },
    },
  };
}

const patientIdParam = {
  name: "patientId",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
};

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "SmritiSetu AI — Backend API",
    version: "1.0.0",
    description: [
      "Offline-first cognitive gaming and memory-assistance platform for elderly",
      "dementia patients in the North Eastern Region of India.",
      "",
      "**Safety boundary.** SmritiSetu AI is a support tool, not a diagnostic",
      "platform. No endpoint diagnoses dementia, recommends or changes medicines,",
      "or asserts that a patient's condition has worsened. Trend endpoints return",
      "explainable, non-diagnostic observations with `isDiagnosis: false`.",
      "",
      "**Authentication.** Caregivers, health workers and admins use JWT access",
      "tokens (`Authorization: Bearer <accessToken>`). Patient devices use a",
      "separate device token issued by `POST /devices/pair`; a device may only",
      "read and write data for the single patient it is paired with.",
    ].join("\n"),
    contact: { name: "SmritiSetu AI" },
    license: { name: "Prototype — not for clinical use" },
  },
  servers: [{ url: `http://localhost:${env.PORT}`, description: "Local development" }],
  tags: [
    { name: "Health", description: "Liveness and readiness" },
    { name: "Authentication", description: "Caregiver login and patient device pairing" },
    { name: "Patients", description: "Patient profile, offline package and game configuration" },
    { name: "Schedules", description: "Medicines, routines and reminder schedules (versioned)" },
    { name: "Synchronisation", description: "Offline event ingestion" },
    { name: "Games", description: "Game sessions, difficulty profiles and trends" },
    { name: "Memory Vault", description: "Consent-linked photos, audio and stories" },
    { name: "Alerts", description: "Explainable caregiver alerts" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      ApiError: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string", example: "FORBIDDEN" },
              message: { type: "string" },
              details: {},
              requestId: { type: "string" },
            },
          },
        },
      },
      LoginResponse: {
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              userId: { type: "string", format: "uuid" },
              email: { type: "string" },
              fullName: { type: "string" },
              role: { type: "string", enum: ["PATIENT", "CAREGIVER", "HEALTH_WORKER", "ADMIN"] },
            },
          },
          tokens: {
            type: "object",
            properties: {
              accessToken: { type: "string" },
              refreshToken: { type: "string" },
              expiresIn: { type: "integer" },
            },
          },
        },
      },
      DevicePairingResponse: {
        type: "object",
        properties: {
          deviceId: { type: "string", format: "uuid" },
          deviceToken: { type: "string" },
          patientId: { type: "string", format: "uuid" },
          patient: { $ref: "#/components/schemas/PatientProfile" },
          packageVersion: { type: "integer" },
          expiresAt: { type: "string", format: "date-time" },
        },
      },
      PatientProfile: {
        type: "object",
        properties: {
          patientId: { type: "string", format: "uuid" },
          displayName: { type: "string", example: "Aita" },
          preferredName: { type: "string", example: "Aita" },
          age: { type: "integer", example: 72 },
          location: { type: "string", example: "Jorhat, Assam" },
          preferredLanguage: {
            type: "string",
            enum: ["en", "as", "mni", "kha", "grt", "lus", "nag", "ne", "bn", "trp", "njz"],
          },
          stateId: {
            type: "string",
            nullable: true,
            enum: ["AS", "AR", "MN", "ML", "MZ", "NL", "SK", "TR"],
            description: "North Eastern state whose regional content pack the patient app loads",
          },
          communityId: {
            type: "string",
            nullable: true,
            example: "meghalaya.khasi",
            description: "Community within the state, selecting community-specific pack material",
          },
          photoUrl: { type: "string", nullable: true, description: "Short-lived signed URL" },
          reducedMotion: { type: "boolean" },
          largeText: { type: "boolean" },
          audioGuidanceEnabled: { type: "boolean" },
        },
      },
      Schedule: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          patientId: { type: "string", format: "uuid" },
          kind: {
            type: "string",
            enum: ["MEDICINE", "HYDRATION", "MEAL", "EXERCISE", "APPOINTMENT", "SLEEP", "FAMILY_CHECK_IN"],
          },
          titleEn: { type: "string" },
          titleAs: { type: "string", nullable: true },
          detail: { type: "string", nullable: true },
          critical: { type: "boolean" },
          occurrences: {
            type: "array",
            items: {
              type: "object",
              properties: {
                timeOfDay: { type: "string", example: "08:00" },
                daysOfWeek: { type: "array", items: { type: "integer", minimum: 0, maximum: 6 } },
              },
            },
          },
          missedAfterMinutes: { type: "integer" },
          snoozeMinutes: { type: "integer" },
          version: { type: "integer", description: "Incremented on every edit; history is preserved" },
          active: { type: "boolean" },
        },
      },
      GameSession: {
        type: "object",
        required: ["eventId", "patientId", "gameType", "difficulty", "playedAt"],
        properties: {
          eventId: { type: "string", format: "uuid", description: "Client-generated; idempotency key" },
          patientId: { type: "string", format: "uuid" },
          deviceId: { type: "string" },
          gameType: {
            type: "string",
            enum: ["MEMORY_MATCH", "ROUTINE_BUILDER", "WHO_IS_THIS", "MEMORY_LANE"],
          },
          difficulty: { type: "integer", minimum: 1, maximum: 4 },
          accuracy: { type: "number", nullable: true, minimum: 0, maximum: 1 },
          responseTimeSeconds: { type: "number" },
          hintsUsed: { type: "integer" },
          attempts: { type: "integer" },
          completed: { type: "boolean" },
          abandoned: { type: "boolean" },
          engagementDurationSeconds: { type: "integer" },
          playedAt: { type: "string", format: "date-time" },
          detail: { type: "object", additionalProperties: true },
        },
      },
      SyncEventEnvelope: {
        type: "object",
        required: ["eventId", "patientId", "deviceId", "eventType", "eventTimestamp", "payloadVersion", "localCreatedAt", "payload"],
        properties: {
          eventId: { type: "string", format: "uuid" },
          patientId: { type: "string", format: "uuid" },
          deviceId: { type: "string" },
          eventType: {
            type: "string",
            enum: ["GAME_SESSION", "REMINDER_EVENT", "HELP_REQUEST", "MEMORY_ENGAGEMENT", "APP_HEARTBEAT"],
          },
          eventTimestamp: { type: "string", format: "date-time" },
          payloadVersion: { type: "integer" },
          localCreatedAt: { type: "string", format: "date-time" },
          payload: { type: "object", additionalProperties: true },
        },
      },
      SyncResponse: {
        type: "object",
        properties: {
          accepted: { type: "array", items: { type: "string" } },
          duplicates: { type: "array", items: { type: "string" } },
          rejected: {
            type: "array",
            items: {
              type: "object",
              properties: {
                eventId: { type: "string" },
                code: { type: "string" },
                message: { type: "string" },
              },
            },
          },
          conflicts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                eventId: { type: "string" },
                serverVersion: { type: "integer" },
                clientVersion: { type: "integer" },
                resolutionRequired: { type: "boolean" },
              },
            },
          },
          serverTime: { type: "string", format: "date-time" },
          nextPackageVersion: { type: "integer" },
        },
      },
      OfflinePackage: {
        type: "object",
        properties: {
          packageVersion: { type: "integer" },
          generatedAt: { type: "string", format: "date-time" },
          patient: { $ref: "#/components/schemas/PatientProfile" },
          schedules: { type: "array", items: { $ref: "#/components/schemas/Schedule" } },
          memories: { type: "array", items: { $ref: "#/components/schemas/MemoryAsset" } },
          contacts: { type: "array", items: { type: "object", additionalProperties: true } },
          difficultyProfiles: { type: "array", items: { type: "object", additionalProperties: true } },
          languagePack: {
            type: "object",
            properties: {
              language: { type: "string", enum: ["en", "as"] },
              version: { type: "integer" },
              translations: { type: "object", additionalProperties: { type: "string" } },
              audioPrompts: { type: "array", items: { type: "object", additionalProperties: true } },
            },
          },
          gameConfig: { type: "object", additionalProperties: true },
        },
      },
      MemoryAsset: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          patientId: { type: "string", format: "uuid" },
          consentId: { type: "string", format: "uuid", description: "Every asset is linked to a consent record" },
          category: {
            type: "string",
            enum: ["MY_FAMILY", "MY_HOME", "MY_FESTIVALS", "MY_PLACES", "MY_SONGS", "HAPPY_MOMENTS"],
          },
          assetType: { type: "string", enum: ["PHOTO", "AUDIO", "STORY"] },
          titleEn: { type: "string" },
          titleAs: { type: "string", nullable: true },
          captionEn: { type: "string", nullable: true },
          storyEn: { type: "string", nullable: true },
          personName: { type: "string", nullable: true },
          relationshipEn: { type: "string", nullable: true },
          mediaUrl: { type: "string", nullable: true, description: "Short-lived signed URL; never public" },
          voiceUrl: { type: "string", nullable: true },
          favourite: { type: "boolean" },
        },
      },
      Alert: {
        type: "object",
        properties: {
          alertId: { type: "string", format: "uuid" },
          patientId: { type: "string", format: "uuid" },
          type: {
            type: "string",
            enum: [
              "MISSED_CRITICAL_REMINDER",
              "HELP_REQUESTED",
              "NO_ACTIVITY",
              "SUSTAINED_TREND_CHANGE",
              "DEVICE_NOT_SYNCED",
              "REPEATED_GAME_ABANDONMENT",
            ],
          },
          severity: { type: "string", enum: ["INFORMATION", "ATTENTION", "IMPORTANT", "URGENT"] },
          evidence: { type: "object", additionalProperties: true },
          explanation: { type: "string", description: "Plain-language, non-diagnostic" },
          createdAt: { type: "string", format: "date-time" },
          status: { type: "string", enum: ["OPEN", "ACKNOWLEDGED", "ESCALATED", "RESOLVED"] },
          assignedUserId: { type: "string", nullable: true },
          acknowledgedAt: { type: "string", nullable: true },
          resolvedAt: { type: "string", nullable: true },
          resolutionNote: { type: "string", nullable: true },
          ruleVersion: { type: "string" },
          isDiagnosis: { type: "boolean", enum: [false] },
        },
      },
      TrendsResponse: {
        type: "object",
        properties: {
          patientId: { type: "string", format: "uuid" },
          period: { type: "string", enum: ["7d", "30d"] },
          status: { type: "string", enum: ["STABLE", "REVIEW_SUGGESTED", "INSUFFICIENT_DATA"] },
          reasonCode: { type: "string", example: "SUSTAINED_HINT_INCREASE" },
          explanation: { type: "string" },
          isDiagnosis: { type: "boolean", enum: [false] },
          indicators: { type: "array", items: { type: "object", additionalProperties: true } },
          sessionCount: { type: "integer" },
          modelVersion: { type: "string" },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Liveness probe",
        responses: { 200: { description: "Service is alive" } },
      },
    },
    "/ready": {
      get: {
        tags: ["Health"],
        summary: "Readiness probe",
        description: "The ML service being unreachable is reported but does not make the API unready.",
        responses: { 200: { description: "Ready" }, 503: { description: "Not ready" } },
      },
    },
    [`${env.API_BASE_PATH}/auth/register`]: {
      post: {
        tags: ["Authentication"],
        summary: "Register a caregiver, health worker or admin",
        description: "Patients never register — they are paired to a device with a six-digit code.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password", "fullName", "role"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 10 },
                  fullName: { type: "string" },
                  role: { type: "string", enum: ["CAREGIVER", "HEALTH_WORKER", "ADMIN"] },
                  phoneNumber: { type: "string" },
                },
              },
            },
          },
        },
        responses: { 201: ok("#/components/schemas/LoginResponse", "Registered"), 409: errorResponse, 422: errorResponse },
      },
    },
    [`${env.API_BASE_PATH}/auth/login`]: {
      post: {
        tags: ["Authentication"],
        summary: "Sign in",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: { email: { type: "string" }, password: { type: "string" } },
              },
            },
          },
        },
        responses: { 200: ok("#/components/schemas/LoginResponse"), 401: errorResponse },
      },
    },
    [`${env.API_BASE_PATH}/auth/refresh`]: {
      post: {
        tags: ["Authentication"],
        summary: "Exchange a refresh token for a new session",
        description: "Refresh tokens rotate on use; replaying a revoked token revokes the whole family.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", required: ["refreshToken"], properties: { refreshToken: { type: "string" } } },
            },
          },
        },
        responses: { 200: ok("#/components/schemas/LoginResponse"), 401: errorResponse },
      },
    },
    [`${env.API_BASE_PATH}/auth/logout`]: {
      post: {
        tags: ["Authentication"],
        summary: "Revoke the current session, or every session",
        security: bearer,
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { refreshToken: { type: "string" }, allDevices: { type: "boolean" } },
              },
            },
          },
        },
        responses: { 200: { description: "Revoked" }, 401: errorResponse },
      },
    },
    [`${env.API_BASE_PATH}/devices/pair`]: {
      post: {
        tags: ["Authentication"],
        summary: "Pair a patient device with a six-digit code",
        description: "The patient never types an email or password. Demo pairing code: **123456**.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["pairingCode", "deviceIdentifier"],
                properties: {
                  pairingCode: { type: "string", example: "123456" },
                  deviceIdentifier: { type: "string" },
                  platform: { type: "string" },
                  appVersion: { type: "string" },
                  pushToken: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          201: ok("#/components/schemas/DevicePairingResponse", "Paired"),
          404: errorResponse,
          409: errorResponse,
          410: errorResponse,
        },
      },
    },
    [`${env.API_BASE_PATH}/patients/{patientId}`]: {
      get: {
        tags: ["Patients"],
        summary: "Read a patient profile",
        security: bearer,
        parameters: [patientIdParam],
        responses: { 200: ok("#/components/schemas/PatientProfile"), 403: errorResponse, 404: errorResponse },
      },
      patch: {
        tags: ["Patients"],
        summary: "Update a patient profile",
        description: "A device token may only change accessibility preferences.",
        security: bearer,
        parameters: [patientIdParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  displayName: { type: "string" },
                  preferredName: { type: "string" },
                  preferredLanguage: {
                    type: "string",
                    enum: ["en", "as", "mni", "kha", "grt", "lus", "nag", "ne", "bn", "trp", "njz"],
                  },
                  stateId: { type: "string", enum: ["AS", "AR", "MN", "ML", "MZ", "NL", "SK", "TR"] },
                  communityId: { type: "string" },
                  reducedMotion: { type: "boolean" },
                  largeText: { type: "boolean" },
                  audioGuidanceEnabled: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: { 200: ok("#/components/schemas/PatientProfile"), 403: errorResponse },
      },
    },
    [`${env.API_BASE_PATH}/patients/{patientId}/offline-package`]: {
      get: {
        tags: ["Patients"],
        summary: "Download everything the device needs to work offline",
        description:
          "Includes the profile, schedules, consented memories with signed URLs, family contacts, difficulty profiles, the language pack and the game configuration. Assets whose consent has been withdrawn are excluded.",
        security: bearer,
        parameters: [
          patientIdParam,
          { name: "language", in: "query", schema: { type: "string", enum: ["en", "as"] } },
        ],
        responses: { 200: ok("#/components/schemas/OfflinePackage"), 403: errorResponse },
      },
    },
    [`${env.API_BASE_PATH}/patients/{patientId}/game-config`]: {
      get: {
        tags: ["Patients"],
        summary: "Current per-game difficulty and hint configuration",
        security: bearer,
        parameters: [patientIdParam],
        responses: { 200: { description: "Game configuration" }, 403: errorResponse },
      },
    },
    [`${env.API_BASE_PATH}/patients/{patientId}/pairing-codes`]: {
      post: {
        tags: ["Authentication"],
        summary: "Generate a fresh six-digit pairing code (caregiver action)",
        security: bearer,
        parameters: [patientIdParam],
        responses: { 201: { description: "Pairing code created" }, 403: errorResponse },
      },
    },
    [`${env.API_BASE_PATH}/patients/{patientId}/schedules`]: {
      get: {
        tags: ["Schedules"],
        summary: "List schedules",
        security: bearer,
        parameters: [patientIdParam],
        responses: { 200: okArray("#/components/schemas/Schedule"), 403: errorResponse },
      },
      post: {
        tags: ["Schedules"],
        summary: "Create a schedule",
        description: "A same-kind, same-time overlap is rejected with 409 rather than silently created.",
        security: bearer,
        parameters: [patientIdParam],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/Schedule" } } },
        },
        responses: { 201: ok("#/components/schemas/Schedule"), 409: errorResponse, 422: errorResponse },
      },
    },
    [`${env.API_BASE_PATH}/schedules/{scheduleId}`]: {
      patch: {
        tags: ["Schedules"],
        summary: "Update a schedule (versioned, optimistic concurrency)",
        description:
          "Pass `expectedVersion` to detect a concurrent edit. Medicine and routine plans are never silently overwritten — a mismatch returns 409 with both versions.",
        security: bearer,
        parameters: [{ name: "scheduleId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                allOf: [
                  { $ref: "#/components/schemas/Schedule" },
                  { type: "object", properties: { expectedVersion: { type: "integer" } } },
                ],
              },
            },
          },
        },
        responses: { 200: ok("#/components/schemas/Schedule"), 409: errorResponse },
      },
      delete: {
        tags: ["Schedules"],
        summary: "Soft-delete a schedule",
        security: bearer,
        parameters: [{ name: "scheduleId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { 200: { description: "Removed" }, 403: errorResponse },
      },
    },
    [`${env.API_BASE_PATH}/schedules/{scheduleId}/versions`]: {
      get: {
        tags: ["Schedules"],
        summary: "Full version history of a schedule",
        security: bearer,
        parameters: [{ name: "scheduleId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { 200: { description: "Version history" } },
      },
    },
    [`${env.API_BASE_PATH}/sync/events`]: {
      post: {
        tags: ["Synchronisation"],
        summary: "Ingest a batch of offline events",
        description:
          "Idempotent per (deviceId, eventId). Partial success is normal: each event lands in exactly one of accepted / duplicates / rejected / conflicts. Requires a **device** token.",
        security: bearer,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["events"],
                properties: {
                  events: { type: "array", items: { $ref: "#/components/schemas/SyncEventEnvelope" }, maxItems: 200 },
                  clientPackageVersion: { type: "integer" },
                },
              },
            },
          },
        },
        responses: { 200: ok("#/components/schemas/SyncResponse"), 401: errorResponse, 422: errorResponse },
      },
    },
    [`${env.API_BASE_PATH}/sync/status/{deviceId}`]: {
      get: {
        tags: ["Synchronisation"],
        summary: "Last sync time and accepted event count for a device",
        security: bearer,
        parameters: [{ name: "deviceId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { 200: { description: "Sync status" }, 403: errorResponse, 404: errorResponse },
      },
    },
    [`${env.API_BASE_PATH}/game-sessions`]: {
      post: {
        tags: ["Games"],
        summary: "Record a game session directly (online path)",
        description: "Requires a device token. Replaying the same eventId returns 200 with `duplicate: true`.",
        security: bearer,
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/GameSession" } } },
        },
        responses: { 201: { description: "Recorded" }, 200: { description: "Duplicate — already recorded" } },
      },
    },
    [`${env.API_BASE_PATH}/patients/{patientId}/game-sessions`]: {
      get: {
        tags: ["Games"],
        summary: "List game sessions",
        security: bearer,
        parameters: [
          patientIdParam,
          { name: "gameType", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 100 } },
          { name: "since", in: "query", schema: { type: "string", format: "date-time" } },
        ],
        responses: { 200: okArray("#/components/schemas/GameSession") },
      },
    },
    [`${env.API_BASE_PATH}/patients/{patientId}/trends`]: {
      get: {
        tags: ["Games"],
        summary: "Explainable, non-diagnostic trend analysis",
        description:
          "Rolling 7-day or 30-day analysis using robust statistics. Never returns a diagnosis; a single poor session never produces an observation.",
        security: bearer,
        parameters: [
          patientIdParam,
          { name: "period", in: "query", schema: { type: "string", enum: ["7d", "30d"], default: "7d" } },
        ],
        responses: { 200: ok("#/components/schemas/TrendsResponse") },
      },
    },
    [`${env.API_BASE_PATH}/patients/{patientId}/difficulty-profiles`]: {
      get: {
        tags: ["Games"],
        summary: "Current difficulty and hint level per game, with the stored explanation",
        security: bearer,
        parameters: [patientIdParam],
        responses: { 200: { description: "Difficulty profiles" } },
      },
    },
    [`${env.API_BASE_PATH}/patients/{patientId}/adaptation-history`]: {
      get: {
        tags: ["Games"],
        summary: "Auditable history of every adaptation decision",
        security: bearer,
        parameters: [patientIdParam],
        responses: { 200: { description: "Adaptation decisions with evidence, rule version and explanation" } },
      },
    },
    [`${env.API_BASE_PATH}/patients/{patientId}/memories/upload-url`]: {
      post: {
        tags: ["Memory Vault"],
        summary: "Request a short-lived signed upload target",
        security: bearer,
        parameters: [patientIdParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["fileName", "mimeType", "sizeBytes"],
                properties: {
                  fileName: { type: "string" },
                  mimeType: { type: "string", example: "image/jpeg" },
                  sizeBytes: { type: "integer" },
                  checksum: { type: "string" },
                },
              },
            },
          },
        },
        responses: { 201: { description: "Signed upload target" }, 400: errorResponse },
      },
    },
    [`${env.API_BASE_PATH}/patients/{patientId}/memories`]: {
      post: {
        tags: ["Memory Vault"],
        summary: "Create a memory (requires an ACTIVE consent record)",
        security: bearer,
        parameters: [patientIdParam],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/MemoryAsset" } } },
        },
        responses: { 201: ok("#/components/schemas/MemoryAsset"), 400: errorResponse, 409: errorResponse },
      },
      get: {
        tags: ["Memory Vault"],
        summary: "List consented memories with signed media URLs",
        security: bearer,
        parameters: [patientIdParam, { name: "category", in: "query", schema: { type: "string" } }],
        responses: { 200: okArray("#/components/schemas/MemoryAsset") },
      },
    },
    [`${env.API_BASE_PATH}/memories/{memoryId}`]: {
      delete: {
        tags: ["Memory Vault"],
        summary: "Soft-delete a memory",
        security: bearer,
        parameters: [{ name: "memoryId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { 200: { description: "Removed" } },
      },
    },
    [`${env.API_BASE_PATH}/patients/{patientId}/consents`]: {
      post: {
        tags: ["Memory Vault"],
        summary: "Record consent for personal media",
        security: bearer,
        parameters: [patientIdParam],
        responses: { 201: { description: "Consent recorded" } },
      },
      get: {
        tags: ["Memory Vault"],
        summary: "List consent records",
        security: bearer,
        parameters: [patientIdParam],
        responses: { 200: { description: "Consent records" } },
      },
    },
    [`${env.API_BASE_PATH}/consents/{consentId}/withdraw`]: {
      post: {
        tags: ["Memory Vault"],
        summary: "Withdraw consent",
        description:
          "Immediately removes every asset in scope from future offline packages and soft-deletes them, while keeping the consent record for audit.",
        security: bearer,
        parameters: [{ name: "consentId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { 200: { description: "Withdrawn" } },
      },
    },
    [`${env.API_BASE_PATH}/media/{key}`]: {
      get: {
        tags: ["Memory Vault"],
        summary: "Fetch media with a valid signature",
        description: "There is no public URL for any asset. Signatures bind key + patient + expiry.",
        parameters: [
          { name: "key", in: "path", required: true, schema: { type: "string" } },
          { name: "patientId", in: "query", required: true, schema: { type: "string" } },
          { name: "expires", in: "query", required: true, schema: { type: "integer" } },
          { name: "signature", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: { 200: { description: "Media bytes" }, 403: errorResponse, 404: errorResponse, 410: errorResponse },
      },
    },
    [`${env.API_BASE_PATH}/patients/{patientId}/alerts`]: {
      get: {
        tags: ["Alerts"],
        summary: "List caregiver alerts",
        security: bearer,
        parameters: [
          patientIdParam,
          { name: "status", in: "query", schema: { type: "string", example: "OPEN,ACKNOWLEDGED" } },
          { name: "severity", in: "query", schema: { type: "string" } },
          { name: "type", in: "query", schema: { type: "string" } },
        ],
        responses: { 200: okArray("#/components/schemas/Alert") },
      },
    },
    [`${env.API_BASE_PATH}/alerts/{alertId}/acknowledge`]: {
      post: {
        tags: ["Alerts"],
        summary: "Acknowledge an alert",
        security: bearer,
        parameters: [{ name: "alertId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { 200: { description: "Acknowledged" }, 409: errorResponse },
      },
    },
    [`${env.API_BASE_PATH}/alerts/{alertId}/escalate`]: {
      post: {
        tags: ["Alerts"],
        summary: "Escalate an alert one severity step",
        security: bearer,
        parameters: [{ name: "alertId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { 200: { description: "Escalated" } },
      },
    },
    [`${env.API_BASE_PATH}/alerts/{alertId}/resolve`]: {
      post: {
        tags: ["Alerts"],
        summary: "Resolve an alert",
        description: "Resolving releases the deduplication slot so a recurrence can raise a fresh alert.",
        security: bearer,
        parameters: [{ name: "alertId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", required: ["resolutionNote"], properties: { resolutionNote: { type: "string" } } },
            },
          },
        },
        responses: { 200: { description: "Resolved" } },
      },
    },
  },
};
