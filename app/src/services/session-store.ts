import { PiWebSocket } from "./websocket";
import type { ChatMessage, HostConfig, AgentEvent, ExtensionUIRequest, TokenStats } from "../types";

type Listener = () => void;

interface HistoryMessage {
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

interface SessionState {
  messages: ChatMessage[];
  isStreaming: boolean;
  pendingCount: number;
  connected: boolean;
  tokenStats: { tokens?: TokenStats; cost?: number } | null;
  extUI: ExtensionUIRequest | null;
}

class SessionStore {
  private ws: PiWebSocket | null = null;
  private host: HostConfig | null = null;
  private sessionId: string | null = null;
  private states = new Map<string, SessionState>();
  private listeners = new Set<Listener>();
  private eventUnsub: (() => void) | null = null;
  private connUnsub: (() => void) | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private assistantId: string | null = null;
  private pendingToolId: string | null = null;

  private getState(sessionId: string): SessionState {
    if (!this.states.has(sessionId)) {
      this.states.set(sessionId, {
        messages: [],
        isStreaming: false,
        pendingCount: 0,
        connected: false,
        tokenStats: null,
        extUI: null,
      });
    }
    return this.states.get(sessionId)!;
  }

  private setState(sessionId: string, updater: (s: SessionState) => SessionState): void {
    const current = this.getState(sessionId);
    this.states.set(sessionId, updater(current));
    this.notify();
  }

  getMessages(sessionId: string): ChatMessage[] {
    return this.getState(sessionId).messages;
  }

  getAllState(sessionId: string): SessionState {
    return this.getState(sessionId);
  }

  isConnected(): boolean {
    return this.ws?.isConnected ?? false;
  }

  currentSessionId(): string | null {
    return this.sessionId;
  }

  async connect(host: HostConfig, sessionId: string, cwd: string): Promise<void> {
    if (
      this.ws &&
      this.host?.serverUrl === host.serverUrl &&
      this.host?.token === host.token &&
      this.sessionId === sessionId
    ) {
      return; // already connected to same session
    }

    this.disconnect();
    this.host = host;
    this.sessionId = sessionId;

    this.ws = new PiWebSocket({
      serverUrl: host.serverUrl,
      token: host.token,
      sessionId,
      cwd,
    });

    this.connUnsub = this.ws.onConnectionChange((connected) => {
      if (this.sessionId) {
        this.setState(this.sessionId, (s) => ({ ...s, connected }));
      }
      if (connected && this.ws) {
        this.startStatsPolling();
      }
    });

    this.eventUnsub = this.ws.onEvent((event: AgentEvent) => {
      this.handleEvent(event);
    });

    this.ws.connect();

    // Load full history from REST API
    await this.loadHistory(host, sessionId);
  }

  private async loadHistory(host: HostConfig, sessionId: string): Promise<void> {
    try {
      const baseUrl = host.serverUrl.replace(/^ws/, "http");
      const res = await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
        headers: { Authorization: `Bearer ${host.token}` },
      });
      if (!res.ok) return;
      const data = await res.json() as { messages?: HistoryMessage[] };
      if (!data.messages) return;

      const converted = data.messages.map((m) => this.historyToChat(m));
      this.setState(sessionId, (s) => ({
        ...s,
        messages: this.mergeMessages(s.messages, converted),
      }));
    } catch {
      // ignore fetch errors
    }
  }

  private historyToChat(h: HistoryMessage): ChatMessage {
    return {
      id: h.entryId,
      role: h.role,
      text: h.text,
      thinking: h.thinking,
      toolName: h.toolName,
      toolArgs: h.toolArgs,
      toolResult: h.toolResult,
      isError: h.isError,
      createdAt: h.timestamp,
    };
  }

  private mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
    const seen = new Set(existing.map((m) => m.id));
    const newOnes = incoming.filter((m) => !seen.has(m.id));
    return [...existing, ...newOnes];
  }

  disconnect(): void {
    this.stopStatsPolling();
    this.eventUnsub?.();
    this.connUnsub?.();
    this.ws?.disconnect();
    this.ws = null;
    this.host = null;
    this.sessionId = null;
    this.assistantId = null;
    this.pendingToolId = null;
  }

  sendPrompt(text: string): void {
    if (!this.ws || !this.sessionId) return;

    if (text === "/new") {
      this.ws.newSession();
      this.setState(this.sessionId, (s) => ({
        ...s,
        messages: [
          ...s.messages,
          { id: genId(), role: "system", text: "Started new session.", createdAt: Date.now() },
        ],
      }));
      return;
    }

    this.ws.prompt(text);
    this.setState(this.sessionId, (s) => ({
      ...s,
      messages: [
        ...s.messages,
        { id: genId(), role: "user", text, createdAt: Date.now() },
      ],
    }));
  }

  abort(): void {
    this.ws?.abort();
    if (this.sessionId) {
      this.setState(this.sessionId, (s) => ({ ...s, isStreaming: false }));
    }
  }

  extensionUIResponse(id: string, response?: Record<string, unknown>): void {
    this.ws?.extensionUIResponse(id, response);
    if (this.sessionId) {
      this.setState(this.sessionId, (s) => ({ ...s, extUI: null }));
    }
  }

  clearExtUI(): void {
    if (this.sessionId) {
      this.setState(this.sessionId, (s) => ({ ...s, extUI: null }));
    }
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }

  private startStatsPolling(): void {
    this.stopStatsPolling();
    this.statsTimer = setInterval(() => {
      this.ws?.getSessionStats();
    }, 10000);
  }

  private stopStatsPolling(): void {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
  }

  private handleEvent(event: AgentEvent): void {
    const sid = this.sessionId;
    if (!sid) return;

    // Handle history updates from file watcher (PC changes)
    if (event.type === "history_update") {
      const messages = (event as Record<string, unknown>).messages as HistoryMessage[] | undefined;
      if (messages && messages.length > 0) {
        const converted = messages.map((m) => this.historyToChat(m));
        this.setState(sid, (s) => ({
          ...s,
          messages: this.mergeMessages(s.messages, converted),
        }));
      }
      return;
    }

    switch (event.type) {
      case "message_start": {
        const id = genId();
        this.assistantId = id;
        this.setState(sid, (s) => ({
          ...s,
          messages: [...s.messages, { id, role: "assistant", text: "", pending: true, createdAt: Date.now() }],
        }));
        break;
      }
      case "message_update": {
        const ame = (event as Record<string, unknown>).assistantMessageEvent as Record<string, unknown> | undefined;
        if (!ame) return;
        const id = this.assistantId;
        if (!id) return;
        if (ame.type === "text_delta") {
          const delta = ame.delta as string;
          this.setState(sid, (s) => ({
            ...s,
            messages: s.messages.map((m) => (m.id === id ? { ...m, text: m.text + delta } : m)),
          }));
        }
        if (ame.type === "thinking_delta") {
          const delta = ame.delta as string;
          this.setState(sid, (s) => ({
            ...s,
            messages: s.messages.map((m) => (m.id === id ? { ...m, thinking: (m.thinking ?? "") + delta } : m)),
          }));
        }
        break;
      }
      case "message_end": {
        const id = this.assistantId;
        if (!id) return;
        this.setState(sid, (s) => ({
          ...s,
          messages: s.messages.map((m) => (m.id === id ? { ...m, pending: false } : m)),
        }));
        this.assistantId = null;
        break;
      }
      case "agent_start":
        this.setState(sid, (s) => ({ ...s, isStreaming: true }));
        break;
      case "agent_end": {
        this.setState(sid, (s) => ({ ...s, isStreaming: false }));
        this.ws?.getSessionStats();
        break;
      }
      case "tool_execution_start": {
        const toolName = (event as Record<string, unknown>).toolName as string | undefined;
        const args = (event as Record<string, unknown>).args;
        const id = genId();
        this.pendingToolId = id;
        this.setState(sid, (s) => ({
          ...s,
          messages: [
            ...s.messages,
            {
              id,
              role: "tool",
              text: "",
              toolName: toolName ?? "tool",
              toolArgs: args ? JSON.stringify(args, null, 2) : undefined,
              pending: true,
              createdAt: Date.now(),
            },
          ],
        }));
        break;
      }
      case "tool_execution_update": {
        const result = (event as Record<string, unknown>).result;
        const id = this.pendingToolId;
        if (!id) return;
        const text = extractResultText(result);
        this.setState(sid, (s) => ({
          ...s,
          messages: s.messages.map((m) => (m.id === id ? { ...m, toolResult: (m.toolResult ?? "") + text } : m)),
        }));
        break;
      }
      case "tool_execution_end": {
        const toolName = (event as Record<string, unknown>).toolName as string | undefined;
        const result = (event as Record<string, unknown>).result;
        const isError = (event as Record<string, unknown>).isError as boolean | undefined;
        const id = this.pendingToolId;
        if (id) {
          const text = extractResultText(result);
          this.setState(sid, (s) => ({
            ...s,
            messages: s.messages.map((m) =>
              m.id === id
                ? {
                    ...m,
                    toolName: toolName ?? m.toolName,
                    toolResult: text || m.toolResult,
                    isError: !!isError,
                    pending: false,
                  }
                : m
            ),
          }));
          this.pendingToolId = null;
        }
        break;
      }
      case "queue_update": {
        const steering = (event as Record<string, unknown>).steering as string[] | undefined;
        const followUp = (event as Record<string, unknown>).followUp as string[] | undefined;
        const count = (steering?.length ?? 0) + (followUp?.length ?? 0);
        this.setState(sid, (s) => ({ ...s, pendingCount: count }));
        break;
      }
      case "extension_ui_request": {
        const req = event as unknown as ExtensionUIRequest;
        this.setState(sid, (s) => ({ ...s, extUI: req }));
        break;
      }
      case "system": {
        const text = (event as Record<string, unknown>).text as string | undefined;
        if (text) {
          this.setState(sid, (s) => ({
            ...s,
            messages: [...s.messages, { id: genId(), role: "system", text, createdAt: Date.now() }],
          }));
        }
        break;
      }
      case "response": {
        const tokens = (event as Record<string, unknown>).tokens as TokenStats | undefined;
        const cost = (event as Record<string, unknown>).cost as number | undefined;
        if (tokens || cost !== undefined) {
          this.setState(sid, (s) => ({ ...s, tokenStats: { tokens, cost } }));
        }
        break;
      }
      default:
        break;
    }
  }
}

function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function extractResultText(result: unknown): string {
  if (typeof result === "string") return result;
  if (Array.isArray(result)) {
    return result
      .map((c) => (typeof c === "string" ? c : (c as Record<string, unknown>)?.text ?? JSON.stringify(c)))
      .filter(Boolean)
      .join("\n");
  }
  if (result && typeof result === "object") {
    const content = (result as Record<string, unknown>).content;
    if (Array.isArray(content)) {
      return content.map((c: Record<string, unknown>) => c.text).filter(Boolean).join("\n");
    }
    return JSON.stringify(result, null, 2);
  }
  return String(result ?? "");
}

export const sessionStore = new SessionStore();
