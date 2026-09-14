import type { AiReviewRun, BlindAnswerAttempt } from "./types";

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function nonemptyStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string" && !!entry.trim());
}

export function isBlindAnswerAttempt(value: unknown): value is BlindAnswerAttempt {
  return record(value) && value.protocolVersion === "1" && value.promptVersion === "0.1"
    && typeof value.inputHash === "string" && !!value.inputHash.trim()
    && typeof value.simulated === "boolean"
    && typeof value.status === "string" && ["answered", "ambiguous", "insufficientInformation"].includes(value.status)
    && (!value.simulated || value.status === "insufficientInformation")
    && typeof value.answer === "string" && (value.status === "insufficientInformation" || !!value.answer.trim())
    && nonemptyStrings(value.alternatives) && nonemptyStrings(value.limitations)
    && (value.status !== "answered" || value.alternatives.length === 0)
    && (value.status !== "ambiguous" || value.alternatives.length > 0)
    && new Set([value.answer.trim(), ...value.alternatives.map((answer) => answer.trim())]).size === value.alternatives.length + 1
    && (value.status !== "insufficientInformation" || (value.answer === "" && value.alternatives.length === 0 && value.limitations.length > 0))
    && typeof value.reasoning === "string" && !!value.reasoning.trim()
    && Array.isArray(value.evidence) && (value.status === "insufficientInformation" || value.evidence.length > 0)
    && value.evidence.every((entry) => record(entry)
      && typeof entry.fieldPath === "string" && entry.fieldPath.startsWith("/candidatePayload/")
      && typeof entry.quote === "string" && !!entry.quote.trim());
}

export function blindAnswerProblem(run: AiReviewRun): string | null {
  const required = run.promptId === "a1-item-independent-review" && run.promptVersion === "0.6";
  if (run.blindAnswer === undefined && !required) return null;
  if (!isBlindAnswerAttempt(run.blindAnswer)) {
    return "The independent answer is missing or invalid. Submit again to retry.";
  }
  if (run.blindAnswer.simulated) {
    return "The independent answer was simulated. Submit again using a real AI provider.";
  }
  return null;
}
