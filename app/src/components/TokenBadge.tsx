import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { TokenStats } from "../types";

interface Props {
  tokens?: TokenStats;
  cost?: number;
  isDark: boolean;
}

export function TokenBadge({ tokens, cost, isDark }: Props) {
  if (!tokens && cost === undefined) return null;

  const textColor = isDark ? "#8e8e93" : "#6e6e73";

  return (
    <View style={styles.row}>
      {tokens ? (
        <>
          <Text style={[styles.badge, { color: textColor }]}>↑{tokens.input}</Text>
          <Text style={[styles.badge, { color: textColor }]}>↓{tokens.output}</Text>
          <Text style={[styles.badge, { color: textColor }]}>R{tokens.cacheRead}</Text>
          <Text style={[styles.badge, { color: textColor }]}>W{tokens.cacheWrite}</Text>
        </>
      ) : null}
      {cost !== undefined ? (
        <Text style={[styles.badge, { color: textColor }]}>${cost.toFixed(4)}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  badge: {
    fontSize: 11,
    fontWeight: "500",
  },
});
