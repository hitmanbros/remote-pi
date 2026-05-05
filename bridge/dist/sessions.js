import { readdir, stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
const SESSIONS_DIR = join(homedir(), ".pi", "agent", "sessions");
export async function listSessions() {
    const files = await findJsonlFiles(SESSIONS_DIR);
    const sessions = [];
    for (const filePath of files) {
        try {
            const info = await parseSessionFile(filePath);
            if (info)
                sessions.push(info);
        }
        catch {
            // skip unreadable files
        }
    }
    sessions.sort((a, b) => b.modified - a.modified);
    return sessions;
}
export async function findSessionFileById(sessionId) {
    const files = await findJsonlFiles(SESSIONS_DIR);
    for (const filePath of files) {
        try {
            const fd = await readFile(filePath, "utf8");
            const firstLine = fd.split("\n")[0];
            if (!firstLine)
                continue;
            const header = JSON.parse(firstLine);
            if (header.type === "session" && header.id === sessionId) {
                return filePath;
            }
        }
        catch {
            // skip
        }
    }
    return null;
}
export async function parseSessionMessages(filePath, afterEntryId) {
    const content = await readFile(filePath, "utf8");
    const lines = content.split("\n").filter((l) => l.trim());
    const messages = [];
    let lastEntryId = null;
    let foundOffset = !afterEntryId;
    for (const line of lines) {
        try {
            const entry = JSON.parse(line);
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
            if (msg)
                messages.push(msg);
        }
        catch {
            // skip malformed
        }
    }
    return { messages, lastEntryId };
}
function convertEntryToMessage(entry) {
    if (entry.type !== "message")
        return null;
    const msg = entry.message;
    if (!msg)
        return null;
    const timestamp = typeof entry.timestamp === "string"
        ? new Date(entry.timestamp).getTime()
        : Date.now();
    const role = msg.role;
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
function extractText(content) {
    if (typeof content === "string")
        return content;
    if (!Array.isArray(content))
        return "";
    return content
        .filter((c) => c?.type === "text")
        .map((c) => c?.text ?? "")
        .join("");
}
function extractThinking(content) {
    if (!Array.isArray(content))
        return undefined;
    const thinking = content.find((c) => c?.type === "thinking");
    return thinking?.thinking;
}
async function findJsonlFiles(dir) {
    const results = [];
    try {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                const nested = await findJsonlFiles(fullPath);
                results.push(...nested);
            }
            else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
                results.push(fullPath);
            }
        }
    }
    catch {
        // directory may not exist
    }
    return results;
}
async function parseSessionFile(filePath) {
    const content = await readFile(filePath, "utf8");
    const lines = content.split("\n").filter((l) => l.trim());
    if (lines.length === 0)
        return null;
    let header;
    try {
        header = JSON.parse(lines[0]);
    }
    catch {
        return null;
    }
    if (header?.type !== "session")
        return null;
    const st = await stat(filePath);
    const info = {
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
            const entry = JSON.parse(lines[i]);
            if (entry.type === "session_info" && typeof entry.name === "string") {
                info.name = entry.name;
            }
            if (entry.type === "message") {
                const msg = entry.message;
                if (msg?.role === "user" || msg?.role === "assistant") {
                    info.messageCount++;
                }
                if (msg?.role === "assistant") {
                    const u = msg.usage;
                    if (u) {
                        input += u.input ?? 0;
                        output += u.output ?? 0;
                        cacheRead += u.cacheRead ?? 0;
                        cacheWrite += u.cacheWrite ?? 0;
                    }
                    const c = msg.cost?.total;
                    if (typeof c === "number")
                        cost += c;
                }
            }
        }
        catch {
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
    if (cost)
        info.cost = cost;
    return info;
}
