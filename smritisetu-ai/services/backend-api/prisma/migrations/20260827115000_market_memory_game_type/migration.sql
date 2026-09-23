-- Market Memory is a shopping-list variant of Memory Match. It is a scored
-- activity like the others, so it becomes a first-class GameType (sessions
-- persist, adaptation and the AI session planner cover it).

-- AlterEnum
ALTER TYPE "GameType" ADD VALUE 'MARKET_MEMORY';
