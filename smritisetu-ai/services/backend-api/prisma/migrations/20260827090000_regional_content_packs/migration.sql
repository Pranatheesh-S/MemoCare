-- Regional content packs: the North Eastern Region is not one culture. A patient
-- profile now selects a state (and optional community) content pack, and the app
-- can be narrated in each state's primary language.

-- CreateEnum
CREATE TYPE "NEState" AS ENUM ('AS', 'AR', 'MN', 'ML', 'MZ', 'NL', 'SK', 'TR');

-- AlterEnum
ALTER TYPE "Language" ADD VALUE 'mni';
ALTER TYPE "Language" ADD VALUE 'kha';
ALTER TYPE "Language" ADD VALUE 'grt';
ALTER TYPE "Language" ADD VALUE 'lus';
ALTER TYPE "Language" ADD VALUE 'nag';
ALTER TYPE "Language" ADD VALUE 'ne';
ALTER TYPE "Language" ADD VALUE 'bn';
ALTER TYPE "Language" ADD VALUE 'trp';
ALTER TYPE "Language" ADD VALUE 'njz';

-- AlterTable
ALTER TABLE "patient_profiles" ADD COLUMN "stateId" "NEState";
ALTER TABLE "patient_profiles" ADD COLUMN "communityId" TEXT;
