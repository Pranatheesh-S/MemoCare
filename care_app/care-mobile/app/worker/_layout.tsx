import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { palette } from "@/theme";

export default function Layout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.faint,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: { fontSize: 11.5, fontWeight: "700", marginBottom: 6 },
        tabBarItemStyle: { paddingTop: 8 },
        tabBarStyle: {
          height: 70,
          paddingBottom: 10,
          paddingTop: 2,
          borderTopColor: palette.line,
          borderTopWidth: 1,
          backgroundColor: palette.card,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Patients", tabBarIcon: ({ color }) => <Feather name="users" size={20} color={color} /> }}
      />
      <Tabs.Screen
        name="alerts"
        options={{ title: "Alerts", tabBarIcon: ({ color }) => <Feather name="bell" size={20} color={color} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: "Settings", tabBarIcon: ({ color }) => <Feather name="settings" size={20} color={color} /> }}
      />
      <Tabs.Screen name="patients" options={{ href: null }} />
    </Tabs>
  );
}
