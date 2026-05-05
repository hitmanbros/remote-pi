import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
  Alert,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import type { FsEntry } from "../types";
import { ApiClient } from "../services/api";

type Props = NativeStackScreenProps<RootStackParamList, "Browser"> & {
  api: ApiClient;
};

export function BrowserScreen({ navigation, api }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const bg = isDark ? "#0c0c0c" : "#ffffff";
  const cardBg = isDark ? "#1c1c1e" : "#f2f2f7";
  const textColor = isDark ? "#ffffff" : "#000000";
  const secondaryText = isDark ? "#8e8e93" : "#6e6e73";
  const accent = isDark ? "#0a84ff" : "#007aff";
  const muted = isDark ? "#3a3a3c" : "#e5e5ea";

  const [currentPath, setCurrentPath] = useState("/home");
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (path: string) => {
      setLoading(true);
      try {
        const list = await api.browseDir(path);
        const dirs = list.filter((e) => e.type === "directory");
        const files = list.filter((e) => e.type === "file");
        setEntries([...dirs, ...files]);
      } catch (err) {
        Alert.alert("Error", err instanceof Error ? err.message : "Failed to browse");
      } finally {
        setLoading(false);
      }
    },
    [api],
  );

  useEffect(() => {
    load(currentPath);
  }, [load, currentPath]);

  const handleSelect = useCallback(async () => {
    try {
      const result = await api.createSession(currentPath);
      navigation.navigate("Chat", { sessionId: result.sessionId, cwd: currentPath });
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to create session");
    }
  }, [api, currentPath, navigation]);

  const renderItem = useCallback(
    ({ item }: { item: FsEntry }) => {
      const isDir = item.type === "directory";
      return (
        <TouchableOpacity
          style={[styles.row, { backgroundColor: cardBg }]}
          onPress={() => {
            if (isDir) {
              setCurrentPath(item.path);
            }
          }}
          activeOpacity={0.7}
          disabled={!isDir}
        >
          <Text style={{ fontSize: 16, marginRight: 8 }}>{isDir ? "\ud83d\udcc1" : "\ud83d\udcc4"}</Text>
          <Text
            style={[
              styles.name,
              { color: isDir ? textColor : secondaryText },
            ]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
        </TouchableOpacity>
      );
    },
    [cardBg, textColor, secondaryText],
  );

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <View style={styles.header}>
        <Text style={[styles.path, { color: textColor }]} numberOfLines={1}>
          {currentPath}
        </Text>
        <TouchableOpacity
          style={[styles.selectBtn, { backgroundColor: accent }]}
          onPress={handleSelect}
          activeOpacity={0.8}
        >
          <Text style={styles.selectBtnText}>Select</Text>
        </TouchableOpacity>
      </View>

      {currentPath !== "/" && (
        <TouchableOpacity
          style={[styles.upRow, { backgroundColor: muted }]}
          onPress={() => {
            const parent = currentPath.substring(0, currentPath.lastIndexOf("/")) || "/";
            setCurrentPath(parent);
          }}
        >
          <Text style={{ fontSize: 16, marginRight: 8 }}>\u2191</Text>
          <Text style={[styles.name, { color: textColor }]}>..</Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={accent} />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.path}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}
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
    paddingBottom: 12,
  },
  path: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    marginRight: 12,
  },
  selectBtn: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  selectBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  upRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
  },
  name: {
    fontSize: 15,
    flex: 1,
  },
  list: {
    paddingBottom: 20,
  },
});
