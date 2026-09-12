import type { PilotDecision, PilotSummary, PilotTimingBasis } from "./version-usage-types";

export interface PilotResultFormState {
  source: string;
  sampleRef: string;
  cohort: string;
  sampleSize: string;
  correctCount: string;
  omittedCount: string;
  discrimination: string;
  medianResponseTimeSeconds: string;
  timingBasis: PilotTimingBasis;
  decision: PilotDecision;
  notes: string;
}

export const EMPTY_PILOT_FORM: PilotResultFormState = {
  source: "", sampleRef: "", cohort: "", sampleSize: "", correctCount: "", omittedCount: "",
  discrimination: "", medianResponseTimeSeconds: "", timingBasis: "unknown", decision: "retain", notes: "",
};

function optionalNumber(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

export function parsePilotResult(form: PilotResultFormState): { summary: PilotSummary | null; errors: string[] } {
  const errors: string[] = [];
  for (const [key, label] of [["source", "Data source"], ["sampleRef", "Pilot reference"], ["cohort", "Candidate group"], ["notes", "Findings and decision rationale"]] as const) {
    if (!form[key].trim()) errors.push(`${label} is required.`);
  }
  const sampleSize = Number(form.sampleSize);
  if (!Number.isSafeInteger(sampleSize) || sampleSize < 1 || sampleSize > 10_000_000) errors.push("Sample size must be a whole number from 1 to 10,000,000.");
  const correctCount = optionalNumber(form.correctCount);
  const omittedCount = optionalNumber(form.omittedCount);
  for (const [count, label] of [[correctCount, "Correct count"], [omittedCount, "Omitted count"]] as const) {
    if (count !== null && (!Number.isSafeInteger(count) || count < 0 || count > sampleSize)) errors.push(`${label} must be a whole number between zero and the sample size.`);
  }
  if (correctCount !== null && omittedCount !== null && correctCount + omittedCount > sampleSize) errors.push("Correct and omitted counts together cannot exceed the sample size.");
  const discrimination = optionalNumber(form.discrimination);
  if (discrimination !== null && (!Number.isFinite(discrimination) || discrimination < -1 || discrimination > 1)) errors.push("Discrimination must be a correlation between −1 and 1.");
  const medianResponseTimeSeconds = optionalNumber(form.medianResponseTimeSeconds);
  if (medianResponseTimeSeconds !== null && (!Number.isFinite(medianResponseTimeSeconds) || medianResponseTimeSeconds < 0)) errors.push("Median response time must be zero or more seconds.");
  if (medianResponseTimeSeconds !== null && form.timingBasis === "unknown") errors.push("Select how the recorded response time was measured.");
  if (errors.length) return { summary: null, errors };
  return { errors, summary: {
    source: form.source.trim(), sampleRef: form.sampleRef.trim(), cohort: form.cohort.trim(), sampleSize,
    correctCount, omittedCount, discrimination, medianResponseTimeSeconds,
    timingBasis: medianResponseTimeSeconds === null ? "unknown" : form.timingBasis,
    decision: form.decision, notes: form.notes.trim(),
  } };
}

export function observedPercent(count: number | null, sampleSize: number): string {
  return count === null ? "Not recorded" : `${(count / sampleSize * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}% (${count.toLocaleString()} / ${sampleSize.toLocaleString()})`;
}
