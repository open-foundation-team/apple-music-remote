import { PlaybackInfo, ServerStatus } from "./types";

export class RemoteApi {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = RemoteApi.normalizeBaseUrl(baseUrl);
    this.token = token.trim();
  }

  async ping(): Promise<ServerStatus> {
    return this.get<ServerStatus>("/api/ping");
  }

  async getState(): Promise<PlaybackInfo> {
    return this.get<PlaybackInfo>("/api/state");
  }

  async play(): Promise<void> {
    await this.post("/api/play");
  }

  async pause(): Promise<void> {
    await this.post("/api/pause");
  }

  async toggle(): Promise<void> {
    await this.post("/api/toggle");
  }

  async next(): Promise<void> {
    await this.post("/api/next");
  }

  async previous(): Promise<void> {
    await this.post("/api/previous");
  }

  async setVolume(volume: number): Promise<void> {
    await this.post("/api/volume", { volume: Math.round(volume) });
  }

  async getSystemVolume(): Promise<number> {
    const response = await this.get<{ volume: number }>("/api/system-volume");
    return response.volume;
  }

  async setSystemVolume(volume: number): Promise<void> {
    await this.post("/api/system-volume", { volume: Math.round(volume) });
  }

  private async get<T>(path: string): Promise<T> {
    const response = await fetch(this.compose(path), {
      method: "GET",
      headers: this.headers()
    });
    return this.parseResponse<T>(response);
  }

  private async post<T>(path: string, body?: Record<string, unknown>): Promise<T | void> {
    const response = await fetch(this.compose(path), {
      method: "POST",
      headers: this.headers(body ? "json" : "none"),
      body: body ? JSON.stringify(body) : undefined
    });
    return this.parseResponse<T>(response);
  }

  private headers(body: "json" | "none" = "none"): HeadersInit {
    const headers: Record<string, string> = {
      "X-Amr-Token": this.token
    };
    if (body === "json") {
      headers["Content-Type"] = "application/json";
    }
    return headers;
  }

  private compose(path: string): string {
    if (path.startsWith("http")) {
      return path;
    }
    const normalized = path.startsWith("/") ? path : `/${path}`;
    return `${this.baseUrl}${normalized}`;
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      let message = `${response.status} ${response.statusText}`;
      try {
        const payload = await response.json();
        if (payload?.error) {
          message = payload.error;
        }
      } catch {
        // ignore
      }
      throw new Error(message);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  private static normalizeBaseUrl(baseUrl: string): string {
    const trimmed = baseUrl.trim().replace(/\/$/, "");
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    return `http://${trimmed}`;
  }
}
