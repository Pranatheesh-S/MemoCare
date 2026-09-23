-- AI-based personalisation: one comfortable plan per activity (game to offer,
-- item and question counts, preview time, hint level and modality, session
-- length, calm follow-up, content preference). The deterministic rules set the
-- difficulty ceiling and hint floor; an optional Gemini pass may only soften
-- the plan. Never a clinical claim.

-- CreateTable
CREATE TABLE "session_plans" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "gameType" "GameType" NOT NULL,
    "recommendedGameType" "GameType" NOT NULL,
    "difficulty" INTEGER NOT NULL DEFAULT 1,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "questionCount" INTEGER NOT NULL DEFAULT 1,
    "previewSeconds" INTEGER NOT NULL DEFAULT 0,
    "hintLevel" INTEGER NOT NULL DEFAULT 1,
    "hintModality" TEXT NOT NULL DEFAULT 'VISUAL',
    "sessionLength" TEXT NOT NULL DEFAULT 'STANDARD',
    "endWithCalmActivity" BOOLEAN NOT NULL DEFAULT false,
    "contentPreference" TEXT NOT NULL DEFAULT 'STANDARD',
    "bestTimeOfDay" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "comfortFirst" BOOLEAN NOT NULL DEFAULT false,
    "reasonCode" TEXT NOT NULL DEFAULT 'INITIAL',
    "explanation" TEXT NOT NULL DEFAULT 'Starting from the current level.',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'baseline',
    "signals" JSONB,
    "modelVersion" TEXT NOT NULL DEFAULT 'personalisation-rules-1.0.0',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "session_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_plans_patientId_idx" ON "session_plans"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "session_plans_patientId_gameType_key" ON "session_plans"("patientId", "gameType");

-- AddForeignKey
ALTER TABLE "session_plans" ADD CONSTRAINT "session_plans_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
