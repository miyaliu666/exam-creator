import assert from "node:assert/strict";
import test from "node:test";

import type { BatchGenerationJob } from "../client/features/language-items/batch-api";
import { batchCanResume, batchNeedsPolling, batchProgressVisibility, includeFocusedBatch } from "../client/features/language-items/batch-progress-state.ts";

function job(id: string, status: BatchGenerationJob["status"], createdAt: string): BatchGenerationJob {
  return { id, title: id, ownerEmail: "author@example.test", registryVersion: "rules-1", groups: [], candidatesPerItem: 1,
    status, children: [], createdAt, updatedAt: createdAt };
}

test("a deep-linked job outside the newest 100 stays visible without replacing recent history", () => {
  const recent = Array.from({ length: 100 }, (_, index) => job(`recent-${index}`, "completed", "2026-09-02"));
  const focused = job("older-focused", "completed", "2026-08-01");
  const combined = includeFocusedBatch(recent, focused);
  assert.equal(combined.length, 101);
  assert.equal(combined[0], focused);
  assert.deepEqual(combined.slice(1), recent);
  const visible = batchProgressVisibility(combined, false, focused.id);
  assert.deepEqual(visible.visibleJobs.map(({ id }) => id), [focused.id, "recent-0"]);
  assert.equal(visible.hiddenCompletedCount, 99);
  assert.equal(batchProgressVisibility(combined, true, focused.id).visibleJobs.length, 101);
  assert.equal(includeFocusedBatch(recent, undefined), recent);
  assert.equal(includeFocusedBatch(recent, { ...recent[0], status: "running" }), recent,
    "A stale detail cache must not replace the listed job's current progress");
});

test("list and deep-linked progress keep polling paused jobs until their running child finishes", () => {
  const focused = job("focused", "paused", "2026-09-01");
  const child = { index: 0, groupIndex: 0, itemCreated: true, targetContentIds: [] };
  focused.children = [{ ...child, status: "running" }];
  assert.equal(batchNeedsPolling(focused), true);
  focused.children = [{ ...child, status: "completed" }];
  assert.equal(batchNeedsPolling(focused), false);
  for (const status of ["queued", "running"] as const) assert.equal(batchNeedsPolling({ ...focused, status }), true);
  for (const status of ["partial", "completed"] as const) assert.equal(batchNeedsPolling({ ...focused, status }), false);
});

test("the latest batch stays visible when generation completes and after reloading the bank", () => {
  const old = job("old", "completed", "2026-09-01T00:00:00Z");
  const latest = job("latest", "running", "2026-09-02T00:00:00Z");
  assert.deepEqual(batchProgressVisibility([old, latest], false).visibleJobs.map(({ id }) => id), ["latest"]);
  latest.status = "completed";
  const reloaded = batchProgressVisibility([old, latest], false);
  assert.equal(reloaded.latestId, "latest");
  assert.deepEqual(reloaded.visibleJobs.map(({ id }) => id), ["latest"]);
  assert.equal(reloaded.hiddenCompletedCount, 1);
  assert.equal(batchProgressVisibility([old, latest], true).visibleJobs.length, 2);
});

test("unfinished work and the just-submitted batch remain accessible beside a newer completed batch", () => {
  const jobs = [job("submitted", "completed", "2026-09-01"), job("paused", "paused", "2026-09-01"),
    job("failure", "partial", "2026-09-01"), job("newer", "completed", "2026-09-02")];
  const visible = batchProgressVisibility(jobs, false, "submitted");
  assert.deepEqual(visible.visibleJobs.map(({ id }) => id), ["submitted", "paused", "failure", "newer"]);
  assert.equal(visible.hiddenCompletedCount, 0);
});

test("continue reaches interrupted or uncreated work without offering a batch replay for created failed drafts", () => {
  const interrupted = job("interrupted", "partial", "2026-09-01");
  const child = { index: 0, groupIndex: 0, itemCreated: true, targetContentIds: [] };
  for (const status of ["pending", "running"] as const) {
    interrupted.children = [{ ...child, status }];
    assert.equal(batchCanResume(interrupted), true, status);
  }
  interrupted.children = [{ ...child, status: "failed", itemCreated: false }];
  assert.equal(batchCanResume(interrupted), true);
  interrupted.children = [{ ...child, status: "failed", itemCreated: true }];
  assert.equal(batchCanResume(interrupted), false);
  interrupted.status = "running";
  interrupted.children = [{ ...child, status: "pending" }];
  assert.equal(batchCanResume(interrupted), false, "A running batch offers Pause instead");
});
