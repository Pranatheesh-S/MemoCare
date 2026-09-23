import { create } from "zustand";
import type {
  AudioPrompt,
  FamilyContact,
  GameType,
  NEStateId,
  PatientProfile,
  SupportedLanguage,
} from "@smritisetu/shared-types";

export type AppPhase = "INITIALISING" | "UNPAIRED" | "PAIRED";

type AppState = {
  phase: AppPhase;
  databaseReady: boolean;
  databaseError: string | null;

  patient: PatientProfile | null;
  patientId: string | null;
  deviceId: string | null;
  packageVersion: number;

  /** Which regional content pack the app should load. Null -> default (Assam). */
  stateId: NEStateId | null;
  communityId: string | null;

  language: SupportedLanguage;
  downloadedTranslations: Record<string, string> | null;
  audioPrompts: AudioPrompt[];

  largeText: boolean;
  reducedMotion: boolean;
  audioGuidanceEnabled: boolean;
  /** Whether a screen narrates itself on arrival, or waits to be asked. */
  autoNarrationEnabled: boolean;
  /** How fast narration is played back. Slow suits someone who needs longer. */
  voiceSpeed: "normal" | "slow";

  isOnline: boolean;
  lastSyncAt: string | null;
  pendingSyncCount: number;
  syncing: boolean;
  syncError: string | null;

  contacts: FamilyContact[];
  recommendedGame: GameType;
  recommendationExplanation: string;

  setPhase: (phase: AppPhase) => void;
  setDatabaseReady: (ready: boolean, error?: string | null) => void;
  setSession: (input: {
    patient: PatientProfile;
    deviceId: string;
    packageVersion: number;
  }) => void;
  setPatient: (patient: PatientProfile) => void;
  setLanguage: (language: SupportedLanguage) => void;
  setDownloadedTranslations: (translations: Record<string, string> | null, prompts?: AudioPrompt[]) => void;
  setAccessibility: (
    changes: Partial<Pick<AppState, "largeText" | "reducedMotion" | "audioGuidanceEnabled" | "autoNarrationEnabled" | "voiceSpeed">>,
  ) => void;
  setOnline: (online: boolean) => void;
  setSyncState: (state: Partial<Pick<AppState, "lastSyncAt" | "pendingSyncCount" | "syncing" | "syncError">>) => void;
  setContacts: (contacts: FamilyContact[]) => void;
  setRecommendation: (gameType: GameType, explanation: string) => void;
  reset: () => void;
};

const initialState = {
  phase: "INITIALISING" as AppPhase,
  databaseReady: false,
  databaseError: null,
  patient: null,
  patientId: null,
  deviceId: null,
  packageVersion: 0,
  stateId: null as NEStateId | null,
  communityId: null as string | null,
  language: "en" as SupportedLanguage,
  downloadedTranslations: null,
  audioPrompts: [] as AudioPrompt[],
  largeText: true,
  reducedMotion: false,
  audioGuidanceEnabled: true,
  autoNarrationEnabled: true,
  voiceSpeed: "normal" as "normal" | "slow",
  isOnline: true,
  lastSyncAt: null,
  pendingSyncCount: 0,
  syncing: false,
  syncError: null,
  contacts: [] as FamilyContact[],
  recommendedGame: "MEMORY_MATCH" as GameType,
  recommendationExplanation: "",
};

/**
 * Local application state only. Anything that must survive a restart lives in
 * SQLite; this store is the in-memory view of it.
 */
export const useAppStore = create<AppState>((set) => ({
  ...initialState,

  setPhase: (phase) => set({ phase }),

  setDatabaseReady: (ready, error = null) => set({ databaseReady: ready, databaseError: error }),

  setSession: ({ patient, deviceId, packageVersion }) =>
    set({
      phase: "PAIRED",
      patient,
      patientId: patient.patientId,
      deviceId,
      packageVersion,
      stateId: patient.stateId ?? null,
      communityId: patient.communityId ?? null,
      largeText: patient.largeText,
      reducedMotion: patient.reducedMotion,
      audioGuidanceEnabled: patient.audioGuidanceEnabled,
    }),

  setPatient: (patient) =>
    set({
      patient,
      patientId: patient.patientId,
      stateId: patient.stateId ?? null,
      communityId: patient.communityId ?? null,
    }),

  setLanguage: (language) => set({ language }),

  setDownloadedTranslations: (translations, prompts) =>
    set((state) => ({
      downloadedTranslations: translations,
      audioPrompts: prompts ?? state.audioPrompts,
    })),

  setAccessibility: (changes) => set(changes),

  setOnline: (isOnline) => set({ isOnline }),

  setSyncState: (state) => set(state),

  setContacts: (contacts) => set({ contacts }),

  setRecommendation: (recommendedGame, recommendationExplanation) =>
    set({ recommendedGame, recommendationExplanation }),

  reset: () => set(initialState),
}));
