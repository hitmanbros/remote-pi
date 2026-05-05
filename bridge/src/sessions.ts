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
