import type { ReviewCheckResult } from "./review-rule-types.ts";
import type { AiReviewRun } from "./types.ts";

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every((entry) => typeof entry === "string"); }

export function isReviewCheckResult(value: unknown): value is ReviewCheckResult {
  return record(value) && typeof value.checkId === "string" && !!value.checkId.trim()
    && typeof value.status === "string" && ["pass", "fail", "insufficientEvidence"].includes(value.status)
    && typeof value.message === "string" && !!value.message.trim() && strings(value.sourceRefs)
    && Array.isArray(value.evidence) && value.evidence.every((entry) => record(entry)
      && typeof entry.fieldPath === "string" && entry.fieldPath.startsWith("/")
      && typeof entry.quote === "string" && !!entry.quote.trim());
}

export function reviewChecklistProblem(run: AiReviewRun): string | null {
  if (run.reviewPlan === undefined && run.checkResults === undefined) return null;
  const plan = run.reviewPlan;
  const results = run.checkResults;
  if (!record(plan) || plan.planVersion !== "1" || typeof plan.planHash !== "string" || !plan.planHash.trim()
    || !Array.isArray(plan.checks) || !plan.checks.length || !Array.isArray(results) || !results.every(isReviewCheckResult)) {
    return "The review checklist is incomplete or invalid. Submit again to retry.";
  }
  const ids = new Set<string>();
  for (const check of plan.checks) {
    if (!record(check) || typeof check.id !== "string" || !check.id.trim() || ids.has(check.id)
      || typeof check.required !== "boolean" || !["fixed", "custom"].includes(String(check.origin))) return "The review checklist contains invalid requirements. Submit again to retry.";
    ids.add(check.id);
  }
  if (results.length !== ids.size || new Set(results.map((result) => result.checkId)).size !== results.length || results.some((result) => !ids.has(result.checkId))) {
    return "The review checklist is missing results or contains unmatched results. Submit again to retry.";
  }
  const blocked = plan.checks.filter((check) => check.origin === "fixed" || check.required).map((check) => results.find((result) => result.checkId === check.id)!);
  if (blocked.some((result) => result.status === "fail")) return "Required review criteria were not met. Edit the item and submit again.";
  if (blocked.some((result) => result.status === "insufficientEvidence")) return "Required review criteria lack sufficient evidence. Edit the item and submit again.";
  return null;
}
