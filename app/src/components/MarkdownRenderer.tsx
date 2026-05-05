import React from "react";
import { Text, Platform } from "react-native";
import Markdown from "react-native-markdown-display";
import { CodeBlock } from "./CodeBlock";

interface Props {
  content: string;
  isDark: boolean;
}

export function MarkdownRenderer({ content, isDark }: Props) {
  const textColor = isDark ? "#ffffff" : "#000000";
  const linkColor = isDark ? "#0a84ff" : "#007aff";
  const inlineCodeBg = isDark ? "#3a3a3c" : "#f2f2f7";
  const inlineCodeColor = isDark ? "#ff9f0a" : "#c2410c";
  const borderColor = isDark ? "#3a3a3c" : "#d1d1d6";
  const tableHeaderBg = isDark ? "#2c2c2e" : "#e5e5ea";

  return (
    <Markdown
      rules={{
        fence: (node) => (
          <CodeBlock
            code={node.content}
            language={node.sourceInfo}
            isDark={isDark}
          />
        ),
        code_block: (node) => (
          <CodeBlock code={node.content} isDark={isDark} />
        ),
        code_inline: (node) => (
          <Text
            style={{
              backgroundColor: inlineCodeBg,
              color: inlineCodeColor,
              fontFamily:
                Platform.OS === "ios" ? "Courier" : "monospace",
              paddingHorizontal: 4,
              borderRadius: 4,
            }}
          >
            {node.content}
          </Text>
        ),
      }}
      style={{
        body: {
          color: textColor,
          fontSize: 15,
          lineHeight: 20,
        },
        heading1: {
          fontSize: 18,
          fontWeight: "700",
          marginVertical: 4,
          color: textColor,
        },
        heading2: {
          fontSize: 16,
          fontWeight: "600",
          marginVertical: 4,
          color: textColor,
        },
        heading3: {
          fontSize: 15,
          fontWeight: "600",
          marginVertical: 2,
          color: textColor,
        },
        paragraph: {
          marginVertical: 2,
        },
        link: {
          color: linkColor,
        },
        bullet_list: {
          marginVertical: 4,
        },
        ordered_list: {
          marginVertical: 4,
        },
        list_item: {
          marginVertical: 1,
        },
        table: {
          borderWidth: 1,
          borderColor,
          marginVertical: 8,
          borderRadius: 4,
          overflow: "hidden",
        },
        thead: {
          backgroundColor: tableHeaderBg,
        },
        tr: {
          flexDirection: "row",
          borderBottomWidth: 1,
          borderColor,
        },
        th: {
          flex: 1,
          padding: 6,
          fontWeight: "700",
          borderRightWidth: 1,
          borderColor,
          color: textColor,
        },
        td: {
          flex: 1,
          padding: 6,
          borderRightWidth: 1,
          borderColor,
          color: textColor,
        },
      }}
    >
      {content}
    </Markdown>
  );
}
