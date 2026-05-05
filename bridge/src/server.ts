import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { stat, readFile } from "node:fs/promises";
import { WebSocketServer } from "ws";
import { authenticate } from "./auth.js";
import { PiProcess } from "./pi-process.js";
import { listSessions, findSessionFileById, parseSessionMessages, type HistoryMessage } from "./sessions.js";
import { browseDir } from "./fs-browser.js";

const PORT = Number(process.env.PORT ?? 8765);
const CWD = process.env.PI_CWD ?? process.cwd();

function setCorsHeaders(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(text || "{}") as Record<string, unknown>);
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

const httpServer = createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  if (url.pathname === "/health") {
    sendJson(res, 200, { status: "ok" });
    return;
  }

  if (url.pathname === "/api/sessions" && req.method === "GET") {
    try {
      const sessions = await listSessions();
      sendJson(res, 200, sessions);
    } catch {
      sendJson(res, 500, { error: "Failed to list sessions" });
    }
    return;
  }

  const messagesMatch = url.pathname.match(/^\/api\/sessions\/([^\/]+)\/messages$/);
  if (messagesMatch && req.method === "GET") {
    const sessionId = decodeURIComponent(messagesMatch[1]);
    try {
      const filePath = await findSessionFileById(sessionId);
      if (!filePath) {
        sendJson(res, 404, { error: "Session not found" });
        return;
      }
      const { messages } = await parseSessionMessages(filePath);
      sendJson(res, 200, { messages });
    } catch (err) {
      sendJson(res, 500, { error: String(err) });
    }
    return;
  }

  if (url.pathname === "/api/fs" && req.method === "GET") {
    const rawPath = url.searchParams.get("path") ?? "/";
    const resolved = resolve(rawPath);
    if (resolved.includes("\0") || /\.\./.test(rawPath)) {
      sendJson(res, 400, { error: "Invalid path" });
      return;
    }
    try {
      const entries = await browseDir(resolved);
      sendJson(res, 200, entries);
    } catch (err) {
      sendJson(res, 500, { error: String(err) });
    }
    return;
  }

  if (url.pathname === "/api/sessions" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const sessionId = randomUUID();
      sendJson(res, 200, { sessionId });
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
    }
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

const wss = new WebSocketServer({ server: httpServer });

interface ConnectionState {
  ws: import("ws").WebSocket;
  pi: PiProcess | null;
  authenticated: boolean;
  initialized: boolean;
  sessionId?: string;
  cwd?: string;
  watcherTimer?: ReturnType<typeof setInterval>;
  lastEntryId?: string;
  sessionFilePath?: string;
}

wss.on("connection", (ws) => {
  const state: ConnectionState = { ws, pi: null, authenticated: false, initialized: false };

  function sendToClient(data: unknown) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(data));
    }
  }

  function stopWatcher() {
    if (state.watcherTimer) {
      clearInterval(state.watcherTimer);
      state.watcherTimer = undefined;
    }
  }

  async function startWatcher() {
    stopWatcher();
    if (!state.sessionId) return;

    const filePath = await findSessionFileById(state.sessionId);
    if (!filePath) return;
    state.sessionFilePath = filePath;

    // Load initial state
    try {
      const { messages, lastEntryId } = await parseSessionMessages(filePath);
      state.lastEntryId = lastEntryId ?? undefined;
    } catch {
      // ignore
    }

    state.watcherTimer = setInterval(async () => {
      if (!state.sessionFilePath || !state.sessionId) return;
      try {
        const st = await stat(state.sessionFilePath);
        const { messages, lastEntryId } = await parseSessionMessages(
          state.sessionFilePath,
          state.lastEntryId
        );
        if (messages.length > 0) {
          state.lastEntryId = lastEntryId ?? state.lastEntryId;
          sendToClient({
            type: "history_update",
            sessionId: state.sessionId,
            messages,
          });
        }
      } catch {
        // file may be temporarily unavailable
      }
    }, 2000);
  }

  ws.on("message", (raw) => {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw.toString()) as Record<string, unknown>;
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }

    if (!state.authenticated) {
      if (data.type === "auth" && typeof data.token === "string") {
        const fakeReq = { headers: { authorization: `Bearer ${data.token}` } };
        if (authenticate(fakeReq)) {
          state.authenticated = true;
          ws.send(JSON.stringify({ type: "auth", success: true }));
        } else {
          ws.send(JSON.stringify({ type: "auth", success: false, error: "Invalid token" }));
          ws.close(1008, "Invalid token");
        }
        return;
      }
      ws.send(JSON.stringify({ type: "error", message: "Send auth first" }));
      return;
    }

    if (!state.initialized) {
      if (data.type === "init") {
        if (state.pi) {
          state.pi.kill();
        }
        stopWatcher();
        const sessionId = typeof data.sessionId === "string" ? data.sessionId : undefined;
        const cwd = typeof data.cwd === "string" ? data.cwd : CWD;
        state.sessionId = sessionId;
        state.cwd = cwd;
        state.pi = new PiProcess({
          sessionId,
          cwd,
          onMessage: (msg) => {
            sendToClient(msg);
          },
          onClose: (code) => {
            sendToClient({ type: "pi_exit", code });
          },
        });
        state.initialized = true;
        // Start watching the session file for external changes
        void startWatcher();
        return;
      }
      ws.send(JSON.stringify({ type: "error", message: "Send init before commands" }));
      return;
    }

    if (state.pi) {
      state.pi.sendFromClient(data);
    } else {
      ws.send(JSON.stringify({ type: "error", message: "Pi process not available" }));
    }
  });

  ws.on("close", () => {
    stopWatcher();
    if (state.pi) {
      state.pi.kill();
      state.pi = null;
    }
  });

  ws.on("error", (err) => {
    console.error("WS error:", err);
    stopWatcher();
    if (state.pi) {
      state.pi.kill();
      state.pi = null;
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`pi-remote-bridge listening on ws://0.0.0.0:${PORT}`);
  console.log(`Working directory: ${CWD}`);
  console.log(`Set PI_REMOTE_TOKEN env var to customize auth token`);
});
