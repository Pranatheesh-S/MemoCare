import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/auth";
import { useT } from "@/i18n";
import { palette, radius, space } from "@/theme";
import { geminiChat } from "@/gemini";
import {
  CAREGIVER_SYSTEM_PROMPT,
  CHAT_DISCLAIMER,
  SUGGESTED_QUESTIONS,
  isSendable,
  type ChatMessage,
} from "@/chatModel";

const GREETING =
  "Hello. I'm Remi's care assistant. Ask me anything about daily care, routines, difficult moments, or using the app. I can't give medical advice — that's for your doctor.";

export default function Chat() {
  const { user } = useAuth();
  const t = useT();
  const storeKey = `remi.chat.${user?.id ?? "anon"}`;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(storeKey);
        if (raw) setMessages(JSON.parse(raw) as ChatMessage[]);
      } catch {
        // start fresh
      } finally {
        setLoaded(true);
      }
    })();
  }, [storeKey]);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(storeKey, JSON.stringify(messages)).catch(() => {});
  }, [messages, loaded, storeKey]);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!isSendable(trimmed) || thinking) return;
      setError(null);
      setDraft("");
      const next: ChatMessage[] = [...messages, { role: "user", text: trimmed, at: new Date().toISOString() }];
      setMessages(next);
      scrollToEnd();
      setThinking(true);
      try {
        const reply = await geminiChat(next, CAREGIVER_SYSTEM_PROMPT);
        setMessages((m) => [...m, { role: "model", text: reply, at: new Date().toISOString() }]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      } finally {
        setThinking(false);
        scrollToEnd();
      }
    },
    [messages, thinking, scrollToEnd],
  );

  const clear = useCallback(() => {
    setMessages([]);
    setError(null);
    AsyncStorage.removeItem(storeKey).catch(() => {});
  }, [storeKey]);

  const data = useMemo<ChatMessage[]>(
    () => [{ role: "model", text: GREETING, at: "greeting" }, ...messages],
    [messages],
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.paper }} edges={["top", "left", "right"]}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: space.lg,
          paddingTop: space.md,
          paddingBottom: space.sm,
        }}
      >
        <View>
          <Text style={{ color: palette.primary, fontSize: 11.5, fontWeight: "800", letterSpacing: 1.6 }}>
            {t("chat.eyebrow")}
          </Text>
          <Text style={{ color: palette.ink, fontSize: 24, fontWeight: "800", letterSpacing: -0.5, marginTop: 2 }}>
            {t("chat.title")}
          </Text>
        </View>
        {messages.length > 0 ? (
          <Pressable onPress={clear} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Feather name="trash-2" size={14} color={palette.faint} />
            <Text style={{ color: palette.faint, fontWeight: "700", fontSize: 12.5 }}>{t("chat.clear")}</Text>
          </Pressable>
        ) : null}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={8}
      >
        <FlatList
          ref={listRef}
          data={data}
          keyExtractor={(m, i) => `${m.at}-${i}`}
          contentContainerStyle={{ padding: space.lg, gap: space.sm }}
          onContentSizeChange={scrollToEnd}
          renderItem={({ item }) => <Bubble message={item} />}
          ListFooterComponent={
            <View>
              {thinking ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: space.sm }}>
                  <ActivityIndicator size="small" color={palette.primary} />
                  <Text style={{ color: palette.inkSoft, fontSize: 13 }}>{t("chat.thinking")}</Text>
                </View>
              ) : null}
              {error ? (
                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    backgroundColor: palette.dangerSoft,
                    borderRadius: radius.md,
                    padding: space.md,
                    marginTop: space.sm,
                  }}
                >
                  <Feather name="alert-triangle" size={15} color={palette.danger} style={{ marginTop: 1 }} />
                  <Text style={{ color: palette.danger, flex: 1, fontSize: 13 }}>{error}</Text>
                </View>
              ) : null}
              {messages.length === 0 ? (
                <View style={{ marginTop: space.md, gap: space.sm }}>
                  <Text style={{ color: palette.inkSoft, fontSize: 12, fontWeight: "800", letterSpacing: 0.5 }}>
                    {t("chat.tryAsking")}
                  </Text>
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <Pressable
                      key={q}
                      onPress={() => void send(q)}
                      style={{
                        borderWidth: 1.5,
                        borderColor: palette.primarySoft,
                        backgroundColor: palette.primaryTint,
                        borderRadius: radius.md,
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                      }}
                    >
                      <Text style={{ color: palette.primaryDark, fontSize: 13.5, fontWeight: "600" }}>{q}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          }
        />

        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm, gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.sm }}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={t("chat.placeholder")}
              placeholderTextColor={palette.faint}
              multiline
              style={{
                flex: 1,
                maxHeight: 120,
                minHeight: 46,
                backgroundColor: palette.card,
                borderWidth: 1.5,
                borderColor: palette.lineStrong,
                borderRadius: radius.md,
                paddingHorizontal: space.md,
                paddingTop: 12,
                paddingBottom: 12,
                fontSize: 15,
                color: palette.ink,
              }}
            />
            <Pressable
              onPress={() => void send(draft)}
              disabled={!isSendable(draft) || thinking}
              style={{
                width: 46,
                height: 46,
                borderRadius: 23,
                backgroundColor: !isSendable(draft) || thinking ? palette.faint : palette.primary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="arrow-up" size={22} color={palette.card} />
            </Pressable>
          </View>
          <Text style={{ color: palette.faint, fontSize: 11, lineHeight: 15, textAlign: "center" }}>{CHAT_DISCLAIMER}</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const mine = message.role === "user";
  return (
    <View
      style={{
        alignSelf: mine ? "flex-end" : "flex-start",
        maxWidth: "88%",
        backgroundColor: mine ? palette.primary : palette.card,
        borderRadius: radius.lg,
        borderBottomRightRadius: mine ? 6 : radius.lg,
        borderBottomLeftRadius: mine ? radius.lg : 6,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderWidth: mine ? 0 : 1,
        borderColor: palette.line,
      }}
    >
      <Text style={{ color: mine ? palette.card : palette.ink, fontSize: 14.5, lineHeight: 21 }}>{message.text}</Text>
    </View>
  );
}
