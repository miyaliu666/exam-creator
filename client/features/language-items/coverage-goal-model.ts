import { BATCH_ITEM_LIMIT } from "./batch-plan";
import { coverageGoalPlan } from "./coverage-query";
import type { CoverageBatchSuggestion, CoverageRequest, CoverageResponse } from "./coverage-types";
import type { RegistrySnapshot } from "./types";

export function parseCoverageGoalCount(text: string): number | undefined {
  if (text.trim() === "") return undefined;
  const count = Number(text);
  return Number.isSafeInteger(count) && count >= 0 && count <= 1_000_000 ? count : undefined;
}

export function coverageNewItemPlan(request: CoverageRequest, goal: CoverageResponse["goal"], registry: RegistrySnapshot, count?: number): {
  suggestion?: CoverageBatchSuggestion; reason?: string;
} {
  const plan = coverageGoalPlan({ ...request, scope: "approved" }, goal, registry);
  if (!plan.suggestion) return plan;
  if (count === undefined) return {};
  if (!Number.isSafeInteger(count) || count < 1 || count > BATCH_ITEM_LIMIT) {
    return { reason: `Enter a whole number from 1 to ${BATCH_ITEM_LIMIT}.` };
  }
  if (!goal || count > goal.unfilledCount) {
    return { reason: `Enter no more than ${goal?.unfilledCount ?? 0} new items.` };
  }
  // Unapproved items can be revisions of approved items, so their count cannot determine new-item demand.
  return { suggestion: { ...plan.suggestion, desiredCount: count } };
}
