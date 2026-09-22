import { useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { palette, radius, space } from "./theme";
import { pickMemoryImage } from "./photo";

/**
 * Optional picture for a memory. Same base64-on-Firestore approach as the
 * profile photo; each memory is its own doc so it has room for one image.
 */
export function MemoryImageField({
  value,
  onChange,
}: {
  value?: string;
  onChange: (uri: string | undefined) => void;
}) {
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    try {
      setBusy(true);
      const picked = await pickMemoryImage();
      if (picked) onChange(picked.dataUri);
    } catch (e) {
      Alert.alert("Picture", e instanceof Error ? e.message : "Could not open photos.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ marginTop: space.md }}>
      <Text style={{ color: palette.inkSoft, fontSize: 11, fontWeight: "800", letterSpacing: 0.7, marginBottom: 6 }}>
        PICTURE (OPTIONAL)
      </Text>
      {value ? (
        <View style={{ gap: 8 }}>
          <Image
            source={{ uri: value }}
            style={{ width: "100%", height: 180, borderRadius: radius.md, backgroundColor: palette.paperDim }}
            resizeMode="cover"
          />
          <View style={{ flexDirection: "row", gap: space.lg }}>
            <Pressable onPress={pick} disabled={busy}>
              <Text style={{ color: palette.primary, fontWeight: "800", fontSize: 13 }}>Change</Text>
            </Pressable>
            <Pressable onPress={() => onChange(undefined)} disabled={busy}>
              <Text style={{ color: palette.danger, fontWeight: "800", fontSize: 13 }}>Remove</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={pick}
          disabled={busy}
          style={{
            height: 110,
            borderRadius: radius.md,
            borderWidth: 1.5,
            borderColor: palette.lineStrong,
            borderStyle: "dashed",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            backgroundColor: palette.card,
          }}
        >
          {busy ? (
            <ActivityIndicator color={palette.primary} />
          ) : (
            <>
              <Feather name="image" size={22} color={palette.faint} />
              <Text style={{ color: palette.inkSoft, fontSize: 13, fontWeight: "700" }}>Add a photo for this memory</Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}
