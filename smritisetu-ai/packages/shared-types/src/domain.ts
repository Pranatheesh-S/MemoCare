import type {
  AlertSeverity,
  AlertStatus,
  AlertType,
  ContentPreference,
  EventSyncStatus,
  GameType,
  HintModality,
  MemoryAssetType,
  MemoryCategory,
  NEStateId,
  ObservationStatus,
  ReminderState,
  ScheduleKind,
  SessionLength,
  SessionPlanSource,
  SupportedLanguage,
  SyncEventType,
  SyncStatus,
  TimeOfDayPreference,
  UserRole,
} from "./enums";

/* -------------------------------------------------------------------------- */
/*  Game sessions                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The append-only record produced locally by every game session. Written to
 * SQLite first, then queued for synchronisation.
 */
export type GameSessionEvent = {
  eventId: string;
  patientId: string;
  deviceId: string;
  gameType: GameType;
  difficulty: number;
  accuracy: number | null;
  responseTimeSeconds: number;
  hintsUsed: number;
  attempts: number;
  completed: boolean;
  abandoned: boolean;
  engagementDurationSeconds: number;
  playedAt: string;
  syncStatus: EventSyncStatus;
};

/** Extra, game-specific detail carried in the sync payload but not scored. */
export type GameSessionDetail = {
  /** Memory Match */
  matchedPairs?: number;
  totalPairs?: number;
  /** Routine Builder */
  correctPositions?: number;
  totalPositions?: number;
  moves?: number;
  /** Who Is This? */
  selectedAnswerId?: string;
  correctAnswerId?: string;
  /** Memory Lane */
  assetsViewed?: string[];
  audioPlayedCount?: number;
  voluntaryCompletion?: boolean;
};

/* -------------------------------------------------------------------------- */
/*  Reminders and schedules                                                   */
/* -------------------------------------------------------------------------- */

export type ScheduleOccurrenceTime = {
  /** 24h local clock time, "HH:mm". */
  timeOfDay: string;
  /** 0 = Sunday … 6 = Saturday. Empty means every day. */
  daysOfWeek: number[];
};

export type Schedule = {
  scheduleId: string;
  patientId: string;
  kind: ScheduleKind;
  titleKey: string;
  titleEn: string;
  titleAs?: string;
  /** Medicine name / meal name / activity label — never a dosage instruction. */
  detail?: string;
  critical: boolean;
  occurrences: ScheduleOccurrenceTime[];
  /** Minutes after the due time before the reminder counts as MISSED. */
  missedAfterMinutes: number;
  snoozeMinutes: number;
  version: number;
  active: boolean;
  updatedAt: string;
};

/**
 * A single reminder instance for a given day. Append-only: state transitions
 * are recorded as new events rather than by mutating history on the server.
 */
export type ReminderEvent = {
  eventId: string;
  patientId: string;
  deviceId: string;
  scheduleId: string;
  scheduleVersion: number;
  kind: ScheduleKind;
  critical: boolean;
  /** ISO instant the reminder was due. */
  dueAt: string;
  state: ReminderState;
  /** ISO instant of the state transition. */
  stateChangedAt: string;
  snoozeCount: number;
  helpRequested: boolean;
  syncStatus: EventSyncStatus;
};

/* -------------------------------------------------------------------------- */
/*  Memory vault                                                              */
/* -------------------------------------------------------------------------- */

export type MemoryAsset = {
  memoryId: string;
  patientId: string;
  category: MemoryCategory;
  assetType: MemoryAssetType;
  titleEn: string;
  titleAs?: string;
  captionEn?: string;
  captionAs?: string;
  /** Story text for STORY assets. */
  storyEn?: string;
  storyAs?: string;
  /** Direct URL or embedded data URI */
  mediaUrl?: string;
  localPath?: string;
  available?: boolean;
  /** Relative path/key; resolved to a signed URL on request. */
  storageKey?: string;
  checksum?: string;
  mimeType?: string;
  sizeBytes?: number;
  /** Family member this asset depicts, for the "Who Is This?" activity. */
  personName?: string;
  relationshipEn?: string;
  relationshipAs?: string;
  /** Voice clip recorded by the person, played after an answer. */
  voiceStorageKey?: string;
  voiceUrl?: string;
  voiceLocalPath?: string;
  consentId: string;
  favourite: boolean;
  createdAt: string;
};

export type ConsentRecord = {
  consentId: string;
  patientId: string;
  purpose: string;
  grantedByUserId: string;
  grantedByName: string;
  grantedAt: string;
  assetScope: string;
  consentVersion: string;
  status: "ACTIVE" | "WITHDRAWN";
  withdrawnAt?: string;
};

/* -------------------------------------------------------------------------- */
/*  Family contacts                                                           */
/* -------------------------------------------------------------------------- */

export type FamilyContact = {
  contactId: string;
  patientId: string;
  name: string;
  relationshipEn: string;
  relationshipAs?: string;
  phoneNumber: string;
  photoStorageKey?: string;
  photoUrl?: string;
  isPrimary: boolean;
  displayOrder: number;
};

/* -------------------------------------------------------------------------- */
/*  Difficulty / personalisation                                              */
/* -------------------------------------------------------------------------- */

export type DifficultyProfile = {
  patientId: string;
  gameType: GameType;
  currentDifficulty: number;
  hintLevel: number;
  reasonCode: string;
  explanation: string;
  modelVersion: string;
  evidenceSessionCount: number;
  updatedAt: string;
};

/**
 * The observations the AI personalisation layer reasons over. Each field is
 * derived from the patient's own history and is never a clinical measure.
 */
export type PatientSignalsSummary = {
  sessionCount: number;
  scoredSessionCount: number;
  accuracyMedian: number | null;
  accuracyRecentMedian: number | null;
  responseTimeMedianSeconds: number | null;
  responseTimeTrend: "UP" | "DOWN" | "STABLE" | "UNKNOWN";
  hintsMedian: number | null;
  repeatedDifficulty: boolean;
  sessionDurationMedianSeconds: number | null;
  sessionsLast24h: number;
  abandonedRecentRate: number | null;
  maxDifficultyCompleted: Record<string, number>;
  preferredActivities: GameType[];
  mostPlayedActivity: GameType | null;
  bestTimeOfDay: TimeOfDayPreference;
  fatigueLikely: boolean;
  familiarContentRecommended: boolean;
};

/**
 * One comfortable plan for the patient's next activity. Produced by the ML
 * service's `/v1/personalisation/plan` (optionally Gemini-refined) and mirrored
 * on the device by the offline planner. Difficulty is still clamped to
 * [{@link MIN_DIFFICULTY}, {@link MAX_DIFFICULTY}] and moves at most one level.
 */
export type SessionPlan = {
  patientId: string;
  /** The activity this plan is for. */
  gameType: GameType;
  /** The activity to actually offer next (may differ, e.g. a calmer one). */
  recommendedGameType: GameType;
  difficulty: number;
  /** On-screen items: cards, answer choices, routine steps. */
  itemCount: number;
  /** Rounds / questions in the session. */
  questionCount: number;
  previewSeconds: number;
  hintLevel: number;
  hintModality: HintModality;
  sessionLength: SessionLength;
  /** Finish with a calm reminiscence activity to end on a good note. */
  endWithCalmActivity: boolean;
  contentPreference: ContentPreference;
  bestTimeOfDay: TimeOfDayPreference;
  /** True when an eligible step up was deliberately withheld for comfort. */
  comfortFirst: boolean;
  reasonCode: string;
  explanation: string;
  confidence: number;
  source: SessionPlanSource;
  signals?: PatientSignalsSummary;
  modelVersion: string;
  /** Always false. SmritiSetu AI is a support tool, never a diagnostic one. */
  isDiagnosis: false;
  updatedAt: string;
};

/* -------------------------------------------------------------------------- */
/*  Alerts and observations                                                   */
/* -------------------------------------------------------------------------- */

export type Alert = {
  alertId: string;
  patientId: string;
  type: AlertType;
  severity: AlertSeverity;
  /** Structured evidence supporting the alert — never a diagnosis. */
  evidence: Record<string, unknown>;
  explanation: string;
  createdAt: string;
  status: AlertStatus;
  assignedUserId?: string | null;
  acknowledgedAt?: string | null;
  acknowledgedByUserId?: string | null;
  resolvedAt?: string | null;
  resolutionNote?: string | null;
  ruleVersion: string;
  /** Stable key used to prevent duplicate alerts for the same open condition. */
  dedupeKey: string;
};

export type Observation = {
  observationId: string;
  patientId: string;
  period: "7d" | "30d";
  status: ObservationStatus;
  reasonCode: string;
  explanation: string;
  isDiagnosis: false;
  indicators: Record<string, unknown>;
  modelVersion: string;
  createdAt: string;
};

/* -------------------------------------------------------------------------- */
/*  Patient profile and offline package                                       */
/* -------------------------------------------------------------------------- */

export type PatientProfile = {
  patientId: string;
  displayName: string;
  /** Affectionate form of address used in greetings, e.g. "Aita". */
  preferredName: string;
  age: number;
  location: string;
  preferredLanguage: SupportedLanguage;
  /**
   * Which North Eastern state's content pack the patient app should load.
   * Optional so profiles created before regional packs stay valid; the app
   * falls back to {@link DEFAULT_NE_STATE_ID}.
   */
  stateId?: NEStateId;
  /**
   * A community within that state (e.g. "meghalaya.khasi", "assam.bodo").
   * Selects community-specific overrides inside the state pack.
   */
  communityId?: string;
  photoUrl?: string;
  reducedMotion: boolean;
  largeText: boolean;
  audioGuidanceEnabled: boolean;
};

export type OfflinePackage = {
  packageVersion: number;
  generatedAt: string;
  patient: PatientProfile;
  schedules: Schedule[];
  memories: MemoryAsset[];
  contacts: FamilyContact[];
  difficultyProfiles: DifficultyProfile[];
  /** Latest AI session plan per activity, so a fresh device starts personalised. */
  sessionPlans?: SessionPlan[];
  languagePack: LanguagePackManifest;
  gameConfig: GameConfig;
  /** Which regional content pack the app should load for this patient. */
  contentPack?: ContentPackRef;
};

export type GameConfig = {
  patientId: string;
  games: Array<{
    gameType: GameType;
    enabled: boolean;
    difficulty: number;
    hintLevel: number;
    /** Seconds the cards are previewed in Memory Match, etc. */
    previewSeconds?: number;
  }>;
  /** Recommended next activity, from the ML engagement endpoint. */
  recommendedGameType: GameType;
  recommendationExplanation: string;
};

/* -------------------------------------------------------------------------- */
/*  Language packs and audio prompts                                          */
/* -------------------------------------------------------------------------- */

export type AudioPrompt = {
  key: string;
  language: SupportedLanguage;
  localAssetPath?: string;
  remoteAssetUrl?: string;
  checksum?: string;
};

export type LanguagePackManifest = {
  language: SupportedLanguage;
  version: number;
  /** Flat translation map, key -> string. */
  translations: Record<string, string>;
  audioPrompts: AudioPrompt[];
};

/* -------------------------------------------------------------------------- */
/*  Regional content packs                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The shape of a state / community content pack. The full packs are pure data
 * bundled inside the patient app (apps/patient-mobile/src/content); the backend
 * only records which pack a patient uses (PatientProfile.stateId /
 * communityId) and echoes it here so a caregiver dashboard can show it.
 */
export type ContentPackRef = {
  stateId: NEStateId;
  stateName: string;
  communityId?: string;
  /** Primary narration/UI language for this pack. */
  primaryLanguage: SupportedLanguage;
};

/** A picture card in "Where Did I Keep It?" — an object and the place it lives. */
export type CulturalObject = {
  id: string;
  /** i18n key for the object label, e.g. "object.gamosa". */
  labelKey: string;
  labelEn: string;
  /** Label in the pack's primary language. */
  labelLocal: string;
  illustrationId: string;
  place: {
    labelEn: string;
    labelLocal: string;
    illustrationId: string;
  };
  /** Objects that look alike, grouped only for the hardest level. */
  similarGroup?: string;
};

/** A named piece of reminiscence material: a place, festival, food, song, pattern. */
export type CulturalReference = {
  id: string;
  labelEn: string;
  labelLocal: string;
  /** One short, respectful sentence a caregiver or narrator can read aloud. */
  noteEn?: string;
};

export type ContentPackLanguage = {
  code: SupportedLanguage;
  labelEn: string;
  /** Endonym, e.g. "অসমীয়া", "মেইতেই লোন". */
  labelNative: string;
};

export type ContentPackCommunity = {
  id: string;
  labelEn: string;
  noteEn?: string;
};

export type ContentPack = {
  stateId: NEStateId;
  stateName: string;
  /** One neutral sentence framing the pack — never a single-culture claim. */
  blurbEn: string;
  languages: ContentPackLanguage[];
  communities: ContentPackCommunity[];
  matchObjects: CulturalObject[];
  places: CulturalReference[];
  festivals: CulturalReference[];
  foods: CulturalReference[];
  music: CulturalReference[];
  patterns: CulturalReference[];
  /** Every illustration id the pack references; must resolve in the app registry. */
  illustrationIds: string[];
  /** Notes on cultural sensitivity for anyone extending the pack. */
  culturalNotes?: string[];
};

/* -------------------------------------------------------------------------- */
/*  Sync                                                                      */
/* -------------------------------------------------------------------------- */

export type SyncQueueItem = {
  eventId: string;
  eventType: string;
  payload: string;
  patientId: string;
  deviceId: string;
  localCreatedAt: string;
  retryCount: number;
  lastAttemptAt?: string;
  status: SyncStatus;
};

export type SyncEventEnvelope = {
  eventId: string;
  patientId: string;
  deviceId: string;
  eventType: SyncEventType;
  eventTimestamp: string;
  payloadVersion: number;
  localCreatedAt: string;
  payload: Record<string, unknown>;
};

export type SyncResponse = {
  accepted: string[];
  duplicates: string[];
  rejected: Array<{
    eventId: string;
    code: string;
    message: string;
  }>;
  conflicts: Array<{
    eventId: string;
    serverVersion: number;
    clientVersion: number;
    resolutionRequired: boolean;
  }>;
  serverTime: string;
  nextPackageVersion?: number;
};

export type SyncStatusResponse = {
  deviceId: string;
  patientId: string;
  lastSyncAt: string | null;
  acceptedEventCount: number;
  pendingServerActions: number;
  currentPackageVersion: number;
  serverTime: string;
};

/* -------------------------------------------------------------------------- */
/*  Auth                                                                      */
/* -------------------------------------------------------------------------- */

export type AuthUser = {
  userId: string;
  email: string;
  fullName: string;
  role: UserRole;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type LoginResponse = {
  user: AuthUser;
  tokens: AuthTokens;
};

export type DevicePairingResponse = {
  deviceId: string;
  deviceToken: string;
  patientId: string;
  patient: PatientProfile;
  packageVersion: number;
  expiresAt: string;
};

/* -------------------------------------------------------------------------- */
/*  API error envelope                                                        */
/* -------------------------------------------------------------------------- */

export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
};

export type ApiSuccess<T> = {
  data: T;
  requestId?: string;
};

/* -------------------------------------------------------------------------- */
/*  Trends                                                                    */
/* -------------------------------------------------------------------------- */

export type TrendIndicator = {
  name: string;
  current: number | null;
  baseline: number | null;
  direction: "UP" | "DOWN" | "STABLE" | "UNKNOWN";
  sampleSize: number;
};

export type TrendsResponse = {
  patientId: string;
  period: "7d" | "30d";
  status: ObservationStatus;
  reasonCode: string;
  explanation: string;
  isDiagnosis: false;
  indicators: TrendIndicator[];
  sessionCount: number;
  modelVersion: string;
  generatedAt: string;
};
