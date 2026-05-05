import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
import { PiWebSocket } from "../services/websocket";
import type {
  ChatMessage,
  AgentEvent,
  ExtensionUIRequest,
  HostConfig,
  TokenStats,
} from "../types";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { ThinkingBlock } from "../components/ThinkingBlock";
import { ToolCard } from "../components/ToolCard";
import { TokenBadge } from "../components/TokenBadge";
import { ExtensionUIModal } from "../components/ExtensionUIModal";

type Props = NativeStackScreenProps<RootStackParamList, "Chat"> & {
  activeHost: HostConfig | null;
  isDark: boolean;
};

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function extractResultText(result: unknown): string {
  if (typeof result === "string") return result;
  if (Array.isArray(result)) {
    return result
      .map((c) =>
        typeof c === "string" ? c : (c as Record<string, unknown>)?.text ?? JSON.stringify(c)
      )
      .filter(Boolean)
      .join("\n");
  }
  if (result && typeof result === "object") {
    const content = (result as Record<string, unknown>).content;
    if (Array.isArray(content)) {
      return content
        .map((c: Record<string, unknown>) => c.text)
        .filter(Boolean)
        .join("\n");
    }
    return JSON.stringify(result, null, 2);
  }
  return String(result ?? "");
}

export function ChatScreen({ navigation, route, activeHost, isDark }: Props) {
  const { sessionId, cwd } = route.params;

  const ws = useMemo(() => {
    if (!activeHost) return null;
    return new PiWebSocket({
      serverUrl: activeHost.serverUrl,
      token: activeHost.token,
      sessionId,
      cwd,
    });
  }, [activeHost, sessionId, cwd]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const [extUI, setExtUI] = useState<ExtensionUIRequest | null>(null);
  const [tokenStats, setTokenStats] = useState<{
    tokens?: TokenStats;
    cost?: number;
  } | null>(null);

  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const assistantIdRef = useRef<string | null>(null);
  const pendingToolIdRef = useRef<string | null>(null);

  // Connect / disconnect
  useEffect(() => {
    if (!ws) return;
    ws.connect();
    const unsubConn = ws.onConnectionChange((c) => setConnected(c));
    return () => {
      unsubConn();
      ws.disconnect();
    };
  }, [ws]);

  // Poll session stats
  useEffect(() => {
    if (!ws || !connected) return;
    const id = setInterval(() => ws.getSessionStats(), 10000);
    return () => clearInterval(id);
  }, [ws, connected]);

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

  // WebSocket events
  useEffect(() => {
    if (!ws) return;
    const unsub = ws.onEvent((event: AgentEvent) => {
      switch (event.type) {
        case "message_start": {
          const id = genId();
          assistantIdRef.current = id;
          const msg: ChatMessage = {
            id,
            role: "assistant",
            text: "",
            pending: true,
            createdAt: Date.now(),
          };
          setMessages((prev) => [...prev, msg]);
          break;
        }
        case "message_update": {
          const ame = (event as Record<string, unknown>)
            .assistantMessageEvent as Record<string, unknown> | undefined;
          if (!ame) return;
          const id = assistantIdRef.current;
          if (!id) return;
          if (ame.type === "text_delta") {
            const delta = ame.delta as string;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === id ? { ...m, text: m.text + delta } : m
              )
            );
          }
          if (ame.type === "thinking_delta") {
            const delta = ame.delta as string;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === id
                  ? { ...m, thinking: (m.thinking ?? "") + delta }
                  : m
              )
            );
          }
          break;
        }
        case "message_end": {
          const id = assistantIdRef.current;
          if (!id) return;
          setMessages((prev) =>
            prev.map((m) => (m.id === id ? { ...m, pending: false } : m))
          );
          assistantIdRef.current = null;
          break;
        }
        case "agent_start":
          setIsStreaming(true);
          break;
        case "agent_end":
          setIsStreaming(false);
          ws.getSessionStats();
          break;
        case "tool_execution_start": {
          const toolName = (event as Record<string, unknown>).toolName as
            | string
            | undefined;
          const args = (event as Record<string, unknown>).args;
          const id = genId();
          pendingToolIdRef.current = id;
          const msg: ChatMessage = {
            id,
            role: "tool",
            text: "",
            toolName: toolName ?? "tool",
            toolArgs: args ? JSON.stringify(args, null, 2) : undefined,
            pending: true,
            createdAt: Date.now(),
          };
          setMessages((prev) => [...prev, msg]);
          break;
        }
        case "tool_execution_update": {
          const result = (event as Record<string, unknown>).result;
          const id = pendingToolIdRef.current;
          if (!id) return;
          const text = extractResultText(result);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === id
                ? { ...m, toolResult: (m.toolResult ?? "") + text }
                : m
            )
          );
          break;
        }
        case "tool_execution_end": {
          const toolName = (event as Record<string, unknown>).toolName as
            | string
            | undefined;
          const result = (event as Record<string, unknown>).result;
          const isError = (event as Record<string, unknown>).isError as
            | boolean
            | undefined;
          const id = pendingToolIdRef.current;
          if (id) {
            const text = extractResultText(result);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === id
                  ? {
                      ...m,
                      toolName: toolName ?? m.toolName,
                      toolResult: text || m.toolResult,
                      isError: !!isError,
                      pending: false,
                    }
                  : m
              )
            );
            pendingToolIdRef.current = null;
          }
          break;
        }
        case "queue_update": {
          const steering = (event as Record<string, unknown>).steering as
            | string[]
            | undefined;
          const followUp = (event as Record<string, unknown>).followUp as
            | string[]
            | undefined;
          const count =
            (steering?.length ?? 0) + (followUp?.length ?? 0);
          setPendingCount(count);
          break;
        }
        case "extension_ui_request": {
          const req = event as unknown as ExtensionUIRequest;
          if (req.method === "notify") {
            Alert.alert(
              req.title ?? "Notification",
              req.message ?? "",
              [
                {
                  text: "OK",
                  onPress: () => ws.extensionUIResponse(req.id, {}),
                },
              ]
            );
          } else {
            setExtUI(req);
          }
          break;
        }
        case "system": {
          const text = (event as Record<string, unknown>).text as
            | string
            | undefined;
          if (text) {
            const msg: ChatMessage = {
              id: genId(),
              role: "system",
              text,
              createdAt: Date.now(),
            };
            setMessages((prev) => [...prev, msg]);
          }
          break;
        }
        case "response": {
          const tokens = (event as Record<string, unknown>).tokens as
            | TokenStats
            | undefined;
          const cost = (event as Record<string, unknown>).cost as
            | number
            | undefined;
          if (tokens || cost !== undefined) {
            setTokenStats({ tokens, cost });
          }
          break;
        }
        default:
          break;
      }
    });
    return unsub;
  }, [ws]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || !ws) return;
    setInput("");

    if (text === "/new") {
      ws.newSession();
      const msg: ChatMessage = {
        id: genId(),
        role: "system",
        text: "Started new session.",
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, msg]);
      return;
    }

    ws.prompt(text);
    const msg: ChatMessage = {
      id: genId(),
      role: "user",
      text,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
  }, [input, ws]);

  const handleAbort = useCallback(() => {
    ws?.abort();
    setIsStreaming(false);
  }, [ws]);

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
            disabled={!input.trim() || !ws}
            style={styles.sendBtn}
          >
            <Text
              style={{
                color:
                  input.trim() && ws
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
        request={extUI}
        onClose={() => setExtUI(null)}
        ws={ws!}
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
