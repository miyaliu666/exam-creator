import assert from "node:assert/strict";
import test from "node:test";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { renderToStaticMarkup } from "react-dom/server";

import { aiPrereviewBlockReason, type AiPrereviewStage } from "../client/features/language-items/ai-prereview";
import { AiPrereviewPanel } from "../client/features/language-items/ai-prereview-panel";
import type { AiFinding, AiReviewRun } from "../client/features/language-items/types";

function finding(severity = "warning"): AiFinding {
  return { category: "itemQuality", severity, code: "answer.ambiguity", fieldPath: "candidatePayload.prompt",
    ruleRef: "answerClarity", message: "The question may allow two interpretations." };
}

function review(patch: Partial<AiReviewRun> = {}): AiReviewRun {
  return { id: "review-1", itemId: "item-1", versionId: null, draftRevision: 2, contentHash: "content-hash-1",
    provider: "deepseek", model: "review-model", modelVersion: "1", promptId: "review", promptVersion: "1", schemaVersion: "1",
    specVersions: { planningSpecVersion: "1", registryBundleVersion: "rules-1", taskPackageVersion: "1" },
    findings: [], status: "completed", error: null, createdBy: "author@example.test", createdAt: "2026-09-12T00:00:00Z", ...patch };
}

function render(stage: AiPrereviewStage, run: AiReviewRun | null) {
  return renderToStaticMarkup(<ChakraProvider value={defaultSystem}><AiPrereviewPanel stage={stage} review={run} /></ChakraProvider>)
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, "");
}

test("completed real-model preliminary reviews permit warnings while serious findings block submission", () => {
  assert.equal(aiPrereviewBlockReason(review()), null);
  assert.equal(aiPrereviewBlockReason(review({ provider: "openai", findings: [finding("info"), finding()] })), null);
  assert.match(aiPrereviewBlockReason(review({ findings: [finding(), finding("error")] }))!, /serious issues.*Edit the item/);
});

test("failed, simulated and legacy unbound reviews cannot authorize PR creation", () => {
  for (const run of [null, undefined, review({ status: "failed" }), review({ status: "completed", error: "Provider unavailable" }),
    review({ provider: "deterministic-mock" }), review({ provider: "unknown" }), review({ contentHash: undefined }), review({ contentHash: " " })]) {
    assert.ok(aiPrereviewBlockReason(run), JSON.stringify(run));
  }
  assert.match(aiPrereviewBlockReason(review({ status: "failed", error: "Provider unavailable" }))!, /Provider unavailable/);
});

test("malformed findings and unknown severities fail closed", () => {
  const malformed = [null, {}, "bad", [null], [finding("critical")], [{ ...finding(), message: " " }], [{ ...finding(), fieldPath: null }]];
  for (const findings of malformed) {
    const run = review({ findings: findings as unknown as AiFinding[] });
    assert.match(aiPrereviewBlockReason(run)!, /invalid result/);
    assert.doesNotMatch(render(null, run), /No serious issues found/);
  }
});

test("an active submission shows its stage without stale success or findings", () => {
  for (const stage of ["checking", "aiReview", "creatingPr"] as const) {
    const html = render(stage, review({ findings: [finding()] }));
    assert.match(html, /role="status"/);
    assert.doesNotMatch(html, /No serious issues found|two interpretations|review-model/);
  }
  assert.doesNotMatch(render(null, null), /AI preliminary review/);
});

test("the result exposes actionable findings without implying human approval or another AI action", () => {
  const html = render(null, review({ findings: [finding("error")] }));
  assert.match(html, /role="alert"/);
  assert.match(html, /candidatePayload.prompt/);
  assert.match(html, /two interpretations/);
  assert.doesNotMatch(html, /No serious issues found|Approved|<button/);
});
