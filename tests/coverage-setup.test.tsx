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
import { NO_CONTEXT_FILTER } from "../client/features/language-items/coverage-context";

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
  itemRuleId: "R-A1-1", contextId: "context-one", domain: "Personal", difficultyBand: "TypicalA1",
  itemFormatId: "IF-SINGLE-SELECT", primaryCanDoId: "can-do-one", skill: "Reading", activity: "Reading instructions",
};
const otherFilters: CoverageFilters = {
  itemRuleId: "L-A1-1", contextId: "context-two", domain: "Public", difficultyBand: "UpperA1",
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

test("setup drilldowns and goals preserve the language when older setup rows omit it", () => {
  const scoped = { ...request, filters: { ...request.filters, language: "es" } };
  assert.equal(coverageSetupQuery(scoped, filters, "drafts").filters?.language, "es");
  const goal = coverageSetupGoalRequest(scoped, filters, 12);
  assert.equal(goal.filters.language, "es");
  assert.deepEqual(goal.selectedIds, scoped.selectedIds);
  assert.notEqual(coverageAnalysisKey(scoped), coverageAnalysisKey(request));
});

test("Coverage creation handoff retains English and Spanish through session storage", () => {
  const scope = "multilingual-coverage-handoff";
  for (const language of ["en", "es"]) {
    const suggestion = { registryVersion: registry.bundleVersion, filters: { ...filters, language }, targetContentIds: [language], desiredCount: 2 };
    saveCreationSuggestion(scope, suggestion);
    assert.deepEqual(readCreationSuggestion(scope), suggestion);
    clearCreationSuggestion(scope);
    assert.equal(readCreationSuggestion(scope), undefined);
  }
  saveCreationSuggestion(scope, { registryVersion: registry.bundleVersion, filters: { ...filters, language: "fr" }, targetContentIds: ["wrong"], desiredCount: 2 });
  assert.equal(readCreationSuggestion(scope), undefined);
});

test("source exercise rows keep explicit no-Context filtering distinct from unknown or unfiltered Context", () => {
  const sourceFilters = { ...filters, itemRuleId: "source-rule", itemFormatId: "EXERCISE:multiple-choice", contextId: NO_CONTEXT_FILTER };
  const response = { ...data, setupCounts: [{ filters: sourceFilters, approvedCount: 0, pendingCount: 2 }] };
  assert.equal(completeCoverageSetup(sourceFilters), true);
  assert.equal(coverageSetupQuery(request, sourceFilters, "drafts").filters?.contextId, NO_CONTEXT_FILTER);
  assert.notEqual(coverageAnalysisKey({ ...request, filters: sourceFilters }), coverageAnalysisKey({ ...request, filters: { ...sourceFilters, contextId: undefined } }));
  assert.match(visibleText(renderTable(response)), /No predefined Context/);
  const olderResponse = { ...data, setupCounts: [{ filters: { ...sourceFilters, contextId: "" }, approvedCount: 0, pendingCount: 2 }] };
  assert.equal(coverageSetupRows(olderResponse, request, registry)?.[0].filters.contextId, NO_CONTEXT_FILTER);
  const missing = { ...data, setupCounts: [{ filters: { ...sourceFilters, contextId: undefined }, approvedCount: 0, pendingCount: 2 }] };
  assert.equal(completeCoverageSetup(coverageSetupRows(missing, request, registry)![0].filters), false);
});

test("joint setup rows show the five authoring fields and both inventories while retaining rule identity", () => {
  for (const scope of ["approved", "drafts"] as const) {
    const markup = renderTable({ ...data, scope }, { ...request, scope });
    const text = visibleText(markup);
    assert.match(text, /Coverage by item setup/);
    const headers = [...markup.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((match) => visibleText(match[1]));
    for (const header of ["Context", "Domain", "Difficulty", "Exercise template", "Primary Can-do", "Approved items", "Unapproved items"]) {
      assert.ok(headers.includes(header), `${header} has its own column`);
    }
    assert.ok(!headers.includes("Blueprint slot") && !headers.includes("Item rule ID"));
    const body = markup.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
    const rows = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((match) => visibleText(match[1]));
    assert.equal(rows.length, 2);
    const first = rows.find((row) => row.includes("Context one"));
    const second = rows.find((row) => row.includes("Context two"));
    assert.ok(first && second);
    for (const label of ["Personal", "Typical A1", "Multiple choice", "Can-do one"]) assert.ok(first.includes(label));
    for (const label of ["Public", "Upper A1", "Match the columns", "Can-do two"]) assert.ok(second.includes(label));
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
      registryVersion: registry.bundleVersion, itemRuleId: "PAGE-ONLY-SLOT", contextId: "PAGE-ONLY-CONTEXT",
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

test("results show setup coverage and matching items as peer sections with one status selector and item count", async () => {
  // SSR checks rendering only; keep the request boundary out of the Node-specific BSON import chain.
  mock.module("../client/features/language-items/coverage-api", () => ({
    getLanguageCoverage: () => { throw new Error("Rendering coverage results must not request new coverage data"); },
  }));
  const { CoverageResults } = await import("../client/features/language-items/coverage-results");
  const cases = (["approved", "drafts"] as const).flatMap((scope) => [0, 1, data.matchedCount].map((matchedCount) => ({ scope, matchedCount })));
  for (const { scope, matchedCount } of cases) {
    const markup = renderToStaticMarkup(<ChakraProvider value={defaultSystem}>
      <CoverageResults data={{ ...data, scope, matchedCount }} request={{ ...request, scope }} registry={registry} currentRegistry={registry} accountScope="fixture"
        onSetupGoalChange={noop} onInspect={noop} onPlan={noop} onChange={noop} />
    </ChakraProvider>);
    const text = visibleText(markup);
    const layoutMarkup = markup.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, "");
    const setupSection = layoutMarkup.match(/<section\b[^>]*aria-label="Item setup coverage"[^>]*>([\s\S]*?)<\/section>/);
    const matchingSection = layoutMarkup.match(/<section\b[^>]*aria-label="Matching items"[^>]*>([\s\S]*?)<\/section>/);
    assert.ok(setupSection, "Setup coverage has its own section");
    assert.ok(matchingSection, "Matching items has an always-visible section");
    assert.doesNotMatch(setupSection[1], /<section\b/, "The item list is not nested under setup coverage");
    assert.equal(layoutMarkup.slice(setupSection.index! + setupSection[0].length, matchingSection.index).trim(), "",
      "Setup coverage and item results are adjacent sibling sections");
    assert.ok(setupSection.index! < matchingSection.index!);
    const setupHeadings = [...setupSection[1].matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/g)].map((heading) => visibleText(heading[1]));
    const matching = matchingSection[1];
    const itemHeadings = [...matching.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/g)].map((heading) => visibleText(heading[1]));
    assert.deepEqual(setupHeadings, ["Coverage by item setup"]);
    assert.deepEqual(itemHeadings, ["Items"], "Item results use a peer heading without repeating the selected status");
    const statusSelectors = [...matching.matchAll(/<select\b[^>]*aria-label="Item status"[^>]*>([\s\S]*?)<\/select>/g)];
    assert.equal(statusSelectors.length, 1, "Item status remains accessible without a repeated visible label");
    const selected = [...statusSelectors[0][1].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)]
      .find((option) => /\bselected(?:=|\s|$)/.test(option[1]));
    assert.ok(selected);
    assert.match(selected[1], new RegExp(`value="${scope}"`));
    assert.equal(visibleText(selected[2]), scope === "approved" ? "Approved items" : "Unapproved items");
    const matchingText = visibleText(matching);
    assert.match(matchingText, new RegExp(`\\b${matchedCount} ${matchedCount === 1 ? "item" : "items"}\\b`));
    assert.doesNotMatch(matchingText, /Item status|(?:Approved|Unapproved) items\s*·/);
    if (matchedCount === 1) assert.doesNotMatch(matchingText, /\b1 items\b/);
    if (matchedCount === 0) assert.match(matchingText, /No matching items\./);
    const disclosures = [...matching.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/g)];
    assert.equal(disclosures.length, 1, "Only Target combinations stays collapsed");
    assert.doesNotMatch(disclosures[0][1], /aria-label="Item status"/);
    assert.match(visibleText(disclosures[0][1]), /Target combinations/,
      "Status and combination counts are scoped to the item-detail inventory");
    assert.doesNotMatch(text, /Item counts by attribute|INDEPENDENT-ATTRIBUTE|999/);
  }
});

test("incomplete setup rows remain visible but cannot create a broader hidden-filter drilldown or goal", () => {
  for (const missing of ["itemRuleId", "contextId", "domain", "difficultyBand", "itemFormatId", "primaryCanDoId"] as const) {
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
    itemRuleId: filters.itemRuleId, contextId: filters.contextId, domain: filters.domain,
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
    capabilities: [{ itemRuleId: "R-A1-1", title: "Notices", taskFamilyId: "TF1", itemFormatId: "IF-SINGLE-SELECT",
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
