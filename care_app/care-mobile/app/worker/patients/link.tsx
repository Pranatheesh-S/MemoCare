import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { Screen } from "@/Screen";
import { Button, Card, Field, Note } from "@/ui";
import { palette, space } from "@/theme";
import { formatCode, isValidCode, normaliseCode } from "@/codes";
import { linkPatientByCode } from "@/patients";

export default function LinkPatient() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const norm = normaliseCode(code);
  const ok = isValidCode(norm);

  const submit = async () => {
    setBusy(true);
    try {
      const { id } = await linkPatientByCode(norm);
      router.replace({ pathname: "/worker/patients/[id]", params: { id } } as unknown as Href);
    } catch (e) {
      Alert.alert("Could not link", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      eyebrow="Join a patient's care team"
      title="Link with a code"
      subtitle="Ask the caregiver for the 6-character code shown on the patient's profile."
    >
      <Card>
        <Field
          label="Pairing code"
          value={code}
          onChangeText={setCode}
          placeholder="ABC-123"
          autoCapitalize="characters"
        />
        {norm.length >= 3 ? (
          <Text style={{ color: palette.primaryDark, fontSize: 24, fontWeight: "900", letterSpacing: 6, marginTop: space.sm }}>
            {formatCode(norm)}
          </Text>
        ) : null}
        <Note>
          Linking lets you record health checks and raise alerts for this patient. It does not change the patient's app or
          their family caregiver.
        </Note>
        <View style={{ marginTop: space.md }}>
          <Button label="Link patient" icon="link" onPress={submit} loading={busy} disabled={!ok} />
        </View>
      </Card>
    </Screen>
  );
}
