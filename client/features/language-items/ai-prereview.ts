import type { AiFinding, AiReviewRun } from "./types";
import { reviewChecklistProblem } from "./review-check-validation";
import { blindAnswerProblem } from "./blind-answer";

export type AiPrereviewStage = "checking" | "aiReview" | "creatingPr" | null;

export function isAiPrereviewFinding(value: unknown): value is AiFinding {
  if (!value || typeof value !== "object") return false;
  const finding = value as Record<string, unknown>;
  return typeof finding.severity === "string" && ["info", "warning", "error"].includes(finding.severity)
    && ["category", "code", "fieldPath", "ruleRef"].every((key) => typeof finding[key] === "string")
    && typeof finding.message === "string" && finding.message.trim().length > 0;
}

export function aiPrereviewBlockReason(run: AiReviewRun | null | undefined): string | null {
  if (!run || typeof run !== "object") return "AI preliminary review is unavailable. Submit again to retry.";
  if (run.status !== "completed" || run.error !== null) {
    const detail = typeof run.error === "string" ? run.error.trim() : "";
    return `AI preliminary review failed${detail ? `: ${detail}` : "."} Submit again to retry.`;
  }
  if (run.provider !== "deepseek" && run.provider !== "openai") {
    return "AI preliminary review requires OpenAI or DeepSeek. Configure a real AI provider and submit again.";
  }
  if (typeof run.contentHash !== "string" || !run.contentHash.trim()) {
    return "AI preliminary review is missing its content reference. Submit again to review the current item.";
  }
  if (!Array.isArray(run.findings) || !run.findings.every(isAiPrereviewFinding)) {
    return "AI preliminary review returned an invalid result. Submit again to retry.";
  }
  if (run.findings.some((finding) => finding.severity === "error")) {
    return "AI preliminary review found serious issues. Edit the item and submit again.";
  }
  return blindAnswerProblem(run) ?? reviewChecklistProblem(run);
}
