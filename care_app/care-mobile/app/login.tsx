import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/auth";
import { Button, Card, Field } from "@/ui";
import { palette, space } from "@/theme";
import type { Role } from "@/types";

export default function Login() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [role, setRole] = useState<Role>("caregiver");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === "signup") {
        if (password.length < 6) throw new Error("Use a password of at least 6 characters.");
        await signUp(name.trim(), email.trim(), password, role);
      } else {
        await signIn(email.trim(), password);
      }
      // app/index.tsx redirects to the right portal for this account's role.
      router.replace("/");
    } catch (e) {
      Alert.alert(
        mode === "signup" ? "Could not create account" : "Sign in failed",
        e instanceof Error ? e.message.replace(/^Firebase:\s*/, "") : "Try again",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.paper }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space.xl, paddingTop: space.xxl }} keyboardShouldPersistTaps="handled">
          <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center" }}>
            <Feather name="heart" size={24} color={palette.card} />
          </View>
          <Text style={{ color: palette.primary, fontWeight: "800", letterSpacing: 2.5, marginTop: space.xl, fontSize: 12 }}>
            REMI CARE
          </Text>
          <Text style={{ color: palette.ink, fontSize: 34, fontWeight: "900", letterSpacing: -1, marginTop: 8 }}>
            Care, kept close.
          </Text>
          <Text style={{ color: palette.inkSoft, fontSize: 15.5, lineHeight: 23, marginTop: 10 }}>
            {mode === "signup"
              ? "Create your account as a family caregiver or a health worker, then set up or join a patient in minutes."
              : "Sign in to manage your patients and their care."}
          </Text>

          <View style={{ flexDirection: "row", backgroundColor: palette.paperDim, borderRadius: 14, padding: 4, marginTop: space.xl }}>
            {(["signin", "signup"] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 11,
                  alignItems: "center",
                  backgroundColor: mode === m ? palette.card : "transparent",
                }}
              >
                <Text style={{ fontWeight: "800", fontSize: 14, color: mode === m ? palette.ink : palette.inkSoft }}>
                  {m === "signin" ? "Sign in" : "Create account"}
                </Text>
              </Pressable>
            ))}
          </View>

          {mode === "signup" ? (
            <View style={{ marginTop: space.lg }}>
              <Text style={{ color: palette.inkSoft, fontSize: 11, fontWeight: "800", letterSpacing: 0.7, marginBottom: 8 }}>
                I AM A
              </Text>
              <View style={{ flexDirection: "row", gap: space.sm }}>
                {([
                  { key: "caregiver", label: "Family caregiver", icon: "heart" },
                  { key: "healthcare_worker", label: "Health worker", icon: "activity" },
                ] as const).map((opt) => {
                  const active = role === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => setRole(opt.key)}
                      style={{
                        flex: 1,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 7,
                        paddingVertical: 12,
                        borderRadius: 12,
                        borderWidth: 1.5,
                        borderColor: active ? palette.primary : palette.lineStrong,
                        backgroundColor: active ? palette.primaryTint : palette.card,
                      }}
                    >
                      <Feather name={opt.icon} size={15} color={active ? palette.primary : palette.inkSoft} />
                      <Text style={{ fontSize: 13, fontWeight: "800", color: active ? palette.primaryDark : palette.inkSoft }}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <Card style={{ marginTop: space.lg }}>
            {mode === "signup" ? (
              <Field label="Your name" value={name} onChangeText={setName} placeholder="Riya Sharma" autoCapitalize="words" />
            ) : null}
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.org"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
            <View style={{ marginTop: space.lg }}>
              <Button
                label={mode === "signup" ? "Create account" : "Sign in"}
                onPress={submit}
                loading={busy}
                disabled={!email || !password || (mode === "signup" && !name)}
                icon={mode === "signup" ? "user-plus" : "log-in"}
              />
            </View>
          </Card>

          <Text style={{ color: palette.faint, fontSize: 12.5, textAlign: "center", marginTop: space.lg, lineHeight: 18 }}>
            Remi supports care coordination. It is not a medical or emergency service.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
