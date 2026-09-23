/**
 * Seeds the demonstration patient "Aita" and 14 days of realistic history.
 *
 * No real patient data is used. Family photographs are generated abstract
 * placeholder images (see generate-placeholder-media.py) and voice clips are
 * silent placeholder WAVs, so the whole demo runs without any real person's
 * likeness or voice.
 *
 * Idempotent: re-running replaces the demo patient's data cleanly.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaClient, type GameType, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO = {
  pairingCode: "123456",
  caregiver: { email: "daughter@smritisetu.demo", password: "Caregiver#2026", fullName: "Nabanita Bora" },
  healthWorker: { email: "asha@smritisetu.demo", password: "AshaWorker#2026", fullName: "Rekha Saikia (ASHA)" },
  admin: { email: "admin@smritisetu.demo", password: "AdminUser#2026", fullName: "System Administrator" },
};

async function main() {
  console.log("Seeding SmritiSetu AI demonstration data…");

  await resetDemoData();

  /* ---------------------------------------------------------------------- */
  /*  Users                                                                 */
  /* ---------------------------------------------------------------------- */

  const [caregiver, healthWorker, admin] = await Promise.all([
    prisma.user.create({
      data: {
        email: DEMO.caregiver.email,
        passwordHash: await bcrypt.hash(DEMO.caregiver.password, 10),
        fullName: DEMO.caregiver.fullName,
        phoneNumber: "+919000000001",
        role: "CAREGIVER",
      },
    }),
    prisma.user.create({
      data: {
        email: DEMO.healthWorker.email,
        passwordHash: await bcrypt.hash(DEMO.healthWorker.password, 10),
        fullName: DEMO.healthWorker.fullName,
        phoneNumber: "+919000000002",
        role: "HEALTH_WORKER",
      },
    }),
    prisma.user.create({
      data: {
        email: DEMO.admin.email,
        passwordHash: await bcrypt.hash(DEMO.admin.password, 10),
        fullName: DEMO.admin.fullName,
        role: "ADMIN",
      },
    }),
  ]);

  /* ---------------------------------------------------------------------- */
  /*  Patient and care team                                                 */
  /* ---------------------------------------------------------------------- */

  const patient = await prisma.patientProfile.create({
    data: {
      displayName: "Aita",
      preferredName: "Aita",
      age: 72,
      location: "Jorhat, Assam",
      preferredLanguage: "as",
      stateId: "AS",
      communityId: "assam.general",
      photoStorageKey: "seed/patient.png",
      reducedMotion: false,
      largeText: true,
      audioGuidanceEnabled: true,
      packageVersion: 1,
    },
  });

  await prisma.caregiverAssignment.create({
    data: { userId: caregiver.id, patientId: patient.id, relationship: "Daughter", isPrimary: true },
  });
  await prisma.healthWorkerAssignment.create({
    data: { userId: healthWorker.id, patientId: patient.id, facility: "Jorhat Sub-centre" },
  });

  // A second, unrelated patient exists so the "caregiver cannot reach an
  // unassigned patient" rule is demonstrable (and testable) in the demo data.
  const otherPatient = await prisma.patientProfile.create({
    data: {
      displayName: "Koka",
      preferredName: "Koka",
      age: 78,
      location: "Sivasagar, Assam",
      preferredLanguage: "as",
      stateId: "AS",
      largeText: true,
    },
  });

  await seedRegionalDemoPatients(caregiver.id, healthWorker.id);

  await prisma.pairingCode.create({
    data: {
      code: DEMO.pairingCode,
      patientId: patient.id,
      createdById: caregiver.id,
      // Long-lived and reusable so the demo journey can be replayed. A real
      // pairing code is single-use and short-lived; this flag exists only for
      // the seeded demonstration patient.
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      reusable: true,
    },
  });

  /* ---------------------------------------------------------------------- */
  /*  Consent                                                               */
  /* ---------------------------------------------------------------------- */

  const familyConsent = await prisma.consentRecord.create({
    data: {
      patientId: patient.id,
      purpose: "Use family photographs, voice clips and stories inside the patient's memory activities",
      grantedByUserId: caregiver.id,
      grantedByName: DEMO.caregiver.fullName,
      assetScope: "Family photographs and voice recordings shared by the immediate family",
      consentVersion: "1.0",
      status: "ACTIVE",
    },
  });

  const placeConsent = await prisma.consentRecord.create({
    data: {
      patientId: patient.id,
      purpose: "Use pictures of familiar places, festivals and songs in reminiscence activities",
      grantedByUserId: caregiver.id,
      grantedByName: DEMO.caregiver.fullName,
      assetScope: "Places, festivals and songs",
      consentVersion: "1.0",
      status: "ACTIVE",
    },
  });

  /* ---------------------------------------------------------------------- */
  /*  Family contacts                                                       */
  /* ---------------------------------------------------------------------- */

  const contacts = [
    { name: "Nabanita", relationshipEn: "Daughter", relationshipAs: "জীয়ৰী", phoneNumber: "+919000000001", photoStorageKey: "seed/daughter.png", isPrimary: true, displayOrder: 1 },
    { name: "Bhaskar", relationshipEn: "Son", relationshipAs: "পুতেক", phoneNumber: "+919000000003", photoStorageKey: "seed/son.png", isPrimary: false, displayOrder: 2 },
    { name: "Rishav", relationshipEn: "Grandson", relationshipAs: "নাতি", phoneNumber: "+919000000004", photoStorageKey: "seed/grandson.png", isPrimary: false, displayOrder: 3 },
    { name: "Rekha Baideu", relationshipEn: "ASHA worker", relationshipAs: "আশা কৰ্মী", phoneNumber: "+919000000002", photoStorageKey: "seed/asha.png", isPrimary: false, displayOrder: 4 },
  ];
  await prisma.familyContact.createMany({
    data: contacts.map((c) => ({ ...c, patientId: patient.id })),
  });

  /* ---------------------------------------------------------------------- */
  /*  Memory vault: 6 family photos + 4 personal memories                   */
  /* ---------------------------------------------------------------------- */

  const familyPhotos: Prisma.MemoryAssetCreateManyInput[] = [
    {
      patientId: patient.id, consentId: familyConsent.id, category: "MY_FAMILY", assetType: "PHOTO",
      titleEn: "Nabanita", titleAs: "নবনীতা",
      captionEn: "Your daughter Nabanita", captionAs: "আপোনাৰ জীয়ৰী নবনীতা",
      storageKey: "seed/daughter.png", mimeType: "image/png",
      personName: "Nabanita", relationshipEn: "Daughter", relationshipAs: "জীয়ৰী",
      voiceStorageKey: "seed/daughter-voice.wav",
      storyEn: "Nabanita brings you red tea every evening and you talk about the garden.",
      storyAs: "নবনীতাই প্ৰতি সন্ধিয়া আপোনালৈ ৰঙা চাহ আনে আৰু আপোনালোকে বাগিছাৰ কথা পাতে।",
      favourite: true,
    },
    {
      patientId: patient.id, consentId: familyConsent.id, category: "MY_FAMILY", assetType: "PHOTO",
      titleEn: "Bhaskar", titleAs: "ভাস্কৰ",
      captionEn: "Your son Bhaskar", captionAs: "আপোনাৰ পুতেক ভাস্কৰ",
      storageKey: "seed/son.png", mimeType: "image/png",
      personName: "Bhaskar", relationshipEn: "Son", relationshipAs: "পুতেক",
      voiceStorageKey: "seed/son-voice.wav",
      storyEn: "Bhaskar learned to ride a bicycle in the courtyard of your old house.",
      storyAs: "ভাস্কৰে আপোনাৰ পুৰণি ঘৰৰ চোতালতে চাইকেল চলাব শিকিছিল।",
    },
    {
      patientId: patient.id, consentId: familyConsent.id, category: "MY_FAMILY", assetType: "PHOTO",
      titleEn: "Rishav", titleAs: "ঋষভ",
      captionEn: "Your grandson Rishav", captionAs: "আপোনাৰ নাতি ঋষভ",
      storageKey: "seed/grandson.png", mimeType: "image/png",
      personName: "Rishav", relationshipEn: "Grandson", relationshipAs: "নাতি",
      voiceStorageKey: "seed/grandson-voice.wav",
      storyEn: "Rishav loves the pitha you make during Bihu.",
      storyAs: "ঋষভে বিহুত আপুনি বনোৱা পিঠা বৰ ভাল পায়।",
    },
    {
      patientId: patient.id, consentId: familyConsent.id, category: "MY_FAMILY", assetType: "PHOTO",
      titleEn: "Rekha Baideu", titleAs: "ৰেখা বাইদেউ",
      captionEn: "Rekha Baideu, who visits to check on you", captionAs: "ৰেখা বাইদেউ, যিয়ে আপোনাক চাবলৈ আহে",
      storageKey: "seed/asha.png", mimeType: "image/png",
      personName: "Rekha Baideu", relationshipEn: "ASHA worker", relationshipAs: "আশা কৰ্মী",
      storyEn: "Rekha Baideu visits every week and always asks about your garden.",
      storyAs: "ৰেখা বাইদেউ প্ৰতি সপ্তাহত আহে আৰু সদায় আপোনাৰ বাগিছাৰ খবৰ লয়।",
    },
    {
      patientId: patient.id, consentId: familyConsent.id, category: "HAPPY_MOMENTS", assetType: "PHOTO",
      titleEn: "Nabanita's wedding day", titleAs: "নবনীতাৰ বিয়াৰ দিনটো",
      captionEn: "The whole family together", captionAs: "গোটেই পৰিয়াল একেলগে",
      storageKey: "seed/wedding.png", mimeType: "image/png",
      storyEn: "The courtyard was full of people and you cooked for everyone.",
      storyAs: "চোতালখন মানুহেৰে ভৰি আছিল আৰু আপুনি সকলোৰে বাবে ৰান্ধিছিল।",
      favourite: true,
    },
    {
      patientId: patient.id, consentId: familyConsent.id, category: "MY_HOME", assetType: "PHOTO",
      titleEn: "Our house in Jorhat", titleAs: "যোৰহাটৰ আমাৰ ঘৰ",
      captionEn: "The house with the wooden verandah", captionAs: "কাঠৰ বাৰাণ্ডা থকা ঘৰটো",
      storageKey: "seed/home.png", mimeType: "image/png",
      storyEn: "You planted the tulsi at the front of this house yourself.",
      storyAs: "এই ঘৰৰ আগত থকা তুলসী গছজোপা আপুনি নিজে ৰোপণ কৰিছিল।",
    },
  ];

  const personalMemories: Prisma.MemoryAssetCreateManyInput[] = [
    {
      patientId: patient.id, consentId: placeConsent.id, category: "MY_FESTIVALS", assetType: "PHOTO",
      titleEn: "Bohag Bihu", titleAs: "বহাগ বিহু",
      captionEn: "Bihu at home, with dhol and pepa", captionAs: "ঘৰত বিহু, ঢোল আৰু পেঁপাৰ সৈতে",
      storageKey: "seed/festival.png", mimeType: "image/png",
      storyEn: "Every Bohag Bihu the family gathers and Rishav dances first.",
      storyAs: "প্ৰতি বহাগ বিহুত পৰিয়াল গোট খায় আৰু ঋষভে প্ৰথমে নাচে।",
      favourite: true,
    },
    {
      patientId: patient.id, consentId: placeConsent.id, category: "MY_PLACES", assetType: "PHOTO",
      titleEn: "The tea garden", titleAs: "চাহ বাগিচা",
      captionEn: "The tea garden path you walked every morning", captionAs: "আপুনি প্ৰতি ৰাতিপুৱা খোজ কঢ়া চাহ বাগিচাৰ বাটটো",
      storageKey: "seed/tea-garden.png", mimeType: "image/png",
      storyEn: "You walked this path every morning before the sun was warm.",
      storyAs: "ৰ'দ গৰম হোৱাৰ আগেয়ে আপুনি প্ৰতি ৰাতিপুৱা এই বাটেৰে খোজ কাঢ়িছিল।",
    },
    {
      patientId: patient.id, consentId: placeConsent.id, category: "MY_PLACES", assetType: "PHOTO",
      titleEn: "The Brahmaputra", titleAs: "লুইত",
      captionEn: "The river at evening", captionAs: "সন্ধিয়াৰ নদীখন",
      storageKey: "seed/river.png", mimeType: "image/png",
      storyEn: "You went to the river bank with your sisters when you were young.",
      storyAs: "সৰুতে আপুনি ভনীয়েকহঁতৰ লগত নদীৰ পাৰলৈ গৈছিল।",
    },
    {
      patientId: patient.id, consentId: placeConsent.id, category: "MY_SONGS", assetType: "AUDIO",
      titleEn: "A Bihu song", titleAs: "এটা বিহুগীত",
      captionEn: "The Bihu song you like to hum", captionAs: "আপুনি গুণগুণাব ভাল পোৱা বিহুগীতটো",
      storageKey: "seed/bihu-song.wav", mimeType: "audio/wav",
      storyEn: "You used to sing this while cooking in the kitchen.",
      storyAs: "পাকঘৰত ৰান্ধোতে আপুনি এইটো গাইছিল।",
      favourite: true,
    },
  ];

  await prisma.memoryAsset.createMany({ data: [...familyPhotos, ...personalMemories] });

  /* ---------------------------------------------------------------------- */
  /*  Medicines, routines and schedules                                     */
  /* ---------------------------------------------------------------------- */

  const [medicineA, medicineB] = await Promise.all([
    prisma.medicine.create({
      data: {
        patientId: patient.id,
        name: "Morning tablet",
        // Recorded for the caregiver only — the patient app never gives dosage
        // instructions and never claims medicine was consumed.
        dosageNote: "As prescribed by the treating doctor",
        prescribedBy: "Jorhat Medical College OPD",
        critical: true,
      },
    }),
    prisma.medicine.create({
      data: {
        patientId: patient.id,
        name: "Evening tablet",
        dosageNote: "As prescribed by the treating doctor",
        prescribedBy: "Jorhat Medical College OPD",
        critical: true,
      },
    }),
  ]);

  const routines = await Promise.all([
    prisma.routine.create({
      data: {
        patientId: patient.id,
        titleEn: "Morning routine",
        titleAs: "ৰাতিপুৱাৰ নিয়ম",
        steps: [
          { key: "wake_up", labelEn: "Wake up", labelAs: "সাৰ পাওক" },
          { key: "brush_teeth", labelEn: "Brush teeth", labelAs: "দাঁত ব্ৰাছ কৰক" },
          { key: "breakfast", labelEn: "Eat breakfast", labelAs: "ৰাতিপুৱাৰ আহাৰ খাওক" },
          { key: "medicine", labelEn: "Take medicine", labelAs: "ঔষধ লওক" },
        ] as Prisma.InputJsonValue,
      },
    }),
    prisma.routine.create({
      data: {
        patientId: patient.id,
        titleEn: "Afternoon routine",
        titleAs: "দুপৰীয়াৰ নিয়ম",
        steps: [
          { key: "lunch", labelEn: "Eat lunch", labelAs: "দুপৰীয়াৰ আহাৰ খাওক" },
          { key: "rest", labelEn: "Rest a while", labelAs: "অলপ জিৰাওক" },
          { key: "water", labelEn: "Drink water", labelAs: "পানী খাওক" },
        ] as Prisma.InputJsonValue,
      },
    }),
    prisma.routine.create({
      data: {
        patientId: patient.id,
        titleEn: "Evening routine",
        titleAs: "সন্ধিয়াৰ নিয়ম",
        steps: [
          { key: "tea", labelEn: "Drink tea", labelAs: "চাহ খাওক" },
          { key: "walk", labelEn: "Walk in the courtyard", labelAs: "চোতালত খোজ কাঢ়ক" },
          { key: "medicine", labelEn: "Take medicine", labelAs: "ঔষধ লওক" },
          { key: "sleep", labelEn: "Go to sleep", labelAs: "শুবলৈ যাওক" },
        ] as Prisma.InputJsonValue,
      },
    }),
  ]);

  const everyDay = [0, 1, 2, 3, 4, 5, 6];
  const scheduleSpecs = [
    { kind: "MEDICINE" as const, titleEn: "Morning tablet", titleAs: "ৰাতিপুৱাৰ ঔষধ", critical: true, medicineId: medicineA.id, time: "08:00" },
    { kind: "MEDICINE" as const, titleEn: "Evening tablet", titleAs: "সন্ধিয়াৰ ঔষধ", critical: true, medicineId: medicineB.id, time: "20:00" },
    { kind: "HYDRATION" as const, titleEn: "Drink water", titleAs: "পানী খাওক", critical: false, time: "11:00" },
    { kind: "MEAL" as const, titleEn: "Lunch", titleAs: "দুপৰীয়াৰ আহাৰ", critical: false, routineId: routines[1].id, time: "13:00" },
    { kind: "EXERCISE" as const, titleEn: "Gentle walk", titleAs: "লাহে লাহে খোজ কাঢ়ক", critical: false, routineId: routines[2].id, time: "17:00" },
    { kind: "FAMILY_CHECK_IN" as const, titleEn: "Talk to Nabanita", titleAs: "নবনীতাৰ লগত কথা পাতক", critical: false, time: "19:00" },
    { kind: "SLEEP" as const, titleEn: "Rest", titleAs: "জিৰণি", critical: false, routineId: routines[2].id, time: "21:30" },
  ];

  const schedules = [];
  for (const spec of scheduleSpecs) {
    const schedule = await prisma.schedule.create({
      data: {
        patientId: patient.id,
        kind: spec.kind,
        titleEn: spec.titleEn,
        titleAs: spec.titleAs,
        critical: spec.critical,
        medicineId: spec.medicineId,
        routineId: spec.routineId,
        occurrences: [{ timeOfDay: spec.time, daysOfWeek: everyDay }] as Prisma.InputJsonValue,
        missedAfterMinutes: spec.critical ? 45 : 90,
        snoozeMinutes: 10,
        version: 1,
      },
    });
    await prisma.scheduleVersion.create({
      data: {
        scheduleId: schedule.id,
        version: 1,
        kind: schedule.kind,
        titleEn: schedule.titleEn,
        titleAs: schedule.titleAs,
        detail: schedule.detail,
        critical: schedule.critical,
        occurrences: schedule.occurrences as Prisma.InputJsonValue,
        missedAfterMinutes: schedule.missedAfterMinutes,
        snoozeMinutes: schedule.snoozeMinutes,
        active: true,
        changedByUserId: caregiver.id,
        changeNote: "Seeded",
      },
    });
    schedules.push(schedule);
  }

  /* ---------------------------------------------------------------------- */
  /*  A paired demo device (so history has somewhere to hang)                */
  /* ---------------------------------------------------------------------- */

  const device = await prisma.device.create({
    data: {
      patientId: patient.id,
      deviceIdentifier: "seed-demo-device-0001",
      platform: "android",
      appVersion: "1.0.0",
      // Seeded history device: no valid token is issued here. A real device
      // gets its token from POST /devices/pair.
      tokenHash: "seed-no-token",
      tokenExpiresAt: new Date(Date.now() - 1000),
      revokedAt: new Date(),
      lastSyncAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
      packageVersion: 1,
    },
  });

  /* ---------------------------------------------------------------------- */
  /*  14 days of game history                                               */
  /* ---------------------------------------------------------------------- */

  const gameSessions: Prisma.GameSessionCreateManyInput[] = [];
  const gameTypes: GameType[] = ["MEMORY_MATCH", "WHO_IS_THIS", "ROUTINE_BUILDER", "MEMORY_LANE"];

  for (let dayOffset = 13; dayOffset >= 0; dayOffset--) {
    const day = new Date();
    day.setDate(day.getDate() - dayOffset);
    day.setHours(10, 0, 0, 0);

    // Early in the window Aita plays comfortably. Over the last five days she
    // needs a few more hints — enough for the ML service to suggest a review,
    // but never enough to state anything about her condition.
    const isRecent = dayOffset <= 4;

    for (const gameType of gameTypes) {
      // Not every activity is played every day.
      if ((dayOffset + gameTypes.indexOf(gameType)) % 3 === 0 && dayOffset !== 0) continue;

      const playedAt = new Date(day);
      playedAt.setHours(9 + gameTypes.indexOf(gameType) * 2, 15 + dayOffset, 0, 0);

      if (gameType === "MEMORY_LANE") {
        gameSessions.push({
          eventId: randomUUID(),
          patientId: patient.id,
          deviceId: device.id,
          gameType,
          difficulty: 1,
          accuracy: null, // never scored
          responseTimeSeconds: 0,
          hintsUsed: 0,
          attempts: 0,
          completed: true,
          abandoned: false,
          engagementDurationSeconds: 180 + ((dayOffset * 37) % 240),
          playedAt,
          detail: { assetsViewed: ["seed/festival.png", "seed/tea-garden.png"], audioPlayedCount: 1, voluntaryCompletion: true },
        });
        continue;
      }

      const baseAccuracy = isRecent ? 0.62 : 0.82;
      const jitter = ((dayOffset * 13) % 9) / 100;
      const abandoned = isRecent && dayOffset === 2 && gameType === "ROUTINE_BUILDER";

      gameSessions.push({
        eventId: randomUUID(),
        patientId: patient.id,
        deviceId: device.id,
        gameType,
        difficulty: isRecent ? 2 : 2,
        accuracy: abandoned ? null : Number((baseAccuracy + jitter).toFixed(2)),
        responseTimeSeconds: isRecent ? 11.5 + (dayOffset % 4) : 8.2 + (dayOffset % 3),
        hintsUsed: isRecent ? 2 + (dayOffset % 2) : (dayOffset % 2),
        attempts: 8 + (dayOffset % 5),
        completed: !abandoned,
        abandoned,
        engagementDurationSeconds: abandoned ? 45 : 150 + ((dayOffset * 29) % 180),
        playedAt,
        detail: gameType === "MEMORY_MATCH"
          ? { matchedPairs: abandoned ? 1 : 3, totalPairs: 3 }
          : { selectedAnswerId: "seed", correctAnswerId: "seed" },
      });
    }
  }
  await prisma.gameSession.createMany({ data: gameSessions });

  /* ---------------------------------------------------------------------- */
  /*  Reminder history: completed and missed                                */
  /* ---------------------------------------------------------------------- */

  const reminderEvents: Prisma.ReminderEventCreateManyInput[] = [];
  const morningMedicine = schedules[0];
  const eveningMedicine = schedules[1];
  const water = schedules[2];

  for (let dayOffset = 6; dayOffset >= 1; dayOffset--) {
    const day = new Date();
    day.setDate(day.getDate() - dayOffset);

    const morningDue = new Date(day);
    morningDue.setHours(8, 0, 0, 0);
    const eveningDue = new Date(day);
    eveningDue.setHours(20, 0, 0, 0);
    const waterDue = new Date(day);
    waterDue.setHours(11, 0, 0, 0);

    // Morning medicine acknowledged every day.
    reminderEvents.push({
      eventId: randomUUID(), patientId: patient.id, deviceId: device.id,
      scheduleId: morningMedicine.id, scheduleVersion: 1, kind: "MEDICINE", critical: true,
      dueAt: morningDue, state: "ACKNOWLEDGED",
      stateChangedAt: new Date(morningDue.getTime() + 12 * 60 * 1000),
      snoozeCount: 0, helpRequested: false,
    });

    // Evening medicine missed on the two most recent days — this is what the
    // alert engine picks up during the demo journey.
    const eveningMissed = dayOffset <= 2;
    reminderEvents.push({
      eventId: randomUUID(), patientId: patient.id, deviceId: device.id,
      scheduleId: eveningMedicine.id, scheduleVersion: 1, kind: "MEDICINE", critical: true,
      dueAt: eveningDue,
      state: eveningMissed ? "MISSED" : "ACKNOWLEDGED",
      stateChangedAt: new Date(eveningDue.getTime() + 45 * 60 * 1000),
      snoozeCount: eveningMissed ? 1 : 0, helpRequested: false,
    });

    reminderEvents.push({
      eventId: randomUUID(), patientId: patient.id, deviceId: device.id,
      scheduleId: water.id, scheduleVersion: 1, kind: "HYDRATION", critical: false,
      dueAt: waterDue,
      state: dayOffset % 3 === 0 ? "SNOOZED" : "ACKNOWLEDGED",
      stateChangedAt: new Date(waterDue.getTime() + 8 * 60 * 1000),
      snoozeCount: dayOffset % 3 === 0 ? 1 : 0, helpRequested: false,
    });
  }
  await prisma.reminderEvent.createMany({ data: reminderEvents });

  /* ---------------------------------------------------------------------- */
  /*  Difficulty profiles                                                   */
  /* ---------------------------------------------------------------------- */

  await prisma.difficultyProfile.createMany({
    data: gameTypes.map((gameType) => ({
      patientId: patient.id,
      gameType,
      currentDifficulty: gameType === "MEMORY_LANE" ? 1 : 2,
      hintLevel: 1,
      reasonCode: "SEEDED_BASELINE",
      explanation:
        gameType === "MEMORY_LANE"
          ? "Memory Lane is a calm reminiscence activity and is not scored."
          : "Starting from the level Aita has been playing comfortably.",
      modelVersion: "seed-1.0.0",
      evidenceSessionCount: gameSessions.filter((s) => s.gameType === gameType).length,
    })),
  });

  /* ---------------------------------------------------------------------- */
  /*  One explainable, non-diagnostic trend observation                     */
  /* ---------------------------------------------------------------------- */

  await prisma.observation.create({
    data: {
      patientId: patient.id,
      period: "7d",
      status: "REVIEW_SUGGESTED",
      reasonCode: "SUSTAINED_HINT_INCREASE",
      explanation:
        "The patient required more hints in five of the last seven comparable sessions. Caregiver review is suggested.",
      isDiagnosis: false,
      indicators: [
        { name: "hints_per_session", current: 2.5, baseline: 0.5, direction: "UP", sample_size: 7 },
        { name: "median_accuracy", current: 0.66, baseline: 0.84, direction: "DOWN", sample_size: 7 },
      ] as Prisma.InputJsonValue,
      modelVersion: "trends-rules-1.0.0",
    },
  });

  /* ---------------------------------------------------------------------- */
  /*  Summary                                                               */
  /* ---------------------------------------------------------------------- */

  console.log(`
Seed complete.

  Patient           Aita, 72, Jorhat, Assam (Assamese)   ${patient.id}
  Second patient    Koka (deliberately NOT assigned to the caregiver)  ${otherPatient.id}
  Caregiver         ${DEMO.caregiver.email} / ${DEMO.caregiver.password}
  Health worker     ${DEMO.healthWorker.email} / ${DEMO.healthWorker.password}
  Admin             ${DEMO.admin.email} / ${DEMO.admin.password}
  Device pairing    ${DEMO.pairingCode}

  ${contacts.length} family contacts, ${familyPhotos.length} family photos, ${personalMemories.length} personal memories
  2 medicines, 3 routines, ${schedules.length} schedules
  ${gameSessions.length} game sessions across 14 days
  ${reminderEvents.length} reminder events (acknowledged, snoozed and missed)
  1 explainable non-diagnostic trend observation
`);
}

/**
 * One lightweight demonstration patient per North Eastern state, so every
 * regional content pack can be shown end to end. The North Eastern Region is
 * diverse: each of these carries its own state, community, language and a few
 * memories drawn from that pack — never a single "North East" identity.
 *
 * These are intentionally minimal (no game history or schedules); Aita remains
 * the full demo for the 18-step journey.
 */
const REGIONAL_DEMO_PATIENTS = [
  {
    code: "610001", state: "AR" as const, community: "arunachal.apatani", language: "njz",
    displayName: "Yapi", age: 74, location: "Ziro, Arunachal Pradesh",
    place: { titleEn: "The Ziro valley", titleLocal: "Ziro", storyEn: "You walked the paddy bunds every morning past the pine grove." },
    festival: { titleEn: "Myoko festival", titleLocal: "Myoko", storyEn: "The whole clan came together and the boys carried the bamboo." },
    family: { name: "Mudang", relationshipEn: "Son", relationshipLocal: "son", storyEn: "Mudang learned to fish the valley streams with you." },
  },
  {
    code: "610002", state: "MN" as const, community: "manipur.meitei", language: "mni",
    displayName: "Ibemma", age: 71, location: "Moirang, Manipur",
    place: { titleEn: "Loktak Lake", titleLocal: "Loktak", storyEn: "The fishing huts floated on the phumdi and you knew every channel." },
    festival: { titleEn: "Ningol Chakouba", titleLocal: "Ningol Chakouba", storyEn: "Every year your daughters came home and you cooked the whole day." },
    family: { name: "Thoibi", relationshipEn: "Daughter", relationshipLocal: "daughter", storyEn: "Thoibi wears the phanek you wove for her wedding." },
  },
  {
    code: "610003", state: "ML" as const, community: "meghalaya.khasi", language: "kha",
    displayName: "Kong Riti", age: 73, location: "Sohra, Meghalaya",
    place: { titleEn: "The living root bridge", titleLocal: "jingkieng jri", storyEn: "You crossed it to the market with the cane khoh on your back." },
    festival: { titleEn: "Shad Suk Mynsiem", titleLocal: "Shad Suk Mynsiem", storyEn: "You danced in the centre in your best jainsem." },
    family: { name: "Bah Kyrmen", relationshipEn: "Nephew", relationshipLocal: "nephew", storyEn: "In your clan the children take your name; Kyrmen still visits every week." },
  },
  {
    code: "610004", state: "MZ" as const, community: "mizoram.lusei", language: "lus",
    displayName: "Pi Lalthanpuii", age: 70, location: "Aizawl, Mizoram",
    place: { titleEn: "The jhum field", titleLocal: "lo", storyEn: "You climbed to the field above the clouds and rested under the tree." },
    festival: { titleEn: "Chapchar Kut", titleLocal: "Chapchar Kut", storyEn: "The cheraw poles clapped and you stepped through without missing." },
    family: { name: "Malsawma", relationshipEn: "Grandson", relationshipLocal: "grandson", storyEn: "Malsawma sings the carols with you at Christmas." },
  },
  {
    code: "610005", state: "NL" as const, community: "nagaland.angami", language: "nag",
    displayName: "Grandpa Kikru", age: 76, location: "Kohima, Nagaland",
    place: { titleEn: "The terrace fields of Khonoma", titleLocal: "fields", storyEn: "You cut the water channels along the stone terraces every spring." },
    festival: { titleEn: "Sekrenyi", titleLocal: "Sekrenyi", storyEn: "The village gate was decorated and the young men sang all night." },
    family: { name: "Neno", relationshipEn: "Granddaughter", relationshipLocal: "granddaughter", storyEn: "Neno is learning to weave your family's shawl." },
  },
  {
    code: "610006", state: "SK" as const, community: "sikkim.bhutia", language: "ne",
    displayName: "Aama Doma", age: 72, location: "Pelling, Sikkim",
    place: { titleEn: "Kanchenjunga at dawn", titleLocal: "Kanchenjunga", storyEn: "From the courtyard you watched the first light touch the peak." },
    festival: { titleEn: "Losar", titleLocal: "Losar", storyEn: "You hung new prayer flags and made a big pot of thukpa." },
    family: { name: "Tashi", relationshipEn: "Son", relationshipLocal: "son", storyEn: "Tashi drives the cardamom down to the market each season." },
  },
  {
    code: "610007", state: "TR" as const, community: "tripura.tripuri", language: "trp",
    displayName: "Kokma Bwtwi", age: 75, location: "Khumulwng, Tripura",
    place: { titleEn: "The bamboo grove behind the house", titleLocal: "bwrwi", storyEn: "You cut cane there for the mora stools the whole village sat on." },
    festival: { titleEn: "Garia Puja", titleLocal: "Garia", storyEn: "You dressed the bamboo pole with flowers and the kham drum played." },
    family: { name: "Kherengbar", relationshipEn: "Son", relationshipLocal: "son", storyEn: "Kherengbar plays the sumui flute the way his father did." },
  },
] as const;

async function seedRegionalDemoPatients(caregiverId: string, healthWorkerId: string) {
  for (const spec of REGIONAL_DEMO_PATIENTS) {
    const p = await prisma.patientProfile.create({
      data: {
        displayName: spec.displayName,
        preferredName: spec.displayName,
        age: spec.age,
        location: spec.location,
        preferredLanguage: spec.language,
        stateId: spec.state,
        communityId: spec.community,
        photoStorageKey: "seed/patient.png",
        largeText: true,
        audioGuidanceEnabled: true,
        packageVersion: 1,
      },
    });

    await prisma.caregiverAssignment.create({
      data: { userId: caregiverId, patientId: p.id, relationship: "Family", isPrimary: true },
    });
    await prisma.healthWorkerAssignment.create({
      data: { userId: healthWorkerId, patientId: p.id, facility: `${spec.location} sub-centre` },
    });

    await prisma.pairingCode.create({
      data: {
        code: spec.code,
        patientId: p.id,
        createdById: caregiverId,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        reusable: true,
      },
    });

    const consent = await prisma.consentRecord.create({
      data: {
        patientId: p.id,
        purpose: "Use pictures of familiar places, festivals and family in reminiscence activities",
        grantedByUserId: caregiverId,
        grantedByName: DEMO.caregiver.fullName,
        assetScope: "Places, festivals and family photographs",
        consentVersion: "1.0",
        status: "ACTIVE",
      },
    });

    await prisma.memoryAsset.createMany({
      data: [
        {
          patientId: p.id, consentId: consent.id, category: "MY_FAMILY", assetType: "PHOTO",
          titleEn: spec.family.name, titleAs: spec.family.name,
          captionEn: `Your ${spec.family.relationshipEn.toLowerCase()} ${spec.family.name}`,
          captionAs: `Your ${spec.family.relationshipLocal} ${spec.family.name}`,
          storageKey: "seed/grandson.png", mimeType: "image/png",
          personName: spec.family.name, relationshipEn: spec.family.relationshipEn, relationshipAs: spec.family.relationshipLocal,
          storyEn: spec.family.storyEn, storyAs: spec.family.storyEn,
          favourite: true,
        },
        {
          patientId: p.id, consentId: consent.id, category: "MY_PLACES", assetType: "PHOTO",
          titleEn: spec.place.titleEn, titleAs: spec.place.titleLocal,
          captionEn: spec.place.titleEn, captionAs: spec.place.titleLocal,
          storageKey: "seed/river.png", mimeType: "image/png",
          storyEn: spec.place.storyEn, storyAs: spec.place.storyEn,
        },
        {
          patientId: p.id, consentId: consent.id, category: "MY_FESTIVALS", assetType: "PHOTO",
          titleEn: spec.festival.titleEn, titleAs: spec.festival.titleLocal,
          captionEn: spec.festival.titleEn, captionAs: spec.festival.titleLocal,
          storageKey: "seed/festival.png", mimeType: "image/png",
          storyEn: spec.festival.storyEn, storyAs: spec.festival.storyEn,
          favourite: true,
        },
      ],
    });
  }

  console.log(`  Regional demo patients  ${REGIONAL_DEMO_PATIENTS.map((s) => `${s.displayName} (${s.state}, code ${s.code})`).join(", ")}`);
}

async function resetDemoData() {
  // Order matters only where cascades are absent.
  const demoEmails = [DEMO.caregiver.email, DEMO.healthWorker.email, DEMO.admin.email];
  const demoPatientNames = ["Aita", "Koka", ...REGIONAL_DEMO_PATIENTS.map((s) => s.displayName)];
  const patients = await prisma.patientProfile.findMany({
    where: { displayName: { in: demoPatientNames } },
    select: { id: true },
  });
  const patientIds = patients.map((p) => p.id);

  if (patientIds.length > 0) {
    await prisma.alertDedupe.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.auditLog.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.patientProfile.deleteMany({ where: { id: { in: patientIds } } });
  }
  await prisma.auditLog.deleteMany({ where: { actor: { email: { in: demoEmails } } } });
  await prisma.user.deleteMany({ where: { email: { in: demoEmails } } });
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
