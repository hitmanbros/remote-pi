import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

interface Props {
  thinking: string;
  isDark: boolean;
}

export function ThinkingBlock({ thinking, isDark }: Props) {
  const [expanded, setExpanded] = useState(false);
  const firstLine = thinking.split("\n")[0] ?? "";
  const collapsedText = firstLine.length > 120 ? firstLine.slice(0, 120) + "…" : firstLine;
  const showExpand = thinking.length > collapsedText.length + 1;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => setExpanded((v) => !v)}
      style={[
        styles.container,
        { backgroundColor: isDark ? "rgba(120,120,128,0.16)" : "rgba(120,120,128,0.08)" },
      ]}
    >
      <Text style={[styles.label, { color: isDark ? "#8e8e93" : "#6e6e73" }]}>
        thinking {expanded ? "▾" : "▸"}
      </Text>
      <Text style={[styles.text, { color: isDark ? "#aeaeb2" : "#8e8e93" }]}>
        {expanded ? thinking : collapsedText + (showExpand ? " …" : "")}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    padding: 8,
    marginBottom: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  text: {
    fontSize: 13,
    fontStyle: "italic",
    lineHeight: 18,
  },
});
