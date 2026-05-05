import type { SessionInfo, FsEntry } from "../types";

export class ApiClient {
  constructor(
    private baseUrl: string,
    private token: string,
  ) {}

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        ...(options?.headers || {}),
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    return (await res.json()) as T;
  }

  async getHealth(): Promise<{ status: string }> {
    return this.request("/health");
  }

  async getSessions(): Promise<SessionInfo[]> {
    return this.request("/api/sessions");
  }

  async browseDir(path: string): Promise<FsEntry[]> {
    const encoded = encodeURIComponent(path);
    return this.request(`/api/fs?path=${encoded}`);
  }

  async createSession(cwd: string): Promise<{ sessionId: string }> {
    return this.request("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ cwd }),
    });
  }
}
