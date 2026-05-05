export interface SessionInfo {
  id: string;
  name?: string;
  cwd: string;
  path: string;
  messageCount: number;
  modified: number;
  created: number;
  tokens?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  cost?: number;
}

export interface FsEntry {
  name: string;
  path: string;
  type: "file" | "directory";
}

export interface HostConfig {
  id: string;
  name: string;
  serverUrl: string;
  token: string;
}

export interface AppSettings {
  hosts: HostConfig[];
  activeHostId?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  text: string;
  thinking?: string;
  pending?: boolean;
  createdAt: number;
  toolName?: string;
  toolArgs?: string;
  toolResult?: string;
  isError?: boolean;
}

export interface TokenStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

export interface AgentEvent {
  type: string;
  [key: string]: any;
}

export interface ExtensionUIRequest {
  type: string;
  id: string;
  method: string;
  title?: string;
  message?: string;
  options?: string[];
  placeholder?: string;
  prefill?: string;
  notifyType?: string;
  timeout?: number;
}
