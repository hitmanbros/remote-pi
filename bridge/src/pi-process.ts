import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

interface PiProcessOptions {
  sessionId?: string;
  cwd?: string;
  onMessage: (data: unknown) => void;
  onClose: (code: number | null) => void;
}

interface PendingExtensionUI {
  resolve: (response: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class PiProcess {
  private proc: ChildProcessWithoutNullStreams;
  private buffer = "";
  private onMessage: (data: unknown) => void;
  private onClose: (code: number | null) => void;
  private pendingExtensionUIs = new Map<string, PendingExtensionUI>();
  private closed = false;

  constructor(options: PiProcessOptions) {
    this.onMessage = options.onMessage;
    this.onClose = options.onClose;

    const args = ["--mode", "rpc"];
    if (options.sessionId) {
      args.push("--session", options.sessionId);
    } else {
      args.push("-c");
    }
    if (options.cwd) {
      args.push("--cwd", options.cwd);
    }

    this.proc = spawn("pi", args, { stdio: ["pipe", "pipe", "pipe"] });
    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk: string) => this.handleStdout(chunk));
    this.proc.stderr.on("data", (chunk: Buffer) => {
      console.error("[pi stderr]", chunk.toString());
    });
    this.proc.on("exit", (code) => {
      this.closed = true;
      this.onClose(code);
    });
  }

  private handleStdout(chunk: string) {
    this.buffer += chunk;
    while (true) {
      const idx = this.buffer.indexOf("\n");
      if (idx === -1) break;
      let line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line) as Record<string, unknown>;
        if (data.type === "extension_ui_request") {
          const req = data as { id?: string; timeout?: number };
          const id = req.id;
          if (typeof id === "string") {
            const timeout = setTimeout(() => {
              if (this.pendingExtensionUIs.has(id)) {
                this.pendingExtensionUIs.delete(id);
                this.sendToPi({ type: "extension_ui_response", id, cancelled: true });
              }
            }, req.timeout ?? 60000);
            this.pendingExtensionUIs.set(id, {
              resolve: (response: unknown) => {
                clearTimeout(timeout);
                this.pendingExtensionUIs.delete(id);
                this.sendToPi(response);
              },
              timeout,
            });
          }
        }
        this.onMessage(data);
      } catch {
        // ignore malformed lines
      }
    }
  }

  sendFromClient(data: Record<string, unknown>) {
    if (data.type === "extension_ui_response" && typeof data.id === "string") {
      const pending = this.pendingExtensionUIs.get(data.id);
      if (pending) {
        pending.resolve(data);
        return;
      }
    }
    this.sendToPi(data);
  }

  sendToPi(data: unknown) {
    if (this.closed || !this.proc.stdin) return;
    this.proc.stdin.write(JSON.stringify(data) + "\n");
  }

  kill() {
    this.closed = true;
    for (const p of this.pendingExtensionUIs.values()) {
      clearTimeout(p.timeout);
    }
    this.pendingExtensionUIs.clear();
    this.proc.kill("SIGTERM");
  }
}
