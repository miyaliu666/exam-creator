import assert from "node:assert/strict";
import test from "node:test";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { renderToStaticMarkup } from "react-dom/server";

import { aiPrereviewBlockReason } from "../client/features/language-items/ai-prereview.ts";
import { AiPrereviewPanel } from "../client/features/language-items/ai-prereview-panel.tsx";
import type { ReviewCheck, ReviewCheckResult } from "../client/features/language-items/review-rule-types.ts";
import type { AiReviewRun } from "../client/features/language-items/types.ts";

const fixed: ReviewCheck = { id: "fixed.context", title: "Classroom destination", criterion: "State the correct classroom", requiredEvidence: ["Quote the room instruction"], sourceRefs: ["contexts.slot"], required: true, origin: "fixed", method: "ai" };
const optional: ReviewCheck = { ...fixed, id: "custom.extra", origin: "custom", required: false };
function result(checkId: string, status: ReviewCheckResult["status"] = "pass"): ReviewCheckResult {
  return { checkId, status, message: "The source names room 205.", evidence: [{ fieldPath: "/candidatePayload/stimulus/text", quote: "今天在205教室上课。" }], sourceRefs: ["contexts.slot"] };
}
function review(): AiReviewRun {
  return { provider: "openai", model: "model", status: "completed", error: null, contentHash: "content-1", findings: [],
    reviewPlan: { planVersion: "1", planHash: "plan-1", sourceFingerprint: "source-1", itemRuleId: "slot", itemFormatId: "format", primaryCanDoId: "can-do", checks: [fixed, optional] }, checkResults: [result(fixed.id), result(optional.id)] } as AiReviewRun;
}
function render(run: AiReviewRun) {
  return renderToStaticMarkup(<ChakraProvider value={defaultSystem}><AiPrereviewPanel stage={null} review={run} /></ChakraProvider>).replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, "");
}

test("required insufficient evidence and failed criteria block submission even without error findings", () => {
  for (const status of ["fail", "insufficientEvidence"] as const) {
    const run = review(); run.checkResults![0] = result(fixed.id, status);
    assert.match(aiPrereviewBlockReason(run)!, /Required review criteria/);
    assert.doesNotMatch(render(run), /No serious issues found/);
  }
  const advisory = review(); advisory.checkResults![1] = result(optional.id, "insufficientEvidence");
  assert.equal(aiPrereviewBlockReason(advisory), null);
});

test("fixed source rules remain required even if a malformed report lowers their required flag", () => {
  const run = review(); run.reviewPlan!.checks[0] = { ...fixed, required: false }; run.checkResults![0] = result(fixed.id, "fail");
  assert.ok(aiPrereviewBlockReason(run));
});

test("checklist evidence and results are displayed as immutable report content", () => {
  const run = review(); run.checkResults![0] = result(fixed.id, "insufficientEvidence");
  const html = render(run);
  assert.match(html, /Review checklist/); assert.match(html, /Insufficient evidence/);
  assert.match(html, /今天在205教室上课/); assert.match(html, /candidatePayload\/stimulus\/text/);
  assert.doesNotMatch(html, /<button|<input|<textarea/);
});

test("missing, duplicate, unknown and malformed results cannot authorize submission", () => {
  const cases: unknown[] = [undefined, [], [result(fixed.id), result(fixed.id)], [result(fixed.id), result("unknown")],
    [result(fixed.id), { ...result(optional.id), status: "unknown" }], [result(fixed.id), { ...result(optional.id), evidence: [{ fieldPath: "wrong", quote: "x" }] }]];
  for (const checkResults of cases) {
    const run = { ...review(), checkResults } as AiReviewRun;
    assert.ok(aiPrereviewBlockReason(run), JSON.stringify(checkResults));
    assert.doesNotMatch(render(run), /No serious issues found/);
  }
});

test("legacy findings remain readable without pretending to have a recorded checklist", () => {
  const run = review(); delete run.reviewPlan; delete run.checkResults;
  assert.equal(aiPrereviewBlockReason(run), null);
  assert.doesNotMatch(render(run), /Review checklist/);
});
