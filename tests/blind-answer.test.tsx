import assert from "node:assert/strict";
import test from "node:test";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { renderToStaticMarkup } from "react-dom/server";

import { aiPrereviewBlockReason } from "../client/features/language-items/ai-prereview";
import { AiPrereviewPanel } from "../client/features/language-items/ai-prereview-panel";
import { isBlindAnswerAttempt } from "../client/features/language-items/blind-answer";
import type { AiReviewRun, BlindAnswerAttempt } from "../client/features/language-items/types";

function attempt(patch: Partial<BlindAnswerAttempt> = {}): BlindAnswerAttempt {
  return { protocolVersion: "1", promptVersion: "0.1", inputHash: "candidate-hash", simulated: false,
    status: "answered", answer: "B — Room 205", alternatives: [], reasoning: "The notice says class is in room 205.",
    evidence: [{ fieldPath: "/candidatePayload/stimulus/text", quote: "今天在205教室上课。" }], limitations: [], ...patch };
}

function review(blindAnswer: BlindAnswerAttempt | undefined = attempt()): AiReviewRun {
  return { id: "review-1", itemId: "item-1", versionId: null, draftRevision: 2, contentHash: "content-hash",
    provider: "openai", model: "review-model", modelVersion: "1", promptId: "a1-item-independent-review", promptVersion: "0.6", schemaVersion: "0.2",
    specVersions: { planningSpecVersion: "1", registryBundleVersion: "rules-1", taskPackageVersion: "1" },
    findings: [], blindAnswer, status: "completed", error: null, createdBy: "author@example.test", createdAt: "2026-09-14T00:00:00Z" };
}

function render(run: AiReviewRun, stage: "aiReview" | null = null) {
  return renderToStaticMarkup(<ChakraProvider value={defaultSystem}><AiPrereviewPanel stage={stage} review={run} /></ChakraProvider>)
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, "");
}

test("new preliminary review reports require a real, structurally complete independent answer", () => {
  assert.equal(aiPrereviewBlockReason(review()), null);
  const invalid: unknown[] = [undefined, null, {}, { ...attempt(), protocolVersion: "2" }, { ...attempt(), promptVersion: "0.2" },
    { ...attempt(), inputHash: " " }, { ...attempt(), simulated: undefined }, { ...attempt(), status: "unknown" },
    { ...attempt(), answer: " " }, { ...attempt(), reasoning: " " }, { ...attempt(), alternatives: null },
    { ...attempt(), alternatives: ["C"] }, { ...attempt(), simulated: true },
    { ...attempt(), evidence: [] }, { ...attempt(), evidence: [{ fieldPath: "/scoringPackage/answer", quote: "B" }] },
    { ...attempt(), evidence: [{ fieldPath: "/candidatePayload/prompt", quote: " " }] },
    { ...attempt(), status: "ambiguous", alternatives: [] }, { ...attempt(), limitations: [null] },
    { ...attempt(), status: "ambiguous", alternatives: ["B — Room 205"] },
    { ...attempt(), status: "ambiguous", alternatives: ["C", " C "] },
    { ...attempt(), status: "insufficientInformation", limitations: [] }];
  for (const blindAnswer of invalid) {
    const run = { ...review(), blindAnswer } as AiReviewRun;
    assert.match(aiPrereviewBlockReason(run)!, /independent answer.*missing or invalid/i, JSON.stringify(blindAnswer));
    assert.doesNotMatch(render(run), /No serious issues found/);
  }
  const simulated = review(attempt({ simulated: true, status: "insufficientInformation", answer: "", evidence: [], limitations: ["Offline simulation does not solve the item."] }));
  assert.match(aiPrereviewBlockReason(simulated)!, /simulated/);
  assert.match(render(simulated), />Simulated</);
  assert.doesNotMatch(render(simulated), /The AI attempted|AI answered|AI solved/);
});

test("independent uncertainty informs human review without becoming an automatic rejection", () => {
  const ambiguous = review(attempt({ status: "ambiguous", alternatives: ["C — The library"], limitations: ["The final location is not explicit."] }));
  const insufficient = review(attempt({ status: "insufficientInformation", answer: "", evidence: [], limitations: ["The audio is unavailable."] }));
  for (const run of [ambiguous, insufficient]) assert.equal(aiPrereviewBlockReason(run), null);
  const html = render(ambiguous);
  assert.match(html, /Independent answer/);
  assert.match(html, /Multiple plausible answers/);
  assert.match(html, /B — Room 205/);
  assert.match(html, /Other plausible answers/);
  assert.match(html, /C — The library/);
  assert.match(html, /Uncertainty/);
  assert.match(html, /今天在205教室上课/);
  assert.match(html, /before the saved answer or scoring guidance is revealed/);
  assert.match(html, /Human review makes the final decision/);
  assert.doesNotMatch(html, /Approved|<button|<input|<textarea/);
  assert.match(render(insufficient), /Not enough information/);
  assert.match(render(insufficient), /The audio is unavailable/);
});

test("recorded independent answers do not bypass existing serious-finding gates", () => {
  const run = review();
  run.findings = [{ category: "answer", severity: "error", code: "answer.ambiguous", fieldPath: "candidatePayload.prompt", ruleRef: "clarity", message: "The item allows conflicting correct answers." }];
  assert.match(aiPrereviewBlockReason(run)!, /serious issues/);
  assert.match(render(run), /B — Room 205/);
});

test("legacy reports remain readable without inventing a blind answer", () => {
  const run = review(); delete run.blindAnswer; run.promptVersion = "0.5";
  assert.equal(aiPrereviewBlockReason(run), null);
  assert.doesNotMatch(render(run), /Independent answer|before seeing/);
  run.blindAnswer = { ...attempt(), inputHash: "" };
  assert.ok(aiPrereviewBlockReason(run));
});

test("an active review shows the workflow and hides previous independent answers", () => {
  const html = render(review(), "aiReview");
  assert.match(html, /Answering and reviewing item/);
  assert.doesNotMatch(html, /B — Room 205|Independent answer|No serious issues found/);
});

test("ambiguous and answered attempts require evidence while missing-information attempts explain their limit", () => {
  assert.equal(isBlindAnswerAttempt(attempt({ status: "ambiguous", alternatives: ["C"], answer: "" })), false);
  assert.equal(isBlindAnswerAttempt(attempt({ status: "ambiguous", alternatives: ["C"], evidence: [] })), false);
  assert.equal(isBlindAnswerAttempt(attempt({ status: "insufficientInformation", limitations: ["Missing passage"] })), false);
  assert.equal(isBlindAnswerAttempt(attempt({ status: "insufficientInformation", answer: " ", limitations: ["Missing passage"] })), false);
  assert.equal(isBlindAnswerAttempt(attempt({ status: "insufficientInformation", answer: "", alternatives: ["C"], limitations: ["Missing passage"] })), false);
  assert.equal(isBlindAnswerAttempt(attempt({ status: "insufficientInformation", answer: "", evidence: [], limitations: ["Missing passage"] })), true);
});
