import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";

interface Props {
  code: string;
  language?: string;
  isDark: boolean;
}

const BASH_KEYWORDS = new Set([
  "if", "then", "else", "fi", "for", "while", "do", "done", "case", "esac", "in", "return", "exit", "function",
]);

const BASH_BUILTINS = new Set([
  "echo", "cd", "ls", "cat", "grep", "sed", "awk", "mkdir", "rm", "cp", "mv", "chmod", "chown",
  "python", "node", "npm", "git", "docker", "sudo", "curl", "wget", "apt", "pacman", "dnf", "yarn", "npx",
]);

function isBashLike(language?: string): boolean {
  if (!language) return false;
  const l = language.toLowerCase();
  return l === "bash" || l === "sh" || l === "shell" || l === "zsh";
}

interface Token {
  text: string;
  color?: string;
}

function tokenizeBash(code: string): Token[] {
  const tokens: Token[] = [];
  const lines = code.split("\n");

  for (const rawLine of lines) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    let i = 0;

    // skip leading spaces
    while (i < line.length && /\s/.test(line[i])) i++;
    if (i > 0) tokens.push({ text: line.slice(0, i) });

    // full-line comment
    if (line[i] === "#") {
      tokens.push({ text: line.slice(i), color: "#8e8e93" });
      tokens.push({ text: "\n" });
      continue;
    }

    while (i < line.length) {
      // inline comment
      if (line[i] === "#") {
        tokens.push({ text: line.slice(i), color: "#8e8e93" });
        break;
      }

      // string literal
      if (line[i] === '"' || line[i] === "'") {
        const quote = line[i];
        let j = i + 1;
        while (j < line.length && line[j] !== quote) {
          if (line[j] === "\\") j++;
          j++;
        }
        if (j < line.length) j++;
        tokens.push({ text: line.slice(i, j), color: "#34c759" });
        i = j;
        continue;
      }

      // whitespace
      if (/\s/.test(line[i])) {
        let j = i;
        while (j < line.length && /\s/.test(line[j])) j++;
        tokens.push({ text: line.slice(i, j) });
        i = j;
        continue;
      }

      // word / token
      let j = i;
      while (
        j < line.length &&
        !/\s/.test(line[j]) &&
        line[j] !== '"' &&
        line[j] !== "'" &&
        line[j] !== "#"
      ) {
        j++;
      }

      const word = line.slice(i, j);
      if (/^\d+$/.test(word)) {
        tokens.push({ text: word, color: "#ff9500" });
      } else if (BASH_KEYWORDS.has(word)) {
        tokens.push({ text: word, color: "#ff2d55" });
      } else if (BASH_BUILTINS.has(word)) {
        tokens.push({ text: word, color: "#0a84ff" });
      } else {
        tokens.push({ text: word });
      }
      i = j;
    }

    tokens.push({ text: "\n" });
  }

  return tokens;
}

export function CodeBlock({ code, language, isDark }: Props) {
  const bg = isDark ? "#1c1c1e" : "#f2f2f7";
  const textColor = isDark ? "#ffffff" : "#000000";

  const tokens = useMemo(() => {
    if (!isBashLike(language)) return null;
    return tokenizeBash(code);
  }, [code, language]);

  if (!tokens) {
    return (
      <ScrollView horizontal style={[styles.container, { backgroundColor: bg }]}>
        <Text
          style={[
            styles.plain,
            { color: textColor, backgroundColor: bg },
          ]}
        >
          {code}
        </Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView horizontal style={[styles.container, { backgroundColor: bg }]}>
      <Text style={[styles.codeText, { color: textColor, backgroundColor: bg }]}>
        {tokens.map((t, idx) =>
          t.color ? (
            <Text key={idx} style={{ color: t.color }}>
              {t.text}
            </Text>
          ) : (
            <Text key={idx}>{t.text}</Text>
          )
        )}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    padding: 10,
    marginVertical: 4,
  },
  plain: {
    fontFamily: "monospace",
    fontSize: 13,
    lineHeight: 18,
    padding: 10,
  },
  codeText: {
    fontFamily: "monospace",
    fontSize: 13,
    lineHeight: 18,
    padding: 10,
  },
});
