import type { ComponentType, ReactNode } from "react";
import { EXERCISE_TEMPLATES, createExerciseTemplateDraft, validateExerciseTemplateData } from "./exercise-template-catalog";
import { ExerciseTemplateEditor } from "./exercise-template-editor";
import { projectExerciseTemplateCandidate } from "./exercise-template-projection";
import { ExerciseTemplateCandidatePreview } from "./exercise-template-candidate-preview";
import { ITEM_FORMAT_LABELS } from "./labels";

import {
  FormEntryPreview,
  MatchingPreview,
  RestrictedInputPreview,
  SpokenMultiturnPreview,
  SpokenSinglePreview,
  TypedMessagePreview,
} from "./candidate-previews";
import {
  FormEntryEditor,
  SpokenMultiturnEditor,
  SpokenSingleEditor,
  TypedMessageEditor,
} from "./productive-editor";
import {
  MatchingEditor,
  RestrictedInputEditor,
  SingleSelectEditor,
} from "./receptive-editor";
import { SingleSelectPreview } from "./single-select-preview";
import type {
  CandidatePayload,
  FormEntryCandidatePayload,
  MatchingCandidatePayload,
  RestrictedInputCandidatePayload,
  SingleSelectCandidatePayload,
  SpokenMultiturnCandidatePayload,
  SpokenSingleCandidatePayload,
  TaskPackage,
  TypedMessageCandidatePayload,
  ValidationIssue,
  ExerciseTemplateCandidatePayload,
} from "./types";

function SourceExerciseEditor({ draft, updateDraft }: ItemTemplateEditorProps) {
  const exerciseType = draft.itemFormatId.slice("EXERCISE:".length);
  const document = draft.authoringPackage.exerciseTemplate ?? { exerciseType, body: "", data: createExerciseTemplateDraft(exerciseType, {}, draft.content.language ?? "zh") };
  const updateDocument = (data: Record<string, unknown>, body = document.body) => updateDraft((next) => {
    const authored = { exerciseType, body, data };
    next.authoringPackage.exerciseTemplate = authored;
    next.candidatePayload = projectExerciseTemplateCandidate(authored);
  });
  return <ExerciseTemplateEditor exerciseType={exerciseType} value={document.data} body={document.body} itemLanguage={draft.content.language ?? "zh"}
    onChange={(data) => updateDocument(data)} onBodyChange={(body) => updateDocument(document.data, body)}
    issues={validateExerciseTemplateData(exerciseType, document.data)} />;
}

export interface ItemTemplateEditorProps {
  draft: TaskPackage;
  updateDraft: (mutate: (next: TaskPackage) => void) => void;
  validationIssues?: ValidationIssue[];
}

export interface ItemTemplateDefinition {
  itemFormatId: string;
  rendererId: string;
  label: string;
  exerciseType: (draft: TaskPackage) => string;
  adapterVersion: string;
  authoringSections: string[];
  Editor: ComponentType<ItemTemplateEditorProps>;
  renderPreview: (payload: CandidatePayload) => ReactNode;
}

/**
 * TaskPackage adapters for the shared exercise-template catalog.
 *
 * The exercise type owns question structure and presentation. The adapter keeps
 * Assessment metadata and answers in the Workbench's protected TaskPackage
 * partitions; it is not a second Workbench-only template identity.
 */
export const ITEM_TEMPLATE_REGISTRY: readonly ItemTemplateDefinition[] = [
  {
    itemFormatId: "IF-SINGLE-SELECT",
    rendererId: "REN-SINGLE-SELECT",
    label: "Multiple choice",
    exerciseType: (draft) =>
      draft.content.primaryReportedSkill === "Listening" ? "listening" : "multiple-choice",
    adapterVersion: "0.2",
    authoringSections: ["Stimulus", "Question", "Options", "Correct answer"],
    Editor: SingleSelectEditor,
    renderPreview: (payload) => (
      <SingleSelectPreview payload={payload as SingleSelectCandidatePayload} />
    ),
  },
  {
    itemFormatId: "IF-MATCHING",
    rendererId: "REN-MATCHING",
    label: "Match the columns",
    exerciseType: () => "match-columns",
    adapterVersion: "0.2",
    authoringSections: ["Instructions", "Left column", "Right column", "Matches"],
    Editor: MatchingEditor,
    renderPreview: (payload) => (
      <MatchingPreview payload={payload as MatchingCandidatePayload} />
    ),
  },
  {
    itemFormatId: "IF-RESTRICTED-INPUT",
    rendererId: "REN-RESTRICTED-INPUT",
    label: "Short-answer Questions",
    exerciseType: (draft) =>
      draft.content.primaryReportedSkill === "Listening"
        ? "listening-short-answer-questions"
        : "short-answer-questions",
    adapterVersion: "0.2",
    authoringSections: ["Stimulus", "Instructions", "Response fields", "Accepted answers"],
    Editor: RestrictedInputEditor,
    renderPreview: (payload) => (
      <RestrictedInputPreview payload={payload as RestrictedInputCandidatePayload} />
    ),
  },
  {
    itemFormatId: "IF-FORM-ENTRY",
    rendererId: "REN-FORM-ENTRY",
    label: ITEM_FORMAT_LABELS["IF-FORM-ENTRY"],
    exerciseType: () => "form-entry",
    adapterVersion: "0.2",
    authoringSections: ["Situation", "Instructions", "Form fields", "Accepted values"],
    Editor: FormEntryEditor,
    renderPreview: (payload) => (
      <FormEntryPreview payload={payload as FormEntryCandidatePayload} />
    ),
  },
  {
    itemFormatId: "IF-TYPED-MESSAGE",
    rendererId: "REN-TYPED-MESSAGE",
    label: "Guided Writing",
    exerciseType: () => "guided-writing",
    adapterVersion: "0.2",
    authoringSections: ["Situation", "Recipient", "Purpose", "Required content", "Length"],
    Editor: TypedMessageEditor,
    renderPreview: (payload) => (
      <TypedMessagePreview payload={payload as TypedMessageCandidatePayload} />
    ),
  },
  {
    itemFormatId: "IF-SPOKEN-SINGLE",
    rendererId: "REN-SPOKEN-SINGLE",
    label: "Speaking",
    exerciseType: () => "speaking",
    adapterVersion: "0.2",
    authoringSections: ["Situation", "Prompt", "Preparation/response time", "Required content"],
    Editor: SpokenSingleEditor,
    renderPreview: (payload) => (
      <SpokenSinglePreview payload={payload as SpokenSingleCandidatePayload} />
    ),
  },
  {
    itemFormatId: "IF-SPOKEN-MULTITURN",
    rendererId: "REN-SPOKEN-MULTITURN",
    label: ITEM_FORMAT_LABELS["IF-SPOKEN-MULTITURN"],
    exerciseType: () => "spoken-multiturn",
    adapterVersion: "0.2",
    authoringSections: ["Situation", "Roles", "Turns", "Communicative functions"],
    Editor: SpokenMultiturnEditor,
    renderPreview: (payload) => (
      <SpokenMultiturnPreview payload={payload as SpokenMultiturnCandidatePayload} />
    ),
  },
  ...EXERCISE_TEMPLATES.map((template): ItemTemplateDefinition => ({
    itemFormatId: `EXERCISE:${template.id}`,
    rendererId: "REN-EXERCISE-TEMPLATE",
    label: template.name,
    exerciseType: () => template.id,
    adapterVersion: "1.0",
    authoringSections: template.fields.map((field) => field.label),
    Editor: SourceExerciseEditor,
    renderPreview: (payload) => <ExerciseTemplateCandidatePreview payload={payload as ExerciseTemplateCandidatePayload} />,
  })),
];

export function itemTemplateForFormat(itemFormatId: string) {
  return ITEM_TEMPLATE_REGISTRY.find((entry) => entry.itemFormatId === itemFormatId);
}

export function itemTemplateForRenderer(rendererId: string) {
  return ITEM_TEMPLATE_REGISTRY.find((entry) => entry.rendererId === rendererId);
}
