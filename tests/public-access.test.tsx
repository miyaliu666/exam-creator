import assert from "node:assert/strict";
import test from "node:test";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { renderToStaticMarkup } from "react-dom/server";
import { SignOutButton } from "../client/components/sign-out-button";
import { AuthContext } from "../client/contexts/auth-context";
import type { SessionUser } from "../client/types";
import { loadAuthSession } from "../client/utils/auth-session";
import { fetchWithPublicSession, getAccessMode, openPublicSession } from "../client/utils/public-access";

const user = { email: "existing-author@example.test", webSocketToken: "session-token" } as SessionUser;
function sessionApi(publicAccess: boolean, enabled = false, savedUser: SessionUser | null = user) {
  const calls: string[] = [];
  return { calls, api: {
    getAccessMode: async () => { calls.push("mode"); return { publicAccess }; },
    openPublicSession: async () => { calls.push("public"); },
    getDevLoginStatus: async () => { calls.push("dev-status"); return { enabled }; },
    getSessionUser: async () => { calls.push("user"); return savedUser; },
    loginWithDevIdentity: async () => { calls.push("dev-login"); savedUser = user; },
  } };
}

test("public access establishes the configured existing author before loading user data", async () => {
  const { api, calls } = sessionApi(true, true);
  assert.deepEqual(await loadAuthSession(api), { user, isPublicAccess: true, isDevelopmentAuth: false });
  assert.deepEqual(calls, ["mode", "public", "user"]);
});

test("public account and cookie failures remain retryable errors without falling back to another identity", async () => {
  const missing = sessionApi(true, true, null);
  await assert.rejects(loadAuthSession(missing.api), /could not open/);
  assert.deepEqual(missing.calls, ["mode", "public", "user"]);
  const unavailable = sessionApi(true, true);
  unavailable.api.openPublicSession = async () => { throw new Error("unavailable"); };
  await assert.rejects(loadAuthSession(unavailable.api), /unavailable/);
  assert.deepEqual(unavailable.calls, ["mode"]);
});

test("standard OAuth and local development retain their existing session behavior", async () => {
  const standard = sessionApi(false, false, null);
  assert.equal((await loadAuthSession(standard.api)).user, null);
  assert.deepEqual(standard.calls, ["mode", "dev-status", "user"]);
  const local = sessionApi(false, true, null);
  assert.deepEqual(await loadAuthSession(local.api), { user, isPublicAccess: false, isDevelopmentAuth: true });
  assert.deepEqual(local.calls, ["mode", "dev-status", "user", "dev-login", "user"]);
});

async function withFetch(replacement: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = replacement;
  try { await run(); } finally { globalThis.fetch = original; }
}

test("access mode validates server responses and preserves older development servers", async () => {
  for (const publicAccess of [true, false]) {
    await withFetch((async (url, options) => {
      assert.equal(url, "/auth/access-mode");
      assert.equal(options?.credentials, "include");
      return Response.json({ publicAccess });
    }) as typeof fetch, async () => assert.deepEqual(await getAccessMode(), { publicAccess }));
  }
  await withFetch((async () => new Response(null, { status: 404 })) as typeof fetch,
    async () => assert.deepEqual(await getAccessMode(), { publicAccess: false }));
  await withFetch((async () => Response.json({ publicAccess: "true" })) as typeof fetch,
    async () => { await assert.rejects(getAccessMode(), /invalid/); });
  await withFetch((async () => new Response(null, { status: 502 })) as typeof fetch,
    async () => { await assert.rejects(getAccessMode(), /502/); });
});

test("an expired public request restores its cookie and retries the rejected request once", async () => {
  const requests: string[] = [];
  const payload = JSON.stringify({ expectedRevision: 3 });
  await withFetch((async (url, options) => {
    if (url === "/auth/access-mode") return Response.json({ publicAccess: true });
    requests.push(String(url));
    if (url === "/auth/session/public") {
      assert.equal(options?.method, "POST");
      assert.equal(options?.credentials, "include");
      assert.equal(options?.body, undefined);
      return new Response(null, { status: 204 });
    }
    assert.equal(options?.body, payload);
    return new Response(null, { status: requests.length === 1 ? 401 : 200 });
  }) as typeof fetch, async () => {
    await getAccessMode();
    assert.equal((await fetchWithPublicSession("/api/items", { method: "PUT", body: payload })).status, 200);
    assert.deepEqual(requests, ["/api/items", "/auth/session/public", "/api/items"]);
  });
});

test("public recovery is shared across simultaneous expired requests", async () => {
  let openingCount = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const seen = new Set<string>();
  await withFetch((async (url) => {
    if (url === "/auth/access-mode") return Response.json({ publicAccess: true });
    if (url === "/auth/session/public") { openingCount++; await gate; return new Response(null, { status: 204 }); }
    const key = String(url);
    const status = seen.has(key) ? 200 : 401;
    seen.add(key);
    return new Response(null, { status });
  }) as typeof fetch, async () => {
    await getAccessMode();
    const first = fetchWithPublicSession("/api/one");
    const second = fetchWithPublicSession("/api/two");
    await Promise.resolve();
    release();
    assert.deepEqual((await Promise.all([first, second])).map((response) => response.status), [200, 200]);
    assert.equal(openingCount, 1);
  });
});

test("recovery never loops or replays server and uncertain network failures", async () => {
  let requests = 0;
  await withFetch((async (url) => {
    if (url === "/auth/access-mode") return Response.json({ publicAccess: true });
    requests++;
    return new Response(null, { status: url === "/auth/session/public" ? 204 : 401 });
  }) as typeof fetch, async () => {
    await getAccessMode();
    assert.equal((await fetchWithPublicSession("/api/items")).status, 401);
    assert.equal(requests, 3);
  });
  await withFetch((async () => new Response(null, { status: 500 })) as typeof fetch,
    async () => { assert.equal((await fetchWithPublicSession("/api/items")).status, 500); });
  await withFetch((async () => { throw new TypeError("network unavailable"); }) as typeof fetch,
    async () => { await assert.rejects(fetchWithPublicSession("/api/items"), /network unavailable/); });
  await withFetch((async () => new Response(null, { status: 503 })) as typeof fetch,
    async () => { await assert.rejects(openPublicSession(), /503/); });
});

test("ordinary authenticated requests never create a public session", async () => {
  let count = 0;
  await withFetch((async (url) => {
    if (url === "/auth/access-mode") return Response.json({ publicAccess: false });
    count++;
    return new Response(null, { status: 401 });
  }) as typeof fetch, async () => {
    await getAccessMode();
    assert.equal((await fetchWithPublicSession("/api/items")).status, 401);
    assert.equal(count, 1);
  });
});

test("sign-out controls are absent in public access and retain their normal account label", () => {
  for (const isPublicAccess of [true, false]) {
    const html = renderToStaticMarkup(<ChakraProvider value={defaultSystem}><AuthContext.Provider value={{
      user, isLoading: false, isDevelopmentAuth: false, isPublicAccess,
      login: async () => {}, logout: () => {}, checkLoginUser: async () => {},
    }}><SignOutButton>Sign out / switch account</SignOutButton></AuthContext.Provider></ChakraProvider>);
    assert.equal(html.includes("Sign out / switch account"), !isPublicAccess);
  }
});
