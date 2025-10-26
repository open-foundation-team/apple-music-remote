export const DEFAULT_DEV_PORT = 5173;

export function inferDefaultBaseUrl(): string {
  if (typeof window === "undefined") {
    return "";
  }
  const origin = window.location.origin;
  if (origin.startsWith("http") && !origin.includes(`:${DEFAULT_DEV_PORT}`)) {
    return origin;
  }
  return "";
}

export function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed.replace(/\/+$/, "");
  }
  return `http://${trimmed.replace(/\/+$/, "")}`;
}

export function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
