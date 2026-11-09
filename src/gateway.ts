import type { AppConfig } from "./config.js";

export class GatewayClient {
  constructor(private readonly config: AppConfig) {}

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    if (!this.config.token) {
      throw new Error("AIT_DRIVE_TOKEN is missing. Create a scoped Personal Access Token from your AIT Drive browser session and set AIT_DRIVE_TOKEN.");
    }
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.config.token}`);
    return fetch(new URL(path, this.config.baseUrl), { ...init, headers, signal: AbortSignal.timeout(30_000) });
  }

  async getJson<T>(path: string): Promise<T> {
    const response = await this.request(path);
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(body.error || `Gateway request failed (${response.status}).`);
    return body as T;
  }

  async postJson<T>(path: string, body: unknown): Promise<T> {
    const response = await this.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const result = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(result.error || `Gateway request failed (${response.status}).`);
    return result as T;
  }

  async me() {
    return this.getJson<{ id: string; name: string; role: string; quota: number | null; perms: Record<string, boolean>; canAdmin: boolean }>("/api/me");
  }

  async list(path = "") {
    return this.getJson<{ path: string; items: Array<{ name: string; type: "file" | "dir"; size?: number; mtime?: number }> }>(`/api/list?path=${encodeURIComponent(path)}`);
  }

  async search(query: string) {
    return this.getJson<{ items: Array<{ name: string; path: string; type: "file" | "dir"; size?: number; mtime?: number }> }>(`/api/search?q=${encodeURIComponent(query)}`);
  }

  async stats() {
    return this.getJson<{ total: number; free: number; used: number; trash?: number; quota?: number }>("/api/stats");
  }

  async share(path: string, days = 7) {
    return this.postJson<{ url: string; days: number }>("/api/share", { path, days });
  }
}
