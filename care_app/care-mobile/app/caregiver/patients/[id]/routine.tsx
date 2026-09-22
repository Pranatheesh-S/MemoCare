import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Button, Card, Note, Row } from "@/ui";
import { useT } from "@/i18n";
import { palette, radius, space } from "@/theme";
import { getPatient } from "@/patients";
import { countApprovedDays, getRoutineDay, saveRoutineDay, seedSampleRoutineDays, suggestRoutineItems } from "@/routines";
import {
  MIN_DAYS_FOR_AI_SUGGESTIONS,
  ROUTINE_KINDS,
  ROUTINE_KIND_ICON,
  addDays,
  canSuggestRoutine,
  humanDate,
  sortItems,
  todayISO,
  type RoutineItem,
} from "@/routineModel";

type DraftState = {
  items: RoutineItem[];
  source: "caregiver" | "ai";
  approved: boolean;
  basedOnDays?: number;
  existed: boolean;
};

const BLANK_ITEM: RoutineItem = { time: "08:00", title: "", kind: "activity" };

export default function Routine() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const today = todayISO();
  const dateOptions = useMemo(() => [-5, -4, -3, -2, -1, 0, 1, 2, 3].map((n) => addDays(today, n)), [today]);

  const [date, setDate] = useState(today);
  const [name, setName] = useState("the patient");
  const [approvedCount, setApprovedCount] = useState(0);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "save" | "approve" | "suggest" | "seed">(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, day, count] = await Promise.all([
        getPatient(id),
        getRoutineDay(id, date),
        countApprovedDays(id),
      ]);
      if (p) setName(p.preferredName || p.displayName || "the patient");
      setApprovedCount(count);
      setDraft(
        day
          ? { items: sortItems(day.items), source: day.source, approved: day.approved, basedOnDays: day.basedOnDays, existed: true }
          : null,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the routine");
    } finally {
      setLoading(false);
    }
  }, [id, date]);

  useEffect(() => {
    void load();
  }, [load]);

  const setItem = (i: number, patch: Partial<RoutineItem>) =>
    setDraft((d) => (d ? { ...d, items: d.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) } : d));
  const removeItem = (i: number) =>
    setDraft((d) => (d ? { ...d, items: d.items.filter((_, idx) => idx !== i) } : d));
  const addItem = () =>
    setDraft((d) => ({
      items: [...(d?.items ?? []), { ...BLANK_ITEM }],
      source: d?.source ?? "caregiver",
      approved: d?.approved ?? false,
      basedOnDays: d?.basedOnDays,
      existed: d?.existed ?? false,
    }));

  const startBlank = () => setDraft({ items: [{ ...BLANK_ITEM }], source: "caregiver", approved: false, existed: false });

  const seedWeek = async () => {
    setBusy("seed");
    try {
      const n = await seedSampleRoutineDays(id);
      Alert.alert(
        "Starter week added",
        `${n} days added, back from yesterday. Open any day to change it, then let Remi draft the next ones.`,
      );
      await load();
    } catch (e) {
      Alert.alert("Couldn't add the starter week", e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(null);
    }
  };

  const runSuggest = async () => {
    setBusy("suggest");
    setError(null);
    try {
      const { items, basedOnDays } = await suggestRoutineItems(id, date);
      setDraft({ items, source: "ai", approved: false, basedOnDays, existed: false });
    } catch (e) {
      Alert.alert("Couldn't draft this day", e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(null);
    }
  };

  const persist = async (approved: boolean) => {
    if (!draft) return;
    if (draft.items.every((it) => !it.title.trim())) {
      Alert.alert("Add something first", "The routine needs at least one item.");
      return;
    }
    setBusy(approved ? "approve" : "save");
    try {
      const saved = await saveRoutineDay(id, {
        date,
        items: draft.items,
        source: draft.source,
        approved,
        basedOnDays: draft.basedOnDays,
      });
      setDraft({ items: sortItems(saved.items), source: saved.source, approved: saved.approved, basedOnDays: saved.basedOnDays, existed: true });
      setApprovedCount((c) => (approved && !draft.approved ? c + 1 : c));
    } catch (e) {
      Alert.alert("Could not save", e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(null);
    }
  };

  const remaining = Math.max(0, MIN_DAYS_FOR_AI_SUGGESTIONS - approvedCount);
  const canAI = canSuggestRoutine(approvedCount);
  const isAiDraft = draft?.source === "ai" && !draft.approved;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.paper }} edges={["bottom"]}>
      <Stack.Screen options={{ title: "" }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: palette.primary, fontSize: 11.5, fontWeight: "800", letterSpacing: 1.6 }}>
          {t("routine.eyebrow")}
        </Text>
        <Text style={{ color: palette.ink, fontSize: 26, fontWeight: "800", letterSpacing: -0.5, marginTop: 6 }}>
          {t("routine.title", { name })}
        </Text>

        {/* Date strip */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, marginTop: space.md }}>
          {dateOptions.map((d) => {
            const active = d === date;
            return (
              <Pressable
                key={d}
                onPress={() => setDate(d)}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: radius.pill,
                  borderWidth: 1.5,
                  borderColor: active ? palette.primary : palette.lineStrong,
                  backgroundColor: active ? palette.primary : palette.card,
                }}
              >
                <Text style={{ color: active ? palette.card : palette.inkSoft, fontWeight: "800", fontSize: 13 }}>
                  {humanDate(d, today)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {loading ? (
          <ActivityIndicator color={palette.primary} style={{ marginTop: space.xxl }} />
        ) : error ? (
          <Note tone="warn">{error}</Note>
        ) : (
          <>
            {!canAI ? (
              <Note>
                {approvedCount === 0
                  ? `Add a starter week below, or build days yourself. After ${MIN_DAYS_FOR_AI_SUGGESTIONS} approved days, Remi drafts the next ones for you to approve in one tap.`
                  : `Build ${remaining} more day${remaining === 1 ? "" : "s"} and approve them. After ${MIN_DAYS_FOR_AI_SUGGESTIONS}, Remi starts drafting the next days for you to approve in one tap.`}
              </Note>
            ) : null}

            {isAiDraft ? (
              <View
                style={{
                  flexDirection: "row",
                  gap: 8,
                  backgroundColor: palette.primaryTint,
                  borderColor: palette.primarySoft,
                  borderWidth: 1.5,
                  borderRadius: radius.md,
                  padding: space.md,
                  marginTop: space.md,
                }}
              >
                <Feather name="zap" size={15} color={palette.primaryDark} style={{ marginTop: 1 }} />
                <Text style={{ color: palette.primaryDark, flex: 1, fontSize: 13, lineHeight: 19 }}>
                  Drafted by Remi from {draft?.basedOnDays ?? 0} recent days. Check the times and wording, then approve.
                </Text>
              </View>
            ) : null}

            {draft ? (
              <>
                {draft.items.map((it, i) => (
                  <ItemEditor
                    key={i}
                    index={i}
                    item={it}
                    onChange={(patch) => setItem(i, patch)}
                    onRemove={() => removeItem(i)}
                  />
                ))}
                <Pressable
                  onPress={addItem}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: space.sm, marginTop: 4 }}
                >
                  <Feather name="plus-circle" size={17} color={palette.primary} />
                  <Text style={{ color: palette.primary, fontWeight: "800" }}>{t("routine.addItem")}</Text>
                </Pressable>

                <View style={{ gap: space.sm, marginTop: space.md }}>
                  {isAiDraft ? (
                    <Button
                      label={busy === "approve" ? t("routine.approving") : t("routine.approveDay")}
                      icon="check-circle"
                      loading={busy === "approve"}
                      onPress={() => void persist(true)}
                    />
                  ) : (
                    <Button
                      label={busy === "save" ? t("common.saving") : draft.approved ? t("routine.saveChanges") : t("routine.saveApprove")}
                      icon="check"
                      loading={busy === "save"}
                      onPress={() => void persist(true)}
                    />
                  )}
                  {canAI && !isAiDraft ? (
                    <Button
                      label={busy === "suggest" ? t("routine.drafting") : t("routine.reDraft")}
                      icon="zap"
                      variant="ghost"
                      loading={busy === "suggest"}
                      onPress={() => void runSuggest()}
                    />
                  ) : null}
                </View>
              </>
            ) : (
              <View style={{ gap: space.sm, marginTop: space.md }}>
                {canAI ? (
                  <Button
                    label={busy === "suggest" ? t("routine.drafting") : t("routine.letRemiDraft")}
                    icon="zap"
                    loading={busy === "suggest"}
                    onPress={() => void runSuggest()}
                  />
                ) : null}
                {approvedCount === 0 ? (
                  <Button
                    label={busy === "seed" ? t("routine.adding") : t("routine.starterWeek")}
                    icon="calendar"
                    loading={busy === "seed"}
                    onPress={() => void seedWeek()}
                  />
                ) : null}
                <Button
                  label={t("routine.buildMyself")}
                  icon="edit-2"
                  variant={canAI || approvedCount === 0 ? "ghost" : "primary"}
                  onPress={startBlank}
                />
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ItemEditor({
  index,
  item,
  onChange,
  onRemove,
}: {
  index: number;
  item: RoutineItem;
  onChange: (patch: Partial<RoutineItem>) => void;
  onRemove: () => void;
}) {
  const t = useT();
  return (
    <Card>
      <Row>
        <Text style={{ color: palette.inkSoft, fontSize: 12, fontWeight: "800", letterSpacing: 0.5 }}>
          {t("routine.item", { n: index + 1 })}
        </Text>
        <Pressable onPress={onRemove} hitSlop={8}>
          <Feather name="trash-2" size={16} color={palette.danger} />
        </Pressable>
      </Row>

      <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.sm }}>
        <View style={{ width: 92 }}>
          <Text style={ed.label}>{t("routine.time")}</Text>
          <TextInput
            value={item.time}
            onChangeText={(v) => onChange({ time: v })}
            placeholder="08:00"
            placeholderTextColor={palette.faint}
            keyboardType="numbers-and-punctuation"
            style={ed.input}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={ed.label}>{t("routine.what")}</Text>
          <TextInput
            value={item.title}
            onChangeText={(v) => onChange({ title: v })}
            placeholder="Morning tea"
            placeholderTextColor={palette.faint}
            style={ed.input}
          />
        </View>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: space.sm }}>
        {ROUTINE_KINDS.map((k) => {
          const active = item.kind === k;
          return (
            <Pressable
              key={k}
              onPress={() => onChange({ kind: k })}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: radius.pill,
                borderWidth: 1.5,
                borderColor: active ? palette.ink : palette.lineStrong,
                backgroundColor: active ? palette.ink : palette.card,
              }}
            >
              <Feather
                name={ROUTINE_KIND_ICON[k] as React.ComponentProps<typeof Feather>["name"]}
                size={12}
                color={active ? palette.card : palette.inkSoft}
              />
              <Text style={{ fontSize: 12, fontWeight: "700", color: active ? palette.card : palette.inkSoft }}>
                {t(`kind.${k}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TextInput
        value={item.note ?? ""}
        onChangeText={(v) => onChange({ note: v })}
        placeholder="Note (optional) — e.g. after breakfast, with water"
        placeholderTextColor={palette.faint}
        style={[ed.input, { marginTop: space.sm }]}
      />

      {(item.kind === "medicine" || item.critical) && (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.sm }}>
          <Text style={{ color: palette.ink, fontSize: 13.5 }}>Important — don&rsquo;t let this slip</Text>
          <Switch
            value={Boolean(item.critical)}
            onValueChange={(v) => onChange({ critical: v })}
            trackColor={{ true: palette.primary }}
          />
        </View>
      )}
    </Card>
  );
}

const ed = {
  label: { color: palette.inkSoft, fontSize: 10.5, fontWeight: "800" as const, letterSpacing: 0.6, marginBottom: 5 },
  input: {
    backgroundColor: palette.card,
    borderColor: palette.lineStrong,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 11,
    fontSize: 15,
    color: palette.ink,
  },
};
