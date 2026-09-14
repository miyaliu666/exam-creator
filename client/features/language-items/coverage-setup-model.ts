import { coverageSuggestionSetup } from "./batch-coverage-suggestion";
import { updateCoverageRequest } from "./coverage-query";
import type { CoverageFilters, CoverageRequest, CoverageResponse } from "./coverage-types";
import type { RegistrySnapshot } from "./types";
import { NO_CONTEXT_FILTER } from "./coverage-context";

export interface CoverageSetupGoalState {
  queryKey: string;
  filters: CoverageFilters;
  inputText: string;
  newItemText: string;
}

export function coverageAnalysisKey(request: CoverageRequest) {
  return JSON.stringify({ registryVersion: request.registryVersion, role: request.role, matchMode: request.matchMode,
    selectedIds: [...new Set(request.selectedIds)].sort(), excludedIds: [...new Set(request.excludedIds)].sort(),
    pattern: request.pattern === undefined ? undefined : [...new Set(request.pattern)].sort(),
    filters: Object.entries(request.filters).filter(([, value]) => !!value).sort(([left], [right]) => left.localeCompare(right)) });
}

export function coverageSetupQuery(request: CoverageRequest, filters: CoverageFilters, scope: CoverageRequest["scope"]): Partial<CoverageRequest> {
  // A setup drilldown narrows the same language query, including an explicit intersection.
  // Unfiltered API dimensions are null; the creation handoff accepts only defined string filters.
  const definedFilters = Object.fromEntries(Object.entries(filters).filter(([, value]) => typeof value === "string"));
  if (request.filters.language !== undefined && definedFilters.language === undefined) definedFilters.language = request.filters.language;
  return { filters: definedFilters, scope, offset: 0, desiredCount: undefined, pattern: request.pattern };
}

export function coverageSetupGoalRequest(request: CoverageRequest, filters: CoverageFilters, desiredCount?: number): CoverageRequest {
  return { ...updateCoverageRequest(request, coverageSetupQuery(request, filters, "approved")), desiredCount };
}

export const COVERAGE_SETUP_FIELDS = ["itemRuleId", "contextId", "domain", "difficultyBand", "itemFormatId", "primaryCanDoId"] as const;

export function completeCoverageSetup(filters: CoverageFilters) {
  return COVERAGE_SETUP_FIELDS.every((key) => !!filters[key]);
}

export function coverageSetupRows(data: CoverageResponse, request: CoverageRequest, registry: RegistrySnapshot) {
  const rows = data.setupCounts?.map((row) => row.filters.contextId === "" && row.filters.itemFormatId?.startsWith("EXERCISE:")
    ? { ...row, filters: { ...row.filters, contextId: NO_CONTEXT_FILTER } } : row);
  if (!rows || rows.length || !completeCoverageSetup(request.filters)) return rows;
  const setup = coverageSuggestionSetup({ registryVersion: request.registryVersion, filters: request.filters,
    targetContentIds: request.selectedIds, desiredCount: 1 }, registry);
  // A fully selected, compatible setup still exists when its sparse inventory has no recorded matches.
  return setup ? [{ filters: { ...request.filters }, approvedCount: 0, pendingCount: 0 }] : data.setupCounts;
}
