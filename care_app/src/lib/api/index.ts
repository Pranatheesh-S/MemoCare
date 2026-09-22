/**
 * Single API facade — swap mocks for live backend by setting
 * NEXT_PUBLIC_USE_MOCKS=false and NEXT_PUBLIC_API_BASE_URL.
 *
 * The backend's own contract (roles, enum casing, id field names, alert
 * evidence shape) does not match this dashboard's types — mapping between
 * the two lives here, once per field, rather than reshaping either contract.
 *
 * Not every screen is wired live yet. Patients, the overview card, and the
 * alert centre are — that is the reviewed, verified path. Schedules, trends,
 * memories, consents, observations, visit notes and settings stay on
 * `mockApi` regardless of the flag below: several of those either have no
 * matching backend route at all, or a real shape mismatch (the schedule
 * model in particular) that needs a product decision, not a guess. Each is
 * marked at its call site.
 */
import type {
  Alert,
  AlertSeverity,
  AlertStatus,
  Assignment,
  AuthSession,
  AuthTokens,
  ConsentRecord,
  DashboardOverview,
  MemoryAsset,
  MemoryLabels,
  Observation,
  PairingCodeResponse,
  PatientProfile,
  Schedule,
  ScheduleType,
  TrendSummary,
  UploadUrlResponse,
  User,
  UserRole,
  VisitNote,
} from "@/lib/types";
import {
  getStoredTokens,
  httpRequest,
  setStoredTokens,
  setStoredUserJson,
  mocksEnabled,
} from "./client";
import { mockApi } from "./mocks";

function token(): string | undefined {
  return getStoredTokens()?.accessToken;
}

async function withLiveRefresh<T>(fn: (access: string) => Promise<T>): Promise<T> {
  const tokens = getStoredTokens();
  if (!tokens) {
    throw Object.assign(new Error("Not signed in"), {
      code: "UNAUTHORIZED",
      status: 401,
    });
  }
  try {
    return await fn(tokens.accessToken);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status !== 401) throw err;
    const refreshed = await httpRequest<BackendAuthSession>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    const mapped = mapAuthSession(refreshed);
    setStoredTokens(mapped.tokens);
    setStoredUserJson(JSON.stringify(mapped.user));
    return fn(mapped.tokens.accessToken);
  }
}

/* -------------------------------------------------------------------------- */
/*  Mapping: backend contract -> this dashboard's types                       */
/* -------------------------------------------------------------------------- */

type BackendRole = "PATIENT" | "CAREGIVER" | "HEALTH_WORKER" | "ADMIN";

function mapRole(role: BackendRole): UserRole {
  switch (role) {
    case "CAREGIVER":
      return "caregiver";
    case "HEALTH_WORKER":
      return "healthcare_worker";
    case "ADMIN":
      return "admin";
    default:
      return "system";
  }
}

type BackendAuthSession = {
  user: { userId: string; email: string; fullName: string; role: BackendRole };
  tokens: AuthTokens;
};

function mapAuthSession(raw: BackendAuthSession): AuthSession {
  const user: User = {
    id: raw.user.userId,
    role: mapRole(raw.user.role),
    name: raw.user.fullName,
    contact: raw.user.email,
    status: "active",
    // Login does not return account timestamps; not shown anywhere today.
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return { user, tokens: raw.tokens };
}

type BackendPatient = {
  patientId: string;
  displayName: string;
  preferredName: string;
  age: number;
  location: string;
  preferredLanguage: string;
  photoUrl?: string;
  reducedMotion: boolean;
  largeText: boolean;
  audioGuidanceEnabled: boolean;
  packageVersion: number;
};

function mapPatient(p: BackendPatient): PatientProfile {
  const now = new Date().toISOString();
  return {
    id: p.patientId,
    displayName: p.displayName,
    age: p.age,
    language: p.preferredLanguage,
    location: { state: p.location },
    accessibility: {
      largeText: p.largeText,
      highContrast: false,
      reducedMotion: p.reducedMotion,
      voiceGuidance: p.audioGuidanceEnabled,
    },
    emergencyContacts: [],
    // The plain patient record carries no live device signal; the overview
    // endpoint is the source of truth for that and is fetched separately.
    deviceStatus: "unpaired",
    createdAt: now,
    updatedAt: now,
  };
}

type BackendOverview = {
  patientId: string;
  displayName: string;
  deviceStatus: "unpaired" | "paired" | "offline";
  lastActivityAt?: string;
  lastSyncAt?: string;
  gamesCompletedToday: number;
  reminderAdherence7d: number;
  openAlertCount: number;
};

function mapOverview(o: BackendOverview): DashboardOverview {
  // deviceStatus values are already a compatible subset — the backend never
  // emits "syncing", which is a transient client-side state anyway.
  return { ...o };
}

type BackendAssignment = { patientId: string; userId: string; role: "CAREGIVER" | "HEALTH_WORKER"; activeFrom: string; activeTo?: string };

function mapAssignment(a: BackendAssignment): Assignment {
  return {
    patientId: a.patientId,
    userId: a.userId,
    role: a.role === "CAREGIVER" ? "caregiver" : "healthcare_worker",
    activeFrom: a.activeFrom,
    activeTo: a.activeTo,
  };
}

type BackendAlert = {
  alertId: string;
  patientId: string;
  type: string;
  severity: "INFORMATION" | "ATTENTION" | "IMPORTANT" | "URGENT";
  evidence: Record<string, unknown>;
  explanation: string;
  createdAt: string;
  status: "OPEN" | "ACKNOWLEDGED" | "ESCALATED" | "RESOLVED";
  assignedUserId: string | null;
  acknowledgedAt: string | null;
  acknowledgedByUserId: string | null;
  escalatedAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
};

// The dashboard's three-step severity has no slot for IMPORTANT; it reads as
// urgent rather than merely "attention", matching this product's own escalation
// ladder (INFORMATION < ATTENTION < IMPORTANT < URGENT).
function mapSeverity(s: BackendAlert["severity"]): AlertSeverity {
  if (s === "INFORMATION") return "info";
  if (s === "ATTENTION") return "attention";
  return "urgent";
}

function mapAlertStatus(s: BackendAlert["status"]): AlertStatus {
  return s.toLowerCase() as AlertStatus;
}

function mapAlert(a: BackendAlert): Alert {
  return {
    id: a.alertId,
    patientId: a.patientId,
    type: a.type,
    severity: mapSeverity(a.severity),
    // Real evidence is a free-form object that differs per alert type; the
    // backend's own plain-language explanation (safety-checked, non-clinical)
    // is exactly the "summary" this card wants, so it is reused rather than
    // guessing at a synthetic one.
    evidence: {
      summary: a.explanation,
      metricKeys: Object.keys(a.evidence ?? {}),
      periodDays: typeof a.evidence?.periodDays === "number" ? (a.evidence.periodDays as number) : 7,
    },
    status: mapAlertStatus(a.status),
    assignee: a.assignedUserId ?? undefined,
    createdAt: a.createdAt,
    updatedAt: a.resolvedAt ?? a.escalatedAt ?? a.acknowledgedAt ?? a.createdAt,
    acknowledgedAt: a.acknowledgedAt ?? undefined,
    // The Alert row tracks who acknowledged it, but not who escalated or
    // resolved it (only the audit log does, which is not exposed here) — an
    // id is shown rather than a name for the one actor that is tracked.
    acknowledgedBy: a.acknowledgedByUserId ?? undefined,
    escalatedAt: a.escalatedAt ?? undefined,
    resolvedAt: a.resolvedAt ?? undefined,
  };
}

export const api = {
  async login(email: string, password: string): Promise<AuthSession> {
    if (mocksEnabled()) return mockApi.login(email, password);
    const raw = await httpRequest<BackendAuthSession>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    return mapAuthSession(raw);
  },

  async refresh(refreshToken: string): Promise<AuthSession> {
    if (mocksEnabled()) return mockApi.refresh(refreshToken);
    const raw = await httpRequest<BackendAuthSession>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
    return mapAuthSession(raw);
  },

  // The dashboard generates a code for a patient; a phone redeems one. These
  // are different backend endpoints — /devices/pair is the phone's, and this
  // was calling it with the wrong semantics entirely.
  async pairDevice(patientId: string): Promise<PairingCodeResponse> {
    if (mocksEnabled()) return mockApi.pairDevice(token(), patientId);
    return withLiveRefresh(async (access) => {
      const raw = await httpRequest<{ pairingCode: string; expiresAt: string }>(
        `/patients/${patientId}/pairing-codes`,
        { method: "POST", accessToken: access },
      );
      return { patientId, ...raw };
    });
  },

  async listPatients(): Promise<PatientProfile[]> {
    if (mocksEnabled()) return mockApi.listPatients(token());
    return withLiveRefresh(async (access) => {
      const raw = await httpRequest<BackendPatient[]>("/patients", { accessToken: access });
      return raw.map(mapPatient);
    });
  },

  async getPatient(patientId: string): Promise<PatientProfile> {
    if (mocksEnabled()) return mockApi.getPatient(token(), patientId);
    return withLiveRefresh(async (access) => {
      const raw = await httpRequest<BackendPatient>(`/patients/${patientId}`, { accessToken: access });
      return mapPatient(raw);
    });
  },

  // No backend endpoint creates a patient today — only the seed script does.
  // Building patient creation (plus the consent flow it implies) is real new
  // backend scope, not a mapping fix, so this stays mocked either way.
  async createPatient(input: {
    displayName: string;
    age: number;
    language: string;
    village?: string;
    district?: string;
    state?: string;
  }): Promise<PatientProfile> {
    return mockApi.createPatient(token(), input);
  },

  // The backend's PATCH /patients/:id accepts a flat accessibility shape and
  // has nowhere to put emergencyContacts at all — reconciling that is the
  // same "needs a conversation" item as the schedule model below.
  async updatePatient(
    patientId: string,
    patch: Partial<
      Pick<
        PatientProfile,
        "displayName" | "language" | "accessibility" | "emergencyContacts" | "location"
      >
    >,
  ): Promise<PatientProfile> {
    return mockApi.updatePatient(token(), patientId, patch);
  },

  async getAssignments(patientId: string): Promise<Assignment[]> {
    if (mocksEnabled()) return mockApi.getAssignments(token(), patientId);
    return withLiveRefresh(async (access) => {
      const raw = await httpRequest<BackendAssignment[]>(`/patients/${patientId}/assignments`, {
        accessToken: access,
      });
      return raw.map(mapAssignment);
    });
  },

  // Not reconciled today — stays on mocks alongside schedules and trends.
  async getConsents(patientId: string): Promise<ConsentRecord[]> {
    return mockApi.getConsents(token(), patientId);
  },

  async getOverview(patientId: string): Promise<DashboardOverview> {
    if (mocksEnabled()) return mockApi.getOverview(token(), patientId);
    return withLiveRefresh(async (access) => {
      const raw = await httpRequest<BackendOverview>(`/patients/${patientId}/overview`, {
        accessToken: access,
      });
      return mapOverview(raw);
    });
  },

  // The backend's schedule model (occurrences[], missedAfterMinutes,
  // snoozeMinutes, version) and this dashboard's (a free-text `recurrence`
  // string, no version) are not mappable field-for-field — the dashboard
  // would need to adopt the backend's model, which is a screen rebuild, not
  // an adapter. Deliberately left on mocks; see the team's contract notes.
  async listSchedules(patientId: string): Promise<Schedule[]> {
    return mockApi.listSchedules(token(), patientId);
  },

  async createSchedule(
    patientId: string,
    input: {
      type: ScheduleType;
      label: string;
      dosageText?: string;
      recurrence: string;
      critical: boolean;
    },
  ): Promise<Schedule> {
    return mockApi.createSchedule(token(), patientId, input);
  },

  async updateSchedule(
    scheduleId: string,
    patch: Partial<
      Pick<Schedule, "label" | "dosageText" | "recurrence" | "critical" | "paused" | "type">
    >,
  ): Promise<Schedule> {
    return mockApi.updateSchedule(token(), scheduleId, patch);
  },

  // The backend has no daily-series trends endpoint — its /trends returns an
  // explainable status + indicators, not the day-by-day points this chart
  // needs. Stays mocked until that endpoint exists.
  async getTrends(patientId: string, periodDays: 7 | 30): Promise<TrendSummary> {
    return mockApi.getTrends(token(), patientId, periodDays);
  },

  async listAlerts(): Promise<Alert[]> {
    if (mocksEnabled()) return mockApi.listAlerts(token());
    return withLiveRefresh(async (access) => {
      const raw = await httpRequest<BackendAlert[]>("/alerts", { accessToken: access });
      return raw.map(mapAlert);
    });
  },

  // The caller (AlertCard) only uses this to know the action succeeded and
  // then reloads the full list — it never reads the returned Alert's other
  // fields, so the backend's partial action response is filled out with
  // placeholders for the rest rather than fetched again (no single-alert
  // GET exists to fetch from).
  async acknowledgeAlert(alertId: string, note?: string): Promise<Alert> {
    if (mocksEnabled()) return mockApi.acknowledgeAlert(token(), alertId, note);
    return withLiveRefresh(async (access) => {
      const raw = await httpRequest<{ alertId: string; status: BackendAlert["status"] }>(
        `/alerts/${alertId}/acknowledge`,
        { method: "PATCH", accessToken: access, body: JSON.stringify({ note }) },
      );
      return actionResultToAlert(raw.alertId, raw.status);
    });
  },

  async escalateAlert(alertId: string, note?: string): Promise<Alert> {
    if (mocksEnabled()) return mockApi.escalateAlert(token(), alertId, note);
    return withLiveRefresh(async (access) => {
      const raw = await httpRequest<{ alertId: string; status: BackendAlert["status"]; severity: BackendAlert["severity"] }>(
        `/alerts/${alertId}/escalate`,
        { method: "PATCH", accessToken: access, body: JSON.stringify({ note }) },
      );
      return actionResultToAlert(raw.alertId, raw.status, raw.severity);
    });
  },

  async resolveAlert(alertId: string, note?: string): Promise<Alert> {
    if (mocksEnabled()) return mockApi.resolveAlert(token(), alertId, note);
    return withLiveRefresh(async (access) => {
      const raw = await httpRequest<{ alertId: string; status: "RESOLVED"; resolvedAt?: string }>(
        `/alerts/${alertId}/resolve`,
        { method: "PATCH", accessToken: access, body: JSON.stringify({ resolutionNote: note }) },
      );
      return actionResultToAlert(raw.alertId, raw.status, undefined, raw.resolvedAt);
    });
  },

  // Endpoints exist on the backend, but the response shapes are untested
  // against these types today — left mocked to keep today's live scope to
  // what was actually verified end to end (patients, overview, alerts).
  async listMemories(patientId: string): Promise<MemoryAsset[]> {
    return mockApi.listMemories(token(), patientId);
  },

  async getUploadUrl(patientId: string): Promise<UploadUrlResponse> {
    return mockApi.getUploadUrl(token(), patientId);
  },

  async createMemory(
    patientId: string,
    input: { type: MemoryAsset["type"]; objectKey: string; labels: MemoryLabels; consentGranted: boolean },
  ): Promise<MemoryAsset> {
    return mockApi.createMemory(token(), patientId, input);
  },

  async deleteMemory(memoryId: string): Promise<void> {
    return mockApi.deleteMemory(token(), memoryId);
  },

  // No matching backend route at all (Observation on the backend is the ML
  // trend record, not a human note; VisitNote's fields don't match either).
  async listObservations(patientId: string): Promise<Observation[]> {
    return mockApi.listObservations(token(), patientId);
  },

  async createObservation(patientId: string, text: string, followUpAt?: string): Promise<Observation> {
    return mockApi.createObservation(token(), patientId, text, followUpAt);
  },

  async listVisits(patientId: string): Promise<VisitNote[]> {
    return mockApi.listVisits(token(), patientId);
  },

  async createVisit(
    patientId: string,
    input: Omit<VisitNote, "id" | "patientId" | "authorId" | "authorName" | "createdAt">,
  ): Promise<VisitNote> {
    return mockApi.createVisit(token(), patientId, input);
  },

  // No backend route at all.
  async getNotificationPrefs(): Promise<{ emailAlerts: boolean; smsUrgent: boolean; weeklyDigest: boolean }> {
    return mockApi.getNotificationPrefs(token());
  },

  async saveNotificationPrefs(prefs: {
    emailAlerts: boolean;
    smsUrgent: boolean;
    weeklyDigest: boolean;
  }): Promise<{ emailAlerts: boolean; smsUrgent: boolean; weeklyDigest: boolean }> {
    return mockApi.saveNotificationPrefs(token(), prefs);
  },

  async requestDeletion(
    reason: string,
    patientId?: string,
  ): Promise<{ id: string; userId: string; patientId?: string; reason: string; createdAt: string; status: "submitted" }> {
    return mockApi.requestDeletion(token(), reason, patientId);
  },
};

function actionResultToAlert(
  alertId: string,
  status: BackendAlert["status"],
  severity?: BackendAlert["severity"],
  resolvedAt?: string,
): Alert {
  const now = new Date().toISOString();
  return {
    id: alertId,
    patientId: "",
    type: "",
    severity: severity ? mapSeverity(severity) : "attention",
    evidence: { summary: "", metricKeys: [], periodDays: 7 },
    status: mapAlertStatus(status),
    createdAt: now,
    updatedAt: resolvedAt ?? now,
    resolvedAt: resolvedAt,
  };
}
