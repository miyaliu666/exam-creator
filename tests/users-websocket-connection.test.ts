import assert from "node:assert/strict";
import test from "node:test";
import { startUsersWebSocket } from "../client/contexts/users-websocket-connection";

class TestSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string; wasClean: boolean }) => void) | null = null;
  closed = false;
  close(code = 1006) {
    this.closed = true;
    this.onclose?.({ code, reason: "", wasClean: code === 1000 });
  }
}

function fixture(refreshToken: () => Promise<string>) {
  const sockets: TestSocket[] = [];
  const tokens: string[] = [];
  const errors: Error[] = [];
  const delays: number[] = [];
  const timers = new Map<number, () => void>();
  let counter = 0;
  let opens = 0;
  let messages = 0;
  const stop = startUsersWebSocket({
    initialToken: "initial-once", refreshToken,
    createSocket: (token) => { tokens.push(token); const socket = new TestSocket(); sockets.push(socket); return socket as unknown as WebSocket; },
    onSocket: () => {}, onMessage: () => { messages++; }, onOpen: () => { opens++; }, onError: (error) => errors.push(error),
    schedule: (callback, delay) => { const id = ++counter; timers.set(id, callback); delays.push(delay); return id; },
    cancel: (id) => { timers.delete(id); },
  });
  return { sockets, tokens, errors, delays, timers, stop, counts: () => ({ opens, messages }),
    tick: async () => { const [id, callback] = [...timers][0]; timers.delete(id); callback(); await Promise.resolve(); await Promise.resolve(); },
  };
}

test("each network reconnect obtains a fresh single-use token", async () => {
  let refreshes = 0;
  const connection = fixture(async () => `fresh-${++refreshes}`);
  assert.deepEqual(connection.tokens, ["initial-once"]);
  connection.sockets[0].onopen?.();
  connection.sockets[0].close();
  await connection.tick();
  connection.sockets[1].onopen?.();
  connection.sockets[1].close();
  await connection.tick();
  assert.deepEqual(connection.tokens, ["initial-once", "fresh-1", "fresh-2"]);
  assert.deepEqual(connection.delays, [1000, 1000]);
  connection.stop();
});

test("server and session recovery failures use one timer with bounded exponential backoff", async () => {
  let refreshes = 0;
  const connection = fixture(async () => { if (++refreshes < 8) throw new Error("server restarting"); return "recovered"; });
  connection.sockets[0].onerror?.();
  assert.equal(connection.timers.size, 0);
  connection.sockets[0].close();
  connection.sockets[0].close();
  assert.equal(connection.timers.size, 1);
  for (let i = 0; i < 8; i++) { await connection.tick(); }
  assert.deepEqual(connection.delays, [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  assert.deepEqual(connection.tokens, ["initial-once", "recovered"]);
  connection.sockets[1].onopen?.();
  assert.equal(connection.timers.size, 0);
  connection.stop();
});

for (const rejected of [false, true]) {
  test(`unmount cancels pending token refresh without late connections or errors (${rejected ? "rejected" : "resolved"})`, async () => {
    let resolve!: (token: string) => void;
    let reject!: (error: Error) => void;
    const pending = new Promise<string>((res, rej) => { resolve = res; reject = rej; });
    const connection = fixture(() => pending);
    connection.sockets[0].close();
    await connection.tick();
    connection.stop();
    const errorCount = connection.errors.length;
    if (rejected) reject(new Error("late failure")); else resolve("late-token");
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(connection.sockets.length, 1);
    assert.equal(connection.errors.length, errorCount);
    assert.equal(connection.timers.size, 0);
  });
}

test("unmount clears a scheduled retry and ignores callbacks from obsolete sockets", async () => {
  const connection = fixture(async () => "fresh");
  const old = connection.sockets[0];
  old.close();
  await connection.tick();
  const before = connection.counts();
  old.onopen?.();
  old.onmessage?.({ data: "ignored" } as MessageEvent);
  assert.deepEqual(connection.counts(), before);
  connection.sockets[1].close();
  connection.stop();
  connection.sockets[1].onopen?.();
  connection.sockets[1].onmessage?.({ data: "ignored" } as MessageEvent);
  assert.deepEqual(connection.counts(), before);
  assert.equal(connection.timers.size, 0);
});
