import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  useColorScheme,
  RefreshControl,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import type { SessionInfo } from "../types";
import { ApiClient } from "../services/api";

type Props = NativeStackScreenProps<RootStackParamList, "Sessions"> & {
  api: ApiClient;
  connected: boolean;
};

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export function SessionsScreen({ navigation, api, connected }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const bg = isDark ? "#0c0c0c" : "#ffffff";
  const cardBg = isDark ? "#1c1c1e" : "#f2f2f7";
  const textColor = isDark ? "#ffffff" : "#000000";
  const secondaryText = isDark ? "#8e8e93" : "#6e6e73";
  const accent = isDark ? "#0a84ff" : "#007aff";
  const borderColor = isDark ? "#3a3a3c" : "#d1d1d6";
  const placeholderColor = isDark ? "#8e8e93" : "#c7c7cc";

  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [filtered, setFiltered] = useState<SessionInfo[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.getSessions();
      setSessions(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      setFiltered(sessions);
      return;
    }
    setFiltered(
      sessions.filter(
        (s) =>
          (s.name ?? "").toLowerCase().includes(term) ||
          s.cwd.toLowerCase().includes(term),
      ),
    );
  }, [search, sessions]);

  const renderItem = useCallback(
    ({ item }: { item: SessionInfo }) => (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: cardBg }]}
        onPress={() => navigation.navigate("Chat", { sessionId: item.id, cwd: item.cwd })}
        activeOpacity={0.7}
      >
        <Text style={[styles.name, { color: textColor }]} numberOfLines={1}>
          {item.name || item.id}
        </Text>
        <Text style={[styles.cwd, { color: secondaryText }]} numberOfLines={1}>
          {item.cwd}
        </Text>
        <View style={styles.row}>
          <Text style={[styles.meta, { color: secondaryText }]}>
            {item.messageCount} msgs · {relativeTime(item.modified)}
          </Text>
          {item.tokens && (
            <Text style={[styles.meta, { color: secondaryText }]}>
              {item.tokens.total} tokens
            </Text>
          )}
          {item.cost !== undefined && (
            <Text style={[styles.meta, { color: secondaryText }]}>
              ${item.cost.toFixed(4)}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    ),
    [navigation, cardBg, textColor, secondaryText],
  );

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: textColor }]}>Sessions</Text>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: connected ? "#34c759" : "#ff3b30" },
          ]}
        />
      </View>

      <TextInput
        style={[
          styles.search,
          { backgroundColor: cardBg, color: textColor, borderColor },
        ]}
        value={search}
        onChangeText={setSearch}
        placeholder="Search sessions..."
        placeholderTextColor={placeholderColor}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {error && (
        <Text style={[styles.error, { color: "#ff3b30" }]}>{error}</Text>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} />
        }
        ListEmptyComponent={
          !loading ? (
            <Text style={[styles.empty, { color: secondaryText }]}>
              {search.trim() ? "No matching sessions" : "No sessions found"}
            </Text>
          ) : null
        }
      />

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: accent }]}
        onPress={() => navigation.navigate("Browser")}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  search: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  error: {
    marginHorizontal: 16,
    marginBottom: 8,
    fontSize: 14,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  card: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
  },
  cwd: {
    fontSize: 13,
    marginTop: 2,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  meta: {
    fontSize: 12,
  },
  empty: {
    textAlign: "center",
    marginTop: 40,
    fontSize: 15,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  fabText: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "300",
    lineHeight: 30,
  },
});
