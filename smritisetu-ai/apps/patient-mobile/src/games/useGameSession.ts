import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ContentPreference,
  GameSessionDetail,
  GameType,
  HintModality,
  SessionLength,
} from "@smritisetu/shared-types";
import { useAppStore } from "../store/appStore";
import { applyOnDeviceAdaptation } from "../adaptation/apply";
import { applyOnDeviceSessionPlan } from "../adaptation/applyPlan";
import { DifficultyRepository, SessionPlanRepository } from "../db/repositories";
import { eventQueue } from "../sync/eventQueue";
import { HINTS_BY_DIFFICULTY, PREVIEW_SECONDS_BY_DIFFICULTY } from "./gameContent";

export type GameConfiguration = {
  difficulty: number;
  hintLevel: number;
  hintsAllowed: number;
  previewSeconds: number;
  /** AI session-plan fields. Fall back to difficulty-derived defaults. */
  itemCount: number | null;
  questionCount: number | null;
  hintModality: HintModality;
  sessionLength: SessionLength;
  endWithCalmActivity: boolean;
  contentPreference: ContentPreference;
  planReasonCode: string | null;
  loaded: boolean;
};

const BASE_CONFIG: GameConfiguration = {
  difficulty: 1,
  hintLevel: 1,
  hintsAllowed: HINTS_BY_DIFFICULTY[1],
  previewSeconds: PREVIEW_SECONDS_BY_DIFFICULTY[1],
  itemCount: null,
  questionCount: null,
  hintModality: "VISUAL",
  sessionLength: "STANDARD",
  endWithCalmActivity: false,
  contentPreference: "STANDARD",
  planReasonCode: null,
  loaded: false,
};

/**
 * Loads the patient's stored difficulty and AI session plan for one activity
 * and records the resulting session.
 *
 * Both come from SQLite, so they are available offline. After each scored round
 * the on-device model writes the next difficulty and the on-device planner
 * writes the next plan; a synced server plan (which may be Gemini-refined)
 * overwrites the local one.
 */
export function useGameSession(gameType: GameType) {
  const patientId = useAppStore((state) => state.patientId);
  const deviceId = useAppStore((state) => state.deviceId);

  const [config, setConfig] = useState<GameConfiguration>(BASE_CONFIG);

  // Guards against a session being written twice by a double tap on Finish or
  // by an unmount racing an explicit save.
  const recorded = useRef(false);

  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;

    void (async () => {
      const [profile, plan] = await Promise.all([
        new DifficultyRepository().get(patientId, gameType),
        new SessionPlanRepository().get(patientId, gameType),
      ]);
      if (cancelled) return;
      const difficulty = plan?.difficulty ?? profile?.currentDifficulty ?? 1;
      const hintLevel = plan?.hintLevel ?? profile?.hintLevel ?? 1;
      setConfig({
        difficulty,
        hintLevel,
        hintsAllowed: Math.max(HINTS_BY_DIFFICULTY[difficulty] ?? 2, hintLevel),
        previewSeconds:
          plan?.previewSeconds ??
          profile?.previewSeconds ??
          PREVIEW_SECONDS_BY_DIFFICULTY[difficulty] ??
          6,
        itemCount: plan?.itemCount ?? null,
        questionCount: plan?.questionCount ?? null,
        hintModality: plan?.hintModality ?? "VISUAL",
        sessionLength: plan?.sessionLength ?? "STANDARD",
        endWithCalmActivity: plan?.endWithCalmActivity ?? false,
        contentPreference: plan?.contentPreference ?? "STANDARD",
        planReasonCode: plan?.reasonCode ?? null,
        loaded: true,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [gameType, patientId]);

  const recordSession = useCallback(
    async (
      metrics: {
        accuracy: number | null;
        responseTimeSeconds: number;
        hintsUsed: number;
        attempts: number;
        completed: boolean;
        abandoned: boolean;
        engagementDurationSeconds: number;
      },
      detail?: GameSessionDetail,
    ): Promise<string | null> => {
      if (!patientId || !deviceId) return null;
      if (recorded.current) return null;
      recorded.current = true;

      const playedAt = new Date().toISOString();
      const eventId = await eventQueue.recordGameSession(
        {
          patientId,
          deviceId,
          gameType,
          difficulty: config.difficulty,
          playedAt,
          ...metrics,
        },
        detail,
      );

      // If this device paired with a caregiver's Firebase code, mirror the
      // session to Firestore for the caregiver app's reports. Fire-and-forget.
      void import("../firebase/sessionSync").then(({ recordFirebaseSession }) =>
        recordFirebaseSession(patientId, eventId, {
          gameType,
          difficulty: config.difficulty,
          playedAt,
          ...metrics,
        }),
      );

      const next = await applyOnDeviceAdaptation({
        patientId,
        gameType,
        currentDifficulty: config.difficulty,
      });

      const nextDifficulty = next?.recommendedDifficulty ?? config.difficulty;
      const plan = await applyOnDeviceSessionPlan({
        patientId,
        gameType,
        currentDifficulty: nextDifficulty,
      });

      if (next || plan) {
        setConfig((current) => ({
          ...current,
          difficulty: nextDifficulty,
          hintLevel: plan?.hintLevel ?? next?.hintLevel ?? current.hintLevel,
          hintsAllowed: next?.hintsAllowed ?? current.hintsAllowed,
          previewSeconds: plan?.previewSeconds ?? next?.previewSeconds ?? current.previewSeconds,
          itemCount: plan?.itemCount ?? current.itemCount,
          questionCount: plan?.questionCount ?? current.questionCount,
          hintModality: plan?.hintModality ?? current.hintModality,
          sessionLength: plan?.sessionLength ?? current.sessionLength,
          endWithCalmActivity: plan?.endWithCalmActivity ?? current.endWithCalmActivity,
          contentPreference: plan?.contentPreference ?? current.contentPreference,
          planReasonCode: plan?.reasonCode ?? current.planReasonCode,
          loaded: true,
        }));
      }

      return eventId;
    },
    [config.difficulty, deviceId, gameType, patientId],
  );

  /** Lets a screen start a fresh round after "Play again". */
  const resetRecording = useCallback(() => {
    recorded.current = false;
  }, []);

  return { config, recordSession, resetRecording, hasRecorded: () => recorded.current };
}
