import { updateCoverageRequest } from "./coverage-query";
import { contentLanguage } from "./content-language";
import type { CoveragePageState, CoverageRequest } from "./coverage-types";
import type { RegistrySnapshot } from "./types";

const FILTER_KEYS = ["language", "skill", "activity", "domain", "contextId", "itemRuleId", "primaryCanDoId", "difficultyBand", "itemFormatId"] as const;

export function initialCoverageState(registryVersion: string): CoveragePageState {
  return {
    view: "overview",
    request: { scope: "approved", registryVersion, role: "core", selectedIds: [], excludedIds: [], matchMode: "all", filters: {}, offset: 0, limit: 25 },
    overviewInventory: { registryVersion, filters: {} },
    overview: { category: "", search: "", sort: "planned", offset: 0 },
  };
}

export function inspectCoverageEntry(state: CoveragePageState, id: string, scope: "approved" | "drafts"): CoveragePageState {
  // Only an explicit count drilldown carries the overview's inventory into an item query.
  return { ...state, view: "items", request: {
    ...state.request, scope, role: "core",
    registryVersion: state.overviewInventory.registryVersion, filters: { ...state.overviewInventory.filters },
    selectedIds: [id], excludedIds: [], matchMode: "all", pattern: undefined, desiredCount: undefined, offset: 0,
  } };
}

function updateItemRequest(state: CoveragePageState, patch: Partial<CoverageRequest>): CoveragePageState {
  const switchingVersion = patch.registryVersion !== undefined && patch.registryVersion !== state.request.registryVersion;
  const request = updateCoverageRequest(state.request, {
    ...patch, role: "core",
    ...(switchingVersion ? { selectedIds: [], excludedIds: [], filters: state.request.filters.language ? { language: state.request.filters.language } : {}, matchMode: "all" as const, pattern: undefined, desiredCount: undefined } : {}),
  });
  return { ...state, request };
}

export function updateCoverageState(state: CoveragePageState, patch: Partial<CoverageRequest>): CoveragePageState {
  if (state.view === "items") return updateItemRequest(state, patch);
  const previous = state.overviewInventory;
  const registryVersion = patch.registryVersion ?? previous.registryVersion;
  const changedVersion = registryVersion !== previous.registryVersion;
  const filters = changedVersion ? previous.filters.language ? { language: previous.filters.language } : {} : patch.filters ?? previous.filters;
  const changedInventory = FILTER_KEYS.some((key) => (filters[key] || undefined) !== (previous.filters[key] || undefined));
  return {
    ...state,
    overviewInventory: { registryVersion, filters: { ...filters } },
    overview: changedVersion ? initialCoverageState(registryVersion).overview : changedInventory ? { ...state.overview, offset: 0 } : state.overview,
  };
}

export function normalizeCoverageTargets(state: CoveragePageState, registry: RegistrySnapshot): CoveragePageState {
  if (state.request.registryVersion !== registry.bundleVersion) return state;
  const unavailableIds = new Set(registry.contentIdOptions.filter((option) => option.kind === "supported" || contentLanguage(option) !== (state.request.filters.language ?? "zh")).map((option) => option.id));
  if (![...state.request.selectedIds, ...state.request.excludedIds].some((id) => unavailableIds.has(id))) return state;
  // A retired material query must not become a different, invisible target filter.
  return updateItemRequest(state, { selectedIds: [], excludedIds: [], matchMode: "all", pattern: undefined });
}

export function hasCoverageViewFilters(state: CoveragePageState, currentVersion: string): boolean {
  const { request, overview } = state;
  const inventory = state.view === "overview" ? state.overviewInventory : request;
  if (inventory.registryVersion !== currentVersion || Object.entries(inventory.filters).some(([key, value]) => key === "language" ? !!value && value !== "zh" : !!value)) return true;
  return state.view === "overview"
    ? !!overview.category || !!overview.search || overview.sort !== "planned" || overview.offset > 0
    : request.scope !== "approved" || request.matchMode !== "all" || request.selectedIds.length > 0 || request.excludedIds.length > 0 ||
      request.pattern !== undefined || request.desiredCount !== undefined || request.offset > 0;
}

export function resetCoverageView(state: CoveragePageState, currentVersion: string): CoveragePageState {
  const initial = initialCoverageState(currentVersion);
  if (state.view === "items") return { ...state, request: { ...initial.request, desiredCount: undefined, pattern: undefined } };
  return { ...state, overviewInventory: initial.overviewInventory, overview: initial.overview };
}
