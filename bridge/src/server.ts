import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { WebSocketServer } from "ws";
import { authenticate } from "./auth.js";
import { PiProcess } from "./pi-process.js";
import { listSessions } from "./sessions.js";
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

  if (url.pathname === "/api/fs" && req.method === "GET") {
    const rawPath = url.searchParams.get("path") ?? "/";
    const resolved = resolve(rawPath);
    // Basic traversal guard: reject paths outside root that contain .. tricks
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
}

wss.on("connection", (ws) => {
  const state: ConnectionState = { ws, pi: null, authenticated: false, initialized: false };

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
        const sessionId = typeof data.sessionId === "string" ? data.sessionId : undefined;
        const cwd = typeof data.cwd === "string" ? data.cwd : CWD;
        state.pi = new PiProcess({
          sessionId,
          cwd,
          onMessage: (msg) => {
            if (ws.readyState === 1) ws.send(JSON.stringify(msg));
          },
          onClose: (code) => {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: "pi_exit", code }));
            }
          },
        });
        state.initialized = true;
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
    if (state.pi) {
      state.pi.kill();
      state.pi = null;
    }
  });

  ws.on("error", (err) => {
    console.error("WS error:", err);
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
