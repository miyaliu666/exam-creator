import assert from "node:assert/strict";
import test from "node:test";

import { submitItemForReview, type SubmitItemForReviewInput } from "../client/features/language-items/submit-item-for-review";
import type { AiReviewRun, GithubReviewBatch } from "../client/features/language-items/types";

function review(patch: Partial<AiReviewRun> = {}): AiReviewRun {
  return { id: "review-7", itemId: "item-1", versionId: null, draftRevision: 8, contentHash: "content-hash-8",
    provider: "openai", model: "review-model", modelVersion: "1", promptId: "review", promptVersion: "1", schemaVersion: "1",
    specVersions: { planningSpecVersion: "1", registryBundleVersion: "rules-1", taskPackageVersion: "1" },
    findings: [], status: "completed", error: null, createdBy: "author@example.test", createdAt: "2026-09-12T00:00:00Z", ...patch };
}

const batch: GithubReviewBatch = {
  batchId: "batch-1", repository: "example/review", pullRequestNumber: 1,
  pullRequestUrl: "https://github.com/example/review/pull/1", state: "open", itemIds: ["item-1"],
  approvalCount: 0, changesRequestedCount: 0, lastSyncedAt: "2026-09-12T00:00:00Z",
};

function harness(run = review()) {
  const calls: string[] = [];
  const reports: AiReviewRun[] = [];
  const requests: Parameters<SubmitItemForReviewInput["createPr"]>[0][] = [];
  const state = { revision: 7, change: 3, dirty: true };
  const input: SubmitItemForReviewInput = {
    itemId: "item-1",
    check: async () => { calls.push("check"); state.revision = 8; state.dirty = false; },
    readState: () => state,
    review: async (expectedRevision) => { calls.push(`review:${expectedRevision}`); return run; },
    createPr: async (request) => { calls.push("createPr"); requests.push(request); return batch; },
    onStage: (stage) => { calls.push(`stage:${stage}`); },
    onReview: (report) => { calls.push("report"); reports.push(report); },
  };
  return { input, state, calls, reports, requests };
}

test("submission checks saved content before AI and creates one PR bound to its exact report and revision", async () => {
  const run = review({ findings: [{ category: "wording", severity: "warning", code: "wording.concise",
    fieldPath: "candidatePayload.prompt", ruleRef: "clarity", message: "The question could be shorter." }] });
  const { input, calls, reports, requests } = harness(run);
  assert.equal(await submitItemForReview(input), batch);
  assert.deepEqual(calls, ["stage:checking", "check", "stage:aiReview", "review:8", "report", "stage:creatingPr", "createPr"]);
  assert.deepEqual(reports, [run]);
  assert.deepEqual(requests, [{ itemIds: ["item-1"], aiReviewRunIds: { "item-1": "review-7" }, expectedRevisions: { "item-1": 8 } }]);
});

test("failed checks stop submission before the AI provider and PR calls", async () => {
  const { input, calls, reports, requests } = harness();
  const failure = new Error("Item checks failed.");
  input.check = async () => { throw failure; };
  await assert.rejects(submitItemForReview(input), (error) => error === failure);
  assert.deepEqual(calls, ["stage:checking"]);
  assert.deepEqual(reports, []);
  assert.deepEqual(requests, []);
});

test("a dirty state after checking never reaches the AI preliminary review", async () => {
  const { input, calls, requests } = harness();
  input.check = async () => undefined;
  await assert.rejects(submitItemForReview(input), /changed during checking/);
  assert.deepEqual(calls, ["stage:checking"]);
  assert.deepEqual(requests, []);
});

for (const [name, run] of [
  ["a failed run returned in a successful HTTP response", review({ status: "failed", error: "Provider timed out" })],
  ["a completed run carrying an error", review({ error: "Incomplete provider response" })],
  ["a serious finding", review({ findings: [{ category: "answer", severity: "error", code: "answer.ambiguous",
    fieldPath: "scoringPackage.correctOptionId", ruleRef: "answer.uniqueness", message: "Both options answer the question." }] })],
] as const) {
  test(`${name} exposes its report but cannot create a PR`, async () => {
    const { input, calls, reports, requests } = harness(run);
    await assert.rejects(submitItemForReview(input), /AI preliminary review/);
    assert.deepEqual(reports, [run]);
    assert.ok(!calls.includes("stage:creatingPr"));
    assert.deepEqual(requests, []);
  });
}

for (const [name, mutate] of [
  ["a new revision", (state: ReturnType<typeof harness>["state"]) => { state.revision += 1; }],
  ["an edit saved before review returns", (state: ReturnType<typeof harness>["state"]) => { state.change += 1; }],
  ["unsaved changes", (state: ReturnType<typeof harness>["state"]) => { state.dirty = true; }],
] as const) {
  test(`${name} during AI review blocks the PR and suppresses the stale report`, async () => {
    const { input, state, reports, requests } = harness();
    input.review = async () => { mutate(state); return review(); };
    await assert.rejects(submitItemForReview(input), /changed during AI preliminary review/);
    assert.deepEqual(reports, []);
    assert.deepEqual(requests, []);
  });
}

test("provider transport failures preserve the error and never create a PR", async () => {
  const { input, reports, requests } = harness();
  const failure = new Error("AI service is unreachable");
  input.review = async () => { throw failure; };
  await assert.rejects(submitItemForReview(input), (error) => error === failure);
  assert.deepEqual(reports, []);
  assert.deepEqual(requests, []);
});
