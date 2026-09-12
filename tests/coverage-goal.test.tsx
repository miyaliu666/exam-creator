import assert from "node:assert/strict";
import test from "node:test";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { renderToStaticMarkup } from "react-dom/server";

import { CoverageGoal } from "../client/features/language-items/coverage-goal";
import { coverageNewItemPlan, parseCoverageGoalCount } from "../client/features/language-items/coverage-goal-model";
import type { CoverageRequest, CoverageResponse } from "../client/features/language-items/coverage-types";
import type { DifficultyBandStandard, RegistrySnapshot } from "../client/features/language-items/types";

function fixture() {
  const standard: DifficultyBandStandard = {
    id: "TypicalA1", label: "Typical A1", description: "Read one fact.",
    defaultDrivers: { inputLength: "shortSentence", informationPoints: 1, supportLevel: "high", distractorSimilarity: "clear", independenceLevel: "highlySupported", inferenceRequired: false },
    allowedInputLengths: ["shortSentence"], informationPointsMin: 1, informationPointsMax: 1,
    allowedSupportLevels: ["high"], allowedDistractorSimilarities: ["clear"],
  };
  const registry: RegistrySnapshot = {
    settingsSchemaVersion: 1, bundleVersion: "rules-1", status: "published", limitations: [], sourceFingerprint: "fixture",
    capabilities: [{ blueprintSlotId: "R1", title: "Notices", taskFamilyId: "TF1", itemFormatId: "IF-SINGLE-SELECT",
      rendererId: "renderer", scoringContractTemplateId: "scoring", primaryCanDoId: "read-notice",
      primaryReportedSkill: "Reading", communicativeActivity: "Reception", allowedDomains: ["Public"], allowedContextIds: ["shop"],
      observableEvidence: "Read the time.", taskStructure: "Select one answer.", prohibitedUses: [], referenceTask: "A shop notice" }],
    candidateSchemas: [], taskPackageSchema: {}, allowedDomains: ["Public"], difficultyBands: ["TypicalA1"], difficultyStandards: [standard],
    capabilityDifficultyProfileSets: [{ id: "profile", blueprintSlotId: "R1", itemFormatId: "IF-SINGLE-SELECT", primaryCanDoId: "read-notice", standards: [standard] }],
    contentIdOptions: [{ id: "time", label: "几点", kind: "lexical", contextIds: ["shop"], canDoIds: ["read-notice"], masteryScope: "receptive" }],
    contextOptions: [{ id: "shop", label: "Shop", primaryDomains: ["Public"], canDoIds: ["read-notice"], scope: "Read a shop notice.", exclusions: [], retired: false }],
    canDoOptions: [{ id: "read-notice", label: "Read a notice" }], requiredReviewGateIds: [],
  };
  const request: CoverageRequest = {
    registryVersion: "rules-1", scope: "approved", role: "core", matchMode: "all", selectedIds: ["time"], excludedIds: [],
    filters: { skill: "Reading", activity: "Reception", domain: "Public", contextId: "shop", blueprintSlotId: "R1",
      itemFormatId: "IF-SINGLE-SELECT", primaryCanDoId: "read-notice", difficultyBand: "TypicalA1" },
    desiredCount: 100, offset: 0, limit: 25,
  };
  const goal: NonNullable<CoverageResponse["goal"]> = {
    desiredCount: 100, approvedCount: 20, pendingCount: 4, approvedUnknownCount: 0, pendingUnknownCount: 0, unfilledCount: 80,
  };
  return { registry, request, goal };
}
const noop = () => {};
const visibleText = (markup: string) => markup.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

test("approved inventory goals parse whole counts without interpreting missing input as zero", () => {
  for (const text of ["", " ", "-1", "1.5", "1000001", "Infinity", "NaN", "eleven"]) assert.equal(parseCoverageGoalCount(text), undefined, text);
  for (const [text, expected] of [["0", 0], ["11", 11], [" 42 ", 42], ["1000000", 1000000]] as const) assert.equal(parseCoverageGoalCount(text), expected);
});

test("planning requires an explicit new-item quantity rather than assigning the approved shortfall", () => {
  const { request, goal, registry } = fixture();
  const before = structuredClone({ request, goal, registry });
  assert.deepEqual(coverageNewItemPlan(request, goal, registry), {});
  for (const scope of ["approved", "drafts"] as const) {
    for (const count of [1, 17, 50]) {
      assert.deepEqual(coverageNewItemPlan({ ...request, scope }, goal, registry, count), { suggestion: {
        registryVersion: request.registryVersion, targetContentIds: request.selectedIds, desiredCount: count, filters: request.filters,
      } }, "The item-detail status cannot change an independently approved inventory goal");
    }
  }
  assert.deepEqual({ request, goal, registry }, before);
});

test("new-item quantity respects the single-job limit and actual approved shortfall", () => {
  const { request, goal, registry } = fixture();
  for (const count of [0, -1, 1.5, 51, 80, Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = coverageNewItemPlan(request, goal, registry, count);
    assert.equal(result.suggestion, undefined, String(count));
    assert.ok(result.reason, `Invalid quantity ${count} has an actionable reason`);
  }
  const smallGoal = { ...goal, desiredCount: 25, unfilledCount: 5, pendingCount: 40 };
  assert.equal(coverageNewItemPlan({ ...request, desiredCount: 25 }, smallGoal, registry, 5).suggestion?.desiredCount, 5,
    "Unapproved items are shown separately and do not silently change the approved shortfall");
  assert.ok(coverageNewItemPlan({ ...request, desiredCount: 25 }, smallGoal, registry, 6).reason);
  assert.equal(coverageNewItemPlan(request, null, registry, 1).suggestion, undefined);
  assert.equal(coverageNewItemPlan(request, { ...goal, unfilledCount: 0 }, registry, 1).suggestion, undefined);
});

test("explicit new-item quantities still require compatible language targets and known approved coverage", () => {
  const { request, goal, registry } = fixture();
  for (const patch of [{ selectedIds: [] }, { matchMode: "any" as const }, { excludedIds: ["other"] }, { pattern: ["time"] }, { registryVersion: "old-rules" }]) {
    const result = coverageNewItemPlan({ ...request, ...patch }, goal, registry, 3);
    assert.equal(result.suggestion, undefined);
    assert.ok(result.reason);
  }
  assert.equal(coverageNewItemPlan(request, { ...goal, approvedUnknownCount: 1 }, registry, 3).suggestion, undefined);
});

test("goal display separates inventory shortfall from a blank new-item plan and offers unapproved review", () => {
  const { request, goal, registry } = fixture();
  const markup = renderToStaticMarkup(<ChakraProvider value={defaultSystem}>
    <CoverageGoal request={request} goal={goal} registry={registry} pending={false} expanded
      onChange={noop} onPlan={noop} onInspectUnapproved={noop} />
  </ChakraProvider>);
  const text = visibleText(markup);
  assert.match(text, /Approved item shortfall: 80/);
  assert.match(text, /Unapproved items: 4/);
  assert.match(text, /View 4 unapproved items/);
  assert.match(markup, /aria-label="New items to plan"[^>]*value=""/);
  assert.doesNotMatch(text, /Items needed|Plan \d+ (?:more|new) items/,
    "A shortfall is not permission to choose the author's next generation quantity");
});

test("goal loading and failures retain author input without reporting absent statistics as zero", () => {
  const { request, registry } = fixture();
  for (const pending of [false, true]) {
    const markup = renderToStaticMarkup(<ChakraProvider value={defaultSystem}>
      <CoverageGoal request={{ ...request, desiredCount: 11 }} goal={null} registry={registry} pending={pending} expanded
        inputText="11" onInputTextChange={noop} onChange={noop} onPlan={noop} />
    </ChakraProvider>);
    assert.match(markup, /aria-label="Desired approved item count"[^>]*value="11"/);
    assert.doesNotMatch(visibleText(markup), /Approved items: 0|Approved item shortfall: 0|Plan \d+ new items/);
  }
});

test("planning actions use the author's new-item quantity and disappear while goal data is stale", () => {
  const { request, goal, registry } = fixture();
  const render = (inputText: string, pending: boolean, newItemText: string) => renderToStaticMarkup(<ChakraProvider value={defaultSystem}>
    <CoverageGoal request={request} goal={goal} registry={registry} pending={pending} expanded inputText={inputText}
      newItemText={newItemText} onChange={noop} onPlan={noop} />
  </ChakraProvider>);
  assert.match(visibleText(render("100", false, "3")), /Plan 3 new items/);
  assert.match(visibleText(render("100", false, "1")), /Plan 1 new item\b/);
  for (const [input, pending] of [["100", true], ["11", false]] as const) {
    const text = visibleText(render(input, pending, "3"));
    assert.doesNotMatch(text, /Plan \d+ new items|Approved item shortfall: 80/,
      "A response for an older desired count cannot authorize a plan");
  }
});
