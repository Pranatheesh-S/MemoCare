import type {
  Alert,
  Assignment,
  ConsentRecord,
  GameSession,
  MemoryAsset,
  Observation,
  PatientProfile,
  Schedule,
  User,
  VisitNote,
} from "@/lib/types";
import { daysAgo, nowIso } from "@/lib/utils";

export const DEMO_PASSWORD = "demo1234";

export const CAREGIVER: User = {
  id: "user_caregiver_1",
  role: "caregiver",
  name: "Riya Sharma",
  contact: "riya.caregiver@example.com",
  status: "active",
  createdAt: daysAgo(90),
  updatedAt: daysAgo(1),
};

export const WORKER: User = {
  id: "user_worker_1",
  role: "healthcare_worker",
  name: "Ananya Das",
  contact: "ananya.worker@example.com",
  status: "active",
  createdAt: daysAgo(120),
  updatedAt: daysAgo(2),
};

export const AITA_ID = "patient_aita";

export function createSeedStore() {
  const aita: PatientProfile = {
    id: AITA_ID,
    displayName: "Aita",
    age: 72,
    dateOfBirth: "1954-03-12",
    language: "Assamese",
    location: {
      village: "Majuli",
      district: "Majuli",
      state: "Assam",
    },
    accessibility: {
      largeText: true,
      highContrast: false,
      reducedMotion: true,
      voiceGuidance: true,
    },
    emergencyContacts: [
      {
        name: "Riya Sharma",
        relationship: "Granddaughter",
        phone: "+91 98765 43210",
      },
    ],
    deviceStatus: "paired",
    lastActivityAt: daysAgo(0),
    lastSyncAt: daysAgo(0),
    createdAt: daysAgo(30),
    updatedAt: nowIso(),
  };

  const assignments: Assignment[] = [
    {
      patientId: AITA_ID,
      userId: CAREGIVER.id,
      role: "caregiver",
      activeFrom: daysAgo(30),
    },
    {
      patientId: AITA_ID,
      userId: WORKER.id,
      role: "healthcare_worker",
      activeFrom: daysAgo(28),
    },
  ];

  const consents: ConsentRecord[] = [
    {
      id: "consent_care_1",
      subject: AITA_ID,
      purpose: "Care monitoring and routine support",
      assetOrCategory: "care_profile",
      grantedBy: CAREGIVER.id,
      grantedAt: daysAgo(30),
      status: "granted",
    },
    {
      id: "consent_mem_1",
      subject: "Family photo subjects",
      purpose: "Personal Memory Vault for reminiscence activities",
      assetOrCategory: "family_photo",
      grantedBy: CAREGIVER.id,
      grantedAt: daysAgo(20),
      status: "granted",
    },
  ];

  const schedules: Schedule[] = [
    {
      id: "sched_med_am",
      patientId: AITA_ID,
      type: "medicine",
      label: "Morning medicine",
      dosageText: "As prescribed — 9:00 AM",
      recurrence: "daily@09:00",
      critical: true,
      version: 2,
      paused: false,
      createdAt: daysAgo(25),
      updatedAt: daysAgo(5),
    },
    {
      id: "sched_hydrate",
      patientId: AITA_ID,
      type: "hydration",
      label: "Afternoon water",
      recurrence: "daily@15:00",
      critical: false,
      version: 1,
      paused: false,
      createdAt: daysAgo(25),
      updatedAt: daysAgo(25),
    },
    {
      id: "sched_meal",
      patientId: AITA_ID,
      type: "meal",
      label: "Evening meal",
      recurrence: "daily@19:00",
      critical: false,
      version: 1,
      paused: false,
      createdAt: daysAgo(25),
      updatedAt: daysAgo(25),
    },
  ];

  const sessions: GameSession[] = [];
  for (let d = 0; d < 30; d++) {
    const day = daysAgo(d);
    const count = d < 7 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const accuracy = 0.55 + Math.sin(d / 3) * 0.15 + (i === 0 ? 0.05 : 0);
      sessions.push({
        eventId: `gs_${d}_${i}`,
        patientId: AITA_ID,
        gameType: i === 0 ? "MEMORY_MATCH" : "WHO_IS_THIS",
        difficulty: 2,
        metrics: {
          accuracy: Math.min(0.95, Math.max(0.35, accuracy)),
          responseTimeSeconds: 35 + (d % 10) * 2,
          hintsUsed: d % 4 === 0 ? 2 : 1,
          completed: d !== 3,
          abandoned: d === 3,
        },
        playedAt: day,
      });
    }
  }

  const alerts: Alert[] = [
    {
      id: "alert_missed_med",
      patientId: AITA_ID,
      type: "MISSED_CRITICAL_REMINDER",
      severity: "urgent",
      evidence: {
        summary:
          "Critical morning medicine reminder was missed on three consecutive days after sync.",
        metricKeys: ["reminder_missed", "critical_schedule"],
        periodDays: 3,
        relatedEventIds: ["re_1", "re_2", "re_3"],
      },
      status: "open",
      assignee: CAREGIVER.id,
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
    },
    {
      id: "alert_participation",
      patientId: AITA_ID,
      type: "SUSTAINED_PARTICIPATION_CHANGE",
      severity: "attention",
      evidence: {
        summary:
          "Participation in short activities decreased over seven days compared with the prior week.",
        metricKeys: ["participation", "sessions_completed"],
        periodDays: 7,
      },
      status: "open",
      assignee: CAREGIVER.id,
      createdAt: daysAgo(2),
      updatedAt: daysAgo(2),
    },
  ];

  const memories: MemoryAsset[] = [
    {
      id: "mem_1",
      patientId: AITA_ID,
      type: "photo",
      objectKey: "memories/aita/family-bihu.jpg",
      labels: {
        person: "Riya",
        relationship: "Granddaughter",
        story: "Bihu celebration at home",
        place: "Majuli",
        festival: "Bohag Bihu",
      },
      consentId: "consent_mem_1",
      checksum: "sha256:demo_checksum_1",
      createdAt: daysAgo(18),
    },
  ];

  const observations: Observation[] = [
    {
      id: "obs_sys_1",
      patientId: AITA_ID,
      authorRole: "system",
      authorId: "system",
      authorName: "SmritiSetu",
      source: "trend_rules",
      text: "Participation decreased over seven days. Caregiver review suggested.",
      createdAt: daysAgo(2),
    },
    {
      id: "obs_cg_1",
      patientId: AITA_ID,
      authorRole: "caregiver",
      authorId: CAREGIVER.id,
      authorName: CAREGIVER.name,
      source: "alert_note",
      text: "Called Aita in the evening; she said she felt tired after lunch.",
      createdAt: daysAgo(1),
    },
  ];

  const visits: VisitNote[] = [
    {
      id: "visit_1",
      patientId: AITA_ID,
      authorId: WORKER.id,
      authorName: WORKER.name,
      mood: "Calm and welcoming",
      communicationOrientation:
        "Oriented to place; conversation slower than last visit.",
      routineDifficulty: "Needed a reminder prompt for morning medicine timing.",
      concernFlag: false,
      followUpAt: daysAgo(-7),
      createdAt: daysAgo(14),
    },
  ];

  return {
    users: [CAREGIVER, WORKER] as User[],
    patients: [aita] as PatientProfile[],
    assignments,
    consents,
    schedules,
    sessions,
    alerts,
    memories,
    observations,
    visits,
    notificationPrefs: {
      [CAREGIVER.id]: {
        emailAlerts: true,
        smsUrgent: true,
        weeklyDigest: false,
      },
    } as Record<
      string,
      { emailAlerts: boolean; smsUrgent: boolean; weeklyDigest: boolean }
    >,
    deletionRequests: [] as Array<{
      id: string;
      userId: string;
      patientId?: string;
      reason: string;
      createdAt: string;
      status: "submitted";
    }>,
  };
}

export type SeedStore = ReturnType<typeof createSeedStore>;
