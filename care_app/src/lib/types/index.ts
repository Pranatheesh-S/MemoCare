/** Shared data model — consume only; backend owns persistence. */

export type UserRole =
  | "caregiver"
  | "healthcare_worker"
  | "admin"
  | "system"
  | "clinician";

export type UserStatus = "active" | "inactive" | "suspended";

export interface User {
  id: string;
  role: UserRole;
  name: string;
  contact: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AccessibilitySettings {
  largeText: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  voiceGuidance: boolean;
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

export interface PatientProfile {
  id: string;
  displayName: string;
  age: number;
  dateOfBirth?: string;
  language: string;
  location: {
    village?: string;
    district?: string;
    state?: string;
  };
  accessibility: AccessibilitySettings;
  emergencyContacts: EmergencyContact[];
  deviceStatus: "unpaired" | "paired" | "offline" | "syncing";
  lastActivityAt?: string;
  lastSyncAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Assignment {
  patientId: string;
  userId: string;
  role: "caregiver" | "healthcare_worker";
  activeFrom: string;
  activeTo?: string;
}

export type ConsentStatus = "granted" | "withdrawn" | "pending";

export interface ConsentRecord {
  id: string;
  subject: string;
  purpose: string;
  assetOrCategory: string;
  grantedBy: string;
  grantedAt: string;
  status: ConsentStatus;
}

export type ScheduleType =
  | "medicine"
  | "hydration"
  | "meal"
  | "appointment"
  | "activity";

export interface Schedule {
  id: string;
  patientId: string;
  type: ScheduleType;
  label: string;
  dosageText?: string;
  recurrence: string;
  critical: boolean;
  version: number;
  paused: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ReminderState =
  | "acknowledged"
  | "snoozed"
  | "missed"
  | "help_requested";

export interface ReminderEvent {
  eventId: string;
  scheduleId: string;
  state: ReminderState;
  occurredAt: string;
  deviceId: string;
}

export type GameType =
  | "MEMORY_MATCH"
  | "ROUTINE_BUILDER"
  | "WHO_IS_THIS"
  | "MEMORY_LANE";

export interface GameSessionMetrics {
  accuracy: number;
  responseTimeSeconds: number;
  hintsUsed: number;
  completed: boolean;
  abandoned?: boolean;
}

export interface GameSession {
  eventId: string;
  patientId: string;
  gameType: GameType;
  difficulty: number;
  metrics: GameSessionMetrics;
  playedAt: string;
}

export interface DifficultyProfile {
  gameType: GameType;
  level: number;
  hintPolicy: string;
  reason: string;
  ruleVersion: string;
}

export type MemoryAssetType = "photo" | "audio";

export interface MemoryLabels {
  person?: string;
  relationship?: string;
  story?: string;
  place?: string;
  festival?: string;
}

export interface MemoryAsset {
  id: string;
  patientId: string;
  type: MemoryAssetType;
  objectKey: string;
  labels: MemoryLabels;
  consentId: string;
  checksum: string;
  createdAt: string;
}

export type AlertSeverity = "info" | "attention" | "urgent";
export type AlertStatus =
  | "open"
  | "acknowledged"
  | "escalated"
  | "resolved";

export interface AlertEvidence {
  summary: string;
  metricKeys: string[];
  periodDays: number;
  relatedEventIds?: string[];
}

export interface Alert {
  id: string;
  patientId: string;
  type: string;
  severity: AlertSeverity;
  evidence: AlertEvidence;
  status: AlertStatus;
  assignee?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  escalatedAt?: string;
  escalatedBy?: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export type AuthorRole =
  | "system"
  | "caregiver"
  | "healthcare_worker"
  | "clinician";

export interface Observation {
  id: string;
  patientId: string;
  authorRole: AuthorRole;
  authorId: string;
  authorName: string;
  source: string;
  text: string;
  followUpAt?: string;
  createdAt: string;
}

export interface VisitNote {
  id: string;
  patientId: string;
  authorId: string;
  authorName: string;
  mood: string;
  communicationOrientation: string;
  routineDifficulty: string;
  concernFlag: boolean;
  followUpAt?: string;
  createdAt: string;
}

export interface TrendPoint {
  date: string;
  participation: number;
  accuracy: number;
  responseTimeSeconds: number;
  hintsUsed: number;
  abandonmentRate: number;
  reminderAdherence: number;
}

export interface TrendSummary {
  patientId: string;
  periodDays: 7 | 30;
  points: TrendPoint[];
  plainLanguageObservations: string[];
}

export interface DashboardOverview {
  patientId: string;
  displayName: string;
  deviceStatus: PatientProfile["deviceStatus"];
  lastActivityAt?: string;
  lastSyncAt?: string;
  gamesCompletedToday: number;
  reminderAdherence7d: number;
  openAlertCount: number;
}

export interface PairingCodeResponse {
  patientId: string;
  pairingCode: string;
  expiresAt: string;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  objectKey: string;
  expiresAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthSession {
  user: User;
  tokens: AuthTokens;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  correlationId?: string;
}
