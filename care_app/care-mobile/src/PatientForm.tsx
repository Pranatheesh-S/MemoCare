import { useMemo, useState } from "react";
import { Alert, Image, Pressable, Switch, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Screen } from "./Screen";
import { Button, Card, Field, Note, Row, SectionHeader } from "./ui";
import { MemoryImageField } from "./MemoryImageField";
import { palette, radius, space, stateAccent } from "./theme";
import { createPatient, setPatientPhoto } from "./patients";
import { pickProfilePhoto } from "./photo";
import type { CareRole } from "./healthModel";
import {
  MEMORY_CATEGORIES,
  MEMORY_CATEGORY_LABEL,
  NE_STATES,
  emptyContactDraft,
  emptyMemoryDraft,
  emptyPatientDraft,
  stateById,
  validatePatientDraft,
  type ContactDraft,
  type MemoryDraft,
  type PatientDraft,
} from "./model";

/**
 * The full patient-provisioning form. Shared by the caregiver and health-worker
 * portals — `role` decides which portal owns the new record, `onCreated` routes
 * on to the right patient screen.
 */
export function PatientForm({
  role,
  onCreated,
  eyebrow = "Set up their app",
  title = "New patient",
}: {
  role: CareRole;
  onCreated: (id: string, code: string) => void;
  eyebrow?: string;
  title?: string;
}) {
  const [draft, setDraft] = useState<PatientDraft>(emptyPatientDraft);
  const [memories, setMemories] = useState<MemoryDraft[]>([emptyMemoryDraft()]);
  const [contacts, setContacts] = useState<ContactDraft[]>([emptyContactDraft()]);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"" | "creating" | "photo">("");
  const [showErrors, setShowErrors] = useState(false);

  const set = <K extends keyof PatientDraft>(key: K, value: PatientDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const setMemory = (i: number, patch: Partial<MemoryDraft>) =>
    setMemories((list) => list.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  const setContact = (i: number, patch: Partial<ContactDraft>) =>
    setContacts((list) => list.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const withContacts = useMemo(() => ({ ...draft, contacts }), [draft, contacts]);
  const errors = useMemo(() => validatePatientDraft(withContacts, memories), [withContacts, memories]);
  const errorFor = (field: string) => (showErrors ? errors.find((e) => e.field === field)?.message : undefined);
  const accent = stateAccent(draft.stateId);

  const chooseState = (id: PatientDraft["stateId"]) =>
    setDraft((d) => ({ ...d, stateId: id, language: stateById(id).language }));

  const addPhoto = async () => {
    try {
      const picked = await pickProfilePhoto();
      if (picked) setPhotoUri(picked.dataUri);
    } catch (e) {
      Alert.alert("Photo", e instanceof Error ? e.message : "Could not open photos.");
    }
  };

  const submit = async () => {
    if (errors.length > 0) {
      setShowErrors(true);
      return;
    }
    setBusy(true);
    try {
      setStage("creating");
      const { id, code } = await createPatient(withContacts, memories, { as: role });
      if (photoUri) {
        setStage("photo");
        try {
          await setPatientPhoto(id, photoUri);
        } catch {
          Alert.alert("Photo not saved", "The patient was created; you can add the photo from their profile.");
        }
      }
      onCreated(id, code);
    } catch (e) {
      Alert.alert("Could not create patient", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
      setStage("");
    }
  };

  return (
    <Screen eyebrow={eyebrow} title={title}>
      <Card>
        <Row>
          <Pressable
            onPress={addPhoto}
            style={{
              width: 84,
              height: 84,
              borderRadius: 42,
              backgroundColor: palette.primaryTint,
              borderWidth: 2,
              borderColor: palette.primarySoft,
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={{ width: "100%", height: "100%" }} />
            ) : (
              <Feather name="camera" size={24} color={palette.primary} />
            )}
          </Pressable>
          <View style={{ flex: 1, marginLeft: space.md }}>
            <Text style={{ color: palette.ink, fontSize: 15, fontWeight: "800" }}>Profile photo</Text>
            <Text style={{ color: palette.inkSoft, fontSize: 13, marginTop: 3 }}>
              Shown on the patient's home screen. Optional.
            </Text>
            <Pressable onPress={addPhoto} style={{ marginTop: 8 }}>
              <Text style={{ color: palette.primary, fontWeight: "800" }}>
                {photoUri ? "Change photo" : "Choose photo"}
              </Text>
            </Pressable>
          </View>
        </Row>
      </Card>

      <SectionHeader title="Who they are" />
      <Card>
        <Field label="Full name" value={draft.displayName} onChangeText={(v) => set("displayName", v)} placeholder="Aita Devi" autoCapitalize="words" error={errorFor("displayName")} />
        <Field label="They like to be called" value={draft.preferredName} onChangeText={(v) => set("preferredName", v)} placeholder="Aita" autoCapitalize="words" error={errorFor("preferredName")} />
        <Field
          label="Age"
          value={draft.age ? String(draft.age) : ""}
          onChangeText={(v) => set("age", Number(v.replace(/[^0-9]/g, "")) || 0)}
          keyboardType="number-pad"
          error={errorFor("age")}
        />
      </Card>

      <SectionHeader
        title="Home & language"
        hint="The patient's app — its pictures, festivals, food and narration — follows from their state."
      />
      <Card>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {NE_STATES.map((st) => {
            const active = draft.stateId === st.id;
            return (
              <Pressable
                key={st.id}
                onPress={() => chooseState(st.id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 7,
                  paddingVertical: 9,
                  paddingHorizontal: 12,
                  borderRadius: radius.pill,
                  borderWidth: 1.5,
                  borderColor: active ? st.accent : palette.lineStrong,
                  backgroundColor: active ? `${st.accent}14` : palette.card,
                }}
              >
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: st.accent }} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: active ? st.accent : palette.inkSoft }}>{st.name}</Text>
                {active ? <Feather name="check" size={13} color={st.accent} /> : null}
              </Pressable>
            );
          })}
        </View>
        <Note>
          Patient app theme: <Text style={{ fontWeight: "800" }}>{stateById(draft.stateId).name}</Text> · narration “{draft.language}”
        </Note>
        <Field label="Village / town (optional)" value={draft.village ?? ""} onChangeText={(v) => set("village", v)} placeholder="Majuli" autoCapitalize="words" />
      </Card>

      <SectionHeader title="Comfort" />
      <Card>
        <Toggle label="Bigger text" value={draft.largeText} onChange={(v) => set("largeText", v)} />
        <Toggle label="Reduce motion" value={draft.reducedMotion} onChange={(v) => set("reducedMotion", v)} />
        <Toggle label="Spoken guidance" value={draft.audioGuidance} onChange={(v) => set("audioGuidance", v)} />
      </Card>

      <SectionHeader
        title="Family & contacts"
        hint="Whoever the patient can call from the app. The first one is their main contact."
      />
      {contacts.map((contact, index) => (
        <Card key={index}>
          <Row>
            <Text style={{ color: palette.inkSoft, fontSize: 12, fontWeight: "800", letterSpacing: 0.5 }}>
              CONTACT {index + 1}
              {index === 0 ? " · MAIN" : ""}
            </Text>
            {contacts.length > 1 ? (
              <Pressable onPress={() => setContacts((list) => list.filter((_, i) => i !== index))} hitSlop={8}>
                <Feather name="trash-2" size={16} color={palette.danger} />
              </Pressable>
            ) : null}
          </Row>
          <Field label="Name" value={contact.name} onChangeText={(v) => setContact(index, { name: v })} placeholder="Nabanita" autoCapitalize="words" />
          <Field label="Relationship" value={contact.relationship} onChangeText={(v) => setContact(index, { relationship: v })} placeholder="Daughter" autoCapitalize="words" />
          <Field
            label="Phone number"
            value={contact.phone}
            onChangeText={(v) => setContact(index, { phone: v })}
            placeholder="+91 90000 00000"
            keyboardType="phone-pad"
          />
        </Card>
      ))}
      <Pressable
        onPress={() => setContacts((list) => [...list, emptyContactDraft()])}
        style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: space.sm }}
      >
        <Feather name="plus-circle" size={17} color={palette.primary} />
        <Text style={{ color: palette.primary, fontWeight: "800" }}>Add another contact</Text>
      </Pressable>

      <SectionHeader
        title="Their memories"
        hint="A few people, places and happy days. The games use these — familiar faces and objects, never stock photos."
      />
      {memories.map((memory, index) => (
        <Card key={index} accent={accent}>
          <Row>
            <Text style={{ color: palette.inkSoft, fontSize: 12, fontWeight: "800", letterSpacing: 0.5 }}>
              MEMORY {index + 1}
            </Text>
            {memories.length > 1 ? (
              <Pressable onPress={() => setMemories((list) => list.filter((_, i) => i !== index))} hitSlop={8}>
                <Feather name="trash-2" size={16} color={palette.danger} />
              </Pressable>
            ) : null}
          </Row>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.sm }}>
            {MEMORY_CATEGORIES.map((category) => {
              const active = memory.category === category;
              return (
                <Pressable
                  key={category}
                  onPress={() => setMemory(index, { category })}
                  style={{
                    paddingVertical: 7,
                    paddingHorizontal: 12,
                    borderRadius: radius.pill,
                    borderWidth: 1.5,
                    borderColor: active ? palette.ink : palette.lineStrong,
                    backgroundColor: active ? palette.ink : palette.card,
                  }}
                >
                  <Text style={{ fontSize: 12.5, fontWeight: "700", color: active ? palette.card : palette.inkSoft }}>
                    {MEMORY_CATEGORY_LABEL[category]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {memory.category === "MY_FAMILY" ? (
            <>
              <Field label="Person's name" value={memory.personName ?? ""} onChangeText={(v) => setMemory(index, { personName: v })} placeholder="Nabanita" autoCapitalize="words" />
              <Field label="Relationship" value={memory.relationship ?? ""} onChangeText={(v) => setMemory(index, { relationship: v })} placeholder="Daughter" autoCapitalize="words" />
            </>
          ) : null}
          <Field label="Title" value={memory.title} onChangeText={(v) => setMemory(index, { title: v })} placeholder="Evening tea in the garden" />
          <Field
            label="The story"
            value={memory.story}
            onChangeText={(v) => setMemory(index, { story: v })}
            placeholder="Nabanita brings red tea every evening and you talk about the garden."
            multiline
          />
          <MemoryImageField value={memory.imageUri} onChange={(uri) => setMemory(index, { imageUri: uri })} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.md }}>
            <Text style={{ color: palette.ink, fontSize: 14.5 }}>Mark as a favourite</Text>
            <Switch
              value={Boolean(memory.favourite)}
              onValueChange={(v) => setMemory(index, { favourite: v })}
              trackColor={{ true: palette.primary }}
            />
          </View>
        </Card>
      ))}

      <Pressable
        onPress={() => setMemories((list) => [...list, emptyMemoryDraft()])}
        style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: space.sm }}
      >
        <Feather name="plus-circle" size={17} color={palette.primary} />
        <Text style={{ color: palette.primary, fontWeight: "800" }}>Add another memory</Text>
      </Pressable>

      {showErrors && errors.length > 0 ? (
        <View style={{ marginTop: space.md, gap: 4 }}>
          {errors.map((e) => (
            <Text key={e.field + e.message} style={{ color: palette.danger, fontSize: 13 }}>
              • {e.message}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={{ marginTop: space.lg }}>
        <Button
          label={stage === "photo" ? "Saving photo…" : stage === "creating" ? "Creating…" : "Create patient & get code"}
          icon="check-circle"
          onPress={submit}
          loading={busy}
        />
      </View>
    </Screen>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 11 }}>
      <Text style={{ color: palette.ink, fontSize: 14.5 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: palette.primary }} />
    </View>
  );
}
