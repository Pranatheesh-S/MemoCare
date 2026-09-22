import { Stack } from "expo-router";
import { palette } from "@/theme";

export default function PatientStack() {
  // Screens render their own header (see src/Screen.tsx); the native header is
  // only the back affordance.
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitle: "",
        headerShadowVisible: false,
        headerTintColor: palette.primary,
        headerStyle: { backgroundColor: palette.paper },
        contentStyle: { backgroundColor: palette.paper },
      }}
    />
  );
}
