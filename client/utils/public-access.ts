import { backendFetch } from "./backend-fetch";

let publicAccess = false;
let openingSession: Promise<void> | undefined;

export function isPublicAccessEnabled(): boolean {
  return publicAccess;
}

export async function getAccessMode(): Promise<{ publicAccess: boolean }> {
  const response = await backendFetch("/auth/access-mode");
  // Older development servers predate this optional deployment mode.
  if (response.status === 404) {
    publicAccess = false;
    return { publicAccess: false };
  }
  if (!response.ok) throw new Error(`Unable to check workspace access (${response.status}).`);
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || !("publicAccess" in result)
    || typeof result.publicAccess !== "boolean") {
    throw new Error("The server returned an invalid workspace access mode.");
  }
  publicAccess = result.publicAccess;
  return { publicAccess };
}

export function openPublicSession(): Promise<void> {
  if (openingSession) return openingSession;
  openingSession = (async () => {
    const response = await backendFetch("/auth/session/public", { method: "POST" });
    if (!response.ok) throw new Error(`Unable to open the workspace (${response.status}). Please try again.`);
  })().finally(() => { openingSession = undefined; });
  return openingSession;
}

export async function fetchWithPublicSession(url: string | URL, options?: RequestInit): Promise<Response> {
  const response = await fetch(url, options);
  if (response.status !== 401 || !publicAccess) return response;
  // Authentication rejects the request before its handler runs. Restore once
  // without unmounting an editor or replaying an uncertain network failure.
  await openPublicSession();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("exam-creator:public-session-restored"));
  }
  return fetch(url, options);
}
