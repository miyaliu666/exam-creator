import assert from "node:assert/strict";
import test from "node:test";

import { getDevLoginStatus } from "../client/utils/dev-login-status.ts";

async function withFetch(
  replacement: (input: RequestInfo | URL) => Promise<Response>,
  check: () => Promise<void>,
) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = replacement as typeof fetch;
  try {
    await check();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

for (const enabled of [true, false]) {
  test(`a successful status response preserves development sign-in enabled=${enabled}`, async () => {
    await withFetch(async (input) => {
      assert.equal(input, "/auth/login/dev/status");
      return Response.json({ enabled });
    }, async () => {
      assert.deepEqual(await getDevLoginStatus(), { enabled });
    });
  });
}

test("an unavailable backend must not be treated as GitHub-only sign-in", async () => {
  await withFetch(async () => new Response("Bad Gateway", { status: 502 }), async () => {
    await assert.rejects(getDevLoginStatus(), /502/);
  });
});

test("a status network failure stays recoverable as a connection error", async () => {
  const connectionError = new TypeError("Failed to fetch");
  await withFetch(async () => {
    throw connectionError;
  }, async () => {
    await assert.rejects(getDevLoginStatus(), (error: unknown) => error === connectionError);
  });
});
