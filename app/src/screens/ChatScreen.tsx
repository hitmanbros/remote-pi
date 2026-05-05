import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  type ListRenderItem,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { sessionStore } from "../services/session-store";
import type { ChatMessage, HostConfig } from "../types";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { ThinkingBlock } from "../components/ThinkingBlock";
import { ToolCard } from "../components/ToolCard";
import { TokenBadge } from "../components/TokenBadge";
import { ExtensionUIModal } from "../components/ExtensionUIModal";

type Props = NativeStackScreenProps<RootStackParamList, "Chat"> & {
  activeHost: HostConfig | null;
  isDark: boolean;
};

export function ChatScreen({ navigation, route, activeHost, isDark }: Props) {
  const { sessionId, cwd } = route.params;

  const [, forceUpdate] = useState(0);
  const [input, setInput] = useState("");
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  const state = sessionStore.getAllState(sessionId);
  const { messages, isStreaming, pendingCount, connected, tokenStats, extUI } = state;

  // Connect to session store on mount; store persists across navigation
  useEffect(() => {
    if (activeHost) {
      sessionStore.connect(activeHost, sessionId, cwd);
    }
    const unsub = sessionStore.onChange(() => {
      forceUpdate((n) => n + 1);
      // Auto-scroll when messages update
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 50);
    });
    return () => {
      unsub();
      // Note: we intentionally do NOT disconnect here.
      // The store keeps the WS alive so history survives navigation.
    };
  }, [activeHost, sessionId, cwd]);

  // Handle notify-style extension UI requests (fire-and-forget Alert)
  useEffect(() => {
    if (extUI?.method === "notify") {
      Alert.alert(extUI.title ?? "Notification", extUI.message ?? "", [
        {
          text: "OK",
          onPress: () => {
            sessionStore.extensionUIResponse(extUI.id, {});
          },
        },
      ]);
    }
  }, [extUI]);

  // Header
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerRight}>
          {pendingCount > 0 && (
            <Text
              style={[
                styles.pendingText,
                { color: isDark ? "#ff9f0a" : "#ff9500" },
              ]}
            >
              queue: {pendingCount}
            </Text>
          )}
          <View
            style={[
              styles.dot,
              { backgroundColor: connected ? "#34c759" : "#ff3b30" },
            ]}
          />
        </View>
      ),
      headerTitle: () => (
        <View>
          <Text
            style={{
              color: isDark ? "#fff" : "#000",
              fontWeight: "600",
              fontSize: 17,
            }}
          >
            {activeHost?.name ?? "pi-remote"}
          </Text>
          {activeHost && (
            <Text
              style={{
                color: isDark ? "#8e8e93" : "#6e6e73",
                fontSize: 11,
                marginTop: 1,
              }}
              numberOfLines={1}
            >
              {activeHost.serverUrl}
            </Text>
          )}
        </View>
      ),
    });
  }, [navigation, connected, pendingCount, isDark, activeHost]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || !activeHost) return;
    setInput("");
    sessionStore.sendPrompt(text);
  }, [input, activeHost]);

  const handleAbort = useCallback(() => {
    sessionStore.abort();
  }, []);

  const scrollToEnd = useCallback(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, []);

  const renderItem: ListRenderItem<ChatMessage> = useCallback(
    ({ item }) => {
      if (item.role === "user") {
        return (
          <View style={styles.userRow}>
            <View
              style={[
                styles.userBubble,
                { backgroundColor: isDark ? "#0a84ff" : "#007aff" },
              ]}
            >
              <Text style={styles.userText}>{item.text}</Text>
            </View>
          </View>
        );
      }
      if (item.role === "assistant") {
        return (
          <View style={styles.assistantRow}>
            <View
              style={[
                styles.assistantBubble,
                { backgroundColor: isDark ? "#2c2c2e" : "#e5e5ea" },
              ]}
            >
              {item.thinking ? (
                <ThinkingBlock thinking={item.thinking} isDark={isDark} />
              ) : null}
              <MarkdownRenderer content={item.text || " "} isDark={isDark} />
              {item.pending ? (
                <Text
                  style={[
                    styles.pendingLabel,
                    { color: isDark ? "#8e8e93" : "#6e6e73" },
                  ]}
                >
                  …
                </Text>
              ) : null}
            </View>
          </View>
        );
      }
      if (item.role === "tool") {
        return (
          <View style={styles.assistantRow}>
            <ToolCard
              name={item.toolName ?? "tool"}
              args={item.toolArgs}
              result={item.toolResult}
              isError={item.isError}
              isDark={isDark}
            />
          </View>
        );
      }
      // system
      return (
        <View style={styles.centerRow}>
          <Text
            style={[
              styles.systemText,
              { color: isDark ? "#636366" : "#aeaeb2" },
            ]}
          >
            {item.text}
          </Text>
        </View>
      );
    },
    [isDark]
  );

  const bg = isDark ? "#0c0c0c" : "#ffffff";
  const inputBg = isDark ? "#1c1c1e" : "#f2f2f7";
  const inputColor = isDark ? "#ffffff" : "#000000";

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      {tokenStats ? (
        <View
          style={[
            styles.statsBar,
            {
              backgroundColor: isDark ? "#1c1c1e" : "#f2f2f7",
              borderBottomColor: isDark ? "#2c2c2e" : "#e5e5ea",
            },
          ]}
        >
          <TokenBadge
            tokens={tokenStats.tokens}
            cost={tokenStats.cost}
            isDark={isDark}
          />
        </View>
      ) : null}

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={scrollToEnd}
      />

      <View
        style={[
          styles.inputBar,
          {
            backgroundColor: isDark ? "#1c1c1e" : "#f2f2f7",
            borderTopColor: isDark ? "#2c2c2e" : "#e5e5ea",
          },
        ]}
      >
        <TextInput
          style={[
            styles.textInput,
            {
              backgroundColor: inputBg,
              color: inputColor,
              borderColor: isDark ? "#3a3a3c" : "#d1d1d6",
            },
          ]}
          value={input}
          onChangeText={setInput}
          placeholder="Message…"
          placeholderTextColor={isDark ? "#8e8e93" : "#c7c7cc"}
          multiline
          maxLength={4000}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          blurOnSubmit={false}
        />
        {isStreaming ? (
          <TouchableOpacity onPress={handleAbort} style={styles.sendBtn}>
            <Text style={{ color: "#ff3b30", fontWeight: "600", fontSize: 16 }}>
              Abort
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleSend}
            disabled={!input.trim() || !connected}
            style={styles.sendBtn}
          >
            <Text
              style={{
                color:
                  input.trim() && connected
                    ? isDark
                      ? "#0a84ff"
                      : "#007aff"
                    : isDark
                      ? "#48484a"
                      : "#c7c7cc",
                fontWeight: "600",
                fontSize: 16,
              }}
            >
              Send
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <ExtensionUIModal
        request={extUI?.method === "notify" ? null : extUI}
        onClose={() => {
          if (extUI) {
            sessionStore.extensionUIResponse(extUI.id, { cancelled: true });
          }
        }}
        ws={sessionStore.getWebSocket()}
        isDark={isDark}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statsBar: {
    flexDirection: "row",
    justifyContent: "center",
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listContent: { paddingVertical: 8, paddingHorizontal: 8 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  pendingText: { fontSize: 13, fontWeight: "500" },
  userRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginVertical: 4,
  },
  userBubble: {
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: "80%",
  },
  userText: { color: "#ffffff", fontSize: 15, lineHeight: 20 },
  assistantRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    marginVertical: 4,
  },
  assistantBubble: {
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: "85%",
  },
  pendingLabel: { fontSize: 13, marginTop: 4, fontWeight: "500" },
  centerRow: { alignItems: "center", marginVertical: 4, paddingHorizontal: 20 },
  systemText: { fontSize: 12, textAlign: "center" },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  textInput: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxHeight: 120,
    fontSize: 15,
    lineHeight: 20,
  },
  sendBtn: {
    marginLeft: 10,
    paddingHorizontal: 6,
    paddingVertical: 8,
    marginBottom: 2,
  },
});
