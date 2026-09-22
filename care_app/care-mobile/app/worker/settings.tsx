import { Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/auth";
import { Screen } from "@/Screen";
import { Avatar, Button, Card, Row } from "@/ui";
import { palette, space } from "@/theme";

export default function Settings() {
  const { user, logout } = useAuth();

  async function signOut() {
    await logout();
    router.replace("/login");
  }

  return (
    <Screen eyebrow="Your account" title="Settings">
      <Card>
        <Row>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, flex: 1 }}>
            <Avatar name={user?.name ?? "?"} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: palette.ink, fontSize: 16, fontWeight: "800" }}>{user?.name}</Text>
              <Text style={{ color: palette.inkSoft, fontSize: 13, marginTop: 2 }}>{user?.contact}</Text>
              <Text style={{ color: palette.primary, fontSize: 12, fontWeight: "800", marginTop: 4, letterSpacing: 0.5 }}>
                HEALTH WORKER
              </Text>
            </View>
          </View>
        </Row>
      </Card>

      <Card>
        <Text style={{ color: palette.ink, fontSize: 14, lineHeight: 21 }}>
          You can add patients, link to patients a family caregiver has set up using their code, record health checks, and
          raise alerts for the caregiver. You also receive alerts caregivers raise for your patients.
        </Text>
      </Card>

      <View style={{ marginTop: space.xl }}>
        <Button label="Sign out" variant="danger" icon="log-out" onPress={signOut} />
      </View>
      <Text style={{ color: palette.faint, fontSize: 12, textAlign: "center", marginTop: space.lg }}>
        Remi Care · v1.0
      </Text>
    </Screen>
  );
}
