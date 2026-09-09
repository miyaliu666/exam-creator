import assert from "node:assert/strict";
import test from "node:test";

import {
  changeItemRecordStates,
  selectableItemIds,
  type ItemRecordSummary,
} from "../client/features/language-items/item-bank-operations.ts";
import type { LanguageItem, LanguageItemRecordState } from "../client/features/language-items/types";

function item(id: string, ownerEmail = "author@example.test"): ItemRecordSummary {
  return { id, title: `Item ${id}`, ownerEmail, recordState: "active" };
}

function updatedItem(id: string, recordState: LanguageItemRecordState): LanguageItem {
  // These operations return the response intact and only inspect summary fields.
  return { ...item(id), recordState } as LanguageItem;
}

test("selection includes only the visible owner's items, once each", () => {
  const owned = item("owned");
  const other = item("other", "other@example.test");
  const visible = [owned, other, owned, item("second")];
  assert.deepEqual(selectableItemIds(visible, owned.ownerEmail), ["owned", "second"]);
  assert.deepEqual(selectableItemIds([other], owned.ownerEmail), []);
  assert.deepEqual(selectableItemIds(visible, undefined), []);
  assert.deepEqual(selectableItemIds([], owned.ownerEmail), []);
  assert.equal(visible.length, 4);
});

test("bulk changes wait for all independent results and never exceed four requests", async () => {
  const items = Array.from({ length: 9 }, (_, index) => item(String(index)));
  const releases = new Map<string, () => void>();
  const started: string[] = [];
  let active = 0;
  let peak = 0;
  let completed = false;
  const operation = changeItemRecordStates(items, "archived", async (id, target) => {
    started.push(id);
    active += 1;
    peak = Math.max(peak, active);
    await new Promise<void>((resolve) => releases.set(id, resolve));
    active -= 1;
    if (id === "1" || id === "6") throw new Error(`Cannot archive ${id}`);
    return updatedItem(id, target);
  });
  void operation.then(() => { completed = true; });
  assert.deepEqual(started, ["0", "1", "2", "3"]);
  assert.equal(completed, false);

  const advance = async (id: string) => {
    const release = releases.get(id);
    assert.ok(release, `Item ${id} has started`);
    release();
    await new Promise<void>((resolve) => setImmediate(resolve));
  };
  await advance("3");
  assert.deepEqual(started, ["0", "1", "2", "3", "4"]);
  await advance("1");
  assert.ok(started.includes("5"), "A failure still allows the next item to start");
  for (const id of ["4", "2", "5", "6", "7", "8"]) await advance(id);
  assert.equal(completed, false, "The first request is still unfinished");
  await advance("0");

  const result = await operation;
  assert.equal(peak, 4);
  assert.equal(active, 0);
  assert.deepEqual(result.succeeded.map(({ id }) => id), ["0", "2", "3", "4", "5", "7", "8"]);
  assert.ok(result.succeeded.every(({ recordState }) => recordState === "archived"));
  assert.deepEqual(result.failed, [
    { item: items[1], message: "Cannot archive 1" },
    { item: items[6], message: "Cannot archive 6" },
  ]);
});

test("duplicate selections are changed once and failures are not automatically retried", async () => {
  const calls: string[] = [];
  const original = item("failed");
  const result = await changeItemRecordStates(
    [item("success"), original, item("success"), { ...original, title: "Duplicate" }, item("last")],
    "deleted",
    async (id, target) => {
      calls.push(id);
      if (id === "failed") throw "Permission denied";
      return updatedItem(id, target);
    },
  );
  assert.deepEqual(calls, ["success", "failed", "last"]);
  assert.deepEqual(result.succeeded.map(({ id, recordState }) => ({ id, recordState })), [
    { id: "success", recordState: "deleted" },
    { id: "last", recordState: "deleted" },
  ]);
  assert.deepEqual(result.failed, [{ item: original, message: "Permission denied" }]);
});

test("empty selections make no requests and unexpected failures remain reportable", async () => {
  const empty = await changeItemRecordStates([], "active", async () => {
    assert.fail("No changes should be attempted");
  });
  assert.deepEqual(empty, { succeeded: [], failed: [] });
  const selected = item("failed");
  const result = await changeItemRecordStates([selected], "active", () => {
    throw null;
  });
  assert.deepEqual(result, {
    succeeded: [],
    failed: [{ item: selected, message: "The item could not be updated." }],
  });
});
