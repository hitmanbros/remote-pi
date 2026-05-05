import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

interface Props {
  name: string;
  args?: string;
  result?: string;
  isError?: boolean;
  isDark: boolean;
}

export function ToolCard({ name, args, result, isError, isDark }: Props) {
  const [argsExpanded, setArgsExpanded] = useState(false);
  const [resultExpanded, setResultExpanded] = useState(false);

  const borderColor = isError ? "#ff3b30" : isDark ? "#3a3a3c" : "#d1d1d6";
  const bg = isDark ? "#1c1c1e" : "#f2f2f7";
  const textColor = isDark ? "#ffffff" : "#000000";
  const muted = isDark ? "#8e8e93" : "#6e6e73";

  const resultLines = result?.split("\n") ?? [];
  const resultPreview = resultLines.slice(0, 3).join("\n");
  const hasMoreResult = resultLines.length > 3;

  return (
    <View style={[styles.card, { backgroundColor: bg, borderColor }]}>
      <Text style={[styles.name, { color: textColor }]}>
        {isError ? "⚠ " : "▶ "}
        {name}
      </Text>

      {args ? (
        <TouchableOpacity
          onPress={() => setArgsExpanded((v) => !v)}
          style={styles.argsRow}
        >
          <Text style={[styles.argsLabel, { color: muted }]}>
            args {argsExpanded ? "▾" : "▸"}
          </Text>
          <Text style={[styles.code, { color: muted }]} numberOfLines={argsExpanded ? undefined : 2}>
            {args}
          </Text>
        </TouchableOpacity>
      ) : null}

      {result ? (
        <TouchableOpacity
          onPress={() => setResultExpanded((v) => !v)}
          style={styles.resultRow}
        >
          <Text style={[styles.argsLabel, { color: muted }]}>
            result {resultExpanded ? "▾" : "▸"}
          </Text>
          <Text style={[styles.code, { color: muted }]} numberOfLines={resultExpanded ? undefined : 3}>
            {resultExpanded ? result : resultPreview + (hasMoreResult && !resultExpanded ? "\n…" : "")}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginVertical: 4,
  },
  name: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  argsRow: {
    marginTop: 4,
  },
  resultRow: {
    marginTop: 4,
  },
  argsLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  code: {
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 16,
  },
});
