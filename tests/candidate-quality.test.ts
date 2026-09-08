import assert from "node:assert/strict";
import test from "node:test";
import { rankAiCandidates } from "../client/features/language-items/candidate-quality.ts";
import { isContentOptionCompatible } from "../client/features/language-items/content-compatibility.ts";
import type { AiCandidate, RegistryCapability, RegistrySnapshot } from "../client/features/language-items/types.ts";

function candidate(ordinal: number, text: string, valid = true, warnings = 0): AiCandidate {
  return {
    id: `candidate-${ordinal}`, ordinal, status: valid ? "valid" : "invalid",
    candidatePayload: { prompt: text, options: [{ optionId: `option-${ordinal}`, text: "Monday" }] },
    validation: { valid, issues: Array.from({ length: warnings }, (_, index) => ({
      code: `warning-${index}`, path: "prompt", message: "Review wording", severity: "warning", ruleRef: "wording",
    })) },
  } as AiCandidate;
}

test("candidate ordering prioritizes valid distinct content without mutating stored candidates", () => {
  const candidates = [candidate(1, "Duplicate", false), candidate(2, "Duplicate"), candidate(3, "Different", true, 1), candidate(4, " Duplicate ")];
  const before = JSON.stringify(candidates);
  const ranked = rankAiCandidates(candidates);
  assert.deepEqual(ranked.map((entry) => entry.candidate.ordinal), [2, 3, 4, 1]);
  assert.equal(ranked[2].duplicateOfOrdinal, 2);
  assert.equal(ranked[3].duplicateOfOrdinal, 2);
  assert.equal(JSON.stringify(candidates), before);
  assert.equal(ranked[0].candidate, candidates[1]);
});

test("warning counts break ties only after validity and diversity", () => {
  assert.deepEqual(rankAiCandidates([candidate(1, "First", true, 2), candidate(2, "Second"), candidate(3, "Third", false)])
    .map((entry) => entry.candidate.id), ["candidate-2", "candidate-1", "candidate-3"]);
  assert.deepEqual(rankAiCandidates([]), []);
});

test("distinct candidate-visible media identifiers are never removed from the diversity comparison", () => {
  const first = { ...candidate(1, "Listen"), candidatePayload: {
    situation: "Listen", instructions: "Complete the fields",
    sourceProfile: { assetId: "asset-a", audioAssetId: "audio-a" }, fields: [],
  } };
  const second = { ...candidate(2, "Listen"), candidatePayload: {
    ...first.candidatePayload, sourceProfile: { assetId: "asset-b", audioAssetId: "audio-b" },
  } };
  assert.ok(rankAiCandidates([first, second]).every((entry) => entry.duplicateOfOrdinal === undefined));
});

test("productive mastery supports Writing and Speaking but not receptive skills", () => {
  const content = { kind: "lexical", contextIds: [], canDoIds: [], masteryScope: "productive" } as RegistrySnapshot["contentIdOptions"][number];
  for (const skill of ["Writing", "Speaking", "Reading", "Listening"]) {
    const capability = { primaryReportedSkill: skill, primaryCanDoId: "can-do" } as RegistryCapability;
    assert.equal(isContentOptionCompatible(content, capability, "context"), ["Writing", "Speaking"].includes(skill));
  }
});

test("adoption state does not make validated historical candidates rank as invalid", () => {
  const adopted = { ...candidate(2, "Adopted content"), status: "adopted" };
  const discarded = { ...candidate(3, "Other valid content"), status: "discarded" };
  const ranked = rankAiCandidates([candidate(1, "Invalid", false), adopted, discarded]);
  assert.deepEqual(ranked.map((entry) => entry.candidate.ordinal), [2, 3, 1]);
  assert.equal(ranked[0].candidate.status, "adopted");
  assert.equal(ranked[1].candidate.status, "discarded");
});
