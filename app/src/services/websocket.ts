import { type AgentEvent } from "../types";

export interface WSConfig {
  serverUrl: string;
  token: string;
  sessionId?: string;
  cwd?: string;
}

type EventListener = (event: AgentEvent) => void;
type ConnectionListener = (connected: boolean) => void;

export class PiWebSocket {
  private ws: WebSocket | null = null;
  private config: WSConfig | null = null;
  private listeners: EventListener[] = [];
  private connListeners: ConnectionListener[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;
  private authenticated = false;

  constructor(config?: WSConfig) {
    if (config) {
      this.config = config;
    }
  }

  get currentConfig(): WSConfig | null {
    return this.config;
  }

  switchHost(config: WSConfig | null): void {
    this.disconnect();
    this.config = config;
    if (config) {
      this.connect();
    }
  }

  connect(): void {
    if (this.ws || !this.config) {
      console.log("[WS] blocked: ws=", !!this.ws, "config=", !!this.config);
      return;
    }
    this.shouldReconnect = true;
    const url = this.config.serverUrl.replace(/^http/, "ws");
    console.log("[WS] connecting to", url);
    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      console.log("[WS] constructor threw", err);
      return;
    }

    this.ws.onopen = () => {
      console.log("[WS] onopen");
      this.authenticated = false;
      this.send({ type: "auth", token: this.config!.token });
    };

    this.ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string) as AgentEvent;
        console.log("[WS] msg", data.type);
        if (data.type === "auth" && (data as Record<string, unknown>).success === true) {
          this.authenticated = true;
          this.notifyConn(true);
          this.send({
            type: "init",
            sessionId: this.config?.sessionId,
            cwd: this.config?.cwd,
          });
          return;
        }
        if (data.type === "auth" && (data as Record<string, unknown>).success === false) {
          this.notifyConn(false);
          return;
        }
        this.listeners.forEach((l) => l(data));
      } catch {
        // ignore
      }
    };

    this.ws.onclose = (ev) => {
      console.log("[WS] onclose code=", ev.code, "reason=", ev.reason);
      this.ws = null;
      this.authenticated = false;
      this.notifyConn(false);
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      }
    };

    this.ws.onerror = (err) => {
      console.log("[WS] onerror", err);
      this.ws?.close();
    };
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.authenticated = false;
    this.notifyConn(false);
  }

  send(data: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  prompt(message: string, images?: Array<{ data: string; mimeType: string }>): void {
    this.send({ type: "prompt", message, images });
  }

  steer(message: string): void {
    this.send({ type: "steer", message });
  }

  followUp(message: string): void {
    this.send({ type: "follow_up", message });
  }

  abort(): void {
    this.send({ type: "abort" });
  }

  newSession(): void {
    this.send({ type: "new_session" });
  }

  getSessionStats(): void {
    this.send({ type: "get_session_stats" });
  }

  extensionUIResponse(id: string, response?: Record<string, unknown>): void {
    this.send({ type: "extension_ui_response", id, ...response });
  }

  onEvent(listener: EventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  onConnectionChange(listener: ConnectionListener): () => void {
    this.connListeners.push(listener);
    return () => {
      this.connListeners = this.connListeners.filter((l) => l !== listener);
    };
  }

  private notifyConn(connected: boolean): void {
    this.connListeners.forEach((l) => l(connected));
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.authenticated;
  }
}
