import React from "react";
import { StatusBar } from "expo-status-bar";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { colors } from "../src/theme/colors";
import { SpotlightOverlay } from "../src/components/SpotlightOverlay";

/**
 * TanStack Query is configured for an offline-first app: nothing retries
 * aggressively, cached data is served immediately, and a failed fetch never
 * blocks a screen — SQLite is always the fallback.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      refetchOnWindowFocus: false,
      networkMode: "offlineFirst",
    },
    mutations: {
      retry: 0,
      networkMode: "offlineFirst",
    },
  },
});

export default function RootLayout(): React.ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            // Gentle transitions; individual screens honour reduced motion.
            animation: "fade",
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="splash" />
          <Stack.Screen name="device-pairing" />
          <Stack.Screen name="profile-selection" />
          <Stack.Screen name="home" />
          <Stack.Screen name="talk-companion" />
          <Stack.Screen name="games/index" />
          <Stack.Screen name="games/memory-match" />
          <Stack.Screen name="games/routine-builder" />
          <Stack.Screen name="games/who-is-this" />
          <Stack.Screen name="games/memory-lane" />
          <Stack.Screen name="my-day" />
          <Stack.Screen name="my-memories" />
          <Stack.Screen name="call-family" />
          <Stack.Screen name="help" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="sync-status" />
        </Stack>
        <SpotlightOverlay />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
