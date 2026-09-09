import assert from "node:assert/strict";
import test from "node:test";

import { coverageSuggestionSetup, setupMatchesCoverageSuggestion } from "../client/features/language-items/batch-coverage-suggestion.ts";
import { emptyBatchDraft, restoreBatchDraft, reviseBatchDraft } from "../client/features/language-items/batch-draft-storage.ts";
import { allocatedBatchTargets, batchPlanIssues, batchRequest, batchTargetOptions } from "../client/features/language-items/batch-plan.ts";
import type { BatchGroup } from "../client/features/language-items/batch-api.ts";
import type { CoverageBatchSuggestion } from "../client/features/language-items/coverage-types.ts";
import type { DifficultyBandStandard, RegistryCapability, RegistrySnapshot } from "../client/features/language-items/types.ts";
import { isValidCandidateCount, parseCandidateCount } from "../client/features/language-items/candidate-count.ts";

function fixture() {
  const standard: DifficultyBandStandard = {
    id: "TypicalA1", label: "Typical A1", description: "Read one explicit fact.",
    defaultDrivers: { inputLength: "shortSentence", informationPoints: 1, supportLevel: "high", distractorSimilarity: "clear", independenceLevel: "highlySupported", inferenceRequired: false },
    allowedInputLengths: ["shortSentence"], informationPointsMin: 1, informationPointsMax: 1,
    allowedSupportLevels: ["high"], allowedDistractorSimilarities: ["clear"],
  };
  const capability: RegistryCapability = {
    blueprintSlotId: "R1", title: "Notices", taskFamilyId: "TF1", itemFormatId: "IF-SINGLE-SELECT",
    rendererId: "renderer", scoringContractTemplateId: "scoring", primaryCanDoId: "read-notice",
    primaryReportedSkill: "Reading", communicativeActivity: "Reception", communicativeActivities: ["Reception", "Mediation"],
    allowedDomains: ["Public"], allowedContextIds: ["shop"], observableEvidence: "Read the time.",
    taskStructure: "Select one answer.", prohibitedUses: [], referenceTask: "A shop notice",
  };
  const registry: RegistrySnapshot = {
    settingsSchemaVersion: 1, bundleVersion: "rules-1", status: "published", limitations: [], sourceFingerprint: "fixture",
    capabilities: [capability], candidateSchemas: [], taskPackageSchema: {}, allowedDomains: ["Public"],
    difficultyBands: ["TypicalA1"], difficultyStandards: [standard],
    capabilityDifficultyProfileSets: [{ id: "profile", blueprintSlotId: "R1", itemFormatId: "IF-SINGLE-SELECT", primaryCanDoId: "read-notice", standards: [standard] }],
    contentIdOptions: [
      { id: "time", label: "几点", kind: "lexical", contextIds: ["shop"], canDoIds: ["read-notice"], masteryScope: "receptive" },
      { id: "hello", label: "你好", kind: "lexical", contextIds: [], canDoIds: [], masteryScope: "receptiveProductive" },
      { id: "productive", label: "书写", kind: "grammar", contextIds: [], canDoIds: [], masteryScope: "productive" },
      { id: "elsewhere", label: "课程", kind: "lexical", contextIds: ["school"], canDoIds: [], masteryScope: "receptive" },
      { id: "other-can-do", label: "介绍", kind: "pragmatic", contextIds: [], canDoIds: ["introduce"], masteryScope: "receptive" },
      { id: "support", label: "shopName", kind: "supported", contextIds: [], canDoIds: [], masteryScope: null },
    ],
    contextOptions: [{ id: "shop", label: "Shop notices", primaryDomains: ["Public"], canDoIds: ["read-notice"], scope: "Read opening hours.", exclusions: [], retired: false }],
    canDoOptions: [{ id: "read-notice", label: "Understand a short notice" }], requiredReviewGateIds: [],
  };
  const group: BatchGroup = {
    blueprintSlotId: "R1", itemFormatId: "IF-SINGLE-SELECT", primaryCanDoId: "read-notice", primaryDomain: "Public", contextId: "shop", difficultyBand: "TypicalA1",
    itemCount: 20, requiredTargetContentIds: ["time"], rotatingTargetContentIds: ["hello"],
  };
  const suggestion: CoverageBatchSuggestion = {
    registryVersion: "rules-1", targetContentIds: ["time", "hello"], desiredCount: 20,
    filters: { skill: "Reading", activity: "Mediation", domain: "Public" },
  };
  return { registry, group, suggestion };
}

test("batch targets honor context, primary Can-do and receptive/productive mastery", () => {
  const { registry, group } = fixture();
  assert.deepEqual(batchTargetOptions(group, registry).map(({ id }) => id), ["time", "hello"]);
  assert.deepEqual(batchPlanIssues([group], registry, 2), []);
  for (const id of ["productive", "elsewhere", "other-can-do", "support", "missing"]) {
    const invalid = { ...group, requiredTargetContentIds: [id] };
    assert.ok(batchPlanIssues([invalid], registry, 1).some((issue) => issue.includes("incompatible language targets")), id);
    assert.deepEqual(invalid.requiredTargetContentIds, [id], "Validation keeps an author's choices visible for repair");
  }
});

test("candidate quantities exceed former limits and survive saving and restoring a plan", () => {
  const { registry, group } = fixture();
  for (const candidatesPerItem of [1, 4, 6, 10, 256, 1000]) {
    assert.deepEqual(batchPlanIssues([group], registry, candidatesPerItem), []);
    const draft = { ...emptyBatchDraft(registry.bundleVersion), groups: [group], candidatesPerItem };
    assert.equal(batchRequest(restoreBatchDraft(JSON.stringify(draft), registry.bundleVersion), registry).candidatesPerItem, candidatesPerItem);
  }
  for (const value of [0, -1, 1.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(isValidCandidateCount(value), false);
    assert.ok(batchPlanIssues([group], registry, value).some((issue) => issue.includes("AI drafts per item")));
  }
  for (const value of ["", " ", "abc", "2.5", "-2", "1e2", "9".repeat(400)]) {
    assert.equal(parseCandidateCount(value), 0, "Invalid input remains serializable without losing the saved plan");
  }
  assert.equal(parseCandidateCount("12"), 12);
});

test("batch validation rejects unusable item counts, duplicate roles, retired contexts and unavailable bands", () => {
  const { registry, group } = fixture();
  for (const itemCount of [0, 1.5, 51, Number.NaN]) assert.ok(batchPlanIssues([{ ...group, itemCount }], registry, 1).length);
  assert.ok(batchPlanIssues([group, group, group], registry, 1).some((issue) => issue.includes("50 items")));
  assert.ok(batchPlanIssues([{ ...group, rotatingTargetContentIds: ["time"] }], registry, 1).some((issue) => issue.includes("both required")));
  assert.ok(batchPlanIssues([{ ...group, requiredTargetContentIds: ["time", "time"] }], registry, 1).some((issue) => issue.includes("distinct language targets")));
  assert.ok(batchPlanIssues([{ ...group, difficultyBand: "UpperA1" }], registry, 1).some((issue) => issue.includes("review the setup")));
  registry.contextOptions[0].retired = true;
  assert.ok(batchPlanIssues([group], registry, 1).some((issue) => issue.includes("review the setup")));
});

test("manual creation permits absent targets while keeping setup and selected-target validation", () => {
  const { registry, group } = fixture();
  const manualGroup = { ...group, itemCount: 1, requiredTargetContentIds: [], rotatingTargetContentIds: [] };
  assert.ok(batchPlanIssues([manualGroup], registry, 1).some((issue) => issue.includes("choose language targets")));
  assert.deepEqual(batchPlanIssues([manualGroup], registry, 1, false), []);
  assert.ok(batchPlanIssues([{ ...manualGroup, contextId: "missing" }], registry, 1, false).some((issue) => issue.includes("review the setup")));
  assert.ok(batchPlanIssues([{ ...manualGroup, itemCount: 0 }], registry, 1, false).some((issue) => issue.includes("item count")));
  assert.ok(batchPlanIssues([{ ...manualGroup, requiredTargetContentIds: ["productive"] }], registry, 1, false).some((issue) => issue.includes("incompatible language targets")));
  assert.ok(batchPlanIssues([{ ...manualGroup, requiredTargetContentIds: ["time"], rotatingTargetContentIds: ["time"] }], registry, 1, false).some((issue) => issue.includes("both required")));
});

test("coverage planning resolves all dimensions and retains the full shortage without starting generation", () => {
  const { registry, suggestion } = fixture();
  const before = structuredClone(suggestion);
  const setup = coverageSuggestionSetup({ ...suggestion, desiredCount: 80 }, registry);
  assert.deepEqual(setup, {
    blueprintSlotId: "R1", itemFormatId: "IF-SINGLE-SELECT", primaryCanDoId: "read-notice", primaryDomain: "Public", contextId: "shop", difficultyBand: "TypicalA1",
    itemCount: 80, requiredTargetContentIds: ["time", "hello"], rotatingTargetContentIds: [],
  });
  assert.deepEqual(suggestion, before);
  assert.ok(batchPlanIssues([setup as BatchGroup], registry, 1).some((issue) => issue.includes("50 items")), "The author chooses the first batch quantity instead of losing part of the goal");
});

test("coverage suggestions cannot cross a published version boundary or invent a compatible combination", () => {
  const { registry, suggestion } = fixture();
  assert.equal(coverageSuggestionSetup({ ...suggestion, registryVersion: "rules-0" }, registry), undefined);
  assert.equal(coverageSuggestionSetup({ ...suggestion, targetContentIds: ["time", "productive"] }, registry), undefined);
  assert.equal(coverageSuggestionSetup({ ...suggestion, filters: { skill: "Writing" } }, registry), undefined);
  assert.equal(coverageSuggestionSetup({ ...suggestion, filters: { difficultyBand: "UpperA1" } }, registry), undefined);
});

test("choosing a different setup cannot silently repurpose a scoped coverage shortage", () => {
  const { registry, suggestion, group } = fixture();
  assert.equal(setupMatchesCoverageSuggestion(suggestion, group, registry), true);
  assert.equal(setupMatchesCoverageSuggestion(suggestion, { ...group, primaryDomain: "Educational" }, registry), false);
  assert.equal(setupMatchesCoverageSuggestion({ ...suggestion, filters: { difficultyBand: "TypicalA1" } }, { ...group, difficultyBand: "UpperA1" }, registry), false);
  assert.equal(setupMatchesCoverageSuggestion({ ...suggestion, filters: { skill: "Speaking" } }, group, registry), false);
});

test("reopening a persisted plan retains its request identity and original rules after a Settings publication", () => {
  const { group } = fixture();
  const draft = { ...emptyBatchDraft("rules-1"), groups: [group], candidatesPerItem: 2 };
  const restored = restoreBatchDraft(JSON.stringify(draft), "rules-2");
  assert.deepEqual(restored, draft, "Retrying after a lost response sends the same idempotency key and requirements");
  const revised = reviseBatchDraft(restored, { candidatesPerItem: 3 });
  assert.notEqual(revised.idempotencyKey, restored.idempotencyKey, "Changed requirements cannot collide with a submitted request");
  assert.equal(restored.candidatesPerItem, 2);
  assert.equal(revised.registryVersion, "rules-1", "An edit alone does not accept newer rules");
});

test("broken or obsolete browser plans recover to a valid empty plan", () => {
  const { group } = fixture();
  const valid = { ...emptyBatchDraft("rules-1"), groups: [group] };
  for (const serialized of [null, "broken", "{}", JSON.stringify({ ...valid, idempotencyKey: "" }), JSON.stringify({ ...valid, groups: [null] })]) {
    const restored = restoreBatchDraft(serialized, "rules-2");
    assert.equal(restored.registryVersion, "rules-2");
    assert.deepEqual(restored.groups, []);
    assert.ok(restored.idempotencyKey);
  }
  assert.deepEqual(restoreBatchDraft(JSON.stringify({ ...valid, obsoleteMetadata: true }), "rules-2"), valid);
});

test("automatic names are stable across retries and do not rewrite saved custom names", () => {
  const { registry, group } = fixture();
  const draft = { ...emptyBatchDraft(registry.bundleVersion), groups: [group] };
  assert.equal(batchRequest(emptyBatchDraft(registry.bundleVersion), registry).title, "Language items");
  assert.equal(batchRequest(draft, registry).title, "Notices");
  assert.deepEqual(batchRequest(draft, registry), batchRequest(restoreBatchDraft(JSON.stringify(draft), registry.bundleVersion), registry));
  assert.equal(batchRequest({ ...draft, title: "My authored name" }, registry).title, "My authored name");
  assert.equal(draft.title, "");
});

test("allocation preview shows full targets for fewer, equal and more pool entries than items", () => {
  const { group } = fixture();
  const setup = { ...group, itemCount: 3, requiredTargetContentIds: ["always"] };
  assert.deepEqual(allocatedBatchTargets({ ...setup, rotatingTargetContentIds: [] }), [["always"], ["always"], ["always"]]);
  assert.deepEqual(allocatedBatchTargets({ ...setup, rotatingTargetContentIds: ["a", "b"] }), [["always", "a"], ["always", "b"], ["always", "a"]]);
  assert.deepEqual(allocatedBatchTargets({ ...setup, rotatingTargetContentIds: ["a", "b", "c"] }), [["always", "a"], ["always", "b"], ["always", "c"]]);
  assert.deepEqual(allocatedBatchTargets({ ...setup, rotatingTargetContentIds: ["a", "b", "c", "d", "e"] }), [["always", "a", "d"], ["always", "b", "e"], ["always", "c"]]);
  assert.deepEqual(allocatedBatchTargets({ ...setup, itemCount: 1, rotatingTargetContentIds: ["a", "b"] }), [["always", "a", "b"]]);
  for (const itemCount of [0, -1, 1.5, 51, Number.NaN]) assert.deepEqual(allocatedBatchTargets({ ...setup, itemCount }), []);
});
