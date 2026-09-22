import { useState } from "react";
import { Alert, Pressable, Switch, Text, View } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/auth";
import { api } from "@/api";
import { Screen } from "@/Screen";
import { Avatar, Button, Card, Field, Row, SectionHeader } from "@/ui";
import { LANGS, LANG_ENGLISH_NAME, LANG_NATIVE_NAME, useI18n } from "@/i18n";
import { palette, radius, space } from "@/theme";

export default function Settings() {
  const { user, logout } = useAuth();
  const { lang, setLang, t } = useI18n();
  const [email, setEmail] = useState(true);
  const [sms, setSms] = useState(true);
  const [reason, setReason] = useState("");

  async function signOut() {
    await logout();
    router.replace("/login");
  }

  return (
    <Screen eyebrow={t("settings.eyebrow")} title={t("settings.title")}>
      <Card>
        <Row>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, flex: 1 }}>
            <Avatar name={user?.name ?? "?"} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: palette.ink, fontSize: 16, fontWeight: "800" }}>{user?.name}</Text>
              <Text style={{ color: palette.inkSoft, fontSize: 13, marginTop: 2 }}>{user?.contact}</Text>
            </View>
          </View>
        </Row>
      </Card>

      <SectionHeader title={t("settings.language")} hint={t("settings.languageHint")} />
      <Card>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {LANGS.map((code) => {
            const active = lang === code;
            return (
              <Pressable
                key={code}
                onPress={() => setLang(code)}
                style={{
                  paddingVertical: 9,
                  paddingHorizontal: 13,
                  borderRadius: radius.pill,
                  borderWidth: 1.5,
                  borderColor: active ? palette.primary : palette.lineStrong,
                  backgroundColor: active ? palette.primary : palette.card,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {active ? <Feather name="check" size={13} color={palette.card} /> : null}
                <Text style={{ fontSize: 13.5, fontWeight: "800", color: active ? palette.card : palette.ink }}>
                  {LANG_NATIVE_NAME[code]}
                </Text>
                {LANG_NATIVE_NAME[code] !== LANG_ENGLISH_NAME[code] ? (
                  <Text style={{ fontSize: 11, color: active ? "#ffffffcc" : palette.faint }}>
                    {LANG_ENGLISH_NAME[code]}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        {lang !== "en" ? (
          <Text style={{ color: palette.faint, fontSize: 12, marginTop: space.sm, lineHeight: 17 }}>
            Some text may still show in English while translations are completed.
          </Text>
        ) : null}
      </Card>

      <SectionHeader title={t("settings.notifications")} />
      <Card>
        <Row style={{ paddingVertical: 10 }}>
          <Text style={{ color: palette.ink, fontSize: 14.5 }}>Email alerts</Text>
          <Switch value={email} onValueChange={setEmail} trackColor={{ true: palette.primary }} />
        </Row>
        <View style={{ height: 1, backgroundColor: palette.line }} />
        <Row style={{ paddingVertical: 10 }}>
          <Text style={{ color: palette.ink, fontSize: 14.5 }}>Urgent SMS</Text>
          <Switch value={sms} onValueChange={setSms} trackColor={{ true: palette.primary }} />
        </Row>
      </Card>

      <SectionHeader title={t("settings.privacy")} />
      <Card>
        <Text style={{ color: palette.ink, fontSize: 14.5, fontWeight: "700" }}>Request data deletion</Text>
        <Field label="Reason (optional)" value={reason} onChangeText={setReason} placeholder="Tell us why" multiline />
        <View style={{ marginTop: space.md }}>
          <Button
            label="Submit request"
            variant="ghost"
            icon="trash-2"
            onPress={() => {
              api.deleteRequest(reason);
              Alert.alert("Request submitted", "We will follow up by email.");
            }}
          />
        </View>
      </Card>

      <View style={{ marginTop: space.xl }}>
        <Button label={t("settings.signOut")} variant="danger" icon="log-out" onPress={signOut} />
      </View>
      <Text style={{ color: palette.faint, fontSize: 12, textAlign: "center", marginTop: space.lg }}>
        Remi Care · v1.0
      </Text>
    </Screen>
  );
}
