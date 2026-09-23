import type { GameType } from "@smritisetu/shared-types";

export type AdaptationSession = {
  gameType: string;
  difficulty: number;
  accuracy: number | null;
  hintsUsed: number;
  completed: boolean;
  abandoned: boolean;
  responseTimeSeconds: number;
  engagementDurationSeconds: number;
  playedAt: string;
};

export type AdaptationDecision = {
  recommendedDifficulty: number;
  hintLevel: number;
  recommendedGameType: GameType;
  reasonCode: string;
  explanation: string;
  confidence: number;
  evidenceSessionCount: number;
  modelVersion: string;
  isDiagnosis: false;
};

export type EngagementDecision = {
  recommendedGameType: GameType;
  reasonCode: string;
  explanation: string;
  modelVersion: string;
};
