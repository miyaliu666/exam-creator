import { capabilityForDraft, difficultyStandardsForCapability } from "./registry-capability";
import type { DifficultyBandStandard, DifficultyProfile, RegistrySnapshot, TaskPackage } from "./types";

export interface ItemSetupSelection {
  domain: string;
  contextId: string;
  difficultyBand: string;
}

export function itemSetupSelection(draft: TaskPackage): ItemSetupSelection {
  return { domain: draft.content.primaryDomain, contextId: draft.content.contextId, difficultyBand: draft.content.difficultyBand };
}

export function difficultyScheme(draft: TaskPackage, standard: DifficultyBandStandard): DifficultyProfile {
  const output: Record<string, string> = {
    "IF-SINGLE-SELECT": "selectedOption", "IF-MATCHING": "matchedOptions",
    "IF-RESTRICTED-INPUT": "shortFields", "IF-FORM-ENTRY": "formFields",
    "IF-TYPED-MESSAGE": "shortMessage", "IF-SPOKEN-SINGLE": "shortSpeech", "IF-SPOKEN-MULTITURN": "spokenTurns",
  };
  return {
    intendedBand: standard.id,
    status: "AuthorEstimated",
    drivers: {
      ...standard.defaultDrivers,
      distractorSimilarity: draft.itemFormatId.startsWith("EXERCISE:") || ["IF-SINGLE-SELECT", "IF-MATCHING"].includes(draft.itemFormatId)
        ? standard.defaultDrivers.distractorSimilarity : "notApplicable",
      outputLength: draft.itemFormatId.startsWith("EXERCISE:") ? "exerciseTemplateResponse" : output[draft.itemFormatId] ?? "selectedOption",
      interactionTurns: draft.itemFormatId === "IF-SPOKEN-MULTITURN" ? 2 : draft.itemFormatId === "IF-SPOKEN-SINGLE" ? 1 : 0,
      preparationTimeSeconds: draft.itemFormatId === "IF-SPOKEN-SINGLE" ? 20 : null,
    },
    rationale: [standard.description],
    empiricalDifficulty: {
      status: "NotPiloted", sampleId: null, observedBand: null, percentCorrect: null,
      discrimination: null, omissionRate: null, medianResponseTimeSeconds: null, decision: null,
    },
  };
}

export function selectedDifficulty(draft: TaskPackage, registry: RegistrySnapshot | undefined) {
  const standard = difficultyStandardsForCapability(registry, capabilityForDraft(registry, draft))
    .find((entry) => entry.id === draft.content.difficultyBand);
  return draft.content.difficulty ?? (standard ? difficultyScheme(draft, standard) : undefined);
}

export function applyItemSetup(draft: TaskPackage, selection: ItemSetupSelection, registry: RegistrySnapshot) {
  if (selection.difficultyBand !== draft.content.difficultyBand) {
    const standard = difficultyStandardsForCapability(registry, capabilityForDraft(registry, draft))
      .find((entry) => entry.id === selection.difficultyBand);
    if (!standard) throw new Error("Select a difficulty available for these item rules.");
    draft.content.difficulty = difficultyScheme(draft, standard);
  }
  draft.content.primaryDomain = selection.domain;
  draft.content.contextId = selection.contextId;
  draft.content.difficultyBand = selection.difficultyBand;
  // Keep authored evidence intact; incompatibilities are resolved explicitly in Prepare.
}
