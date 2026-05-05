import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ConnectScreen } from "./src/screens/ConnectScreen";
import { SessionsScreen } from "./src/screens/SessionsScreen";
import { BrowserScreen } from "./src/screens/BrowserScreen";
import { ChatScreen } from "./src/screens/ChatScreen";
import { ApiClient } from "./src/services/api";
import type { AppSettings, HostConfig } from "./src/types";

export type RootStackParamList = {
  Connect: undefined;
  Sessions: undefined;
  Browser: undefined;
  Chat: { sessionId: string; cwd: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const STORAGE_KEY = "@remote-pi-settings";



export default function App() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const [settings, setSettings] = useState<AppSettings>({ hosts: [] });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          setSettings(JSON.parse(raw));
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings)).catch(() => {});
  }, [settings, loaded]);

  const activeHost = useMemo(() => {
    return settings.hosts.find((h) => h.id === settings.activeHostId) ?? null;
  }, [settings]);

  const api = useMemo(() => {
    if (!activeHost) return null;
    const baseUrl = activeHost.serverUrl.replace(/ws/g, "http");
    return new ApiClient(baseUrl, activeHost.token);
  }, [activeHost]);

  const [connected, setConnected] = useState(false);

  const checkHealth = useCallback(async () => {
    if (!api) {
      setConnected(false);
      return;
    }
    try {
      await api.getHealth();
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, [api]);

  useEffect(() => {
    checkHealth();
    const timer = setInterval(checkHealth, 5000);
    return () => clearInterval(timer);
  }, [checkHealth]);

  const navTheme = isDark ? DarkTheme : DefaultTheme;
  const contentStyle = { backgroundColor: isDark ? "#0c0c0c" : "#ffffff" };

  if (!loaded) return null;

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        initialRouteName="Connect"
        screenOptions={{
          headerStyle: { backgroundColor: isDark ? "#1c1c1e" : "#f2f2f7" },
          headerTintColor: isDark ? "#ffffff" : "#000000",
          contentStyle,
        }}
      >
        <Stack.Screen name="Connect" component={ConnectScreen} />
        <Stack.Screen name="Sessions">
          {(props) =>
            api ? (
              <SessionsScreen {...props} api={api} connected={connected} />
            ) : (
              <ConnectScreen {...(props as any)} />
            )
          }
        </Stack.Screen>
        <Stack.Screen name="Browser">
          {(props) =>
            api ? (
              <BrowserScreen {...props} api={api} />
            ) : (
              <ConnectScreen {...(props as any)} />
            )
          }
        </Stack.Screen>
        <Stack.Screen name="Chat">
          {(props) =>
            activeHost ? (
              <ChatScreen {...props} activeHost={activeHost} isDark={isDark} />
            ) : (
              <ConnectScreen {...(props as any)} />
            )
          }
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
