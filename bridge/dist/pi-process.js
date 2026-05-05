import { spawn } from "node:child_process";
export class PiProcess {
    proc;
    buffer = "";
    onMessage;
    onClose;
    pendingExtensionUIs = new Map();
    closed = false;
    constructor(options) {
        this.onMessage = options.onMessage;
        this.onClose = options.onClose;
        const args = ["--mode", "rpc"];
        if (options.sessionId) {
            args.push("--session", options.sessionId);
        }
        else {
            args.push("-c");
        }
        this.proc = spawn("pi", args, { stdio: ["pipe", "pipe", "pipe"], cwd: options.cwd || process.cwd() });
        this.proc.stdout.setEncoding("utf8");
        this.proc.stdout.on("data", (chunk) => this.handleStdout(chunk));
        this.proc.stderr.on("data", (chunk) => {
            console.error("[pi stderr]", chunk.toString());
        });
        this.proc.on("exit", (code) => {
            this.closed = true;
            this.onClose(code);
        });
    }
    handleStdout(chunk) {
        this.buffer += chunk;
        while (true) {
            const idx = this.buffer.indexOf("\n");
            if (idx === -1)
                break;
            let line = this.buffer.slice(0, idx);
            this.buffer = this.buffer.slice(idx + 1);
            if (line.endsWith("\r"))
                line = line.slice(0, -1);
            if (!line.trim())
                continue;
            try {
                const data = JSON.parse(line);
                if (data.type === "extension_ui_request") {
                    const req = data;
                    const id = req.id;
                    if (typeof id === "string") {
                        const timeout = setTimeout(() => {
                            if (this.pendingExtensionUIs.has(id)) {
                                this.pendingExtensionUIs.delete(id);
                                this.sendToPi({ type: "extension_ui_response", id, cancelled: true });
                            }
                        }, req.timeout ?? 60000);
                        this.pendingExtensionUIs.set(id, {
                            resolve: (response) => {
                                clearTimeout(timeout);
                                this.pendingExtensionUIs.delete(id);
                                this.sendToPi(response);
                            },
                            timeout,
                        });
                    }
                }
                this.onMessage(data);
            }
            catch {
                // ignore malformed lines
            }
        }
    }
    sendFromClient(data) {
        if (data.type === "extension_ui_response" && typeof data.id === "string") {
            const pending = this.pendingExtensionUIs.get(data.id);
            if (pending) {
                pending.resolve(data);
                return;
            }
        }
        this.sendToPi(data);
    }
    sendToPi(data) {
        if (this.closed || !this.proc.stdin)
            return;
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
