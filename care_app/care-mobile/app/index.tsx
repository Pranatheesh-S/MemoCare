import { ActivityIndicator, Image, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/auth";
import { palette } from "@/theme";

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: palette.paper, gap: 28 }}>
        <Image
          source={require("../assets/logo.png")}
          style={{ width: 200, height: 219, resizeMode: "contain" }}
        />
        <ActivityIndicator color={palette.primary} />
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;
  return <Redirect href={user.role === "caregiver" ? "/caregiver" : "/worker"} />;
}
