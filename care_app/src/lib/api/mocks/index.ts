import type {
  Alert,
  AuthSession,
  DashboardOverview,
  MemoryAsset,
  Observation,
  PairingCodeResponse,
  PatientProfile,
  Schedule,
  TrendSummary,
  UploadUrlResponse,
  VisitNote,
} from "@/lib/types";
import { createId, daysAgo, nowIso } from "@/lib/utils";
import {
  AITA_ID,
  CAREGIVER,
  DEMO_PASSWORD,
  WORKER,
  createSeedStore,
  type SeedStore,
} from "./seed";

let store: SeedStore = createSeedStore();

function delay(ms = 350): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function unauthorized(): never {
  const err = new Error("Unauthorized") as Error & { code: string; status: number };
  err.code = "UNAUTHORIZED";
  err.status = 401;
  throw err;
}

function forbidden(message = "You do not have access to this patient."): never {
  const err = new Error(message) as Error & { code: string; status: number };
  err.code = "FORBIDDEN";
  err.status = 403;
  throw err;
}

function notFound(message = "Not found"): never {
  const err = new Error(message) as Error & { code: string; status: number };
  err.code = "NOT_FOUND";
  err.status = 404;
  throw err;
}

function assignedPatientIds(userId: string): Set<string> {
  return new Set(
    store.assignments
      .filter((a) => a.userId === userId && !a.activeTo)
      .map((a) => a.patientId),
  );
}

function assertAssigned(userId: string, patientId: string): void {
  if (!assignedPatientIds(userId).has(patientId)) {
    forbidden();
  }
}

function buildTokens(userId: string) {
  return {
    accessToken: `mock_access_${userId}`,
    refreshToken: `mock_refresh_${userId}`,
    expiresIn: 3600,
  };
}

function parseUserId(accessToken?: string): string | null {
  if (!accessToken?.startsWith("mock_access_")) return null;
  return accessToken.replace("mock_access_", "");
}

function requireUser(accessToken?: string) {
  const userId = parseUserId(accessToken);
  if (!userId) unauthorized();
  const user = store.users.find((u) => u.id === userId);
  if (!user) unauthorized();
  return user;
}

function computeAdherence(patientId: string): number {
  // Demo: slightly lower for Aita to match open alert narrative
  return patientId === AITA_ID ? 0.62 : 0.9;
}

function buildTrends(patientId: string, periodDays: 7 | 30): TrendSummary {
  const cutoff = Date.now() - periodDays * 86400000;
  const sessions = store.sessions.filter(
    (s) => s.patientId === patientId && new Date(s.playedAt).getTime() >= cutoff,
  );
  const byDay = new Map<string, typeof sessions>();
  for (let i = 0; i < periodDays; i++) {
    const key = daysAgo(i).slice(0, 10);
    byDay.set(key, []);
  }
  for (const s of sessions) {
    const key = s.playedAt.slice(0, 10);
    const list = byDay.get(key);
    if (list) list.push(s);
  }
  const points = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, daySessions]) => {
      const completed = daySessions.filter((s) => s.metrics.completed);
      const abandoned = daySessions.filter((s) => s.metrics.abandoned);
      const acc =
        completed.length === 0
          ? 0
          : completed.reduce((sum, s) => sum + s.metrics.accuracy, 0) /
            completed.length;
      const rt =
        completed.length === 0
          ? 0
          : completed.reduce(
              (sum, s) => sum + s.metrics.responseTimeSeconds,
              0,
            ) / completed.length;
      const hints =
        completed.length === 0
          ? 0
          : completed.reduce((sum, s) => sum + s.metrics.hintsUsed, 0) /
            completed.length;
      return {
        date,
        participation: daySessions.length,
        accuracy: Number(acc.toFixed(2)),
        responseTimeSeconds: Number(rt.toFixed(1)),
        hintsUsed: Number(hints.toFixed(1)),
        abandonmentRate:
          daySessions.length === 0
            ? 0
            : Number((abandoned.length / daySessions.length).toFixed(2)),
        reminderAdherence: computeAdherence(patientId),
      };
    });

  const recentPart = points.slice(-7).reduce((s, p) => s + p.participation, 0);
  const priorPart = points.slice(-14, -7).reduce((s, p) => s + p.participation, 0);
  const observations: string[] = [];
  if (priorPart > 0 && recentPart < priorPart * 0.75) {
    observations.push(
      "Participation decreased over seven days compared with the previous week.",
    );
  } else {
    observations.push(
      "Participation stayed broadly steady across the selected period.",
    );
  }
  observations.push(
    "These are engagement observations only — not a clinical assessment.",
  );

  return { patientId, periodDays, points, plainLanguageObservations: observations };
}

export const mockApi = {
  reset() {
    store = createSeedStore();
  },

  async login(email: string, password: string): Promise<AuthSession> {
    await delay();
    if (password !== DEMO_PASSWORD) {
      const err = new Error("Invalid email or password") as Error & {
        code: string;
        status: number;
      };
      err.code = "INVALID_CREDENTIALS";
      err.status = 401;
      throw err;
    }
    const user =
      email.toLowerCase() === WORKER.contact.toLowerCase()
        ? WORKER
        : email.toLowerCase() === CAREGIVER.contact.toLowerCase()
          ? CAREGIVER
          : null;
    if (!user) {
      const err = new Error("Invalid email or password") as Error & {
        code: string;
        status: number;
      };
      err.code = "INVALID_CREDENTIALS";
      err.status = 401;
      throw err;
    }
    return { user, tokens: buildTokens(user.id) };
  },

  async refresh(refreshToken: string): Promise<AuthSession> {
    await delay(150);
    if (!refreshToken.startsWith("mock_refresh_")) unauthorized();
    const userId = refreshToken.replace("mock_refresh_", "");
    const user = store.users.find((u) => u.id === userId);
    if (!user) unauthorized();
    return { user, tokens: buildTokens(user.id) };
  },

  async pairDevice(
    accessToken: string | undefined,
    patientId: string,
  ): Promise<PairingCodeResponse> {
    await delay();
    const user = requireUser(accessToken);
    assertAssigned(user.id, patientId);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const patient = store.patients.find((p) => p.id === patientId);
    if (patient) {
      patient.deviceStatus = patient.deviceStatus === "unpaired" ? "unpaired" : patient.deviceStatus;
      patient.updatedAt = nowIso();
    }
    return {
      patientId,
      pairingCode: code,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
  },

  async listPatients(accessToken?: string): Promise<PatientProfile[]> {
    await delay();
    const user = requireUser(accessToken);
    const ids = assignedPatientIds(user.id);
    return store.patients.filter((p) => ids.has(p.id));
  },

  async getPatient(
    accessToken: string | undefined,
    patientId: string,
  ): Promise<PatientProfile> {
    await delay();
    const user = requireUser(accessToken);
    assertAssigned(user.id, patientId);
    const patient = store.patients.find((p) => p.id === patientId);
    if (!patient) notFound("Patient not found");
    return patient;
  },

  async createPatient(
    accessToken: string | undefined,
    input: {
      displayName: string;
      age: number;
      language: string;
      village?: string;
      district?: string;
      state?: string;
    },
  ): Promise<PatientProfile> {
    await delay();
    const user = requireUser(accessToken);
    if (user.role !== "caregiver") forbidden("Only caregivers can create patients.");
    const patient: PatientProfile = {
      id: createId("patient"),
      displayName: input.displayName,
      age: input.age,
      language: input.language,
      location: {
        village: input.village,
        district: input.district,
        state: input.state ?? "Assam",
      },
      accessibility: {
        largeText: true,
        highContrast: false,
        reducedMotion: true,
        voiceGuidance: true,
      },
      emergencyContacts: [],
      deviceStatus: "unpaired",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    store.patients.push(patient);
    store.assignments.push({
      patientId: patient.id,
      userId: user.id,
      role: "caregiver",
      activeFrom: nowIso(),
    });
    store.consents.push({
      id: createId("consent"),
      subject: patient.id,
      purpose: "Care monitoring and routine support",
      assetOrCategory: "care_profile",
      grantedBy: user.id,
      grantedAt: nowIso(),
      status: "granted",
    });
    return patient;
  },

  async updatePatient(
    accessToken: string | undefined,
    patientId: string,
    patch: Partial<
      Pick<
        PatientProfile,
        "displayName" | "language" | "accessibility" | "emergencyContacts" | "location"
      >
    >,
  ): Promise<PatientProfile> {
    await delay();
    const user = requireUser(accessToken);
    assertAssigned(user.id, patientId);
    const patient = store.patients.find((p) => p.id === patientId);
    if (!patient) notFound("Patient not found");
    Object.assign(patient, patch, { updatedAt: nowIso() });
    return patient;
  },

  async getAssignments(accessToken: string | undefined, patientId: string) {
    await delay();
    const user = requireUser(accessToken);
    assertAssigned(user.id, patientId);
    return store.assignments.filter((a) => a.patientId === patientId);
  },

  async getConsents(accessToken: string | undefined, patientId: string) {
    await delay();
    const user = requireUser(accessToken);
    assertAssigned(user.id, patientId);
    return store.consents.filter(
      (c) => c.subject === patientId || c.assetOrCategory.includes("family"),
    );
  },

  async getOverview(
    accessToken: string | undefined,
    patientId: string,
  ): Promise<DashboardOverview> {
    await delay();
    const user = requireUser(accessToken);
    assertAssigned(user.id, patientId);
    const patient = store.patients.find((p) => p.id === patientId);
    if (!patient) notFound();
    const today = nowIso().slice(0, 10);
    const gamesCompletedToday = store.sessions.filter(
      (s) =>
        s.patientId === patientId &&
        s.playedAt.slice(0, 10) === today &&
        s.metrics.completed,
    ).length;
    const openAlertCount = store.alerts.filter(
      (a) =>
        a.patientId === patientId &&
        (a.status === "open" || a.status === "acknowledged" || a.status === "escalated"),
    ).length;
    return {
      patientId,
      displayName: patient.displayName,
      deviceStatus: patient.deviceStatus,
      lastActivityAt: patient.lastActivityAt,
      lastSyncAt: patient.lastSyncAt,
      gamesCompletedToday,
      reminderAdherence7d: computeAdherence(patientId),
      openAlertCount,
    };
  },

  async listSchedules(accessToken: string | undefined, patientId: string) {
    await delay();
    const user = requireUser(accessToken);
    assertAssigned(user.id, patientId);
    return store.schedules
      .filter((s) => s.patientId === patientId)
      .sort((a, b) => a.label.localeCompare(b.label));
  },

  async createSchedule(
    accessToken: string | undefined,
    patientId: string,
    input: Omit<
      Schedule,
      "id" | "patientId" | "version" | "createdAt" | "updatedAt" | "paused"
    >,
  ): Promise<Schedule> {
    await delay();
    const user = requireUser(accessToken);
    assertAssigned(user.id, patientId);
    const schedule: Schedule = {
      ...input,
      id: createId("sched"),
      patientId,
      version: 1,
      paused: false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    store.schedules.push(schedule);
    return schedule;
  },

  async updateSchedule(
    accessToken: string | undefined,
    scheduleId: string,
    patch: Partial<
      Pick<
        Schedule,
        "label" | "dosageText" | "recurrence" | "critical" | "paused" | "type"
      >
    >,
  ): Promise<Schedule> {
    await delay();
    const user = requireUser(accessToken);
    const schedule = store.schedules.find((s) => s.id === scheduleId);
    if (!schedule) notFound("Schedule not found");
    assertAssigned(user.id, schedule.patientId);
    Object.assign(schedule, patch, {
      version: schedule.version + 1,
      updatedAt: nowIso(),
    });
    return schedule;
  },

  async getTrends(
    accessToken: string | undefined,
    patientId: string,
    periodDays: 7 | 30,
  ): Promise<TrendSummary> {
    await delay();
    const user = requireUser(accessToken);
    assertAssigned(user.id, patientId);
    return buildTrends(patientId, periodDays);
  },

  async listAlerts(accessToken?: string): Promise<Alert[]> {
    await delay();
    const user = requireUser(accessToken);
    const ids = assignedPatientIds(user.id);
    return store.alerts
      .filter((a) => ids.has(a.patientId))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  },

  async acknowledgeAlert(
    accessToken: string | undefined,
    alertId: string,
    note?: string,
  ): Promise<Alert> {
    await delay();
    const user = requireUser(accessToken);
    const alert = store.alerts.find((a) => a.id === alertId);
    if (!alert) notFound("Alert not found");
    assertAssigned(user.id, alert.patientId);
    alert.status = "acknowledged";
    alert.acknowledgedAt = nowIso();
    alert.acknowledgedBy = user.id;
    alert.updatedAt = nowIso();
    if (note) alert.note = note;
    return alert;
  },

  async escalateAlert(
    accessToken: string | undefined,
    alertId: string,
    note?: string,
  ): Promise<Alert> {
    await delay();
    const user = requireUser(accessToken);
    const alert = store.alerts.find((a) => a.id === alertId);
    if (!alert) notFound("Alert not found");
    assertAssigned(user.id, alert.patientId);
    alert.status = "escalated";
    alert.escalatedAt = nowIso();
    alert.escalatedBy = user.id;
    alert.assignee = WORKER.id;
    alert.updatedAt = nowIso();
    if (note) alert.note = note;
    return alert;
  },

  async resolveAlert(
    accessToken: string | undefined,
    alertId: string,
    note?: string,
  ): Promise<Alert> {
    await delay();
    const user = requireUser(accessToken);
    const alert = store.alerts.find((a) => a.id === alertId);
    if (!alert) notFound("Alert not found");
    assertAssigned(user.id, alert.patientId);
    alert.status = "resolved";
    alert.resolvedAt = nowIso();
    alert.resolvedBy = user.id;
    alert.updatedAt = nowIso();
    if (note) alert.note = note;
    return alert;
  },

  async listMemories(accessToken: string | undefined, patientId: string) {
    await delay();
    const user = requireUser(accessToken);
    assertAssigned(user.id, patientId);
    return store.memories.filter((m) => m.patientId === patientId);
  },

  async getUploadUrl(
    accessToken: string | undefined,
    patientId: string,
  ): Promise<UploadUrlResponse> {
    await delay();
    const user = requireUser(accessToken);
    assertAssigned(user.id, patientId);
    const objectKey = `memories/${patientId}/${createId("obj")}`;
    return {
      uploadUrl: `https://mock-upload.local/${objectKey}?signature=demo`,
      objectKey,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    };
  },

  async createMemory(
    accessToken: string | undefined,
    patientId: string,
    input: {
      type: MemoryAsset["type"];
      objectKey: string;
      labels: MemoryAsset["labels"];
      consentGranted: boolean;
    },
  ): Promise<MemoryAsset> {
    await delay();
    const user = requireUser(accessToken);
    assertAssigned(user.id, patientId);
    if (!input.consentGranted) {
      const err = new Error("Explicit consent is required for each memory asset.") as Error & {
        code: string;
        status: number;
      };
      err.code = "CONSENT_REQUIRED";
      err.status = 400;
      throw err;
    }
    const consent = {
      id: createId("consent"),
      subject: input.labels.person ?? "Family member",
      purpose: "Personal Memory Vault",
      assetOrCategory: input.type,
      grantedBy: user.id,
      grantedAt: nowIso(),
      status: "granted" as const,
    };
    store.consents.push(consent);
    const memory: MemoryAsset = {
      id: createId("mem"),
      patientId,
      type: input.type,
      objectKey: input.objectKey,
      labels: input.labels,
      consentId: consent.id,
      checksum: `sha256:${createId("chk")}`,
      createdAt: nowIso(),
    };
    store.memories.push(memory);
    return memory;
  },

  async deleteMemory(accessToken: string | undefined, memoryId: string) {
    await delay();
    const user = requireUser(accessToken);
    const idx = store.memories.findIndex((m) => m.id === memoryId);
    if (idx < 0) notFound("Memory not found");
    assertAssigned(user.id, store.memories[idx].patientId);
    store.memories.splice(idx, 1);
  },

  async listObservations(accessToken: string | undefined, patientId: string) {
    await delay();
    const user = requireUser(accessToken);
    assertAssigned(user.id, patientId);
    return store.observations
      .filter((o) => o.patientId === patientId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  },

  async createObservation(
    accessToken: string | undefined,
    patientId: string,
    text: string,
    followUpAt?: string,
  ): Promise<Observation> {
    await delay();
    const user = requireUser(accessToken);
    assertAssigned(user.id, patientId);
    const authorRole =
      user.role === "healthcare_worker"
        ? "healthcare_worker"
        : user.role === "caregiver"
          ? "caregiver"
          : "system";
    const obs: Observation = {
      id: createId("obs"),
      patientId,
      authorRole,
      authorId: user.id,
      authorName: user.name,
      source: "manual_note",
      text,
      followUpAt,
      createdAt: nowIso(),
    };
    store.observations.push(obs);
    return obs;
  },

  async listVisits(accessToken: string | undefined, patientId: string) {
    await delay();
    const user = requireUser(accessToken);
    assertAssigned(user.id, patientId);
    return store.visits
      .filter((v) => v.patientId === patientId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  },

  async createVisit(
    accessToken: string | undefined,
    patientId: string,
    input: Omit<VisitNote, "id" | "patientId" | "authorId" | "authorName" | "createdAt">,
  ): Promise<VisitNote> {
    await delay();
    const user = requireUser(accessToken);
    assertAssigned(user.id, patientId);
    if (user.role !== "healthcare_worker") {
      forbidden("Only healthcare workers can record visit notes.");
    }
    const visit: VisitNote = {
      ...input,
      id: createId("visit"),
      patientId,
      authorId: user.id,
      authorName: user.name,
      createdAt: nowIso(),
    };
    store.visits.push(visit);
    return visit;
  },

  async getNotificationPrefs(accessToken?: string) {
    await delay();
    const user = requireUser(accessToken);
    return (
      store.notificationPrefs[user.id] ?? {
        emailAlerts: true,
        smsUrgent: false,
        weeklyDigest: false,
      }
    );
  },

  async saveNotificationPrefs(
    accessToken: string | undefined,
    prefs: { emailAlerts: boolean; smsUrgent: boolean; weeklyDigest: boolean },
  ) {
    await delay();
    const user = requireUser(accessToken);
    store.notificationPrefs[user.id] = prefs;
    return prefs;
  },

  async requestDeletion(
    accessToken: string | undefined,
    reason: string,
    patientId?: string,
  ) {
    await delay();
    const user = requireUser(accessToken);
    const req = {
      id: createId("del"),
      userId: user.id,
      patientId,
      reason,
      createdAt: nowIso(),
      status: "submitted" as const,
    };
    store.deletionRequests.push(req);
    return req;
  },
};
