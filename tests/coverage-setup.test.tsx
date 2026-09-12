import assert from "node:assert/strict";
import test from "node:test";
import { mock } from "bun:test";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { renderToStaticMarkup } from "react-dom/server";

import { completeCoverageSetup, coverageAnalysisKey, coverageSetupGoalRequest, coverageSetupQuery, coverageSetupRows } from "../client/features/language-items/coverage-setup-model";
import { CoverageSetupTable } from "../client/features/language-items/coverage-setup-table";
import { clearCreationSuggestion, readCreationSuggestion, saveCreationSuggestion } from "../client/features/language-items/creation-suggestion-storage";
import type { CoverageFilters, CoverageRequest, CoverageResponse } from "../client/features/language-items/coverage-types";
import type { DifficultyBandStandard, RegistrySnapshot } from "../client/features/language-items/types";

const registry: RegistrySnapshot = {
  bundleVersion: "rules-1", status: "published", sourceFingerprint: "fixture", limitations: [], capabilities: [],
  candidateSchemas: [], taskPackageSchema: {}, allowedDomains: ["Personal", "Public"],
  difficultyBands: ["TypicalA1", "UpperA1"], difficultyStandards: [], requiredReviewGateIds: [], contentIdOptions: [],
  contextOptions: [
    { id: "context-one", label: "Context one", primaryDomains: ["Personal"], canDoIds: [], scope: "", exclusions: [], retired: false },
    { id: "context-two", label: "Context two", primaryDomains: ["Public"], canDoIds: [], scope: "", exclusions: [], retired: false },
  ],
  canDoOptions: [{ id: "can-do-one", label: "Can-do one" }, { id: "can-do-two", label: "Can-do two" }],
};
const filters: CoverageFilters = {
  blueprintSlotId: "R-A1-1", contextId: "context-one", domain: "Personal", difficultyBand: "TypicalA1",
  itemFormatId: "IF-SINGLE-SELECT", primaryCanDoId: "can-do-one", skill: "Reading", activity: "Reading instructions",
};
const otherFilters: CoverageFilters = {
  blueprintSlotId: "L-A1-1", contextId: "context-two", domain: "Public", difficultyBand: "UpperA1",
  itemFormatId: "IF-MATCHING", primaryCanDoId: "can-do-two", skill: "Listening", activity: "Listening to instructions",
};
const request: CoverageRequest = {
  registryVersion: registry.bundleVersion, scope: "drafts", role: "core", selectedIds: ["hello", "time"],
  excludedIds: ["excluded"], matchMode: "any", filters: { skill: "Reading" }, desiredCount: 3, offset: 50, limit: 25,
};
const data: CoverageResponse = {
  registryVersion: registry.bundleVersion, availableRegistryVersions: [registry.bundleVersion], scope: "drafts",
  scopedCount: 11, knownCount: 11, unknownCount: 0, matchedCount: 11, pendingCount: 11, pendingUnknownCount: 0,
  termCounts: [], patterns: [], breakdowns: { skill: [{ id: "INDEPENDENT-ATTRIBUTE", count: 999 }] }, goal: null,
  items: [], offset: 50, limit: 25,
  setupCounts: [{ filters, approvedCount: 2, pendingCount: 11 }, { filters: otherFilters, approvedCount: 7, pendingCount: 0 }],
};
const noop = () => {};
const renderTable = (response = data, query = request) => renderToStaticMarkup(
  <ChakraProvider value={defaultSystem}><CoverageSetupTable data={response} request={query} registry={registry}
    onInspect={noop} onChooseGoal={noop} /></ChakraProvider>,
);
const visibleText = (markup: string) => markup.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

test("joint setup rows retain all six fields and both inventories irrespective of selected item scope", () => {
  for (const scope of ["approved", "drafts"] as const) {
    const markup = renderTable({ ...data, scope }, { ...request, scope });
    const text = visibleText(markup);
    assert.match(text, /Coverage by item setup/);
    const headers = [...markup.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((match) => visibleText(match[1]));
    for (const header of ["Blueprint slot", "Context", "Domain", "Difficulty", "Item format", "Primary Can-do", "Approved items", "Unapproved items"]) {
      assert.ok(headers.includes(header), `${header} has its own column`);
    }
    const body = markup.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
    const rows = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((match) => visibleText(match[1]));
    assert.equal(rows.length, 2);
    const first = rows.find((row) => row.includes("Context one"));
    const second = rows.find((row) => row.includes("Context two"));
    assert.ok(first && second);
    for (const label of ["Personal", "Typical A1", "Single select", "Can-do one"]) assert.ok(first.includes(label));
    for (const label of ["Public", "Upper A1", "Matching", "Can-do two"]) assert.ok(second.includes(label));
    assert.match(first, /\b2\s+11\s+Set goal\b/);
    assert.match(second, /\b7\s+0\s+Set goal\b/);
    assert.doesNotMatch(text, /Item counts by attribute|INDEPENDENT-ATTRIBUTE|999/);
  }
});

test("setup inventory counts come from the complete response, not the current items page", () => {
  const original = structuredClone(data);
  const populatedPage: CoverageResponse = { ...data, items: [{
    id: "page-only", title: "PAGE-ONLY-ITEM", versionId: null, scope: "drafts", status: "draft",
    metadata: {
      registryVersion: registry.bundleVersion, blueprintSlotId: "PAGE-ONLY-SLOT", contextId: "PAGE-ONLY-CONTEXT",
      domain: "PAGE-ONLY-DOMAIN", difficultyBand: "LowerA1", itemFormatId: "IF-TYPED-MESSAGE", primaryCanDoId: "PAGE-ONLY-CANDO",
      skill: "Writing", activity: "Writing", activities: ["Writing"], coreIds: ["hello"], supportingIds: [],
    },
  }] };
  assert.equal(visibleText(renderTable(populatedPage)), visibleText(renderTable(data)));
  assert.deepEqual(data, original);
});

test("missing setup data remains distinct from a valid empty setup inventory", () => {
  const unavailable = visibleText(renderTable({ ...data, setupCounts: undefined }));
  const empty = visibleText(renderTable({ ...data, setupCounts: [] }));
  assert.match(unavailable, /unavailable/i);
  assert.doesNotMatch(unavailable, /No matching item setups/);
  assert.match(empty, /No matching item setups/);
});

test("results lead with joint setup counts and open matching items only after explicit drilldown", async () => {
  // SSR checks rendering only; keep the request boundary out of the Node-specific BSON import chain.
  mock.module("../client/features/language-items/coverage-api", () => ({
    getLanguageCoverage: () => { throw new Error("Rendering coverage results must not request new coverage data"); },
  }));
  const { CoverageResults } = await import("../client/features/language-items/coverage-results");
  for (const showItems of [false, true]) {
    const markup = renderToStaticMarkup(<ChakraProvider value={defaultSystem}>
      <CoverageResults data={data} request={request} registry={registry} currentRegistry={registry} accountScope="fixture"
        showItems={showItems} onItemsOpenChange={noop} onSetupGoalChange={noop} onInspect={noop} onPlan={noop} onChange={noop} />
    </ChakraProvider>);
    const text = visibleText(markup);
    assert.ok(text.indexOf("Coverage by item setup") < text.indexOf(`Unapproved items · ${data.matchedCount}`));
    const matching = [...markup.matchAll(/<details\b([^>]*)>([\s\S]*?)<\/details>/g)]
      .find((match) => /aria-label="Item status"/.test(match[2]));
    assert.ok(matching, "Matching items has its own disclosure");
    assert.equal(/\bopen(?:=|\s|$)/.test(matching[1]), showItems);
    assert.match(matching[2], /aria-label="Item status"/);
    assert.match(visibleText(matching[2]), /Target combinations/,
      "Status and combination counts are scoped to the item-detail inventory");
    assert.doesNotMatch(text, /Item counts by attribute|INDEPENDENT-ATTRIBUTE|999/);
  }
});

test("incomplete setup rows remain visible but cannot create a broader hidden-filter drilldown or goal", () => {
  for (const missing of ["blueprintSlotId", "contextId", "domain", "difficultyBand", "itemFormatId", "primaryCanDoId"] as const) {
    const incomplete = { ...filters, [missing]: "" };
    const markup = renderTable({ ...data, setupCounts: [{ filters: incomplete, approvedCount: 2, pendingCount: 11 }] });
    const text = visibleText(markup);
    assert.match(text, /Unknown/);
    assert.match(text, /\b2\s+11\s+Set goal\b/);
    const buttons = [...markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
    assert.equal(buttons.length, 3);
    for (const button of buttons) assert.match(button[1], /\bdisabled(?:=|\s|$)/, `Missing ${missing} disables every row action`);
  }
});

test("setup count drilldown replaces the setup and inventory without losing a language combination", () => {
  const source = { ...request, pattern: ["hello"] };
  const before = structuredClone({ source, filters });
  for (const scope of ["approved", "drafts"] as const) {
    const patch = coverageSetupQuery(source, filters, scope);
    const next = { ...source, ...patch };
    assert.equal(next.scope, scope);
    assert.deepEqual(next.filters, filters);
    assert.notEqual(next.filters, filters, "The selected setup must be copied, not shared with the response");
    assert.equal(next.offset, 0);
    assert.equal(next.desiredCount, undefined);
    assert.deepEqual(next.pattern, source.pattern);
    assert.deepEqual(next.selectedIds, source.selectedIds);
    assert.deepEqual(next.excludedIds, source.excludedIds);
    assert.equal(next.matchMode, source.matchMode);
    assert.equal(next.registryVersion, source.registryVersion);
  }
  assert.deepEqual({ source, filters }, before);
});

test("setup goals retain exact, any, exclusion and combination semantics after query invalidation", () => {
  for (const matchMode of ["all", "any", "exact"] as const) {
    for (const pattern of [undefined, [], ["hello"]]) {
      const source: CoverageRequest = { ...request, registryVersion: "historical-rules", matchMode, pattern };
      const before = structuredClone({ source, filters });
      const goal = coverageSetupGoalRequest(source, filters, 37);
      assert.equal(goal.scope, "approved");
      assert.equal(goal.desiredCount, 37, "Changing setup must invalidate an old goal before assigning the new goal");
      assert.equal(goal.offset, 0);
      assert.equal(goal.registryVersion, source.registryVersion);
      assert.equal(goal.matchMode, matchMode);
      assert.deepEqual(goal.pattern, pattern);
      assert.deepEqual(goal.selectedIds, source.selectedIds);
      assert.deepEqual(goal.excludedIds, source.excludedIds);
      assert.deepEqual(goal.filters, filters);
      assert.notEqual(goal.filters, filters);
      assert.deepEqual({ source, filters }, before);
    }
  }
});

test("nullable API setup dimensions survive the New items suggestion storage boundary", () => {
  // Rust serializes unfiltered optional dimensions as null despite the client request type using undefined.
  const apiFilters: CoverageFilters = JSON.parse(JSON.stringify({ ...filters, skill: null, activity: null }));
  const source = { ...request, matchMode: "all" as const, excludedIds: [] };
  const before = structuredClone({ source, apiFilters });
  const goalRequest = coverageSetupGoalRequest(source, apiFilters, 17);
  const expectedFilters: CoverageFilters = {
    blueprintSlotId: filters.blueprintSlotId, contextId: filters.contextId, domain: filters.domain,
    difficultyBand: filters.difficultyBand, itemFormatId: filters.itemFormatId, primaryCanDoId: filters.primaryCanDoId,
  };
  assert.deepEqual(goalRequest.filters, expectedFilters);
  assert.equal(Object.values(goalRequest.filters).some((value) => value === null), false);
  const suggestion = {
    registryVersion: goalRequest.registryVersion, targetContentIds: goalRequest.selectedIds,
    desiredCount: goalRequest.desiredCount!, filters: goalRequest.filters,
  };
  const scope = "coverage-setup-nullable-api-regression";
  clearCreationSuggestion(scope);
  try {
    saveCreationSuggestion(scope, suggestion);
    assert.deepEqual(readCreationSuggestion(scope), {
      registryVersion: source.registryVersion, targetContentIds: source.selectedIds, desiredCount: 17, filters: expectedFilters,
    }, "New items must receive the full plan instead of silently discarding API null values");
    assert.deepEqual({ source, apiFilters }, before);
  } finally {
    clearCreationSuggestion(scope);
  }
});

test("analysis identity tracks language and setup meaning independently of detail status, pages and quantities", () => {
  const source: CoverageRequest = { ...request, filters: { ...filters }, excludedIds: ["excluded", "second"], pattern: ["hello", "time"] };
  const before = structuredClone(source);
  const key = coverageAnalysisKey(source);
  for (const patch of [{ scope: "approved" as const }, { offset: 0 }, { limit: 50 }, { desiredCount: 11 }, { desiredCount: undefined }]) {
    assert.equal(coverageAnalysisKey({ ...source, ...patch }), key);
  }
  assert.equal(coverageAnalysisKey({ ...source, selectedIds: ["time", "hello", "hello"], excludedIds: ["second", "excluded"],
    pattern: ["time", "hello", "time"], filters: Object.fromEntries(Object.entries(filters).reverse()) }), key);
  const semanticChanges: Partial<CoverageRequest>[] = [
    { registryVersion: "another-registry" }, { role: "confirmed" }, { matchMode: "exact" },
    { selectedIds: ["hello"] }, { excludedIds: ["excluded"] }, { pattern: ["hello"] }, { pattern: [] }, { pattern: undefined },
    ...Object.keys(filters).map((field) => ({ filters: { ...filters, [field]: "changed" } })),
  ];
  for (const patch of semanticChanges) assert.notEqual(coverageAnalysisKey({ ...source, ...patch }), key, JSON.stringify(patch));
  assert.notEqual(coverageAnalysisKey({ ...source, pattern: [] }), coverageAnalysisKey({ ...source, pattern: undefined }),
    "The empty combination excludes selected targets; no combination has different meaning");
  assert.deepEqual(source, before);
});

test("only a fully selected compatible setup can fill a known empty inventory with a goal-ready zero row", () => {
  const standard: DifficultyBandStandard = {
    id: "TypicalA1", label: "Typical A1", description: "Read one fact.",
    defaultDrivers: { inputLength: "shortSentence", informationPoints: 1, supportLevel: "high", distractorSimilarity: "clear", independenceLevel: "highlySupported", inferenceRequired: false },
    allowedInputLengths: ["shortSentence"], informationPointsMin: 1, informationPointsMax: 1,
    allowedSupportLevels: ["high"], allowedDistractorSimilarities: ["clear"],
  };
  const compatible: RegistrySnapshot = { ...registry, difficultyStandards: [standard],
    capabilities: [{ blueprintSlotId: "R-A1-1", title: "Notices", taskFamilyId: "TF1", itemFormatId: "IF-SINGLE-SELECT",
      rendererId: "renderer", scoringContractTemplateId: "scoring", primaryCanDoId: "can-do-one", primaryReportedSkill: "Reading",
      communicativeActivity: "Reading instructions", allowedDomains: ["Personal"], allowedContextIds: ["context-one"],
      observableEvidence: "Read a fact.", taskStructure: "Select one answer.", prohibitedUses: [], referenceTask: "A notice" }],
    contextOptions: [{ ...registry.contextOptions[0], scope: "Read a personal notice.", canDoIds: ["can-do-one"] }],
    contentIdOptions: ["hello", "time"].map((id) => ({ id, label: id, kind: "lexical", canDoIds: [], contextIds: [], masteryScope: null })),
  };
  const query: CoverageRequest = { ...request, filters: { ...filters }, matchMode: "all", excludedIds: [] };
  const empty: CoverageResponse = { ...data, setupCounts: [], matchedCount: 0, pendingCount: 0 };
  const before = structuredClone({ query, empty, compatible });
  for (const scope of ["approved", "drafts"] as const) {
    const rows = coverageSetupRows(empty, { ...query, scope }, compatible);
    assert.deepEqual(rows, [{ filters, approvedCount: 0, pendingCount: 0 }]);
    assert.ok(completeCoverageSetup(rows![0].filters));
    assert.notEqual(rows![0].filters, query.filters);
  }
  assert.equal(coverageSetupRows({ ...empty, setupCounts: undefined }, query, compatible), undefined,
    "Missing response statistics must never be fabricated as zero");
  assert.deepEqual(coverageSetupRows(empty, { ...query, filters: { ...filters, contextId: undefined } }, compatible), []);
  assert.deepEqual(coverageSetupRows(empty, { ...query, filters: { ...filters, contextId: "incompatible" } }, compatible), []);
  assert.deepEqual(coverageSetupRows(empty, { ...query, selectedIds: ["unknown-target"] }, compatible), []);
  assert.deepEqual(coverageSetupRows(empty, { ...query, registryVersion: "another-registry" }, compatible), []);
  assert.deepEqual(coverageSetupRows(data, query, compatible), data.setupCounts, "Recorded setup rows are not rewritten");
  assert.deepEqual({ query, empty, compatible }, before);
});
