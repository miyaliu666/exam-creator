import { normalizeApiBaseUrl, normalizeBasePath, resolveBackendUrl, withBasePath, withoutBasePath } from "./deployment-paths";

export const appBasePath = normalizeBasePath(import.meta.env?.BASE_URL || "/");
export const apiBaseUrl = normalizeApiBaseUrl(import.meta.env?.VITE_API_BASE_URL, import.meta.env?.PROD);
export const usesExternalApi = Boolean(apiBaseUrl);

export const pageOrigin = () => typeof window === "undefined" ? "http://localhost" : window.location.origin;
export const appPath = (path: string) => withBasePath(path, appBasePath);
export const appPathname = (path: string) => withoutBasePath(path, appBasePath);
export const backendUrl = (path: string | URL) => resolveBackendUrl(path, apiBaseUrl, pageOrigin());

export function websocketUrl(path: string): string {
  if (!/^\/ws\//.test(path) || path.includes("\\")) throw new Error("Expected a WebSocket endpoint.");
  const url = new URL(path, apiBaseUrl || pageOrigin());
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
}
