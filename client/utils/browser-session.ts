import { createCodeChallenge, createCodeVerifier } from "./auth";
import { apiBaseUrl, appPathname, backendUrl, usesExternalApi } from "./deployment";

const sessionKey = "exam-creator:browser-session:v1";
const loginKey = "exam-creator:browser-login:v1";
const loginLifetimeMs = 10 * 60 * 1000;

type BrowserSession = { accessToken: string; expiresAt: string; backend: string };
type LoginAttempt = { codeVerifier: string; startedAt: number; backend: string };
type LoginCallback = { code?: string; failed: boolean };

const storage = () => typeof window === "undefined" ? undefined : window.sessionStorage;

export function readBrowserToken(): string | undefined {
  if (!usesExternalApi) return undefined;
  try {
    const raw = storage()?.getItem(sessionKey);
    if (!raw) return undefined;
    const saved = JSON.parse(raw) as Partial<BrowserSession>;
    if (saved.backend === apiBaseUrl && typeof saved.accessToken === "string"
      && saved.accessToken.length > 0 && !/\s/.test(saved.accessToken)
      && typeof saved.expiresAt === "string" && Date.parse(saved.expiresAt) > Date.now()) {
      return saved.accessToken;
    }
    storage()?.removeItem(sessionKey);
  } catch { /* Unavailable or damaged browser storage is an unauthenticated session. */ }
  return undefined;
}

export function clearBrowserSession(expectedToken?: string): void {
  if (expectedToken && readBrowserToken() !== expectedToken) return;
  try { storage()?.removeItem(sessionKey); } catch { /* Nothing usable to preserve. */ }
}

export async function beginBrowserLogin(): Promise<void> {
  const codeVerifier = createCodeVerifier();
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const target = backendUrl("/auth/login/github");
  target.searchParams.set("code_challenge", codeChallenge);
  try {
    storage()?.setItem(loginKey, JSON.stringify({ codeVerifier, backend: apiBaseUrl, startedAt: Date.now() } satisfies LoginAttempt));
    if (!storage()?.getItem(loginKey)) throw new Error("Storage unavailable");
  } catch {
    throw new Error("Allow session storage in this browser to sign in, then try again.");
  }
  clearBrowserSession();
  callback = undefined;
  exchangePromise = undefined;
  window.location.assign(target.href);
}

let callback: LoginCallback | undefined;
let exchangePromise: Promise<void> | undefined;

/** Run before constructing the router; keep login codes out of later URLs and logs. */
export function captureBrowserLoginCallback(): void {
  if (!usesExternalApi || typeof window === "undefined" || callback
    || appPathname(window.location.pathname) !== "/auth/callback/github") return;
  const url = new URL(window.location.href);
  const code = url.searchParams.get("login_code") || undefined;
  const failed = url.searchParams.has("login_error");
  if (!code && !failed) return;
  callback = { code, failed };
  url.searchParams.delete("login_code");
  url.searchParams.delete("login_error");
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
}

export function hasBrowserLoginCallback(): boolean {
  captureBrowserLoginCallback();
  return Boolean(callback);
}

export function completeBrowserLogin(): Promise<void> {
  if (exchangePromise) return exchangePromise;
  captureBrowserLoginCallback();
  exchangePromise = exchangeLogin();
  return exchangePromise;
}

async function exchangeLogin(): Promise<void> {
  let pending: Partial<LoginAttempt> | undefined;
  try {
    pending = JSON.parse(storage()?.getItem(loginKey) || "null") as LoginAttempt | undefined;
  } catch { /* Missing state is handled below. */ }
  try {
    if (callback?.failed) throw new Error("GitHub sign-in was not completed. Please sign in again.");
    if (!callback?.code || !pending || pending.backend !== apiBaseUrl
      || typeof pending.codeVerifier !== "string" || typeof pending.startedAt !== "number"
      || pending.startedAt > Date.now() || Date.now() - pending.startedAt > loginLifetimeMs) {
      throw new Error("This sign-in has expired. Please start sign-in again in this tab.");
    }
    // Dynamic import keeps HTTP handling independent from the stored session helpers.
    const { backendFetch } = await import("./backend-fetch");
    const response = await backendFetch("/auth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: callback.code, codeVerifier: pending.codeVerifier }),
    });
    if (!response.ok) throw new Error("GitHub sign-in could not be completed. Please sign in again.");
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("accessToken" in result) || !("expiresAt" in result)
      || typeof result.accessToken !== "string" || !result.accessToken || /\s/.test(result.accessToken)
      || typeof result.expiresAt !== "string" || !(Date.parse(result.expiresAt) > Date.now())) {
      throw new Error("The server returned an invalid sign-in session. Please sign in again.");
    }
    storage()?.setItem(sessionKey, JSON.stringify({ ...result, backend: apiBaseUrl }));
    if (!readBrowserToken()) throw new Error("The browser could not save the sign-in session.");
  } finally {
    try { storage()?.removeItem(loginKey); } catch { /* No remaining verifier. */ }
    if (callback) callback.code = undefined;
  }
}
