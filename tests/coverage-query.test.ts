import assert from "node:assert/strict";
import test from "node:test";

import { coverageGoalPlan, updateCoverageRequest } from "../client/features/language-items/coverage-query.ts";
import type { CoverageRequest, CoverageResponse } from "../client/features/language-items/coverage-types.ts";
import type { DifficultyBandStandard, RegistrySnapshot } from "../client/features/language-items/types.ts";

function fixture() {
  const standard: DifficultyBandStandard = {
    id: "TypicalA1", label: "Typical A1", description: "Read one explicit fact.",
    defaultDrivers: { inputLength: "shortSentence", informationPoints: 1, supportLevel: "high", distractorSimilarity: "clear", independenceLevel: "highlySupported", inferenceRequired: false },
    allowedInputLengths: ["shortSentence"], informationPointsMin: 1, informationPointsMax: 1,
    allowedSupportLevels: ["high"], allowedDistractorSimilarities: ["clear"],
  };
  const registry: RegistrySnapshot = {
    settingsSchemaVersion: 1, bundleVersion: "rules-1", status: "published", limitations: [], sourceFingerprint: "fixture",
    capabilities: [{
      blueprintSlotId: "R1", title: "Notices", taskFamilyId: "TF1", itemFormatId: "IF-SINGLE-SELECT",
      rendererId: "renderer", scoringContractTemplateId: "scoring", primaryCanDoId: "read-notice",
      primaryReportedSkill: "Reading", communicativeActivity: "Reception", communicativeActivities: ["Reception", "Mediation"],
      allowedDomains: ["Public"], allowedContextIds: ["shop"], observableEvidence: "Read the time.",
      taskStructure: "Select one answer.", prohibitedUses: [], referenceTask: "A shop notice",
    }],
    candidateSchemas: [], taskPackageSchema: {}, allowedDomains: ["Public"], difficultyBands: ["TypicalA1"], difficultyStandards: [standard],
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
  const request: CoverageRequest = {
    registryVersion: "rules-1", scope: "approved", role: "core", matchMode: "all", selectedIds: ["time", "hello"], excludedIds: [],
    filters: { skill: "Reading", activity: "Mediation", domain: "Public" }, desiredCount: 100, offset: 25, limit: 25,
  };
  const goal: NonNullable<CoverageResponse["goal"]> = {
    desiredCount: 100, approvedCount: 20, pendingCount: 4, approvedUnknownCount: 0, pendingUnknownCount: 2, unfilledCount: 80,
  };
  return { request, goal, registry };
}

test("pagination and goal edits retain an active intersection", () => {
  const { request } = fixture();
  const previous = { ...request, pattern: ["time"] };
  assert.deepEqual(updateCoverageRequest(previous, { offset: 50 }), { ...previous, offset: 50 });
  assert.deepEqual(updateCoverageRequest(previous, { desiredCount: 200 }), { ...previous, desiredCount: 200, offset: 0 });
  assert.deepEqual(updateCoverageRequest(previous, { desiredCount: undefined }), { ...previous, desiredCount: undefined, offset: 0 });
  assert.deepEqual(updateCoverageRequest(previous, { limit: 50 }), { ...previous, limit: 50, offset: 0 });
  assert.equal(previous.desiredCount, 100);
});

test("query changes clear stale goals and intersections and restart pagination", () => {
  const { request } = fixture();
  const previous = { ...request, pattern: ["time"] };
  const patches: Partial<CoverageRequest>[] = [
    { scope: "drafts" }, { registryVersion: "rules-0" }, { role: "confirmed" }, { matchMode: "exact" },
    { selectedIds: ["time"] }, { excludedIds: ["productive"] }, { filters: { skill: "Writing" } },
  ];
  for (const patch of patches) {
    const next = updateCoverageRequest(previous, { ...patch, offset: 50, desiredCount: 200 });
    assert.equal(next.desiredCount, undefined, JSON.stringify(patch));
    assert.equal(next.pattern, undefined, JSON.stringify(patch));
    assert.equal(next.offset, 0);
  }
  for (const pattern of [undefined, [], ["hello"]]) {
    const next = updateCoverageRequest(previous, { pattern });
    assert.deepEqual(next.pattern, pattern);
    assert.equal(next.desiredCount, undefined);
    assert.equal(next.offset, 0);
  }
  assert.deepEqual(updateCoverageRequest(previous, { selectedIds: ["hello"], pattern: ["hello"] }).pattern, ["hello"]);
});

test("equivalent point sets and cleared filter fields preserve a goal", () => {
  const { request } = fixture();
  assert.deepEqual(updateCoverageRequest(request, {
    selectedIds: ["hello", "time"], filters: { domain: "Public", activity: "Mediation", skill: "Reading", contextId: undefined },
  }).desiredCount, request.desiredCount);
});

test("compatible goals transfer the full shortage without deducting pending work or mutating the query", () => {
  const { request, goal, registry } = fixture();
  const before = structuredClone(request);
  for (const matchMode of ["all", "exact"] as const) {
    const result = coverageGoalPlan({ ...request, matchMode }, goal, registry);
    assert.deepEqual(result, { suggestion: { registryVersion: "rules-1", targetContentIds: ["time", "hello"], desiredCount: 80, filters: request.filters } });
  }
  assert.deepEqual(request, before);
  assert.deepEqual(coverageGoalPlan(request, null, registry), {});
  assert.deepEqual(coverageGoalPlan(request, { ...goal, unfilledCount: 0 }, registry), {});
  assert.deepEqual(coverageGoalPlan(request, { ...goal, unfilledCount: -1 }, registry), {});
});

test("planning rejects unsupported query semantics and unknown approved coverage with a repair reason", () => {
  const { request, goal, registry } = fixture();
  const invalidRequests: Partial<CoverageRequest>[] = [
    { scope: "drafts" }, { registryVersion: "rules-0" }, { role: "confirmed" }, { role: "supporting" }, { role: "either" },
    { matchMode: "any" }, { selectedIds: [] }, { selectedIds: Array.from({ length: 101 }, (_, index) => `target-${index}`) },
    { excludedIds: ["productive"] }, { pattern: [] }, { pattern: ["time"] },
  ];
  for (const patch of invalidRequests) {
    const result = coverageGoalPlan({ ...request, ...patch }, goal, registry);
    assert.equal(result.suggestion, undefined, JSON.stringify(patch));
    assert.ok(result.reason, JSON.stringify(patch));
  }
  assert.match(coverageGoalPlan(request, { ...goal, approvedUnknownCount: 1 }, registry).reason ?? "", /unknown coverage/);
});

test("planning checks all dimensions and context, Can-do and mastery compatibility", () => {
  const { request, goal, registry } = fixture();
  for (const filters of [
    { skill: "Writing" }, { activity: "Production" }, { domain: "Educational" }, { contextId: "school" },
    { blueprintSlotId: "R2" }, { itemFormatId: "IF-MATCHING" }, { primaryCanDoId: "introduce" }, { difficultyBand: "UpperA1" },
  ]) assert.ok(coverageGoalPlan({ ...request, filters }, goal, registry).reason, JSON.stringify(filters));
  for (const id of ["productive", "elsewhere", "other-can-do", "support", "missing"]) {
    assert.ok(coverageGoalPlan({ ...request, selectedIds: ["time", id] }, goal, registry).reason, id);
  }
  registry.contextOptions[0].retired = true;
  assert.ok(coverageGoalPlan(request, goal, registry).reason);
});
