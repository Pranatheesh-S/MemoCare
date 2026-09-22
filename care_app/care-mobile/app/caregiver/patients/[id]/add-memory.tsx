import { useState } from "react";
import { Alert, Pressable, Switch, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Screen } from "@/Screen";
import { Button, Card, Field } from "@/ui";
import { MemoryImageField } from "@/MemoryImageField";
import { palette, radius, space } from "@/theme";
import { addMemory } from "@/patients";
import { MEMORY_CATEGORIES, MEMORY_CATEGORY_LABEL, emptyMemoryDraft, type MemoryDraft } from "@/model";

export default function AddMemory() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [memory, setMemory] = useState<MemoryDraft>(emptyMemoryDraft);
  const [busy, setBusy] = useState(false);

  const set = (patch: Partial<MemoryDraft>) => setMemory((m) => ({ ...m, ...patch }));
  const ready = memory.title.trim().length > 0 && memory.story.trim().length > 0;

  const save = async () => {
    setBusy(true);
    try {
      await addMemory(id, memory);
      router.back();
    } catch (e) {
      Alert.alert("Could not add the memory", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen eyebrow="Add to their memories" title="New memory">
      <Card>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {MEMORY_CATEGORIES.map((category) => {
            const active = memory.category === category;
            return (
              <Pressable
                key={category}
                onPress={() => set({ category })}
                style={{
                  paddingVertical: 7,
                  paddingHorizontal: 12,
                  borderRadius: radius.pill,
                  borderWidth: 1.5,
                  borderColor: active ? palette.ink : palette.lineStrong,
                  backgroundColor: active ? palette.ink : palette.card,
                }}
              >
                <Text style={{ fontSize: 12.5, fontWeight: "700", color: active ? palette.card : palette.inkSoft }}>
                  {MEMORY_CATEGORY_LABEL[category]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {memory.category === "MY_FAMILY" ? (
          <>
            <Field label="Person's name" value={memory.personName ?? ""} onChangeText={(v) => set({ personName: v })} placeholder="Nabanita" autoCapitalize="words" />
            <Field label="Relationship" value={memory.relationship ?? ""} onChangeText={(v) => set({ relationship: v })} placeholder="Daughter" autoCapitalize="words" />
          </>
        ) : null}
        <Field label="Title" value={memory.title} onChangeText={(v) => set({ title: v })} placeholder="Evening tea in the garden" />
        <Field
          label="The story"
          value={memory.story}
          onChangeText={(v) => set({ story: v })}
          placeholder="Nabanita brings red tea every evening and you talk about the garden."
          multiline
        />
        <MemoryImageField value={memory.imageUri} onChange={(uri) => set({ imageUri: uri })} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.md }}>
          <Text style={{ color: palette.ink, fontSize: 14.5 }}>Mark as a favourite</Text>
          <Switch value={Boolean(memory.favourite)} onValueChange={(v) => set({ favourite: v })} trackColor={{ true: palette.primary }} />
        </View>
      </Card>

      <View style={{ marginTop: space.lg }}>
        <Button label="Add memory" icon="plus-circle" onPress={save} loading={busy} disabled={!ready} />
      </View>
    </Screen>
  );
}
