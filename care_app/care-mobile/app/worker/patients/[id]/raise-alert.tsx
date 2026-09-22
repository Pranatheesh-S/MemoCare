import { useEffect, useState } from "react";
import { ActivityIndicator } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Screen } from "@/Screen";
import { AlertForm } from "@/AlertForm";
import { palette, space } from "@/theme";
import { getPatientName } from "@/health";

export default function WorkerRaiseAlert() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    void getPatientName(id).then(setName);
  }, [id]);

  if (!name) {
    return (
      <Screen title="Raise an alert">
        <ActivityIndicator color={palette.primary} style={{ marginTop: space.xl }} />
      </Screen>
    );
  }

  return (
    <AlertForm
      patient={{ id, name }}
      role="healthcare_worker"
      audience="caregiver"
      kind="health_risk"
      onDone={() => router.back()}
    />
  );
}
