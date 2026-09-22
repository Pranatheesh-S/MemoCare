import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, Share, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams, type Href } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Screen } from "@/Screen";
import { Avatar, Button, Card, KeyValue, LinkButton, Pill, Row, SectionHeader } from "@/ui";
import { palette, radius, space, stateAccent } from "@/theme";
import { formatCode } from "@/codes";
import { getPatient, listMemories, regeneratePairingCode, setPatientPhoto } from "@/patients";
import { pickProfilePhoto } from "@/photo";
import { MEMORY_CATEGORY_LABEL, stateById, type MemoryDoc, type PatientDoc } from "@/model";
import { formatDuration } from "@/voiceScript";
import { LANG_NATIVE_NAME, stateLang, useI18n } from "@/i18n";

export default function PatientDetail() {
  const params = useLocalSearchParams<{ id: string; justCreated?: string }>();
  const patientId = params.id;
  const { lang, setLang, t } = useI18n();
  const [patient, setPatient] = useState<PatientDoc | null>(null);
  const [memories, setMemories] = useState<MemoryDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState<string>(params.justCreated ?? "");
  const [regenerating, setRegenerating] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, m] = await Promise.all([getPatient(patientId), listMemories(patientId)]);
      setPatient(p);
      setMemories(m);
      if (p?.code) setCode(p.code);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  // Reload on focus so a memory / contact added on a child screen shows up.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const changePhoto = async () => {
    try {
      const picked = await pickProfilePhoto();
      if (!picked) return;
      setPhotoBusy(true);
      await setPatientPhoto(patientId, picked.dataUri);
      setPatient((p) => (p ? { ...p, photoUrl: picked.dataUri } : p));
    } catch (e) {
      Alert.alert("Could not save the photo", e instanceof Error ? e.message : "Try again");
    } finally {
      setPhotoBusy(false);
    }
  };

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const next = await regeneratePairingCode(patientId);
      setCode(next);
      Alert.alert("New code", `The old code no longer works. Share ${formatCode(next)} with the patient's device.`);
    } catch (e) {
      Alert.alert("Could not make a new code", e instanceof Error ? e.message : "Try again");
    } finally {
      setRegenerating(false);
    }
  };

  if (loading) {
    return (
      <Screen title="Patient">
        <ActivityIndicator color={palette.primary} style={{ marginTop: space.xl }} />
      </Screen>
    );
  }
  if (!patient) {
    return (
      <Screen title="Patient">
        <Text style={{ color: palette.inkSoft }}>This patient could not be found.</Text>
      </Screen>
    );
  }

  const accent = stateAccent(patient.stateId);
  const stateName = stateById(patient.stateId).name;
  const patientLang = stateLang(patient.stateId);

  return (
    <Screen
      eyebrow={t("patient.profileEyebrow")}
      title={patient.preferredName || patient.displayName}
      right={
        patientLang !== "en" ? (
          <View style={{ flexDirection: "row", borderRadius: radius.pill, overflow: "hidden", borderWidth: 1.5, borderColor: palette.primarySoft }}>
            {(["en", patientLang] as const).map((code) => {
              const active = lang === code;
              return (
                <Pressable
                  key={code}
                  onPress={() => setLang(code)}
                  style={{ paddingVertical: 5, paddingHorizontal: 10, backgroundColor: active ? palette.primary : palette.card }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "800", color: active ? palette.card : palette.inkSoft }}>
                    {code === "en" ? "EN" : LANG_NATIVE_NAME[code]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : undefined
      }
    >
      {params.justCreated ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            backgroundColor: palette.successSoft,
            borderRadius: radius.md,
            padding: space.md,
            marginBottom: space.md,
          }}
        >
          <Feather name="check-circle" size={16} color={palette.success} />
          <Text style={{ color: palette.success, fontWeight: "700", flex: 1, fontSize: 13.5 }}>
            Patient created. Give them this code to open their app.
          </Text>
        </View>
      ) : null}

      {/* The hand-off card */}
      <Card style={{ backgroundColor: palette.primaryTint, borderWidth: 1.5, borderColor: palette.primarySoft }}>
        <Text style={{ color: palette.primaryDark, fontSize: 11, fontWeight: "800", letterSpacing: 1.4, textAlign: "center" }}>
          {t("patient.pairingCode")}
        </Text>
        <Text style={{ color: palette.primaryDark, fontSize: 44, fontWeight: "900", letterSpacing: 8, textAlign: "center", marginTop: 6 }}>
          {formatCode(code)}
        </Text>
        <Text style={{ color: palette.inkSoft, fontSize: 12.5, textAlign: "center", marginTop: 6 }}>
          Enter this on the patient's phone. Valid for 30 days.
        </Text>
        <View style={{ flexDirection: "row", gap: space.md, marginTop: space.md, justifyContent: "center" }}>
          <Pressable
            onPress={() => Share.share({ message: `Remi code for ${patient.preferredName}: ${formatCode(code)}` })}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <Feather name="share-2" size={15} color={palette.primaryDark} />
            <Text style={{ color: palette.primaryDark, fontWeight: "800" }}>{t("patient.share")}</Text>
          </Pressable>
          <View style={{ width: 1, backgroundColor: palette.primarySoft }} />
          <Pressable
            disabled={regenerating}
            onPress={regenerate}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <Feather name="refresh-cw" size={15} color={regenerating ? palette.faint : palette.danger} />
            <Text style={{ color: regenerating ? palette.faint : palette.danger, fontWeight: "800" }}>
              {regenerating ? t("common.loading") : t("patient.newCode")}
            </Text>
          </Pressable>
        </View>
      </Card>

      <View style={{ marginBottom: space.md, gap: space.sm }}>
        <Button
          label={t("patient.report")}
          icon="bar-chart-2"
          variant="secondary"
          onPress={() =>
            // The typed-routes map regenerates on the next `expo start`; cast until then.
            router.push({
              pathname: "/caregiver/patients/[id]/report",
              params: { id: patientId },
            } as unknown as Href)
          }
        />
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button
            label={t("patient.routine")}
            icon="calendar"
            variant="secondary"
            full={false}
            onPress={() =>
              router.push({ pathname: "/caregiver/patients/[id]/routine", params: { id: patientId } } as unknown as Href)
            }
          />
          <Button
            label={t("patient.medicines")}
            icon="plus-square"
            variant="secondary"
            full={false}
            onPress={() =>
              router.push({ pathname: "/caregiver/patients/[id]/medicines", params: { id: patientId } } as unknown as Href)
            }
          />
        </View>
        <Button
          label={t("patient.raiseAlert")}
          icon="bell"
          variant="ghost"
          onPress={() =>
            router.push({
              pathname: "/caregiver/patients/[id]/raise-alert",
              params: { id: patientId },
            } as unknown as Href)
          }
        />
      </View>

      <Card accent={accent}>
        <Row>
          <View style={{ flexDirection: "row", gap: space.md, alignItems: "center", flex: 1 }}>
            <Pressable onPress={changePhoto} disabled={photoBusy}>
              {patient.photoUrl ? (
                <Image
                  source={{ uri: patient.photoUrl }}
                  style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: `${accent}55` }}
                />
              ) : (
                <Avatar name={patient.preferredName || patient.displayName} accent={accent} size={48} />
              )}
              {photoBusy ? (
                <View
                  style={{
                    position: "absolute",
                    inset: 0,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#0006",
                    borderRadius: 24,
                  }}
                >
                  <ActivityIndicator size="small" color="#fff" />
                </View>
              ) : null}
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={{ color: palette.ink, fontSize: 16, fontWeight: "800" }}>{patient.displayName}</Text>
              <Text style={{ color: palette.inkSoft, fontSize: 13, marginTop: 2 }}>
                {stateName}{patient.village ? ` · ${patient.village}` : ""} · age {patient.age}
              </Text>
              <Pressable onPress={changePhoto} disabled={photoBusy} style={{ marginTop: 4 }}>
                <Text style={{ color: palette.primary, fontWeight: "700", fontSize: 12.5 }}>
                  {patient.photoUrl ? t("patient.changePhoto") : t("patient.addPhoto")}
                </Text>
              </Pressable>
            </View>
          </View>
          {patient.pairedAt ? <Pill label="Paired" tone="success" icon="check" /> : <Pill label="Not paired" tone="info" icon="clock" />}
        </Row>
        <View style={{ height: 1, backgroundColor: palette.line, marginVertical: space.md }} />
        <KeyValue k="App theme & narration" v={`${stateName} · “${patient.language}”`} />
        <KeyValue k="Bigger text" v={patient.largeText ? "On" : "Off"} />
        <KeyValue k="Reduced motion" v={patient.reducedMotion ? "On" : "Off"} />
        <KeyValue k="Spoken guidance" v={patient.audioGuidance ? "On" : "Off"} />
        <KeyValue
          k="Device"
          v={patient.pairedAt ? `Paired ${new Date(patient.pairedAt).toLocaleDateString()}` : "Waiting for the code"}
        />
      </Card>

      <SectionHeader
        title={t("patient.assistantVoice")}
        action={
          <LinkButton
            label={patient.voice ? t("patient.reRecord") : t("patient.record")}
            icon="mic"
            onPress={() =>
              router.push({ pathname: "/caregiver/patients/[id]/voice", params: { id: patientId } } as unknown as Href)
            }
          />
        }
      />
      <Card>
        {patient.voice ? (
          <Row>
            <View style={{ flex: 1 }}>
              <Text style={{ color: palette.ink, fontSize: 14.5, fontWeight: "800" }}>Your voice is set</Text>
              <Text style={{ color: palette.inkSoft, fontSize: 13, marginTop: 2, lineHeight: 19 }}>
                Recorded {new Date(patient.voice.recordedAt).toLocaleDateString()} ·{" "}
                {formatDuration(patient.voice.durationSec)} · the patient&rsquo;s assistant speaks in it
              </Text>
            </View>
            <Feather name="mic" size={16} color={palette.primary} />
          </Row>
        ) : (
          <Text style={{ color: palette.inkSoft, fontSize: 13.5, lineHeight: 20 }}>
            Not recorded yet. Read 14 short lines aloud and {patient.preferredName || patient.displayName}&rsquo;s app
            will guide them in your voice. Until then it uses the device voice.
          </Text>
        )}
      </Card>

      <SectionHeader
        title={`${t("patient.family")} (${patient.contacts?.length ?? 0})`}
        action={
          <LinkButton
            label={(patient.contacts?.length ?? 0) > 0 ? t("common.edit") : t("common.add")}
            icon="edit-2"
            onPress={() =>
              router.push({ pathname: "/caregiver/patients/[id]/contacts", params: { id: patientId } } as unknown as Href)
            }
          />
        }
      />
      {(patient.contacts ?? []).length === 0 ? (
        <Text style={{ color: palette.inkSoft }}>{t("patient.noContacts")}</Text>
      ) : (
        (patient.contacts ?? []).map((c, i) => (
          <Card key={`${c.phone}-${i}`}>
            <Row>
              <View style={{ flex: 1 }}>
                <Text style={{ color: palette.ink, fontSize: 15.5, fontWeight: "800" }}>
                  {c.name}
                  {c.isPrimary ? "  ·  main" : ""}
                </Text>
                <Text style={{ color: palette.inkSoft, fontSize: 13, marginTop: 2 }}>{c.relationship}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Feather name="phone" size={13} color={palette.primary} />
                <Text style={{ color: palette.primaryDark, fontSize: 13.5, fontWeight: "700" }}>{c.phone}</Text>
              </View>
            </Row>
          </Card>
        ))
      )}

      <SectionHeader
        title={`${t("patient.memories")} (${memories.length})`}
        action={
          <LinkButton
            label={t("common.add")}
            icon="plus"
            onPress={() =>
              router.push({ pathname: "/caregiver/patients/[id]/add-memory", params: { id: patientId } } as unknown as Href)
            }
          />
        }
      />
      {memories.length === 0 ? (
        <Text style={{ color: palette.inkSoft }}>{t("patient.noMemories")}</Text>
      ) : (
        memories.map((m) => (
          <Card key={m.id}>
            <Row>
              <Text style={{ color: palette.inkSoft, fontSize: 12, fontWeight: "800", letterSpacing: 0.4 }}>
                {(MEMORY_CATEGORY_LABEL[m.category] ?? m.category).toUpperCase()}
              </Text>
              {m.favourite ? <Feather name="star" size={14} color={palette.sand} /> : null}
            </Row>
            {m.personName ? (
              <Text style={{ color: palette.primaryDark, fontSize: 13, fontWeight: "700", marginTop: 4 }}>
                {m.personName}
                {m.relationship ? ` · ${m.relationship}` : ""}
              </Text>
            ) : null}
            <Text style={{ color: palette.ink, fontSize: 15.5, fontWeight: "800", marginTop: 4 }}>{m.title}</Text>
            <Text style={{ color: palette.ink, fontSize: 14, lineHeight: 21, marginTop: 4 }}>{m.story}</Text>
            {m.imageUri ? (
              <Image
                source={{ uri: m.imageUri }}
                style={{ width: "100%", height: 160, borderRadius: radius.md, marginTop: space.sm, backgroundColor: palette.paperDim }}
                resizeMode="cover"
              />
            ) : null}
          </Card>
        ))
      )}
    </Screen>
  );
}
