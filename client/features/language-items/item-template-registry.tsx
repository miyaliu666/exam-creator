import type { ComponentType, ReactNode } from "react";

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
} from "./types";

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
 * Blueprint metadata and answers in the Workbench's protected TaskPackage
 * partitions; it is not a second Workbench-only template identity.
 */
export const ITEM_TEMPLATE_REGISTRY: readonly ItemTemplateDefinition[] = [
  {
    itemFormatId: "IF-SINGLE-SELECT",
    rendererId: "REN-SINGLE-SELECT",
    label: "Single-select template",
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
    label: "Matching template",
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
    label: "Restricted-input template",
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
    label: "Form-entry template",
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
    label: "Typed-message template",
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
    label: "Spoken-response template",
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
    label: "Spoken-interaction template",
    exerciseType: () => "spoken-multiturn",
    adapterVersion: "0.2",
    authoringSections: ["Situation", "Roles", "Turns", "Communicative functions"],
    Editor: SpokenMultiturnEditor,
    renderPreview: (payload) => (
      <SpokenMultiturnPreview payload={payload as SpokenMultiturnCandidatePayload} />
    ),
  },
];

export function itemTemplateForFormat(itemFormatId: string) {
  return ITEM_TEMPLATE_REGISTRY.find((entry) => entry.itemFormatId === itemFormatId);
}

export function itemTemplateForRenderer(rendererId: string) {
  return ITEM_TEMPLATE_REGISTRY.find((entry) => entry.rendererId === rendererId);
}
