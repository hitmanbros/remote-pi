import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import type { HostConfig, AppSettings } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Connect">;

const STORAGE_KEY = "@remote-pi-settings";

function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function ConnectScreen({ navigation }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");

  const bg = isDark ? "#0c0c0c" : "#ffffff";
  const cardBg = isDark ? "#1c1c1e" : "#f2f2f7";
  const textColor = isDark ? "#ffffff" : "#000000";
  const accent = isDark ? "#0a84ff" : "#007aff";
  const placeholderColor = isDark ? "#8e8e93" : "#c7c7cc";
  const borderColor = isDark ? "#3a3a3c" : "#d1d1d6";

  const handleConnect = useCallback(async () => {
    const trimmedUrl = url.trim();
    const trimmedToken = token.trim();

    if (!trimmedUrl || !trimmedToken) {
      Alert.alert("Error", "Both URL and token are required");
      return;
    }

    if (!/^https?:\/\//i.test(trimmedUrl) && !/^wss?:\/\//i.test(trimmedUrl)) {
      Alert.alert("Error", "URL must start with http://, https://, ws://, or wss://");
      return;
    }

    const host: HostConfig = {
      id: genId(),
      name: trimmedUrl,
      serverUrl: trimmedUrl,
      token: trimmedToken,
    };

    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const settings: AppSettings = raw ? JSON.parse(raw) : { hosts: [] };
      settings.hosts = [host];
      settings.activeHostId = host.id;
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      navigation.navigate("Sessions");
    } catch (err) {
      Alert.alert("Error", "Failed to save settings");
    }
  }, [url, token, navigation]);

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Text style={[styles.title, { color: textColor }]}>Connect to Bridge</Text>

      <Text style={[styles.label, { color: textColor }]}>Bridge URL</Text>
      <TextInput
        style={[styles.input, { backgroundColor: cardBg, color: textColor, borderColor }]}
        value={url}
        onChangeText={setUrl}
        placeholder="http://100.x.x.x:8765"
        placeholderTextColor={placeholderColor}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />

      <Text style={[styles.label, { color: textColor, marginTop: 16 }]}>Auth Token</Text>
      <TextInput
        style={[styles.input, { backgroundColor: cardBg, color: textColor, borderColor }]}
        value={token}
        onChangeText={setToken}
        placeholder="your-token"
        placeholderTextColor={placeholderColor}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />

      <TouchableOpacity
        style={[styles.button, { backgroundColor: accent }]}
        onPress={handleConnect}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>Connect</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 32,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  button: {
    marginTop: 28,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "600",
  },
});
