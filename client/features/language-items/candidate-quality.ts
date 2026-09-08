import type { AiCandidate } from "./types";

const RESPONSE_UNIT_IDS = new Set(["optionId", "itemId", "responseId", "fieldId", "contentPointId", "turnId"]);

function normalizedContent(value: unknown): unknown {
  if (typeof value === "string") return value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (Array.isArray(value)) return value.map(normalizedContent);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      // Response-unit identifiers may differ without changing what the candidate sees.
      .filter(([key]) => !RESPONSE_UNIT_IDS.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalizedContent(entry)]));
  }
  return value;
}

export function rankAiCandidates(candidates: readonly AiCandidate[]) {
  const ranked = candidates.map((candidate, index) => ({
    candidate,
    index,
    valid: candidate.validation.valid,
    warningCount: candidate.validation.issues.filter((issue) => issue.severity === "warning").length,
    duplicateOfOrdinal: undefined as number | undefined,
    fingerprint: JSON.stringify(normalizedContent(candidate.candidatePayload)),
  }));
  ranked.sort((left, right) => Number(right.valid) - Number(left.valid) ||
    left.warningCount - right.warningCount || left.candidate.ordinal - right.candidate.ordinal || left.index - right.index);
  const firstByContent = new Map<string, number>();
  for (const entry of ranked) {
    const first = firstByContent.get(entry.fingerprint);
    if (first !== undefined) entry.duplicateOfOrdinal = first;
    else firstByContent.set(entry.fingerprint, entry.candidate.ordinal);
  }
  return ranked.sort((left, right) => Number(right.valid) - Number(left.valid) ||
    Number(left.duplicateOfOrdinal !== undefined) - Number(right.duplicateOfOrdinal !== undefined) ||
    left.warningCount - right.warningCount || left.candidate.ordinal - right.candidate.ordinal || left.index - right.index);
}
