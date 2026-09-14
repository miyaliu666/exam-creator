import type { CandidatePayload, LanguageItemStatus, ValidationResult } from "./types";
import { createExerciseTemplateDraft, exerciseTemplateById } from "./exercise-template-catalog";
import { projectExerciseTemplateCandidate } from "./exercise-template-projection";

export type EditorSection = "setup" | "content" | "review";

export const AUTHORING_STEPS = [
  { id: "setup", label: "1. Prepare" },
  { id: "content", label: "2. Edit & preview" },
  { id: "review", label: "3. Submit" },
] as const;

export function hasAuthoredContent(payload: CandidatePayload): boolean {
  if ("exerciseType" in payload) {
    const defaults = exerciseTemplateById(payload.exerciseType)
      ? projectExerciseTemplateCandidate({ exerciseType: payload.exerciseType, body: "", data: createExerciseTemplateDraft(payload.exerciseType) }).data : {};
    const hasText = (value: unknown): boolean => typeof value === "string" ? !!value.trim()
      : Array.isArray(value) ? value.some(hasText)
      : !!value && typeof value === "object" && Object.values(value).some(hasText);
    return !!payload.body.trim() || Object.entries(payload.data).some(([key, value]) =>
      !["type", "level", "language", "instructionLanguage", "title", "tags", "matching", "layout", "countBy"].includes(key) &&
      JSON.stringify(value) !== JSON.stringify(defaults[key]) && hasText(value));
  }
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
