import type { CandidatePayload, LanguageItemStatus, ValidationResult } from "./types";

export type EditorSection = "setup" | "content" | "review";

export const AUTHORING_STEPS = [
  { id: "setup", label: "1. Prepare" },
  { id: "content", label: "2. Edit & preview" },
  { id: "review", label: "3. Check & submit" },
] as const;

export function hasAuthoredContent(payload: CandidatePayload): boolean {
  if ("stimulus" in payload) {
    return !!(payload.prompt.trim() || payload.stimulus.text?.trim() || payload.stimulus.audioRef || payload.stimulus.imageRefs.length);
  }
  if (payload.situation.trim() || payload.instructions.trim()) return true;
  if ("paths" in payload) return payload.paths.some((path) => path.turns.some((turn) => turn.promptAudioRef?.trim()));
  if ("visiblePromptText" in payload) return !!(payload.visiblePromptText?.trim() || payload.promptAudioRef);
  if ("sourceMessage" in payload) return !!(payload.sourceMessage?.trim() || payload.requiredContentPoints.some((point) => point.description.trim()));
  return false;
}

export function initialEditorSection(status: LanguageItemStatus, payload: CandidatePayload, writeManually = false): EditorSection {
  if (status !== "draft") return "review";
  return writeManually || hasAuthoredContent(payload) ? "content" : "setup";
}

export function canSubmitDraft(validation: ValidationResult | null, setupIssueCount: number, busy: boolean): boolean {
  return validation?.valid === true && setupIssueCount === 0 && !busy;
}
