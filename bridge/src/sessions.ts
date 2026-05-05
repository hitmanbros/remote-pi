import { readdir, stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export interface SessionInfo {
  id: string;
  name?: string;
  cwd: string;
  path: string;
  messageCount: number;
  modified: number;
  created: number;
  tokens?: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
  cost?: number;
}

export interface HistoryMessage {
  entryId: string;
  role: "user" | "assistant" | "tool" | "system";
  text: string;
  thinking?: string;
  toolName?: string;
  toolArgs?: string;
  toolResult?: string;
  isError?: boolean;
  timestamp: number;
}

const SESSIONS_DIR = join(homedir(), ".pi", "agent", "sessions");

export async function listSessions(): Promise<SessionInfo[]> {
  const files = await findJsonlFiles(SESSIONS_DIR);
  const sessions: SessionInfo[] = [];
  for (const filePath of files) {
    try {
      const info = await parseSessionFile(filePath);
      if (info) sessions.push(info);
    } catch {
      // skip unreadable files
    }
  }
  sessions.sort((a, b) => b.modified - a.modified);
  return sessions;
}

export async function findSessionFileById(sessionId: string): Promise<string | null> {
  const files = await findJsonlFiles(SESSIONS_DIR);
  for (const filePath of files) {
    try {
      const fd = await readFile(filePath, "utf8");
      const firstLine = fd.split("\n")[0];
      if (!firstLine) continue;
      const header = JSON.parse(firstLine) as Record<string, unknown>;
      if (header.type === "session" && header.id === sessionId) {
        return filePath;
      }
    } catch {
      // skip
    }
  }
  return null;
}

export async function parseSessionMessages(
  filePath: string,
  afterEntryId?: string
): Promise<{ messages: HistoryMessage[]; lastEntryId: string | null }> {
  const content = await readFile(filePath, "utf8");
  const lines = content.split("\n").filter((l) => l.trim());
  const messages: HistoryMessage[] = [];
  let lastEntryId: string | null = null;
  let foundOffset = !afterEntryId;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as Record<string, unknown>;
      if (entry.id && typeof entry.id === "string") {
        lastEntryId = entry.id;
      }
      if (!foundOffset) {
        if (entry.id === afterEntryId) {
          foundOffset = true;
        }
        continue;
      }
      const msg = convertEntryToMessage(entry);
      if (msg) messages.push(msg);
    } catch {
      // skip malformed
    }
  }

  return { messages, lastEntryId };
}

function convertEntryToMessage(entry: Record<string, unknown>): HistoryMessage | null {
  if (entry.type !== "message") return null;
  const msg = entry.message as Record<string, unknown> | undefined;
  if (!msg) return null;

  const timestamp =
    typeof entry.timestamp === "string"
      ? new Date(entry.timestamp).getTime()
      : Date.now();

  const role = msg.role as string;
  const content = msg.content;

  if (role === "user") {
    return {
      entryId: String(entry.id ?? ""),
      role: "user",
      text: extractText(content),
      timestamp,
    };
  }

  if (role === "assistant") {
    return {
      entryId: String(entry.id ?? ""),
      role: "assistant",
      text: extractText(content),
      thinking: extractThinking(content),
      timestamp,
    };
  }

  if (role === "toolResult") {
    return {
      entryId: String(entry.id ?? ""),
      role: "tool",
      text: extractText(content),
      toolName: String(msg.toolName ?? ""),
      toolResult: extractText(content),
      isError: !!msg.isError,
      timestamp,
    };
  }

  if (role === "custom") {
    return {
      entryId: String(entry.id ?? ""),
      role: "system",
      text: extractText(content),
      timestamp,
    };
  }

  return null;
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c: any) => c?.type === "text")
    .map((c: any) => c?.text ?? "")
    .join("");
}

function extractThinking(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const thinking = content.find((c: any) => c?.type === "thinking");
  return thinking?.thinking;
}

async function findJsonlFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        const nested = await findJsonlFiles(fullPath);
        results.push(...nested);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        results.push(fullPath);
      }
    }
  } catch {
    // directory may not exist
  }
  return results;
}

async function parseSessionFile(filePath: string): Promise<SessionInfo | null> {
  const content = await readFile(filePath, "utf8");
  const lines = content.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return null;

  let header: Record<string, unknown> | undefined;
  try {
    header = JSON.parse(lines[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (header?.type !== "session") return null;

  const st = await stat(filePath);
  const info: SessionInfo = {
    id: String(header.id ?? ""),
    cwd: String(header.cwd ?? ""),
    path: filePath,
    messageCount: 0,
    modified: st.mtimeMs,
    created: Number(header.timestamp ? new Date(String(header.timestamp)).getTime() : st.birthtimeMs),
  };

  let input = 0;
  let output = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let cost = 0;

  for (let i = 1; i < lines.length; i++) {
    try {
      const entry = JSON.parse(lines[i]) as Record<string, unknown>;
      if (entry.type === "session_info" && typeof entry.name === "string") {
        info.name = entry.name;
      }
      if (entry.type === "message") {
        const msg = entry.message as Record<string, unknown> | undefined;
        if (msg?.role === "user" || msg?.role === "assistant") {
          info.messageCount++;
        }
        if (msg?.role === "assistant") {
          const u = msg.usage as Record<string, number> | undefined;
          if (u) {
            input += u.input ?? 0;
            output += u.output ?? 0;
            cacheRead += u.cacheRead ?? 0;
            cacheWrite += u.cacheWrite ?? 0;
          }
          const c = (msg.cost as Record<string, number> | undefined)?.total;
          if (typeof c === "number") cost += c;
        }
      }
    } catch {
      // skip malformed lines
    }
  }

  if (input || output || cacheRead || cacheWrite) {
    info.tokens = {
      input,
      output,
      cacheRead,
      cacheWrite,
      total: input + output + cacheRead + cacheWrite,
    };
  }
  if (cost) info.cost = cost;

  return info;
}
