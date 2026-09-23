-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PATIENT', 'CAREGIVER', 'HEALTH_WORKER', 'ADMIN');

-- CreateEnum
CREATE TYPE "GameType" AS ENUM ('MEMORY_MATCH', 'ROUTINE_BUILDER', 'WHO_IS_THIS', 'MEMORY_LANE');

-- CreateEnum
CREATE TYPE "ScheduleKind" AS ENUM ('MEDICINE', 'HYDRATION', 'MEAL', 'EXERCISE', 'APPOINTMENT', 'SLEEP', 'FAMILY_CHECK_IN');

-- CreateEnum
CREATE TYPE "ReminderState" AS ENUM ('UPCOMING', 'DUE', 'ACKNOWLEDGED', 'SNOOZED', 'MISSED', 'HELP_REQUESTED');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('MISSED_CRITICAL_REMINDER', 'HELP_REQUESTED', 'NO_ACTIVITY', 'SUSTAINED_TREND_CHANGE', 'DEVICE_NOT_SYNCED', 'REPEATED_GAME_ABANDONMENT');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFORMATION', 'ATTENTION', 'IMPORTANT', 'URGENT');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'ESCALATED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "MemoryCategory" AS ENUM ('MY_FAMILY', 'MY_HOME', 'MY_FESTIVALS', 'MY_PLACES', 'MY_SONGS', 'HAPPY_MOMENTS');

-- CreateEnum
CREATE TYPE "MemoryAssetType" AS ENUM ('PHOTO', 'AUDIO', 'STORY');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('ACTIVE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "SyncEventType" AS ENUM ('GAME_SESSION', 'REMINDER_EVENT', 'HELP_REQUEST', 'MEMORY_ENGAGEMENT', 'APP_HEARTBEAT');

-- CreateEnum
CREATE TYPE "SyncEventStatus" AS ENUM ('ACCEPTED', 'DUPLICATE', 'REJECTED', 'CONFLICT');

-- CreateEnum
CREATE TYPE "ObservationStatus" AS ENUM ('STABLE', 'REVIEW_SUGGESTED', 'INSUFFICIENT_DATA');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('en', 'as');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "role" "UserRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "userAgent" TEXT,
    "ipAddress" TEXT,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_profiles" (
    "id" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "preferredName" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "location" TEXT NOT NULL,
    "preferredLanguage" "Language" NOT NULL DEFAULT 'en',
    "photoStorageKey" TEXT,
    "reducedMotion" BOOLEAN NOT NULL DEFAULT false,
    "largeText" BOOLEAN NOT NULL DEFAULT true,
    "audioGuidanceEnabled" BOOLEAN NOT NULL DEFAULT true,
    "packageVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "patient_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caregiver_assignments" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "relationship" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "caregiver_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_worker_assignments" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "facility" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "health_worker_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "deviceIdentifier" TEXT NOT NULL,
    "platform" TEXT,
    "appVersion" TEXT,
    "tokenHash" TEXT NOT NULL,
    "tokenIssuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tokenExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "pushToken" TEXT,
    "lastSeenAt" TIMESTAMPTZ(3),
    "lastSyncAt" TIMESTAMPTZ(3),
    "packageVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pairing_codes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "patientId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "usedByDeviceId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pairing_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "grantedByUserId" UUID NOT NULL,
    "grantedByName" TEXT NOT NULL,
    "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assetScope" TEXT NOT NULL,
    "consentVersion" TEXT NOT NULL DEFAULT '1.0',
    "status" "ConsentStatus" NOT NULL DEFAULT 'ACTIVE',
    "withdrawnAt" TIMESTAMPTZ(3),
    "withdrawalNote" TEXT,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_assets" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "consentId" UUID NOT NULL,
    "category" "MemoryCategory" NOT NULL,
    "assetType" "MemoryAssetType" NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleAs" TEXT,
    "captionEn" TEXT,
    "captionAs" TEXT,
    "storyEn" TEXT,
    "storyAs" TEXT,
    "storageKey" TEXT,
    "checksum" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "personName" TEXT,
    "relationshipEn" TEXT,
    "relationshipAs" TEXT,
    "voiceStorageKey" TEXT,
    "favourite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "memory_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_contacts" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "relationshipEn" TEXT NOT NULL,
    "relationshipAs" TEXT,
    "phoneNumber" TEXT NOT NULL,
    "photoStorageKey" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "family_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicines" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "dosageNote" TEXT,
    "prescribedBy" TEXT,
    "critical" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "medicines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routines" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleAs" TEXT,
    "description" TEXT,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "routines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "medicineId" UUID,
    "routineId" UUID,
    "kind" "ScheduleKind" NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleAs" TEXT,
    "detail" TEXT,
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "occurrences" JSONB NOT NULL,
    "missedAfterMinutes" INTEGER NOT NULL DEFAULT 45,
    "snoozeMinutes" INTEGER NOT NULL DEFAULT 10,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_versions" (
    "id" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" "ScheduleKind" NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleAs" TEXT,
    "detail" TEXT,
    "critical" BOOLEAN NOT NULL,
    "occurrences" JSONB NOT NULL,
    "missedAfterMinutes" INTEGER NOT NULL,
    "snoozeMinutes" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL,
    "changedByUserId" UUID,
    "changeNote" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_events" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "scheduleVersion" INTEGER NOT NULL DEFAULT 1,
    "kind" "ScheduleKind" NOT NULL,
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "state" "ReminderState" NOT NULL,
    "stateChangedAt" TIMESTAMPTZ(3) NOT NULL,
    "snoozeCount" INTEGER NOT NULL DEFAULT 0,
    "helpRequested" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminder_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_sessions" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "gameType" "GameType" NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "responseTimeSeconds" DOUBLE PRECISION NOT NULL,
    "hintsUsed" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "abandoned" BOOLEAN NOT NULL DEFAULT false,
    "engagementDurationSeconds" INTEGER NOT NULL DEFAULT 0,
    "playedAt" TIMESTAMPTZ(3) NOT NULL,
    "detail" JSONB,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_events" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "eventType" "SyncEventType" NOT NULL,
    "eventTimestamp" TIMESTAMPTZ(3) NOT NULL,
    "payloadVersion" INTEGER NOT NULL DEFAULT 1,
    "localCreatedAt" TIMESTAMPTZ(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "SyncEventStatus" NOT NULL DEFAULT 'ACCEPTED',
    "rejectionCode" TEXT,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "difficulty_profiles" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "gameType" "GameType" NOT NULL,
    "currentDifficulty" INTEGER NOT NULL DEFAULT 1,
    "hintLevel" INTEGER NOT NULL DEFAULT 1,
    "reasonCode" TEXT NOT NULL DEFAULT 'INITIAL',
    "explanation" TEXT NOT NULL DEFAULT 'Starting at the gentlest level.',
    "modelVersion" TEXT NOT NULL DEFAULT 'rules-1.0.0',
    "evidenceSessionCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "difficulty_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adaptation_decisions" (
    "id" UUID NOT NULL,
    "difficultyProfileId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "gameType" "GameType" NOT NULL,
    "previousDifficulty" INTEGER NOT NULL,
    "recommendedDifficulty" INTEGER NOT NULL,
    "hintLevel" INTEGER NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evidenceSessionCount" INTEGER NOT NULL DEFAULT 0,
    "evidence" JSONB NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adaptation_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "evidence" JSONB NOT NULL,
    "explanation" TEXT NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "assignedUserId" UUID,
    "acknowledgedAt" TIMESTAMPTZ(3),
    "acknowledgedByUserId" UUID,
    "escalatedAt" TIMESTAMPTZ(3),
    "resolvedAt" TIMESTAMPTZ(3),
    "resolutionNote" TEXT,
    "ruleVersion" TEXT NOT NULL DEFAULT 'alerts-1.0.0',
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_dedupe" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "alertId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_dedupe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observations" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "status" "ObservationStatus" NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "isDiagnosis" BOOLEAN NOT NULL DEFAULT false,
    "indicators" JSONB NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_notes" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "visitedAt" TIMESTAMPTZ(3) NOT NULL,
    "summary" TEXT NOT NULL,
    "followUpAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "visit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "language_packs" (
    "id" UUID NOT NULL,
    "language" "Language" NOT NULL,
    "version" INTEGER NOT NULL,
    "translations" JSONB NOT NULL,
    "audioPrompts" JSONB NOT NULL DEFAULT '[]',
    "checksum" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "language_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "actorRole" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'USER',
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "patientId" UUID,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_expiresAt_idx" ON "refresh_tokens"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "caregiver_assignments_patientId_idx" ON "caregiver_assignments"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "caregiver_assignments_userId_patientId_key" ON "caregiver_assignments"("userId", "patientId");

-- CreateIndex
CREATE INDEX "health_worker_assignments_patientId_idx" ON "health_worker_assignments"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "health_worker_assignments_userId_patientId_key" ON "health_worker_assignments"("userId", "patientId");

-- CreateIndex
CREATE UNIQUE INDEX "devices_deviceIdentifier_key" ON "devices"("deviceIdentifier");

-- CreateIndex
CREATE INDEX "devices_patientId_lastSyncAt_idx" ON "devices"("patientId", "lastSyncAt");

-- CreateIndex
CREATE INDEX "pairing_codes_code_expiresAt_idx" ON "pairing_codes"("code", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "pairing_codes_code_patientId_key" ON "pairing_codes"("code", "patientId");

-- CreateIndex
CREATE INDEX "consent_records_patientId_status_idx" ON "consent_records"("patientId", "status");

-- CreateIndex
CREATE INDEX "memory_assets_patientId_category_idx" ON "memory_assets"("patientId", "category");

-- CreateIndex
CREATE INDEX "memory_assets_patientId_createdAt_idx" ON "memory_assets"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "family_contacts_patientId_displayOrder_idx" ON "family_contacts"("patientId", "displayOrder");

-- CreateIndex
CREATE INDEX "medicines_patientId_idx" ON "medicines"("patientId");

-- CreateIndex
CREATE INDEX "routines_patientId_idx" ON "routines"("patientId");

-- CreateIndex
CREATE INDEX "schedules_patientId_active_idx" ON "schedules"("patientId", "active");

-- CreateIndex
CREATE INDEX "schedules_patientId_updatedAt_idx" ON "schedules"("patientId", "updatedAt");

-- CreateIndex
CREATE INDEX "schedule_versions_scheduleId_createdAt_idx" ON "schedule_versions"("scheduleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_versions_scheduleId_version_key" ON "schedule_versions"("scheduleId", "version");

-- CreateIndex
CREATE INDEX "reminder_events_patientId_dueAt_idx" ON "reminder_events"("patientId", "dueAt");

-- CreateIndex
CREATE INDEX "reminder_events_patientId_state_dueAt_idx" ON "reminder_events"("patientId", "state", "dueAt");

-- CreateIndex
CREATE INDEX "reminder_events_scheduleId_dueAt_idx" ON "reminder_events"("scheduleId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_events_deviceId_eventId_key" ON "reminder_events"("deviceId", "eventId");

-- CreateIndex
CREATE INDEX "game_sessions_patientId_playedAt_idx" ON "game_sessions"("patientId", "playedAt");

-- CreateIndex
CREATE INDEX "game_sessions_patientId_gameType_playedAt_idx" ON "game_sessions"("patientId", "gameType", "playedAt");

-- CreateIndex
CREATE UNIQUE INDEX "game_sessions_deviceId_eventId_key" ON "game_sessions"("deviceId", "eventId");

-- CreateIndex
CREATE INDEX "sync_events_patientId_eventTimestamp_idx" ON "sync_events"("patientId", "eventTimestamp");

-- CreateIndex
CREATE INDEX "sync_events_deviceId_receivedAt_idx" ON "sync_events"("deviceId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "sync_events_deviceId_eventId_key" ON "sync_events"("deviceId", "eventId");

-- CreateIndex
CREATE INDEX "difficulty_profiles_patientId_idx" ON "difficulty_profiles"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "difficulty_profiles_patientId_gameType_key" ON "difficulty_profiles"("patientId", "gameType");

-- CreateIndex
CREATE INDEX "adaptation_decisions_patientId_createdAt_idx" ON "adaptation_decisions"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "alerts_patientId_status_createdAt_idx" ON "alerts"("patientId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "alerts_patientId_severity_idx" ON "alerts"("patientId", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "alert_dedupe_patientId_dedupeKey_key" ON "alert_dedupe"("patientId", "dedupeKey");

-- CreateIndex
CREATE INDEX "observations_patientId_createdAt_idx" ON "observations"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "visit_notes_patientId_visitedAt_idx" ON "visit_notes"("patientId", "visitedAt");

-- CreateIndex
CREATE UNIQUE INDEX "language_packs_language_version_key" ON "language_packs"("language", "version");

-- CreateIndex
CREATE INDEX "audit_logs_patientId_createdAt_idx" ON "audit_logs"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_resource_createdAt_idx" ON "audit_logs"("resource", "createdAt");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caregiver_assignments" ADD CONSTRAINT "caregiver_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caregiver_assignments" ADD CONSTRAINT "caregiver_assignments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_worker_assignments" ADD CONSTRAINT "health_worker_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_worker_assignments" ADD CONSTRAINT "health_worker_assignments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pairing_codes" ADD CONSTRAINT "pairing_codes_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pairing_codes" ADD CONSTRAINT "pairing_codes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_assets" ADD CONSTRAINT "memory_assets_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_assets" ADD CONSTRAINT "memory_assets_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "consent_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_contacts" ADD CONSTRAINT "family_contacts_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicines" ADD CONSTRAINT "medicines_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routines" ADD CONSTRAINT "routines_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "medicines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "routines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_versions" ADD CONSTRAINT "schedule_versions_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_events" ADD CONSTRAINT "reminder_events_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_events" ADD CONSTRAINT "reminder_events_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_events" ADD CONSTRAINT "reminder_events_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_events" ADD CONSTRAINT "sync_events_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_events" ADD CONSTRAINT "sync_events_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "difficulty_profiles" ADD CONSTRAINT "difficulty_profiles_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adaptation_decisions" ADD CONSTRAINT "adaptation_decisions_difficultyProfileId_fkey" FOREIGN KEY ("difficultyProfileId") REFERENCES "difficulty_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledgedByUserId_fkey" FOREIGN KEY ("acknowledgedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_notes" ADD CONSTRAINT "visit_notes_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_notes" ADD CONSTRAINT "visit_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
