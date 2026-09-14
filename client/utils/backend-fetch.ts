import { clearBrowserSession, readBrowserToken } from "./browser-session";
import { backendUrl, usesExternalApi } from "./deployment";
import { usesNgrokHost } from "./deployment-paths";

/** All API/auth requests pass through this boundary; public assets use plain fetch. */
export async function backendFetch(input: string | URL, options?: RequestInit): Promise<Response> {
  const url = backendUrl(input);
  const headers = new Headers(options?.headers);
  const token = usesExternalApi ? readBrowserToken() : undefined;
  if (usesExternalApi) {
    headers.delete("Authorization");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (usesNgrokHost(url.origin)) headers.set("ngrok-skip-browser-warning", "1");
  }
  const response = await fetch(usesExternalApi ? url.href : url.pathname + url.search, {
    ...options,
    credentials: usesExternalApi ? "omit" : "include",
    ...(usesExternalApi ? { redirect: "error" as const } : {}),
    headers,
  });
  if (response.status === 401 && token) clearBrowserSession(token);
  return response;
}
