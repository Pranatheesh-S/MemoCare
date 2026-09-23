/**
 * Canonical enumerations shared by the backend, the ML service contract and the
 * patient application. Kept as const objects + literal unions so they can be
 * used both as runtime values and as types.
 */

export const UserRoles = ["PATIENT", "CAREGIVER", "HEALTH_WORKER", "ADMIN"] as const;
export type UserRole = (typeof UserRoles)[number];

export const GameTypes = [
  "MEMORY_MATCH",
  "ROUTINE_BUILDER",
  "WHO_IS_THIS",
  "MEMORY_LANE",
  "MARKET_MEMORY",
] as const;
export type GameType = (typeof GameTypes)[number];

/** Memory Lane is a calm reminiscence activity and is never scored. */
export const UNSCORED_GAME_TYPES: readonly GameType[] = ["MEMORY_LANE"];

/** The activities the backend and ML personalisation service plan for. */
export const PlanGameTypes = [
  "MEMORY_MATCH",
  "ROUTINE_BUILDER",
  "WHO_IS_THIS",
  "MEMORY_LANE",
  "MARKET_MEMORY",
] as const;
export type PlanGameType = (typeof PlanGameTypes)[number];

export const ReminderStates = [
  "UPCOMING",
  "DUE",
  "ACKNOWLEDGED",
  "SNOOZED",
  "MISSED",
  "HELP_REQUESTED",
] as const;
export type ReminderState = (typeof ReminderStates)[number];

export const ScheduleKinds = [
  "MEDICINE",
  "HYDRATION",
  "MEAL",
  "EXERCISE",
  "APPOINTMENT",
  "SLEEP",
  "FAMILY_CHECK_IN",
] as const;
export type ScheduleKind = (typeof ScheduleKinds)[number];

export const SyncStatuses = ["PENDING", "SYNCING", "SYNCED", "FAILED", "CONFLICT"] as const;
export type SyncStatus = (typeof SyncStatuses)[number];

/** Sync status as recorded on an individual domain row (narrower than the queue). */
export const EventSyncStatuses = ["PENDING", "SYNCED", "FAILED"] as const;
export type EventSyncStatus = (typeof EventSyncStatuses)[number];

export const AlertSeverities = ["INFORMATION", "ATTENTION", "IMPORTANT", "URGENT"] as const;
export type AlertSeverity = (typeof AlertSeverities)[number];

export const AlertTypes = [
  "MISSED_CRITICAL_REMINDER",
  "HELP_REQUESTED",
  "NO_ACTIVITY",
  "SUSTAINED_TREND_CHANGE",
  "DEVICE_NOT_SYNCED",
  "REPEATED_GAME_ABANDONMENT",
] as const;
export type AlertType = (typeof AlertTypes)[number];

export const AlertStatuses = ["OPEN", "ACKNOWLEDGED", "ESCALATED", "RESOLVED"] as const;
export type AlertStatus = (typeof AlertStatuses)[number];

export const MemoryCategories = [
  "MY_FAMILY",
  "MY_HOME",
  "MY_FESTIVALS",
  "MY_PLACES",
  "MY_SONGS",
  "HAPPY_MOMENTS",
] as const;
export type MemoryCategory = (typeof MemoryCategories)[number];

export const MemoryAssetTypes = ["PHOTO", "AUDIO", "STORY"] as const;
export type MemoryAssetType = (typeof MemoryAssetTypes)[number];

/**
 * Languages the app can be shown in. English and Assamese carry the prototype;
 * the rest are the primary language of each North Eastern state's content pack
 * and currently ship as English-fallback placeholders
 * (PLACEHOLDER_PENDING_NATIVE_REVIEW) pending native review.
 *
 *   as  Assamese      mni Meitei / Manipuri   kha Khasi
 *   grt Garo          lus Mizo                nag Nagamese
 *   ne  Nepali        bn  Bengali             trp Kokborok
 *   njz Nyishi (representative for Arunachal Pradesh)
 */
export const SupportedLanguages = [
  "en",
  "as",
  "mni",
  "kha",
  "grt",
  "lus",
  "nag",
  "ne",
  "bn",
  "trp",
  "njz",
] as const;
export type SupportedLanguage = (typeof SupportedLanguages)[number];

/**
 * The eight states of the North Eastern Region. The region is highly diverse
 * and must never be represented as a single culture: each id selects a
 * configurable, community-aware content pack (familiar objects, places,
 * festivals, foods, music, patterns and language) in the patient app.
 */
export const NEStateIds = ["AS", "AR", "MN", "ML", "MZ", "NL", "SK", "TR"] as const;
export type NEStateId = (typeof NEStateIds)[number];

export const NE_STATE_NAMES: Record<NEStateId, string> = {
  AS: "Assam",
  AR: "Arunachal Pradesh",
  MN: "Manipur",
  ML: "Meghalaya",
  MZ: "Mizoram",
  NL: "Nagaland",
  SK: "Sikkim",
  TR: "Tripura",
};

/** Used when a patient profile carries no state — keeps existing demo data valid. */
export const DEFAULT_NE_STATE_ID: NEStateId = "AS";

/**
 * The primary narration/UI language for each state's content pack. Meghalaya and
 * Nagaland are multilingual; the value here is the pack default and communities
 * can select another of the pack's languages.
 */
export const NE_STATE_PRIMARY_LANGUAGE: Record<NEStateId, SupportedLanguage> = {
  AS: "as",
  AR: "njz",
  MN: "mni",
  ML: "kha",
  MZ: "lus",
  NL: "nag",
  SK: "ne",
  TR: "trp",
};

export const SyncEventTypes = [
  "GAME_SESSION",
  "REMINDER_EVENT",
  "HELP_REQUEST",
  "MEMORY_ENGAGEMENT",
  "APP_HEARTBEAT",
] as const;
export type SyncEventType = (typeof SyncEventTypes)[number];

export const ConsentStatuses = ["ACTIVE", "WITHDRAWN"] as const;
export type ConsentStatus = (typeof ConsentStatuses)[number];

export const ObservationStatuses = [
  "STABLE",
  "REVIEW_SUGGESTED",
  "INSUFFICIENT_DATA",
] as const;
export type ObservationStatus = (typeof ObservationStatuses)[number];

/** Difficulty is always clamped into this inclusive range. */
export const MIN_DIFFICULTY = 1;
export const MAX_DIFFICULTY = 4;

/* -------------------------------------------------------------------------- */
/*  AI session planner                                                        */
/* -------------------------------------------------------------------------- */

/** How a hint is delivered. Struggling patients get a spoken hint as well. */
export const HintModalities = ["VISUAL", "VOICE", "BOTH"] as const;
export type HintModality = (typeof HintModalities)[number];

/** A session is shortened to SHORT when fatigue is likely. */
export const SessionLengths = ["SHORT", "STANDARD"] as const;
export type SessionLength = (typeof SessionLengths)[number];

/** Whether to prefer familiar family / household content over the default set. */
export const ContentPreferences = ["FAMILIAR", "STANDARD"] as const;
export type ContentPreference = (typeof ContentPreferences)[number];

/** The part of the day a patient tends to do best in. */
export const TimeOfDayPreferences = [
  "MORNING",
  "AFTERNOON",
  "EVENING",
  "NIGHT",
  "UNKNOWN",
] as const;
export type TimeOfDayPreference = (typeof TimeOfDayPreferences)[number];

export const SessionPlanSources = ["model", "baseline"] as const;
export type SessionPlanSource = (typeof SessionPlanSources)[number];

/**
 * On-screen item-count bounds per activity. Independent of the 1-4 difficulty
 * band: a struggling patient can be given far fewer items (an eight-card game
 * becomes a four-card game) without difficulty itself moving more than a step.
 * The backend and the on-device planner both clamp to exactly these values.
 */
export const SESSION_PLAN_ITEM_BOUNDS: Record<string, readonly [number, number]> = {
  MEMORY_MATCH: [4, 12],
  MARKET_MEMORY: [3, 7],
  WHO_IS_THIS: [2, 4],
  ROUTINE_BUILDER: [3, 6],
  MEMORY_LANE: [0, 0],
};

export const SESSION_PLAN_QUESTION_BOUNDS: Record<string, readonly [number, number]> = {
  MEMORY_MATCH: [2, 6],
  MARKET_MEMORY: [3, 7],
  WHO_IS_THIS: [2, 4],
  ROUTINE_BUILDER: [1, 2],
  MEMORY_LANE: [1, 1],
};

export const SESSION_PLAN_PREVIEW_BOUNDS: readonly [number, number] = [0, 12];

/** Current payload version for append-only sync events. */
export const CURRENT_PAYLOAD_VERSION = 1;
