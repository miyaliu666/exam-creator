import assert from "node:assert/strict";
import test from "node:test";

import { hasCoverageViewFilters, initialCoverageState, inspectCoverageEntry, normalizeCoverageTargets, resetCoverageView, updateCoverageState } from "../client/features/language-items/coverage-state.ts";
import type { CoverageFilters, CoverageOverviewState } from "../client/features/language-items/coverage-types.ts";
import type { RegistrySnapshot } from "../client/features/language-items/types.ts";

const inventory: CoverageFilters = {
  skill: "Listening", activity: "Reception", domain: "Public", contextId: "shop",
  itemRuleId: "L1", primaryCanDoId: "listen", difficultyBand: "TypicalA1", itemFormatId: "single",
};

test("language choices belong to each view and survive Registry switches while targets reset", () => {
  let state = updateCoverageState(initialCoverageState("current"), { filters: { language: "en", skill: "Reading" } });
  state = updateCoverageState({ ...state, view: "items" }, { filters: { language: "es" } });
  state.request = { ...state.request, selectedIds: ["spanish"], excludedIds: ["excluded"], pattern: ["spanish"], desiredCount: 5, offset: 25 };
  const changed = updateCoverageState(state, { filters: { ...state.request.filters, language: "en" } });
  assert.deepEqual(changed.request.selectedIds, []);
  assert.deepEqual(changed.request.excludedIds, []);
  assert.equal(changed.request.pattern, undefined);
  assert.equal(changed.request.desiredCount, undefined);
  assert.equal(changed.request.offset, 0);
  assert.deepEqual(changed.overviewInventory, state.overviewInventory);
  const itemsVersion = updateCoverageState(state, { registryVersion: "older" });
  assert.deepEqual(itemsVersion.request.filters, { language: "es" });
  assert.deepEqual(itemsVersion.overviewInventory, state.overviewInventory);
  const overviewVersion = updateCoverageState({ ...state, view: "overview" }, { registryVersion: "older" });
  assert.deepEqual(overviewVersion.overviewInventory.filters, { language: "en" });
  assert.deepEqual(overviewVersion.request, state.request);
  const inspected = inspectCoverageEntry(state, "english", "approved");
  assert.equal(inspected.request.filters.language, "en");
  assert.equal(resetCoverageView(state, "current").request.filters.language, undefined);
});

function analysis() {
  const state = initialCoverageState("current");
  state.overviewInventory = { registryVersion: "overview-rules", filters: { ...inventory } };
  state.overview = { category: "lexical", search: "hello", sort: "pending", offset: 25 };
  state.request = { ...state.request, registryVersion: "item-rules", scope: "drafts",
    selectedIds: ["A", "B"], excludedIds: ["C"], matchMode: "exact", pattern: ["A"],
    desiredCount: 12, offset: 50, filters: { skill: "Reading" } };
  return state;
}

function targetRegistry(): RegistrySnapshot {
  return {
    bundleVersion: "item-rules", status: "published", sourceFingerprint: "fixture", limitations: [], capabilities: [],
    candidateSchemas: [], taskPackageSchema: {}, allowedDomains: [], difficultyBands: [], difficultyStandards: [],
    contextOptions: [], canDoOptions: [], requiredReviewGateIds: [],
    contentIdOptions: [
      { id: "A", kind: "lexical", label: "你好", canDoIds: [], contextIds: [], masteryScope: null },
      { id: "material", kind: "supported", label: "Person name", canDoIds: [], contextIds: [], masteryScope: null },
    ],
  };
}

test("every page entry starts with complete Overview and independent default inventories", () => {
  const current = initialCoverageState("current");
  assert.deepEqual(current, {
    view: "overview",
    request: { scope: "approved", registryVersion: "current", role: "core", selectedIds: [], excludedIds: [], matchMode: "all", filters: {}, offset: 0, limit: 25 },
    overviewInventory: { registryVersion: "current", filters: {} },
    overview: { category: "", search: "", sort: "planned", offset: 0 },
  });
  const next = initialCoverageState("current");
  assert.notEqual(current.request.filters, current.overviewInventory.filters);
  assert.notEqual(next.overviewInventory.filters, current.overviewInventory.filters);
  current.request.selectedIds.push("A");
  current.request.filters.skill = "Reading";
  current.overviewInventory.filters.contextId = "shop";
  current.overview.search = "hello";
  assert.equal(current.overviewInventory.filters.skill, undefined);
  assert.equal(current.request.filters.contextId, undefined);
  assert.deepEqual(next, initialCoverageState("current"));
});

test("direct Find items navigation starts at defaults and subsequent edits stay in their own view", () => {
  let state = updateCoverageState(initialCoverageState("current"), { registryVersion: "old-rules" });
  state = updateCoverageState(state, { filters: { ...inventory } });
  const findItems = { ...state, view: "items" as const };
  assert.deepEqual(findItems.request, initialCoverageState("current").request);
  assert.equal(hasCoverageViewFilters(findItems, "current"), false);
  assert.equal(hasCoverageViewFilters(state, "current"), true);
  const edited = updateCoverageState(findItems, { filters: { skill: "Reading" } });
  assert.deepEqual(edited.overviewInventory, state.overviewInventory);
  assert.deepEqual(edited.request.filters, { skill: "Reading" });
  assert.deepEqual({ ...edited, view: "overview" }.overview, state.overview);
});

test("Overview filter changes reset only its page and preserve the complete Find items analysis", () => {
  const state = analysis();
  const before = structuredClone(state);
  const changed = updateCoverageState(state, { filters: { ...inventory, skill: "Reading" } });
  assert.deepEqual(changed.request, state.request);
  assert.deepEqual(changed.overview, { ...state.overview, offset: 0 });
  assert.equal(changed.overviewInventory.registryVersion, "overview-rules");
  assert.deepEqual(updateCoverageState(state, { filters: { ...inventory } }).overview, state.overview);
  assert.deepEqual(state, before);
});

test("Find items filter changes invalidate its goal and combination without changing Overview", () => {
  const state = { ...analysis(), view: "items" as const };
  const changed = updateCoverageState(state, { filters: { skill: "Listening" } });
  assert.deepEqual(changed.overviewInventory, state.overviewInventory);
  assert.deepEqual(changed.overview, state.overview);
  assert.deepEqual(changed.request, { ...state.request, filters: { skill: "Listening" }, desiredCount: undefined, pattern: undefined, offset: 0 });
  assert.equal(state.request.desiredCount, 12);
});

test("switching item details inventory leaves both-view analysis and approved goals intact", () => {
  const state = { ...analysis(), view: "items" as const };
  const next = updateCoverageState(state, { scope: "approved" });
  assert.deepEqual(next, { ...state, request: { ...state.request, scope: "approved", offset: 0 } });
  assert.deepEqual(state.request.pattern, ["A"]);
  assert.equal(state.request.desiredCount, 12);
});

test("Registry changes reset only the current view and preserve Find items status", () => {
  const state = analysis();
  const overview = updateCoverageState(state, { registryVersion: "new-rules" });
  assert.deepEqual(overview.overviewInventory, { registryVersion: "new-rules", filters: {} });
  assert.deepEqual(overview.overview, initialCoverageState("new-rules").overview);
  assert.deepEqual(overview.request, state.request);
  const items = updateCoverageState({ ...state, view: "items" }, { registryVersion: "new-rules" });
  assert.deepEqual(items.request, { ...initialCoverageState("new-rules").request, scope: "drafts", pattern: undefined, desiredCount: undefined });
  assert.deepEqual(items.overviewInventory, state.overviewInventory);
  assert.deepEqual(items.overview, state.overview);
});

test("Reset returns only the active view to Current and preserves all other-view analysis", () => {
  const state = analysis();
  const overview = resetCoverageView(state, "current");
  assert.deepEqual(overview.overviewInventory, initialCoverageState("current").overviewInventory);
  assert.deepEqual(overview.overview, initialCoverageState("current").overview);
  assert.deepEqual(overview.request, state.request);
  assert.equal(hasCoverageViewFilters(overview, "current"), false);
  const items = resetCoverageView({ ...state, view: "items" }, "current");
  assert.deepEqual(items.request, { ...initialCoverageState("current").request, pattern: undefined, desiredCount: undefined });
  assert.deepEqual(items.overviewInventory, state.overviewInventory);
  assert.deepEqual(items.overview, state.overview);
  assert.equal(hasCoverageViewFilters(items, "current"), false);
});

test("Reset availability follows only the active view including table controls and item-count goals", () => {
  const initial = initialCoverageState("current");
  const changes: Partial<CoverageOverviewState>[] = [
    { category: "grammar" }, { search: "question" }, { sort: "name" }, { offset: 25 },
  ];
  for (const patch of changes) {
    const state = { ...initial, overview: { ...initial.overview, ...patch } };
    assert.equal(hasCoverageViewFilters(state, "current"), true);
    assert.equal(hasCoverageViewFilters({ ...state, view: "items" }, "current"), false);
  }
  const filtered = updateCoverageState(initial, { filters: { contextId: "shop" } });
  assert.equal(hasCoverageViewFilters(filtered, "current"), true);
  assert.equal(hasCoverageViewFilters({ ...filtered, view: "items" }, "current"), false);
  const goalOnly = { ...initial, request: { ...initial.request, desiredCount: 20 } };
  assert.equal(hasCoverageViewFilters(goalOnly, "current"), false);
  assert.equal(hasCoverageViewFilters({ ...goalOnly, view: "items" }, "current"), true);
});

test("explicit count drilldown copies Overview Registry and all eight filters without sharing mutable state", () => {
  const state = analysis();
  for (const scope of ["approved", "drafts"] as const) {
    const result = inspectCoverageEntry(state, "D", scope);
    assert.equal(result.view, "items");
    assert.deepEqual(result.request, { ...state.request, registryVersion: "overview-rules",
      filters: inventory, scope, role: "core", selectedIds: ["D"], excludedIds: [], matchMode: "all",
      pattern: undefined, desiredCount: undefined, offset: 0 });
    assert.deepEqual(result.overview, state.overview);
    assert.deepEqual(result.overviewInventory, state.overviewInventory);
    assert.notEqual(result.request.filters, result.overviewInventory.filters);
    result.request.filters.skill = "Writing";
    assert.equal(result.overviewInventory.filters.skill, "Listening");
    assert.equal(state.request.filters.skill, "Reading");
  }
  assert.deepEqual(state.request.selectedIds, ["A", "B"]);
});

test("retired material normalization is confined to Find items and its own Registry", () => {
  const registry = targetRegistry();
  for (const placement of ["selected", "excluded"] as const) {
    const state = analysis();
    state.request = { ...state.request,
      selectedIds: placement === "selected" ? ["A", "material"] : ["A"],
      excludedIds: placement === "excluded" ? ["material"] : [] };
    const before = structuredClone(state);
    assert.equal(normalizeCoverageTargets(state, { ...registry, bundleVersion: "overview-rules" }), state);
    const normalized = normalizeCoverageTargets(state, registry);
    assert.deepEqual(normalized.request, { ...state.request, selectedIds: [], excludedIds: [],
      matchMode: "all", pattern: undefined, desiredCount: undefined, offset: 0 });
    assert.deepEqual(normalized.overviewInventory, state.overviewInventory);
    assert.deepEqual(normalized.overview, state.overview);
    assert.equal(normalized.view, state.view);
    assert.deepEqual(state, before);
  }
  const unresolved = analysis();
  unresolved.request.selectedIds = ["A", "unknown-historical-target"];
  assert.equal(normalizeCoverageTargets(unresolved, registry), unresolved);
});
