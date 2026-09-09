import { coverageSuggestionSetup } from "./batch-coverage-suggestion.ts";
import type { CoverageBatchSuggestion, CoverageFilters, CoverageRequest, CoverageResponse } from "./coverage-types";
import type { RegistrySnapshot } from "./types";

function sameIds(left: string[] | undefined, right: string[] | undefined) {
  if (left === undefined || right === undefined) return left === right;
  return JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort());
}

function filterSignature(filters: CoverageFilters) {
  return JSON.stringify(Object.entries(filters).filter(([, value]) => !!value).sort(([left], [right]) => left.localeCompare(right)));
}

export function updateCoverageRequest(previous: CoverageRequest, patch: Partial<CoverageRequest>): CoverageRequest {
  const next = { ...previous, ...patch };
  const queryChanged = (["scope", "registryVersion", "role", "matchMode"] as const).some((key) => previous[key] !== next[key]) ||
    !sameIds(previous.selectedIds, next.selectedIds) || !sameIds(previous.excludedIds, next.excludedIds) ||
    !sameIds(previous.pattern, next.pattern) || filterSignature(previous.filters) !== filterSignature(next.filters);

  if (queryChanged) {
    // Inventory goals and intersections belong to the query that established them.
    next.desiredCount = undefined;
    if (!Object.hasOwn(patch, "pattern")) next.pattern = undefined;
  }
  if (queryChanged || Object.hasOwn(patch, "desiredCount") || Object.hasOwn(patch, "limit")) next.offset = 0;
  return next;
}

export function coverageGoalPlan(request: CoverageRequest, goal: CoverageResponse["goal"], registry: RegistrySnapshot): {
  suggestion?: CoverageBatchSuggestion; reason?: string;
} {
  if (!goal || goal.unfilledCount <= 0) return {};
  if (request.scope !== "approved") return { reason: "Choose approved items to plan new items." };
  if (request.role !== "core") return { reason: "Choose declared core targets to plan new items." };
  if (request.registryVersion !== registry.bundleVersion) return { reason: "Choose the current Assessment Settings version to plan new items." };
  if (request.matchMode !== "all" && request.matchMode !== "exact") return { reason: "Planning requires all selected points in each item." };
  if (!request.selectedIds.length) return { reason: "Select language points to plan new items." };
  if (request.selectedIds.length > 100) return { reason: "Select no more than 100 language points to plan new items." };
  if (request.excludedIds.length) return { reason: "Clear excluded language points to plan new items." };
  if (request.pattern !== undefined) return { reason: "Clear the intersection filter to plan new items." };
  if (goal.approvedUnknownCount !== 0) return { reason: "Planning is unavailable while approved items have unknown coverage." };
  const suggestion: CoverageBatchSuggestion = {
    registryVersion: request.registryVersion,
    targetContentIds: [...request.selectedIds],
    desiredCount: goal.unfilledCount,
    filters: { ...request.filters },
  };
  if (!coverageSuggestionSetup(suggestion, registry)) return { reason: "Adjust the filters or language points to allow a compatible item setup." };
  return { suggestion };
}
