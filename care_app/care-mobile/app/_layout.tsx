import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import { AuthProvider } from "@/auth";
import { I18nProvider } from "@/i18n";
import { palette } from "@/theme";

// Hold the REMI splash until the first screen is mounted, then fade it out. The
// in-app loader in app/index.tsx shows the same logo on the same ground, so the
// hand-off is seamless.
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: 350, fade: true });

export default function Layout() {
  useEffect(() => {
    const t = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 150);
    return () => clearTimeout(t);
  }, []);

  return (
    <SafeAreaProvider>
      <I18nProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <View style={{ flex: 1, backgroundColor: palette.paper }}>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: palette.paper },
                animation: "fade",
              }}
            />
          </View>
        </AuthProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
