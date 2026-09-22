import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Screen } from "@/Screen";
import { Button, Card, Field, Row } from "@/ui";
import { palette, space } from "@/theme";
import { getPatient, updatePatientContacts } from "@/patients";
import { emptyContactDraft, type ContactDraft } from "@/model";

export default function EditContacts() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [contacts, setContacts] = useState<ContactDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await getPatient(id);
      const existing = (p?.contacts ?? []).map((c) => ({
        name: c.name,
        relationship: c.relationship,
        phone: c.phone,
        isPrimary: c.isPrimary,
      }));
      setContacts(existing.length ? existing : [emptyContactDraft()]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const setContact = (i: number, patch: Partial<ContactDraft>) =>
    setContacts((list) => list.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const halfFilled = contacts.some((c) => {
    const n = c.name.trim().length > 0;
    const p = c.phone.replace(/\D/g, "").length > 0;
    return n !== p;
  });

  const save = async () => {
    setBusy(true);
    try {
      await updatePatientContacts(id, contacts);
      router.back();
    } catch (e) {
      Alert.alert("Could not save", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Screen eyebrow="Who they can call" title="Family & contacts">
        <ActivityIndicator color={palette.primary} style={{ marginTop: space.xl }} />
      </Screen>
    );
  }

  return (
    <Screen
      eyebrow="Who they can call"
      title="Family & contacts"
      subtitle="These appear on the patient's Call Family screen. The first one is their main contact."
    >
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

      {halfFilled ? (
        <Text style={{ color: palette.warn, fontSize: 13, marginTop: 4 }}>
          Each contact needs both a name and a phone number. Rows left blank are dropped.
        </Text>
      ) : null}

      <View style={{ marginTop: space.lg }}>
        <Button label="Save contacts" icon="check" onPress={save} loading={busy} />
      </View>
    </Screen>
  );
}
